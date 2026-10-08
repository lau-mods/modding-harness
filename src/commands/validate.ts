import type { Plan } from '../plan/plan.js';
import type { ProjectSpec } from '../spec/types.js';
import type { Progress } from '../state/progress.js';

// validate の結果。spec は PROJECT.md を解釈できた場合だけ設定する (§9.4)
export type ValidationReport = { spec: ProjectSpec | null; problems: string[] };

// 仕様・設定・plan・GameTest / E2E の対応・progress を検査して問題を列挙する (§9.4)
export async function validateProject(root: string): Promise<ValidationReport> {
  throw new Error('Not implemented');
}

// progress の完成済み milestone・現在 milestone・checkpoint が plan と Git 履歴に整合するか検査する (§9.4)
export async function checkProgress(root: string, progress: Progress, plan: Plan): Promise<string[]> {
  throw new Error('Not implemented');
}
