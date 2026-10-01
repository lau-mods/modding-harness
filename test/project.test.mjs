import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { initProject, validateProject, detectTask } from '../dist/project/project.js';
import { doctor } from '../dist/project/doctor.js';
import { loadState } from '../dist/state/state.js';
import { createProject } from '../dist/project/create.js';
import { fixture, git, put, specText } from './helpers.mjs';

test('init preserves existing PROJECT/config and handles gitignore idempotently',async t=>{
 const {root}=await fixture(t);const before=await readFile(path.join(root,'PROJECT.md'),'utf8');
 const config=await readFile(path.join(root,'.harness-config.json'),'utf8');
 await initProject(root);await initProject(root);
 assert.equal(await readFile(path.join(root,'PROJECT.md'),'utf8'),before);
 assert.equal(await readFile(path.join(root,'.harness-config.json'),'utf8'),config);
 assert.equal((await readFile(path.join(root,'.gitignore'),'utf8')).split('.harness-state/').length,2);
 await validateProject(root);
});
test('init generates detailed draft and config when absent',async t=>{
 const {root}=await fixture(t,['unit'],{noSpec:true,noConfig:true});
 assert.match(await readFile(path.join(root,'PROJECT.md'),'utf8'),/Status: draft/);
 assert.equal(await readFile(path.join(root,'PROJECT.md'),'utf8'),await readFile(new URL('../templates/PROJECT.md',import.meta.url),'utf8'));
 assert.match(await readFile(path.join(root,'.harness-config.json'),'utf8'),/"gameTest": "runGameTestServer"/);
});
test('project contract, corrupted JSON, unsupported state fail without repair',async t=>{
 const {root}=await fixture(t);await put(root,'.harness-state/state.json',{contract:0});
 await assert.rejects(loadState(root),/Invalid state/);
 await put(root,'.harness-state/state.json','{broken');await assert.rejects(loadState(root),/Cannot read JSON/);
 await rm(path.join(root,'.harness-state/state.json'));await rm(path.join(root,'gradle/wrapper/gradle-wrapper.jar'));
 await assert.rejects(validateProject(root),/missing gradle/);
});
test('single detection never guesses between multiple Gradle tasks',()=>{
 assert.equal(detectTask(new Set(['test']),'test'),'test');
 assert.throws(()=>detectTask(new Set(['a:test','b:test']),'test'),/unambiguously/);
 assert.throws(()=>detectTask(new Set(),'build'),/unambiguously/);
});
test('doctor reports unavailable and misconfigured without install failure',async t=>{
 const {root}=await fixture(t);
 const diagnostics=await doctor(root,async (cmd,args)=>{
  if(cmd==='java')throw Object.assign(new Error('not found'),{code:'ENOENT'});
  if(cmd.endsWith('/claude'))return {code:0,stdout:'old unsupported CLI',stderr:''};
  return {code:0,stdout:cmd===process.execPath?'v20.20.0':'--output-schema --ignore-user-config --sandbox client schema',stderr:''};
 });
 assert.equal(diagnostics.find(d=>d.name==='java').status,'unavailable');
 assert.equal(diagnostics.find(d=>d.name==='claude').status,'misconfigured');
 assert.equal(diagnostics.find(d=>d.name==='node').status,'available');
});
test('deleted/retired IDs cannot be reused after state deletion',async t=>{
 const {root}=await fixture(t);await put(root,'PROJECT.md',specText().replaceAll('AC-F001-001','AC-F001-002'));
 git(root,'add','PROJECT.md');git(root,'commit','-m','Retire original ID');
 await rm(path.join(root,'.harness-state/spec'),{recursive:true});
 await put(root,'PROJECT.md',specText());await assert.rejects(validateProject(root),/cannot be reused/);
});
test('incomplete historical specs do not block validation, but ID retirement remains enforced',async t=>{
 const {root}=await fixture(t);
 await put(root,'PROJECT.md','# Old project notes\n\n### F-001: Unfinished feature\n\n##### R-F001-001: Requirement\n\n##### AC-F001-001: Incomplete criterion\n');
 git(root,'add','PROJECT.md');git(root,'commit','-m','Incomplete intermediate draft');
 await put(root,'PROJECT.md',specText());git(root,'add','PROJECT.md');git(root,'commit','-m','Finish current contract');
 await validateProject(root);
 await put(root,'PROJECT.md','# Notes\n\n### F-001: Retired feature\n\nStatus: retired\n\n##### R-F001-001: Requirement\n\n##### AC-F001-001: Criterion\n');
 git(root,'add','PROJECT.md');git(root,'commit','-m','Retire feature in an incomplete draft');
 await put(root,'PROJECT.md',specText());
 await assert.rejects(validateProject(root),/cannot be reused/);
});
test('a non-Harness PROJECT history and fenced fake IDs do not poison current validation',async t=>{
 const {root}=await fixture(t,['unit'],{noSpec:true});
 await put(root,'PROJECT.md','# Legacy notes\n\n```markdown\n### F-001: Example\nStatus: retired\n```\n');
 git(root,'add','PROJECT.md');git(root,'commit','-m','Legacy specification');
 await put(root,'PROJECT.md',specText());git(root,'add','PROJECT.md');git(root,'commit','-m','Adopt current specification');
 await rm(path.join(root,'.harness-state/spec'),{recursive:true});await validateProject(root);
});
test('create materializes specified ref into independent history and adds submodule',async t=>{
 const {root,base}=await fixture(t),dest=path.join(base,'created');
 // Use a synthetic external template without its existing Harness integration.
 git(root,'rm','--cached','.harness','.gitmodules');
 const binary=Buffer.from([0,255,254,128,10,195,40]);await put(root,'gradle/wrapper/gradle-wrapper.jar',binary);
 git(root,'add','gradle/wrapper/gradle-wrapper.jar');
 await rm(path.join(root,'.gitmodules'));git(root,'commit','-m','External template fixture');
 const ref=git(root,'rev-parse','HEAD');
 await createProject(dest,root,ref,path.join(base,'harness'));
 assert.equal(await readFile(path.join(dest,'PROJECT.md'),'utf8'),specText());
 assert.deepEqual(await readFile(path.join(dest,'gradle/wrapper/gradle-wrapper.jar')),binary);
 assert.match(git(dest,'ls-files','--stage','.harness'),/^160000/);
 assert.throws(()=>git(dest,'rev-parse','--verify','HEAD'));
 assert.equal(git(dest,'remote'), '');
 git(root,'branch','non-default-template',ref);
 const other=path.join(base,'created-from-branch');
 await createProject(other,root,'non-default-template',path.relative(process.cwd(),path.join(base,'harness')));
 assert.equal(await readFile(path.join(other,'PROJECT.md'),'utf8'),specText());
 git(root,'tag','non-default-template',ref);
 await assert.rejects(createProject(path.join(base,'ambiguous'),root,'non-default-template',path.join(base,'harness')),/ambiguous/);
});
