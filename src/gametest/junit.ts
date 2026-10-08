// JUnit XML 上の testcase の結果
export type TestCaseOutcome = 'passed' | 'failed' | 'error' | 'skipped';

// JUnit XML report 内の testcase 1 件 (§15.3)
export type JUnitTestCase = { classname: string; name: string; outcome: TestCaseOutcome; message: string; details: string };

// JUnit XML の本文から testcase を列挙する (§15.3)
export function parseJUnitReport(xml: string): JUnitTestCase[] {
  throw new Error('Not implemented');
}

// JUnit XML report を読み込んで testcase を列挙する。存在しなければ null
export async function readJUnitReport(file: string): Promise<JUnitTestCase[] | null> {
  throw new Error('Not implemented');
}
