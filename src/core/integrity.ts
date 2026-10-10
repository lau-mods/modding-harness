import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { FatalError } from './errors.js';
import { sha256 } from './fs.js';
import { harnessRoot, projectPaths } from './paths.js';

// develop 実行中に変更を禁止する対象の、開始時点の fingerprint (§4.2, §6.3, §11)
export type IntegrityBaseline = {
  harness: string; // Harness 本体 (.harness)
  spec: string; // PROJECT.md
  plan: string; // plan.json
};

// 現在の Harness 本体・PROJECT.md・plan の fingerprint を記録する
export async function captureBaseline(root: string): Promise<IntegrityBaseline> {
  const paths = projectPaths(root);
  return { harness: await fingerprintDir(harnessRoot()), spec: sha256(await readFile(paths.spec)), plan: sha256(await readFile(paths.plan)) };
}

// 固定対象が開始時から変更されていれば FatalError を投げる (§4.2, §23)
export async function assertIntegrity(root: string, baseline: IntegrityBaseline): Promise<void> {
  const current = await captureBaseline(root);
  if (current.harness !== baseline.harness) throw new FatalError('Harness files were modified during harness develop');
  if (current.spec !== baseline.spec) throw new FatalError('PROJECT.md was modified during harness develop; change the specification with harness chat');
  if (current.plan !== baseline.plan) throw new FatalError('plan.json was modified during harness develop; the plan is fixed until development ends');
}

// ディレクトリ配下のファイルのパスと内容から fingerprint を作る。node_modules と .git は除く
export async function fingerprintDir(dir: string): Promise<string> {
  const entries: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) entries.push(`${path.relative(dir, full)}:${sha256(await readFile(full))}`);
    }
  };
  await walk(dir);
  return sha256(entries.join('\n'));
}
