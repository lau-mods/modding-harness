import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan } from '../dist/planning/plan.js';
import { newState } from '../dist/state/state.js';
import { parseProject } from '../dist/spec/parser.js';
import { specText, acId } from './helpers.mjs';
const spec=parseProject(specText()),state=newState(spec,'rev');
const plan={contract:1,specHash:spec.hash,milestones:[{id:'M01',acIds:[acId],dependsOn:[],sourceFiles:['src/A.java'],approach:'Existing behavior',testStrategy:'Assertion'}],blocked:[]};
test('valid structured plan covers existing AC',()=>assert.deepEqual(validatePlan(plan,spec,state),plan));
test('unknown, unassigned, duplicated ACs and invented conditions rejected',()=>{
 assert.throws(()=>validatePlan({...plan,milestones:[{...plan.milestones[0],acIds:['AC-F999-001']}]},spec,state),/unknown/);
 assert.throws(()=>validatePlan({...plan,milestones:[]},spec,state),/Unassigned/);
 assert.throws(()=>validatePlan({...plan,milestones:[{...plan.milestones[0],completionCondition:'New behavior'}]},spec,state),/Invalid plan/);
 assert.throws(()=>validatePlan({...plan,blocked:[{acId,reason:'duplicate'}]},spec,state),/more than once/);
});
test('blocked ACs remain explicit and cannot be silently omitted',()=>{
 const blocked={...plan,milestones:[],blocked:[{acId,reason:'Product dependency'}]};assert.deepEqual(validatePlan(blocked,spec,state),blocked);
 assert.throws(()=>validatePlan({...plan,milestones:[],blocked:[]},spec,state),/Unassigned/);
});
test('dependencies ordered; completed milestone IDs never reused',()=>{
 assert.throws(()=>validatePlan({...plan,milestones:[{...plan.milestones[0],dependsOn:['M02']}]},spec,state),/Dependency/);
 assert.throws(()=>validatePlan(plan,spec,{...state,checkpoints:[{milestone:'M01'}]}),/reused/);
 assert.throws(()=>validatePlan({...plan,milestones:[{...plan.milestones[0],sourceFiles:['.git/config']}]},spec,state),/forbidden path/);
});
