// NeoForge server の代わり。起動完了を "Done" 行で知らせ、SIGTERM で保存して終了する
import { readFileSync } from 'node:fs';

const world = readFileSync('server.properties', 'utf8').match(/^level-name=(.*)$/m)?.[1];
setTimeout(() => console.log(`[Server thread/INFO]: Preparing level "${world}"\n[Server thread/INFO]: Done (0.1s)! For help, type "help"`), 100);
process.on('SIGTERM', () => {
  console.log('[Server thread/INFO]: Stopping server');
  process.exit(0);
});
setInterval(() => {}, 1000);
