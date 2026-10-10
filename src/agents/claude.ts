import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FatalError } from '../core/errors.js';
import type { ScenarioResult } from '../e2e/scenario.js';
import type { Milestone, Plan } from '../plan/plan.js';
import type { IssueVerdict, ReviewFinding, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion, Feature } from '../spec/types.js';
import { agentFailure, outputSchema, runAgentProcess, validateOutput } from './agent.js';
import type { AgentCall, AgentRequest } from './agent.js';
import { codeRecheckPrompt, codeReviewPrompt, e2eRecheckPrompt, e2eReviewPrompt, planPrompt, specEditPrompt } from './prompts.js';

// 計画作成の入力 (§6.2)
export type PlanInput = { projectMarkdown: string; features: Feature[]; projectFiles: string[] };

// 仕様変更の入力 (§9.6)
export type SpecEditInput = { request: string; projectMarkdown: string };

// 仕様変更の結果。PROJECT.md 全文を返し、書き込みは Harness が行う (§9.6)
export type SpecEditOutput = { projectMarkdown: string; summary: string };

// Code Review の入力 (§14.1)
export type CodeReviewInput = {
  milestone: Milestone;
  criteria: AcceptanceCriterion[];
  diff: string; // 復元基点からの Git diff
  changedFiles: string[];
};

// E2E レビューの入力 (§17.1)
export type E2EReviewInput = {
  milestone: Milestone;
  criteria: AcceptanceCriterion[];
  scenarios: ScenarioResult[]; // screenshot と対象 AC を含む実行結果
};

// claude CLI の引数を組み立てる。読み取り専用 tool のみ許可する。画像は prompt に記載したパスを Read tool で開かせる
export function claudeArgs(call: AgentCall, request: AgentRequest): string[] {
  return [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(outputSchema(request.role)),
    '--tools', 'Read,Grep,Glob',
    '--permission-mode', 'dontAsk',
    ...(call.config.model ? ['--model', call.config.model] : []),
  ];
}

// claude CLI を実行して構造化出力を得る。失敗は FatalError (§23)
export async function runClaude<T>(call: AgentCall, request: AgentRequest): Promise<T> {
  await writeFile(path.join(call.logDir, 'prompt.md'), request.prompt);
  const result = await runAgentProcess(call, request.role, claudeArgs(call, request), request.prompt);
  let envelope: { subtype?: string; is_error?: boolean; structured_output?: unknown };
  try { envelope = JSON.parse(result.stdout) as typeof envelope; }
  catch { throw agentFailure(request.role, result); }
  if (result.code !== 0 || envelope.is_error || envelope.subtype !== 'success') throw agentFailure(request.role, result);
  if (envelope.structured_output === undefined) throw new FatalError(`Claude returned no structured output for ${request.role}`);
  return validateOutput<T>(request.role, envelope.structured_output);
}

// Feature を milestone に割り当てた計画案を Claude に作らせる (§6.2)
export async function proposePlan(call: AgentCall, input: PlanInput): Promise<Plan> {
  return runClaude<Plan>(call, { role: 'plan', prompt: planPrompt(input), images: [] });
}

// 製品要求を反映した PROJECT.md 案を Claude に作らせる (§9.6)
export async function editSpec(call: AgentCall, input: SpecEditInput): Promise<SpecEditOutput> {
  return runClaude<SpecEditOutput>(call, { role: 'spec_edit', prompt: specEditPrompt(input), images: [] });
}

// 初回 Code Review。発見したすべての指摘を列挙させる (§14.1)
export async function reviewCode(call: AgentCall, input: CodeReviewInput): Promise<ReviewFinding[]> {
  return (await runClaude<{ findings: ReviewFinding[] }>(call, { role: 'code_review', prompt: codeReviewPrompt(input), images: [] })).findings;
}

// Code Review の修正レビュー。固定済み指摘の解消状態だけを判定させる (§14.2)
export async function recheckCode(call: AgentCall, input: CodeReviewInput, issues: ReviewIssue[]): Promise<IssueVerdict[]> {
  return (await runClaude<{ verdicts: IssueVerdict[] }>(call, { role: 'code_recheck', prompt: codeRecheckPrompt(input, issues), images: [] })).verdicts;
}

// 初回 E2E レビュー。screenshot から表示上の問題を列挙させる (§17.1)
export async function reviewE2E(call: AgentCall, input: E2EReviewInput): Promise<ReviewFinding[]> {
  return (await runClaude<{ findings: ReviewFinding[] }>(call, { role: 'e2e_review', prompt: e2eReviewPrompt(input), images: [] })).findings;
}

// E2E の修正レビュー。固定済み指摘の解消状態だけを判定させる (§17.2)
export async function recheckE2E(call: AgentCall, input: E2EReviewInput, issues: ReviewIssue[]): Promise<IssueVerdict[]> {
  return (await runClaude<{ verdicts: IssueVerdict[] }>(call, { role: 'e2e_recheck', prompt: e2eRecheckPrompt(input, issues), images: [] })).verdicts;
}
