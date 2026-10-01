import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { developProject } from '../dist/workflow.js';
import { loadState } from '../dist/state/state.js';
import { validateProject } from '../dist/project/project.js';
import { exists } from '../dist/io.js';
import { run } from '../dist/process.js';
import { fixture } from './helpers.mjs';

const read = async file => JSON.parse(await readFile(file,'utf8'));

test('non-scenario errors retry only E2E, retaining previous attempts and earlier gates',async t=>{
 const {root,config}=await fixture(t,['unit','gametest','e2e']);
 let failNext=true,reviews=0;const tasks=[];
 const runner=async(command,args,options)=>{
  if(command.endsWith('/gradlew') && args[0]!=='tasks')tasks.push(args[0]);
  if(command===config.agents.review.command)reviews++;
  if(command===config.runtime.command && args[1]==='stop' && failNext){failNext=false;throw new Error('execution failed');}
  return run(command,args,options);
 };
 await developProject(root,runner);
 const state=await loadState(root);assert.equal(state.phase,'complete');assert.equal(reviews,1);
 assert.deepEqual(tasks,['classes','test','build','runGameTestServer']);
 const checkpoint=state.checkpoints[0],dir=path.join(root,'.harness-state/evidence',checkpoint.runId);
 assert.equal((await read(path.join(dir,'e2e-failure.json'))).scenario,false);
 assert.equal((await read(path.join(dir,'observe-execute.json'))).passed,true);
 assert.equal((await read(path.join(dir,'e2e-retry/observe-execute.json'))).passed,true);
 const report=await read(path.join(dir,'manifest.json'));
 assert.ok(report.evidence.filter(item=>item.verification==='e2e').every(item=>item.artifacts.every(file=>file.includes('/e2e-retry/'))));
 await validateProject(root);
});

for(const mode of ['assertion','exit','assertion-and-cleanup'])test(`scenario ${mode} is not retried`,async t=>{
 const {root,config,settings}=await fixture(t,['e2e']);let starts=0;
 if(mode!=='exit')await settings({scenarioFail:true});
 const runner=async(command,args,options)=>{
  if(command===config.runtime.command && args[1]==='list')starts++;
  if(mode==='exit' && options.env?.HARNESS_SCENARIO_ID)return {code:1,stdout:'',stderr:'scenario failed'};
  if(mode==='assertion-and-cleanup' && command===config.runtime.command && args[1]==='stop')throw new Error('execution failed');
  return run(command,args,options);
 };
 await assert.rejects(developProject(root,runner),/Milestone M01 failed/);
 const state=await loadState(root);assert.equal(starts,1);assert.equal(state.checkpoints.length,0);
 const [id]=await readdir(path.join(root,'.harness-state/evidence')),dir=path.join(root,'.harness-state/evidence',id);
 assert.equal((await read(path.join(dir,'e2e-failure.json'))).scenario,true);
 assert.equal(await exists(path.join(dir,'e2e-retry')),false);
});
