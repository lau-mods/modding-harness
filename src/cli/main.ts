#!/usr/bin/env node

// CLI のサブコマンド (§25)
export type Command = 'create' | 'init' | 'doctor' | 'validate' | 'status' | 'chat' | 'plan' | 'develop';

// 各サブコマンドの usage
export const usage: Record<Command, string> = {
  create: 'harness create <directory> --template-repo <repo> [--template-ref <revision>]\nCreate a NeoForge project.',
  init: 'harness init [--project <directory>]\nInitialize the project as managed by Harness.',
  doctor: 'harness doctor [--project <directory>]\nCheck the required development environment.',
  validate: 'harness validate [--project <directory>]\nValidate PROJECT.md and Harness configuration.',
  status: 'harness status [--project <directory>]\nShow the current execution state.',
  chat: 'harness chat <product change request> [--project <directory>]\nChange the product specification and replan.',
  plan: 'harness plan [--project <directory>]\nCreate the milestone plan.',
  develop: 'harness develop [--project <directory>]\nDevelop all milestones automatically.',
};

// 引数を parse してサブコマンドへ振り分ける
export async function main(args: string[]): Promise<void> {
  throw new Error('Not implemented');
}

// FatalError などの例外を利用者向けの表示と終了コードへ変換する (§20)
export function reportError(error: unknown): void {
  throw new Error('Not implemented');
}

main(process.argv.slice(2)).catch(reportError);
