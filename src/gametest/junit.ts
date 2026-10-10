import { readFile } from 'node:fs/promises';

// JUnit XML 上の testcase の結果
export type TestCaseOutcome = 'passed' | 'failed' | 'error' | 'skipped';

// JUnit XML report 内の testcase 1 件 (§15.3)
export type JUnitTestCase = { classname: string; name: string; outcome: TestCaseOutcome; message: string; details: string };

// JUnit XML の本文から testcase を列挙する。failure / error / skipped の子要素から結果を決める (§15.3)
export function parseJUnitReport(xml: string): JUnitTestCase[] {
  const cases: JUnitTestCase[] = [];
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attributes = parseAttributes(match[1]!);
    const body = match[2] ?? '';
    const result = body.match(/<(failure|error|skipped)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/);
    const outcome: TestCaseOutcome = result ? result[1] === 'failure' ? 'failed' : result[1] as 'error' | 'skipped' : 'passed';
    cases.push({
      classname: attributes.classname ?? '',
      name: attributes.name ?? '',
      outcome,
      message: result ? parseAttributes(result[2]!).message ?? '' : '',
      details: decode((result?.[3] ?? '').replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()),
    });
  }
  return cases;
}

// JUnit XML report を読み込んで testcase を列挙する。存在しなければ null
export async function readJUnitReport(file: string): Promise<JUnitTestCase[] | null> {
  const xml = await readFile(file, 'utf8').catch(() => null);
  return xml === null ? null : parseJUnitReport(xml);
}

function parseAttributes(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1]!, decode(match[2] ?? match[3] ?? '')]));
}

function decode(text: string): string {
  return text.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[\da-f]+);/gi, (_, entity: string) => {
    const named: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
    if (entity[0] !== '#') return named[entity.toLowerCase()]!;
    return String.fromCodePoint(entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
  });
}
