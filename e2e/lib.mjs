// E2E scenario の共通テンプレート。scenario は `await import(process.env.HARNESS_E2E_LIB)` で読み込む (§16.2)
// server / client の起動・停止と Mod 配置は Harness が行い、scenario はシーン準備・camera 設定・撮影だけを行う

// Harness が起動して world に参加済みの client 名
export const clients = [];

// client を指定して MC Pilot を実行し、envelope を外した data を返す。失敗なら例外を投げる
export function mct(client, ...args) {
  throw new Error('Not implemented');
}

// server console へ command を送る。block の設置など scenario 固有のシーン準備に使う (§16.3)
export function serverCommand(command) {
  throw new Error('Not implemented');
}

// read() の値が until を満たすまで読み直し、最後に読んだ値を返す。描画前の状態変化を待つときに使う
export async function waitFor(read, until, timeoutMs = 30_000, intervalMs = 1_000) {
  throw new Error('Not implemented');
}

// client の camera の位置と向きを設定する (§16.2 Camera Setup)
export function camera(client, { x, y, z, yaw, pitch }) {
  throw new Error('Not implemented');
}

// client の画面を撮影し、対象 AC と対応付けて結果に記録する (§16.2 Screenshot)
export function screenshot(client, acId, label) {
  throw new Error('Not implemented');
}

// scenario 本体を実行して結果ファイルを書く。本体の例外は scenario の失敗として記録する (§16.4)
export async function scenario(body) {
  throw new Error('Not implemented');
}
