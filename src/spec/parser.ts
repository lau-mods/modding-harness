import type { ProjectSpec } from './types.js';

// PROJECT.md の Markdown を ProjectSpec に変換する。見出し構造が成立しない場合は例外を投げる (§3)
export function parseProject(text: string): ProjectSpec {
  throw new Error('Not implemented');
}

// project root の PROJECT.md を読み込んで parse する。読めない場合は FatalError (§20)
export async function readProject(root: string): Promise<ProjectSpec> {
  throw new Error('Not implemented');
}
