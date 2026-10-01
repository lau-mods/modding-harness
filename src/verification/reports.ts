import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { SaxesParser } from 'saxes';
import { exists, readJson, safePath } from '../io.js';
import { validateSchema } from '../schema.js';
import type { ProjectSpec } from '../spec/parser.js';

export type TestMapping = { acId: string; type: 'unit' | 'gametest'; report: string; classname: string; name: string };
export async function loadTestMappings(root: string, spec: ProjectSpec): Promise<TestMapping[]> {
  const file = path.join(root, 'tests/verification.json');
  if (!await exists(file)) return [];
  const manifest = validateSchema<{ contract: 1; tests: TestMapping[] }>('test-mapping', await readJson(file));
  for (const test of manifest.tests) {
    if (!spec.acs.some(ac => ac.active && ac.id === test.acId && ac.verification.includes(test.type))) throw new Error(`Invalid test mapping ${test.acId}/${test.type}`);
    if (!test.report.startsWith('build/') || !test.report.endsWith('.xml')) throw new Error('Test reports must be XML under build/');
    await safePath(root, test.report);
  }
  return manifest.tests;
}
export async function clearReports(root: string, mappings: TestMapping[]): Promise<void> {
  // Only declared generated reports are removed, ensuring stale results cannot pass a new run.
  for (const report of new Set(mappings.map(item => item.report))) {
    const file = await safePath(root, report);
    if (await exists(file)) await rm(file);
  }
}
export async function checkReports(root: string, mappings: TestMapping[], ids: string[], type: 'unit' | 'gametest'): Promise<{ acId: string; reports: string[] }[]> {
  const result = [];
  for (const id of ids) {
    const tests = mappings.filter(test => test.acId === id && test.type === type);
    if (!tests.length) throw new Error(`No tests/verification.json mapping for ${id}/${type}`);
    for (const test of tests) {
      const parser = new SaxesParser();
      let matching = false, matches = 0, passed = true;
      parser.on('doctype', () => { throw new Error('DTD is not allowed in test reports'); });
      parser.on('opentag', tag => {
        if (tag.name === 'testcase') {
          matching = tag.attributes.classname === test.classname && tag.attributes.name === test.name;
          if (matching) matches++;
        }
        if (matching && ['failure', 'error', 'skipped'].includes(tag.name)) passed = false;
      });
      parser.on('closetag', tag => { if (tag.name === 'testcase') matching = false; });
      parser.write(await readFile(await safePath(root, test.report), 'utf8')).close();
      if (matches !== 1 || !passed) throw new Error(`Test evidence failed/missing/ambiguous: ${id} ${test.classname}.${test.name}`);
    }
    result.push({ acId: id, reports: [...new Set(tests.map(test => test.report))] });
  }
  return result;
}
