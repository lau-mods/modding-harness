#!/usr/bin/env node
// gradlew の代わり。src/BROKEN があれば compile を失敗させ、build では build/libs に jar を作る
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const task = process.argv[2];
if (task === 'classes' && existsSync('src/BROKEN')) {
  console.log('> Task :compileJava FAILED');
  console.error('src/Main.java:1: error: cannot find symbol');
  process.exit(1);
}
if (task === 'build') {
  mkdirSync('build/libs', { recursive: true });
  writeFileSync('build/libs/testmod-1.0.jar', 'jar');
}
console.log(`BUILD SUCCESSFUL (${task})`);
