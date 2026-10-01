import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { callAgent, applyChanges, parseReview, codexArgs, claudeArgs, sourceContext, codexOutputSchema } from '../dist/agents/agents.js';
import { fixture, put } from './helpers.mjs';

test('real fake executable invocation and structured output parsing',async t=>{
 const {root,config}=await fixture(t);
 const result=await callAgent(root,config.agents.implementation,'implementation',{},path.join(root,'.harness-state/output.json'));
 await applyChanges(root,result);assert.equal(await readFile(path.join(root,'src/main/result.txt'),'utf8'),'implemented\n');
 const review=await callAgent(root,config.agents.review,'review',{},path.join(root,'.harness-state/review.json'));
 assert.equal(review.verdict,'pass');
 assert.ok(codexArgs(null,'schema','out').includes('read-only'));
 assert.ok(codexArgs(null,'schema','out').includes('shell_tool'));
 assert.ok(!codexArgs(null,'schema','out').includes('--model'));
 assert.ok(claudeArgs(null).includes('--restricted'));
 assert.equal(codexOutputSchema('plan').properties.contract.type,'integer');
 assert.ok(!JSON.stringify(codexOutputSchema('plan')).includes('uniqueItems'));
});
for(const [setting,role,error] of [
 ['invalidOutput','implementation',/JSON/],['agentExit','implementation',/failed/],
 ['invalidReview','review',/JSON/],['reviewExit','review',/failed/],
])test(`${role} ${setting} fails`,async t=>{
 const {root,config,settings}=await fixture(t);await settings({[setting]:setting.endsWith('Exit')?7:true});
 await assert.rejects(callAgent(root,role==='review'?config.agents.review:config.agents.implementation,role,{},path.join(root,'.harness-state/failed.json')),error);
});
for(const [setting,role,target] of [
 ['agentMutate','implementation','PROJECT.md'],['agentMutate','implementation','.harness-state/state.json'],
 ['reviewMutate','review','src/reviewer.txt'],['reviewMutate','review','.git/config'],
])test(`detect ${role} changing ${target}`,async t=>{
 const {root,config,settings}=await fixture(t);await settings({[setting]:target});
 await assert.rejects(callAgent(root,role==='review'?config.agents.review:config.agents.implementation,role,{},path.join(root,'.harness-state/failed.json')),/modified|git.*failed/);
});
test('forbidden file changes, traversal and symlinks rejected before any write',async t=>{
 const {root,base}=await fixture(t);
 for(const file of ['PROJECT.md','.git/HEAD','.harness/a','.harness-state/a','.harness-config.json','src/../PROJECT.md']) await assert.rejects(applyChanges(root,{changes:[{path:file,content:'x',encoding:'utf8'}]}),/forbidden|Unsafe/);
 await put(base,'external.txt','original');await symlink(path.join(base,'external.txt'),path.join(root,'src/linked'));
 await assert.rejects(applyChanges(root,{changes:[{path:'src/linked',content:'overwrite',encoding:'utf8'}]}),/Symlink/);
 assert.equal(await readFile(path.join(base,'external.txt'),'utf8'),'original');
});
test('contradictory review output cannot pass',()=>{
 assert.throws(()=>parseReview(JSON.stringify({subtype:'success',structured_output:{verdict:'pass',issues:[{severity:'major',category:'correctness',file:'src/A',lines:'1',reason:'bug',requiredChange:'fix'}]}})),/contradicts/);
 assert.throws(()=>parseReview(JSON.stringify({subtype:'success',structured_output:{verdict:'changes_required',issues:[]}})),/needs issues/);
});
test('large binary assets consume only their placeholder context budget',async t=>{
 const {root}=await fixture(t);const {writeFile}=await import('node:fs/promises');
 await writeFile(path.join(root,'src/large.png'),Buffer.alloc(2_000_000));
 const context=await sourceContext(root,['src/large.png']);assert.match(context['src/large.png'],/binary file; 2000000 bytes/);
});
