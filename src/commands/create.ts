import { rm } from 'node:fs/promises';
import path from 'node:path';
import { exists } from '../core/fs.js';
import { requireSuccess, run } from '../core/process.js';
import { git } from '../git/git.js';
import { initProject } from './init.js';

// harness create のオプション
export type CreateOptions = { templateRepo: string; templateRef?: string };

// テンプレートから新しい NeoForge プロジェクトを作成し、Harness 管理対象として初期化して最初の commit を作る (§25)
export async function createProject(directory: string, options: CreateOptions): Promise<void> {
  if (await exists(directory)) throw new Error(`${directory} already exists`);
  const branch = options.templateRef ? ['--branch', options.templateRef] : [];
  requireSuccess(await run('git', ['clone', '--depth', '1', ...branch, options.templateRepo, directory], { cwd: path.dirname(directory) }), 'git clone');
  await rm(path.join(directory, '.git'), { recursive: true, force: true });
  await git(directory, ['init']);
  await initProject(directory);
  await git(directory, ['add', '-A']);
  await git(directory, ['commit', '-m', 'Create project from template']);
}
