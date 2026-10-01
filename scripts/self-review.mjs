import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callAgent } from '../dist/agents/agents.js';
import { walk } from '../dist/io.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = await mkdtemp(path.join(tmpdir(), 'harness-self-review-'));
const sources = {};
for (const name of ['src', 'schemas', 'prompts', 'test', 'docs', '.github']) {
  await cp(path.join(root, name), path.join(snapshot, name), { recursive: true });
  for (const file of await walk(path.join(root, name))) sources[`${name}/${file}`] = await readFile(path.join(root, name, file), 'utf8');
}
for (const file of ['package.json', 'tsconfig.json', 'README.md', '.gitignore']) {
  await cp(path.join(root, file), path.join(snapshot, file));
  sources[file] = await readFile(path.join(root, file), 'utf8');
}
execFileSync('git', ['init'], { cwd: snapshot, stdio: 'ignore' });
await mkdir(path.join(snapshot, '.harness-state'), { recursive: true });
console.log(`Read-only review snapshot: ${snapshot}`);
const result = await callAgent(snapshot, { command: 'claude', model: null }, 'review', {
  task: 'Review the Modding Harness implementation itself against docs/harness-impl.md. Identify concrete correctness/security/state/verification/source-of-truth violations and unnecessary abstractions. This is Harness code, not a Mod. Treat actual external validation gaps as limitations, not as simulated successes. Do not modify any files.',
  sources,
}, path.join(snapshot, '.harness-state/self-review.json'));
console.log(JSON.stringify(result, null, 2));
console.log(`Full review record: ${snapshot}/.harness-state/self-review.json`);
