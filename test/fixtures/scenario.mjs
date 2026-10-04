// テスト用 E2E scenario。src/FEATURE_OK の有無を観測結果にし、server 再起動と screenshot を行う
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const failures = path.join(process.env.FAKE_STATE, 'scenario-failures');
if (existsSync(failures)) {
  const remaining = Number(readFileSync(failures, 'utf8'));
  if (remaining > 0) {
    writeFileSync(failures, String(remaining - 1));
    process.exit(3);
  }
}
const { scenario, mct, check, screenshot } = await import(process.env.HARNESS_E2E_LIB);
await scenario(async ({ clients }) => {
  const control = JSON.parse(process.env.HARNESS_SERVER_CONTROL);
  execFileSync(control[0], [...control.slice(1), 'stop']);
  execFileSync(control[0], [...control.slice(1), 'start']);
  check('in_overworld', 'minecraft:overworld', mct(clients[0], 'status', 'world').dimension);
  if (process.env.HARNESS_SCENARIO_ID !== 'main') return;
  check('feature_enabled', true, existsSync('src/FEATURE_OK'));
  screenshot(clients[0], 'shot');
});
