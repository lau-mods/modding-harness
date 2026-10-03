import { FatalError } from '../core/errors.js';
import { requireSuccess, run } from '../core/process.js';

const MAX_DIFF_LENGTH = 200_000;

// Git コマンドを実行して stdout を返す。失敗は ExecutionFailure
export async function git(root: string, args: string[]): Promise<string> {
  return requireSuccess(await run('git', args, { cwd: root }), `git ${args[0]}`).stdout;
}

// 現在の HEAD commit を返す
export async function head(root: string): Promise<string> {
  return (await git(root, ['rev-parse', 'HEAD'])).trim();
}

// 未 commit の変更 (untracked を含む) が無ければ true
export async function isClean(root: string): Promise<boolean> {
  return (await git(root, ['status', '--porcelain'])).trim() === '';
}

// base commit から作業ツリーまでの差分 (untracked を含む) を返す。コードレビューの入力 (§10)
export async function diffFrom(root: string, base: string): Promise<string> {
  await git(root, ['add', '-A']);
  const diff = await git(root, ['diff', '--cached', base]);
  return diff.length > MAX_DIFF_LENGTH ? `${diff.slice(0, MAX_DIFF_LENGTH)}\n[diff truncated; read the changed files directly]` : diff;
}

// base commit から変更されたファイル一覧 (untracked を含む) を返す
export async function changedFilesFrom(root: string, base: string): Promise<string[]> {
  await git(root, ['add', '-A']);
  return (await git(root, ['diff', '--cached', '--name-only', base])).split('\n').filter(Boolean);
}

// Harness-Milestone / Harness-AC trailer を含む checkpoint commit メッセージを作る (§21)
export function checkpointMessage(milestone: string, acIds: string[]): string {
  return `harness: checkpoint ${milestone}\n\nHarness-Milestone: ${milestone}\nHarness-AC: ${acIds.join(', ')}\n`;
}

// 作業ツリーの全変更を commit して checkpoint を作り、commit ID を返す (§21)
export async function createCheckpoint(root: string, milestone: string, acIds: string[]): Promise<string> {
  await git(root, ['add', '-A']);
  await git(root, ['commit', '--allow-empty', '-m', checkpointMessage(milestone, acIds)]);
  return head(root);
}

// harness chat による PROJECT.md の変更を commit し、commit ID を返す (§23)
export async function commitSpec(root: string, message: string): Promise<string> {
  await git(root, ['add', 'PROJECT.md']);
  await git(root, ['commit', '-m', message, '--', 'PROJECT.md']);
  return head(root);
}

// 作業ツリーを指定 commit の状態へ復元する。gitignore 対象の .harness-state は保持される。失敗時は FatalError (§18, §20)
export async function restoreCommit(root: string, commit: string): Promise<void> {
  try {
    await git(root, ['reset', '--hard', commit]);
    await git(root, ['clean', '-fd']);
  } catch (error) {
    throw new FatalError(`Cannot restore checkpoint ${commit}: ${(error as Error).message}`);
  }
}
