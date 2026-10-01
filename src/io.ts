import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const VERSION = '1.0.0';
export const hash = (value: string | Buffer): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
export async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export async function save(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, typeof value === 'string' ? value : json(value));
  await rename(temp, file);
}
export async function readJson(file: string): Promise<unknown> {
  try { return JSON.parse(await readFile(file, 'utf8')) as unknown; }
  catch (error) { throw new Error(`Cannot read JSON ${file}: ${(error as Error).message}`); }
}
export function assertSafeRelativePath(file: string): void {
  if (!file || file.includes('\\') || file.includes('\0') || path.posix.isAbsolute(file) ||
      file.split('/').some(part => !part || part === '.' || part === '..') || /^[A-Za-z]:/.test(file)) {
    throw new Error(`Unsafe relative path: ${file}`);
  }
}
export async function safePath(root: string, file: string): Promise<string> {
  assertSafeRelativePath(file);
  let current = root;
  for (const part of file.split('/')) {
    current = path.join(current, part);
    if (await exists(current) && (await lstat(current)).isSymbolicLink()) throw new Error(`Symlink not allowed: ${file}`);
  }
  return current;
}
export async function walk(root: string, exclude: Set<string> = new Set()): Promise<string[]> {
  if (!await exists(root)) return [];
  const result: string[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (exclude.has(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed in managed input: ${path.join(root, entry.name)}`);
    if (entry.isDirectory()) result.push(...(await walk(path.join(root, entry.name), exclude)).map(file => `${entry.name}/${file}`));
    else if (entry.isFile()) result.push(entry.name);
  }
  return result;
}
