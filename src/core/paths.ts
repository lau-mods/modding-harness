// project 内で Harness が管理する状態ディレクトリ (gitignore 対象)
export const STATE_DIR = '.harness-state';

// project 内の Harness 関連ファイルのパス一覧
export type ProjectPaths = {
  root: string;
  spec: string; // PROJECT.md
  config: string; // .harness-config.json
  state: string; // 実行状態
  plan: string; // 実装計画
  lock: string; // 多重実行防止
  runs: string; // 実行記録 (§29)
  milestones: string; // milestone 単位の一時成果物
};

// project root から ProjectPaths を組み立てる
export function projectPaths(root: string): ProjectPaths {
  throw new Error('Not implemented');
}

// milestone の一時成果物 (E2E 結果・screenshot・review 記録) のディレクトリ。rollback で初期化する (§18)
export function milestoneDir(root: string, milestone: string): string {
  throw new Error('Not implemented');
}

// Harness 本体のインストールディレクトリ。templates の参照元であり改変検出の対象 (§20)
export function harnessRoot(): string {
  throw new Error('Not implemented');
}
