import type { GradleConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';

// Gradle task 1 回分の実行結果
export type GradleTaskResult = { task: string; success: boolean; output: string; logDir: string };

// Gradle Wrapper で task を実行する。log は logDir に保存する (§13)
export async function runGradle(root: string, task: string, logDir: string, runner: Runner): Promise<GradleTaskResult> {
  throw new Error('Not implemented');
}

// compile task と build task を順に実行する。失敗は Codex へ渡す log とエラー情報を含む ExecutionFailure (§13)
export async function compileAndBuild(root: string, config: GradleConfig, logDir: string, runner: Runner): Promise<void> {
  throw new Error('Not implemented');
}

// build で生成された Mod jar のパスを返す。見つからなければ ExecutionFailure (§16.2 Build Artifact 準備)
export async function findModJar(root: string): Promise<string> {
  throw new Error('Not implemented');
}
