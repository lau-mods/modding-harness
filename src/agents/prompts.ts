import type { ReviewIssue } from '../review/issues.js';
import type { CodeReviewInput, PlanInput, SpecEditInput, VisualReviewInput } from './claude.js';
import type { ImplementationInput } from './codex.js';

// 実装・修正依頼の prompt。PROJECT.md と Harness 本体の変更禁止を明示する (§8)
export function implementationPrompt(input: ImplementationInput): string {
  throw new Error('Not implemented');
}

// 計画作成の prompt (§6)
export function planPrompt(input: PlanInput): string {
  throw new Error('Not implemented');
}

// 仕様変更の prompt。PROJECT.md の形式と ID 規則を守らせる (§3, §5, §23)
export function specEditPrompt(input: SpecEditInput): string {
  throw new Error('Not implemented');
}

// 初回コードレビューの prompt。NeoForge API・client/server・registration 等の観点を含める (§10)
export function codeReviewPrompt(input: CodeReviewInput): string {
  throw new Error('Not implemented');
}

// コード再レビューの prompt。新しい指摘を追加させない (§10)
export function codeRecheckPrompt(input: CodeReviewInput, issues: ReviewIssue[]): string {
  throw new Error('Not implemented');
}

// 初回画面確認の prompt (§15)
export function visualReviewPrompt(input: VisualReviewInput): string {
  throw new Error('Not implemented');
}

// 画面再確認の prompt。新しい指摘を追加させない (§15)
export function visualRecheckPrompt(input: VisualReviewInput, issues: ReviewIssue[]): string {
  throw new Error('Not implemented');
}
