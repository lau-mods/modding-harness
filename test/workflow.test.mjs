import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { developProject, chatProject, regressionProject } from '../dist/workflow.js';
import { loadState } from '../dist/state/state.js';
import { validateProject } from '../dist/project/project.js';
import { git as guardedGit } from '../dist/git/git.js';
import { fixture, git, put, acId, specText } from './helpers.mjs';

test('full milestone -> verified local checkpoint -> full regression complete',async t=>{
 const {root}=await fixture(t,['unit','gametest']);const before=git(root,'rev-parse','HEAD');
 await developProject(root);const state=await loadState(root);
 assert.equal(state.phase,'complete');assert.equal(state.acs[acId].status,'verified');assert.ok(state.regression);
 assert.notEqual(git(root,'rev-parse','HEAD'),before);assert.equal(state.checkpoints.length,1);
 const msg=git(root,'log','-1','--format=%B');for(const key of ['Harness-Milestone: M01','Harness-Spec-Hash:','Harness-AC: AC-F001-001','Harness-Verification-Run:'])assert.ok(msg.includes(key));
 assert.deepEqual((await readFile(path.join(root,'.harness-state/order.log'),'utf8')).trim().split('\n'),['classes','test','build','runGameTestServer','classes','test','build','runGameTestServer']);
 await validateProject(root);assert.equal(git(root,'status','--porcelain'),'');
});
test('dirty user work is preserved, never stashed or committed',async t=>{
 const {root}=await fixture(t),before=git(root,'rev-parse','HEAD');await put(root,'user.txt','my work');
 await assert.rejects(developProject(root),/Dirty working tree/);assert.equal(git(root,'rev-parse','HEAD'),before);
 assert.equal(await readFile(path.join(root,'user.txt'),'utf8'),'my work');
 for(const command of ['reset','clean','push','stash','checkout','fetch'])await assert.rejects(guardedGit(root,[command]),/not allowed/);
});
for(const task of ['test','build','runGameTestServer'])test(`${task} failure stops runtime and creates no checkpoint`,async t=>{
 const {root,settings}=await fixture(t,['unit','gametest','e2e']);const before=git(root,'rev-parse','HEAD');await settings({failTask:task});
 await assert.rejects(developProject(root),/failed/);assert.equal(git(root,'rev-parse','HEAD'),before);
 const state=await loadState(root);assert.equal(state.phase,'failed');assert.equal(state.checkpoints.length,0);
 const order=await readFile(path.join(root,'.harness-state/order.log'),'utf8');assert.ok(!order.includes('mct '));
 const dirs=await readdir(path.join(root,'.harness-state/evidence'));const report=JSON.parse(await readFile(path.join(root,'.harness-state/evidence',dirs[0],'manifest.json'),'utf8'));assert.equal(report.passed,false);
});
test('missing/skipped JUnit evidence cannot pass even with exit zero',async t=>{
 for(const mode of ['noReports','skipTest']){
  const {root,settings}=await fixture(t);await settings({[mode]:true});await assert.rejects(developProject(root),/failed/);
  assert.equal((await loadState(root)).checkpoints.length,0);
 }
});
test('source modified during verification cannot be committed',async t=>{
 const {root,settings}=await fixture(t);const before=git(root,'rev-parse','HEAD');await settings({mutateBuild:true});
 await assert.rejects(developProject(root),/changed during verification/);assert.equal(git(root,'rev-parse','HEAD'),before);
});
test('all E2E types produce evidence; persistence really restarts server/client',async t=>{
 const {root}=await fixture(t,['unit','gametest','e2e','visual','persistence','multiplayer']);
 await developProject(root);const state=await loadState(root);assert.equal(state.phase,'complete');
 const report=JSON.parse(await readFile(path.join(root,'.harness-state/evidence',state.regression.runId,'manifest.json'),'utf8'));
 assert.deepEqual(new Set(report.evidence.map(item=>item.verification)),new Set(['unit','gametest','e2e','visual','persistence','multiplayer']));
 const order=await readFile(path.join(root,'.harness-state/order.log'),'utf8');
 assert.match(order,/scenario setup\nmct client stop a\nmct client stop b\nmct client list/);
 assert.equal(order.split('mct client launch a').length-1,4);
});
test('multiplayer cannot pass with only one observer',async t=>{
 const {root,settings}=await fixture(t,['multiplayer']);await settings({singleClient:true});await assert.rejects(developProject(root),/distinct Client B/);
 assert.equal((await loadState(root)).checkpoints.length,0);
});
test('regression failure preserves past commit and requires corrective milestone',async t=>{
 const {root,settings}=await fixture(t);await developProject(root);const before=git(root,'rev-parse','HEAD');
 await settings({failTask:'build'});await assert.rejects(regressionProject(root),/Regression failed/);
 assert.equal(git(root,'rev-parse','HEAD'),before);const state=await loadState(root);assert.equal(state.phase,'failed');assert.equal(state.checkpoints.length,1);assert.equal(state.acs[acId].status,'pending');assert.equal(state.planFile,null);
});
test('chat updates canonical spec, commits spec separately, regenerates and replans',async t=>{
 const {root,settings,plan}=await fixture(t);await developProject(root);const previous=git(root,'rev-parse','HEAD');
 const text=specText().replace('Exactly one result','Exactly two results');
 const {parseProject}=await import('../dist/spec/parser.js');const spec=parseProject(text);
 await settings({spec:text,plan:{...plan,specHash:spec.hash,milestones:[{...plan.milestones[0],id:'M02'}]}});
 await chatProject(root,'Two results instead of one');
 const state=await loadState(root);assert.equal(state.acs[acId].status,'pending');assert.equal(state.checkpoints[0].commit,previous);
 assert.match(git(root,'log','-1','--format=%s'),/^harness\(spec\):/);
 assert.equal(await readFile(path.join(root,'.harness-state/spec/projections/agent-context.md'),'utf8'),text);
 await validateProject(root);
});
test('invalid spec edit leaves canonical source and history intact',async t=>{
 const {root,settings}=await fixture(t);const before=git(root,'rev-parse','HEAD');await settings({spec:'# Not a project'});
 await assert.rejects(chatProject(root,'Update product'),/requires exactly one/);
 assert.equal(await readFile(path.join(root,'PROJECT.md'),'utf8'),specText());assert.equal(git(root,'rev-parse','HEAD'),before);
});
test('review sees every newly created untracked source, including outside sourceFiles',async t=>{
 const {root,settings}=await fixture(t);await settings({expectReviewedFile:'src/unplanned.java',changes:{changes:[{path:'src/unplanned.java',content:'// candidate that must be reviewed',encoding:'utf8'}]}});
 await developProject(root);assert.equal((await loadState(root)).phase,'complete');
});
test('structured feedback repairs the same milestone once and is then cleared',async t=>{
 const {root,settings}=await fixture(t);await settings({repairReview:true});await developProject(root);
 const state=await loadState(root);assert.equal(state.phase,'complete');assert.equal(state.reviewFeedback,null);assert.equal(state.checkpoints.length,1);
 assert.equal(await readFile(path.join(root,'src/main/result.txt'),'utf8'),'repaired\n');
 const dirs=await readdir(path.join(root,'.harness-state/evidence'));const reports=await Promise.all(dirs.map(async id=>JSON.parse(await readFile(path.join(root,'.harness-state/evidence',id,'manifest.json'),'utf8'))));
 assert.equal(reports.filter(result=>!result.passed).length,1);
});
test('historical checkpoint validates only unchanged ACs after a verification-type change',async t=>{
 const {root,settings,plan}=await fixture(t);
 const {parseProject}=await import('../dist/spec/parser.js');const {materialize}=await import('../dist/spec/projector.js');
 const original=specText(),second=original.slice(original.indexOf('##### AC-F001'),original.indexOf('## Cross-cutting')).replaceAll(acId,'AC-F001-002');
 const text=original.replace('## Cross-cutting',second+'\n## Cross-cutting');const spec=parseProject(text);
 await put(root,'PROJECT.md',text);
 const tests=[acId,'AC-F001-002'].map(id=>({acId:id,type:'unit',report:'build/test-results/test/TEST-example.Test.xml',classname:'example.Test',name:'observed'}));
 await put(root,'tests/verification.json',{contract:1,tests});await materialize(root,spec);git(root,'add','.');git(root,'commit','-m','Define two criteria');
 await settings({plan:{...plan,specHash:spec.hash,milestones:[{...plan.milestones[0],acIds:[acId,'AC-F001-002']}]}});await developProject(root);
 const changed=text.replace(second,second.replace('- unit','- unit\n- gametest'));const after=parseProject(changed);
 const nextTests=[...tests,{acId:'AC-F001-002',type:'gametest',report:'build/gametest.xml',classname:'example.Test',name:'observed'}];
 await settings({spec:changed,plan:{...plan,specHash:after.hash,milestones:[{...plan.milestones[0],id:'M02',acIds:['AC-F001-002']}]},changes:{changes:[{path:'tests/verification.json',content:JSON.stringify({contract:1,tests:nextTests}),encoding:'utf8'}]}});
 await chatProject(root,'Add GameTest coverage for the second criterion');
 let state=await loadState(root);assert.equal(state.acs[acId].status,'verified');assert.equal(state.acs['AC-F001-002'].status,'pending');
 await validateProject(root);await developProject(root);state=await loadState(root);assert.equal(state.phase,'complete');assert.equal(state.checkpoints.length,2);
});
test('regression handles an existing source tree above the model context limit',async t=>{
 const {root}=await fixture(t);await put(root,'src/existing-large.txt','existing baseline\n'.repeat(60_000));git(root,'add','.');git(root,'commit','-m','Existing large source');
 await developProject(root);assert.equal((await loadState(root)).phase,'complete');
});
test('validate rejects missing checkpoint evidence',async t=>{
 const {root}=await fixture(t);await developProject(root);const state=await loadState(root);
 const cp=state.checkpoints[0],dir=path.join(root,'.harness-state/evidence',cp.runId);
 const report=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
 await rm(path.join(root,report.evidence[0].artifacts[0]));await assert.rejects(validateProject(root),/Missing.*artifact/);
});
