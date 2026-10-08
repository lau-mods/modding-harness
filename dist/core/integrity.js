import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { FatalError } from './errors.js';
import { sha256 } from './fs.js';
import { harnessRoot, projectPaths } from './paths.js';
// 現在の Harness 本体と PROJECT.md の fingerprint を記録する
export async function captureBaseline(root) {
    return { harness: await fingerprintDir(harnessRoot()), spec: sha256(await readFile(projectPaths(root).spec)) };
}
// Harness 本体または PROJECT.md が開始時から変更されていれば FatalError を投げる。PROJECT.md の変更は harness chat でのみ許可する (§8, §20, §23)
export async function assertIntegrity(root, baseline) {
    if (await fingerprintDir(harnessRoot()) !== baseline.harness)
        throw new FatalError('Harness files were modified during the run');
    if (sha256(await readFile(projectPaths(root).spec)) !== baseline.spec)
        throw new FatalError('PROJECT.md was modified during development; product changes are applied with harness chat');
}
// ディレクトリ配下のファイルのパスと内容から fingerprint を作る。依存パッケージと Git 管理情報を除いて計算する
async function fingerprintDir(dir) {
    const entries = [];
    const walk = async (current) => {
        for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            if (['node_modules', '.git'].includes(entry.name))
                continue;
            const full = path.join(current, entry.name);
            if (entry.isDirectory())
                await walk(full);
            else if (entry.isFile())
                entries.push(`${path.relative(dir, full)}:${sha256(await readFile(full))}`);
        }
    };
    await walk(dir);
    return sha256(entries.join('\n'));
}
//# sourceMappingURL=integrity.js.map