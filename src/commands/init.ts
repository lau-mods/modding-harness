// .harness submodule を持つ Workspace を初期化する。既存ファイルは上書きしない (§9.2)
export async function initProject(root: string): Promise<void> {
  throw new Error('Not implemented');
}

// templates/PROJECT.md を PROJECT.md として配置する (§5.2)
export async function writeProjectTemplate(root: string): Promise<void> {
  throw new Error('Not implemented');
}

// 既定の .harness-config.json を書き出す (§8)
export async function writeDefaultConfig(root: string): Promise<void> {
  throw new Error('Not implemented');
}

// 空の tests/acceptance.json と tests/e2e/ を準備する (§15.2, §16.3)
export async function writeAcceptanceTemplate(root: string): Promise<void> {
  throw new Error('Not implemented');
}

// .harness-state/runs/ と .harness-state/runtime/ を .gitignore に追加する (§7.2)
export async function ignoreTemporaryState(root: string): Promise<void> {
  throw new Error('Not implemented');
}
