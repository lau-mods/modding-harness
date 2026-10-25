import { readFile } from 'node:fs/promises';
import { FatalError } from '../core/errors.js';
import { projectPaths } from '../core/paths.js';
import type { AcceptanceCriterion, Feature, ProjectSpec } from './types.js';

type Heading = { level: number; title: string; line: number };

// PROJECT.md の本文を ProjectSpec に変換する。見出し構造を解釈できなければ FatalError (§5.2, §23)
export function parseProject(text: string): ProjectSpec {
  const lines = text.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const headings = findHeadings(lines);
  const root = headings.find(heading => heading.level === 1 && heading.title === 'Project');
  if (!root) throw new FatalError('PROJECT.md requires a "# Project" heading');

  // 見出しの直下の本文 (次の見出しまで)
  const ownBody = (heading: Heading): string => {
    const next = headings.find(other => other.line > heading.line);
    return lines.slice(heading.line + 1, next?.line ?? lines.length).join('\n').trim();
  };
  // 見出しの配下全体 (同じか上位の見出しまで)
  const subtree = (heading: Heading): string => {
    const end = headings.find(other => other.line > heading.line && other.level <= heading.level);
    return lines.slice(heading.line, end?.line ?? lines.length).join('\n').trim();
  };
  // 見出しの配下にある指定 level の見出し
  const children = (heading: Heading, level: number): Heading[] => {
    const end = headings.find(other => other.line > heading.line && other.level <= heading.level)?.line ?? lines.length;
    return headings.filter(other => other.line > heading.line && other.line < end && other.level === level);
  };
  const section = (title: string): Heading => {
    const found = children(root, 2).find(heading => heading.title === title);
    if (!found) throw new FatalError(`PROJECT.md requires a "## ${title}" section`);
    return found;
  };
  // 節の見出しを除いた配下全体。下位見出しで整理された記述も含める
  const sectionBody = (title: string): string => subtree(section(title)).split('\n').slice(1).join('\n').trim();

  const header = ownBody(root);
  const status = field(header, 'Status');
  if (status !== 'draft' && status !== 'active') throw new FatalError('PROJECT.md Status must be draft or active');
  const platform = ownBody(section('Platform'));

  const features = children(section('Features'), 3).map((heading): Feature => {
    const [id, title] = splitTitle(heading.title);
    const part = (name: string): Heading | undefined => children(heading, 4).find(child => child.title === name);
    const description = part('Description');
    const criteriaHeading = part('Acceptance Criteria');
    const criteria = (criteriaHeading ? children(criteriaHeading, 5) : []).map((item): AcceptanceCriterion => {
      const [itemId, itemTitle] = splitTitle(item.title);
      const fields = labeledFields(ownBody(item));
      return {
        id: itemId, featureId: id, title: itemTitle,
        preconditions: fields.Preconditions ?? '', action: fields.Action ?? '', expectedResult: fields['Expected Result'] ?? '',
        markdown: subtree(item),
      };
    });
    return { id, title, description: description ? ownBody(description) : '', criteria, markdown: subtree(heading) };
  });

  return {
    text,
    status,
    projectId: field(header, 'Project ID'),
    modId: field(header, 'Mod ID'),
    platform: { minecraft: field(platform, 'Minecraft'), neoforge: field(platform, 'NeoForge'), java: field(platform, 'Java') },
    purpose: sectionBody('Purpose'),
    features,
    globalRequirements: sectionBody('Global Requirements'),
    constraints: sectionBody('Constraints'),
    openQuestions: sectionBody('Open Questions'),
  };
}

// Workspace の PROJECT.md を読み込んで ProjectSpec を返す (§5.1)
export async function readProject(root: string): Promise<ProjectSpec> {
  let text: string;
  try { text = await readFile(projectPaths(root).spec, 'utf8'); }
  catch (error) { throw new FatalError(`Cannot read PROJECT.md: ${(error as Error).message}`); }
  return parseProject(text);
}

// code fence の外にある ATX 見出しを列挙する
function findHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  let fence = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const match = !fence && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (match) headings.push({ level: match[1]!.length, title: match[2]!, line: index });
  });
  return headings;
}

// "Name: value" 形式の 1 行値を返す
function field(body: string, name: string): string {
  return body.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';
}

// "ID: title" 形式の見出しを ID と title に分ける
function splitTitle(title: string): [string, string] {
  const match = title.match(/^(\S+):\s*(.*)$/);
  return match ? [match[1]!, match[2]!] : [title, ''];
}

// AC 本文の Preconditions / Action / Expected Result を、次のラベルまでの複数行値として読み取る (§5.4)
function labeledFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let current: string | null = null;
  for (const line of body.split('\n')) {
    const match = line.match(/^(Preconditions|Action|Expected Result):[ \t]*(.*)$/);
    if (match) { current = match[1]!; fields[current] = match[2]!; }
    else if (current) fields[current] += '\n' + line;
  }
  for (const key of Object.keys(fields)) fields[key] = fields[key]!.trim();
  return fields;
}
