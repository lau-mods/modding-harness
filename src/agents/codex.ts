import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CodexConfig, ProviderConfig } from '../config/config.js';
import type { FailureReport } from '../core/errors.js';
import { FatalError } from '../core/errors.js';
import type { Milestone } from '../plan/plan.js';
import type { IssueResponse, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion, Feature } from '../spec/types.js';
import { agentFailure, outputSchema, runAgentProcess, validateOutput } from './agent.js';
import type { AgentCall, AgentRequest } from './agent.js';
import { implementationPrompt } from './prompts.js';

// Codex に渡す実装・修正の入力 (§11)
export type ImplementationInput = {
  projectMarkdown: string; // PROJECT.md 全文
  milestone: Milestone;
  features: Feature[];
  criteria: AcceptanceCriterion[];
  relatedFiles: string[]; // 関連ソース (Codex は Workspace 上で直接読む)
  failure: FailureReport | null; // 修正時の実行失敗情報 (§13, §15.4, §19.2)
  codeIssues: ReviewIssue[]; // open の Code Review 指摘 (§14.2)
  e2eIssues: ReviewIssue[]; // open の E2E 指摘 (§17.2)
};

// Codex による実装・修正の結果。ファイルは Codex が Workspace 上で直接編集する
export type ImplementationOutput = { summary: string; changedFiles: string[]; responses: IssueResponse[] };

// Codex CLI の引数を組み立てる。Workspace への書き込みを許可する
export function codexArgs(call: AgentCall<CodexConfig>, request: AgentRequest, schemaFile: string, outputFile: string): string[] {
  return [
    'exec',
    ...request.images.flatMap(image => ['--image', image]),
    '--sandbox', 'workspace-write', '--skip-git-repo-check', '--ephemeral',
    '-c', 'approval_policy="never"',
    '--cd', call.root,
    ...(call.config.model ? ['--model', call.config.model] : []),
    ...(call.config.effort ? ['-c', `model_reasoning_effort="${call.config.effort}"`] : []),
    ...(call.config.fast ? ['-c', 'service_tier="priority"'] : []),
    ...providerArgs(call.config.provider),
    '--output-schema', schemaFile,
    '--output-last-message', outputFile,
    '-',
  ];
}

// provider を ~/.codex/config.toml に書かずに、Codex の設定の上書きとして定義して選ぶ
function providerArgs(provider: ProviderConfig | null): string[] {
  if (!provider) return [];
  const definition = { name: provider.id, base_url: provider.baseUrl, wire_api: 'responses', env_key: provider.envKey };
  return [
    '-c', `model_provider=${JSON.stringify(provider.id)}`,
    ...Object.entries(definition).flatMap(([key, value]) => ['-c', `model_providers.${provider.id}.${key}=${JSON.stringify(value)}`]),
  ];
}

// Codex CLI を実行して構造化出力を得る。失敗は FatalError (§23)
export async function runCodex<T>(call: AgentCall<CodexConfig>, request: AgentRequest): Promise<T> {
  const schemaFile = path.join(call.logDir, 'schema.json');
  const outputFile = path.join(call.logDir, 'output.json');
  await writeFile(schemaFile, JSON.stringify(outputSchema(request.role), null, 2));
  await writeFile(path.join(call.logDir, 'prompt.md'), request.prompt);
  const result = await runAgentProcess(call, request.role, codexArgs(call, request, schemaFile, outputFile), request.prompt);
  if (result.code !== 0) throw agentFailure(request.role, result);
  let value: unknown;
  try { value = JSON.parse(await readFile(outputFile, 'utf8')); }
  catch (error) { throw new FatalError(`Codex returned no structured output: ${(error as Error).message}`); }
  return validateOutput<T>(request.role, value);
}

// milestone の実装、または実行失敗・レビュー指摘の修正を Codex に依頼する。失敗や E2E 指摘の screenshot は画像として添付する (§11, §14.2, §17.2, §19.2)
export async function implement(call: AgentCall<CodexConfig>, input: ImplementationInput): Promise<ImplementationOutput> {
  const images = [...input.failure?.screenshots ?? [], ...input.e2eIssues.map(issue => issue.target)];
  return runCodex<ImplementationOutput>(call, { role: 'implementation', prompt: implementationPrompt(input), images: [...new Set(images)] });
}
