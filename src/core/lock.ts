import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectPaths } from './paths.js';

// Workspace 内で develop などの workflow が多重実行されないよう排他して action を実行する (§3)
export async function withLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const file = projectPaths(root).lock;
  await mkdir(path.dirname(file), { recursive: true });
  // 異常終了した process の lock は、その pid が存在しなければ引き継ぐ
  const owner = Number(await readFile(file, 'utf8').catch(() => ''));
  if (owner && !alive(owner)) await unlink(file).catch(() => undefined);
  try { await writeFile(file, String(process.pid), { flag: 'wx' }); }
  catch { throw new Error(`Another harness workflow is running in this workspace (pid ${owner || 'unknown'})`); }
  try {
    return await action();
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
