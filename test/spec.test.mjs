import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../dist/spec/parser.js';
import { projections, materialize, checkProjections } from '../dist/spec/projector.js';
import { diffSpec } from '../dist/spec/diff.js';
import { newState, invalidate } from '../dist/state/state.js';
import { specText, temp, put, acId } from './helpers.mjs';

test('AST parses exact source ranges, parent-child IDs and ignores fenced headings',()=>{
 const text=specText().replace('## Purpose','## Purpose\n\n```markdown\n### F-999: Fake\n```');
 const spec=parseProject(text); assert.equal(spec.items.length,3); assert.equal(spec.acs[0].parent,'F-001');
 for(const item of spec.items) assert.equal(text.slice(item.source.start,item.source.end),item.source.raw);
});
for(const [name,change,error] of [
 ['missing section',s=>s.replace('## Constraints','## Other'),/Constraints/],
 ['invalid ID',s=>s.replace('F-001:','F-bad:'),/Invalid feature/],
 ['duplicate feature',s=>s.replace('## Cross-cutting',s.slice(s.indexOf('### F-001:'),s.indexOf('## Cross-cutting'))+'\n## Cross-cutting'),/Duplicate ID/],
 ['duplicate requirement',s=>s.replace('#### Acceptance Criteria','##### R-F001-001: Again\n\nDuplicated.\n\n#### Acceptance Criteria'),/Duplicate ID/],
 ['duplicate AC',s=>s.replace('## Cross-cutting',s.slice(s.indexOf('##### AC-F001'),s.indexOf('## Cross-cutting'))+'\n## Cross-cutting'),/Duplicate ID/],
 ['unknown verification',s=>s.replace('- unit','- build'),/Unknown verification/],
 ['missing required field',s=>s.replace('Action:','Activity:'),/missing Action/],
 ['invalid feature parent',s=>s.replace('AC-F001-001','AC-F002-001'),/enclosing Feature/],
 ['field in code fence',s=>s.replace('Preconditions:\nThe input is empty.','```\nPreconditions:\nThe input is empty.\n```'),/missing Preconditions/],
]) test(name,()=>assert.throws(()=>parseProject(change(specText())),error));
test('projection deterministic and tampering fails',async t=>{
 const root=await temp(t),spec=parseProject(specText());
 assert.deepEqual(projections(spec),projections(parseProject(spec.text)));
 await materialize(root,spec);await checkProjections(root,spec);
 await put(root,'.harness-state/spec/projections/features.md','tampered');
 await assert.rejects(checkProjections(root,spec),/Projection mismatch/);
});
test('spec diff and cross-cutting/requirement changes invalidate verified state',()=>{
 const before=parseProject(specText()),state=newState(before,'rev');
 state.acs[acId].status='verified';state.acs[acId].checkpoint='commit';state.acs[acId].runId='run';
 assert.deepEqual(diffSpec(before,parseProject(specText())),{unchanged:[acId],changed:[],added:[],removed:[]});
 for(const text of [specText().replace('Exactly one','Exactly two'),specText().replace('An action produces one result.','An action produces two results.'),specText().replace('## Constraints','## Constraints\n\nA new global constraint.')]) {
  const after=parseProject(text);assert.deepEqual(diffSpec(before,after).changed,[acId]);
  const clone=structuredClone(state);invalidate(clone,after);assert.equal(clone.acs[acId].status,'pending');
 }
 const renamed=parseProject(specText().replaceAll('AC-F001-001','AC-F001-002'));
 assert.deepEqual(diffSpec(before,renamed),{unchanged:[],changed:[],added:['AC-F001-002'],removed:[acId]});
});
