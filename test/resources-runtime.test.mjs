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
test('runtime reuses the project superflat world across runs and restarts',async t=>{
 const {root,config}=await fixture(t),server=config.runtime.server.directory;
 await put(root,server+'/server.properties','server-ip=127.0.0.1\nserver-port=25575\nlevel-name=world\nlevel-type=minecraft:normal\ngenerator-settings={"biome":"minecraft:desert"}\n');
 await put(root,server+'/world/saved.txt','existing world');
 const properties=async()=>Object.fromEntries((await readFile(path.join(root,server,'server.properties'),'utf8')).split('\n').filter(line=>line.includes('=')).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
 for(const run of ['first','second']) {
  const dir=path.join(root,'.harness-state/evidence',run),pilot=new McPilot(root,config.runtime,dir);
  try {
   const first=await pilot.start(),initial=await properties(),world=initial['level-name'];
   assert.equal(world,'harness-superflat');assert.equal(initial['level-type'],'minecraft:flat');
   assert.deepEqual(JSON.parse(initial['generator-settings']),{biome:'minecraft:plains',layers:[{block:'minecraft:bedrock',height:1},{block:'minecraft:dirt',height:2},{block:'minecraft:grass_block',height:1}]});
   if(run==='first')await put(root,`${server}/${world}/saved.txt`,'persisted');
   else assert.equal(await readFile(path.join(root,server,world,'saved.txt'),'utf8'),'persisted');
   await pilot.stop();
   const second=await pilot.start();assert.notEqual(first,second);assert.equal((await properties())['level-name'],world);
   assert.equal(await readFile(path.join(root,server,world,'saved.txt'),'utf8'),'persisted');
   for(const generation of [first,second])assert.equal(JSON.parse(await readFile(path.join(dir,`runtime-start-${generation}.json`),'utf8')).world,world);
  } finally {await pilot.stop();}
 }
 assert.equal(await readFile(path.join(root,server,'world/saved.txt'),'utf8'),'existing world');
});
