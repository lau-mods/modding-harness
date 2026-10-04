import type { AgentConfig } from '../config/config.js';
import { ExecutionFailure, FatalError } from '../core/errors.js';
import type { ProcessResult, Runner } from '../core/process.js';
import { tail } from '../core/process.js';

// agent の役割。Codex: implementation、Claude: plan / spec_edit / code_review / code_recheck / visual_review / visual_recheck
export type AgentRole = 'implementation' | 'plan' | 'spec_edit' | 'code_review' | 'code_recheck' | 'visual_review' | 'visual_recheck';

// JSON Schema オブジェクト
export type JsonSchema = Record<string, unknown>;

// agent 呼び出しに共通する実行環境。cwd は project root、記録は logDir に保存する
export type AgentCall = { config: AgentConfig; root: string; logDir: string; runner: Runner };

// agent 呼び出し 1 回分の要求。images は Codex に添付する画像、sessionId 指定時は既存 session を継続する
export type AgentRequest = { role: AgentRole; prompt: string; images: string[]; sessionId: string | null };

// agent の構造化出力と、継続呼び出し用の session ID
export type AgentResult<T> = { output: T; sessionId: string | null };

// agent 1 回の実行時間の上限
export const AGENT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

const string = { type: 'string' };
const strings = { type: 'array', items: string };
const object = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const findings = object({ findings: { type: 'array', items: object({ title: string, detail: string, file: { type: ['string', 'null'] }, line: { type: ['integer', 'null'] } }) } });
const verdicts = object({ verdicts: { type: 'array', items: object({ issueId: string, status: { type: 'string', enum: ['resolved', 'unresolved'] }, note: string }) } });
const schemas: Record<AgentRole, JsonSchema> = {
  implementation: object({ summary: string, changedFiles: strings, responses: { type: 'array', items: object({ issueId: string, decision: { type: 'string', enum: ['fixed', 'accepted'] }, reason: string }) } }),
  plan: object({ milestones: { type: 'array', items: object({ id: string, acIds: strings, dependsOn: strings, summary: string, scope: strings, e2eSummary: string }) }, excluded: { type: 'array', items: object({ acId: string, reason: string }) } }),
  spec_edit: object({ projectMarkdown: string, summary: string }),
  code_review: findings,
  code_recheck: verdicts,
  visual_review: findings,
  visual_recheck: verdicts,
};

// 役割ごとの structured output schema を返す
export function outputSchema(role: AgentRole): JsonSchema {
  return schemas[role];
}

// agent 出力を役割の schema で検証して型付きで返す。不正な出力は ExecutionFailure (§17)
export function validateOutput<T>(role: AgentRole, value: unknown): T {
  const problems = validate(outputSchema(role), value, 'output');
  if (problems.length) throw new ExecutionFailure(`Invalid ${role} output: ${problems.slice(0, 5).join('; ')}`);
  return value as T;
}

// CLI の失敗出力から認証不可を FatalError (§20)、それ以外を ExecutionFailure (§17) に分類する
export function classifyAgentFailure(role: AgentRole, result: ProcessResult): FatalError | ExecutionFailure {
  const output = tail(result.stderr + '\n' + result.stdout, 2000);
  if (/not logged in|please (run )?log ?in|unauthori[sz]ed|authentication (failed|required|error)|invalid api key|oauth token/i.test(output)) {
    return new FatalError(`${role} agent authentication is unavailable: ${output.trim()}`);
  }
  return new ExecutionFailure(`${role} agent failed (exit ${result.code}): ${output.trim()}`);
}

// outputSchema で使う JSON Schema の範囲 (type・enum・properties・required・items) で値を検証する
function validate(schema: JsonSchema, value: unknown, at: string): string[] {
  const types = [schema.type].flat() as string[];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (!types.includes(actual)) return [`${at} must be ${types.join(' or ')}`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`${at} must be one of ${schema.enum.join(', ')}`];
  if (actual === 'array') return (value as unknown[]).flatMap((item, index) => validate(schema.items as JsonSchema, item, `${at}[${index}]`));
  if (actual === 'object') {
    const properties = schema.properties as Record<string, JsonSchema>;
    const record = value as Record<string, unknown>;
    return Object.entries(properties).flatMap(([key, child]) => key in record ? validate(child, record[key], `${at}.${key}`) : [`${at}.${key} is required`]);
  }
  return [];
}
