import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultConfig } from '../config/config.js';
import { exists, writeAtomic } from '../core/fs.js';
import { harnessRoot, projectPaths, STATE_DIR } from '../core/paths.js';

// .harness submodule を持つ Workspace を初期化する。既存ファイルは上書きしない (§9.2)
export async function initProject(root: string): Promise<void> {
  const modules = await readFile(path.join(root, '.gitmodules'), 'utf8').catch(() => '');
  if (!/^\s*path\s*=\s*\.harness\s*$/m.test(modules)) throw new Error('Add Harness as the .harness Git submodule before harness init');
  await writeProjectTemplate(root);
  await writeDefaultConfig(root);
  await writeAcceptanceTemplate(root);
  await ignoreTemporaryState(root);
}

// templates/PROJECT.md を PROJECT.md として配置する (§5.2)
export async function writeProjectTemplate(root: string): Promise<void> {
  const target = projectPaths(root).spec;
  if (!await exists(target)) await copyFile(path.join(harnessRoot(), 'templates', 'PROJECT.md'), target);
}

// 既定の .harness-config.json を書き出す (§8)
export async function writeDefaultConfig(root: string): Promise<void> {
  const target = projectPaths(root).config;
  if (!await exists(target)) await writeAtomic(target, defaultConfig());
}

// 空の tests/acceptance.json と tests/e2e/ を準備する (§15.2, §16.3)
export async function writeAcceptanceTemplate(root: string): Promise<void> {
  const paths = projectPaths(root);
  await mkdir(paths.e2e, { recursive: true });
  if (!await exists(paths.acceptance)) await writeAtomic(paths.acceptance, { gameTests: [], e2e: [] });
}

// .harness-state/runs/ と .harness-state/runtime/ を .gitignore に追加する (§7.2)
export async function ignoreTemporaryState(root: string): Promise<void> {
  const file = path.join(root, '.gitignore');
  let content = await readFile(file, 'utf8').catch(() => '');
  for (const entry of [`${STATE_DIR}/runs/`, `${STATE_DIR}/runtime/`]) {
    if (content.split('\n').some(line => line.trim().replace(/^\//, '') === entry)) continue;
    content += `${content && !content.endsWith('\n') ? '\n' : ''}${entry}\n`;
  }
  await writeFile(file, content);
}
