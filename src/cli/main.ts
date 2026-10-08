#!/usr/bin/env node
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
  throw new Error('Not implemented');
}

// FatalError などの例外を利用者向けの表示と終了コードへ変換する (§23)
export function reportError(error: unknown): void {
  throw new Error('Not implemented');
}

// plan を端末表示用のテキストにする
export function formatPlan(plan: Plan): string {
  throw new Error('Not implemented');
}

main(process.argv.slice(2)).catch(reportError);
