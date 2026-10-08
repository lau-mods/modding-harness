import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ExecutionFailure } from '../core/errors.js';
import { AGENT_TIMEOUT_MS, classifyAgentFailure, outputSchema, validateOutput } from './agent.js';
import { implementationPrompt } from './prompts.js';
// Codex CLI の引数を組み立てる。project root への書き込みを許可する
export function codexArgs(call, request, schemaFile, outputFile) {
    return [
        'exec',
        ...request.images.flatMap(image => ['--image', image]),
        '--sandbox', 'workspace-write', '--skip-git-repo-check', '--ephemeral',
        '-c', 'approval_policy="never"',
        '--cd', call.root,
        ...(call.config.model ? ['--model', call.config.model] : []),
        '--output-schema', schemaFile,
        '--output-last-message', outputFile,
        '-',
    ];
}
// Codex CLI を実行して構造化出力を得る。失敗は ExecutionFailure / FatalError に分類する (§17, §20)
export async function runCodex(call, request) {
    const schemaFile = path.join(call.logDir, 'schema.json');
    const outputFile = path.join(call.logDir, 'output.json');
    await writeFile(schemaFile, JSON.stringify(outputSchema(request.role), null, 2));
    await writeFile(path.join(call.logDir, 'prompt.md'), request.prompt);
    const result = await call.runner(call.config.command, codexArgs(call, request, schemaFile, outputFile), { cwd: call.root, input: request.prompt, logDir: call.logDir, timeoutMs: AGENT_TIMEOUT_MS });
    if (result.code !== 0)
        throw classifyAgentFailure(request.role, result);
    let value;
    try {
        value = JSON.parse(await readFile(outputFile, 'utf8'));
    }
    catch (error) {
        throw new ExecutionFailure(`Codex returned no structured output: ${error.message}`);
    }
    return { output: validateOutput(request.role, value), sessionId: null };
}
// milestone の実装、または build 失敗・レビュー指摘・画面指摘・E2E 失敗の修正を Codex に依頼する (§8, §9, §11, §16, §19)
export async function implement(call, input) {
    const images = input.e2eFailure?.screenshots ?? [];
    return (await runCodex(call, { role: 'implementation', prompt: implementationPrompt(input), images, sessionId: null })).output;
}
//# sourceMappingURL=codex.js.map