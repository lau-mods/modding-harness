import type { ScenarioResult } from '../e2e/scenario.js';
import type { Milestone } from '../plan/plan.js';
import type { IssueVerdict, ReviewFinding, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { AgentCall, AgentRequest, AgentResult } from './agent.js';

// 計画作成の入力 (§6)
export type PlanInput = { projectMarkdown: string; criteria: AcceptanceCriterion[]; projectFiles: string[] };

// Claude が提案する計画案。検証は Harness 側で行う
export type PlanProposal = { milestones: Milestone[] };

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
  throw new Error('Not implemented');
}

// claude CLI を実行して構造化出力と session ID を得る。失敗は ExecutionFailure / FatalError に分類する (§17, §20)
export async function runClaude<T>(call: AgentCall, request: AgentRequest): Promise<AgentResult<T>> {
  throw new Error('Not implemented');
}

// active AC を milestone に割り当てた計画案を Claude に作成させる (§6)
export async function proposePlan(call: AgentCall, input: PlanInput): Promise<PlanProposal> {
  throw new Error('Not implemented');
}

// 仕様変更要求を反映した PROJECT.md 案を Claude に作成させる (§23)
export async function editSpec(call: AgentCall, input: SpecEditInput): Promise<SpecEditOutput> {
  throw new Error('Not implemented');
}

// 初回コードレビュー。認識できる指摘を一括で列挙させる (§10)
export async function reviewCode(call: AgentCall, input: CodeReviewInput): Promise<AgentResult<ReviewFinding[]>> {
  throw new Error('Not implemented');
}

// コード再レビュー。初回指摘の解消状態だけを判定させる (§10)
export async function recheckCode(call: AgentCall, input: CodeReviewInput, issues: ReviewIssue[], sessionId: string | null): Promise<AgentResult<IssueVerdict[]>> {
  throw new Error('Not implemented');
}

// 初回画面確認。screenshot から認識できる視覚上の問題を一括で列挙させる (§15)
export async function reviewVisual(call: AgentCall, input: VisualReviewInput): Promise<AgentResult<ReviewFinding[]>> {
  throw new Error('Not implemented');
}

// 画面再確認。初回指摘の解消状態だけを判定させる (§15)
export async function recheckVisual(call: AgentCall, input: VisualReviewInput, issues: ReviewIssue[], sessionId: string | null): Promise<AgentResult<IssueVerdict[]>> {
  throw new Error('Not implemented');
}
