import type { BuildResult } from '../build/gradle.js';
import type { E2EFailureReport } from '../e2e/e2e.js';
import type { Milestone } from '../plan/plan.js';
import type { IssueResponse, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { AgentCall, AgentRequest, AgentResult } from './agent.js';

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
  throw new Error('Not implemented');
}

// Codex CLI を実行して構造化出力を得る。失敗は ExecutionFailure / FatalError に分類する (§17, §20)
export async function runCodex<T>(call: AgentCall, request: AgentRequest): Promise<AgentResult<T>> {
  throw new Error('Not implemented');
}

// milestone の実装、または build 失敗・レビュー指摘・画面指摘・E2E 失敗の修正を Codex に依頼する (§8, §9, §11, §16, §19)
export async function implement(call: AgentCall, input: ImplementationInput): Promise<ImplementationOutput> {
  throw new Error('Not implemented');
}
