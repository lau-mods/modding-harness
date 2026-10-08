// Workspace 内で develop などの workflow が多重実行されないよう排他して action を実行する (§3)
export async function withLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  throw new Error('Not implemented');
}
