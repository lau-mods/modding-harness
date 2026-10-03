import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { FatalError } from './errors.js';
import { sha256 } from './fs.js';
import { harnessRoot, projectPaths } from './paths.js';

// 開発実行中に変更を禁止する対象の、開始時点の fingerprint
export type IntegrityBaseline = {
  harness: string; // Harness 本体 (配布ファイル一式)
  spec: string; // PROJECT.md
};

// 現在の Harness 本体と PROJECT.md の fingerprint を記録する
export async function captureBaseline(root: string): Promise<IntegrityBaseline> {
  return { harness: await fingerprintDir(harnessRoot()), spec: sha256(await readFile(projectPaths(root).spec)) };
}

// Harness 本体または PROJECT.md が開始時から変更されていれば FatalError を投げる。PROJECT.md の変更は harness chat でのみ許可する (§8, §20, §23)
export async function assertIntegrity(root: string, baseline: IntegrityBaseline): Promise<void> {
  if (await fingerprintDir(harnessRoot()) !== baseline.harness) throw new FatalError('Harness files were modified during the run');
  if (sha256(await readFile(projectPaths(root).spec)) !== baseline.spec) throw new FatalError('PROJECT.md was modified during development; product changes are applied with harness chat');
}

// ディレクトリ配下のファイルのパスと内容から fingerprint を作る。依存パッケージと Git 管理情報を除いて計算する
async function fingerprintDir(dir: string): Promise<string> {
  const entries: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', '.git', '.harness-state'].includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) entries.push(`${path.relative(dir, full)}:${sha256(await readFile(full))}`);
    }
  };
  await walk(dir);
  return sha256(entries.join('\n'));
}
