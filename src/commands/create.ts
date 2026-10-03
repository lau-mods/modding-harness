import { rm } from 'node:fs/promises';
import path from 'node:path';
import { exists } from '../core/fs.js';
import { requireSuccess, run } from '../core/process.js';
import { git } from '../git/git.js';
import { initProject } from './init.js';

// harness create のオプション
export type CreateOptions = { templateRepo: string; templateRef?: string };

// テンプレートから新しい NeoForge プロジェクトを作成し、Harness を .harness submodule として追加して初期化し、最初の commit を作る (§25)
export async function createProject(directory: string, options: CreateOptions): Promise<void> {
  if (await exists(directory)) throw new Error(`${directory} already exists`);
  const branch = options.templateRef ? ['--branch', options.templateRef] : [];
  requireSuccess(await run('git', ['clone', '--depth', '1', ...branch, options.templateRepo, directory], { cwd: path.dirname(directory) }), 'git clone');
  await rm(path.join(directory, '.git'), { recursive: true, force: true });
  await git(directory, ['init']);
  await git(directory, ['submodule', 'add', 'https://github.com/lau-mods/modding-harness.git', '.harness']);
  await initProject(directory);
  await git(directory, ['add', '-A']);
  await git(directory, ['commit', '-m', 'Create project from template']);
}
