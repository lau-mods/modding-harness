import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';

// プロジェクトを Harness 管理対象として初期化する。既存の PROJECT.md / .harness-config.json は上書きしない (§25)
export async function initProject(root: string, runner?: Runner): Promise<void> {
  throw new Error('Not implemented');
}

// templates/PROJECT.md を PROJECT.md として配置する
export async function writeProjectTemplate(root: string): Promise<void> {
  throw new Error('Not implemented');
}

// build file や Gradle task を検出して既定の .harness-config.json を書き出す
export async function writeDefaultConfig(root: string, runner: Runner): Promise<HarnessConfig> {
  throw new Error('Not implemented');
}

// .harness-state/ を .gitignore に追加する
export async function ignoreStateDir(root: string): Promise<void> {
  throw new Error('Not implemented');
}
