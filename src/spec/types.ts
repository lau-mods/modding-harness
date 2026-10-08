// PROJECT.md の Status。draft は仕様作成中、active は開発対象として確定 (§5.2)
export type ProjectStatus = 'draft' | 'active';

// 対象プラットフォームの version (§5.2)
export type Platform = { minecraft: string; neoforge: string; java: string };

// Acceptance Criterion。Preconditions / Action / Expected Result を持つ (§5.4)
export type AcceptanceCriterion = {
  id: string; // AC-F001-001
  featureId: string; // F-001
  title: string;
  preconditions: string;
  action: string;
  expectedResult: string;
  markdown: string; // 見出しを含む原文。agent への入力に使う
};

// 利用者から見た一つの機能と、所属する AC (§5.3)
export type Feature = {
  id: string; // F-001
  title: string;
  description: string;
  criteria: AcceptanceCriterion[];
  markdown: string; // 見出しを含む原文
};

// PROJECT.md を構造化したもの。未記入の項目は空文字列 (§5.2)
export type ProjectSpec = {
  text: string; // PROJECT.md 全文
  status: ProjectStatus;
  projectId: string;
  modId: string;
  platform: Platform;
  purpose: string;
  features: Feature[];
  globalRequirements: string; // 各 Feature の完成条件に含める共通要求 (§5.5)
  constraints: string;
  openQuestions: string;
};
