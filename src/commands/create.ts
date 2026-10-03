import type { Runner } from '../core/process.js';

// harness create のオプション
export type CreateOptions = { templateRepo: string; templateRef?: string };

// テンプレートから新しい NeoForge プロジェクトを作成し、Harness 管理対象として初期化する (§25)
export async function createProject(directory: string, options: CreateOptions, runner?: Runner): Promise<void> {
  throw new Error('Not implemented');
}
