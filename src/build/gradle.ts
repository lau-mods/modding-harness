import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';

// compile / build の工程 (§9)
export type BuildStep = 'compile' | 'build';

// 1 工程の実行結果。失敗時は summary (compiler / Gradle のエラー抜粋) を Codex に差し戻す
export type BuildResult = { step: BuildStep; success: boolean; logDir: string; summary: string };

// 設定された Gradle task を gradlew 経由で実行する
export async function runGradle(root: string, config: HarnessConfig, step: BuildStep, logDir: string, runner: Runner): Promise<BuildResult> {
  throw new Error('Not implemented');
}

// compile → build の順に実行し、最初に失敗した工程の結果、または build の結果を返す (§9)
export async function compileAndBuild(root: string, config: HarnessConfig, logDir: string, runner: Runner): Promise<BuildResult> {
  throw new Error('Not implemented');
}

// E2E で配置する build 成果物 (mod jar) のパスを特定する
export async function findModJar(root: string, config: HarnessConfig): Promise<string> {
  throw new Error('Not implemented');
}
