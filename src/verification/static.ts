import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { walk } from '../io.js';

export async function validateResources(root: string): Promise<void> {
  const resources = new Map<string, string>();
  for (const base of ['src/main/resources', 'src/generated/resources']) for (const file of await walk(path.join(root, base))) {
    if (/^(assets|data)\//.test(file) && !/^(assets|data)\/[a-z0-9_.-]+\/[a-z0-9_./-]+$/.test(file)) throw new Error(`Invalid asset path: ${base}/${file}`);
    if (resources.has(file)) throw new Error(`Duplicate resource identifier: ${file}`);
    resources.set(file, path.join(root, base, file));
  }
  const namespaces = new Set([...resources.keys()].map(file => file.split('/')[0] === 'assets' ? file.split('/')[1] : undefined).filter(Boolean));
  const reference = (value: string, kind: 'models' | 'textures', file: string): void => {
    if (value.startsWith('#')) return;
    const [namespace, name] = value.includes(':') ? value.split(':') : ['minecraft', value];
    if (!namespace || !name || !/^[a-z0-9_.-]+$/.test(namespace) || !/^[a-z0-9_./-]+$/.test(name)) throw new Error(`Invalid resource reference ${value} in ${file}`);
    if (namespaces.has(namespace) && !resources.has(`assets/${namespace}/${kind}/${name}.${kind === 'models' ? 'json' : 'png'}`)) throw new Error(`Missing local ${kind} reference ${value} in ${file}`);
  };
  for (const [file, full] of resources) {
    if (!file.endsWith('.json') && !file.endsWith('.mcmeta')) continue;
    let data: unknown;
    try { data = JSON.parse(await readFile(full, 'utf8')); }
    catch (error) { throw new Error(`Invalid JSON resource ${file}: ${(error as Error).message}`); }
    if (!/^assets\/[^/]+\/(?:models|blockstates)\//.test(file)) continue;
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if ((key === 'parent' || key === 'model') && typeof child === 'string') reference(child, 'models', file);
        else if (key === 'textures' && child && typeof child === 'object') {
          for (const texture of Object.values(child)) if (typeof texture === 'string') reference(texture, 'textures', file);
        }
        else visit(child);
      }
    };
    visit(data);
  }
}
