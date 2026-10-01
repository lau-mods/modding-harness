import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { snapshot } from '../git/git.js';
import { exists, safePath, save, json } from '../io.js';
import { run, success } from '../process.js';
import type { Runner } from '../process.js';
import { harnessRoot, schema, validateSchema } from '../schema.js';
import type { AgentConfig } from '../project/config.js';

export type Review = { verdict: 'pass' | 'changes_required'; issues: { severity: 'blocking' | 'major' | 'minor'; initialIssue?: number | null; category: string; file: string; lines: string; reason: string; requiredChange: string }[] };
export type Changes = { changes: { path: string; content: string | null; encoding: 'utf8' | 'base64' }[] };

export function codexOutputSchema(name: string): unknown {
  // The Responses structured-output subset excludes uniqueItems; local Ajv still enforces it.
  return JSON.parse(JSON.stringify(schema(name), (key, value: unknown) => key === 'uniqueItems' ? undefined : value)) as unknown;
}

export function codexArgs(model: string | null, schemaPath: string, output: string): string[] {
  return ['exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--sandbox', 'read-only', '--skip-git-repo-check',
    '-c', 'approval_policy="never"', '-c', 'web_search="disabled"',
    ...['shell_tool', 'unified_exec', 'shell_snapshot', 'plugins', 'apps', 'hooks', 'multi_agent', 'browser_use', 'computer_use', 'code_mode', 'code_mode_host'].flatMap(feature => ['--disable', feature]),
    ...(model ? ['--model', model] : []), '--output-schema', schemaPath, '--output-last-message', output, '-'];
}
export function claudeArgs(model: string | null): string[] {
  return ['--print', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--safe-mode', '--restricted',
    '--tools', 'Read', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '',
    '--settings', '{"disableAllHooks":true}', '--no-session-persistence', '--output-format', 'json',
    '--json-schema', JSON.stringify(schema('review')), ...(model ? ['--model', model] : [])];
}
export function parseReview(output: string): Review {
  const envelope = JSON.parse(output) as { subtype?: string; is_error?: boolean; structured_output?: unknown };
  if (envelope.subtype !== 'success' || envelope.is_error || !envelope.structured_output) throw new Error('Claude did not return a successful structured review');
  const review = validateSchema<Review>('review', envelope.structured_output);
  if (review.verdict === 'pass' && review.issues.some(issue => issue.severity !== 'minor')) throw new Error('Review pass contradicts blocking/major issues');
  if (review.verdict === 'changes_required' && !review.issues.length) throw new Error('Changes-required review needs issues');
  return review;
}

export async function callAgent(root: string, config: AgentConfig, role: 'spec-edit' | 'plan' | 'implementation' | 'review' | 'visual', context: unknown, artifact: string, runner: Runner = run, images: string[] = []): Promise<unknown> {
  const dir = await mkdtemp(path.join(tmpdir(), 'harness-agent-'));
  const reviewer = role === 'review' || role === 'visual';
  let processResult: unknown, result: unknown, failure: unknown;
  try {
    for (const [i, file] of images.entries()) await copyFile(file, path.join(dir, `screenshot-${i + 1}.png`));
    const policy = await readFile(path.join(harnessRoot, `prompts/${role}.txt`), 'utf8');
    const input = `${policy}\n\n${json(context)}\n${images.length ? 'Read each attached screenshot-N.png using Read before returning the review.' : ''}`;
    if (input.length > 1_000_000) throw new Error('Agent context exceeds 1 MB; narrow the milestone sourceFiles');
    const schemaFile = path.join(dir, 'schema.json'), output = path.join(dir, 'output.json');
    if (!reviewer) await writeFile(schemaFile, json(codexOutputSchema(role)));
    const before = await snapshot(root);
    try {
      const args = reviewer ? claudeArgs(config.model) : codexArgs(config.model, schemaFile, output);
      const execution = await runner(config.command, args, { cwd: dir, input, timeoutMs: 1_800_000 });
      processResult = execution;
      success(execution, `${role} agent`);
      result = reviewer ? parseReview(execution.stdout) : validateSchema(role, JSON.parse(await readFile(output, 'utf8')));
    } finally {
      if (before !== await snapshot(root)) throw new Error(`${role} agent modified project files, Harness state, or Git metadata; changes preserved for inspection`);
    }
  } catch (error) { failure = error; }
  finally {
    await save(artifact, { role, result: result ?? null, process: processResult ?? null, error: failure instanceof Error ? failure.message : null });
    await rm(dir, { recursive: true, force: true });
  }
  if (failure) throw failure;
  return result;
}

export function allowedImplementationPath(file: string): boolean {
  return /^(?:src\/|tests\/|build\.gradle(?:\.kts)?$|settings\.gradle(?:\.kts)?$|gradle\.properties$)/.test(file);
}
export async function applyChanges(root: string, value: unknown): Promise<void> {
  const changes = validateSchema<Changes>('implementation', value).changes;
  const paths = new Set<string>();
  const prepared: { path: string; content: Buffer | null }[] = [];
  for (const change of changes) {
    const file = await safePath(root, change.path);
    if (!allowedImplementationPath(change.path)) throw new Error(`Implementation Agent attempted forbidden path: ${change.path}`);
    if (paths.has(change.path)) throw new Error(`Duplicate file change: ${change.path}`);
    paths.add(change.path);
    if (await exists(file) && !(await lstat(file)).isFile()) throw new Error(`Change target is not a regular file: ${change.path}`);
    if (change.content !== null && change.encoding === 'base64' && Buffer.from(change.content, 'base64').toString('base64') !== change.content) throw new Error(`Noncanonical base64: ${change.path}`);
    prepared.push({ path: file, content: change.content === null ? null : Buffer.from(change.content, change.encoding) });
  }
  for (const change of prepared) {
    if (change.content === null) { if (await exists(change.path)) await rm(change.path); }
    else { await mkdir(path.dirname(change.path), { recursive: true }); await writeFile(change.path, change.content); }
  }
}

export async function sourceContext(root: string, files: string[]): Promise<Record<string, string | null>> {
  const sources: Record<string, string | null> = {};
  let total = 0;
  for (const file of [...new Set(files)]) {
    const full = await safePath(root, file);
    if (!allowedImplementationPath(file)) throw new Error(`Source context path is not an allowed implementation path: ${file}`);
    if (!await exists(full)) { sources[file] = null; continue; }
    const data = await readFile(full);
    const content = data.includes(0) ? `[binary file; ${data.length} bytes]` : data.toString('utf8');
    total += Buffer.byteLength(content);
    if (total > 800_000) throw new Error('Relevant source context exceeds 800 KB; narrow sourceFiles');
    sources[file] = content;
  }
  return sources;
}
