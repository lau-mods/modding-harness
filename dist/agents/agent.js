import { ExecutionFailure, FatalError } from '../core/errors.js';
import { tail } from '../core/process.js';
// agent 1 回の実行時間の上限
export const AGENT_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const string = { type: 'string' };
const strings = { type: 'array', items: string };
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const findings = object({ findings: { type: 'array', items: object({ title: string, detail: string, file: { type: ['string', 'null'] }, line: { type: ['integer', 'null'] } }) } });
const verdicts = object({ verdicts: { type: 'array', items: object({ issueId: string, status: { type: 'string', enum: ['resolved', 'unresolved'] }, note: string }) } });
const schemas = {
    implementation: object({ summary: string, changedFiles: strings, responses: { type: 'array', items: object({ issueId: string, decision: { type: 'string', enum: ['fixed', 'accepted'] }, reason: string }) } }),
    plan: object({ milestones: { type: 'array', items: object({ id: string, acIds: strings, dependsOn: strings, summary: string, scope: strings, e2eSummary: string }) }, excluded: { type: 'array', items: object({ acId: string, reason: string }) } }),
    spec_edit: object({ projectMarkdown: string, summary: string }),
    code_review: findings,
    code_recheck: verdicts,
    visual_review: findings,
    visual_recheck: verdicts,
};
// 役割ごとの structured output schema を返す
export function outputSchema(role) {
    return schemas[role];
}
// agent 出力を役割の schema で検証して型付きで返す。不正な出力は ExecutionFailure (§17)
export function validateOutput(role, value) {
    const problems = validate(outputSchema(role), value, 'output');
    if (problems.length)
        throw new ExecutionFailure(`Invalid ${role} output: ${problems.slice(0, 5).join('; ')}`);
    return value;
}
// CLI の失敗出力から認証不可を FatalError (§20)、それ以外を ExecutionFailure (§17) に分類する
export function classifyAgentFailure(role, result) {
    const output = tail(result.stderr + '\n' + result.stdout, 2000);
    if (/not logged in|please (run )?log ?in|unauthori[sz]ed|authentication (failed|required|error)|invalid api key|oauth token/i.test(output)) {
        return new FatalError(`${role} agent authentication is unavailable: ${output.trim()}`);
    }
    return new ExecutionFailure(`${role} agent failed (exit ${result.code}): ${output.trim()}`);
}
// outputSchema で使う JSON Schema の範囲 (type・enum・properties・required・items) で値を検証する
function validate(schema, value, at) {
    const types = [schema.type].flat();
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
    if (!types.includes(actual))
        return [`${at} must be ${types.join(' or ')}`];
    if (Array.isArray(schema.enum) && !schema.enum.includes(value))
        return [`${at} must be one of ${schema.enum.join(', ')}`];
    if (actual === 'array')
        return value.flatMap((item, index) => validate(schema.items, item, `${at}[${index}]`));
    if (actual === 'object') {
        const properties = schema.properties;
        const record = value;
        return Object.entries(properties).flatMap(([key, child]) => key in record ? validate(child, record[key], `${at}.${key}`) : [`${at}.${key} is required`]);
    }
    return [];
}
//# sourceMappingURL=agent.js.map