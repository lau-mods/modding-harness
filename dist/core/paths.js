import path from 'node:path';
import { fileURLToPath } from 'node:url';
// project 内で Harness が管理する状態ディレクトリ (gitignore 対象)
export const STATE_DIR = '.harness-state';
// project root から ProjectPaths を組み立てる
export function projectPaths(root) {
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
export function harnessRoot() {
    return fileURLToPath(new URL('../../', import.meta.url));
}
//# sourceMappingURL=paths.js.map