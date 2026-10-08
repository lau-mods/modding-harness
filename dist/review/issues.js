// 初回レビューの指摘に ID を付与し、指摘集合として固定する (§10, §15)
export function createIssueSet(kind, milestone, findings, sessionId) {
    return {
        kind, milestone, round: 1, sessionId,
        issues: findings.map((finding, index) => ({ ...finding, id: issueId(kind, index), kind, status: 'unresolved', history: [] })),
    };
}
// 再レビューの判定を、初回集合の未解決指摘に対してだけ反映する (§10, §15)
export function applyVerdicts(set, verdicts) {
    const round = set.round + 1;
    const at = new Date().toISOString();
    return {
        ...set, round,
        issues: set.issues.map(issue => {
            const verdict = verdicts.find(item => item.issueId === issue.id);
            if (!verdict || issue.status !== 'unresolved')
                return issue;
            return { ...issue, status: verdict.status, history: [...issue.history, { round, status: verdict.status, by: 'claude', note: verdict.note, at }] };
        }),
    };
}
// Codex の対応を反映する。理由付きの accepted を解決済みとして記録し、fixed は履歴に残して再レビューを待つ (§11)
export function applyResponses(set, responses) {
    const at = new Date().toISOString();
    return {
        ...set,
        issues: set.issues.map(issue => {
            const response = responses.find(item => item.issueId === issue.id);
            if (!response || issue.status !== 'unresolved')
                return issue;
            const status = response.decision === 'accepted' && response.reason.trim() ? 'accepted' : 'unresolved';
            return { ...issue, status, history: [...issue.history, { round: set.round, status, by: 'codex', note: `${response.decision}: ${response.reason}`, at }] };
        }),
    };
}
// 再レビューで Claude に確認させる未解決の指摘を返す
export function pendingIssues(set) {
    return set?.issues.filter(issue => issue.status === 'unresolved') ?? [];
}
// 全指摘が resolved または accepted なら true (§11)
export function isSettled(set) {
    return pendingIssues(set).length === 0;
}
// 種類と 0 始まりの連番から CR-001 / VR-001 形式の ID を作る
export function issueId(kind, index) {
    return `${kind === 'code' ? 'CR' : 'VR'}-${String(index + 1).padStart(3, '0')}`;
}
//# sourceMappingURL=issues.js.map