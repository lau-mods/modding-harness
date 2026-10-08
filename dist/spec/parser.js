import { readFile } from 'node:fs/promises';
import { FatalError } from '../core/errors.js';
import { sha256 } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
const TOPICS = ['Persistence', 'Multiplayer', 'Visual', 'Performance', 'Compatibility'];
// PROJECT.md の Markdown を ProjectSpec に変換する。見出し構造が成立しない場合は例外を投げる (§3)
export function parseProject(text) {
    const lines = text.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
    const headings = findHeadings(lines);
    const root = headings.find(h => h.level === 1 && h.title === 'Project');
    if (!root)
        throw new Error('PROJECT.md requires a "# Project" heading');
    // 見出しの直下の本文 (次の見出しまで)
    const ownBody = (h) => {
        const next = headings.find(other => other.line > h.line);
        return lines.slice(h.line + 1, next?.line ?? lines.length).join('\n').trim();
    };
    // 見出し h の配下にある見出し
    const children = (h, level) => {
        const end = headings.find(other => other.line > h.line && other.level <= h.level)?.line ?? lines.length;
        return headings.filter(other => other.line > h.line && other.line < end && other.level === level);
    };
    const section = (title) => {
        const found = children(root, 2).find(h => h.title === title);
        if (!found)
            throw new Error(`PROJECT.md requires a "## ${title}" section`);
        return found;
    };
    const header = ownBody(root);
    const status = field(header, 'Status');
    if (status !== 'draft' && status !== 'active')
        throw new Error('PROJECT.md Status must be draft or active');
    const platform = ownBody(section('Platform'));
    const crossCutting = section('Cross-cutting Requirements');
    const topics = children(crossCutting, 3);
    return {
        text,
        hash: sha256(text),
        status,
        projectId: field(header, 'Project ID'),
        modId: field(header, 'Mod ID'),
        packagePath: field(header, 'Package Path'),
        platform: { minecraft: field(platform, 'Minecraft'), neoforge: field(platform, 'NeoForge'), java: field(platform, 'Java') },
        purpose: ownBody(section('Purpose')),
        features: children(section('Features'), 3).map(heading => {
            const [id, title] = splitTitle(heading.title);
            const featureStatus = itemStatus(ownBody(heading));
            const part = (name) => children(heading, 4).find(h => h.title === name);
            const items = (name) => { const h = part(name); return h ? children(h, 5) : []; };
            const description = part('Description');
            const requirements = items('Requirements').map(item => {
                const [itemId, itemTitle] = splitTitle(item.title);
                const body = ownBody(item);
                return { id: itemId, featureId: id, title: itemTitle, status: combine(featureStatus, itemStatus(body)), body };
            });
            const criteria = items('Acceptance Criteria').map(item => {
                const [itemId, itemTitle] = splitTitle(item.title);
                const body = ownBody(item);
                const fields = labeledFields(body);
                return {
                    id: itemId, featureId: id, title: itemTitle, status: combine(featureStatus, itemStatus(body)),
                    preconditions: fields.Preconditions ?? '', action: fields.Action ?? '', expectedResult: fields['Expected Result'] ?? '',
                    markdown: `${'#'.repeat(item.level)} ${item.title}\n\n${body}`,
                };
            });
            return { id, title, status: featureStatus, description: description ? ownBody(description) : '', requirements, criteria };
        }),
        crossCutting: Object.fromEntries(TOPICS.map(topic => {
            const heading = topics.find(h => h.title === topic);
            return [topic, heading ? ownBody(heading) : ''];
        })),
        constraints: ownBody(section('Constraints')),
        openQuestions: ownBody(section('Open Questions')),
    };
}
// project root の PROJECT.md を読み込んで parse する。読めない場合は FatalError (§20)
export async function readProject(root) {
    let text;
    try {
        text = await readFile(projectPaths(root).spec, 'utf8');
    }
    catch (error) {
        throw new FatalError(`Cannot read PROJECT.md: ${error.message}`);
    }
    try {
        return parseProject(text);
    }
    catch (error) {
        throw new FatalError(error.message);
    }
}
// code fence の外にある ATX 見出しを列挙する
function findHeadings(lines) {
    const headings = [];
    let fence = false;
    lines.forEach((line, index) => {
        if (/^\s*(```|~~~)/.test(line))
            fence = !fence;
        const match = !fence && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
        if (match)
            headings.push({ level: match[1].length, title: match[2], line: index });
    });
    return headings;
}
// "Name: value" 形式の 1 行値を返す
function field(body, name) {
    return body.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';
}
// "ID: title" 形式の見出しを ID と title に分ける
function splitTitle(title) {
    const match = title.match(/^(\S+):\s*(.*)$/);
    return match ? [match[1], match[2]] : [title, ''];
}
// 本文中の "Status: retired" を読み取る (§5)
function itemStatus(body) {
    return /^Status:[ \t]*retired[ \t]*$/m.test(body) ? 'retired' : 'active';
}
// 親が retired なら子も retired とする
function combine(parent, own) {
    return parent === 'retired' ? 'retired' : own;
}
// AC 本文の Preconditions / Action / Expected Result を、次のラベルまでの複数行値として読み取る (§3)
function labeledFields(body) {
    const fields = {};
    let current = null;
    for (const line of body.split('\n')) {
        const match = line.match(/^(Preconditions|Action|Expected Result|Status):[ \t]*(.*)$/);
        if (match) {
            current = match[1];
            fields[current] = match[2];
        }
        else if (current)
            fields[current] += '\n' + line;
    }
    for (const key of Object.keys(fields))
        fields[key] = fields[key].trim();
    return fields;
}
//# sourceMappingURL=parser.js.map