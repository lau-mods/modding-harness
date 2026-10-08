import { spawn } from 'node:child_process';
import { copyFile, mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { ExecutionFailure, FatalError } from '../core/errors.js';
import { exists, readJson, writeAtomic } from '../core/fs.js';
import { harnessRoot, projectPaths } from '../core/paths.js';
import { tail } from '../core/process.js';
const SERVER_READY_TIMEOUT_MS = 10 * 60 * 1000;
const SERVER_STOP_TIMEOUT_MS = 2 * 60 * 1000;
const MCT_TIMEOUT_MS = 5 * 60 * 1000;
const CLIENT_READY_TIMEOUT_SECONDS = 180;
// MC Pilot に渡す環境変数。MC Pilot の home と cache は project の .harness-state/runtime に置く
export function pilotEnv(root) {
    const runtime = projectPaths(root).runtime;
    return { MCT_HOME: path.join(runtime, 'mct-home'), MCT_CACHE_DIR: path.join(runtime, 'mct-cache'), MCT_SKILL_TARGETS: 'none' };
}
// MC Pilot CLI を呼び出して JSON envelope の data を返す。失敗は ExecutionFailure (§17)
export async function mcPilot(root, config, args, runner) {
    const result = await runner(config.command, args, { cwd: root, env: pilotEnv(root), timeoutMs: MCT_TIMEOUT_MS });
    let envelope;
    try {
        envelope = JSON.parse(result.stdout);
    }
    catch {
        envelope = {};
    }
    if (result.code !== 0 || envelope.success !== true)
        throw new ExecutionFailure(`MC Pilot ${args.join(' ')} failed: ${tail(result.stderr + result.stdout, 2000)}`);
    return envelope.data;
}
// build した mod jar を server と全 client の mods へ配置し、前回配置した jar を置き換える (§27)
export async function deployMod(root, config, modJar) {
    const record = path.join(projectPaths(root).runtime, 'deployed.json');
    if (await exists(record))
        for (const file of await readJson(record))
            await rm(file, { force: true });
    const dirs = [path.join(root, config.server.directory, 'mods'), ...config.clients.map(name => clientDir(root, name, 'mods'))];
    const deployed = [];
    for (const dir of dirs) {
        await mkdir(dir, { recursive: true });
        const target = path.join(dir, path.basename(modJar));
        await copyFile(modJar, target);
        deployed.push(target);
    }
    await writeAtomic(record, deployed);
}
// 設定された client の存在を確認し、server を起動して全 client を world に参加させる。起動失敗・crash は ExecutionFailure (§17, §27, §28)
export async function startRuntime(root, config, logDir, runner) {
    const listed = await mcPilot(root, config, ['client', 'list'], runner);
    const missing = config.clients.filter(name => !listed?.clients?.some(client => client.name === name));
    if (missing.length)
        throw new FatalError(`MC Pilot clients are missing: ${missing.join(', ')}; create them with MCT_HOME=${pilotEnv(root).MCT_HOME}`);
    await stopClients(root, config, runner);
    await mkdir(logDir, { recursive: true });
    await startServer(root, config, path.join(logDir, 'server.log'));
    await launchClients(root, config, runner);
    return { server: config.server.address, clients: config.clients, world: config.world, logDir, startedAt: new Date().toISOString() };
}
// client と server を停止する。停止は最善努力で行い、次回の起動前にも残存 process を停止する
export async function stopRuntime(root, config, runner) {
    await stopClients(root, config, runner);
    await stopServer(root);
}
// 設定された全 client を、client ごとのアカウント名と空き WebSocket port で起動し、server に接続して world に参加するまで待つ (§27)
export async function launchClients(root, config, runner) {
    for (const name of config.clients) {
        const account = name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 16);
        await mcPilot(root, config, ['client', 'launch', name, '--server', config.server.address, '--ws-port', String(await freePort()), '--account', account, '--force'], runner);
        const ready = await mcPilot(root, config, ['client', 'wait-ready', name, '--timeout', String(CLIENT_READY_TIMEOUT_SECONDS)], runner);
        if (ready?.inWorld !== true)
            throw new ExecutionFailure(`Client ${name} did not join the world`);
    }
}
// 設定された全 client を MC Pilot で停止する。停止済みの client はそのままにする
export async function stopClients(root, config, runner) {
    for (const name of config.clients)
        await mcPilot(root, config, ['client', 'stop', name], runner).catch(() => undefined);
}
// 固定テスト world と server port を server.properties に設定し、server を起動して "Done (" の出力まで待つ (§28)
export async function startServer(root, config, logFile) {
    const dir = path.join(root, config.server.directory);
    if (!/^eula=true\s*$/m.test(await readFile(path.join(dir, 'eula.txt'), 'utf8').catch(() => ''))) {
        throw new FatalError(`Prepare the NeoForge server in ${config.server.directory} and accept the Minecraft EULA in eula.txt`);
    }
    await stopServer(root);
    await setProperties(path.join(dir, 'server.properties'), { 'level-name': config.world, 'server-port': config.server.address.split(':').at(-1), 'online-mode': 'false' });
    const previous = await readServerProcess(root);
    const log = logFile ?? previous.logFile;
    await mkdir(path.dirname(log), { recursive: true });
    const offset = await stat(log).then(info => info.size, () => 0);
    const handle = await open(log, 'a');
    const [command, ...args] = config.server.command;
    const child = spawn(command, args, { cwd: dir, detached: true, stdio: ['ignore', handle.fd, handle.fd] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); })
        .catch((error) => { throw new FatalError(`Cannot start the NeoForge server: ${error.message}`); })
        .finally(() => handle.close());
    child.unref();
    await writeServerProcess(root, { pid: child.pid, logFile: log });
    const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
    for (;;) {
        const output = (await readFile(log)).subarray(offset).toString('utf8');
        if (/Done \([\d.,]+s\)!/.test(output))
            return;
        if (!alive(child.pid))
            throw new ExecutionFailure(`NeoForge server exited during startup: ${tail(output, 2000)}`);
        if (Date.now() > deadline) {
            await stopServer(root);
            throw new ExecutionFailure('NeoForge server did not become ready in time');
        }
        await sleep(500);
    }
}
// server の process group に SIGTERM を送り、world の保存と終了を待つ。時間内に終わらなければ SIGKILL で終了させる
export async function stopServer(root) {
    const server = await readServerProcess(root);
    if (!server?.pid)
        return;
    if (alive(server.pid)) {
        signal(server.pid, 'SIGTERM');
        const deadline = Date.now() + SERVER_STOP_TIMEOUT_MS;
        while (alive(server.pid) && Date.now() < deadline)
            await sleep(500);
        if (alive(server.pid))
            signal(server.pid, 'SIGKILL');
    }
    await writeServerProcess(root, { pid: null, logFile: server.logFile });
}
// server / client の log を session の logDir へ集め、保存先パスを返す (§29)
export async function collectLogs(root, session) {
    const files = [];
    const serverLog = (await readServerProcess(root))?.logFile;
    if (serverLog && await exists(serverLog))
        files.push(serverLog);
    for (const name of session.clients) {
        const source = clientDir(root, name, 'logs', 'latest.log');
        if (!await exists(source))
            continue;
        const target = path.join(session.logDir, `client-${name}.log`);
        await copyFile(source, target);
        files.push(target);
    }
    return files;
}
// scenario process に渡す環境変数 (MC Pilot command・instance 名・world・結果出力先など) を組み立てる
export function scenarioEnv(root, config, session, scenario, resultFile, screenshotDir) {
    return {
        ...pilotEnv(root),
        HARNESS_MCT: config.command,
        HARNESS_E2E_LIB: path.join(harnessRoot(), 'e2e', 'lib.mjs'),
        HARNESS_CLIENTS: JSON.stringify(session.clients),
        HARNESS_SERVER_ADDRESS: session.server,
        HARNESS_WORLD: session.world,
        HARNESS_SERVER_CONTROL: JSON.stringify([process.execPath, path.join(harnessRoot(), 'dist', 'cli', 'main.js'), '--project', root, 'server']),
        HARNESS_RESULT_FILE: resultFile,
        HARNESS_SCREENSHOT_DIR: screenshotDir,
        HARNESS_SCENARIO_ID: scenario.id,
        HARNESS_AC_IDS: JSON.stringify(scenario.acIds),
    };
}
// OS が割り当てた空き TCP port を返す。直前に使った port との衝突を避ける
function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}
// MC Pilot client instance 内のパス
function clientDir(root, name, ...parts) {
    return path.join(pilotEnv(root).MCT_HOME, 'clients', name, 'minecraft', ...parts);
}
async function setProperties(file, values) {
    const lines = (await readFile(file, 'utf8').catch(() => '')).split('\n').filter(line => line && !Object.keys(values).some(key => line.startsWith(`${key}=`)));
    await writeFile(file, [...lines, ...Object.entries(values).map(([key, value]) => `${key}=${value}`)].join('\n') + '\n');
}
async function readServerProcess(root) {
    const file = path.join(projectPaths(root).runtime, 'server.json');
    return await exists(file) ? await readJson(file) : null;
}
async function writeServerProcess(root, server) {
    await writeAtomic(path.join(projectPaths(root).runtime, 'server.json'), server);
}
// process group 内に生存中の process があれば true
function alive(pid) {
    try {
        process.kill(-pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function signal(pid, name) {
    try {
        process.kill(-pid, name);
    }
    catch { /* 既に終了している */ }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=runtime.js.map