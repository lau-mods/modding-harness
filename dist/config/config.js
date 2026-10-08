import { FatalError } from '../core/errors.js';
import { readJson } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
// project ごとの Harness 設定ファイル名 (§26)
export const CONFIG_FILE = '.harness-config.json';
// .harness-config.json を読み込み検証する。読めない・必須設定が無い場合は FatalError (§20)
export async function loadConfig(root) {
    let value;
    try {
        value = await readJson(projectPaths(root).config);
    }
    catch (error) {
        throw new FatalError(`Cannot read ${CONFIG_FILE}: ${error.message}`);
    }
    const problems = checkConfig(value);
    if (problems.length)
        throw new FatalError(`Invalid ${CONFIG_FILE}: ${problems.join('; ')}`);
    return value;
}
// 任意の値を HarnessConfig として検証し、問題点を列挙する
export function checkConfig(value) {
    const problems = [];
    const get = (key) => key.split('.').reduce((node, part) => node?.[part], value);
    for (const key of ['gradle.compile', 'gradle.build', 'agents.implementation.command', 'agents.review.command', 'runtime.command', 'runtime.world', 'runtime.server.directory', 'runtime.server.address']) {
        const field = get(key);
        if (typeof field !== 'string' || !field)
            problems.push(`${key} must be a non-empty string`);
    }
    for (const key of ['agents.implementation.model', 'agents.review.model']) {
        if (get(key) !== undefined && typeof get(key) !== 'string')
            problems.push(`${key} must be a string`);
    }
    for (const key of ['runtime.server.command', 'runtime.clients']) {
        const field = get(key);
        if (!Array.isArray(field) || !field.length || !field.every(item => typeof item === 'string' && item))
            problems.push(`${key} must be a non-empty string array`);
    }
    return problems;
}
// init 時に書き出す既定の設定を返す
export function defaultConfig() {
    return {
        gradle: { compile: 'classes', build: 'build' },
        agents: { implementation: { command: 'codex' }, review: { command: 'claude' } },
        runtime: {
            command: 'mct',
            server: { directory: '.harness-state/runtime/server', command: ['./run.sh', '--nogui'], address: '127.0.0.1:25565' },
            clients: ['harness-a', 'harness-b'],
            world: 'harness-world',
        },
    };
}
//# sourceMappingURL=config.js.map