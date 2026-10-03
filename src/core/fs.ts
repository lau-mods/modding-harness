import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ファイルまたはディレクトリが存在するかを返す
export async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

// JSON ファイルを読み込む。読めない場合の分類 (fatal か否か) は呼び出し側で行う
export async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

// 一時ファイル経由で原子的に書き込む。文字列以外は整形 JSON として保存する
export async function writeAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  await rename(temp, file);
}

// root 配下の相対パスを絶対パスへ解決する。root の外を指すパスは例外にする
export function safePath(root: string, relative: string): string {
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`Path escapes the project: ${relative}`);
  return full;
}

// 文字列または Buffer の sha256 を返す
export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
