import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { ExecutionFailure, FatalError } from '../core/errors.js';
import { tail } from '../core/process.js';
const GRADLE_TIMEOUT_MS = 60 * 60 * 1000;
// 設定された Gradle task を gradlew 経由で実行する。timeout も失敗結果として返す
export async function runGradle(root, config, step, logDir, runner) {
    const dir = path.join(logDir, step);
    try {
        const result = await runner(path.join(root, 'gradlew'), [config.gradle[step], '--console=plain'], { cwd: root, logDir: dir, timeoutMs: GRADLE_TIMEOUT_MS });
        return { step, success: result.code === 0, logDir: dir, summary: result.code === 0 ? '' : tail(`${result.stdout}\n${result.stderr}`, 6000) };
    }
    catch (error) {
        if (error instanceof ExecutionFailure)
            return { step, success: false, logDir: dir, summary: error.message };
        throw error;
    }
}
// compile → build の順に実行し、最初に失敗した工程の結果、または build の結果を返す (§9)
export async function compileAndBuild(root, config, logDir, runner) {
    const compile = await runGradle(root, config, 'compile', logDir, runner);
    return compile.success ? runGradle(root, config, 'build', logDir, runner) : compile;
}
// E2E で配置する build 成果物 (mod jar) のパスを特定する。build/libs の最新の jar を使う
export async function findModJar(root) {
    const dir = path.join(root, 'build', 'libs');
    const jars = (await readdir(dir).catch(() => [])).filter(name => name.endsWith('.jar') && !/-(sources|javadoc)\.jar$/.test(name));
    if (!jars.length)
        throw new FatalError(`No mod jar found in ${path.relative(root, dir)} after a successful build`);
    const times = await Promise.all(jars.map(async (name) => ({ name, time: (await stat(path.join(dir, name))).mtimeMs })));
    return path.join(dir, times.sort((a, b) => b.time - a.time)[0].name);
}
//# sourceMappingURL=gradle.js.map