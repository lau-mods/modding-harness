import { loadConfig } from '../config/config.js';
import { ExecutionFailure, FatalError } from '../core/errors.js';
import { run } from '../core/process.js';
import type { Runner } from '../core/process.js';
import { recordExecution } from '../core/records.js';
import { collectLogs, mcPilot, startRuntime, stopRuntime } from '../e2e/runtime.js';
import type { RuntimeSession } from '../e2e/runtime.js';

// server と全 client を起動し、各 client で world の状態を 1 回読んでから停止する。失敗時は段階とログの場所を示す FatalError (§7, §20, §25)
export async function preflight(root: string, runner: Runner = run): Promise<void> {
  const config = (await loadConfig(root)).runtime;
  await recordExecution(root, 'preflight', null, 1, async logDir => {
    let stage = 'start server and clients';
    let session: RuntimeSession | null = null;
    try {
      session = await startRuntime(root, config, logDir, runner);
      for (const name of config.clients) {
        stage = `read world state on ${name}`;
        const world = await mcPilot(root, config, ['--client', name, 'status', 'world'], runner) as { success?: boolean; error?: unknown } | null;
        if (world?.success !== true) throw new ExecutionFailure(`${name} returned ${JSON.stringify(world?.error ?? world)}`, 'preflight');
      }
      stage = 'stop server and clients';
    } catch (error) {
      throw new FatalError(`Preflight failed at "${stage}": ${(error as Error).message}\nLogs: ${logDir}`);
    } finally {
      await stopRuntime(root, config, runner);
      if (session) await collectLogs(root, session);
    }
  });
}
