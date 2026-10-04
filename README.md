# Modding Harness

`PROJECT.md` に書いた製品仕様を起点に、NeoForge Mod の実装、build、コードレビュー、Minecraft 実機 E2E、ローカル Git checkpoint までを自動で進める開発ハーネスです。仕様は [docs/harness-impl.md](docs/harness-impl.md) にあります。

- 実装: Codex CLI
- 実装計画・仕様変更・コードレビュー・画面確認: Claude Code
- Minecraft client 操作: MC Pilot (`mct`)
- Minecraft server: NeoForge dedicated server (Harness が起動・停止)

## 必要な環境

- Node.js 20 以上、Git
- 対象 Minecraft に合う Java と、プロジェクトの Gradle wrapper
- Codex CLI (`codex login` 済み)
- Claude Code (`claude auth login` 済み)
- MC Pilot (`mct`)

## インストール

```sh
npm install
npm run build
npm link   # harness コマンドを PATH に追加する
```

## 使い方

### 1. プロジェクトを用意する

新しく作る場合は NeoForge MDK などのテンプレートから作成します。Harness は `.harness` submodule として追加されます。

```sh
harness create my-mod --template-repo https://github.com/NeoForgeMDKs/MDK-1.21.1-ModDevGradle.git
cd my-mod
```

既存のプロジェクトでは Harness を `.harness` submodule として追加してから `init` を実行します。

```sh
cd my-mod
git submodule add https://github.com/lau-mods/modding-harness.git .harness
harness init
```

`init` は次の 3 つを用意します。既にあるファイルはそのまま使います。

- `PROJECT.md` (製品仕様のテンプレート)
- `.harness-config.json` (Harness 設定)
- `.gitignore` の `.harness-state/` (実行状態と実行記録の置き場所)

### 2. 製品仕様を書く

`PROJECT.md` に Feature、Requirement、Acceptance Criterion を書きます。

```markdown
##### AC-F001-001: 銅板の加工

Preconditions:
加工機が設置され、入力スロットに銅インゴットが1個存在する。

Action:
プレイヤーが加工操作を実行する。

Expected Result:
入力された銅インゴットが消費され、出力スロットに銅板が1個生成される。
```

Expected Result は Minecraft 実機の E2E で観測できる結果として書きます。項目を廃止するときは見出しの下に `Status: retired` を書きます。

Project ID、Mod ID、Minecraft / NeoForge / Java の version、1 件以上の Acceptance Criterion がそろい、Open Questions が `None.` になったら `Status: active` にします。`harness validate` で形式と条件を確認できます。

### 3. 実機環境を用意する

E2E では、Harness が NeoForge server を起動し、scenario が MC Pilot で client を操作します。

1. NeoForge server を `.harness-state/runtime/server` にインストールし、`eula.txt` に `eula=true` を書きます。起動コマンドは `runtime.server.command` (既定値 `./run.sh --nogui`) です。
2. MC Pilot の client を `runtime.clients` の名前で作成します。MC Pilot の home は project 内に置きます。

   ```sh
   export MCT_HOME=$PWD/.harness-state/runtime/mct-home MCT_CACHE_DIR=$PWD/.harness-state/runtime/mct-cache
   mct client create harness-a --loader neoforge --version 1.21.1
   mct client create harness-b --loader neoforge --version 1.21.1
   ```

3. 依存 Mod があれば、server の `mods/` と各 client の `$MCT_HOME/clients/<name>/minecraft/mods/` に置きます。
4. `harness doctor` ですべての項目が `ok` になることを確認します。

開発する Mod の jar は、build のたびに Harness が server と全 client の `mods/` へ配置します。world は固定のテスト world (`runtime.world`、既定値 `harness-world`) を使います。

### 4. 開発する

```sh
git add -A && git commit -m "Define the product"
harness develop
```

`develop` は計画が無ければ作成し、全 milestone を順に checkpoint まで進めます。計画だけを先に確認したい場合は `harness plan` を使います。進行状況は別の端末で `harness status` で確認できます。

### 5. 仕様を変更する

```sh
harness chat "加工時間を40tickから20tickに変更する"
```

Claude が `PROJECT.md` を更新し、Harness が形式を確認して commit したうえで新しい計画を作ります。仕様変更は開発実行の完了後に行います。

## 開発の流れ

各 milestone は次の順に進みます。

1. Codex が対象 Acceptance Criteria を実装します。source、resource、build 設定、E2E scenario を編集します。
2. Gradle で compile と build を実行します。失敗した場合はエラー内容を Codex に渡して修正させます。
3. Claude がコードレビューを行います。初回レビューの指摘 (`CR-001` …) がその milestone の指摘集合になり、2 回目以降はその解消状態だけを判定します。指摘は Codex に渡され、Claude が `resolved` と判定するか、Codex が理由を付けて `accepted` とした時点で解決済みになります。
4. 実機 E2E を実行します。assertion が期待値と一致しない場合は、実測値・ログ・screenshot を Codex に渡して修正させます。
5. screenshot が取得された場合、Claude が画面確認を行います。指摘 (`VR-001` …) の扱いはコードレビューと同じです。
6. すべて解決したら checkpoint commit を作ります。commit には `Harness-Milestone` と `Harness-AC` trailer が付きます。

外部実行 (Codex / Claude の呼び出し、server 起動、MC Pilot、scenario process) が失敗した場合は、同じ状態のまま最大 3 回実行します。3 回とも失敗した場合は直前の checkpoint に戻し、その milestone を最初からやり直します。

次の場合は `fatal` として処理を停止し、原因を表示します。原因を取り除いてから `harness develop` を再実行すると、中断した milestone から再開します。

- 開発実行中に Harness 本体または `PROJECT.md` が変更された
- 必須のコマンドが見つからない、Codex / Claude の認証が利用できない
- `PROJECT.md`、設定、計画、実行状態を読み取れない
- 実機環境 (server、MC Pilot client) の準備が不足している
- 直前の checkpoint を復元できない

計画は開発実行の開始から完了まで固定されます。開発を完了させずに計画を作り直す場合は、`.harness-state/state.json` を削除してから `harness plan` を実行します。

## E2E scenario

scenario は Codex が実装の一部として作成する、通常の実行可能プログラムです。`tests/e2e/manifest.json` に登録します。

```json
{
  "scenarios": [
    { "id": "press", "acIds": ["AC-F001-001"], "command": ["node", "tests/e2e/scenarios/press.mjs"] }
  ]
}
```

Harness は mod を配置して server を起動し、全 client を空き port で起動して world への参加を待ってから、対象 milestone の Acceptance Criteria に対応する scenario を project root で順に実行し、最後に client と server を停止します。scenario には次の環境変数が渡されます。

| 環境変数 | 内容 |
|---|---|
| `HARNESS_MCT` | MC Pilot コマンド |
| `MCT_HOME`, `MCT_CACHE_DIR` | MC Pilot の home と cache |
| `HARNESS_CLIENTS` | client 名の JSON 配列 |
| `HARNESS_SERVER_ADDRESS` | server のアドレス |
| `HARNESS_WORLD` | テスト world 名 |
| `HARNESS_SERVER_CONTROL` | server 制御コマンドの JSON argv。末尾に `stop` / `start` を付けて実行すると server と client を再起動できる |
| `HARNESS_RESULT_FILE` | 結果 JSON の出力先 |
| `HARNESS_SCREENSHOT_DIR` | screenshot の出力先 |
| `HARNESS_SCENARIO_ID`, `HARNESS_AC_IDS` | scenario ID と対象 AC ID の JSON 配列 |

scenario は接続済みの client を MC Pilot で操作して実際の状態を観測します。結果は次の形式で `HARNESS_RESULT_FILE` に書きます。

```json
{
  "scenarioId": "press",
  "passed": true,
  "assertions": [
    { "name": "input_consumed", "expected": 0, "actual": 0, "passed": true },
    { "name": "output_created", "expected": 1, "actual": 1, "passed": true }
  ],
  "screenshots": ["output.png"]
}
```

scenario の成否は assertion で判定し、1 件以上の assertion がすべて成功したとき成功になります。結果を書いた scenario は、assertion の成否にかかわらず終了コード 0 で終了します。0 以外の終了コードは scenario 自体の実行失敗として再試行の対象になります。

## 設定

`.harness-config.json` の例です。

```json
{
  "project": { "buildFile": "build.gradle" },
  "gradle": { "compile": "classes", "build": "build" },
  "agents": {
    "implementation": { "command": "codex" },
    "review": { "command": "claude", "model": "opus" }
  },
  "runtime": {
    "command": "mct",
    "server": {
      "directory": ".harness-state/runtime/server",
      "command": ["./run.sh", "--nogui"],
      "address": "127.0.0.1:25565"
    },
    "clients": ["harness-a", "harness-b"],
    "world": "harness-world"
  }
}
```

| 項目 | 内容 |
|---|---|
| `gradle.compile`, `gradle.build` | compile と build に使う Gradle task |
| `agents.implementation` | 実装を担当する Codex CLI。`model` で model を指定できる |
| `agents.review` | 計画・仕様変更・レビューを担当する Claude Code CLI。`model` で model を指定できる |
| `runtime.command` | MC Pilot コマンド |
| `runtime.server` | NeoForge server のディレクトリ (project root からの相対パス)、起動コマンド、アドレス |
| `runtime.clients` | MC Pilot の client 名 |
| `runtime.world` | 固定テスト world 名 |

## 実行記録

`.harness-state/` に実行状態と記録を保存します。実装計画は project root の `.harness-plan.json` に保存し、作成のたびに commit します。

| パス | 内容 |
|---|---|
| `state.json` | phase、checkpoint、進行中 milestone の指摘集合と E2E 結果、再試行・rollback 履歴 |
| `runs/<時刻>-<連番>-<milestone>-<処理>-<回数>/` | 実行 1 回分の記録。`record.json` (成否と失敗理由)、`command.json`、`stdout.log`、`stderr.log`、agent の `prompt.md` と出力、E2E の結果・screenshot・server / client log |
| `runtime/` | server、MC Pilot home、mod 配置記録 |

## コマンド

| コマンド | 用途 |
|---|---|
| `harness create <dir> --template-repo <repo> [--template-ref <ref>]` | テンプレートから NeoForge プロジェクトを作成し、Harness を `.harness` submodule として追加する |
| `harness init` | `.harness` submodule を持つプロジェクトを Harness 管理対象として初期化する |
| `harness doctor` | 必要な開発環境を確認する |
| `harness validate` | PROJECT.md と Harness 設定を確認する |
| `harness status` | 現在の実行状態を表示する |
| `harness chat <request>` | 製品仕様を変更する |
| `harness plan` | milestone 計画を作成する |
| `harness develop` | 全 milestone の自動開発を実行する |
| `harness server start\|stop` | E2E scenario から server を再起動する |

すべてのコマンドは `--project <dir>` で対象プロジェクトを指定できます。既定値はカレントディレクトリです。

## Harness の開発

```sh
npm run typecheck
npm test
```

`npm test` は Codex、Claude、Gradle、MC Pilot、NeoForge server を fake に置き換え、一時 Git リポジトリで `develop` の全工程 (build 失敗、レビューと再レビュー、E2E 失敗、画面確認、rollback、fatal、仕様変更) を実行します。
