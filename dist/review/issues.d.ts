export type IssueKind = 'code' | 'visual';
export type IssueStatus = 'unresolved' | 'resolved' | 'accepted';
export type ReviewFinding = {
    title: string;
    detail: string;
    file: string | null;
    line: number | null;
};
export type IssueEvent = {
    round: number;
    status: IssueStatus;
    by: 'claude' | 'codex';
    note: string;
    at: string;
};
export type ReviewIssue = ReviewFinding & {
    id: string;
    kind: IssueKind;
    status: IssueStatus;
    history: IssueEvent[];
};
export type IssueVerdict = {
    issueId: string;
    status: 'resolved' | 'unresolved';
    note: string;
};
export type IssueResponse = {
    issueId: string;
    decision: 'fixed' | 'accepted';
    reason: string;
};
export type IssueSet = {
    kind: IssueKind;
    milestone: string;
    round: number;
    sessionId: string | null;
    issues: ReviewIssue[];
};
export declare function createIssueSet(kind: IssueKind, milestone: string, findings: ReviewFinding[], sessionId: string | null): IssueSet;
export declare function applyVerdicts(set: IssueSet, verdicts: IssueVerdict[]): IssueSet;
export declare function applyResponses(set: IssueSet, responses: IssueResponse[]): IssueSet;
export declare function pendingIssues(set: IssueSet | null): ReviewIssue[];
export declare function isSettled(set: IssueSet): boolean;
export declare function issueId(kind: IssueKind, index: number): string;
