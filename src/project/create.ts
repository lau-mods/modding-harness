import { mkdir, mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exists, safePath } from '../io.js';
import { success } from '../process.js';
import { gitProcess } from '../git/git.js';
import { initProject } from './project.js';

export async function createProject(destination: string, templateRepo: string, templateRef: string): Promise<void> {
  if (await exists(destination)) throw new Error(`Destination already exists: ${destination}`);
  if (templateRepo.startsWith('-') || templateRef.startsWith('-')) throw new Error('Repository/ref must not begin with -');
  if (templateRepo.startsWith('./') || templateRepo.startsWith('../')) templateRepo = path.resolve(templateRepo);
  const temporary = await mkdtemp(path.join(tmpdir(), 'harness-create-'));
  try {
    const repo = path.join(temporary, 'template');
    // Network reads are confined to this explicitly requested bootstrap operation.
    success(await gitProcess(temporary, ['clone', '--no-checkout', '--', templateRepo, repo]), 'Template clone');
    let revision: string;
    if (/^[a-f0-9]{7,40}$/i.test(templateRef) || templateRef.startsWith('refs/')) {
      revision = success(await gitProcess(repo, ['rev-parse', '--verify', `${templateRef}^{commit}`]), 'Template ref').stdout.trim();
    } else {
      const refs = success(await gitProcess(repo, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin', 'refs/tags']), 'Template refs').stdout.trim().split('\n');
      const branches = refs.filter(ref => ref === `refs/heads/${templateRef}` || ref === `refs/remotes/origin/${templateRef}`);
      const tag = refs.includes(`refs/tags/${templateRef}`);
      if ((branches.length ? 1 : 0) + (tag ? 1 : 0) !== 1) throw new Error(`Template ref is missing or ambiguous: ${templateRef}; use a commit or fully qualified ref`);
      const exact = tag ? `refs/tags/${templateRef}` : branches[0]!;
      revision = success(await gitProcess(repo, ['rev-parse', '--verify', `${exact}^{commit}`]), 'Template ref').stdout.trim();
    }
    const entries = success(await gitProcess(repo, ['ls-tree', '-rz', revision]), 'Template tree').stdout.split('\0').filter(Boolean);
    await mkdir(destination, { recursive: false });
    for (const entry of entries) {
      const match = entry.match(/^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/);
      if (!match) throw new Error('Template must contain regular files only (no embedded submodules or symlinks)');
      const [, mode, object, file] = match as [string, string, string, string];
      if (/^(\.git(?:\/|$)|\.harness(?:\/|$)|\.harness-state(?:\/|$))/.test(file)) throw new Error(`Template contains reserved path ${file}`);
      const target = await safePath(destination, file);
      const { stdout } = success(await gitProcess(repo, ['cat-file', 'blob', object], { stdoutEncoding: 'base64' }), 'Template blob');
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(stdout, 'base64'), { flag: 'wx' });
      await chmod(target, mode === '100755' ? 0o755 : 0o644);
    }
    success(await gitProcess(destination, ['init']), 'Independent Git repository');
    success(await gitProcess(destination, ['submodule', 'add', '--', 'https://github.com/lau-mods/modding-harness.git', '.harness']), 'Harness submodule');
    await initProject(destination);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
