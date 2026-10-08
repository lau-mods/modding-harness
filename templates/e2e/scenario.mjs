// プロジェクト固有 E2E scenario の雛形。tests/e2e/ に複製して対象 AC の表示状態と撮影位置を記述する (§16.3)
const { camera, scenario, screenshot, serverCommand } = await import(process.env.HARNESS_E2E_LIB);

await scenario(async ({ clients }) => {
  // 対象 AC の表示状態を作り、観測できる視点を設定して撮影する
});
