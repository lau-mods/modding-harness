import type { ScenarioResult } from '../e2e/scenario.js';
import type { Milestone, Plan } from '../plan/plan.js';
import type { IssueVerdict, ReviewFinding, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion, Feature } from '../spec/types.js';
import type { AgentCall, AgentRequest } from './agent.js';

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

// claude CLI の引数を組み立てる。読み取り専用 tool のみ許可する
export function claudeArgs(call: AgentCall, request: AgentRequest): string[] {
  throw new Error('Not implemented');
}

// claude CLI を実行して構造化出力を得る。失敗は FatalError (§23)
export async function runClaude<T>(call: AgentCall, request: AgentRequest): Promise<T> {
  throw new Error('Not implemented');
}

// Feature を milestone に割り当てた計画案を Claude に作らせる (§6.2)
export async function proposePlan(call: AgentCall, input: PlanInput): Promise<Plan> {
  throw new Error('Not implemented');
}

// 製品要求を反映した PROJECT.md 案を Claude に作らせる (§9.6)
export async function editSpec(call: AgentCall, input: SpecEditInput): Promise<SpecEditOutput> {
  throw new Error('Not implemented');
}

// 初回 Code Review。発見したすべての指摘を列挙させる (§14.1)
export async function reviewCode(call: AgentCall, input: CodeReviewInput): Promise<ReviewFinding[]> {
  throw new Error('Not implemented');
}

// Code Review の修正レビュー。固定済み指摘の解消状態だけを判定させる (§14.2)
export async function recheckCode(call: AgentCall, input: CodeReviewInput, issues: ReviewIssue[]): Promise<IssueVerdict[]> {
  throw new Error('Not implemented');
}

// 初回 E2E レビュー。screenshot から表示上の問題を列挙させる (§17.1)
export async function reviewE2E(call: AgentCall, input: E2EReviewInput): Promise<ReviewFinding[]> {
  throw new Error('Not implemented');
}

// E2E の修正レビュー。固定済み指摘の解消状態だけを判定させる (§17.2)
export async function recheckE2E(call: AgentCall, input: E2EReviewInput, issues: ReviewIssue[]): Promise<IssueVerdict[]> {
  throw new Error('Not implemented');
}
