import path from 'node:path';
import { fileURLToPath } from 'node:url';

// project 内で Harness が管理する状態ディレクトリ (gitignore 対象)
export const STATE_DIR = '.harness-state';

// project 内の Harness 関連ファイルのパス一覧
export type ProjectPaths = {
  root: string;
  spec: string; // PROJECT.md
  config: string; // .harness-config.json
  state: string; // 実行状態
  plan: string; // 実装計画 (Git 管理対象)
  lock: string; // 多重実行防止
  runs: string; // 実行記録 (§29)
  runtime: string; // Minecraft 実機環境 (server・MC Pilot home・配置記録)
};

// project root から ProjectPaths を組み立てる
export function projectPaths(root: string): ProjectPaths {
  const state = path.join(root, STATE_DIR);
  return {
    root,
    spec: path.join(root, 'PROJECT.md'),
    config: path.join(root, '.harness-config.json'),
    state: path.join(state, 'state.json'),
    plan: path.join(root, '.harness-plan.json'),
    lock: path.join(state, 'lock'),
    runs: path.join(state, 'runs'),
    runtime: path.join(state, 'runtime'),
  };
}

// Harness 本体のインストールディレクトリ。templates の参照元であり改変検出の対象 (§20)
export function harnessRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url));
}
