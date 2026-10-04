#!/usr/bin/env node
// MC Pilot CLI の代わりに JSON envelope を返す。呼び出しは FAKE_STATE/mct.log に記録する
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
appendFileSync(path.join(process.env.FAKE_STATE, 'mct.log'), args.join(' ') + '\n');
let data = {};
if (args[0] === '--cli-version') data = { version: 'fake' };
if (args[0] === 'client' && args[1] === 'wait-ready') data = { connected: true, inWorld: true };
if (args[0] === 'client' && args[1] === 'list') data = { clients: [{ name: 'harness-a', running: false, loader: 'neoforge' }] };
// gameplay コマンドは client の応答を内側の envelope に包んで返す
const gameplay = args[0] === '--client' ? args.slice(2) : args;
if (gameplay[0] === 'status') data = { success: true, data: { dimension: process.env.FAKE_DIMENSION ?? 'minecraft:overworld' }, error: null };
if (gameplay[0] === 'fail') data = { success: false, data: null, error: 'NOT_IN_WORLD' };
if (gameplay[0] === 'screenshot') {
  const output = gameplay[gameplay.indexOf('--output') + 1];
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, Buffer.from('89504e470d0a1a0a', 'hex'));
  data = { success: true, data: { path: output }, error: null };
}
process.stdout.write(JSON.stringify({ success: true, data }));
