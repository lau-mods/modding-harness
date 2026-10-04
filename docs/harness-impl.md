# Modding Harness プロトタイプ ユーザ仕様

## 1. 目的

Modding Harness は、NeoForge Mod の製品仕様を起点として、AI による実装、ビルド、コードレビュー、Minecraft 実機 E2E、ローカル Git checkpoint 作成までを自動的に進行する開発ハーネスである。

本ハーネスはプロトタイプとして、正常系および開発中に通常発生する準異常系の処理を対象とする。

主要な開発単位は milestone とする。各 milestone は、製品仕様に定義された Acceptance Criteria を満たす実装を作成し、Minecraft 実機上で期待結果を確認した時点で完了する。

全体フローは次のとおりとする。

```text
PROJECT.md
    ↓
実装計画
    ↓
milestone
    ↓
Codex による実装
    ↓
compile / build
    ↓
Claude によるコードレビュー
    ↓
Minecraft 実機 E2E
    ↓
必要な場合は Claude による画面確認
    ↓
local Git checkpoint
    ↓
次の milestone
```

すべての milestone が checkpoint になった時点で開発を完了する。

---

## 2. 製品仕様

プロジェクトルートの `PROJECT.md` を製品仕様の正本とする。

`PROJECT.md` には、利用者または Minecraft server/client から観測できる製品挙動を記述する。

実装クラス名、内部アルゴリズム、内部データ構造などは、製品上の制約として必要な場合を除き製品仕様に含めない。

仕様は主として次の階層で構成する。

```text
Feature
  ├─ Requirement
  └─ Acceptance Criterion
```

Feature は一まとまりの機能を表す。

Requirement は Feature が満たす製品要求を表す。

Acceptance Criterion は、その要求を満たしたことを Minecraft 実機上で判定する具体的条件を表す。

---

## 3. PROJECT.md

基本形式は次のとおりとする。

```markdown
# Project

Status: draft

Project ID:
Mod ID:
Package Path:

## Platform

Minecraft:
NeoForge:
Java:

## Purpose

## Features

### F-001: Feature name

#### Description

#### Requirements

##### R-F001-001: Requirement name

...

#### Acceptance Criteria

##### AC-F001-001: Criterion name

Preconditions:
...

Action:
...

Expected Result:
...

## Cross-cutting Requirements

### Persistence

### Multiplayer

### Visual

### Performance

### Compatibility

## Constraints

## Open Questions
```

Acceptance Criterion は少なくとも次を含む。

- `Preconditions`
- `Action`
- `Expected Result`

Expected Result は、実機 E2E で観測できる具体的な結果として記述する。

例を示す。

```markdown
##### AC-F001-001: 銅板の加工

Preconditions:
加工機が設置され、入力スロットに銅インゴットが1個存在する。

Action:
プレイヤーが加工操作を実行する。

Expected Result:
入力された銅インゴットが消費され、出力スロットに銅板が1個生成される。
```

---

## 4. プロジェクト状態

`PROJECT.md` の状態には `draft` と `active` を使用する。

`draft` は製品仕様を編集中であることを表す。

`active` は実装計画を作成できる状態を表す。

`active` にするためには、少なくとも次を確定する。

- Project ID
- Mod ID
- Minecraft version
- NeoForge version
- Java version
- 1件以上の active Acceptance Criterion
- Open Questions の解消

未決定事項が存在しない場合は次のように記述する。

```markdown
## Open Questions

None.
```

---

## 5. ID

Feature、Requirement、Acceptance Criterion には安定した ID を付与する。

形式は次のとおりとする。

```text
F-001
R-F001-001
AC-F001-001
```

ID は計画、実装、E2E、checkpoint を関連付ける識別子として使用する。

仕様項目を廃止する場合は `Status: retired` を使用できる。

---

## 6. 実装計画

`harness plan` は active な Acceptance Criteria を milestone に割り当てる。

milestone は次の情報を持つ。

```text
milestone ID
対象 Acceptance Criteria
依存 milestone
実装対象の概要
想定する変更範囲
E2E の概要
```

milestone ID は次の形式を使用する。

```text
M01
M02
M03
```

すべての active Acceptance Criteria は、いずれかの milestone に割り当てる。ただし、何かが起きないことを期待結果とする AC のうちその抑止をこの Mod が実装しないものと、Minecraft・NeoForge・上流の Mod が担う挙動の AC は、計画時に理由とともに除外する。

milestone は Feature 単位以上の大きさとし、実装を共有する Feature は同一 milestone にまとめる。

milestone の実装開始後は、その開発実行が完了するまで計画を固定する。

---

## 7. 開発処理

`harness develop` は計画された milestone を順番に処理する。

各 milestone は次の順序で進行する。

```text
1. Codex による実装
2. compile / build
3. Claude によるコードレビュー
4. Minecraft 実機 E2E
5. 必要な場合は Claude による画面確認
6. Git checkpoint
```

milestone が checkpoint になった後、次の milestone を開始する。

全 milestone の checkpoint 作成後、プロジェクト状態を `complete` とする。

---

## 8. Codex による実装

Codex は milestone に割り当てられた Acceptance Criteria と現在のソースコードを基に実装を行う。

入力情報には少なくとも次を含める。

- 対象 milestone
- 対象 Acceptance Criteria
- PROJECT.md
- 現在の関連ソース
- 直前のレビュー指摘
- 直前の E2E 結果

Codex は必要な source、resource、build configuration、E2E scenario を編集する。

実装中の製品仕様変更は行わない。

ハーネス実行中にハーネス本体の変更は許可されない。

---

## 9. compile と build

Codex による変更後、対象 NeoForge プロジェクトの compile および build を実行する。

代表的な処理は次のとおりとする。

```text
compile
↓
build
```

両方が成功した場合にコードレビューへ進む。

compile または build が失敗した場合は、失敗内容を Codex に渡して修正させる。

---

## 10. Claude コードレビュー

build 成功後、Claude が milestone の変更内容をレビューする。

レビュー対象には少なくとも次を含める。

- 対象 Acceptance Criteria
- milestone の目的
- Git diff
- 変更された source
- 変更された resource
- E2E scenario
- NeoForge API の使用方法
- client/server の処理関係
- registration
- networking
- serialization
- state synchronization

### 初回レビュー

各 milestone の最初のコードレビューでは、Claude がその時点で認識できる指摘事項を一括して列挙する。

各指摘には固定 ID を付与する。

例:

```text
CR-001
CR-002
CR-003
```

初回レビュー終了時点で、その milestone のコードレビュー指摘集合を固定する。

### 再レビュー

2回目以降の Claude レビューは、初回に登録された指摘事項だけを確認する。

各指摘に対して、少なくとも次のいずれかを返す。

```text
resolved
unresolved
```

再レビュー時に新しい指摘事項を追加しない。

---

## 11. コードレビュー修正ループ

初回レビューで指摘が存在した場合、Codex に全指摘を渡して修正を行う。

処理は次のループとなる。

```text
Claude 初回レビュー
    ↓
初回指摘集合を固定
    ↓
Codex 修正
    ↓
compile / build
    ↓
Claude 再レビュー
    ↓
未解決指摘が存在
    └─→ Codex 修正
```

各指摘は次のいずれかになった時点で解決済みとして扱う。

1. Claude が `resolved` と判定した場合
2. 修正担当 Codex が、変更を加えないことを妥当と判断し、その理由を明示して `accepted` とした場合

Codex が `accepted` とする場合は、その判断理由を記録する。

すべての初回指摘が `resolved` または `accepted` になるまで修正ループを継続する。

レビュー上の指摘が残っていること自体を理由として開発処理を停止しない。

---

## 12. Minecraft 実機 E2E

コードレビュー完了後、Minecraft の実 server/client を起動して milestone の Acceptance Criteria を確認する。

E2E はプロジェクト固有の scenario として定義する。

例:

```text
tests/e2e/
  scenarios/
    press.mjs
    persistence.mjs
    multiplayer.mjs
```

scenario は通常の実行可能プログラムとして作成する。

E2E scenario は Minecraft を操作し、Acceptance Criterion の Preconditions、Action、Expected Result に対応する観測を行う。

---

## 13. E2E scenario

scenario manifest の例を示す。

```json
{
  "scenarios": [
    {
      "id": "press",
      "acIds": [
        "AC-F001-001"
      ],
      "command": [
        "node",
        "tests/e2e/scenarios/press.mjs"
      ]
    }
  ]
}
```

scenario result は machine-readable JSON とする。

例:

```json
{
  "scenarioId": "press",
  "passed": true,
  "assertions": [
    {
      "name": "input_consumed",
      "expected": 0,
      "actual": 0,
      "passed": true
    },
    {
      "name": "output_created",
      "expected": 1,
      "actual": 1,
      "passed": true
    }
  ],
  "screenshots": [
    "output.png"
  ]
}
```

scenario の成否は assertion の観測結果によって判定する。

---

## 14. 実機テストの範囲

ゲーム内で必要となる確認はすべて E2E scenario 内で扱う。

たとえば次の処理を一つの E2E 基盤で実行する。

- ブロック配置
- GUI 操作
- アイテム投入
- 加工処理
- inventory 確認
- block state 確認
- entity state 確認
- server state 確認
- client state 確認
- server 再起動
- client 再起動
- world 再読込
- 複数 client 間の同期確認
- screenshot 取得

永続化や multiplayer は Acceptance Criterion の内容に応じて scenario 内で必要な操作を行う。

scenario は前提の構築と結果の観測を決定的なコマンドで行う。

---

## 15. 画面確認

Acceptance Criterion の期待結果に視覚的な内容が含まれる場合、E2E scenario は screenshot を取得する。

対象例は次のとおりとする。

- block model
- item model
- texture
- GUI layout
- text
- animation
- transparency
- clipping
- 表示状態

取得された screenshot は Claude が確認する。

### 初回画面確認

最初の画面確認では、Claude が認識できる視覚上の問題を一括して列挙する。

各指摘には固定 ID を付与する。

例:

```text
VR-001
VR-002
```

この時点で画面確認の指摘集合を固定する。

### 再確認

2回目以降は、初回指摘の解消状態だけを確認する。

新しい視覚指摘を追加しない。

各指摘は Claude による `resolved`、または修正担当 Codex による理由付き `accepted` によって解決済みとなる。

---

## 16. 画面修正ループ

画面確認で指摘が発生した場合は Codex に差し戻す。

その後は次の工程を再実行する。

```text
Codex 修正
↓
compile / build
↓
コードレビュー
↓
Minecraft E2E
↓
画面再確認
```

コードレビューでは、その milestone の初回コードレビュー指摘だけを確認する。

画面確認では、その milestone の初回画面確認指摘だけを確認する。

すべての指摘が解決するまでループを継続する。

---

## 17. 実行失敗と再試行

外部プロセスまたは実行環境上の失敗が発生した場合、まず同一状態のまま同じ処理を再実行する。

対象には次を含む。

- Codex 呼び出し失敗
- Claude 呼び出し失敗
- Minecraft server 起動失敗
- Minecraft client 起動失敗
- Minecraft crash
- MC Pilot 接続失敗
- E2E scenario process failure
- screenshot 取得失敗
- 一時的なファイルアクセス失敗

同一処理は最大3回実行する。

```text
1回目
↓ failure
2回目
↓ failure
3回目
↓ failure
milestone rollback
```

再試行中は source、resource、config、scenario に修正を加えない。

3回以内に成功した場合、そのまま次工程へ進む。

---

## 18. milestone rollback

同じ処理が3回連続して実行失敗した場合、進行中 milestone の作業内容を破棄する。

プロジェクトを直前の checkpoint の状態へ復元する。

同時に、その milestone で生成した次の情報を新しい実行用に初期化する。

- 実装変更
- 一時的な E2E 結果
- review session
- review issue set
- screenshot
- milestone runtime state

その後、同じ milestone を最初から再実行する。

```text
checkpoint
↓
Codex による新しい実装
↓
compile / build
↓
Claude review
↓
E2E
```

milestone rollback の後も同一の PROJECT.md と実装計画を使用する。

rollback 自体を理由として Harness 全体を停止しない。

---

## 19. E2E assertion failure

Minecraft が正常に起動し、scenario も正常に実行された上で assertion が期待値と一致しなかった場合、その結果は製品挙動の不一致として扱う。

この場合は Codex に次の情報を渡す。

- 対象 Acceptance Criterion
- Expected Result
- 実測結果
- 関連ログ
- screenshot
- scenario 結果

Codex が修正した後、次の工程から再開する。

```text
compile / build
↓
コードレビュー
↓
Minecraft E2E
```

assertion failure はプロセス実行失敗の3回再試行対象とは区別する。

---

## 20. fatal

Harness が自動的に処理を継続するための前提そのものが失われた状態を `fatal` とする。

代表例は次のとおりとする。

- `PROJECT.md` を読み取れない
- active specification が構造的に成立していない
- 実装計画を読み取れない
- 直前 checkpoint を復元できない
- Harness 本体が実行中に変更された
- `PROJECT.md` が開発実行中に変更された
- 必須 executable が存在しない
- Codex または Claude の認証が利用できない
- Minecraft 実機環境の必須設定が存在しない
- Harness 自身の内部状態を読み取れない
- Harness 内部処理で継続不能な例外が発生した

fatal が発生した場合は処理を停止し、原因を利用者に表示する。

通常の build failure、review 指摘、E2E assertion failure、Minecraft crash は自動処理の対象として扱う。

---

## 21. checkpoint

milestone が次の条件を満たした時点で Harness がローカル Git checkpoint を作成する。

```text
compile 成功
build 成功
コードレビューの全初回指摘が解決済み
対象 Acceptance Criteria の E2E 成功
画面確認を実施した場合は全初回画面指摘が解決済み
```

checkpoint commit には milestone と Acceptance Criteria の対応を記録する。

例:

```text
Harness-Milestone: M02
Harness-AC: AC-F002-001, AC-F002-002
```

checkpoint 作成後、その commit を次の milestone の復元地点として使用する。

---

## 22. complete

次の条件をすべて満たした場合、開発を完了する。

- すべての planned milestone が checkpoint になっている
- 計画時に除外したものを除くすべての active Acceptance Criteria がいずれかの完成 milestone に含まれている
- 最終 milestone の E2E が成功している
- 最終 checkpoint が作成されている

完了時の状態を `complete` とする。

Harness の自動開発処理は、`fatal` または `complete` に到達するまで継続する。

---

## 23. 仕様変更

製品仕様を変更する場合は `harness chat` を使用する。

```sh
harness chat "加工時間を40tickから20tickに変更する"
```

Harness は要求内容を基に `PROJECT.md` を更新し、構造を確認した上で新しい実装計画を作成する。

仕様変更は milestone 実行の外側で行う。

仕様変更後の開発は新しい計画に基づいて開始する。

---

## 24. 状態表示

`harness status` は少なくとも次を表示する。

```text
Project status
Current Git checkpoint
Current milestone
Current phase
Completed milestones
Remaining milestones
Current review issues
Current E2E scenario
Retry count
Rollback count
```

phase の例は次のとおりとする。

```text
idle
preflight
planning
implementation
build
code_review
e2e
visual_review
checkpoint
rollback
fatal
complete
```

---

## 25. CLI

Harness は対象プロジェクトの `.harness` に Git submodule として配置する。

主要 CLI は次のとおりとする。

| コマンド | 用途 |
|---|---|
| `harness create` | NeoForge プロジェクトを作成し、Harness を `.harness` submodule として追加する |
| `harness init` | `.harness` submodule を持つプロジェクトを Harness 管理対象として初期化する |
| `harness doctor` | 必要な開発環境を確認する |
| `harness preflight` | Minecraft 実機環境の起動・world 参加・停止を確認する |
| `harness validate` | PROJECT.md と Harness 設定を確認する |
| `harness status` | 現在の実行状態を表示する |
| `harness chat` | 製品仕様を変更する |
| `harness plan` | milestone 計画を作成する |
| `harness develop` | 全 milestone の自動開発を実行する |

---

## 26. Harness 設定

`.harness-config.json` には、プロジェクト固有の実行設定を記述する。

概念例を示す。

```json
{
  "project": {
    "buildFile": "build.gradle"
  },
  "gradle": {
    "compile": "classes",
    "build": "build"
  },
  "agents": {
    "implementation": {
      "command": "codex"
    },
    "review": {
      "command": "claude"
    }
  },
  "runtime": {
    "command": "mct",
    "clients": [
      "client-a",
      "client-b"
    ],
    "server": "server"
  }
}
```

設定は compile/build、Codex、Claude、Minecraft server/client、MC Pilot を接続するために使用する。

---

## 27. 実機環境

Minecraft E2E を使用するプロジェクトでは、次の環境を事前に構築する。

- 対象 Minecraft version の NeoForge server
- 対象 Minecraft version の NeoForge client
- MC Pilot
- Harness から起動できる client configuration
- Mod 配置先
- world 保存先
- server/client log の取得先

Harness は設定された client を起動し、world への参加を確認してから scenario を実行する。複数 client を必要とする Acceptance Criterion では、scenario がそれらの client を操作する。

world 再読込を必要とする Acceptance Criterion では、scenario が server/client を再起動して同じ world を開く。

これらはすべて通常の E2E 操作として扱う。

---

## 28. E2E world

Harness 用の固定テスト world を使用する。

例:

```text
harness-world
```

同一プロジェクトの milestone 間で同じ world を使用できる。

scenario は必要に応じて world 内の初期状態を構築する。

milestone rollback 後は scenario が必要な初期状態を再構築する。

---

## 29. ログ

compile、build、Codex、Claude、server、client、E2E scenario の標準出力と標準エラーを実行記録として保存する。

利用者は `harness status` または実行ディレクトリから次を確認できる。

```text
何を実行したか
何回目の実行か
成功したか
失敗理由
Claude の初回指摘
各指摘の現在状態
E2E assertion
screenshot
rollback 履歴
```

プロトタイプでは、実行継続および問題解析に必要な範囲の記録を保持する。

---

## 30. 自動開発の状態遷移

通常の milestone は次の状態遷移を行う。

```text
implementation
    ↓
build
    ├─ build failure → implementation
    │
    ↓ success
code_review
    ├─ 指摘あり → implementation
    │               ↓
    │             build
    │               ↓
    │             code_review
    │
    ↓ 全指摘解決
e2e
    ├─ assertion failure → implementation
    │
    ├─ visual issue → implementation
    │
    ↓ success
checkpoint
```

外部実行失敗時は次の処理を行う。

```text
operation
  ↓ failure
retry 1
  ↓ failure
retry 2
  ↓ failure
rollback
  ↓
milestone restart
```

---

## 31. 自動処理の終了条件

Harness の開発処理には二つの終了状態を定義する。

### complete

全 milestone が完成し、最後の checkpoint が作成された状態。

### fatal

Harness が自律的に次の処理を決定または実行できない状態。

レビュー指摘、コード上の不具合、E2E 不一致、一時的な build failure、Minecraft crash は終了条件として扱わず、自動修正、再試行、rollback のいずれかによって処理を継続する。

---

## 32. 設計原則

本プロトタイプは次の原則に従う。

1. `PROJECT.md` に製品として期待する挙動を記述する。
2. Acceptance Criterion の最終確認は Minecraft 実機 E2E で行う。
3. 実装工程は Codex が担当する。
4. 実装計画、仕様変更、コードおよび画面の第三者確認は Claude が担当する。
5. Claude の初回レビューで指摘集合を確定する。
6. 再レビューでは初回指摘の解消だけを判定する。
7. 指摘が解消するまで実装とレビューを自動的に繰り返す。
8. 実行系の失敗は同一状態で最大3回試行する。
9. 3回連続して実行できない場合は直前 checkpoint に復元して milestone を最初から作り直す。
10. milestone の成功状態だけを checkpoint として確定する。
11. Harness は `complete` または `fatal` に到達するまで自動処理を継続する。