// プロジェクト固有 E2E scenario の雛形。tests/e2e/ に複製して対象 AC の表示状態と撮影位置を記述する (§16.3)
const { camera, command, scenario, screenshot } = await import(process.env.HARNESS_E2E_LIB);

await scenario(async ({ clients }) => {
  const client = clients[0];
  // 対象 AC の表示状態を作る
  command(client, 'setblock 0 -60 2 minecraft:stone');
  // 観測できる視点を設定して撮影する
  await camera(client, { x: 0.5, y: -59, z: -0.5, yaw: 0, pitch: 20 });
  screenshot(client, 'AC-F001-001', 'front');
});
