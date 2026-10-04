import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BuildResult } from '../build/gradle.js';
import { ExecutionFailure } from '../core/errors.js';
import type { E2EFailureReport } from '../e2e/e2e.js';
import type { Milestone } from '../plan/plan.js';
import type { IssueResponse, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import { AGENT_TIMEOUT_MS, classifyAgentFailure, outputSchema, validateOutput } from './agent.js';
import type { AgentCall, AgentRequest, AgentResult } from './agent.js';
import { implementationPrompt } from './prompts.js';

// Codex に渡す実装・修正の入力 (§8)
export type ImplementationInput = {
  milestone: Milestone;
  criteria: AcceptanceCriterion[];
  projectMarkdown: string;
  relatedFiles: string[]; // 現在の関連ソース (Codex は workspace 上で直接読む)
  buildFailure: BuildResult | null; // 直前の compile / build 失敗 (§9)
  codeIssues: ReviewIssue[]; // 未解決のコードレビュー指摘
  visualIssues: ReviewIssue[]; // 未解決の画面確認指摘
  e2eFailure: E2EFailureReport | null; // 直前の E2E 結果 (§19)
};

// Codex による実装の結果。ファイルは Codex が workspace 上で直接編集する
export type ImplementationOutput = { summary: string; changedFiles: string[]; responses: IssueResponse[] };

// Codex CLI の引数を組み立てる。project root への書き込みを許可する
export function codexArgs(call: AgentCall, request: AgentRequest, schemaFile: string, outputFile: string): string[] {
  return [
    'exec',
    ...request.images.flatMap(image => ['--image', image]),
    '--sandbox', 'workspace-write', '--skip-git-repo-check', '--ephemeral',
    '-c', 'approval_policy="never"',
    '--cd', call.root,
    ...(call.config.model ? ['--model', call.config.model] : []),
    '--output-schema', schemaFile,
    '--output-last-message', outputFile,
    '-',
  ];
}

// Codex CLI を実行して構造化出力を得る。失敗は ExecutionFailure / FatalError に分類する (§17, §20)
export async function runCodex<T>(call: AgentCall, request: AgentRequest): Promise<AgentResult<T>> {
  const schemaFile = path.join(call.logDir, 'schema.json');
  const outputFile = path.join(call.logDir, 'output.json');
  await writeFile(schemaFile, JSON.stringify(outputSchema(request.role), null, 2));
  await writeFile(path.join(call.logDir, 'prompt.md'), request.prompt);
  const result = await call.runner(call.config.command, codexArgs(call, request, schemaFile, outputFile), { cwd: call.root, input: request.prompt, logDir: call.logDir, timeoutMs: AGENT_TIMEOUT_MS });
  if (result.code !== 0) throw classifyAgentFailure(request.role, result);
  let value: unknown;
  try { value = JSON.parse(await readFile(outputFile, 'utf8')); }
  catch (error) { throw new ExecutionFailure(`Codex returned no structured output: ${(error as Error).message}`); }
  return { output: validateOutput<T>(request.role, value), sessionId: null };
}

// milestone の実装、または build 失敗・レビュー指摘・画面指摘・E2E 失敗の修正を Codex に依頼する (§8, §9, §11, §16, §19)
export async function implement(call: AgentCall, input: ImplementationInput): Promise<ImplementationOutput> {
  const images = input.e2eFailure?.screenshots ?? [];
  return (await runCodex<ImplementationOutput>(call, { role: 'implementation', prompt: implementationPrompt(input), images, sessionId: null })).output;
}
