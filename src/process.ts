import { spawn } from 'node:child_process';

export type ProcessResult = { code: number; stdout: string; stderr: string };
export type ProcessOptions = { cwd: string; input?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; stdoutEncoding?: 'utf8' | 'base64' };
export type Runner = (command: string, args: string[], options: ProcessOptions) => Promise<ProcessResult>;

export const run: Runner = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd, env: { ...process.env, ...options.env }, shell: false,
    stdio: ['pipe', 'pipe', 'pipe'], detached: true,
  });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  let bytes = 0, failure: Error | undefined;
  const stop = (error: Error): void => {
    failure = error;
    try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ESRCH') failure = cause as Error; }
  };
  const timer = setTimeout(() => stop(new Error(`${command} timed out`)), options.timeoutMs ?? 1_800_000);
  const collect = (kind: 'stdout' | 'stderr', chunk: Buffer): void => {
    bytes += chunk.length;
    if (bytes > 16_000_000) { stop(new Error(`${command} output exceeded 16 MB`)); return; }
    (kind === 'stdout' ? stdout : stderr).push(chunk);
  };
  child.stdout.on('data', (chunk: Buffer) => collect('stdout', chunk));
  child.stderr.on('data', (chunk: Buffer) => collect('stderr', chunk));
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('close', (code, signal) => {
    clearTimeout(timer);
    if (failure) reject(failure);
    else resolve({ code: signal ? 1 : code ?? 1, stdout: Buffer.concat(stdout).toString(options.stdoutEncoding ?? 'utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
  });
  child.stdin.on('error', error => { if ((error as NodeJS.ErrnoException).code !== 'EPIPE') stop(error); });
  child.stdin.end(options.input ?? '');
});

export function success(result: ProcessResult, label: string): ProcessResult {
  if (result.code !== 0) throw new Error(`${label} failed (${result.code}): ${result.stderr.slice(-4000)} ${result.stdout.slice(-4000)}`);
  return result;
}
