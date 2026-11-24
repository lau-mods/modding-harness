import type { FailureReport } from '../core/errors.js';
import type { ScenarioResult } from '../e2e/scenario.js';
import type { Milestone, Plan } from '../plan/plan.js';
import type { IssueResponse, IssueVerdict, ReviewFinding, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion, Feature } from '../spec/types.js';
import type { AgentCall, AgentRequest } from './agent.js';
import { runClaude } from './claude.js';
import { runCodex } from './codex.js';
import { runOpencode } from './opencode.js';
import { codeRecheckPrompt, codeReviewPrompt, conflictReviewPrompt, e2eRecheckPrompt, e2eReviewPrompt, implementationPrompt, planPrompt, specEditPrompt } from './prompts.js';

// 計画作成の入力。planned は追記先の計画済み milestone (§6.2, §9.6)
export type PlanInput = { projectMarkdown: string; features: Feature[]; projectFiles: string[]; planned: Milestone[] };

// 仕様変更の入力 (§9.6)
export type SpecEditInput = { request: string; projectMarkdown: string };

// 仕様変更の結果。PROJECT.md 全文を返し、書き込みは Harness が行う (§9.6)
export type SpecEditOutput = { projectMarkdown: string; summary: string };

// 実装・修正の入力 (§11)
export type ImplementationInput = {
  projectMarkdown: string; // PROJECT.md 全文
  milestone: Milestone;
  features: Feature[];
  criteria: AcceptanceCriterion[];
  relatedFiles: string[]; // 関連ソース (agent は Workspace 上で直接読む)
  failure: FailureReport | null; // 修正時の実行失敗情報 (§13, §15.4, §19.2)
  codeIssues: ReviewIssue[]; // open の Code Review 指摘 (§14.2)
  e2eIssues: ReviewIssue[]; // open の E2E 指摘 (§17.2)
};

// 実装・修正の結果。ファイルは agent が Workspace 上で直接編集する
export type ImplementationOutput = { summary: string; changedFiles: string[]; responses: IssueResponse[] };

// Code Review の入力 (§14.1)
export type CodeReviewInput = {
  milestone: Milestone;
  criteria: AcceptanceCriterion[];
  diff: string; // 初回は復元基点から、再確認は前回レビューからの Git diff
};

// 統合の衝突解消のレビューの入力。diff は conflict marker を含む merge 直後の状態からの差分 (§14.3)
export type ConflictReviewInput = CodeReviewInput & { conflicts: string[] };

// E2E レビューの入力 (§17.1)
export type E2EReviewInput = {
  milestone: Milestone;
  criteria: AcceptanceCriterion[];
  scenarios: ScenarioResult[]; // screenshot と対象 AC を含む実行結果
};

// 設定の type に対応する agent CLI を実行して構造化出力を得る (§8)
export async function runAgent<T>(call: AgentCall, request: AgentRequest): Promise<T> {
  const run = { codex: runCodex, claude: runClaude, opencode: runOpencode }[call.config.type];
  return run<T>(call, request);
}

// Feature を milestone に割り当てた計画案を作らせる (§6.2)
export async function proposePlan(call: AgentCall, input: PlanInput): Promise<Plan> {
  return runAgent<Plan>(call, { role: 'plan', prompt: planPrompt(input), images: [] });
}

// 製品要求を反映した PROJECT.md 案を作らせる (§9.6)
export async function editSpec(call: AgentCall, input: SpecEditInput): Promise<SpecEditOutput> {
  return runAgent<SpecEditOutput>(call, { role: 'spec_edit', prompt: specEditPrompt(input), images: [] });
}

// milestone の実装、または実行失敗・レビュー指摘の修正を依頼する。失敗や E2E 指摘の screenshot は画像として添付する (§11, §14.2, §17.2, §19.2)
export async function implement(call: AgentCall, input: ImplementationInput): Promise<ImplementationOutput> {
  const images = [...input.failure?.screenshots ?? [], ...input.e2eIssues.map(issue => issue.target)];
  return runAgent<ImplementationOutput>(call, { role: 'implementation', prompt: implementationPrompt(input), images: [...new Set(images)] });
}

// 初回 Code Review。発見したすべての指摘を列挙させる (§14.1)
export async function reviewCode(call: AgentCall, input: CodeReviewInput): Promise<ReviewFinding[]> {
  return (await runAgent<{ findings: ReviewFinding[] }>(call, { role: 'code_review', prompt: codeReviewPrompt(input), images: [] })).findings;
}

// Code Review の修正レビュー。固定済み指摘の解消状態だけを判定させる (§14.2)
export async function recheckCode(call: AgentCall, input: CodeReviewInput, issues: ReviewIssue[]): Promise<IssueVerdict[]> {
  return (await runAgent<{ verdicts: IssueVerdict[] }>(call, { role: 'code_recheck', prompt: codeRecheckPrompt(input, issues), images: [] })).verdicts;
}

// 統合の衝突解消のレビュー。解消内容の指摘をすべて列挙させる (§14.3)
export async function reviewConflicts(call: AgentCall, input: ConflictReviewInput): Promise<ReviewFinding[]> {
  return (await runAgent<{ findings: ReviewFinding[] }>(call, { role: 'conflict_review', prompt: conflictReviewPrompt(input), images: [] })).findings;
}

// 初回 E2E レビュー。screenshot から表示上の問題を列挙させる (§17.1)
export async function reviewE2E(call: AgentCall, input: E2EReviewInput): Promise<ReviewFinding[]> {
  return (await runAgent<{ findings: ReviewFinding[] }>(call, { role: 'e2e_review', prompt: e2eReviewPrompt(input), images: screenshots(input) })).findings;
}

// E2E の修正レビュー。固定済み指摘の解消状態だけを判定させる (§17.2)
export async function recheckE2E(call: AgentCall, input: E2EReviewInput, issues: ReviewIssue[]): Promise<IssueVerdict[]> {
  const images = [...new Set([...issues.map(issue => issue.target), ...screenshots(input)])];
  return (await runAgent<{ verdicts: IssueVerdict[] }>(call, { role: 'e2e_recheck', prompt: e2eRecheckPrompt(input, issues), images })).verdicts;
}

// E2E の実行結果に含まれる screenshot のパス
function screenshots(input: E2EReviewInput): string[] {
  return input.scenarios.flatMap(scenario => scenario.screenshots.map(shot => shot.file));
}
