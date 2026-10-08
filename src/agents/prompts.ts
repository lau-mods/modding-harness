import type { CodeReviewInput, E2EReviewInput, PlanInput, SpecEditInput } from './claude.js';
import type { ImplementationInput } from './codex.js';
import type { ReviewIssue } from '../review/issues.js';

// すべての Codex 実装・修正要求に全文を含める Code Rules (§12.1)
export const CODE_RULES = `Code style:
- Implement exactly what the target Acceptance Criteria require; other behavior belongs to its own milestone.
- Use vanilla Minecraft and NeoForge mechanisms (registries, JSON resources, existing base classes) before custom code.
- Keep one direct path per behavior: small classes, direct calls, inline values until a second use appears.
- Introduce an abstraction, helper or config option only when two call sites use it now.
- Validate only states the game can produce; rely on Minecraft and NeoForge guarantees.
- Remove code, resources and comments that the current behavior no longer uses.
- Names say what the code does; comments say why, describing the current behavior only.`;

// Codex への実装・修正指示。Code Rules・GameTest / E2E の作成指示・失敗情報または指摘を含める (§11, §12.2)
export function implementationPrompt(input: ImplementationInput): string {
  throw new Error('Not implemented');
}

// Feature を milestone に割り当てる計画案を Claude に作らせる指示 (§6.2)
export function planPrompt(input: PlanInput): string {
  throw new Error('Not implemented');
}

// 自然言語の製品要求を PROJECT.md に反映させる指示 (§9.6)
export function specEditPrompt(input: SpecEditInput): string {
  throw new Error('Not implemented');
}

// 初回 Code Review の指示。確認観点と Code Rules を含め、すべての指摘を列挙させる (§14.1)
export function codeReviewPrompt(input: CodeReviewInput): string {
  throw new Error('Not implemented');
}

// Code Review の修正レビュー指示。固定済み指摘の解消状態だけを判定させ、新規指摘を禁止する (§14.2)
export function codeRecheckPrompt(input: CodeReviewInput, issues: ReviewIssue[]): string {
  throw new Error('Not implemented');
}

// 初回 E2E レビューの指示。screenshot と AC の Expected Result から表示上の問題を列挙させる (§17.1)
export function e2eReviewPrompt(input: E2EReviewInput): string {
  throw new Error('Not implemented');
}

// E2E の修正レビュー指示。固定済み指摘の解消状態だけを判定させ、新規指摘を禁止する (§17.2)
export function e2eRecheckPrompt(input: E2EReviewInput, issues: ReviewIssue[]): string {
  throw new Error('Not implemented');
}
