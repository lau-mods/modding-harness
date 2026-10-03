// 指摘の種類。code は CR-001、visual は VR-001 形式の ID を持つ (§10, §15)
export type IssueKind = 'code' | 'visual';

// 指摘の状態。resolved は Claude の判定、accepted は修正担当 Codex の理由付き判断 (§11)
export type IssueStatus = 'unresolved' | 'resolved' | 'accepted';

// 初回レビューで Claude が返す 1 件の指摘 (ID 付与前)
export type ReviewFinding = { title: string; detail: string; file: string | null; line: number | null };

// 指摘の状態変化の履歴 (§29 各指摘の現在状態)
export type IssueEvent = { round: number; status: IssueStatus; by: 'claude' | 'codex'; note: string; at: string };

// ID を付与して固定された指摘
export type ReviewIssue = ReviewFinding & { id: string; kind: IssueKind; status: IssueStatus; history: IssueEvent[] };

// 再レビューで Claude が返す指摘ごとの判定 (§10)
export type IssueVerdict = { issueId: string; status: 'resolved' | 'unresolved'; note: string };

// 修正時に Codex が返す指摘ごとの対応。accepted は理由必須 (§11)
export type IssueResponse = { issueId: string; decision: 'fixed' | 'accepted'; reason: string };

// milestone ごとに固定された指摘集合と、再レビューで継続する Claude review session
export type IssueSet = { kind: IssueKind; milestone: string; round: number; sessionId: string | null; issues: ReviewIssue[] };

// 初回レビューの指摘に ID を付与し、指摘集合として固定する (§10, §15)
export function createIssueSet(kind: IssueKind, milestone: string, findings: ReviewFinding[], sessionId: string | null): IssueSet {
  return {
    kind, milestone, round: 1, sessionId,
    issues: findings.map((finding, index) => ({ ...finding, id: issueId(kind, index), kind, status: 'unresolved', history: [] })),
  };
}

// 再レビューの判定を、初回集合の未解決指摘に対してだけ反映する (§10, §15)
export function applyVerdicts(set: IssueSet, verdicts: IssueVerdict[]): IssueSet {
  const round = set.round + 1;
  const at = new Date().toISOString();
  return {
    ...set, round,
    issues: set.issues.map(issue => {
      const verdict = verdicts.find(item => item.issueId === issue.id);
      if (!verdict || issue.status !== 'unresolved') return issue;
      return { ...issue, status: verdict.status, history: [...issue.history, { round, status: verdict.status, by: 'claude', note: verdict.note, at }] };
    }),
  };
}

// Codex の対応を反映する。理由付きの accepted を解決済みとして記録し、fixed は履歴に残して再レビューを待つ (§11)
export function applyResponses(set: IssueSet, responses: IssueResponse[]): IssueSet {
  const at = new Date().toISOString();
  return {
    ...set,
    issues: set.issues.map(issue => {
      const response = responses.find(item => item.issueId === issue.id);
      if (!response || issue.status !== 'unresolved') return issue;
      const status: IssueStatus = response.decision === 'accepted' && response.reason.trim() ? 'accepted' : 'unresolved';
      return { ...issue, status, history: [...issue.history, { round: set.round, status, by: 'codex', note: `${response.decision}: ${response.reason}`, at }] };
    }),
  };
}

// 再レビューで Claude に確認させる未解決の指摘を返す
export function pendingIssues(set: IssueSet | null): ReviewIssue[] {
  return set?.issues.filter(issue => issue.status === 'unresolved') ?? [];
}

// 全指摘が resolved または accepted なら true (§11)
export function isSettled(set: IssueSet): boolean {
  return pendingIssues(set).length === 0;
}

// 種類と 0 始まりの連番から CR-001 / VR-001 形式の ID を作る
export function issueId(kind: IssueKind, index: number): string {
  return `${kind === 'code' ? 'CR' : 'VR'}-${String(index + 1).padStart(3, '0')}`;
}
