// 開発実行中に変更を禁止する対象の、開始時点の fingerprint
export type IntegrityBaseline = {
  harness: string; // Harness 本体 (配布ファイル一式)
  spec: string; // PROJECT.md
};

// 現在の Harness 本体と PROJECT.md の fingerprint を記録する
export async function captureBaseline(root: string): Promise<IntegrityBaseline> {
  throw new Error('Not implemented');
}

// Harness 本体または PROJECT.md が開始時から変更されていれば FatalError を投げる。PROJECT.md の変更は harness chat でのみ許可する (§8, §20, §23)
export async function assertIntegrity(root: string, baseline: IntegrityBaseline): Promise<void> {
  throw new Error('Not implemented');
}
