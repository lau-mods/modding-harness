import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProviderConfig } from '../config/config.js';
import { FatalError } from '../core/errors.js';
import { agentFailure, canWrite, outputSchema, runAgentProcess, validateOutput } from './agent.js';
import type { AgentCall, AgentRequest } from './agent.js';

// Codex CLI の引数を組み立てる。書き込む役割には Workspace への書き込みを許可し、それ以外は読み取り専用にする
export function codexArgs(call: AgentCall, request: AgentRequest, schemaFile: string, outputFile: string): string[] {
  return [
    'exec',
    ...request.images.flatMap(image => ['--image', image]),
    '--sandbox', canWrite(request.role) ? 'workspace-write' : 'read-only', '--skip-git-repo-check', '--ephemeral',
    '-c', 'approval_policy="never"',
    '-c', `projects.${JSON.stringify(path.resolve(call.root))}.trust_level="trusted"`,
    '--cd', call.root,
    ...(call.config.model ? ['--model', call.config.model] : []),
    ...(call.config.effort ? ['-c', `model_reasoning_effort="${call.config.effort}"`] : []),
    ...(call.config.fast ? ['-c', 'service_tier="priority"'] : []),
    ...providerArgs(call.config.provider ?? null),
    '--output-schema', schemaFile,
    '--output-last-message', outputFile,
    '-',
  ];
}

// provider を ~/.codex/config.toml に書かずに、Codex の設定の上書きとして定義して選ぶ
function providerArgs(provider: ProviderConfig | null): string[] {
  if (!provider) return [];
  const definition = { name: provider.id, base_url: provider.baseUrl, wire_api: 'responses', env_key: provider.envKey };
  return [
    '-c', `model_provider=${JSON.stringify(provider.id)}`,
    ...Object.entries(definition).flatMap(([key, value]) => ['-c', `model_providers.${provider.id}.${key}=${JSON.stringify(value)}`]),
  ];
}

// Codex CLI を実行して構造化出力を得る。書き込む役割では sandbox の外で ./gradlew を実行できるようにする。失敗は FatalError (§23)
export async function runCodex<T>(call: AgentCall, request: AgentRequest): Promise<T> {
  if (canWrite(request.role)) {
    const rulesDir = path.join(call.root, '.codex', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(path.join(rulesDir, 'harness-gradle.rules'), 'prefix_rule(pattern = ["./gradlew"], decision = "allow")\n');
  }
  const schemaFile = path.join(call.logDir, 'schema.json');
  const outputFile = path.join(call.logDir, 'output.json');
  await writeFile(schemaFile, JSON.stringify(outputSchema(request.role), null, 2));
  await writeFile(path.join(call.logDir, 'prompt.md'), request.prompt);
  const result = await runAgentProcess(call, request.role, codexArgs(call, request, schemaFile, outputFile), request.prompt);
  if (result.code !== 0) throw agentFailure(request.role, result);
  let value: unknown;
  try { value = JSON.parse(await readFile(outputFile, 'utf8')); }
  catch (error) { throw new FatalError(`Codex returned no structured output: ${(error as Error).message}`); }
  return validateOutput<T>(request.role, value);
}
