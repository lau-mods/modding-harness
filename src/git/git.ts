import type { Milestone } from '../plan/plan.js';

// Git コマンドを実行して stdout を返す。失敗は FatalError (§23)
export async function git(root: string, args: string[]): Promise<string> {
  throw new Error('Not implemented');
}

// 現在の HEAD commit を返す
export async function head(root: string): Promise<string> {
  throw new Error('Not implemented');
}

// 未 commit の変更 (untracked を含む) が無ければ true (§10.1)
export async function isClean(root: string): Promise<boolean> {
  throw new Error('Not implemented');
}

// commit が存在すれば true (§9.4 Progress と checkpoint の整合性)
export async function commitExists(root: string, commit: string): Promise<boolean> {
  throw new Error('Not implemented');
}

// .harness が submodule として登録され、checkout 済みで変更が無ければ true (§4.1, §10.1)
export async function harnessSubmoduleReady(root: string): Promise<boolean> {
  throw new Error('Not implemented');
}

// base commit から作業ツリーまでの差分 (untracked を含む) を返す。Code Review の入力 (§14.1)
export async function diffFrom(root: string, base: string): Promise<string> {
  throw new Error('Not implemented');
}

// base commit から変更されたファイル一覧 (untracked を含む) を返す
export async function changedFilesFrom(root: string, base: string): Promise<string[]> {
  throw new Error('Not implemented');
}

// 指定ファイルだけを commit し、commit ID を返す。仕様変更・plan 確定に使う (§9.6)
export async function commitFiles(root: string, files: string[], message: string): Promise<string> {
  throw new Error('Not implemented');
}

// Milestone・Features・Acceptance-Criteria を含む checkpoint commit メッセージを作る (§21.2)
export function checkpointMessage(milestone: Milestone, acIds: string[]): string {
  throw new Error('Not implemented');
}

// 作業ツリーの全変更を commit して checkpoint を作り、commit ID を返す (§21.2)
export async function createCheckpoint(root: string, milestone: Milestone, acIds: string[]): Promise<string> {
  throw new Error('Not implemented');
}

// 作業ツリーを指定 checkpoint の状態へ復元し、未追跡ファイルを削除する。Git 管理外の .harness-state は保持する。失敗は FatalError (§20.2, §23)
export async function restoreCheckpoint(root: string, commit: string): Promise<void> {
  throw new Error('Not implemented');
}
