import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ExecutionFailure } from '../core/errors.js';
import type { ScenarioResult } from '../e2e/scenario.js';
import type { Milestone, Plan } from '../plan/plan.js';
import type { IssueVerdict, ReviewFinding, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import { AGENT_TIMEOUT_MS, classifyAgentFailure, outputSchema, validateOutput } from './agent.js';
import type { AgentCall, AgentRequest, AgentResult } from './agent.js';
import { codeRecheckPrompt, codeReviewPrompt, planPrompt, specEditPrompt, visualRecheckPrompt, visualReviewPrompt } from './prompts.js';

// 計画作成の入力 (§6)
export type PlanInput = { projectMarkdown: string; criteria: AcceptanceCriterion[]; projectFiles: string[] };

// Claude が提案する計画案。検証は Harness 側で行う
export type PlanProposal = Pick<Plan, 'milestones' | 'excluded'>;

// 仕様変更の入力 (§23)
export type SpecEditInput = { request: string; projectMarkdown: string };

// 仕様変更の結果。PROJECT.md 全文を返し、書き込みは Harness が行う
export type SpecEditOutput = { projectMarkdown: string; summary: string };

// コードレビューの入力 (§10)
export type CodeReviewInput = {
  milestone: Milestone;
  criteria: AcceptanceCriterion[];
  diff: string; // 直前 checkpoint からの Git diff
  changedFiles: string[]; // 変更された source / resource
  scenarioFiles: string[]; // E2E scenario
};

// 画面確認の入力 (§15)
export type VisualReviewInput = {
  milestone: Milestone;
  criteria: AcceptanceCriterion[];
  screenshots: string[];
  results: ScenarioResult[];
};

// claude CLI の引数を組み立てる。全役割で読み取り専用 tool のみ許可し、sessionId があれば session を継続する
export function claudeArgs(call: AgentCall, request: AgentRequest): string[] {
  return [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(outputSchema(request.role)),
    '--tools', 'Read,Grep,Glob',
    '--permission-mode', 'dontAsk',
    ...(call.config.model ? ['--model', call.config.model] : []),
    ...(request.sessionId ? ['--resume', request.sessionId] : []),
  ];
}

// claude CLI を実行して構造化出力と session ID を得る。失敗は ExecutionFailure / FatalError に分類する (§17, §20)
export async function runClaude<T>(call: AgentCall, request: AgentRequest): Promise<AgentResult<T>> {
  await writeFile(path.join(call.logDir, 'prompt.md'), request.prompt);
  const result = await call.runner(call.config.command, claudeArgs(call, request), { cwd: call.root, input: request.prompt, logDir: call.logDir, timeoutMs: AGENT_TIMEOUT_MS });
  let envelope: { subtype?: string; is_error?: boolean; session_id?: string; structured_output?: unknown };
  try { envelope = JSON.parse(result.stdout) as typeof envelope; }
  catch { throw classifyAgentFailure(request.role, result); }
  if (result.code !== 0 || envelope.is_error || envelope.subtype !== 'success') throw classifyAgentFailure(request.role, result);
  if (envelope.structured_output === undefined) throw new ExecutionFailure('Claude returned no structured output');
  return { output: validateOutput<T>(request.role, envelope.structured_output), sessionId: envelope.session_id ?? null };
}

// active AC を milestone に割り当てた計画案を Claude に作成させる (§6)
export async function proposePlan(call: AgentCall, input: PlanInput): Promise<PlanProposal> {
  return (await runClaude<PlanProposal>(call, { role: 'plan', prompt: planPrompt(input), images: [], sessionId: null })).output;
}

// 仕様変更要求を反映した PROJECT.md 案を Claude に作成させる (§23)
export async function editSpec(call: AgentCall, input: SpecEditInput): Promise<SpecEditOutput> {
  return (await runClaude<SpecEditOutput>(call, { role: 'spec_edit', prompt: specEditPrompt(input), images: [], sessionId: null })).output;
}

// 初回コードレビュー。認識できる指摘を一括で列挙させる (§10)
export async function reviewCode(call: AgentCall, input: CodeReviewInput): Promise<AgentResult<ReviewFinding[]>> {
  const result = await runClaude<{ findings: ReviewFinding[] }>(call, { role: 'code_review', prompt: codeReviewPrompt(input), images: [], sessionId: null });
  return { output: result.output.findings, sessionId: result.sessionId };
}

// コード再レビュー。初回指摘の解消状態だけを判定させる (§10)
export async function recheckCode(call: AgentCall, input: CodeReviewInput, issues: ReviewIssue[], sessionId: string | null): Promise<AgentResult<IssueVerdict[]>> {
  const result = await runClaude<{ verdicts: IssueVerdict[] }>(call, { role: 'code_recheck', prompt: codeRecheckPrompt(input, issues), images: [], sessionId });
  return { output: result.output.verdicts, sessionId: result.sessionId };
}

// 初回画面確認。screenshot から認識できる視覚上の問題を一括で列挙させる。screenshot は prompt のパスから Read tool で開く (§15)
export async function reviewVisual(call: AgentCall, input: VisualReviewInput): Promise<AgentResult<ReviewFinding[]>> {
  const result = await runClaude<{ findings: ReviewFinding[] }>(call, { role: 'visual_review', prompt: visualReviewPrompt(input), images: [], sessionId: null });
  return { output: result.output.findings, sessionId: result.sessionId };
}

// 画面再確認。初回指摘の解消状態だけを判定させる (§15)
export async function recheckVisual(call: AgentCall, input: VisualReviewInput, issues: ReviewIssue[], sessionId: string | null): Promise<AgentResult<IssueVerdict[]>> {
  const result = await runClaude<{ verdicts: IssueVerdict[] }>(call, { role: 'visual_recheck', prompt: visualRecheckPrompt(input, issues), images: [], sessionId });
  return { output: result.output.verdicts, sessionId: result.sessionId };
}
