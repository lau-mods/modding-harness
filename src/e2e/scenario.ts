import type { E2EMapping } from '../acceptance/acceptance.js';
import type { RuntimeConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
import type { RuntimeSession } from './runtime.js';

// 実行する scenario。同じ scenario ファイルに対応付けた AC をまとめる (§16.3)
export type ScenarioDefinition = { id: string; file: string; acIds: string[] };

// scenario が撮影した screenshot と対象 AC (§16.2 Screenshot と AC の対応付け)
export type Screenshot = { acId: string; file: string; label: string };

// scenario 1 件の実行結果。success はシーン準備と screenshot 取得の完了を表す (§16.4)
export type ScenarioResult = {
  scenarioId: string;
  acIds: string[];
  success: boolean;
  screenshots: Screenshot[];
  error: string | null;
  logDir: string; // 実行 log の保存先
};

// 対応表の E2E を scenario ファイル単位にまとめる
export function groupScenarios(mappings: E2EMapping[]): ScenarioDefinition[] {
  throw new Error('Not implemented');
}

// scenario を node で実行し、結果ファイルを読む。process 失敗・結果欠落・screenshot 欠落は ExecutionFailure (§16.4, §19.1)
export async function runScenario(root: string, config: RuntimeConfig, scenario: ScenarioDefinition, session: RuntimeSession, logDir: string, runner: Runner): Promise<ScenarioResult> {
  throw new Error('Not implemented');
}

// scenario process に渡す環境変数 (MC Pilot command・client 名・結果と screenshot の出力先など) を組み立てる (§16.2)
export function scenarioEnv(root: string, config: RuntimeConfig, session: RuntimeSession, scenario: ScenarioDefinition, resultFile: string, screenshotDir: string): NodeJS.ProcessEnv {
  throw new Error('Not implemented');
}

// scenario が書いた結果 JSON を検証して ScenarioResult にする
export function parseScenarioResult(value: unknown, scenario: ScenarioDefinition, logDir: string): ScenarioResult {
  throw new Error('Not implemented');
}
