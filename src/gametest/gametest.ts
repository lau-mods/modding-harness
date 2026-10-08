import type { GameTestMapping } from '../acceptance/acceptance.js';
import type { GradleConfig } from '../config/config.js';
import type { FailureReport } from '../core/errors.js';
import type { Runner } from '../core/process.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { JUnitTestCase, TestCaseOutcome } from './junit.js';

// AC に対応付けた testcase の判定結果。missing は report に testcase が存在しない (§15.3)
export type GameTestCaseResult = { mapping: GameTestMapping; outcome: TestCaseOutcome | 'missing'; message: string; details: string };

// GameTest 工程の結果
export type GameTestResult = { success: boolean; cases: GameTestCaseResult[]; logDir: string };

// Gradle の GameTest task を実行し、report を対応表と照合する。server crash は ExecutionFailure (§15.3, §19.1)
export async function runGameTests(root: string, config: GradleConfig, mappings: GameTestMapping[], logDir: string, runner: Runner): Promise<GameTestResult> {
  throw new Error('Not implemented');
}

// 対応表の testcase を report から探し、存在・実行済み・failure / error / skipped が 0 件かを判定する (§15.3)
export function judgeTestCase(mapping: GameTestMapping, cases: JUnitTestCase[]): GameTestCaseResult {
  throw new Error('Not implemented');
}

// 失敗した testcase の対象 AC・assertion・観測値・log を Codex 向けの失敗情報にまとめる (§15.4)
export function gameTestFailureReport(result: GameTestResult, criteria: AcceptanceCriterion[]): FailureReport {
  throw new Error('Not implemented');
}
