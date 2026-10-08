// 指摘の種類。code は CR-001、e2e は ER-001 形式の ID を持つ (§14.1, §17.1)
export type IssueKind = 'code' | 'e2e';

// 指摘の状態。resolved は Claude の確認、accepted は Codex の根拠付き許容 (§14.2)
export type IssueStatus = 'open' | 'resolved' | 'accepted';

// 初回レビューで Claude が返す 1 件の指摘 (ID 付与前)。target は code ならファイル位置、e2e なら screenshot (§14.1, §17.1)
export type ReviewFinding = { target: string; acId: string | null; problem: string; reason: string; fix: string };

// 指摘の状態変化の履歴
export type IssueEvent = { status: IssueStatus; by: 'claude' | 'codex'; note: string; at: string };

// ID を付与して固定された指摘
export type ReviewIssue = ReviewFinding & { id: string; status: IssueStatus; history: IssueEvent[] };

// 修正レビューで Claude が返す指摘ごとの判定。再発した指摘は open に戻す (§14.2, §18)
export type IssueVerdict = { issueId: string; status: 'open' | 'resolved'; note: string };

// 修正時に Codex が返す指摘ごとの対応。accepted には AC・Code Rules・Minecraft/NeoForge 仕様に基づく理由が必須 (§14.2)
export type IssueResponse = { issueId: string; decision: 'fixed' | 'accepted'; reason: string };

// 初回レビューで固定した指摘集合。当該 milestone 内で維持し、recovery で破棄する (§14.1, §18, §20.3)
export type IssueSet = { kind: IssueKind; issues: ReviewIssue[] };

// 初回レビューの指摘に ID を付与し、指摘集合として固定する (§14.1, §17.1)
export function createIssueSet(kind: IssueKind, findings: ReviewFinding[]): IssueSet {
  throw new Error('Not implemented');
}

// 修正レビューの判定を固定済み指摘にだけ反映する。集合に無い ID の判定は無視する (§14.2, §17.2)
export function applyVerdicts(set: IssueSet, verdicts: IssueVerdict[]): IssueSet {
  throw new Error('Not implemented');
}

// Codex の対応を反映する。理由付きの accepted を記録し、fixed は履歴に残して再レビューを待つ (§14.2)
export function applyResponses(set: IssueSet, responses: IssueResponse[]): IssueSet {
  throw new Error('Not implemented');
}

// open の指摘を返す
export function openIssues(set: IssueSet | null): ReviewIssue[] {
  throw new Error('Not implemented');
}

// 全指摘が resolved または accepted なら true (§14.2)
export function isSettled(set: IssueSet): boolean {
  throw new Error('Not implemented');
}

// 種類と 0 始まりの連番から CR-001 / ER-001 形式の ID を作る
export function issueId(kind: IssueKind, index: number): string {
  throw new Error('Not implemented');
}
