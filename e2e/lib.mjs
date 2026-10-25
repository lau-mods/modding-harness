// E2E scenario の共通テンプレート。scenario は `await import(process.env.HARNESS_E2E_LIB)` で読み込む (§16.2)
// server / client の起動・停止と Mod 配置は Harness が行い、scenario はシーン準備・camera 設定・撮影だけを行う
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const screenshots = [];

// Harness が起動して world に参加済みの client 名
export const clients = JSON.parse(process.env.HARNESS_CLIENTS ?? '[]');

// client を指定して MC Pilot を実行し、envelope を外した data を返す。失敗なら例外を投げる
export function mct(client, ...args) {
  const output = execFileSync(process.env.HARNESS_MCT, client ? ['--client', client, ...args] : args, { encoding: 'utf8' });
  const outer = JSON.parse(output);
  if (outer.success !== true) throw new Error(`MC Pilot ${args.join(' ')} failed: ${JSON.stringify(outer.error ?? outer)}`);
  // client 側の command 結果は内側にも envelope を持つ
  const inner = outer.data;
  const wrapped = inner !== null && typeof inner === 'object' && 'success' in inner && 'data' in inner && 'error' in inner;
  if (!wrapped) return inner;
  if (inner.success !== true) throw new Error(`MC Pilot ${args.join(' ')} failed: ${JSON.stringify(inner.error)}`);
  return inner.data;
}

// client の operator player として slash command を実行する。block の設置など scenario 固有のシーン準備に使う (§16.3)
export function command(client, text) {
  return mct(client, 'chat', 'command', text.replace(/^\//, ''));
}

// read() の値が until を満たすまで読み直し、最後に読んだ値を返す。描画前の状態変化を待つときに使う
export async function waitFor(read, until, timeoutMs = 30_000, intervalMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!until(value) && Date.now() < deadline) {
    await sleep(intervalMs);
    value = await read();
  }
  return value;
}

// client の player を指定の位置と向きへ移動し、chunk と model の描画を待つ (§16.2 Camera Setup)
export async function camera(client, { x, y, z, yaw = 0, pitch = 0 }, settleMs = 3_000) {
  command(client, `tp @s ${x} ${y} ${z} ${yaw} ${pitch}`);
  await sleep(settleMs);
}

// client の画面を撮影し、対象 AC と対応付けて結果に記録する (§16.2 Screenshot)
export function screenshot(client, acId, label) {
  const file = `${acId}-${label}`.replace(/[^\w.-]+/g, '-') + '.png';
  mct(client, 'screenshot', '--output', path.join(process.env.HARNESS_SCREENSHOT_DIR, file));
  screenshots.push({ acId, file, label });
  return file;
}

// scenario 本体を実行して結果ファイルを書く。本体の例外は scenario の失敗として記録する (§16.4)
export async function scenario(body) {
  let error = null;
  try {
    await body({ clients });
  } catch (caught) {
    error = String(caught?.stack ?? caught);
  }
  writeFileSync(process.env.HARNESS_RESULT_FILE, JSON.stringify({ scenarioId: process.env.HARNESS_SCENARIO_ID, screenshots, error }, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
