import { rm } from 'node:fs/promises';
import path from 'node:path';
import { exists } from '../core/fs.js';
import { harnessRoot } from '../core/paths.js';
import { requireSuccess } from '../core/process.js';
import type { Runner } from '../core/process.js';
import { git } from '../git/git.js';
import { initProject } from './init.js';

// create の引数。templateRef 未指定なら template repository の既定 branch を使う (§9.1)
export type CreateOptions = { templateRepo: string; templateRef?: string };

// NeoForge template repository から独立した Git repository を作り、実行中の Harness の origin を .harness submodule として追加して初期化する (§9.1)
export async function createProject(directory: string, options: CreateOptions, runner: Runner): Promise<void> {
  const target = path.resolve(directory);
  if (await exists(target)) throw new Error(`${directory} already exists`);
  const harnessRepo = (await git(harnessRoot(), ['remote', 'get-url', 'origin'])).trim();
  requireSuccess(await runner('git', ['clone', options.templateRepo, target], { cwd: path.dirname(target) }), 'git clone');
  if (options.templateRef) await git(target, ['checkout', options.templateRef]);
  // template の履歴を持ち込まず、独立した repository として始める
  await rm(path.join(target, '.git'), { recursive: true, force: true });
  await git(target, ['init']);
  await git(target, ['submodule', 'add', harnessRepo, '.harness']);
  requireSuccess(await runner('npm', ['--prefix', '.harness', 'ci'], { cwd: target }), 'npm ci');
  requireSuccess(await runner('npm', ['--prefix', '.harness', 'run', 'build'], { cwd: target }), 'npm run build');
  await initProject(target);
  await git(target, ['add', '-A']);
  await git(target, ['commit', '-m', 'Create workspace from template']);
}
