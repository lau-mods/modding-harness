import type { FailureReport } from '../core/errors.js';
import type { Milestone } from '../plan/plan.js';
import type { IssueResponse, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion, Feature } from '../spec/types.js';
import type { AgentCall, AgentRequest } from './agent.js';

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
export function codexArgs(call: AgentCall, request: AgentRequest, schemaFile: string, outputFile: string): string[] {
  throw new Error('Not implemented');
}

// Codex CLI を実行して構造化出力を得る。失敗は FatalError (§23)
export async function runCodex<T>(call: AgentCall, request: AgentRequest): Promise<T> {
  throw new Error('Not implemented');
}

// milestone の実装、または実行失敗・レビュー指摘の修正を Codex に依頼する (§11, §14.2, §17.2, §19.2)
export async function implement(call: AgentCall, input: ImplementationInput): Promise<ImplementationOutput> {
  throw new Error('Not implemented');
}
