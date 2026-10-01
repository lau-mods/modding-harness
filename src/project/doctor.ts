import path from 'node:path';
import { exists } from '../io.js';
import { run } from '../process.js';
import type { Runner } from '../process.js';
import { loadConfig } from './config.js';
import { codexArgs, claudeArgs } from '../agents/agents.js';

export type Diagnostic = { name: string; status: 'available' | 'unavailable' | 'misconfigured'; detail: string };
export async function doctor(root: string, runner: Runner = run): Promise<Diagnostic[]> {
  const result: Diagnostic[] = [];
  let implementation = 'codex', review = 'claude', pilot = 'mct';
  if (await exists(path.join(root, '.harness-config.json'))) {
    try {
      const config = await loadConfig(root);
      implementation = config.agents.implementation.command; review = config.agents.review.command; pilot = config.runtime.command;
    } catch (error) { result.push({ name: 'config', status: 'misconfigured', detail: (error as Error).message }); }
  }
  const tools: [string, string, string[]][] = [
    ['node', process.execPath, ['--version']], ['git', 'git', ['--version']], ['java', 'java', ['-version']],
    ['Gradle wrapper', path.join(root, 'gradlew'), ['--version', '--no-daemon']],
    ['codex', implementation, ['exec', '--help']], ['claude', review, ['--help']], ['MC Pilot', pilot, ['--help']],
  ];
  for (const [name, command, args] of tools) {
    try {
      const execution = await runner(command, args, { cwd: root, timeoutMs: 60_000 });
      const output = execution.stdout + execution.stderr;
      const emitted = name === 'codex' ? codexArgs(null, 'schema.json', 'output.json') : name === 'claude' ? claudeArgs(null) : [];
      const required = name === 'MC Pilot' ? ['client', 'schema'] : [...new Set(emitted.filter(arg => arg.startsWith('--')))];
      const compatible = execution.code === 0 && required.every(flag => output.includes(flag)) && (name !== 'node' || Number(execution.stdout.match(/^v(\d+)/)?.[1]) >= 20);
      result.push({ name, status: compatible ? 'available' : 'misconfigured', detail: compatible ? output.split('\n').find(line => line.trim())?.slice(0, 160) ?? 'OK' : 'Command failed or required CLI contract is missing' });
    } catch (error) {
      result.push({ name, status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'unavailable' : 'misconfigured', detail: (error as Error).message });
    }
  }
  return result;
}
