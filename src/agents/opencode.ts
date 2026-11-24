import { realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FatalError } from '../core/errors.js';
import type { ProcessResult } from '../core/process.js';
import { agentFailure, canWrite, jsonLines, outputSchema, runAgentProcess, validateOutput } from './agent.js';
import type { AgentCall, AgentRequest, AgentResult } from './agent.js';

// Harness が opencode に定義する agent の名前
const AGENT = 'harness';

// 書き込む役割の session を始めるときに送る、編集を伴わない prompt
const OPEN_PROMPT = 'Reply with OK. Do not read, edit or run anything.';

type OpencodeEvent = { type?: string; sessionID?: string; part?: { text?: string } };

// opencode CLI の引数を組み立てる。session があれば再開する。OPENCODE_CONFIG_CONTENT を反映させるため、共有の background service ではなく専用の server で実行する。
// 権限は OPENCODE_CONFIG_CONTENT で定義した agent で決める。画像は添付する。effort は model の variant (provider/model#variant) として渡す
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
export function opencodeConfig(call: AgentCall, write: boolean): string {
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

// opencode CLI を root で実行する。opencode は cwd ではなく PWD から session の作業先を決めるため、PWD も root にする
async function runCli(call: AgentCall, request: AgentRequest, args: string[], input: string, write: boolean): Promise<ProcessResult> {
  return runAgentProcess(call, request.role, args, input, { PWD: path.resolve(call.root), OPENCODE_CONFIG_CONTENT: opencodeConfig(call, write) });
}

// opencode を実行して event を読む。失敗は FatalError (§23)
async function runEvents(call: AgentCall, request: AgentRequest, input: string, write: boolean): Promise<OpencodeEvent[]> {
  const result = await runCli(call, request, opencodeArgs(call, request), input, write);
  const events = jsonLines(result.stdout) as OpencodeEvent[];
  if (result.code !== 0 || events.some(event => event.type === 'error')) throw agentFailure(request.role, result);
  return events;
}

// session の作業先が root と一致することを確かめる。一致しなければ root の外を編集しうるため FatalError (§23)
async function assertSessionDirectory(call: AgentCall, request: AgentRequest, session: string): Promise<void> {
  const result = await runCli(call, request, ['session', 'list', '--standalone', '--format', 'json'], '', false);
  if (result.code !== 0) throw agentFailure(request.role, result);
  let sessions: { id?: string; directory?: string }[];
  try { sessions = JSON.parse(result.stdout) as typeof sessions; }
  catch { throw agentFailure(request.role, result); }
  const directory = sessions.find(item => item.id === session)?.directory;
  const root = await realpath(call.root);
  if (!directory || await realpath(directory).catch(() => directory) !== root) {
    throw new FatalError(`opencode session ${session} works in ${directory ?? 'an unknown directory'} instead of ${root}`);
  }
}

// opencode CLI を実行し、最後のテキストを JSON として読み、session ID とともに返す。書き込む役割では、session の作業先が root と一致することを確かめてから編集を許可する。
// session が無ければ、編集を許可しない agent で先に session を作る。失敗は FatalError (§23)
export async function runOpencode<T>(call: AgentCall, request: AgentRequest): Promise<AgentResult<T>> {
  const prompt = opencodePrompt(request);
  await writeFile(path.join(call.logDir, 'prompt.md'), prompt);
  const write = canWrite(request.role);
  let session = request.session ?? null;
  if (write) {
    session ??= (await runEvents(call, { ...request, images: [] }, OPEN_PROMPT, false)).find(event => event.sessionID)?.sessionID ?? null;
    if (!session) throw new FatalError(`opencode did not start a session for ${request.role}`);
    await assertSessionDirectory(call, request, session);
  }
  const events = await runEvents(call, { ...request, session }, prompt, write);
  const text = events.filter(event => event.type === 'text').at(-1)?.part?.text?.trim() ?? '';
  let value: unknown;
  try { value = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { throw new FatalError(`opencode returned no structured output for ${request.role}: ${text.slice(-500)}`); }
  return { output: validateOutput<T>(request.role, value), session: events.find(event => event.sessionID)?.sessionID ?? session };
}
