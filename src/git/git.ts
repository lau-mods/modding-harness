import { lstat, readFile, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { exists, hash, walk } from '../io.js';
import { run, success } from '../process.js';
import type { ProcessOptions, ProcessResult } from '../process.js';
import { sectionsOf } from '../spec/parser.js';
import type { ProjectSpec } from '../spec/parser.js';

// Bootstrap and workflow Git share process limits and hooks/fsmonitor hardening.
export function gitProcess(root: string, args: string[], options: Omit<ProcessOptions, 'cwd'> = {}): Promise<ProcessResult> {
  return run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], { ...options, cwd: root });
}
export async function git(root: string, args: string[]): Promise<string> {
  const allowed = new Set(['rev-parse', 'status', 'ls-files', 'diff', 'log', 'show', 'config', 'check-ignore', 'add', 'commit', 'ls-tree', 'for-each-ref', 'merge-base']);
  if (!allowed.has(args[0]!)) throw new Error(`Git operation is not allowed in workflows: ${args[0]}`);
  if (args[0] === 'config' && (args.length !== 5 || args[1] !== '--file' || args[2] !== '.gitmodules' || args[3] !== '--get-regexp')) throw new Error('Only a read of .gitmodules is allowed');
  return success(await gitProcess(root, args), `git ${args[0]}`).stdout;
}
export async function head(root: string): Promise<string> { return (await git(root, ['rev-parse', '--verify', 'HEAD'])).trim(); }
export async function assertRoot(root: string): Promise<void> {
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
  // realpath accommodates macOS /tmp -> /private/tmp.
  if (await realpath(root) !== await realpath(top)) throw new Error('Run harness at the Git project root');
}
export async function treeStatus(root: string): Promise<string> { return git(root, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none']); }
export async function requireClean(root: string): Promise<void> {
  const status = await treeStatus(root);
  if (status) throw new Error(`Dirty working tree; preserve changes as-is without git add, commit, stash, or discard:\n${status}`);
}
export async function gitFiles(root: string): Promise<string[]> {
  return [...new Set((await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))].sort();
}
export async function snapshot(root: string, includeState = true): Promise<string> {
  const files = new Set(await gitFiles(root));
  for (const base of ['src', 'tests']) for (const file of await walk(path.join(root, base))) files.add(`${base}/${file}`);
  for (const base of ['.harness-state', '.harness']) {
    if (!await exists(path.join(root, base))) continue;
    // Dependencies are not agent inputs. Include compiled Harness code actually used by the CLI.
    if (base === '.harness') {
      for (const file of await gitFiles(path.join(root, base))) files.add(`${base}/${file}`);
      for (const file of await walk(path.join(root, base, 'dist'))) files.add(`${base}/dist/${file}`);
    } else if (includeState) {
      // Minecraft mutates its world and appends logs while a visual reviewer runs.
      // These are observations, not workflow authority. State/plan/spec/review records remain guarded.
      for (const file of await walk(path.join(root, base), new Set(['runtime', 'runtime.log']))) files.add(`${base}/${file}`);
    }
  }
  const entries: [string, string][] = [];
  for (const file of [...files].sort()) {
    const full = path.join(root, file);
    if (!await exists(full)) { entries.push([file, 'missing']); continue; }
    const info = await lstat(full);
    if (info.isSymbolicLink()) entries.push([file, `link:${await readlink(full)}`]);
    else if (info.isFile()) entries.push([file, `${info.mode}:${hash(await readFile(full))}`]);
  }
  const gitDir = (await git(root, ['rev-parse', '--absolute-git-dir'])).trim();
  const metadata = [];
  for (const file of ['HEAD', 'index', 'config', 'packed-refs', ...(await walk(path.join(gitDir, 'refs'))).map(file => `refs/${file}`), ...(await walk(path.join(gitDir, 'logs'))).map(file => `logs/${file}`)]) {
    if (await exists(path.join(gitDir, file))) metadata.push([file, hash(await readFile(path.join(gitDir, file)))]);
  }
  return hash(JSON.stringify([entries, metadata]));
}
export async function verifyIdHistory(root: string, spec: ProjectSpec): Promise<void> {
  const revisions = (await git(root, ['log', '--reverse', '--first-parent', '--format=%H', '--', 'PROJECT.md'])).trim().split('\n').filter(Boolean);
  let previous = new Set<string>();
  const retired = new Set<string>();
  const observe = (text: string): void => {
    // Old commits may predate the contract or contain incomplete drafts. Audit IDs,
    // not historical validity; only the current specification uses strict parsing.
    const sections = sectionsOf(text), active = new Set<string>(), inactive = new Set<number>();
    for (const [index, section] of sections.entries()) {
      const id = section.title.match(/^(F-\d{3,}|(?:R|AC)-F\d{3,}-\d{3,})(?=:|\s|$)/)?.[1];
      const child = sections[index + 1];
      const ownText = text.slice(section.start, child && child.start < section.end ? child.start : section.end);
      const isRetired = (section.parent !== null && inactive.has(section.parent)) || (!!id && /^Status: retired\s*$/m.test(ownText));
      if (isRetired) inactive.add(index);
      if (id) { if (isRetired) retired.add(id); else active.add(id); }
    }
    for (const id of previous) if (!active.has(id)) retired.add(id);
    for (const id of active) if (retired.has(id)) throw new Error(`Retired/deleted ID cannot be reused: ${id}`);
    previous = active;
  };
  for (const revision of revisions) {
    const tree = await git(root, ['ls-tree', revision, '--', 'PROJECT.md']);
    observe(tree ? await git(root, ['show', `${revision}:PROJECT.md`]) : '');
  }
  observe(spec.text);
}
export async function localCommit(root: string, message: string, files?: string[]): Promise<string> {
  if (files) await git(root, ['add', '--', ...files]);
  else await git(root, ['add', '-A', '--', '.']);
  await git(root, ['commit', '--no-gpg-sign', '--allow-empty', '-m', message]);
  return head(root);
}
