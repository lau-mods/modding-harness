# Modding Harness ユーザ仕様

## 1. 概要

Modding Harness は、NeoForge Mod の製品仕様に基づき、AI による実装、ビルド、コードレビュー、GameTest、E2E、Git checkpoint の作成を自動実行するローカル開発ハーネスである。

Harness は開発対象を milestone に分割し、各 milestone を順番に実装・確認する。完成した milestone は Git commit として確定する。

各 milestone の基本工程は次のとおりとする。

```text
Codex implementation
    ↓
Compile / Build
    ↓
Claude Code Review
    ↓
GameTest
    ↓
E2E
    ↓
Git Checkpoint
    ↓
Next Milestone
```

Code Review で指摘が発生した場合は Codex による修正と再レビューを実行する。

GameTest または E2E で失敗した場合は、Codex による修正と再実行を行う。

実行失敗に対して最大3回の修正再試行を行い、それでも成功しない場合は直前の checkpoint に復元し、同じ milestone を最初から実行する。

`harness develop` は、すべての milestone が完成するか、fatal error が発生するまで処理を継続する。

本 Harness は、単一ユーザがローカル環境で使用する開発プロトタイプを対象とする。

## 2. 用語

| 用語 | 定義 |
|---|---|
| Workspace | Harness を導入した NeoForge Mod の Git repository |
| Feature | 一つのまとまりとして提供する製品機能 |
| Acceptance Criterion（AC） | 製品機能が満たすべき具体的な観測条件 |
| Milestone | 一つ以上の完全な Feature を実装・完成させる開発単位 |
| Plan | Milestone の構成、依存関係、実行順序を定めた計画 |
| GameTest | Minecraft/NeoForge の GameTest 機構によるゲーム内動作のコードベースの確認 |
| E2E | Minecraft client の実際の描画結果を screenshot で取得し、Claude が表示品質を確認する工程 |
| Checkpoint | Milestone の完成を確定するローカル Git commit |
| Recovery | 直前の checkpoint へ復元し、milestone 全体を再実行する処理 |
| Fatal Error | Harness が開発処理を継続するための基本条件を維持できない状態 |

## 3. 実行環境

Harness は Linux および macOS のローカル開発環境で使用する。

標準環境は次のとおりとする。

| 項目 | 要件 |
|---|---|
| Node.js | 20 以上 |
| Git | Git repository および submodule |
| Java | 対象 NeoForge version に適合 |
| Build | Gradle Wrapper |
| Implementation Agent | Codex CLI |
| Review Agent | Claude Code CLI |
| GameTest | NeoForge GameTest |
| Minecraft 操作 | MC Pilot |
| Game Runtime | NeoForge dedicated server および Minecraft client |

Minecraft、NeoForge、Java の version はプロジェクトごとに指定する。

外部 CLI の認証、Java の導入、Minecraft client/server のインストール、MC Pilot の構成は Harness の利用開始前に完了させる。

Harness はプロジェクト内で一つの開発 workflow を実行する。`status` による進捗参照は実行中も認める。

## 4. Workspace 構成

### 4.1 Git submodule

Harness 本体は NeoForge workspace の `.harness` に Git submodule として配置する。

Workspace の Git repository は `.harness` の submodule revision を管理する。

基本構成は次のとおりとする。

```text
my-neoforge-mod/
├── .git/
├── .gitmodules
├── .gitignore
│
├── .harness/                  # Harness Git submodule
│
├── PROJECT.md
├── .harness-config.json
│
├── .harness-state/
│   ├── plan.json
│   ├── progress.json
│   ├── runs/
│   └── runtime/
│
├── src/
│   ├── main/
│   └── test/
│
├── tests/
│   ├── acceptance.json
│   └── e2e/
│
├── build.gradle
├── settings.gradle
├── gradlew
└── gradle/
```

`PROJECT.md` は製品仕様を保持する。

`.harness-config.json` は Harness の実行環境を定義する。

`.harness-state` は開発計画、進捗、一時結果を保持する。

`src/test` は GameTest コードの標準配置先とする。実際の配置はプロジェクトの Gradle source set 構成に従う。

`tests/e2e` は E2E のプロジェクト固有シナリオを保持する。

### 4.2 Harness 本体

`.harness` には、少なくとも次を含める。

- CLI
- Codex および Claude 用の指示
- 開発 workflow
- Code Rules
- GameTest 結果の取得機能
- E2E シナリオテンプレート
- Minecraft runtime の起動・停止機能
- Git checkpoint と recovery の管理機能

**`harness develop` の実行中に Harness 本体の変更は許可されない。**

この制約は Codex、Claude、利用者が起動した外部 Agent、Harness 自身に適用する。

## 5. 製品仕様

### 5.1 正本

製品仕様の正本をプロジェクトルートの `PROJECT.md` とする。

製品仕様には、プレイヤーまたは Minecraft server から観測される動作、表示、制約を記述する。

Harness は `PROJECT.md` に記載された Feature と AC を基準として、実装計画の作成、実装、GameTest、E2E を実施する。

### 5.2 PROJECT.md

基本形式は次のとおりとする。

```markdown
# Project

Status: draft

Project ID:
Mod ID:

## Platform

Minecraft:
NeoForge:
Java:

## Purpose

## Features

### F-001: Feature name

#### Description

#### Acceptance Criteria

##### AC-F001-001: Criterion name

Preconditions:

Action:

Expected Result:

## Global Requirements

## Constraints

## Open Questions
```

`Status` は `draft` または `active` とする。

`draft` は仕様作成中、`active` は開発対象の仕様が確定した状態を表す。

`active` にするためには、次の条件を満たす必要がある。

- Project ID と Mod ID が確定している
- Minecraft、NeoForge、Java の version が確定している
- 少なくとも一つの Feature が存在する
- すべての Feature に AC が存在する
- Open Questions が解消されている

未決定事項が存在しない場合、Open Questions には `None.` を記述する。

### 5.3 Feature

Feature は利用者から見た一つの機能を表す。

Feature ID は `F-001`、`F-002` の形式とする。

一つの機能に含まれるゲーム処理、GUI、モデル、テクスチャなどの AC は、同じ Feature に所属させる。

### 5.4 Acceptance Criterion

AC は `AC-F001-001` の形式の ID を持つ。

各 AC には以下を記述する。

- `Preconditions`：確認開始前のゲーム状態
- `Action`：実行するゲーム内操作
- `Expected Result`：操作後に成立する具体的な結果

例を次に示す。

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

##### AC-F001-002: 加工機の表示

Preconditions:
加工機がworld内に設置されている。

Action:
Minecraft clientから加工機を表示する。

Expected Result:
加工機のモデルとテクスチャが正常に描画される。
missing texture、モデル崩れ、z-fightingが発生しない。
```

ゲーム状態や処理結果に関する AC は GameTest で確認する。

描画結果に関する AC は E2E で確認する。

同じ AC に両方の確認内容が含まれる場合は、GameTest と E2E の両方でその AC を確認する。

### 5.5 Global Requirements

複数の Feature に共通する製品要求は `Global Requirements` に記述する。

world 保存、再読み込み、状態同期、共通 GUI 規則、描画規則などを対象とする。

各 Feature に適用される Global Requirements は、その Feature の完成条件にも含める。

## 6. Milestone Plan

### 6.1 分割単位

Milestone は一つ以上の完全な Feature を含む。

一つの Feature に所属するすべての AC は同じ milestone で完成させる。

一つの Feature を複数 milestone に分割することは禁止する。

複数 Feature をまとめて実装することは認める。

Milestone の分割では、機能間の依存関係と実装順序を考慮する。

### 6.2 Plan 生成

`harness plan` は `PROJECT.md` のすべての Feature を milestone に割り当てる。

各 milestone には次を設定する。

- Milestone ID
- 対象 Feature ID
- 依存 milestone
- 実装方針
- 想定変更領域

Plan は `.harness-state/plan.json` に保存する。

例を次に示す。

```json
{
  "milestones": [
    {
      "id": "M01",
      "features": ["F-001"],
      "dependsOn": [],
      "approach": "銅加工機能を実装する"
    },
    {
      "id": "M02",
      "features": ["F-002", "F-003"],
      "dependsOn": ["M01"],
      "approach": "追加加工機能を実装する"
    }
  ]
}
```

すべての Feature は、いずれか一つの milestone に所属する。

各 milestone に所属する AC は `PROJECT.md` から求める。

### 6.3 Plan の固定

`develop` 開始時に plan を固定する。

`develop` 実行中の milestone 構成、対象 Feature、依存関係、実行順序の変更は禁止する。

Recovery 後も同じ plan を使用する。

## 7. Harness 状態管理

### 7.1 Git 管理ファイル

Harness が開発状態を保持する専用ファイルは、次の二つを基本とする。

| ファイル | 内容 |
|---|---|
| `.harness-state/plan.json` | 確定した milestone plan |
| `.harness-state/progress.json` | 開発進捗、現在工程、再試行回数、Claude 指摘事項 |

両ファイルを Workspace の Git 管理対象とする。

`progress.json` は開発工程の進行に合わせて更新する。

Milestone の checkpoint 作成時には最新の進捗を commit に含める。

### 7.2 一時データ

以下のディレクトリを Git 管理対象外とする。

| ディレクトリ | 内容 |
|---|---|
| `.harness-state/runs/` | Gradle log、GameTest report、screenshot、Claude/Codex 結果 |
| `.harness-state/runtime/` | Minecraft runtime、検証用 world、Mod 配置先、一時データ |

各実行結果は run ごとに区別して保存する。

一時データは実行中の判定、修正、障害解析に使用する。

### 7.3 進捗情報

`progress.json` は少なくとも次を管理する。

- 現在の milestone
- 現在の工程
- 完成した milestone
- 各工程の連続失敗回数
- 当該 milestone の recovery 回数
- Code Review の初回指摘一覧と状態
- E2E の初回指摘一覧と状態
- 直前 checkpoint
- 全体の実行状態

## 8. Harness 設定

`.harness-config.json` に外部コマンドと runtime の設定を保持する。

設定例を次に示す。

```json
{
  "gradle": {
    "compile": "classes",
    "build": "build",
    "gameTest": "runGameTestServer"
  },
  "agents": {
    "implementation": {
      "command": "codex",
      "model": null
    },
    "review": {
      "command": "claude",
      "model": null
    }
  },
  "runtime": {
    "command": "mct",
    "server": null,
    "clients": [],
    "deploy": [],
    "logs": []
  }
}
```

`model` が `null` の場合、各 CLI の標準モデルを使用する。

`gradle` は各工程の実行 task を指定する。

`runtime` は Minecraft client、server、Mod 配置先、log の取得先などを定義する。

## 9. CLI

Harness は以下のコマンドを提供する。

| コマンド | 機能 |
|---|---|
| `harness create` | 新規 NeoForge workspace 作成 |
| `harness init` | 既存 workspace の初期化 |
| `harness doctor` | 開発環境の診断 |
| `harness validate` | 仕様、設定、計画の確認 |
| `harness status` | 開発状態の表示 |
| `harness chat` | 製品仕様の編集 |
| `harness plan` | Milestone plan の生成 |
| `harness develop` | 自動開発の実行 |

CLI の実体は `.harness/dist/cli/main.js` とし、Workspace 内では `node .harness/dist/cli/main.js` から実行する。

以降の `harness` はこの CLI を表す。

### 9.1 create

新規 workspace は NeoForge template repository から作成する。

```sh
harness create ./my-mod \
  --template-repo <repository>
```

特定 revision を利用する場合は `--template-ref` を指定する。

作成する workspace は独立した Git repository とし、Harness を `.harness` submodule として追加する。

初期 `PROJECT.md`、`.harness-config.json`、`.harness-state` を準備する。

### 9.2 init

既存 workspace では Harness submodule を追加してから初期化する。

```sh
git submodule add <harness-repository> .harness

npm --prefix .harness ci
npm --prefix .harness run build

node .harness/dist/cli/main.js init
```

`init` は必要な設定、仕様、状態管理ファイルを準備する。

### 9.3 doctor

`doctor` は Node.js、Git、Java、Gradle Wrapper、Codex、Claude、MC Pilot、Minecraft runtime の構成を診断する。

各項目の利用状態と、問題がある場合の理由を表示する。

### 9.4 validate

`validate` は以下を確認する。

- `PROJECT.md` の構造
- Feature ID と AC ID の一意性
- active 状態の成立条件
- Harness 設定
- Milestone plan の Feature 網羅性
- Milestone の依存関係
- Milestone の Feature 単位の分割
- GameTest と AC の対応
- E2E と AC の対応
- Progress と checkpoint の整合性

### 9.5 status

`status` は現在の milestone、工程、進捗、失敗回数、レビュー指摘、checkpoint を表示する。

### 9.6 chat

`chat` は自然言語の製品要求を `PROJECT.md` に反映する。

```sh
harness chat "加工機の処理時間を5秒に変更する"
```

変更後の仕様を検証し、仕様変更 commit を作成する。

その後、新しい plan と progress を生成して計画を確定する。

仕様変更は `develop` の開始前または正常完了後に行う。

## 10. 自動開発

### 10.1 開始条件

`harness develop` は次の条件が成立している workspace から開始する。

- `PROJECT.md` が active
- Plan が確定している
- Git working tree が clean
- Harness submodule が利用可能
- Codex と Claude が利用可能
- Gradle と GameTest の実行環境が構成済み
- E2E の実行環境が構成済み

初回 milestone の復元基点には、確定した plan を含む commit を使用する。

### 10.2 実行順序

Harness は plan に定義された依存関係を満たす順序で milestone を実行する。

各 milestone では次の工程を順番に進める。

1. Codex implementation
2. Compile / Build
3. Claude Code Review
4. GameTest
5. E2E
6. Git Checkpoint

E2E は描画に関する AC を含む milestone で実行する。

各工程に修正が発生した場合は、変更後のコードに対して compile/build から関連工程を再実行する。

## 11. Codex Implementation

Codex は現在の milestone に所属するすべての Feature と AC を実装する。

入力には少なくとも次を含める。

- `PROJECT.md`
- Milestone の定義
- 対象 Feature と AC
- 関連ソース
- Code Rules
- GameTest の作成指示
- E2E の作成指示
- 修正時の失敗情報または Claude 指摘

Codex は対象 milestone の完成に必要な Java ソース、resource、GameTest、E2E シナリオを実装する。

`PROJECT.md`、plan、Harness 本体は実装中の固定対象とする。

## 12. Code Rules

### 12.1 強制規則

すべての Codex 実装・修正作業には、次の Code Rules を適用する。

```text
Code style:
- Implement exactly what the target Acceptance Criteria require; other behavior belongs to its own milestone.
- Use vanilla Minecraft and NeoForge mechanisms (registries, JSON resources, existing base classes) before custom code.
- Keep one direct path per behavior: small classes, direct calls, inline values until a second use appears.
- Introduce an abstraction, helper or config option only when two call sites use it now.
- Validate only states the game can produce; rely on Minecraft and NeoForge guarantees.
- Remove code, resources and comments that the current behavior no longer uses.
- Names say what the code does; comments say why, describing the current behavior only.
```

### 12.2 適用対象

Code Rules を Java ソース、resource、GameTest、E2E、Gradle 設定の変更に適用する。

Harness は次の方法で Code Rules を強制する。

- Codex のすべての実装・修正要求に Code Rules 全文を含める。
- Claude の初回 Code Review で Code Rules への適合を評価する。
- 違反を Code Review の指摘事項として記録する。
- Codex が修正を行うたびに Code Rules への適合を要求する。
- Code Rules と明確に矛盾する実装を許容判断の対象から除外する。

## 13. Compile / Build

Codex の実装後に Gradle compile task と build task を実行する。

```text
Implementation
    ↓
Compile
    ↓
Build
```

両 task が成功した時点で Code Review に進む。

Compile または Build が失敗した場合は、log とエラー情報を Codex に渡して修正する。

修正後に Compile / Build を再実行する。

ソース変更を伴うすべての修正で同じ処理を行う。

## 14. Claude Code Review

### 14.1 初回レビュー

Build が成功した実装を Claude に渡す。

Claude は次を確認する。

- 対象 AC への適合
- Code Rules への適合
- Minecraft/NeoForge 標準機構の適切な利用
- lifecycle と登録処理
- client/server の処理分離
- 保存・同期処理
- GameTest の実装内容
- 未使用コード、resource、不要な抽象化

初回レビューでは、発見したすべての指摘事項を列挙する。

指摘には `CR-001`、`CR-002` の形式で ID を割り当てる。

各指摘には対象箇所、問題内容、理由、修正内容を含める。

初回レビュー完了時点で issue set を固定する。

### 14.2 修正レビュー

初回レビューで指摘が発生した場合は Codex に差し戻す。

```text
Initial Code Review
    ↓
Issue Set 確定
    ↓
Codex Repair
    ↓
Compile / Build
    ↓
Claude Follow-up Review
```

2回目以降の Claude review は、初回 issue set に含まれる指摘の解消状態だけを判定する。

**2回目以降のレビューで新しい指摘を追加することは禁止する。**

各 issue は次の状態を持つ。

| 状態 | 意味 |
|---|---|
| `open` | 修正または判断が必要 |
| `resolved` | Claude が修正完了を確認 |
| `accepted` | Codex が根拠付きで現在の実装を許容 |

`accepted` を使用する場合、Codex は対象 AC、Code Rules、Minecraft/NeoForge の仕様に基づく理由を記録する。

すべての issue が `resolved` または `accepted` になるまで修正とレビューを繰り返す。

レビュー指摘の解消を目的とするループには回数上限を設けない。

## 15. GameTest

### 15.1 目的

GameTest は、ゲーム内の状態と処理結果をコード上の assertion によって確認する。

対象には次を含める。

- block の設置と状態変化
- item の生成、消費、移動
- recipe と加工処理
- inventory
- block entity
- entity の動作
- 保存と読み込み
- server 上の状態同期
- GUI 操作によって変化するゲーム状態
- その他のゲームロジック

各 GameTest は Minecraft/NeoForge の GameTest 機構を使用して実装する。

### 15.2 AC との対応

GameTest と AC の対応を `tests/acceptance.json` に記録する。

例を次に示す。

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
    {
      "acId": "AC-F001-002",
      "scenario": "tests/e2e/copper-press.mjs"
    }
  ]
}
```

一つの AC に複数の GameTest testcase を対応付けることを認める。

GameTest は対象 AC の Preconditions に相当する状態を準備し、Action を実行して、Expected Result を assertion する。

### 15.3 実行

Code Review 完了後、Gradle の GameTest task を実行する。

Harness は実行によって生成された JUnit XML report を読み取り、AC に対応する testcase の結果を照合する。

Testcase の成功条件は次のとおりとする。

- 指定 testcase が report に存在する
- testcase が実行済み
- failure が0件
- error が0件
- skipped が0件

Milestone の対象となるすべての GameTest が成功した時点で GameTest 工程を完了する。

### 15.4 失敗時の動作

GameTest が失敗した場合は、対象 AC、assertion、実際の観測値、log を Codex に渡す。

Codex は実装または GameTest を修正する。

修正後は Compile / Build、固定済み Code Review 指摘の確認、GameTest を再実行する。

GameTest の失敗は修正再試行の対象とする。

## 16. E2E

### 16.1 対象

E2E は Minecraft client 上の描画結果を確認するために使用する。

主な確認対象は次のとおりとする。

- missing texture
- block model の崩れ
- item model の崩れ
- entity model の崩れ
- UV の異常
- z-fighting
- clipping
- transparency の異常
- GUI の表示崩れ
- text overflow
- resource の組み合わせによる表示不整合

E2E は screenshot を取得し、その画像を Claude が判定する。

### 16.2 シナリオテンプレート

E2E の共通シナリオテンプレートを Harness 本体に含める。

Harness はシナリオの実行環境と lifecycle を管理する。

共通処理は次のとおりとする。

```text
Build Artifact 準備
    ↓
Mod Deploy
    ↓
Server Start
    ↓
Client Start
    ↓
World Load
    ↓
Scenario Setup
    ↓
Camera Setup
    ↓
Screenshot
    ↓
Result Save
    ↓
Client Stop
    ↓
Server Stop
```

Harness は以下の機能を提供する。

- Mod artifact の配置
- Minecraft server の起動と停止
- Minecraft client の起動と停止
- World の準備と読み込み
- MC Pilot によるゲーム操作
- シナリオ固有の操作の呼び出し
- Camera の位置と向きの設定
- Screenshot の取得
- Screenshot と AC の対応付け
- Log と実行結果の保存
- 実行後の終了処理

### 16.3 プロジェクト固有シナリオ

Mod 固有のシナリオは `tests/e2e/` に配置する。

プロジェクト側では、対象 AC の表示状態を作成し、撮影位置を指定する。

例として加工機モデルの確認では、加工機を world に設置し、モデルとテクスチャを観測するための視点を設定する。

共通の client/server 起動・停止処理には Harness 側のテンプレートを使用する。

### 16.4 実行結果

Harness は各 scenario の実行結果と screenshot を保存する。

結果には少なくとも次を含める。

- Scenario ID
- 対象 AC ID
- Scenario の実行成否
- Screenshot path
- 実行 log

Scenario の成功は、シーン準備と screenshot 取得の完了を示す。

表示内容の合否は Claude の E2E レビューによって決定する。

## 17. Claude E2E レビュー

### 17.1 初回レビュー

Claude は E2E の screenshot と対応する AC の Expected Result を確認する。

表示上の問題を初回レビューで列挙し、`ER-001`、`ER-002` の形式で ID を付ける。

各指摘には次を含める。

- Issue ID
- 対象 AC
- Screenshot
- 問題内容
- 修正内容

初回レビュー完了時点で issue set を固定する。

### 17.2 修正レビュー

E2E レビューで指摘が存在する場合、Codex に修正を依頼する。

```text
Initial E2E Review
    ↓
Issue Set 確定
    ↓
Codex Repair
    ↓
Compile / Build
    ↓
GameTest
    ↓
E2E
    ↓
Claude Follow-up Review
```

2回目以降の Claude review は、初回 issue set の解消状態だけを判断する。

**2回目以降に新しい指摘を追加することは禁止する。**

Issue の状態は `open`、`resolved`、`accepted` とする。

Code Review と同じ規則で `accepted` の理由を記録する。

すべての issue が `resolved` または `accepted` になるまで処理を繰り返す。

## 18. 修正後の再確認

Milestone の作業中にソースまたは resource を変更した場合、変更後の候補を Compile / Build から確認する。

初回 Code Review の issue set と初回 E2E レビューの issue set は、当該 milestone 内で維持する。

修正によって既存の問題が再発した場合、その issue を `open` に戻す。

後続の Claude review では固定済み issue の状態だけを更新する。

GameTest は修正後のコードに対して再実行する。

E2E は GameTest 成功後の artifact に対して実行する。

これらの工程が完了した候補を checkpoint の対象とする。

## 19. 実行失敗と再試行

### 19.1 実行失敗

次を修正再試行の対象とする。

- Compile failure
- Build failure
- GameTest failure
- GameTest server crash
- Minecraft client/server crash
- Mod load failure
- E2E scenario failure
- Screenshot 取得失敗
- 外部コマンドの一時的な失敗

### 19.2 再試行

各工程で実行失敗が発生した場合、Codex に失敗情報を渡して修正し、再実行する。

初回実行後の修正再試行は最大3回とする。

```text
Initial Execution
    ↓
Failure
    ↓
Repair / Retry 1
    ↓
Failure
    ↓
Repair / Retry 2
    ↓
Failure
    ↓
Repair / Retry 3
    ↓
Failure
    ↓
Checkpoint Recovery
```

再試行に成功した場合は次の工程に進む。

連続失敗回数は工程ごとに管理し、対象工程の成功時に0へ戻す。

Claude review で `open` issue が存在する状態は、この実行失敗回数に含めない。

## 20. Checkpoint Recovery

### 20.1 復元条件

修正再試行を3回行っても対象工程が成功しない場合、Harness は checkpoint recovery を実行する。

### 20.2 復元処理

Recovery では現在の milestone で作成・変更した作業途中の内容を破棄し、直前の checkpoint の状態へ復元する。

```text
Retry 3 Failure
    ↓
Current Milestone の変更を破棄
    ↓
Git Checkpoint Restore
    ↓
Progress Reset
    ↓
Milestone Restart
```

最初の milestone では、確定済み plan を含む開発開始時の commit を復元基点とする。

2件目以降の milestone では、直前の完成済み milestone の checkpoint を復元基点とする。

### 20.3 初期化対象

Recovery では次を初期化する。

- 現在 milestone の実装変更
- 追加された GameTest
- 追加された E2E シナリオ
- 未確定の build artifact
- Code Review issue set
- E2E issue set
- 各工程の連続失敗回数
- 現在 milestone の途中進捗
- 一時的な runtime 状態

`PROJECT.md`、plan、完成済み milestone、過去 checkpoint は保持する。

### 20.4 再開始

復元後は同じ milestone の Codex implementation から再開始する。

Recovery 後の Code Review と E2E レビューは、新しい初回レビューとして issue set を作成する。

Milestone の再開始回数には上限を設けない。

Harness は milestone が完成するか fatal error が発生するまで、実装、再試行、recovery を継続する。

## 21. Git Checkpoint

### 21.1 完成条件

Milestone の完成条件は次のとおりとする。

- 対象 Feature のすべての AC が実装されている
- Compile が成功している
- Build が成功している
- Code Review の初回指摘がすべて `resolved` または `accepted`
- 対象 GameTest がすべて成功している
- E2E の対象 AC がすべて合格している
- E2E の初回指摘がすべて `resolved` または `accepted`
- Code Rules への適合が確認されている

### 21.2 Commit

完成条件が成立した場合、Harness が local Git commit を作成する。

Commit には次を含める。

- 実装ソース
- Resource
- GameTest
- E2E シナリオ
- AC 対応情報
- 更新された progress

Commit message の例を次に示す。

```text
Harness checkpoint M01

Milestone: M01
Features: F-001
Acceptance-Criteria: AC-F001-001, AC-F001-002
```

Checkpoint は次の milestone の開始基点となる。

## 22. Progress と Status

`progress.json` は現在の workflow 状態を保持する。

Milestone の phase は次の値とする。

```text
idle
implementation
build
code_review
gametest
e2e
checkpoint
recovery
complete
fatal
```

`harness status` は次を表示する。

```text
Project
Current Commit
Current Milestone
Current Phase

Completed Milestones
Remaining Milestones

Build Retry Count
GameTest Retry Count
E2E Retry Count
Milestone Recovery Count

Open Code Review Issues
Open E2E Issues

Last Checkpoint
Overall Status
```

各 milestone の checkpoint 作成時に、その完成状態を `progress.json` に保存して Git commit に含める。

## 23. Fatal Error

Fatal error は、Harness の開発 workflow を継続するための基本条件が失われた場合に発生する。

主な対象は次のとおりとする。

- `PROJECT.md` の構造が不正で解釈できない
- Plan または Progress を解釈できない
- 必須外部コマンドが利用できない
- Codex または Claude の実行設定が成立していない
- Minecraft runtime の必須設定が欠落している
- Git repository または checkpoint が利用できない
- Checkpoint recovery に失敗した
- Harness 本体が実行中に変更された
- Harness の内部状態が破損した
- Harness 自身が処理継続不能な内部例外を発生させた

通常の Compile / Build、GameTest、E2E の失敗は修正再試行および recovery によって処理する。

Fatal error が発生した場合、Harness は処理を終了し、原因と発生工程を表示する。

## 24. 完了条件

プロジェクト全体の完成条件は次のとおりとする。

- すべての active Feature が plan に含まれている
- すべての milestone が checkpoint になっている
- すべての active AC が GameTest または E2E で確認済み
- すべての Claude review issue が完了している
- `progress.json` が全 milestone の完成を示している
- 最終 checkpoint が Git HEAD になっている
- Git working tree が clean

これらが成立すると全体状態を `complete` とする。

最終 milestone の checkpoint には `complete` 状態の progress を含める。

## 25. 標準ワークフロー

利用者による基本操作は次のとおりとする。

```text
NeoForge Workspace 準備
    ↓
Harness Submodule 追加
    ↓
harness init
    ↓
harness doctor
    ↓
PROJECT.md 作成
    ↓
harness validate
    ↓
harness plan
    ↓
harness develop
    ↓
complete
```

`harness develop` は次の処理を自動実行する。

```text
┌───────────────────────────────┐
│ Milestone                     │
│                               │
│ Codex Implementation          │
│          ↓                    │
│ Compile / Build               │
│          ↓                    │
│ Claude Code Review            │
│     └─ Repair Loop            │
│          ↓                    │
│ GameTest                      │
│          ↓                    │
│ E2E                           │
│     └─ Repair Loop            │
│          ↓                    │
│ Git Checkpoint                │
└───────────────────────────────┘
              ↓
        Next Milestone
```

実行失敗時の処理は次のとおりとする。

```text
Execution Failure
    ↓
Codex Repair
    ↓
Retry
    ↓
最大3回
    ↓
Checkpoint Recovery
    ↓
Same Milestone Restart
```

すべての milestone が完成するまでこの処理を継続する。

## 26. 基本原則

**製品仕様の一元化**

`PROJECT.md` を製品仕様の正本とし、すべての実装・確認はその AC に基づいて行う。

**Feature 単位の開発**

一つ以上の完全な Feature を一つの milestone として実装する。

**Code Rules の強制**

Codex の全実装・修正作業に Code Rules を適用し、Claude の初回 Code Review で適合を確認する。

**GameTest による機能確認**

ゲーム内の状態、処理、保存、同期などを GameTest で確認する。

**E2E による描画確認**

Minecraft client の描画結果を screenshot で取得し、Claude が確認する。

**固定されたレビュー指摘**

Claude は初回レビューで指摘事項を確定し、2回目以降は固定された issue set の解消状態だけを確認する。

**自動修正と再試行**

実行失敗時は Codex による修正と最大3回の再試行を行う。

**Checkpoint Recovery**

修正再試行によって成功しない場合は直前の checkpoint に復元し、同じ milestone を再実装する。

**Git による進捗確定**

完成した milestone の実装と進捗を local Git commit に保存する。

**最小限の状態管理**

Harness の運用状態は plan と progress を中心に管理する。実行ログや runtime は一時データとして保持する。

**連続実行**

`harness develop` は全 milestone の完成または fatal error まで処理を継続する。