import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ExecutionFailure, FatalError } from './errors.js';

// 外部コマンドの終了結果
export type ProcessResult = { code: number; stdout: string; stderr: string; durationMs: number };

// 外部コマンドの実行設定。logDir を指定すると command.json と stdout/stderr をそこへ保存する。signal が中断されると process group ごと停止する
export type ProcessOptions = { cwd: string; input?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; logDir?: string; signal?: AbortSignal };

// テストで差し替え可能な外部コマンド実行関数
export type Runner = (command: string, args: string[], options: ProcessOptions) => Promise<ProcessResult>;

// 外部コマンドを argv のまま実行する。executable が無ければ FatalError、timeout は ExecutionFailure、signal による中断は FatalError (§19.1, §23)
export async function run(command: string, args: string[], options: ProcessOptions): Promise<ProcessResult> {
  if (options.signal?.aborted) throw stopped(options.signal);
  const started = Date.now();
  let timedOut = false;
  const result = await new Promise<ProcessResult>((resolve, reject) => {
    // timeout 時に子孫 process ごと停止できるよう、独立した process group で起動する
    const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: 'pipe', detached: true });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* 既に終了している */ }
    }, options.timeoutMs);
    const abort = (): void => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* 既に終了している */ } };
    options.signal?.addEventListener('abort', abort, { once: true });
    child.on('close', () => options.signal?.removeEventListener('abort', abort));
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.stdin.on('error', () => {});
    child.on('error', error => {
      clearTimeout(timer);
      const code = (error as NodeJS.ErrnoException).code;
      reject(code === 'ENOENT' || code === 'EACCES' ? new FatalError(`Required executable is unavailable: ${command}`) : error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), durationMs: Date.now() - started });
    });
    child.stdin.end(options.input ?? '');
  });
  if (options.logDir) {
    await mkdir(options.logDir, { recursive: true });
    await writeFile(path.join(options.logDir, 'command.json'), JSON.stringify({ command, args, cwd: options.cwd, code: result.code, durationMs: result.durationMs }, null, 2) + '\n');
    await writeFile(path.join(options.logDir, 'stdout.log'), result.stdout);
    await writeFile(path.join(options.logDir, 'stderr.log'), result.stderr);
  }
  if (options.signal?.aborted) throw stopped(options.signal);
  // timeout でも log を保存してから失敗にする
  if (timedOut) {
    const logs = options.logDir ? [path.join(options.logDir, 'stdout.log'), path.join(options.logDir, 'stderr.log')] : [];
    throw new ExecutionFailure(`${path.basename(command)} timed out after ${options.timeoutMs} ms`, tail(result.stderr + result.stdout, 4000), logs);
  }
  return result;
}

// 終了コードが 0 でなければ ExecutionFailure を投げる (§19.1)
export function requireSuccess(result: ProcessResult, operation: string): ProcessResult {
  if (result.code !== 0) throw new ExecutionFailure(`${operation} failed (exit ${result.code})`, tail(result.stderr + result.stdout, 4000));
  return result;
}

// signal の中断理由を FatalError にする
function stopped(signal: AbortSignal): FatalError {
  return signal.reason instanceof FatalError ? signal.reason : new FatalError(String(signal.reason ?? 'The workflow was stopped'));
}

// 文字列の末尾 length 文字を返す
export function tail(text: string, length: number): string {
  return text.length > length ? text.slice(-length) : text;
}
