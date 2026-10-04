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
const mct = (...args) => execFileSync(process.env.HARNESS_MCT, args);
const control = JSON.parse(process.env.HARNESS_SERVER_CONTROL);
execFileSync(control[0], [...control.slice(1), 'stop']);
execFileSync(control[0], [...control.slice(1), 'start']);
mct('screenshot', '--output', path.join(process.env.HARNESS_SCREENSHOT_DIR, 'shot.png'));
const ok = existsSync('src/FEATURE_OK');
writeFileSync(process.env.HARNESS_RESULT_FILE, JSON.stringify({
  scenarioId: process.env.HARNESS_SCENARIO_ID,
  passed: ok,
  assertions: [{ name: 'feature_enabled', expected: true, actual: ok, passed: ok }],
  screenshots: ['shot.png'],
}));
