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
import { FatalError } from '../core/errors.js';
import { run } from '../core/process.js';
import type { Plan } from '../plan/plan.js';

// CLI のサブコマンド (§9)
export type Command = 'create' | 'init' | 'doctor' | 'validate' | 'status' | 'chat' | 'plan' | 'develop';

// 各サブコマンドの usage
export const usage: Record<Command, string> = {
  create: 'harness create <directory> --template-repo <repo> [--template-ref <ref>]\nCreate a NeoForge workspace with Harness as the .harness submodule.',
  init: 'harness init [--project <directory>]\nInitialize an existing workspace.',
  doctor: 'harness doctor [--project <directory>]\nDiagnose the development environment.',
  validate: 'harness validate [--project <directory>]\nValidate the specification, configuration and plan.',
  status: 'harness status [--project <directory>]\nShow the development state.',
  chat: 'harness chat <product change request> [--project <directory>]\nEdit the product specification and replan.',
  plan: 'harness plan [--project <directory>]\nGenerate the milestone plan.',
  develop: 'harness develop [--project <directory>]\nRun automated development until complete or fatal.',
};

// 引数を parse してサブコマンドへ振り分ける (§9)
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
  const root = path.resolve(values.project ?? process.cwd());
  switch (name as Command) {
    case 'create': {
      const templateRepo = values['template-repo'];
      if (rest.length !== 1 || !templateRepo) throw new Error(usage.create);
      const templateRef = values['template-ref'];
      await createProject(rest[0]!, templateRef ? { templateRepo, templateRef } : { templateRepo }, run);
      console.log(`Created ${rest[0]}. Configure .harness-config.json, run harness doctor, then write PROJECT.md.`);
      break;
    }
    case 'init':
      await initProject(root);
      console.log('Initialized. Configure .harness-config.json, run harness doctor, then write PROJECT.md.');
      break;
    case 'doctor': {
      const diagnostics = await doctor(root, run);
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
      const plan = await chatProject(root, rest.join(' '), run);
      console.log(plan ? `PROJECT.md updated and the plan is fixed.\n${formatPlan(plan)}` : 'PROJECT.md updated. Planning waits until PROJECT.md meets the active conditions (see harness validate).');
      break;
    }
    case 'plan':
      console.log(formatPlan(await planProject(root, run)));
      break;
    case 'develop':
      console.log(`Development ${await developProject(root, run)}.`);
      break;
  }
}

// FatalError などの例外を利用者向けの表示と終了コードへ変換する (§23)
export function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`harness: ${error instanceof FatalError ? 'fatal: ' : ''}${message}`);
  process.exitCode = 1;
}

// plan を端末表示用のテキストにする
export function formatPlan(plan: Plan): string {
  return plan.milestones.map(milestone => {
    const dependencies = milestone.dependsOn.length ? ` (after ${milestone.dependsOn.join(', ')})` : '';
    return `${milestone.id} [${milestone.features.join(', ')}]${dependencies} ${milestone.approach}`;
  }).join('\n');
}

main(process.argv.slice(2)).catch(reportError);
