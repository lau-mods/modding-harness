import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { projectTemplate } from '../dist/project/template.js';
import { initProject } from '../dist/project/project.js';
import { materialize } from '../dist/spec/projector.js';
import { parseProject } from '../dist/spec/parser.js';

export const acId = 'AC-F001-001';
export function specText(types = ['unit']) {
  return projectTemplate.replace('Status: draft', 'Status: active')
    .replace('Project ID:', 'Project ID: harness-test').replace('Mod ID:', 'Mod ID: examplemod')
    .replace('Minecraft:', 'Minecraft: 1.21.1').replace('NeoForge:', 'NeoForge: 21.1.252').replace('Java:', 'Java: 21')
    .replace(/<!-- Add concrete features[\s\S]*?-->/, `### F-001: Observable feature\n\n#### Description\n\nA concrete observation.\n\n#### Requirements\n\n##### R-F001-001: Required behavior\n\nAn action produces one result.\n\n#### Acceptance Criteria\n\n##### AC-F001-001: One result\n\nPreconditions:\nThe input is empty.\n\nAction:\nPerform the action.\n\nExpected Result:\nExactly one result exists.\n\nVerification:\n${types.map(type => '- ' + type).join('\n')}\n`)
    .replace(/## Open Questions[\s\S]*$/, '## Open Questions\n\nNone.\n');
}
export const git = (root, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export async function put(root, file, content, executable = false) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content, null, 2) + '\n');
  if (executable) await chmod(path.join(root, file), 0o755);
}
export async function temp(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'harness-test-'));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
export async function fixture(t, types = ['unit'], options = {}) {
  const base = await temp(t), root = path.join(base, 'project'), harness = path.join(base, 'harness');
  for (const dir of [root, harness]) {
    await mkdir(dir); git(dir, 'init'); git(dir, 'config', 'user.name', 'Harness Test'); git(dir, 'config', 'user.email', 'harness@example.invalid');
  }
  await put(harness, 'README.md', 'Test-only submodule fixture, not a Mod template.\n'); git(harness, 'add', '.'); git(harness, 'commit', '-m', 'harness fixture');
  git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', harness, '.harness');
  await put(root, '.gitignore', 'build/\n.harness-state/\n');
  await put(root, 'build.gradle', "plugins { id 'net.neoforged.moddev' version 'test-fixture' }\n");
  await put(root, 'gradle/wrapper/gradle-wrapper.jar', 'fake wrapper');
  await put(root, 'gradle/wrapper/gradle-wrapper.properties', 'fake=true\n');
  await put(root, 'src/main/templates/META-INF/neoforge.mods.toml', '[[mods]]\nmodId="examplemod"\n');
  const spec = parseProject(specText(types));
  if (!options.noSpec) await put(root, 'PROJECT.md', spec.text);
  await put(root, '.fake-bin/codex', `#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const root=${JSON.stringify(root)}; const args=process.argv.slice(2);
if(args.includes('--help')) { console.log('--output-schema --ignore-user-config --sandbox'); process.exit(0); }
let input=''; for await (const chunk of process.stdin) input+=chunk;
const settings=JSON.parse(fs.readFileSync(path.join(root,'.harness-state/fake.json'),'utf8'));
if(settings.agentMutate) fs.writeFileSync(path.join(root,settings.agentMutate),'forbidden');
if(settings.agentExit) process.exit(settings.agentExit);
const shape=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1],'utf8'));
let result;
if(shape.properties.projectMarkdown) result={projectMarkdown:settings.spec ?? fs.readFileSync(path.join(root,'PROJECT.md'),'utf8')};
else if(shape.properties.milestones) result=settings.plan;
else result=settings.changes ?? {changes:[{path:'src/main/result.txt',content:'implemented\\n',encoding:'utf8'}]};
if(settings.repairReview && shape.properties.changes && input.includes('"previousReview": {')) result={changes:[{path:'src/main/result.txt',content:'repaired\\n',encoding:'utf8'}]};
fs.writeFileSync(args[args.indexOf('--output-last-message')+1],settings.invalidOutput ? 'not JSON' : JSON.stringify(result));
`, true);
  await put(root, '.fake-bin/claude', `#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const root=${JSON.stringify(root)};
if(process.argv.includes('--help')) { console.log('--restricted --safe-mode --json-schema --permission-prompts'); process.exit(0); }
let input='';for await (const chunk of process.stdin) input+=chunk;
const settings=JSON.parse(fs.readFileSync(path.join(root,'.harness-state/fake.json'),'utf8'));
if(settings.reviewMutate) fs.writeFileSync(path.join(root,settings.reviewMutate),'review mutation');
if(settings.reviewExit) process.exit(settings.reviewExit);
let review=settings.review ?? {verdict:'pass',issues:[]};
if((settings.expectReviewedFile && !input.includes(settings.expectReviewedFile)) || (settings.repairReview && fs.readFileSync(path.join(root,'src/main/result.txt'),'utf8')!=='repaired\\n'))review={verdict:'changes_required',issues:[{severity:'major',category:'correctness',file:'src/main/result.txt',lines:'1',reason:'Repair required',requiredChange:'Write repaired'}]};
console.log(settings.invalidReview ? 'not JSON' : JSON.stringify({subtype:'success',is_error:false,structured_output:review}));
`, true);
  await put(root, 'gradlew', `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'); const task=process.argv[2];
const config=fs.existsSync('.harness-state/fake.json') ? JSON.parse(fs.readFileSync('.harness-state/fake.json','utf8')) : {};
if(task==='tasks') { console.log('classes - Compile\\ntest - Test\\nbuild - Build\\nrunGameTestServer - GameTest\\nrunClient - Client'); process.exit(0); }
if(task==='--version') { console.log('fake Gradle'); process.exit(0); }
fs.mkdirSync('.harness-state',{recursive:true}); fs.appendFileSync('.harness-state/order.log',task+'\\n');
if(config.failTask===task) { console.error('deliberate failure'); process.exit(1); }
if(config.mutateBuild && task==='build') fs.writeFileSync('src/main/result.txt','changed during verification');
if(['test','runGameTestServer'].includes(task) && !config.noReports) {
 const file=task==='test'?'build/test-results/test/TEST-example.Test.xml':'build/gametest.xml';
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,'<testsuite><testcase classname="example.Test" name="observed">'+(config.skipTest?'<skipped/>':'')+'</testcase></testsuite>');
}
`, true);
  const config = { contract: 1, project: { buildFile: 'build.gradle', metadata: 'src/main/templates/META-INF/neoforge.mods.toml' },
    gradle: { compile: 'classes', test: 'test', build: 'build', gameTest: 'runGameTestServer' },
    agents: { implementation: { command: path.join(root, '.fake-bin/codex'), model: null }, review: { command: path.join(root, '.fake-bin/claude'), model: null } },
    runtime: { provider: 'mc-pilot', command: path.join(root, '.fake-bin/mct'), clients: ['a','b'], server: {command:[process.execPath,path.join(root,'.fake-bin/server.cjs')],directory:'.harness-state/runtime/server',address:'127.0.0.1:25575'},deploy:[{source:'build.gradle',target:'.harness-state/runtime/server/mods/fake.jar'}],logs:[] } };
  if (!options.noConfig) await put(root, '.harness-config.json', config);
  await put(root, 'tests/verification.json', { contract:1,tests:types.filter(type=>['unit','gametest'].includes(type)).map(type=>({acId,type,report:type==='unit'?'build/test-results/test/TEST-example.Test.xml':'build/gametest.xml',classname:'example.Test',name:'observed'})) });
  await put(root,'.fake-bin/server.cjs', `console.log('Done (0.1s)! For help, type "help"');process.stdin.on('data',x=>{if(x.toString().includes('stop'))process.exit(0)});` ,true);
  await put(root,'.fake-bin/mct', `#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';const root=${JSON.stringify(root)};
const args=process.argv.slice(2);let data;
fs.appendFileSync(path.join(root,'.harness-state/order.log'),'mct '+args.join(' ')+'\\n');
if(args[1]==='list')data={clients:[{name:'a',running:false,loader:'neoforge'},{name:'b',running:false,loader:'neoforge'}]};
else if(args[1]==='wait-ready')data={connected:true,inWorld:true};else data={stopped:true};
console.log(JSON.stringify({success:true,data}));
`,true);
  await put(root, '.fake-bin/package.json', {type:'module'});
  await put(root,'.harness-state/runtime/server/eula.txt','eula=true\n');
  await put(root,'.harness-state/runtime/server/server.properties','server-ip=127.0.0.1\nserver-port=25575\n');
  await put(root,'tests/e2e/scenarios/observe.mjs', `import fs from 'node:fs';import path from 'node:path';
const settings=JSON.parse(fs.readFileSync('.harness-state/fake.json','utf8')), env=process.env;
fs.appendFileSync('.harness-state/order.log','scenario '+env.HARNESS_STAGE+'\\n');
fs.writeFileSync(path.join(env.HARNESS_EVIDENCE_DIR,'capture.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB5kAAAAASUVORK5CYII=','base64'));
fs.writeFileSync(env.HARNESS_RESULT_PATH,JSON.stringify({contract:1,scenarioId:env.HARNESS_SCENARIO_ID,runId:env.HARNESS_RUN_ID,stage:env.HARNESS_STAGE,passed:!settings.scenarioFail,assertions:[{name:'observed',passed:!settings.scenarioFail,observed:'one'}],screenshots:[{acId:'${acId}',path:'capture.png'}],persistence:{worldId:'world',saved:true,reloaded:env.HARNESS_STAGE==='assert'},multiplayer:{actorClient:'a',observerClient:settings.singleClient?'a':'b',serverAssertion:{name:'server',passed:true,observed:'one'},observerAssertion:{name:'observer',passed:true,observed:'one'}}}));`);
  const runtimeTypes=types.filter(type=>!['unit','gametest'].includes(type));
  await put(root,'tests/e2e/manifest.json',{contract:1,scenarios:runtimeTypes.length?[{id:'observe',acIds:[acId],verification:runtimeTypes,command:[process.execPath,'tests/e2e/scenarios/observe.mjs']}]:[]});
  const plan={contract:1,specHash:spec.hash,milestones:[{id:'M01',acIds:[acId],dependsOn:[],sourceFiles:['src/main/result.txt','tests/verification.json'],approach:'Implement the existing behavior',testStrategy:'Assert the specified observation'}],blocked:[],excluded:[]};
  await put(root,'.harness-state/fake.json',{plan});
  await initProject(root);
  git(root,'add','.');git(root,'commit','-m','Initial project contract');
  if(!options.noSpec) await materialize(root,spec);
  const settings=async patch=>{const old=JSON.parse(await readFile(path.join(root,'.harness-state/fake.json'),'utf8'));await put(root,'.harness-state/fake.json',{...old,...patch});};
  return {root,base,config,spec,plan,settings};
}
