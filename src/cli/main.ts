#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chatProject } from '../commands/chat.js';
import { createProject } from '../commands/create.js';
import { developProject } from '../commands/develop.js';
import { doctor } from '../commands/doctor.js';
import { initProject } from '../commands/init.js';
import { planProject } from '../commands/plan.js';
import { collectStatus, formatStatus } from '../commands/status.js';
import { validateProject } from '../commands/validate.js';
import { loadConfig } from '../config/config.js';
import { FatalError } from '../core/errors.js';
import { startServer, stopServer } from '../e2e/runtime.js';
import type { Plan } from '../plan/plan.js';

// CLI のサブコマンド (§25)。server は E2E scenario が server を再起動するために使う
export type Command = 'create' | 'init' | 'doctor' | 'validate' | 'status' | 'chat' | 'plan' | 'develop' | 'server';

// 各サブコマンドの usage
export const usage: Record<Command, string> = {
  create: 'harness create <directory> --template-repo <repo> [--template-ref <branch-or-tag>]\nCreate a NeoForge project.',
  init: 'harness init [--project <directory>]\nInitialize the project as managed by Harness.',
  doctor: 'harness doctor [--project <directory>]\nCheck the required development environment.',
  validate: 'harness validate [--project <directory>]\nValidate PROJECT.md and Harness configuration.',
  status: 'harness status [--project <directory>]\nShow the current execution state.',
  chat: 'harness chat <product change request> [--project <directory>]\nChange the product specification and replan.',
  plan: 'harness plan [--project <directory>]\nCreate the milestone plan.',
  develop: 'harness develop [--project <directory>]\nDevelop all milestones automatically.',
  server: 'harness server start|stop [--project <directory>]\nStart or stop the NeoForge server used by E2E scenarios.',
};

// 引数を parse してサブコマンドへ振り分ける
export async function main(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h' }, project: { type: 'string' }, 'template-repo': { type: 'string' }, 'template-ref': { type: 'string' } },
  });
  const [name, ...rest] = positionals;
  if (!name || values.help) {
    console.log(name && name in usage ? usage[name as Command] : `Usage:\n${Object.values(usage).map(text => `  ${text.split('\n')[0]}`).join('\n')}`);
    return;
  }
  if (!(name in usage)) throw new Error(`Unknown command: ${name}`);
  const command = name as Command;
  const root = path.resolve(values.project ?? process.cwd());
  switch (command) {
    case 'create': {
      const templateRepo = values['template-repo'];
      if (rest.length !== 1 || !templateRepo) throw new Error(usage.create);
      const templateRef = values['template-ref'];
      await createProject(path.resolve(rest[0]!), templateRef ? { templateRepo, templateRef } : { templateRepo });
      console.log(`Created ${rest[0]}. Write PROJECT.md, set Status: active, commit, then run harness develop.`);
      break;
    }
    case 'init':
      await initProject(root);
      console.log('Initialized. Write PROJECT.md, review .harness-config.json, commit, then run harness develop.');
      break;
    case 'doctor': {
      const diagnostics = await doctor(root);
      for (const item of diagnostics) console.log(`${item.status.padEnd(13)} ${item.name}: ${item.detail.split('\n')[0]}`);
      if (diagnostics.some(item => item.status !== 'ok')) process.exitCode = 1;
      break;
    }
    case 'validate': {
      const report = await validateProject(root);
      if (report.problems.length) {
        console.log(`Problems:\n${report.problems.map(problem => `- ${problem}`).join('\n')}`);
        process.exitCode = 1;
      } else console.log(`Valid: PROJECT.md is ${report.spec?.status}`);
      break;
    }
    case 'status':
      console.log(formatStatus(await collectStatus(root)));
      break;
    case 'chat': {
      const plan = await chatProject(root, rest.join(' '));
      console.log(plan ? `PROJECT.md updated.\n${formatPlan(plan)}` : 'PROJECT.md updated. Planning waits until PROJECT.md meets the active conditions (see harness validate).');
      break;
    }
    case 'plan':
      console.log(formatPlan(await planProject(root)));
      break;
    case 'develop':
      console.log(`Development ${await developProject(root)}.`);
      break;
    case 'server': {
      const config = await loadConfig(root);
      if (rest[0] === 'start') await startServer(root, config.runtime);
      else if (rest[0] === 'stop') await stopServer(root);
      else throw new Error(usage.server);
      break;
    }
  }
}

// FatalError などの例外を利用者向けの表示と終了コードへ変換する (§20)
export function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`harness: ${error instanceof FatalError ? 'fatal: ' : ''}${message}`);
  process.exitCode = 1;
}

function formatPlan(plan: Plan): string {
  return plan.milestones.map(milestone => `${milestone.id} [${milestone.acIds.join(', ')}] ${milestone.summary}`).join('\n');
}

main(process.argv.slice(2)).catch(reportError);
