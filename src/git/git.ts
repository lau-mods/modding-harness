// Harness が許可した Git 操作を実行して stdout を返す。remote 操作は行わない
export async function git(root: string, args: string[]): Promise<string> {
  throw new Error('Not implemented');
}

// 現在の HEAD commit を返す
export async function head(root: string): Promise<string> {
  throw new Error('Not implemented');
}

// 未 commit の変更 (untracked を含む) が無ければ true
export async function isClean(root: string): Promise<boolean> {
  throw new Error('Not implemented');
}

// base commit から作業ツリーまでの差分 (untracked を含む) を返す。コードレビューの入力 (§10)
export async function diffFrom(root: string, base: string): Promise<string> {
  throw new Error('Not implemented');
}

// base commit から変更されたファイル一覧 (untracked を含む) を返す
export async function changedFilesFrom(root: string, base: string): Promise<string[]> {
  throw new Error('Not implemented');
}

// Harness-Milestone / Harness-AC trailer を含む checkpoint commit メッセージを作る (§21)
export function checkpointMessage(milestone: string, acIds: string[]): string {
  throw new Error('Not implemented');
}

// 作業ツリーの全変更を commit して checkpoint を作り、commit ID を返す (§21)
export async function createCheckpoint(root: string, milestone: string, acIds: string[]): Promise<string> {
  throw new Error('Not implemented');
}

// harness chat による PROJECT.md の変更を commit し、commit ID を返す (§23)
export async function commitSpec(root: string, message: string): Promise<string> {
  throw new Error('Not implemented');
}

// 作業ツリーを指定 commit の状態へ復元する (.harness-state は保持)。失敗時は FatalError (§18, §20)
export async function restoreCommit(root: string, commit: string): Promise<void> {
  throw new Error('Not implemented');
}
