import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateResources } from '../dist/verification/static.js';
import { McPilot } from '../dist/runtime/mc-pilot.js';
import { fixture, temp, put } from './helpers.mjs';

test('resource JSON, duplicate identifiers, invalid asset paths and local references',async t=>{
 for(const [files,expected] of [
  [{'assets/test/models/item/a.json':'{'},/Invalid JSON/],
  [{'assets/test/Bad.json':'{}'},/Invalid asset/],
  [{'assets/test/models/item/a.json':JSON.stringify({parent:'test:block/missing'})},/Missing local models/],
  [{'assets/test/models/item/a.json':JSON.stringify({textures:{layer0:'test:item/missing'}})},/Missing local textures/],
 ]) {const root=await temp(t);for(const [file,data]of Object.entries(files))await put(root,'src/main/resources/'+file,data);await assert.rejects(validateResources(root),expected);}
 const root=await temp(t);for(const base of ['src/main/resources','src/generated/resources'])await put(root,base+'/assets/test/lang/en_us.json','{}');
 await assert.rejects(validateResources(root),/Duplicate resource/);
});
test('runtime log errors fail and historical client errors are excluded by offset',async t=>{
 const {root,config}=await fixture(t);const log='.harness-state/runtime/client.log';await put(root,log,'old ERROR should not affect a new run\n');
 config.runtime.logs=[log];const dir=path.join(root,'.harness-state/evidence/log-test');const pilot=new McPilot(root,config.runtime,dir);
 await pilot.start();await pilot.stop();await pilot.scanLogs();
 await put(root,'.harness-state/evidence/log-test/runtime.log',(await readFile(path.join(dir,'runtime.log'),'utf8'))+'new ERROR failure\n');
 await assert.rejects(pilot.scanLogs(),/log scan found/);
});
test('unexpected server exit makes runtime fail even when clients report stop success',async t=>{
 const {root,config}=await fixture(t);await put(root,'.fake-bin/server.cjs',`console.log('Done (0.1s)!');setTimeout(()=>process.exit(7),250);`);
 const pilot=new McPilot(root,config.runtime,path.join(root,'.harness-state/evidence/exit-test'));
 try {await pilot.start();await new Promise(resolve=>setTimeout(resolve,400));}
 finally {await assert.rejects(pilot.stop(),/shutdown|exited/);}
});
