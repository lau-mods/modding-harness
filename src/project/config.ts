import path from 'node:path';
import { readJson } from '../io.js';
import { validateSchema } from '../schema.js';

export type AgentConfig = { command: string; model: string | null };
export type Config = {
  contract: 1;
  project: { buildFile: string; metadata: string };
  gradle: { compile: string; build: string; test: string; gameTest: string | null };
  agents: { implementation: AgentConfig; review: AgentConfig };
  runtime: { provider: 'mc-pilot'; command: string; clients: string[];
    clientOptions?: { javaCommand?: string; maxMemory?: string; earlyWindowControl?: boolean };
    server: { command: string[]; directory: string; address: string } | null;
    deploy: { source: string; target: string }[]; logs: string[] };
};
export async function loadConfig(root: string): Promise<Config> {
  return validateSchema<Config>('config', await readJson(path.join(root, '.harness-config.json')));
}
