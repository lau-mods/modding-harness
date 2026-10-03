import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultConfig } from '../config/config.js';
import { exists, writeAtomic } from '../core/fs.js';
import { harnessRoot, projectPaths } from '../core/paths.js';

// .harness submodule を持つプロジェクトを Harness 管理対象として初期化する。PROJECT.md と .harness-config.json は存在しない場合だけ作成する (§25)
export async function initProject(root: string): Promise<void> {
  if (!/^\s*path = \.harness$/m.test(await readFile(path.join(root, '.gitmodules'), 'utf8').catch(() => ''))) throw new Error('Add Harness as the .harness Git submodule before harness init');
  await writeProjectTemplate(root);
  await writeDefaultConfig(root);
  await ignoreStateDir(root);
}

// templates/PROJECT.md を PROJECT.md として配置する
export async function writeProjectTemplate(root: string): Promise<void> {
  const target = projectPaths(root).spec;
  if (!await exists(target)) await copyFile(path.join(harnessRoot(), 'templates', 'PROJECT.md'), target);
}

// build file を検出して既定の .harness-config.json を書き出す
export async function writeDefaultConfig(root: string): Promise<void> {
  const target = projectPaths(root).config;
  if (await exists(target)) return;
  const config = defaultConfig();
  if (!await exists(path.join(root, 'build.gradle')) && await exists(path.join(root, 'build.gradle.kts'))) config.project.buildFile = 'build.gradle.kts';
  await writeAtomic(target, config);
}

// .harness-state/ を .gitignore に追加する
export async function ignoreStateDir(root: string): Promise<void> {
  const file = path.join(root, '.gitignore');
  const content = await readFile(file, 'utf8').catch(() => '');
  if (/^\/?\.harness-state\/?$/m.test(content)) return;
  await writeFile(file, `${content}${content && !content.endsWith('\n') ? '\n' : ''}.harness-state/\n`);
}
