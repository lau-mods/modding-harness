// E2E scenario の共通 helper。MC Pilot の呼び出し、状態変化の待機、assertion と screenshot の記録、結果ファイルの書き出しを扱う
// scenario は `await import(process.env.HARNESS_E2E_LIB)` で読み込む
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const assertions = [];
const screenshots = [];

// Harness が起動して world に参加済みの client 名
export const clients = JSON.parse(process.env.HARNESS_CLIENTS ?? '[]');

// client を指定して MC Pilot を実行し、外側と内側の envelope を外した data を返す。どちらかが失敗なら例外を投げる
export function mct(client, ...args) {
  const output = execFileSync(process.env.HARNESS_MCT, client ? ['--client', client, ...args] : args, { encoding: 'utf8' });
  const outer = JSON.parse(output);
  if (outer.success !== true) throw new Error(`MC Pilot ${args.join(' ')} failed: ${JSON.stringify(outer.error ?? outer)}`);
  const inner = outer.data;
  const wrapped = inner !== null && typeof inner === 'object' && 'success' in inner && 'data' in inner && 'error' in inner;
  if (!wrapped) return inner;
  if (inner.success !== true) throw new Error(`MC Pilot ${args.join(' ')} failed: ${JSON.stringify(inner.error)}`);
  return inner.data;
}

// read() の値が until を満たすまで interval ごとに読み直し、最後に読んだ値を返す。非同期の状態変化を観測する前に使う
export async function waitFor(read, until, timeoutMs = 30_000, intervalMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!until(value) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    value = await read();
  }
  return value;
}

// 観測値 actual を記録する。passed の既定は expected との JSON 一致で、actual が null / undefined なら不合格
export function check(name, expected, actual, passed = actual !== null && actual !== undefined && JSON.stringify(actual) === JSON.stringify(expected)) {
  assertions.push({ name, expected, actual: actual ?? null, passed: Boolean(passed) });
  return Boolean(passed);
}

// client の画面を HARNESS_SCREENSHOT_DIR に保存し、結果の screenshots に加える
export function screenshot(client, name) {
  const file = `${name}.png`;
  mct(client, 'screenshot', '--output', path.join(process.env.HARNESS_SCREENSHOT_DIR, file));
  screenshots.push(file);
  return file;
}

// scenario 本体を実行して結果ファイルを書く。本体の例外は scenario_error という不合格の assertion として記録する
export async function scenario(body) {
  try {
    await body({ clients });
  } catch (error) {
    check('scenario_error', 'completed', String(error?.stack ?? error), false);
  }
  writeFileSync(process.env.HARNESS_RESULT_FILE, JSON.stringify({
    scenarioId: process.env.HARNESS_SCENARIO_ID,
    passed: assertions.length > 0 && assertions.every(assertion => assertion.passed),
    assertions,
    screenshots,
  }));
}
