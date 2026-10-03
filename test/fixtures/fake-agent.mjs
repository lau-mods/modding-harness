#!/usr/bin/env node
// Codex / Claude CLI の代わりに、FAKE_SCRIPT の応答を順番に返す。呼び出し内容は FAKE_STATE/calls.jsonl に記録する
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const prompt = readFileSync(0, 'utf8');
const script = JSON.parse(readFileSync(process.env.FAKE_SCRIPT, 'utf8'));
const stateDir = process.env.FAKE_STATE;
const option = name => args[args.indexOf(name) + 1];

function next(key, list) {
  const file = path.join(stateDir, `counter-${key}`);
  const index = existsSync(file) ? Number(readFileSync(file, 'utf8')) : 0;
  writeFileSync(file, String(index + 1));
  if (!list || index >= list.length) {
    process.stderr.write(`fake agent: no scripted response for ${key} #${index}\n`);
    process.exit(9);
  }
  return list[index];
}

function finish(step) {
  if (step.stderr) process.stderr.write(step.stderr);
  if (step.exit) process.exit(step.exit);
}

if (args[0] === 'exec') {
  const root = option('--cd');
  const step = next('codex', script.codex);
  appendFileSync(path.join(stateDir, 'calls.jsonl'), JSON.stringify({ agent: 'codex', args, prompt }) + '\n');
  for (const [file, content] of Object.entries(step.files ?? {})) {
    const target = path.join(root, file);
    if (content === null) rmSync(target, { force: true });
    else { mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, content); }
  }
  finish(step);
  writeFileSync(option('--output-last-message'), JSON.stringify(step.output ?? { summary: 'done', changedFiles: [], responses: [] }));
} else {
  const schema = JSON.parse(option('--json-schema'));
  const keys = Object.keys(schema.properties);
  const visual = /screenshots/.test(prompt.split('\n')[0]);
  const role = keys.includes('milestones') ? 'plan'
    : keys.includes('projectMarkdown') ? 'spec_edit'
    : keys.includes('findings') ? (visual ? 'visual_review' : 'code_review')
    : (visual ? 'visual_recheck' : 'code_recheck');
  const resume = args.includes('--resume') ? option('--resume') : null;
  appendFileSync(path.join(stateDir, 'calls.jsonl'), JSON.stringify({ agent: 'claude', role, resume, args, prompt }) + '\n');
  const step = next(`claude-${role}`, script.claude?.[role]);
  finish(step);
  const sessionId = resume ?? `session-${role}-${Date.now()}`;
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: sessionId, structured_output: step.output }));
}
