import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config/config.js';
import { run } from '../core/process.js';
import { mcPilot, pilotEnv } from '../e2e/runtime.js';
// node / git / java / gradlew / codex / claude / MC Pilot と実機環境を確認する (§25, §27)
export async function doctor(root, runner = run) {
    const major = Number(process.versions.node.split('.')[0]);
    const results = [{ name: 'node', status: major >= 20 ? 'ok' : 'misconfigured', detail: process.version }];
    results.push(await probe(runner, root, 'git', 'git', ['--version']));
    results.push(await probe(runner, root, 'java', 'java', ['-version']));
    results.push(await probe(runner, root, 'gradlew', path.join(root, 'gradlew'), ['--version']));
    let config;
    try {
        config = await loadConfig(root);
        results.push({ name: 'config', status: 'ok', detail: '.harness-config.json' });
    }
    catch (error) {
        results.push({ name: 'config', status: 'misconfigured', detail: error.message });
        return results;
    }
    results.push(...await checkAgentAuth(root, config, runner));
    results.push(...await checkRuntime(root, config, runner));
    return results;
}
// codex / claude が実行でき、認証が利用可能か確認する (§20)
export async function checkAgentAuth(root, config, runner) {
    const codex = await probe(runner, root, 'codex', config.agents.implementation.command, ['login', 'status']);
    const claude = await probe(runner, root, 'claude', config.agents.review.command, ['auth', 'status']);
    if (claude.status === 'ok') {
        const status = JSON.parse(claude.detail);
        claude.status = status.loggedIn ? 'ok' : 'misconfigured';
        claude.detail = status.loggedIn ? `logged in (${status.authMethod})` : 'run claude auth login';
    }
    return [codex, claude];
}
// MC Pilot の client instance と NeoForge server の準備状況を確認する (§27, §28)
export async function checkRuntime(root, config, runner) {
    const results = [await probe(runner, root, 'MC Pilot', config.runtime.command, ['--cli-version'], { env: pilotEnv(root) })];
    const eula = await readFile(path.join(root, config.runtime.server.directory, 'eula.txt'), 'utf8').catch(() => '');
    results.push(/^eula=true\s*$/m.test(eula)
        ? { name: 'server', status: 'ok', detail: config.runtime.server.directory }
        : { name: 'server', status: 'missing', detail: `Install a NeoForge server in ${config.runtime.server.directory} and accept the EULA in eula.txt` });
    try {
        const listed = await mcPilot(root, config.runtime, ['client', 'list'], runner);
        const missing = config.runtime.clients.filter(name => !listed?.clients?.some(client => client.name === name));
        results.push(missing.length
            ? { name: 'clients', status: 'missing', detail: `Create with MCT_HOME=${pilotEnv(root).MCT_HOME}: ${missing.join(', ')}` }
            : { name: 'clients', status: 'ok', detail: config.runtime.clients.join(', ') });
    }
    catch (error) {
        results.push({ name: 'clients', status: 'misconfigured', detail: error.message });
    }
    return results;
}
// コマンドを実行し、終了コード 0 なら ok として出力の要約を返す
async function probe(runner, root, name, command, args, options = {}) {
    try {
        const result = await runner(command, args, { cwd: root, timeoutMs: 300_000, ...options });
        const detail = (result.stdout || result.stderr).trim() || `exit ${result.code}`;
        return { name, status: result.code === 0 ? 'ok' : 'misconfigured', detail };
    }
    catch (error) {
        return { name, status: 'missing', detail: error.message };
    }
}
//# sourceMappingURL=doctor.js.map