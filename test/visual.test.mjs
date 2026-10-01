import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runRuntime, loadScenarios } from '../dist/verification/e2e.js';
import { parseProject } from '../dist/spec/parser.js';
import { run } from '../dist/process.js';
import { fixture, acId, put } from './helpers.mjs';

const issue = { severity:'major', category:'visual', file:'screenshot-1.png', lines:'GUI title', reason:'Specified title overlaps its border', requiredChange:'Keep the title within its border' };
const changes = issues => ({verdict:'changes_required',issues});

test('visual rereviews retain initial findings, suppress new noncritical issues, and allow critical issues',async t=>{
 const {root,config,spec}=await fixture(t,['visual']),scenarios=await loadScenarios(root,spec);
 const initial=changes([issue]);
 async function check(review,expectedInitial,passed,currentSpec=spec,currentScenarios=scenarios) {
  const runId=randomUUID(),dir=path.join(root,'.harness-state/evidence',runId);let reviewed=false;
  const runner=async(command,args,options)=>{
   if(command!==config.agents.review.command)return run(command,args,options);
   const input=options.input,context=JSON.parse(input.slice(input.indexOf('\n{'),input.indexOf('\nRead each attached')));
   assert.deepEqual(context.initialReview,expectedInitial);reviewed=true;
   assert.match(input,/new critical defects/);assert.match(input,/subsequent milestone reviews/);
   assert.ok((await readFile(path.join(options.cwd,'screenshot-1.png'))).length);
   return {code:0,stdout:JSON.stringify({subtype:'success',structured_output:review}),stderr:''};
  };
  const result=runRuntime(root,config,currentSpec,[acId],'M01',runId,dir,currentScenarios,async()=>{},runner);
  if(passed)assert.equal((await result).length,1);else await assert.rejects(result,/Visual review failed/);
  assert.equal(reviewed,true);
  const artifact=JSON.parse(await readFile(path.join(dir,`${acId}-${currentScenarios[0].id}-visual.json`),'utf8'));
  assert.deepEqual(artifact.result,review);
  assert.deepEqual(JSON.parse(await readFile(path.join(root,artifact.initialReview),'utf8')),expectedInitial ?? review);
  return artifact.effectiveReview;
 }
 await check(initial,null,false);
 await check(changes([{...issue,initialIssue:1,reason:'The same title still overflows after the fix'}]),initial,false);
 await put(root,'src/main/appearance.txt','changed implementation');
 const late=changes([{...issue,severity:'minor',initialIssue:null,reason:'New alignment detail'},
  {...issue,initialIssue:99,reason:'New border detail'},{...issue,reason:'Another new detail without a reference'}]);
 assert.deepEqual(await check(late,initial,true),{verdict:'pass',issues:[]});
 const critical=changes([{...issue,severity:'blocking',initialIssue:null,reason:'The entire required GUI is unreadable and unusable'}]);
 assert.deepEqual(await check(critical,initial,false),critical);
 await check(changes([{...issue,initialIssue:1}]),initial,false);
 await check({verdict:'pass',issues:[]},initial,true);
 const changed=parseProject(spec.text.replace('Exactly one result exists.','Exactly two results exist.'));
 await check(initial,null,false,changed);
 await check(initial,null,false,spec,[{...scenarios[0],id:'another-view'}]);
});

test('a failed visual reviewer does not establish a baseline; an initial pass freezes an empty issue list',async t=>{
 const {root,config,spec,settings}=await fixture(t,['visual']),scenarios=await loadScenarios(root,spec);
 let expected=null;
 const runner=async(command,args,options)=>{
  if(command===config.agents.review.command) {
   const input=options.input,context=JSON.parse(input.slice(input.indexOf('\n{'),input.indexOf('\nRead each attached')));
   assert.deepEqual(context.initialReview,expected);
  }
  return run(command,args,options);
 };
 const check=()=>{const id=randomUUID();return runRuntime(root,config,spec,[acId],'M01',id,path.join(root,'.harness-state/evidence',id),scenarios,async()=>{},runner);};
 await settings({invalidReview:true});await assert.rejects(check(),/JSON/);
 await settings({invalidReview:false});await check();
 expected={verdict:'pass',issues:[]};
 await settings({review:changes([{...issue,initialIssue:1}])});await check();
 await settings({review:changes([{...issue,severity:'blocking',initialIssue:null}])});await assert.rejects(check(),/Visual review failed/);
});
