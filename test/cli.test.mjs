import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
test('package binary and every major command support --help without a project',()=>{
 for(const command of ['', 'create','init','doctor','validate','status','chat','plan','develop','regression']) {
  const output=execFileSync(process.execPath,[path.resolve('dist/cli/main.js'),...(command?[command]:[]),'--help'],{encoding:'utf8',cwd:'/tmp'});
  assert.match(output,/harness/);
 }
});
