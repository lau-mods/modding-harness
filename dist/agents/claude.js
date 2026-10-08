import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ExecutionFailure } from '../core/errors.js';
import { AGENT_TIMEOUT_MS, classifyAgentFailure, outputSchema, validateOutput } from './agent.js';
import { codeRecheckPrompt, codeReviewPrompt, planPrompt, specEditPrompt, visualRecheckPrompt, visualReviewPrompt } from './prompts.js';
// claude CLI の引数を組み立てる。全役割で読み取り専用 tool のみ許可し、sessionId があれば session を継続する
export function claudeArgs(call, request) {
    return [
        '-p',
        '--output-format', 'json',
        '--json-schema', JSON.stringify(outputSchema(request.role)),
        '--tools', 'Read,Grep,Glob',
        '--permission-mode', 'dontAsk',
        ...(call.config.model ? ['--model', call.config.model] : []),
        ...(request.sessionId ? ['--resume', request.sessionId] : []),
    ];
}
// claude CLI を実行して構造化出力と session ID を得る。失敗は ExecutionFailure / FatalError に分類する (§17, §20)
export async function runClaude(call, request) {
    await writeFile(path.join(call.logDir, 'prompt.md'), request.prompt);
    const result = await call.runner(call.config.command, claudeArgs(call, request), { cwd: call.root, input: request.prompt, logDir: call.logDir, timeoutMs: AGENT_TIMEOUT_MS });
    let envelope;
    try {
        envelope = JSON.parse(result.stdout);
    }
    catch {
        throw classifyAgentFailure(request.role, result);
    }
    if (result.code !== 0 || envelope.is_error || envelope.subtype !== 'success')
        throw classifyAgentFailure(request.role, result);
    if (envelope.structured_output === undefined)
        throw new ExecutionFailure('Claude returned no structured output');
    return { output: validateOutput(request.role, envelope.structured_output), sessionId: envelope.session_id ?? null };
}
// active AC を milestone に割り当てた計画案を Claude に作成させる (§6)
export async function proposePlan(call, input) {
    return (await runClaude(call, { role: 'plan', prompt: planPrompt(input), images: [], sessionId: null })).output;
}
// 仕様変更要求を反映した PROJECT.md 案を Claude に作成させる (§23)
export async function editSpec(call, input) {
    return (await runClaude(call, { role: 'spec_edit', prompt: specEditPrompt(input), images: [], sessionId: null })).output;
}
// 初回コードレビュー。認識できる指摘を一括で列挙させる (§10)
export async function reviewCode(call, input) {
    const result = await runClaude(call, { role: 'code_review', prompt: codeReviewPrompt(input), images: [], sessionId: null });
    return { output: result.output.findings, sessionId: result.sessionId };
}
// コード再レビュー。初回指摘の解消状態だけを判定させる (§10)
export async function recheckCode(call, input, issues, sessionId) {
    const result = await runClaude(call, { role: 'code_recheck', prompt: codeRecheckPrompt(input, issues), images: [], sessionId });
    return { output: result.output.verdicts, sessionId: result.sessionId };
}
// 初回画面確認。screenshot から認識できる視覚上の問題を一括で列挙させる。screenshot は prompt のパスから Read tool で開く (§15)
export async function reviewVisual(call, input) {
    const result = await runClaude(call, { role: 'visual_review', prompt: visualReviewPrompt(input), images: [], sessionId: null });
    return { output: result.output.findings, sessionId: result.sessionId };
}
// 画面再確認。初回指摘の解消状態だけを判定させる (§15)
export async function recheckVisual(call, input, issues, sessionId) {
    const result = await runClaude(call, { role: 'visual_recheck', prompt: visualRecheckPrompt(input, issues), images: [], sessionId });
    return { output: result.output.verdicts, sessionId: result.sessionId };
}
//# sourceMappingURL=claude.js.map