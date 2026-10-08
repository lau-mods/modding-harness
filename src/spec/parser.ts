import type { ProjectSpec } from './types.js';

// PROJECT.md の本文を ProjectSpec に変換する。見出し構造を解釈できなければ FatalError (§5.2, §23)
export function parseProject(text: string): ProjectSpec {
  throw new Error('Not implemented');
}

// Workspace の PROJECT.md を読み込んで ProjectSpec を返す (§5.1)
export async function readProject(root: string): Promise<ProjectSpec> {
  throw new Error('Not implemented');
}
