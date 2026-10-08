// Workspace 内で Harness が状態を保持するディレクトリ (§4.1)
export const STATE_DIR = '.harness-state';

// Workspace 内の Harness 関連ファイルのパス一覧 (§4.1, §7)
export type ProjectPaths = {
  root: string;
  spec: string; // PROJECT.md
  config: string; // .harness-config.json
  plan: string; // .harness-state/plan.json (Git 管理)
  progress: string; // .harness-state/progress.json (Git 管理)
  runs: string; // .harness-state/runs/ (Git 管理外)
  runtime: string; // .harness-state/runtime/ (Git 管理外)
  lock: string; // develop の多重実行防止 (runtime/ 内)
  acceptance: string; // tests/acceptance.json
  e2e: string; // tests/e2e/
};

// Workspace root から ProjectPaths を組み立てる
export function projectPaths(root: string): ProjectPaths {
  throw new Error('Not implemented');
}

// Harness 本体 (.harness) のディレクトリを返す。templates の参照元であり改変検出の対象 (§4.2)
export function harnessRoot(): string {
  throw new Error('Not implemented');
}
