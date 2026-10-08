import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ExecutionFailure, FatalError } from './errors.js';
// 外部コマンドを argv のまま直接実行する。executable が存在しない場合は FatalError、timeout は ExecutionFailure (§17, §20)
export async function run(command, args, options) {
    const started = Date.now();
    const result = await new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: 'pipe', detached: true });
        const stdout = [], stderr = [];
        let timedOut = false;
        const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
            timedOut = true;
            process.kill(-child.pid, 'SIGKILL');
        }, options.timeoutMs);
        child.stdout.on('data', (chunk) => stdout.push(chunk));
        child.stderr.on('data', (chunk) => stderr.push(chunk));
        child.stdin.on('error', () => { });
        child.on('error', error => {
            clearTimeout(timer);
            const code = error.code;
            reject(code === 'ENOENT' || code === 'EACCES' ? new FatalError(`Required executable is unavailable: ${command}`) : error);
        });
        child.on('close', code => {
            clearTimeout(timer);
            const output = { code: code ?? 1, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), durationMs: Date.now() - started };
            if (timedOut)
                reject(new ExecutionFailure(`${path.basename(command)} timed out after ${options.timeoutMs} ms`));
            else
                resolve(output);
        });
        child.stdin.end(options.input ?? '');
    });
    if (options.logDir) {
        await mkdir(options.logDir, { recursive: true });
        await writeFile(path.join(options.logDir, 'command.json'), JSON.stringify({ command, args, cwd: options.cwd, code: result.code, durationMs: result.durationMs }, null, 2) + '\n');
        await writeFile(path.join(options.logDir, 'stdout.log'), result.stdout);
        await writeFile(path.join(options.logDir, 'stderr.log'), result.stderr);
    }
    return result;
}
// 終了コードが 0 でなければ ExecutionFailure を投げる (§17)
export function requireSuccess(result, operation) {
    if (result.code !== 0)
        throw new ExecutionFailure(`${operation} failed (exit ${result.code}): ${tail(result.stderr + result.stdout, 2000)}`);
    return result;
}
// 文字列の末尾 length 文字を返す
export function tail(text, length) {
    return text.length > length ? text.slice(-length) : text;
}
//# sourceMappingURL=process.js.map