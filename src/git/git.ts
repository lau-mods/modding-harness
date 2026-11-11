import { readFile, rm } from 'node:fs/promises';
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

// commit が target の祖先 (または同一) なら true
export async function isAncestor(root: string, commit: string, target: string): Promise<boolean> {
  return (await run('git', ['merge-base', '--is-ancestor', commit, target], { cwd: root })).code === 0;
}

// commit を checkout した detached HEAD の worktree を dir に作る。dir に残る以前の worktree は破棄する (§10.3)
export async function addWorktree(root: string, dir: string, commit: string): Promise<void> {
  await removeWorktree(root, dir);
  await git(root, ['worktree', 'add', '--detach', '--force', dir, commit]);
}

// worktree を作業途中の変更ごと削除する。存在しなければ何もしない
export async function removeWorktree(root: string, dir: string): Promise<void> {
  await run('git', ['worktree', 'remove', '--force', '--force', dir], { cwd: root });
  await rm(dir, { recursive: true, force: true });
  await git(root, ['worktree', 'prune']);
}

// worktree の未 commit の変更を残したまま、HEAD を commit (Workspace の新しい checkpoint) へ進めて差分を取り込む。衝突したファイルは conflict marker を残して一覧を返す (§10.3)
export async function mergeIntoWorktree(dir: string, commit: string): Promise<string[]> {
  await commitWork(dir);
  const merged = await run('git', ['merge', '--no-edit', '--no-verify', commit], { cwd: dir });
  const conflicts = merged.code === 0 ? [] : (await git(dir, ['diff', '--name-only', '--diff-filter=U'])).split('\n').filter(Boolean);
  if (merged.code !== 0 && !conflicts.length) throw new FatalError(`git merge failed: ${tail(merged.stderr + merged.stdout, 2000).trim()}`);
  // merge 状態を解除して HEAD を commit に戻し、この milestone の変更を未 commit の差分として残す
  await git(dir, ['reset', '--mixed', commit]);
  return conflicts;
}

// worktree の変更を Workspace の作業ツリーへ取り込む。Workspace の HEAD は worktree の HEAD と一致していること。HEAD は動かさず変更は未 commit で残す (§10.3)
export async function applyWorktree(root: string, dir: string): Promise<void> {
  const base = await head(dir);
  await git(root, ['merge', '--ff-only', await commitWork(dir)]);
  await git(root, ['reset', '--soft', base]);
}

// root の作業ツリーの変更 (untracked を含み、except を除く) を worktree の dir へ移す。HEAD が同じ commit であること
export async function moveChanges(root: string, dir: string, except: string): Promise<void> {
  await git(root, ['stash', 'push', '--include-untracked', '-m', 'Harness work in progress', '--', '.', `:(exclude)${except}`]);
  await git(dir, ['stash', 'pop']);
}

// path の変更を HEAD の内容へ戻す。worktree 内の Harness の状態ファイルを Codex の変更から守る
export async function discardChanges(root: string, file: string): Promise<void> {
  await git(root, ['checkout', 'HEAD', '--', file]);
}

// 作業ツリーの全変更を一時 commit にして commit ID を返す。checkpoint ではなく、worktree 間で変更を受け渡すために使う
async function commitWork(dir: string): Promise<string> {
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '--allow-empty', '--no-verify', '-m', 'Harness work in progress']);
  return head(dir);
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
