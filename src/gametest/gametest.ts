import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { GameTestMapping } from '../acceptance/acceptance.js';
import { gradleLogs, runGradle } from '../build/gradle.js';
import type { GradleConfig } from '../config/config.js';
import { ExecutionFailure } from '../core/errors.js';
import type { Runner } from '../core/process.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import { readJUnitReport } from './junit.js';
import type { JUnitTestCase, TestCaseOutcome } from './junit.js';

// AC に対応付けた testcase の判定結果。missing は report に testcase が存在しない (§15.3)
export type GameTestCaseResult = { mapping: GameTestMapping; outcome: TestCaseOutcome | 'missing'; message: string; details: string };

// GameTest 工程の結果。output は GameTest task の出力の末尾
export type GameTestResult = { success: boolean; cases: GameTestCaseResult[]; output: string; logDir: string };

// Gradle の GameTest task を実行し、report を対応表と照合する。前回の report は実行前に削除する (§15.3)
export async function runGameTests(root: string, config: GradleConfig, mappings: GameTestMapping[], logDir: string, runner: Runner): Promise<GameTestResult> {
  const reports = [...new Set(mappings.map(mapping => path.resolve(root, mapping.report)))];
  for (const report of reports) await rm(report, { force: true });
  const task = await runGradle(root, config.gameTest, logDir, runner);
  const parsed = new Map<string, JUnitTestCase[] | null>();
  for (const report of reports) parsed.set(report, await readJUnitReport(report));
  const cases = mappings.map(mapping => judgeTestCase(mapping, parsed.get(path.resolve(root, mapping.report)) ?? []));
  // 対象外の testcase の失敗や server crash も task の失敗として扱う
  return { success: task.success && cases.every(item => item.outcome === 'passed'), cases, output: task.output, logDir };
}

// 対応表の testcase を report から探し、存在・実行済み・failure / error / skipped が 0 件かを判定する (§15.3)
export function judgeTestCase(mapping: GameTestMapping, cases: JUnitTestCase[]): GameTestCaseResult {
  const found = cases.filter(item => item.classname === mapping.classname && item.name === mapping.name);
  if (!found.length) return { mapping, outcome: 'missing', message: `Testcase is not in ${mapping.report}`, details: '' };
  const item = found.find(entry => entry.outcome !== 'passed') ?? found[0]!;
  return { mapping, outcome: item.outcome, message: item.message, details: item.details };
}

// 失敗した testcase の対象 AC・assertion・観測値・log を Codex 向けの ExecutionFailure にまとめる (§15.4)
export function gameTestFailure(result: GameTestResult, criteria: AcceptanceCriterion[]): ExecutionFailure {
  const failed = result.cases.filter(item => item.outcome !== 'passed');
  const details = failed.map(item => {
    const criterion = criteria.find(entry => entry.id === item.mapping.acId);
    return [
      `${item.mapping.acId} ${item.mapping.classname}.${item.mapping.name}: ${item.outcome}`,
      criterion && `Expected Result: ${criterion.expectedResult}`,
      item.message && `Message: ${item.message}`,
      item.details,
    ].filter(Boolean).join('\n');
  });
  if (!failed.length) details.push(`GameTest task failed:\n${result.output}`);
  const summary = failed.length ? `${failed.length} GameTest testcase(s) did not pass` : 'GameTest task failed';
  return new ExecutionFailure(summary, details.join('\n\n'), gradleLogs(result.logDir));
}
