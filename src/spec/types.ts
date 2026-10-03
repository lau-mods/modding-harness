// PROJECT.md の Status (§4)
export type ProjectStatus = 'draft' | 'active';

// Feature / Requirement / AC 個別の Status。省略時は active (§5)
export type ItemStatus = 'active' | 'retired';

// 対象プラットフォームの version (§3)
export type Platform = { minecraft: string; neoforge: string; java: string };

// Acceptance Criterion。Preconditions / Action / Expected Result を必須とする (§2, §3)
export type AcceptanceCriterion = {
  id: string; // AC-F001-001
  featureId: string;
  title: string;
  status: ItemStatus;
  preconditions: string;
  action: string;
  expectedResult: string;
  markdown: string; // 見出しを含む原文。agent への入力に使う
};

// Feature が満たす製品要求 (§2)
export type Requirement = { id: string; featureId: string; title: string; status: ItemStatus; body: string };

// 一まとまりの機能と、配下の Requirement / AC (§2)
export type Feature = {
  id: string; // F-001
  title: string;
  status: ItemStatus;
  description: string;
  requirements: Requirement[];
  criteria: AcceptanceCriterion[];
};

// Cross-cutting Requirements の固定見出し (§3)
export type CrossCuttingTopic = 'Persistence' | 'Multiplayer' | 'Visual' | 'Performance' | 'Compatibility';

// PROJECT.md を構造化したもの。未記入の項目は空文字列
export type ProjectSpec = {
  text: string;
  hash: string;
  status: ProjectStatus;
  projectId: string;
  modId: string;
  packagePath: string;
  platform: Platform;
  purpose: string;
  features: Feature[];
  crossCutting: Record<CrossCuttingTopic, string>;
  constraints: string;
  openQuestions: string;
};
