// develop 実行中に変更を禁止する対象の、開始時点の fingerprint (§4.2, §6.3, §11)
export type IntegrityBaseline = {
  harness: string; // Harness 本体 (.harness)
  spec: string; // PROJECT.md
  plan: string; // plan.json
};

// 現在の Harness 本体・PROJECT.md・plan の fingerprint を記録する
export async function captureBaseline(root: string): Promise<IntegrityBaseline> {
  throw new Error('Not implemented');
}

// 固定対象が開始時から変更されていれば FatalError を投げる (§4.2, §23)
export async function assertIntegrity(root: string, baseline: IntegrityBaseline): Promise<void> {
  throw new Error('Not implemented');
}

// ディレクトリ配下のファイルのパスと内容から fingerprint を作る。node_modules と .git は除く
export async function fingerprintDir(dir: string): Promise<string> {
  throw new Error('Not implemented');
}
