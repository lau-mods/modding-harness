import type { Runner } from '../core/process.js';

// create の引数。templateRef 未指定なら template repository の既定 branch を使う (§9.1)
export type CreateOptions = { templateRepo: string; templateRef?: string };

// NeoForge template repository から独立した Git repository を作り、実行中の Harness の origin を .harness submodule として追加して初期化する (§9.1)
export async function createProject(directory: string, options: CreateOptions, runner: Runner): Promise<void> {
  throw new Error('Not implemented');
}
