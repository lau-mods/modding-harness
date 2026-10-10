import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { RuntimeConfig, ServerConfig } from '../config/config.js';
import { checkRuntimeConfig } from '../config/config.js';
import { ExecutionFailure, FatalError } from '../core/errors.js';
import { exists, readJson, writeAtomic } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
import type { Runner } from '../core/process.js';
import { tail } from '../core/process.js';

// Harness が起動した Minecraft runtime 1 回分 (§16.2)
export type RuntimeSession = { server: string; clients: string[]; world: string; logDir: string; startedAt: string };

// 起動中の server process の記録。Harness の再起動後も残存 process を停止できるよう runtime/ に保存する
type ServerProcess = { pid: number | null };

const SERVER_READY_TIMEOUT_MS = 10 * 60 * 1000;
const SERVER_STOP_TIMEOUT_MS = 2 * 60 * 1000;
const MCT_TIMEOUT_MS = 5 * 60 * 1000;
const CLIENT_READY_TIMEOUT_SECONDS = 180;

// MC Pilot に渡す環境変数。MC Pilot の home と cache は .harness-state/runtime に置く
export function pilotEnv(root: string): NodeJS.ProcessEnv {
  const runtime = projectPaths(root).runtime;
  return { MCT_HOME: path.join(runtime, 'mct-home'), MCT_CACHE_DIR: path.join(runtime, 'mct-cache'), MCT_SKILL_TARGETS: 'none' };
}

// MC Pilot CLI を呼び出して JSON envelope の data を返す。失敗は ExecutionFailure (§19.1)
export async function mcPilot(root: string, config: RuntimeConfig, args: string[], runner: Runner): Promise<unknown> {
  const result = await runner(config.command, args, { cwd: root, env: pilotEnv(root), timeoutMs: MCT_TIMEOUT_MS });
  let envelope: { success?: boolean; data?: unknown };
  try { envelope = JSON.parse(result.stdout) as typeof envelope; }
  catch { envelope = {}; }
  if (result.code !== 0 || envelope.success !== true) throw new ExecutionFailure(`MC Pilot ${args.join(' ')} failed`, tail(result.stderr + result.stdout, 2000));
  return envelope.data;
}

// Mod jar を server・全 client・追加の配置先へ配置し、前回配置した jar を置き換える (§16.2 Mod Deploy)
export async function deployMod(root: string, config: RuntimeConfig, modJar: string): Promise<void> {
  await removeDeployed(root);
  const dirs = [
    ...config.server ? [path.join(serverDir(root, config.server), 'mods')] : [],
    ...config.clients.map(name => clientDir(root, name, 'mods')),
    ...config.deploy.map(dir => path.resolve(root, dir)),
  ];
  const deployed: string[] = [];
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, path.basename(modJar));
    await copyFile(modJar, target);
    deployed.push(target);
  }
  await writeAtomic(deployedRecord(root), deployed);
}

// 検証用 world を作り直して NeoForge server を起動し、起動完了まで待つ。crash・Mod load failure は ExecutionFailure (§16.2, §19.1)
export async function startServer(root: string, config: RuntimeConfig, logDir: string): Promise<void> {
  const server = requireServer(config);
  const dir = serverDir(root, server);
  if (!/^eula=true\s*$/m.test(await readFile(path.join(dir, 'eula.txt'), 'utf8').catch(() => ''))) {
    throw new FatalError(`Install the NeoForge server in ${server.directory} and accept the Minecraft EULA in eula.txt`);
  }
  await stopServer(root);
  await rm(path.join(dir, server.world), { recursive: true, force: true });
  await setProperties(path.join(dir, 'server.properties'), {
    'level-name': server.world,
    'level-type': 'minecraft\\:flat',
    'server-port': server.address.split(':').at(-1)!,
    'online-mode': 'false',
    'spawn-protection': '0',
    'spawn-monsters': 'false',
    'generate-structures': 'false',
  });
  // client は offline account で参加するため、その UUID で operator 権限を与えて scenario から command を実行できるようにする
  await writeFile(path.join(dir, 'ops.json'), JSON.stringify(config.clients.map(name => {
    const account = accountName(name);
    return { uuid: offlineUuid(account), name: account, level: 4, bypassesPlayerLimit: false };
  }), null, 2));

  await mkdir(logDir, { recursive: true });
  const logFile = path.join(logDir, 'server.log');
  const handle = await open(logFile, 'a');
  const [command, ...args] = server.command;
  const child = spawn(command!, args, { cwd: dir, detached: true, stdio: ['ignore', handle.fd, handle.fd] });
  await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); })
    .catch((error: Error) => { throw new FatalError(`Cannot start the NeoForge server: ${error.message}`); })
    .finally(() => handle.close());
  child.unref();
  await writeServerProcess(root, { pid: child.pid! });

  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  for (;;) {
    const output = await readFile(logFile, 'utf8');
    if (/Done \([\d.,]+s\)!/.test(output)) return;
    if (!alive(child.pid!)) throw new ExecutionFailure('NeoForge server exited during startup', tail(output, 4000), [logFile]);
    if (Date.now() > deadline) {
      await stopServer(root);
      throw new ExecutionFailure('NeoForge server did not become ready in time', tail(output, 4000), [logFile]);
    }
    await sleep(500);
  }
}

// server を停止し、world の保存と終了を待つ。時間内に終わらなければ強制終了する (§16.2 Server Stop)
export async function stopServer(root: string): Promise<void> {
  const server = await readServerProcess(root);
  if (!server?.pid) return;
  if (alive(server.pid)) {
    signal(server.pid, 'SIGTERM');
    const deadline = Date.now() + SERVER_STOP_TIMEOUT_MS;
    while (alive(server.pid) && Date.now() < deadline) await sleep(500);
    if (alive(server.pid)) signal(server.pid, 'SIGKILL');
  }
  await writeServerProcess(root, { pid: null });
}

// 設定された全 client を MC Pilot で起動し、server の world に参加するまで待つ (§16.2 Client Start, World Load)
export async function startClients(root: string, config: RuntimeConfig, runner: Runner): Promise<void> {
  const server = requireServer(config);
  for (const name of config.clients) {
    await mcPilot(root, config, ['client', 'launch', name, '--server', server.address, '--ws-port', String(await freePort()), '--account', accountName(name), '--force'], runner);
    const ready = await mcPilot(root, config, ['client', 'wait-ready', name, '--timeout', String(CLIENT_READY_TIMEOUT_SECONDS)], runner) as { inWorld?: boolean } | null;
    if (ready?.inWorld !== true) throw new ExecutionFailure(`Client ${name} did not join the world`);
  }
}

// 設定された全 client を MC Pilot で停止する。停止済みの client はそのままにする (§16.2 Client Stop)
export async function stopClients(root: string, config: RuntimeConfig, runner: Runner): Promise<void> {
  for (const name of config.clients) await mcPilot(root, config, ['client', 'stop', name], runner).catch(() => undefined);
}

// server と全 client を起動して RuntimeSession を返す。runtime 設定の欠落と未作成の client は FatalError (§16.2, §23)
export async function startRuntime(root: string, config: RuntimeConfig, logDir: string, runner: Runner): Promise<RuntimeSession> {
  const problems = checkRuntimeConfig(config);
  if (problems.length) throw new FatalError(`The Minecraft runtime is not configured:\n- ${problems.join('\n- ')}`);
  const listed = await mcPilot(root, config, ['client', 'list'], runner) as { clients?: { name: string }[] } | null;
  const missing = config.clients.filter(name => !listed?.clients?.some(client => client.name === name));
  if (missing.length) throw new FatalError(`MC Pilot clients are missing: ${missing.join(', ')}; create them with MCT_HOME=${pilotEnv(root).MCT_HOME}`);
  await stopClients(root, config, runner);
  await startServer(root, config, logDir);
  await startClients(root, config, runner);
  const server = requireServer(config);
  return { server: server.address, clients: config.clients, world: server.world, logDir, startedAt: new Date().toISOString() };
}

// client と server を停止する。前回の残存 process の停止にも使う (§16.2, §20.3)
export async function stopRuntime(root: string, config: RuntimeConfig, runner: Runner): Promise<void> {
  await stopClients(root, config, runner);
  await stopServer(root);
}

// server / client / 設定された追加 log を runtime の logDir へ集め、存在する log のパスを返す (§16.4)
export async function collectLogs(root: string, config: RuntimeConfig, logDir: string): Promise<string[]> {
  const sources: [string, string][] = [
    ...config.clients.map((name): [string, string] => [clientDir(root, name, 'logs', 'latest.log'), `client-${name}.log`]),
    ...config.logs.map((file): [string, string] => [path.resolve(root, file), path.basename(file)]),
  ];
  const serverLog = path.join(logDir, 'server.log');
  const files = await exists(serverLog) ? [serverLog] : [];
  for (const [source, name] of sources) {
    if (!await exists(source)) continue;
    const target = path.join(logDir, name);
    await mkdir(logDir, { recursive: true });
    await copyFile(source, target);
    files.push(target);
  }
  return files;
}

// 一時的な runtime 状態 (server process・配置済み jar・検証用 world) を破棄する (§20.3)
export async function resetRuntime(root: string, config: RuntimeConfig): Promise<void> {
  await stopServer(root);
  await removeDeployed(root);
  if (config.server) await rm(path.join(serverDir(root, config.server), config.server.world), { recursive: true, force: true });
}

function requireServer(config: RuntimeConfig): ServerConfig {
  if (!config.server) throw new FatalError('runtime.server must configure the NeoForge dedicated server');
  return config.server;
}

function serverDir(root: string, server: ServerConfig): string {
  return path.resolve(root, server.directory);
}

// MC Pilot client instance 内のパス
function clientDir(root: string, name: string, ...parts: string[]): string {
  return path.join(pilotEnv(root).MCT_HOME!, 'clients', name, 'minecraft', ...parts);
}

// client の offline account 名。Minecraft の player 名の制約 (英数字と _、16 文字以内) に合わせる
function accountName(client: string): string {
  return client.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 16);
}

// offline-mode の server が player に割り当てる UUID (OfflinePlayer:<name> の UUID v3)
function offlineUuid(name: string): string {
  const bytes = createHash('md5').update(`OfflinePlayer:${name}`).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x30;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function deployedRecord(root: string): string {
  return path.join(projectPaths(root).runtime, 'deployed.json');
}

async function removeDeployed(root: string): Promise<void> {
  const record = deployedRecord(root);
  if (!await exists(record)) return;
  for (const file of await readJson(record) as string[]) await rm(file, { force: true });
  await rm(record, { force: true });
}

// OS が割り当てた空き TCP port を返す
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function setProperties(file: string, values: Record<string, string>): Promise<void> {
  const lines = (await readFile(file, 'utf8').catch(() => '')).split('\n').filter(line => line && !Object.keys(values).some(key => line.startsWith(`${key}=`)));
  await writeFile(file, [...lines, ...Object.entries(values).map(([key, value]) => `${key}=${value}`)].join('\n') + '\n');
}

async function readServerProcess(root: string): Promise<ServerProcess | null> {
  const file = path.join(projectPaths(root).runtime, 'server.json');
  return await exists(file) ? await readJson(file) as ServerProcess : null;
}

async function writeServerProcess(root: string, server: ServerProcess): Promise<void> {
  await writeAtomic(path.join(projectPaths(root).runtime, 'server.json'), server);
}

// process group 内に生存中の process があれば true
function alive(pid: number): boolean {
  try { process.kill(-pid, 0); return true; } catch { return false; }
}

function signal(pid: number, name: NodeJS.Signals): void {
  try { process.kill(-pid, name); } catch { /* 既に終了している */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
