import type { FatalError } from '../core/errors.js';
import type { Runner } from '../core/process.js';
import type { OverallStatus } from '../state/progress.js';
import type { WorkflowContext } from '../workflow/context.js';

// 開始条件を確認し、全 milestone を依存順に checkpoint まで進め、complete または fatal で終了する (§10, §24)
export async function developProject(root: string, runner: Runner): Promise<OverallStatus> {
  throw new Error('Not implemented');
}

// active な仕様・確定した plan・clean な作業ツリー・submodule・agent・Gradle・E2E 環境を確認する。不成立は FatalError (§10.1)
export async function checkStartConditions(ctx: WorkflowContext): Promise<void> {
  throw new Error('Not implemented');
}

// プロジェクト全体の完成条件を確認し、complete の progress を最終 checkpoint に含める (§24)
export async function completeProject(ctx: WorkflowContext): Promise<void> {
  throw new Error('Not implemented');
}

// fatal の原因と発生工程を progress に記録する (§23)
export async function recordFatal(ctx: WorkflowContext, error: FatalError): Promise<void> {
  throw new Error('Not implemented');
}
