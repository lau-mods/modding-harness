import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FatalError } from '../core/errors.js';
import { agentFailure, canWrite, jsonLines, outputSchema, runAgentProcess, validateOutput } from './agent.js';
import type { AgentCall, AgentRequest, AgentResult } from './agent.js';

// Harness が opencode に定義する agent の名前
const AGENT = 'harness';

// opencode CLI の引数を組み立てる。session があれば再開する。OPENCODE_CONFIG_CONTENT を反映させるため、共有の background service ではなく専用の server で実行する。
// 権限は OPENCODE_CONFIG_CONTENT で定義した agent で決める。画像は添付する。作業ディレクトリは実行時の cwd (root) とし、effort は model の variant (provider/model#variant) として渡す
export function opencodeArgs(call: AgentCall, request: AgentRequest): string[] {
  const { model, effort } = call.config;
  return [
    'run',
    '--standalone',
    '--format', 'json',
    '--agent', AGENT,
    ...(request.session ? ['--session', request.session] : []),
    ...request.images.flatMap(image => ['--file', image]),
    ...(model ? ['--model', effort ? `${model}#${effort}` : model] : []),
  ];
}

// opencode の設定を上書きして、役割の権限を持つ agent を定義する。書き込む役割には編集と ./gradlew の実行を許可し、readDirs は読み取りのため root の外でも許可する
export function opencodeConfig(call: AgentCall, request: AgentRequest): string {
  const write = canWrite(request.role);
  const external = Object.fromEntries([['*', 'deny'], ...(call.readDirs ?? []).map(dir => [`${path.resolve(dir)}/*`, 'allow'])]);
  const permission = { edit: write ? 'allow' : 'deny', bash: write ? { '*': 'deny', './gradlew*': 'allow' } : 'deny', webfetch: 'deny', external_directory: external };
  return JSON.stringify({ agent: { [AGENT]: { description: 'Modding Harness agent', mode: 'primary', permission } } });
}

// opencode には構造化出力の指定が無いため、schema に従う JSON だけを最後に返すよう prompt で指示する
export function opencodePrompt(request: AgentRequest): string {
  return `${request.prompt}

## Output

Finish with a single JSON value that follows this JSON Schema, with no other text around it:

\`\`\`json
${JSON.stringify(outputSchema(request.role))}
\`\`\``;
}

// opencode CLI を実行し、最後のテキストを JSON として読み、session ID とともに返す。失敗は FatalError (§23)
export async function runOpencode<T>(call: AgentCall, request: AgentRequest): Promise<AgentResult<T>> {
  const prompt = opencodePrompt(request);
  await writeFile(path.join(call.logDir, 'prompt.md'), prompt);
  const result = await runAgentProcess(call, request.role, opencodeArgs(call, request), prompt, { OPENCODE_CONFIG_CONTENT: opencodeConfig(call, request) });
  const events = jsonLines(result.stdout) as { type?: string; sessionID?: string; part?: { text?: string } }[];
  if (result.code !== 0 || events.some(event => event.type === 'error')) throw agentFailure(request.role, result);
  const text = events.filter(event => event.type === 'text').at(-1)?.part?.text?.trim() ?? '';
  let value: unknown;
  try { value = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { throw new FatalError(`opencode returned no structured output for ${request.role}: ${text.slice(-500)}`); }
  return { output: validateOutput<T>(request.role, value), session: events.find(event => event.sessionID)?.sessionID ?? request.session ?? null };
}
