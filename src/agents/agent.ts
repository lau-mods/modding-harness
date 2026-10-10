import type { AgentConfig } from '../config/config.js';
import { ExecutionFailure, FatalError } from '../core/errors.js';
import type { ProcessResult, Runner } from '../core/process.js';
import { tail } from '../core/process.js';

// agent の役割。Codex: implementation、Claude: plan / spec_edit / code_review / code_recheck / e2e_review / e2e_recheck
export type AgentRole = 'implementation' | 'plan' | 'spec_edit' | 'code_review' | 'code_recheck' | 'e2e_review' | 'e2e_recheck';

// JSON Schema オブジェクト
export type JsonSchema = Record<string, unknown>;

// agent 呼び出しに共通する実行環境。cwd は Workspace root、記録は logDir に保存する
export type AgentCall = { config: AgentConfig; root: string; logDir: string; runner: Runner };

// agent 呼び出し 1 回分の要求。images は agent に添付する画像
export type AgentRequest = { role: AgentRole; prompt: string; images: string[] };

// agent 1 回の実行時間の上限
export const AGENT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

const string = { type: 'string' };
const strings = { type: 'array', items: string };
const object = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const findings = object({ findings: { type: 'array', items: object({ target: string, acId: { type: ['string', 'null'] }, problem: string, reason: string, fix: string }) } });
const verdicts = object({ verdicts: { type: 'array', items: object({ issueId: string, status: { type: 'string', enum: ['open', 'resolved'] }, note: string }) } });
const schemas: Record<AgentRole, JsonSchema> = {
  implementation: object({ summary: string, changedFiles: strings, responses: { type: 'array', items: object({ issueId: string, decision: { type: 'string', enum: ['fixed', 'accepted'] }, reason: string }) } }),
  plan: object({ milestones: { type: 'array', items: object({ id: string, features: strings, dependsOn: strings, approach: string, scope: strings }) } }),
  spec_edit: object({ projectMarkdown: string, summary: string }),
  code_review: findings,
  code_recheck: verdicts,
  e2e_review: findings,
  e2e_recheck: verdicts,
};

// 役割ごとの structured output schema を返す
export function outputSchema(role: AgentRole): JsonSchema {
  return schemas[role];
}

// agent 出力を役割の schema で検証して型付きで返す。不正な出力は FatalError (§23)
export function validateOutput<T>(role: AgentRole, value: unknown): T {
  const problems = validate(outputSchema(role), value, 'output');
  if (problems.length) throw new FatalError(`${role} agent returned invalid output: ${problems.slice(0, 5).join('; ')}`);
  return value as T;
}

// agent CLI の失敗を、終了コードと出力の要約を含む FatalError にする。agent の利用可否は doctor で確認済みのため再試行しない (§23)
export function agentFailure(role: AgentRole, result: ProcessResult): FatalError {
  return new FatalError(`${role} agent failed (exit ${result.code}): ${tail(`${result.stderr}\n${result.stdout}`, 2000).trim()}`);
}

// agent CLI を実行する。timeout も再試行せず FatalError とする (§23)
export async function runAgentProcess(call: AgentCall, role: AgentRole, args: string[], input: string): Promise<ProcessResult> {
  try {
    return await call.runner(call.config.command, args, { cwd: call.root, input, logDir: call.logDir, timeoutMs: AGENT_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof ExecutionFailure) throw new FatalError(`${role} agent failed: ${error.message}`);
    throw error;
  }
}

// outputSchema で使う JSON Schema の範囲 (type・enum・properties・required・items) で値を検証する
function validate(schema: JsonSchema, value: unknown, at: string): string[] {
  const types = [schema.type].flat() as string[];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
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
