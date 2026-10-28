import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FatalError } from '../core/errors.js';
import { STATE_DIR } from '../core/paths.js';
import { run, tail } from '../core/process.js';
import type { Milestone } from '../plan/plan.js';

const MAX_DIFF_LENGTH = 200_000;
// Code Review の差分から除く Harness の状態ファイル
const EXCLUDE_STATE = `:(exclude)${STATE_DIR}`;
// 差分の本文を載せず、変更されたパスの一覧で示す resource
const RESOURCES = 'src/*/resources/**';

// Git コマンドを実行して stdout を返す。失敗は FatalError (§23)
export async function git(root: string, args: string[]): Promise<string> {
  const result = await run('git', args, { cwd: root });
  if (result.code !== 0) throw new FatalError(`git ${args[0]} failed: ${tail(result.stderr + result.stdout, 2000).trim()}`);
  return result.stdout;
}

// 現在の HEAD commit を返す
export async function head(root: string): Promise<string> {
  return (await git(root, ['rev-parse', 'HEAD'])).trim();
}

// 未 commit の変更 (untracked を含む) が無ければ true。paths を指定するとそのパスだけを見る (§10.1)
export async function isClean(root: string, ...paths: string[]): Promise<boolean> {
  return (await git(root, ['status', '--porcelain', '--', ...paths])).trim() === '';
}

// commit が存在すれば true (§9.4 Progress と checkpoint の整合性)
export async function commitExists(root: string, commit: string): Promise<boolean> {
  return (await run('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: root })).code === 0;
}

// .harness が submodule として登録され、checkout 済みで記録された revision と一致し、変更が無ければ true (§4.1, §10.1)
export async function harnessSubmoduleReady(root: string): Promise<boolean> {
  const modules = await readFile(path.join(root, '.gitmodules'), 'utf8').catch(() => '');
  if (!/^\s*path\s*=\s*\.harness\s*$/m.test(modules)) return false;
  const status = await run('git', ['submodule', 'status', '--', '.harness'], { cwd: root });
  if (status.code !== 0 || !status.stdout.startsWith(' ')) return false;
  return (await run('git', ['-C', '.harness', 'status', '--porcelain', '--untracked-files=no'], { cwd: root })).stdout.trim() === '';
}

// base (commit または tree) から作業ツリーまでの差分 (untracked を含む) を返す。ソースは全文、resource は変更されたパスの一覧にする。Code Review の入力 (§14.1)
export async function diffFrom(root: string, base: string): Promise<string> {
  await git(root, ['add', '-A']);
  // ソースはファイル単位で上限まで全文を載せ、載せきれないファイルは名前を明示する
  const patches = (await git(root, ['diff', '--cached', base, '--', '.', EXCLUDE_STATE, `:(exclude,glob)${RESOURCES}`])).split(/^(?=diff --git )/m).filter(Boolean);
  let diff = '';
  const omitted: string[] = [];
  for (const patch of patches) {
    if (diff.length + patch.length <= MAX_DIFF_LENGTH) diff += patch;
    else omitted.push(patch.match(/^diff --git a\/.* b\/(.*)$/m)?.[1] ?? patch.split('\n')[0]!);
  }
  // resource はディレクトリごとに変更種別とファイル名をまとめる
  const resources = new Map<string, string[]>();
  for (const line of (await git(root, ['diff', '--cached', '--name-status', base, '--', `:(glob)${RESOURCES}`])).split('\n').filter(Boolean)) {
    const [status, ...files] = line.split('\t');
    const file = files.at(-1)!;
    resources.set(path.posix.dirname(file), [...resources.get(path.posix.dirname(file)) ?? [], `${status![0]} ${path.posix.basename(file)}`]);
  }
  return [
    diff,
    omitted.length && `[Diff of these files is not shown because of the size limit. They are not reviewed until you read them]\n${omitted.join('\n')}`,
    resources.size && `[Changed resource files. Their content is not shown; read the ones the review depends on]\n${[...resources].map(([dir, entries]) => `${dir}/: ${entries.join(', ')}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');
}

// 現在の作業ツリーを Git の tree object として記録し、その ID を返す。Code Review 時点の状態として次の再確認の差分の基点にする
export async function snapshotTree(root: string): Promise<string> {
  await git(root, ['add', '-A']);
  return (await git(root, ['write-tree'])).trim();
}


// 指定ファイルだけを commit し、commit ID を返す。変更が無ければ HEAD を返す。仕様変更・plan 確定に使う (§9.6)
export async function commitFiles(root: string, files: string[], message: string): Promise<string> {
  await git(root, ['add', '--', ...files]);
  if ((await run('git', ['diff', '--cached', '--quiet', '--', ...files], { cwd: root })).code === 0) return head(root);
  await git(root, ['commit', '-m', message, '--', ...files]);
  return head(root);
}

// Milestone・Features・Acceptance-Criteria を含む checkpoint commit メッセージを作る (§21.2)
export function checkpointMessage(milestone: Milestone, acIds: string[]): string {
  return `Harness checkpoint ${milestone.id}\n\nMilestone: ${milestone.id}\nFeatures: ${milestone.features.join(', ')}\nAcceptance-Criteria: ${acIds.join(', ')}\n`;
}

// 作業ツリーの全変更を commit して checkpoint を作り、commit ID を返す (§21.2)
export async function createCheckpoint(root: string, milestone: Milestone, acIds: string[]): Promise<string> {
  await git(root, ['add', '-A']);
  await git(root, ['commit', '--allow-empty', '-m', checkpointMessage(milestone, acIds)]);
  return head(root);
}

// milestone の checkpoint commit を履歴から探す。無ければ null (§9.4)
export async function findCheckpoint(root: string, milestoneId: string): Promise<string | null> {
  const found = (await git(root, ['log', '--format=%H', '-1', `--grep=^Harness checkpoint ${milestoneId}$`])).trim();
  return found || null;
}

// 名前に LICENSE / LICENCE を含むファイルへの変更を取り消す。HEAD の内容へ戻し、新規作成されたものは削除する
export async function revertLicenseFiles(root: string): Promise<void> {
  const pathspec = ':(glob)**/*LICEN[CS]E*';
  if ((await git(root, ['ls-files', '--', pathspec])).trim()) await git(root, ['checkout', 'HEAD', '--', pathspec]);
  await git(root, ['clean', '-f', '--', pathspec]);
}

// 作業ツリーを指定 checkpoint の状態へ復元し、未追跡ファイルを削除する。Git 管理外の .harness-state は保持する。失敗は FatalError (§20.2, §23)
export async function restoreCheckpoint(root: string, commit: string): Promise<void> {
  try {
    await git(root, ['reset', '--hard', commit]);
    await git(root, ['clean', '-fd']);
  } catch (error) {
    throw new FatalError(`Cannot restore checkpoint ${commit}: ${(error as Error).message}`);
  }
}
