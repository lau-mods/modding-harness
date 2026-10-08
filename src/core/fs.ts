// ファイルまたはディレクトリが存在するかを返す
export async function exists(file: string): Promise<boolean> {
  throw new Error('Not implemented');
}

// JSON ファイルを読み込む。読めない場合の分類は呼び出し側で行う
export async function readJson(file: string): Promise<unknown> {
  throw new Error('Not implemented');
}

// 一時ファイル経由で原子的に書き込む。文字列以外は整形 JSON として保存する
export async function writeAtomic(file: string, value: unknown): Promise<void> {
  throw new Error('Not implemented');
}

// 文字列または Buffer の sha256 を返す
export function sha256(value: string | Buffer): string {
  throw new Error('Not implemented');
}
