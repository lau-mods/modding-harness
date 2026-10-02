import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { appendFile, copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { exists, readJson, safePath, save } from '../io.js';
import { run, success } from '../process.js';
import type { Runner } from '../process.js';
import type { Config } from '../project/config.js';

export function pilotEnv(root: string): NodeJS.ProcessEnv {
  return { MCT_HOME: path.join(root, '.harness-state/runtime/mct-home'), MCT_CACHE_DIR: path.join(root, '.harness-state/runtime/mct-cache'), MCT_SKILL_TARGETS: 'none' };
}
export class McPilot {
  private server: ChildProcessWithoutNullStreams | null = null;
  private serverDone: Promise<void> | null = null;
  private ownedClients = new Set<string>();
  private readonly worldName = 'harness-superflat';
  private generation = '';
  private sequence = 0;
  private logOffsets = new Map<string, number>();
  private logWrites: Promise<void> = Promise.resolve();
  private serverError: Error | null = null;
  constructor(private root: string, private config: Config['runtime'], private evidence: string, private runner: Runner = run) {}

  async command(args: string[]): Promise<unknown> {
    let output: unknown;
    const file = path.join(this.evidence, `mct-${++this.sequence}.json`);
    try {
      const result = await this.runner(this.config.command, args, { cwd: this.root, env: pilotEnv(this.root), timeoutMs: 180_000 });
      output = result;
      success(result, `MC Pilot ${args.join(' ')}`);
      const envelope = JSON.parse(result.stdout) as { success?: boolean; data?: unknown };
      if (envelope.success !== true) throw new Error('MC Pilot reported failure');
      let data = envelope.data;
      if (data && typeof data === 'object' && 'success' in data) {
        if (data.success !== true) throw new Error('MC Pilot action reported failure');
        if (!('data' in data)) throw new Error('MC Pilot action has no data');
        data = data.data;
      }
      return data;
    } finally { await save(file, { args, output: output ?? null }); }
  }

  private async configureClient(name: string): Promise<void> {
    const options = this.config.clientOptions;
    if (!options) return;
    const base = `.harness-state/runtime/mct-home/clients/${name}`;
    if (options.javaCommand !== undefined || options.maxMemory !== undefined) {
      const file = await safePath(this.root, `${base}/instance.json`);
      const meta = await readJson(file) as { launchArgs?: string[]; javaCommand?: string };
      if (!meta || !Array.isArray(meta.launchArgs) || !meta.launchArgs.every(arg => typeof arg === 'string')) throw new Error(`Client ${name} has invalid launchArgs`);
      const args: string[] = [];
      for (let i = 0; i < meta.launchArgs.length; i++) {
        const arg = meta.launchArgs[i]!;
        const replaced = (options.maxMemory !== undefined && (arg === '--max-mem' || arg.startsWith('--max-mem='))) ||
          (options.javaCommand !== undefined && (arg === '--java' || arg.startsWith('--java=')));
        if (replaced) { if (!arg.includes('=')) i++; }
        else args.push(arg);
      }
      if (options.maxMemory !== undefined) args.push('--max-mem', options.maxMemory);
      if (options.javaCommand !== undefined) meta.javaCommand = options.javaCommand;
      meta.launchArgs = args;
      await save(file, meta);
    }
    if (options.earlyWindowControl !== undefined) {
      const file = await safePath(this.root, `${base}/minecraft/config/fml.toml`);
      const text = await exists(file) ? await readFile(file, 'utf8') : '';
      // This FML setting is a root TOML key; do not append it inside an existing table.
      const table = text.search(/^\s*\[/m), end = table < 0 ? text.length : table;
      const root = text.slice(0, end), key = /^[ \t]*earlyWindowControl[ \t]*=.*$/gm;
      const setting = `earlyWindowControl=${options.earlyWindowControl}`;
      await save(file, (key.test(root) ? root.replace(key, setting) : `${setting}\n${root}`) + text.slice(end));
    }
  }

  async start(): Promise<string> {
    const server = this.config.server;
    if (!server || !this.config.clients.length) throw new Error('Runtime not configured: prepare a dedicated NeoForge server and MC Pilot clients; see docs/runtime.md');
    if (this.server) throw new Error('Runtime already started');
    for (const file of this.config.logs) {
      const full = await safePath(this.root, file);
      if (!this.logOffsets.has(full)) this.logOffsets.set(full, await exists(full) ? (await stat(full)).size : 0);
    }
    if (!/^127\.0\.0\.1:\d{1,5}$/.test(server.address)) throw new Error('Runtime requires an explicit loopback server address');
    if (!server.directory.startsWith('.harness-state/runtime/')) throw new Error('Server must be inside .harness-state/runtime/');
    const directory = await safePath(this.root, server.directory);
    if (!/^eula=true\s*$/m.test(await readFile(path.join(directory, 'eula.txt'), 'utf8'))) throw new Error('Minecraft server EULA must already be accepted by the user');
    const properties = await readFile(path.join(directory, 'server.properties'), 'utf8');
    const port = server.address.split(':')[1]!;
    if (!properties.split(/\r?\n/).includes(`server-port=${port}`) || !properties.split(/\r?\n/).includes('server-ip=127.0.0.1')) throw new Error('Prepared server address does not match server.properties');
    const listed = await this.command(['client', 'list']) as { clients?: { name: string; running: boolean; loader: string }[] };
    for (const name of this.config.clients) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid client name: ${name}`);
      const client = listed.clients?.find(client => client.name === name);
      if (!client || client.running || client.loader !== 'neoforge') throw new Error(`Client ${name} must be a stopped, prepared NeoForge instance`);
    }
    for (const name of this.config.clients) await this.configureClient(name);
    for (const entry of this.config.deploy) {
      if (!entry.target.startsWith('.harness-state/runtime/')) throw new Error(`Deployment must target dedicated runtime: ${entry.target}`);
      const source = await safePath(this.root, entry.source), target = await safePath(this.root, entry.target);
      await mkdir(path.dirname(target), { recursive: true }); await copyFile(source, target);
    }
    if (!this.config.deploy.length) throw new Error('Runtime needs explicit current-build deployment mappings');
    await mkdir(this.evidence, { recursive: true });
    await save(path.join(directory, 'server.properties'), properties
      .replace(/^[ \t]*(?:level-name|level-type|generator-settings)(?:[ \t]*[=:]|[ \t]+).*$/gm, '')
      .trimEnd() + `\nlevel-name=${this.worldName}\nlevel-type=minecraft:flat\ngenerator-settings={"biome":"minecraft:plains","layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":2},{"block":"minecraft:grass_block","height":1}]}\n`);
    const child = spawn(server.command[0]!, server.command.slice(1), { cwd: directory, env: process.env, stdio: 'pipe', shell: false });
    this.server = child;
    let text = '';
    this.serverError = null;
    this.serverDone = new Promise(resolve => {
      child.on('error', cause => { this.serverError = cause; resolve(); });
      child.on('close', code => { if (code !== 0) this.serverError = new Error(`NeoForge server exited ${code}`); resolve(); });
    });
    child.stdin.on('error', error => { this.serverError = error; });
    const collect = (chunk: Buffer): void => {
      text = (text + chunk.toString()).slice(-100_000);
      this.logWrites = this.logWrites.then(() => appendFile(path.join(this.evidence, 'runtime.log'), chunk)).catch((error: Error) => { this.serverError = error; });
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const deadline = Date.now() + 180_000;
    while (!/Done \([\d.,]+s\)!/.test(text)) {
      if (this.serverError || child.exitCode !== null || Date.now() > deadline) throw this.serverError ?? new Error('NeoForge server did not become ready in 180 seconds');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await this.logWrites;
    for (const name of this.config.clients) {
      this.ownedClients.add(name);
      // A stopped Java WebSocket listener can remain in TIME_WAIT. Request a new OS-selected port.
      const wsPort = await new Promise<number>((resolve, reject) => {
        const socket = createServer();
        socket.once('error', reject);
        socket.listen(0, '127.0.0.1', () => {
          const address = socket.address();
          if (!address || typeof address === 'string') { socket.close(); reject(new Error('Could not allocate MC Pilot port')); return; }
          socket.close(error => error ? reject(error) : resolve(address.port));
        });
      });
      await this.command(['client', 'launch', name, '--server', server.address, '--ws-port', String(wsPort)]);
      const ready = await this.command(['client', 'wait-ready', name, '--timeout', '120']) as { connected?: boolean; inWorld?: boolean };
      if (ready.connected !== true || ready.inWorld !== true) throw new Error(`Client ${name} did not join a world`);
    }
    this.generation = randomUUID();
    await save(path.join(this.evidence, `runtime-start-${this.generation}.json`), { generation: this.generation, pid: child.pid, clients: this.config.clients, world: this.worldName });
    return this.generation;
  }

  async stop(): Promise<void> {
    const errors: string[] = [];
    const child = this.server;
    if (child) {
      const exitedEarly = child.exitCode !== null;
      if (!exitedEarly) child.stdin.end('stop\n');
      let forced = false;
      const timer = setTimeout(() => { forced = true; child.kill('SIGKILL'); }, 30_000);
      await this.serverDone; clearTimeout(timer);
      await this.logWrites;
      if (forced || exitedEarly || child.exitCode !== 0) errors.push('NeoForge server failed graceful shutdown');
      if (this.serverError) errors.push(this.serverError.message);
      this.server = null; this.serverDone = null;
    }
    // Stop the server first so it saves and gracefully disconnects clients before MC Pilot terminates them.
    for (const name of this.ownedClients) {
      try {
        const result = await this.command(['client', 'stop', name]) as { stopped?: boolean; alreadyStopped?: boolean };
        if (!result.stopped && !result.alreadyStopped) throw new Error(`MC Pilot did not stop ${name}`);
        this.ownedClients.delete(name);
      }
      catch (error) { errors.push((error as Error).message); }
    }
    await save(path.join(this.evidence, `runtime-stop-${this.generation || 'startup'}-${++this.sequence}.json`), { passed: errors.length === 0, errors });
    if (errors.length) throw new Error(errors.join('; '));
  }

  async scanLogs(): Promise<void> {
    const files = new Map([[path.join(this.evidence, 'runtime.log'), 0], ...this.logOffsets]);
    const findings: { file: string; line: string }[] = [];
    for (const [index, [file, offset]] of [...files].entries()) {
      if (!await exists(file)) throw new Error(`Missing runtime log: ${file}`);
      const bytes = await readFile(file);
      if (bytes.length < offset) throw new Error(`Runtime log rotated during run: ${file}`);
      const text = bytes.subarray(offset).toString('utf8');
      if (offset || file !== path.join(this.evidence, 'runtime.log')) await save(path.join(this.evidence, `client-log-${index}-${path.basename(file)}`), text);
      for (const line of text.split('\n')) if (/\b(?:ERROR|FATAL)\b|\w+Exception\b|missing (?:texture|model)|unable to load|failed to load/i.test(line)) findings.push({ file, line });
    }
    await save(path.join(this.evidence, 'log-scan.json'), { passed: findings.length === 0, findings });
    if (findings.length) throw new Error(`Runtime log scan found ${findings.length} error(s)`);
  }
}
