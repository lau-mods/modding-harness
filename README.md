# Modding Harness

`PROJECT.md` に書いた製品仕様をもとに、NeoForge Mod の開発を自動で進めるローカル開発ハーネスです。実装、ビルド、コードレビュー、GameTest、E2E を実行し、milestone ごとに Git checkpoint を作ります。単一ユーザがローカル環境で使うことを想定しています。

詳細な仕様は [docs/harness-impl.md](docs/harness-impl.md) にあります。

| 役割 | 使用するツール |
|---|---|
| 実装・修正 | Codex CLI |
| 計画・仕様変更・コードレビュー・E2E 画面レビュー | Claude Code CLI |
| ゲームロジックの確認 | NeoForge GameTest |
| 描画の確認 (E2E) | NeoForge dedicated server + MC Pilot (`mct`) で操作する Minecraft client |

## 必要な環境

Linux または macOS で、次を用意します。

- Node.js 20 以上、Git
- 対象の NeoForge に合う Java と、Workspace の Gradle Wrapper (`gradlew`)
- Codex CLI (`codex login` 済み)
- Claude Code CLI (`claude auth login` 済み)
- MC Pilot (`mct`)
- NeoForge dedicated server と、MC Pilot で作成した Minecraft client

## セットアップ

Harness は Mod の Workspace に `.harness` という Git submodule として置き、Workspace の root で次のように実行します。

```sh
node .harness/dist/cli/main.js <command>
```

### 既存の Workspace に導入する

```sh
cd my-mod
git submodule add https://github.com/lau-mods/modding-harness.git .harness
npm --prefix .harness ci
npm --prefix .harness run build
node .harness/dist/cli/main.js init
```

`init` が用意するものは次のとおりです。既にあるファイルは上書きしません。

| ファイル | 内容 |
|---|---|
| `PROJECT.md` | 製品仕様のテンプレート |
| `.harness-config.json` | Harness の設定 |
| `tests/acceptance.json` | AC と GameTest / E2E の対応表 (空) |
| `tests/e2e/` | E2E シナリオの置き場所 |
| `.gitignore` | `.harness-state/runs/` と `.harness-state/runtime/` を追加 |

### 新しい Workspace を作る

Harness を別の場所に clone してビルドし、そこから `create` を実行します。指定した template repository から独立した Git repository を作ります。submodule には、実行した Harness の `origin` を追加します。追加後に submodule をビルドし、`init` と最初の commit まで行います。

```sh
git clone https://github.com/lau-mods/modding-harness.git
npm --prefix modding-harness ci && npm --prefix modding-harness run build
node modding-harness/dist/cli/main.js create ./my-mod \
  --template-repo https://github.com/NeoForgeMDKs/MDK-1.21.1-ModDevGradle.git
```

template の特定の revision を使う場合は `--template-ref <ref>` を指定します。

## 設定 (`.harness-config.json`)

```json
{
  "gradle": {
    "compile": "classes",
    "build": "build",
    "gameTest": "runGameTestServer"
  },
  "agents": {
    "implementation": { "command": "codex", "model": "gpt-5.6-sol", "effort": "medium", "fast": true },
    "codeReview": { "command": "claude", "model": "claude-opus-5-5", "effort": "medium" },
    "e2eReview": { "command": "claude", "model": "claude-opus-5-5", "effort": "high" }
  },
  "runtime": {
    "command": "mct",
    "server": {
      "directory": ".harness-state/runtime/server",
      "command": ["./run.sh", "--nogui"],
      "address": "127.0.0.1:25565",
      "world": "harness-world"
    },
    "clients": ["harness-a"],
    "deploy": [],
    "logs": []
  }
}
```

| キー | 内容 |
|---|---|
| `gradle.compile` / `build` / `gameTest` | 各工程で実行する Gradle task |
| `agents.implementation` | 実装・修正に使う Codex |
| `agents.codeReview` | Code Review と、`plan` / `chat` に使う Claude |
| `agents.e2eReview` | E2E の screenshot レビューに使う Claude |
| `agents.*.command` | Codex / Claude CLI のコマンド |
| `agents.*.model` | 使用するモデル。`null` なら各 CLI の設定に従う |
| `agents.*.effort` | 推論の深さ (`low` / `medium` / `high` など)。`null` なら各 CLI の設定に従う |
| `agents.implementation.fast` | `true` なら Codex を Fast (priority) tier で実行する。`false` なら CLI の設定に従う |
| `runtime.command` | MC Pilot CLI のコマンド |
| `runtime.server.directory` | NeoForge server のディレクトリ (Workspace root からの相対パス) |
| `runtime.server.command` | server の起動コマンド (`directory` 内で実行) |
| `runtime.server.address` | client の接続先 (`host:port`) |
| `runtime.server.world` | 検証用 world の名前 |
| `runtime.clients` | E2E で使う MC Pilot client の instance 名 |
| `runtime.deploy` | server と client 以外に Mod jar を置くディレクトリ |
| `runtime.logs` | E2E の実行後に追加で収集する log file |

`init` が書き出す初期設定では `runtime.server` が `null`、`runtime.clients` が空です。開発を始める前に、次の手順で構成してください。

### Minecraft runtime を用意する

1. NeoForge dedicated server を `runtime.server.directory` にインストールし、`eula.txt` に `eula=true` と書きます。`.harness-state/runtime/` 配下は Git 管理外なので、ここに置くのがおすすめです。
2. MC Pilot の client を `runtime.clients` と同じ名前で作成します。MC Pilot の home は Workspace の `.harness-state/runtime/` 配下に置きます。

   ```sh
   export MCT_HOME=$PWD/.harness-state/runtime/mct-home MCT_CACHE_DIR=$PWD/.harness-state/runtime/mct-cache
   mct client create harness-a --loader neoforge --version 1.21.1
   ```

3. 依存 Mod があれば、server の `mods/` と各 client の `$MCT_HOME/clients/<name>/minecraft/mods/` に置きます。
4. `node .harness/dist/cli/main.js doctor` を実行し、すべての項目が `ok` になることを確認します。

E2E の実行時、Harness は server に次の処理を行います。

- `server.properties` の一部の項目 (world 名、port、`online-mode=false`、superflat、モンスター無効など) を上書きする。
- 検証用 world を毎回作り直す。
- `ops.json` を書き換えて、client のアカウントに operator 権限を与える。

開発中の Mod の jar は、build のたびに server と全 client の `mods/` へ配置します。

## 製品仕様 (`PROJECT.md`)

`PROJECT.md` が製品仕様の正本です。Feature と Acceptance Criterion (AC) を次の形式で書きます。

```markdown
### F-001: Copper Press

#### Description

銅インゴットを銅板に加工する機械を追加する。

#### Acceptance Criteria

##### AC-F001-001: 銅板の加工

Preconditions:
加工機に銅インゴットが1個投入されている。
出力スロットは空である。

Action:
加工処理を開始し、完了まで待機する。

Expected Result:
銅インゴットが1個消費され、
出力スロットに銅板が1個生成される。
```

- Feature ID は `F-001`、AC ID は `AC-F001-001` の形式です。一度付けた ID は変更しないでください。
- 一つの機能に含まれるゲーム処理、GUI、モデル、テクスチャの AC は、同じ Feature にまとめます。
- ゲーム状態や処理結果に関する AC は GameTest で、描画結果に関する AC は E2E で確認します。
- 複数の Feature に共通する要求 (保存、同期、描画規則など) は `## Global Requirements` に書きます。

次の条件をすべて満たしたら、`Status: draft` を `Status: active` に変更します。

- Project ID と Mod ID が決まっている
- Minecraft、NeoForge、Java の version が決まっている
- Feature が1つ以上あり、すべての Feature に AC がある
- `## Open Questions` が `None.` になっている

形式と条件は `node .harness/dist/cli/main.js validate` で確認できます。

## 使い方

### 1. 計画を作る

```sh
git add -A && git commit -m "Define the product"
node .harness/dist/cli/main.js plan
```

Claude が Feature を milestone に割り当てた計画を作ります。一つの Feature は必ず一つの milestone で完成させます。Harness は計画を検証したうえで、`.harness-state/plan.json` と初期の `.harness-state/progress.json` を commit します。この commit が最初の milestone の復元基点になります。

### 2. 自動開発を実行する

```sh
node .harness/dist/cli/main.js develop
```

開始時に次の条件を確認し、満たさない場合は何も変更せずに終了します。

- `PROJECT.md` が active で、計画と整合している
- Git の作業ツリーが clean である
- `.harness` submodule が記録された revision のまま、変更されていない
- `node .harness/dist/cli/main.js doctor` のすべての項目が `ok` である

`develop` は、すべての milestone が完成するか fatal error が発生するまで処理を続けます。実行中は、Harness 本体、`PROJECT.md`、`plan.json` を変更しないでください。変更を検出すると fatal error で停止します。

進行状況は、別の端末で `node .harness/dist/cli/main.js status` を実行すると確認できます。

### 3. 仕様を変更する

```sh
node .harness/dist/cli/main.js chat "加工機の処理時間を5秒に変更する"
```

Claude が `PROJECT.md` を更新します。Harness はその内容を検証して commit し、active であれば新しい計画と progress を作って commit します。仕様の変更と計画の作成は、`develop` を始める前か、正常に完了した後に行ってください。milestone の途中では実行できません。

## 開発の流れ

各 milestone は次の工程で進みます。

```text
Codex Implementation → Compile / Build → Claude Code Review → GameTest → E2E (+ Claude E2E Review) → Git Checkpoint
```

1. **Implementation**：Codex が milestone のすべての AC を実装します。Java ソース、resource、GameTest、E2E シナリオ、`tests/acceptance.json` の作成も含みます。すべての要求に Code Rules ([docs/harness-impl.md](docs/harness-impl.md) §12) を適用します。
2. **Compile / Build**：Gradle の compile task と build task を実行します。
3. **Code Review**：Claude が初回レビューで指摘をすべて列挙し、`CR-001` などの ID を付けて固定します。2回目以降は、固定した指摘の状態だけを判定します。新しい指摘は追加しません。
4. **GameTest**：Gradle の GameTest task を実行し、JUnit XML report を `tests/acceptance.json` と照合します。
5. **E2E**：描画に関する AC がある milestone で実行します。シナリオが撮影した screenshot を Claude がレビューし、初回の指摘 (`ER-001` …) を固定します。
6. **Checkpoint**：すべて完了したら、実装と progress をまとめて commit します。

```text
Harness checkpoint M01

Milestone: M01
Features: F-001
Acceptance-Criteria: AC-F001-001, AC-F001-002
```

### レビュー指摘

指摘の状態は `open`、`resolved`、`accepted` の3つです。

- `resolved`：Claude が修正を確認した。
- `accepted`：Codex が、AC・Code Rules・Minecraft/NeoForge の仕様に基づく理由を付けて、現在の実装を許容した。
- 一度 resolved になった指摘でも、問題が再発すれば `open` に戻ります。

すべての指摘が resolved か accepted になるまで、修正とレビューを繰り返します。この繰り返しに回数の上限はありません。

### 実行失敗・再試行・recovery

Compile、Build、GameTest、E2E のいずれかが失敗した場合は、失敗情報 (log、assertion、screenshot) を Codex に渡して修正させ、Compile / Build からやり直します。

- 修正再試行は工程ごとに最大3回です。
- それでも失敗した場合は直前の checkpoint へ復元し、同じ milestone を最初から実行します (recovery)。recovery 後のレビューは、新しい初回レビューとして扱います。
- recovery の回数に上限はありません。

Codex / Claude CLI の失敗、設定の欠落、Git 操作の失敗などは fatal error です。この場合 Harness は停止し、原因と発生工程を表示します。

## GameTest と E2E

### `tests/acceptance.json`

AC と、それを確認する GameTest / E2E の対応表です。通常は Codex が作成・更新します。

```json
{
  "gameTests": [
    {
      "acId": "AC-F001-001",
      "report": "build/test-results/gametest/TEST-example.PressGameTests.xml",
      "classname": "example.PressGameTests",
      "name": "copperProducesPlate"
    }
  ],
  "e2e": [
    { "acId": "AC-F001-002", "scenario": "tests/e2e/copper-press.mjs" }
  ]
}
```

- milestone のすべての AC が、GameTest か E2E の少なくとも一方に対応している必要があります。
- GameTest の testcase は、指定した report に存在し、failure・error・skipped がどれも 0 件の場合に成功です。
- GameTest の実行が、`report` に指定したパスへ JUnit XML を出力するよう構成する必要があります。

### E2E シナリオ

`tests/e2e/` に置く Node.js スクリプトです。server と client の起動・停止、Mod の配置は Harness が行うため、シナリオはシーンの準備、視点の設定、撮影だけを書きます。雛形は [templates/e2e/scenario.mjs](templates/e2e/scenario.mjs) にあります。

```js
const { camera, command, scenario, screenshot } = await import(process.env.HARNESS_E2E_LIB);

await scenario(async ({ clients }) => {
  const client = clients[0];
  command(client, 'setblock 0 -60 2 examplemod:copper_press');
  await camera(client, { x: 0.5, y: -59, z: -0.5, yaw: 0, pitch: 20 });
  screenshot(client, 'AC-F001-002', 'front');
});
```

| 関数 | 内容 |
|---|---|
| `command(client, text)` | client の operator player として slash command を実行する |
| `camera(client, { x, y, z, yaw, pitch })` | player を指定の位置と向きへ移動し、描画が終わるまで待つ |
| `screenshot(client, acId, label)` | 画面を撮影し、AC と対応付けて記録する |
| `waitFor(read, until, timeoutMs)` | 状態が条件を満たすまで待つ |
| `mct(client, ...args)` | 任意の MC Pilot コマンドを実行する |

シナリオが成功したとみなすのは、例外なく終了し、対象のすべての AC について screenshot が保存された場合です。表示内容の合否は Claude の E2E レビューで決まります。

## 状態ファイル

| パス | Git | 内容 |
|---|---|---|
| `.harness-state/plan.json` | 管理する | 確定した milestone 計画 |
| `.harness-state/progress.json` | 管理する | 現在の milestone と工程、完成した milestone、連続失敗回数、recovery 回数、レビュー指摘、直前の checkpoint、全体の状態 |
| `.harness-state/runs/` | 管理しない | 実行ごとの Gradle log、GameTest report、screenshot、Codex / Claude の入出力 |
| `.harness-state/runtime/` | 管理しない | MC Pilot の home、server のプロセス情報、配置した jar の記録、lock |

`progress.json` は実行中に随時更新され、各 checkpoint に含まれます。最後の checkpoint には `complete` 状態の progress が含まれます。

## 中断・fatal error からの再開

`develop` が途中で止まった場合 (fatal error、Ctrl-C、PC の停止など)、作業ツリーには作業途中の変更と更新された `progress.json` が残ります。fatal error の原因と発生工程は `node .harness/dist/cli/main.js status` で確認できます。

原因を取り除いたら、直前の checkpoint に戻してから再実行してください。`.harness-state/runs/` と `.harness-state/runtime/` は Git 管理外なので、この操作では消えません。

```sh
git reset --hard && git clean -fd
node .harness/dist/cli/main.js develop
```

完成した milestone の commit はそのまま残り、次の milestone から再開します。

## コマンド一覧

Workspace の root で `node .harness/dist/cli/main.js <command>` として実行します。`create` だけは、Workspace の外に clone した Harness から実行します。

| コマンド | 機能 |
|---|---|
| `create <dir> --template-repo <repo> [--template-ref <ref>]` | 新しい NeoForge Workspace を作成する |
| `init` | 既存の Workspace を初期化する |
| `doctor` | 開発環境を診断する |
| `validate` | 仕様、設定、計画、AC 対応表、progress を検査する |
| `status` | 開発状態を表示する (`develop` の実行中も使用可) |
| `chat "<要求>"` | 製品仕様を変更し、計画を作り直す |
| `plan` | milestone 計画を作成して確定する |
| `develop` | 自動開発を実行する |

すべてのコマンドで `--project <dir>` を指定でき、カレントディレクトリ以外の Workspace を対象にできます。

## Harness 自体の開発

```sh
npm ci
npm run build       # dist/ を生成
npm run typecheck
```

ソースは `src/` (TypeScript)、E2E シナリオ用のヘルパーは `e2e/lib.mjs`、テンプレートは `templates/` にあります。
