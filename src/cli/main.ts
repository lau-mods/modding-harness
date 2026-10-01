#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { head, treeStatus, verifyIdHistory } from '../git/git.js';
import { VERSION } from '../io.js';
import { createProject } from '../project/create.js';
import { doctor } from '../project/doctor.js';
import { contract, initProject, validateProject } from '../project/project.js';
import { loadConfig } from '../project/config.js';
import { parseProject } from '../spec/parser.js';
import { materialize } from '../spec/projector.js';
import { invalidate, loadState, saveState, withLock } from '../state/state.js';
import { chatProject, developProject, planProject, regressionProject } from '../workflow.js';

const descriptions: Record<string, string> = {
  create: 'harness create <directory> --template-repo <repo> [--template-ref <revision>]\nOmitting --template-ref uses the template repository default branch HEAD.',
  init: 'harness init [--project <directory>]\nInstall the project contract without overwriting specification/config.',
  doctor: 'harness doctor [--project <directory>]\nDiagnose external CLI availability and required flags.',
  validate: 'harness validate [--project <directory>] [--refresh-projections]\nValidate contract, specification, generated views and state. Refresh is explicit regeneration after manual spec edits.',
  status: 'harness status [--project <directory>]\nShow phase, AC coverage, checkpoint and working tree.',
  chat: 'harness chat <product change request> [--project <directory>] [--reference <project-source-path>]\nEdit PROJECT.md, validate, create a local spec revision and replan. Repeat --reference to supply existing/reference implementations.',
  plan: 'harness plan [--project <directory>]\nGenerate a structured execution plan for every active AC.',
  develop: 'harness develop [--project <directory>]\nImplement milestones, verify local checkpoints, then run full regression.',
  regression: 'harness regression [--project <directory>]\nReverify all active ACs against their local checkpoints.',
};

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' }, project: { type: 'string' },
    'template-repo': { type: 'string' }, 'template-ref': { type: 'string' },
    'refresh-projections': { type: 'boolean' },
    reference: { type: 'string', multiple: true },
  } });
  const [command, ...rest] = positionals;
  if (values.version) { console.log(VERSION); return; }
  if (values.help || !command) {
    if (command && !descriptions[command]) throw new Error(`Unknown command: ${command}`);
    console.log(command ? descriptions[command] : `Modding Harness ${VERSION}\n\n${Object.values(descriptions).map(text => text.split('\n')[0]).join('\n')}`); return;
  }
  const root = path.resolve(values.project ?? process.cwd());
  if (values.reference && command !== 'chat') throw new Error('--reference is only supported by chat');
  switch (command) {
    case 'create': {
      if (rest.length !== 1 || !values['template-repo']) throw new Error(descriptions.create);
      await createProject(path.resolve(rest[0]!), values['template-repo'], values['template-ref']);
      console.log('Created independent project. Review PROJECT.md and commit the bootstrap files before development.'); break;
    }
    case 'init': await initProject(root); console.log('Initialized. Review PROJECT.md/config and commit the bootstrap files before development.'); break;
    case 'doctor': {
      const diagnostics = await doctor(root);
      for (const item of diagnostics) console.log(`${item.name}: ${item.status} — ${item.detail}`);
      if (diagnostics.some(item => item.status !== 'available')) process.exitCode = 1;
      break;
    }
    case 'validate': {
      if (values['refresh-projections']) await withLock(root, async () => {
        const config = await loadConfig(root); await contract(root, config);
        const spec = parseProject(await readFile(path.join(root, 'PROJECT.md'), 'utf8'));
        await verifyIdHistory(root, spec);
        const state = await loadState(root);
        if (state) { invalidate(state, spec); await saveState(root, state); }
        await materialize(root, spec);
      });
      const { spec } = await validateProject(root); console.log(`Valid: ${spec.hash}, ${spec.acs.filter(ac => ac.active).length} active ACs`); break;
    }
    case 'status': {
      const { spec } = await validateProject(root), state = await loadState(root), revision = await head(root), dirty = await treeStatus(root);
      const counts = { verified: 0, pending: 0, blocked: 0 };
      for (const ac of spec.acs.filter(ac => ac.active)) counts[state?.acs[ac.id]?.status ?? 'pending']++;
      console.log(`revision: ${revision}\nspec: ${spec.hash}\nphase: ${state?.phase ?? 'idle'}${state && state.revision !== revision ? ' (revision changed; revalidation required)' : ''}\nmilestone: ${state?.activeMilestone ?? 'none'}\nACs: ${Object.entries(counts).map(([key, value]) => `${value} ${key}`).join(', ')}\ncheckpoint: ${state?.checkpoints.at(-1)?.commit ?? 'none'}\nworking tree: ${dirty ? `dirty\n${dirty}` : 'clean'}`); break;
    }
    case 'chat': await chatProject(root, rest.join(' '), undefined, values.reference); console.log('Product change processed.'); break;
    case 'plan': {
      const plan = await planProject(root); console.log(`${plan.milestones.length} milestones, ${plan.blocked.length} blocked`); break;
    }
    case 'develop': await developProject(root); console.log(`Development phase: ${(await loadState(root))?.phase}`); break;
    case 'regression': await regressionProject(root); console.log('Full-project regression passed.'); break;
    default: throw new Error(`Unknown command: ${command}; use harness --help`);
  }
}

main().catch((error: unknown) => { console.error(`harness: ${(error as Error).message}`); process.exitCode = 1; });
