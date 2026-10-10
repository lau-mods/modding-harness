import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const state = path.join(root, STATE_DIR);
  const runtime = path.join(state, 'runtime');
  return {
    root,
    spec: path.join(root, 'PROJECT.md'),
    config: path.join(root, '.harness-config.json'),
    plan: path.join(state, 'plan.json'),
    progress: path.join(state, 'progress.json'),
    runs: path.join(state, 'runs'),
    runtime,
    lock: path.join(runtime, 'harness.lock'),
    acceptance: path.join(root, 'tests', 'acceptance.json'),
    e2e: path.join(root, 'tests', 'e2e'),
  };
}

// Harness 本体 (.harness) のディレクトリを返す。templates の参照元であり改変検出の対象 (§4.2)
export function harnessRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url));
}
