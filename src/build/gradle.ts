import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { GradleConfig } from '../config/config.js';
import { ExecutionFailure } from '../core/errors.js';
import type { Runner } from '../core/process.js';
import { tail } from '../core/process.js';

// Gradle task 1 回分の実行結果
export type GradleTaskResult = { task: string; success: boolean; output: string; logDir: string };

const GRADLE_TIMEOUT_MS = 60 * 60 * 1000;

// Gradle Wrapper で task を実行する。log は logDir に保存する (§13)
export async function runGradle(root: string, task: string, logDir: string, runner: Runner): Promise<GradleTaskResult> {
  const result = await runner(path.join(root, 'gradlew'), [task, '--console=plain'], { cwd: root, logDir, timeoutMs: GRADLE_TIMEOUT_MS });
  return { task, success: result.code === 0, output: tail(`${result.stdout}\n${result.stderr}`, 6000), logDir };
}

// compile task と build task を順に実行する。失敗は Codex へ渡す log とエラー情報を含む ExecutionFailure (§13)
export async function compileAndBuild(root: string, config: GradleConfig, logDir: string, runner: Runner): Promise<void> {
  for (const [step, task] of [['compile', config.compile], ['build', config.build]] as const) {
    const result = await runGradle(root, task, path.join(logDir, step), runner);
    if (!result.success) throw new ExecutionFailure(`Gradle ${step} task "${task}" failed`, result.output, gradleLogs(result.logDir));
  }
}

// build で生成された Mod jar のパスを返す。build/libs の最新の jar を使い、見つからなければ ExecutionFailure (§16.2 Build Artifact 準備)
export async function findModJar(root: string): Promise<string> {
  const dir = path.join(root, 'build', 'libs');
  const jars = (await readdir(dir).catch(() => [])).filter(name => name.endsWith('.jar') && !/-(sources|javadoc)\.jar$/.test(name));
  if (!jars.length) throw new ExecutionFailure('The build produced no mod jar in build/libs');
  const times = await Promise.all(jars.map(async name => ({ name, time: (await stat(path.join(dir, name))).mtimeMs })));
  return path.join(dir, times.sort((a, b) => b.time - a.time)[0]!.name);
}

// Gradle task の stdout / stderr の保存先
export function gradleLogs(logDir: string): string[] {
  return [path.join(logDir, 'stdout.log'), path.join(logDir, 'stderr.log')];
}
