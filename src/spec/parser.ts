import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent, Heading, PhrasingContent } from 'mdast';
import { hash } from '../io.js';

export const verificationTypes = ['unit', 'gametest', 'e2e', 'visual', 'persistence', 'multiplayer'] as const;
export type Verification = typeof verificationTypes[number];
export type Section = { title: string; depth: number; start: number; end: number; line: number; endLine: number; body: string; raw: string; parent: number | null };
export type SpecItem = { id: string; title: string; kind: 'feature' | 'requirement' | 'ac'; parent: string | null; active: boolean; source: Section };
export type Criterion = SpecItem & { verification: Verification[]; fields: Record<string, string> };
export type ProjectSpec = { text: string; hash: string; status: 'draft' | 'active'; sections: Section[]; items: SpecItem[]; acs: Criterion[]; globalHash: string; openQuestions: string };

function plain(nodes: PhrasingContent[]): string {
  return nodes.map(node => 'value' in node ? node.value : 'children' in node ? plain(node.children) : '').join('');
}

export function sectionsOf(text: string): Section[] {
  const blocks = fromMarkdown(text).children;
  const headings = blocks.filter((node): node is Heading => node.type === 'heading');
  return headings.map((heading, index) => {
    const start = heading.position!.start.offset!;
    const next = headings.slice(index + 1).find(node => node.depth <= heading.depth);
    const end = next?.position!.start.offset ?? text.length;
    let parent: number | null = null;
    for (let p = index - 1; p >= 0; p--) if (headings[p]!.depth < heading.depth) { parent = p; break; }
    return { title: plain(heading.children), depth: heading.depth, start, end,
      line: heading.position!.start.line, endLine: next ? next.position!.start.line - 1 : text.split('\n').length,
      body: text.slice(heading.position!.end.offset!, end).trim(), raw: text.slice(start, end), parent };
  });
}

function fieldsOf(section: Section): Record<string, string> {
  const nodes = fromMarkdown(section.body).children;
  const labels: { name: string; offset: number; valueStart: number }[] = [];
  // Only ordinary Markdown paragraphs contain field markers, never code fences or quotations.
  for (const node of nodes) if (node.type === 'paragraph') {
    const text = section.body.slice(node.position!.start.offset!, node.position!.end.offset!);
    for (const match of text.matchAll(/^(Preconditions|Action|Expected Result|Verification):[ \t]*/gm)) {
      const offset = node.position!.start.offset! + match.index;
      if (labels.some(label => label.name === match[1])) throw new Error(`Duplicate ${match[1]} in ${section.title}`);
      labels.push({ name: match[1]!, offset, valueStart: offset + match[0].length });
    }
  }
  const fields: Record<string, string> = {};
  for (const [i, label] of labels.entries()) fields[label.name] = section.body.slice(label.valueStart, labels[i + 1]?.offset ?? section.body.length).trim();
  return fields;
}

export function parseProject(text: string): ProjectSpec {
  const sections = sectionsOf(text);
  const need = (title: string, depth: number, parent: Section | null): Section => {
    const candidates = sections.filter(s => s.title === title && s.depth === depth && (parent === null ? s.parent === null : s.parent === sections.indexOf(parent)));
    if (candidates.length !== 1) throw new Error(`PROJECT.md requires exactly one ${'#'.repeat(depth)} ${title} under ${parent?.title ?? 'root'}`);
    return candidates[0]!;
  };
  const project = need('Project', 1, null);
  if (sections.filter(s => s.depth === 1).length !== 1) throw new Error('PROJECT.md requires a single project root');
  const top = Object.fromEntries(['Platform', 'Purpose', 'Scope', 'Terminology', 'Features', 'Cross-cutting Requirements', 'Constraints', 'Open Questions'].map(title => [title, need(title, 2, project)]));
  need('In Scope', 3, top.Scope!); need('Non-goals', 3, top.Scope!);
  for (const title of ['Persistence', 'Multiplayer', 'Visual', 'Performance', 'Compatibility']) need(title, 3, top['Cross-cutting Requirements']!);
  const headerEnd = sections.find(s => s.depth === 2)!.start;
  const header = text.slice(0, headerEnd);
  const status = header.match(/^Status: (draft|active)\s*$/m)?.[1] as 'draft' | 'active' | undefined;
  if (!status) throw new Error('PROJECT.md Status must be draft or active');
  for (const field of ['Project ID', 'Mod ID']) if (!new RegExp(`^${field}:.*$`, 'm').test(header)) throw new Error(`Missing ${field}`);
  for (const field of ['Minecraft', 'NeoForge', 'Java']) if (!new RegExp(`^${field}:.*$`, 'm').test(top.Platform!.body)) throw new Error(`Missing Platform ${field}`);
  if (status === 'active') {
    for (const [source, names] of [[header, ['Project ID', 'Mod ID']], [top.Platform!.body, ['Minecraft', 'NeoForge', 'Java']]] as const) {
      for (const field of names) if (!new RegExp(`^${field}:[ \\t]*\\S[^\\n]*$`, 'm').test(source)) throw new Error(`Active project requires ${field}`);
    }
  }
  const items: SpecItem[] = [], acs: Criterion[] = [];
  const ids = new Set<string>();
  for (const section of sections) {
    const parent = section.parent === null ? undefined : sections[section.parent];
    let kind: SpecItem['kind'] | undefined;
    if (parent === top.Features && section.depth === 3) kind = 'feature';
    else if (section.depth === 5 && parent?.title === 'Requirements') kind = 'requirement';
    else if (section.depth === 5 && parent?.title === 'Acceptance Criteria') kind = 'ac';
    if (!kind) {
      if (/^(F-|R-|AC-)/.test(section.title)) throw new Error(`ID heading is in an invalid location: ${section.title}`);
      continue;
    }
    const pattern = kind === 'feature' ? /^(F-\d{3,}): (\S.*)$/ : kind === 'requirement' ? /^(R-F\d{3,}-\d{3,}): (\S.*)$/ : /^(AC-F\d{3,}-\d{3,}): (\S.*)$/;
    const match = section.title.match(pattern);
    if (!match) throw new Error(`Invalid ${kind} ID/title: ${section.title}`);
    const id = match[1]!;
    if (ids.has(id)) throw new Error(`Duplicate ID: ${id}`);
    ids.add(id);
    const feature = kind === 'feature' ? undefined : items.find(item => item.kind === 'feature' && item.source.start < section.start && item.source.end >= section.end);
    if (kind !== 'feature' && (!feature || !id.startsWith(`${kind === 'ac' ? 'AC' : 'R'}-${feature.id.replace('-', '')}-`))) throw new Error(`ID ${id} must belong to its enclosing Feature`);
    const ownBody = section.body.split('\n#')[0]!;
    const state = ownBody.match(/^Status: (.+)$/m)?.[1];
    if (state && !['active', 'retired'].includes(state.trim())) throw new Error(`Invalid item Status: ${id}`);
    const item: SpecItem = { id, title: match[2]!, kind, parent: feature?.id ?? null, active: state?.trim() !== 'retired' && feature?.active !== false, source: section };
    items.push(item);
    if (kind === 'feature') {
      for (const child of ['Description', 'Requirements', 'Acceptance Criteria']) need(child, 4, section);
    } else if (kind === 'requirement' && !section.body.trim()) throw new Error(`Missing requirement text: ${id}`);
    if (kind === 'ac') {
      const fields = fieldsOf(section);
      for (const field of ['Preconditions', 'Action', 'Expected Result', 'Verification']) if (!fields[field]) throw new Error(`${id} missing ${field}`);
      const verification: Verification[] = [];
      const nodes: RootContent[] = fromMarkdown(fields.Verification!).children;
      if (nodes.length !== 1 || nodes[0]?.type !== 'list') throw new Error(`${id} Verification must be a Markdown list`);
      for (const entry of nodes[0].children) {
        const type = entry.children.length === 1 && entry.children[0]?.type === 'paragraph' ? plain(entry.children[0].children) : '';
        if (!verificationTypes.includes(type as Verification)) throw new Error(`Unknown verification type ${JSON.stringify(type)} in ${id}`);
        if (verification.includes(type as Verification)) throw new Error(`Duplicate verification ${type} in ${id}`);
        verification.push(type as Verification);
      }
      acs.push({ ...item, fields, verification });
    }
  }
  for (const feature of items.filter(item => item.kind === 'feature' && item.active)) {
    if (!items.some(item => item.parent === feature.id && item.kind === 'requirement' && item.active) || !acs.some(ac => ac.parent === feature.id && ac.active)) throw new Error(`${feature.id} needs a Requirement and AC`);
  }
  if (status === 'active' && !acs.some(ac => ac.active)) throw new Error('Active project requires an active AC');
  const outsideFeatures = text.slice(0, top.Features!.start) + text.slice(top.Features!.end);
  return { text, hash: hash(text), status, sections, items, acs, globalHash: hash(outsideFeatures), openQuestions: top['Open Questions']!.body };
}

export function requireActionable(spec: ProjectSpec): void {
  if (spec.status !== 'active') throw new Error('PROJECT.md is draft; finalize product decisions before planning');
  if (spec.openQuestions.trim() !== 'None.') throw new Error('Resolve Open Questions in PROJECT.md before planning (use None. when resolved)');
}
