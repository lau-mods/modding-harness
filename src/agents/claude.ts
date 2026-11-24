import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FatalError } from '../core/errors.js';
import { agentFailure, canWrite, outputSchema, runAgentProcess, validateOutput } from './agent.js';
import type { AgentCall, AgentRequest, AgentResult } from './agent.js';

// claude CLI の引数を組み立てる。session があれば再開する。読み取り専用 tool に加え、書き込む役割には編集と ./gradlew の実行を許可する。画像は prompt に記載したパスを Read tool で開かせる
export function claudeArgs(call: AgentCall, request: AgentRequest): string[] {
  const write = canWrite(request.role);
  return [
    '-p',
    ...(request.session ? ['--resume', request.session] : []),
    '--output-format', 'json',
    '--json-schema', JSON.stringify(outputSchema(request.role)),
    '--tools', write ? 'Read,Grep,Glob,Edit,Write,Bash' : 'Read,Grep,Glob',
    ...(write ? ['--allowedTools', 'Edit', 'Write', 'Bash(./gradlew:*)'] : []),
    '--permission-mode', 'dontAsk',
    ...(call.readDirs ?? []).flatMap(dir => ['--add-dir', dir]),
    ...(call.config.model ? ['--model', call.config.model] : []),
    ...(call.config.effort ? ['--effort', call.config.effort] : []),
  ];
}

// claude CLI を実行して構造化出力と session ID を得る。失敗は FatalError (§23)
export async function runClaude<T>(call: AgentCall, request: AgentRequest): Promise<AgentResult<T>> {
  await writeFile(path.join(call.logDir, 'prompt.md'), request.prompt);
  const result = await runAgentProcess(call, request.role, claudeArgs(call, request), request.prompt);
  let envelope: { subtype?: string; is_error?: boolean; structured_output?: unknown; session_id?: string };
  try { envelope = JSON.parse(result.stdout) as typeof envelope; }
  catch { throw agentFailure(request.role, result); }
  if (result.code !== 0 || envelope.is_error || envelope.subtype !== 'success') throw agentFailure(request.role, result);
  if (envelope.structured_output === undefined) throw new FatalError(`Claude returned no structured output for ${request.role}`);
  return { output: validateOutput<T>(request.role, envelope.structured_output), session: envelope.session_id ?? request.session ?? null };
}
