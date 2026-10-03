# Modding Harness ユーザ仕様

## 1. 目的

Modding Harness は、NeoForge Mod の製品仕様を基準として、AI による実装、ビルド、独立レビュー、Minecraft 実機上での E2E テスト、Git checkpoint 作成までを自動実行する開発ハーネスである。

利用者は製品仕様と必要な実行環境を準備し、Harness は milestone 単位で次の工程を反復する。

```text
製品仕様
  ↓
実装計画
  ↓
実装
  ↓
compile / build
  ↓
Claude コードレビュー
  ↓
Minecraft 実機 E2E
  ↓
必要な場合は Claude 画像レビュー
  ↓
Git checkpoint
  ↓
次の milestone
```

Harness の実行は、全 milestone の完了、利用者による明示的な中断、または継続不能な fatal error の発生まで継続する。

---

## 2. 基本原則

Harness は次の原則に従う。

1. `PROJECT.md` を製品仕様の正本とする。
2. 製品仕様はプレイヤーまたは Minecraft server から観測できる挙動を記述する。
3. 実装は milestone 単位で進める。
4. milestone の完了判定は Minecraft 実機 E2E の成功を最終条件とする。
5. compile/build、コードレビュー、実機 E2E の順で品質確認を行う。
6. レビュー指摘は最初のレビューで確定し、その後は確定済み指摘の解消判定に限定する。
7. 通常の実装失敗やテスト失敗では Harness を停止せず、直前 checkpoint へ復元して milestone を再実行する。
8. milestone が成功した時点で Harness が Git checkpoint を作成する。
9. 次の milestone は直前 milestone の checkpoint 作成後に開始する。
10. Harness 実行中に Harness 本体の変更は許可されない。

本仕様では、開発プロトタイプとしての実行経路の単純さと反復可能性を優先する。

---

# 3. 製品仕様

## 3.1 `PROJECT.md`

プロジェクトルートの `PROJECT.md` を製品仕様の正本とする。

`PROJECT.md` は少なくとも次の情報を持つ。

```markdown
# Project

Status: active

Project ID: example-project
Mod ID: examplemod
Package Path: com.example.examplemod

## Platform

Minecraft: ...
NeoForge: ...
Java: ...

## Purpose

...

## Features

### F-001: Feature name

#### Description

...

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

...

### Multiplayer

...

### Visual

...

### Performance

...

### Compatibility

...

## Constraints

...

## Open Questions

None.
```

Acceptance Criterion には verification type 等の分類を付与しない。

すべての Acceptance Criterion は、最終的に Minecraft 実機 E2E によって確認する。

---

## 3.2 製品仕様の記述単位

仕様は Feature、Requirement、Acceptance Criterion の3階層で記述する。

### Feature

ユーザから見た一まとまりの機能を表す。

例:

```text
F-001: Mechanical Press
```

### Requirement

Feature が満たす必要がある製品要求を表す。

例:

```text
R-F001-001:
Mechanical Press に銅インゴットを投入すると加工を開始する。
```

### Acceptance Criterion

実機上で合否を判断する具体的な観測条件を表す。

例:

```text
AC-F001-001

Preconditions:
Mechanical Press が設置され、入力スロットが空である。

Action:
プレイヤーが銅インゴットを1個投入する。

Expected Result:
加工完了後、銅板が1個出力される。
```

Acceptance Criterion は E2E scenario を作成できる具体性を持つことを要求する。

---

# 4. 仕様状態

`PROJECT.md` は `draft` または `active` の状態を持つ。

## 4.1 draft

仕様作成中の状態を表す。

利用者は Feature、Requirement、Acceptance Criterion、Open Questions を編集する。

## 4.2 active

自動実装を開始できる状態を表す。

active とするために、次の情報を確定する。

- Project ID
- Mod ID
- Package Path
- Minecraft version
- NeoForge version
- Java version
- 1件以上の Feature
- 1件以上の Acceptance Criterion
- 解決済みの Open Questions

未決事項が存在しない場合は次の形式とする。

```markdown
## Open Questions

None.
```

---

# 5. ID

Feature、Requirement、Acceptance Criterion は安定した ID を持つ。

形式は次のとおりとする。

```text
F-001
R-F001-001
AC-F001-001
```

Feature 内の Requirement と Acceptance Criterion は、Feature ID と対応する番号を使用する。

ID は計画、E2E scenario、実行結果、checkpoint の対応付けに使用する。

---

# 6. Cross-cutting Requirements

複数 Feature に共通する要求は `Cross-cutting Requirements` に記述する。

代表的な対象は次のとおりである。

- 保存と再読み込み
- multiplayer 同期
- visual 表現
- performance
- compatibility

これらはテスト分類を表すものではなく、製品要求を表す。

たとえば保存要件が存在する場合、対応する E2E scenario 内で server 再起動や world 再読み込みを実行する。

multiplayer 要件が存在する場合、対応する E2E scenario 内で必要数の client を起動して観測する。

---

# 7. Open Questions

製品挙動について複数の合理的な選択肢が残る場合、`Open Questions` に記録する。

例:

```text
加工途中でブロックを破壊した場合、
投入済み素材を返却するか。
```

Harness は active 化前に Open Questions の解消を要求する。

既存コードや利用者が指定した参考実装から挙動を明確に判断できる場合、その内容を Requirement または Acceptance Criterion として仕様へ反映する。

---

# 8. Harness 設定

プロジェクト固有の実行情報は `.harness-config.json` に記述する。

設定対象は次のとおりである。

```json
{
  "project": {
    "buildFile": "build.gradle",
    "metadata": "src/main/resources/META-INF/neoforge.mods.toml"
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
    "clients": [],
    "server": {},
    "deploy": [],
    "logs": []
  }
}
```

設定値は利用プロジェクトに応じて変更する。

---

# 9. CLI

Harness は次の主要コマンドを提供する。

| コマンド | 用途 |
|---|---|
| `harness create` | 新規 Mod プロジェクトを作成する |
| `harness init` | プロジェクトを Harness 管理下へ初期化する |
| `harness doctor` | 必要な外部環境を確認する |
| `harness validate` | 仕様と設定を確認する |
| `harness status` | 現在の実行状態を表示する |
| `harness chat` | 製品仕様を変更する |
| `harness plan` | milestone 計画を生成する |
| `harness develop` | 全 milestone を実行する |

---

# 10. `harness doctor`

`doctor` は Harness の実行に必要な環境を確認する。

主な対象は次のとおりである。

- Node.js
- Git
- Java
- Gradle wrapper
- Codex CLI
- Claude Code CLI
- Minecraft 実機制御ツール
- server 設定
- client 設定

診断結果から、開発開始前に解決すべき設定不足を確認できる。

---

# 11. `harness validate`

`validate` は開発開始に必要な入力情報を検査する。

主な対象は次のとおりである。

- `PROJECT.md` の構造
- ID の形式と対応関係
- Acceptance Criterion の必須項目
- Open Questions
- `.harness-config.json`
- Gradle task
- runtime 設定
- Harness の実行状態

仕様または設定から実行方法を一意に決定できない状態は fatal error として扱う。

---

# 12. `harness status`

`status` は現在の進行状況を表示する。

表示内容は少なくとも次を含む。

```text
Project
Current Git checkpoint
Current milestone
Current attempt
Current phase
Completed milestones
Remaining milestones
Last failure
```

phase は次の程度に単純化する。

```text
idle
planning
implementing
building
reviewing
e2e
checkpointing
retrying
fatal
complete
```

---

# 13. `harness plan`

`plan` は active な Acceptance Criterion を milestone に分割する。

すべての active Acceptance Criterion をいずれかの milestone に割り当てる。

milestone は少なくとも次を持つ。

```text
Milestone ID
対象 Acceptance Criteria
依存 milestone
実装対象
E2E で確認する製品挙動
```

例:

```text
M01
  AC-F001-001
  AC-F001-002

M02
  depends on M01
  AC-F002-001
```

実装方法の詳細は Implementation Agent が milestone 実行時に決定する。

---

# 14. 計画の固定

`develop` が最初の milestone の実装を開始した時点で、その実行に使用する計画を固定する。

以降は、すべての milestone が完了するまで同じ計画を使用する。

milestone の失敗、再試行、レビュー修正、E2E 修正は同一計画上で処理する。

製品要求を変更する場合は、進行中の開発実行を終了し、`harness chat` によって仕様を更新した後、新しい plan を生成する。

---

# 15. `harness develop`

`develop` は全 milestone を順番に実行する。

基本フローは次のとおりである。

```text
validate
  ↓
plan 読み込み
  ↓
M01
  ↓
checkpoint
  ↓
M02
  ↓
checkpoint
  ↓
...
  ↓
complete
```

各 milestone は独立した成功単位として扱う。

---

# 16. Milestone 実行

milestone の基本処理は次のとおりである。

```text
直前 checkpoint から開始
        ↓
Codex による実装
        ↓
compile
        ↓
build
        ↓
Claude コードレビュー
        ↓
Minecraft 実機 E2E
        ↓
必要な画像の Claude レビュー
        ↓
checkpoint
```

compile/build または E2E が失敗した場合、その attempt を失敗として扱う。

Harness は失敗情報を保存した後、作業中の変更を破棄し、直前 checkpoint へ復元する。

次の attempt では、直前 attempt の失敗内容を Codex に渡して同じ milestone を再実装する。

```text
attempt N
   ↓
失敗
   ↓
失敗内容を保存
   ↓
直前 checkpoint へ復元
   ↓
attempt N+1
```

成功するまで同じ milestone を反復する。

---

# 17. Compile / Build

Codex による実装後、設定された Gradle task を実行する。

順序は次のとおりである。

```text
compile task
   ↓
build task
```

両方が成功した candidate のみコードレビューへ進む。

compile または build が失敗した場合は milestone attempt を終了し、直前 checkpoint から再試行する。

次回 Codex 実行には、コンパイラ出力、Gradle 出力、失敗した task を入力として渡す。

---

# 18. コードレビュー

compile/build 成功後、Claude が milestone の変更内容をレビューする。

レビュー対象には次を含む。

- 対象 Acceptance Criterion
- milestone の目的
- Git diff
- 変更された source
- resource
- build 設定
- Minecraft / NeoForge API の利用
- client/server 関係
- registration
- serialization
- networking
- state synchronization
- lifecycle

## 18.1 初回レビュー

各 milestone attempt における最初のコードレビューで、Claude はその candidate に対する指摘事項をすべて列挙する。

指摘には安定した issue ID を付与する。

例:

```text
CR-001
CR-002
CR-003
```

この時点でコードレビューの指摘集合を確定する。

## 18.2 修正レビュー

Codex が指摘対応としてコードを変更した場合、compile/build を再実行する。

成功後、Claude は確定済み issue の状態のみを判定する。

判定は次のいずれかとする。

```text
open
resolved
```

修正レビューでは新しい issue を追加しない。

## 18.3 Codex による受容

Codex は個別 issue について、修正する代わりに「現状を許容する」と判断できる。

その場合は、issue ID と理由を明示する。

例:

```text
CR-003
Disposition: accepted
Reason:
対象 API の lifecycle 上、この状態は要求された製品挙動に影響しない。
```

issue は次のいずれかを満たした時点で閉じる。

- Claude が `resolved` と判定した。
- Codex が理由付きで `accepted` と判定した。

## 18.4 レビューループ

すべての初回指摘が閉じるまで、次のループを継続する。

```text
Codex 修正
   ↓
compile / build
   ↓
Claude による既存 issue の再確認
   ↓
未解決 issue があれば Codex へ戻す
```

このループ自体は通常の milestone 処理として扱う。

---

# 19. Minecraft 実機 E2E

コードレビュー完了後、対象 Mod を Minecraft 実環境へ配置し、Acceptance Criterion に対応する E2E scenario を実行する。

E2E は milestone 完了判定の中心となる。

E2E scenario は、製品仕様に必要な操作をそのまま実行する。

例:

```text
server 起動
client 起動
world 読み込み
対象 block を配置
item を投入
一定条件まで待機
出力状態を観測
結果を記録
```

保存要件がある場合は scenario 内で restart を実行する。

multiplayer 要件がある場合は scenario 内で複数 client を使用する。

GUI や block model の確認が必要な場合は scenario 内で screenshot を取得する。

これらはすべて通常の E2E 操作として扱う。

---

# 20. E2E Scenario

プロジェクト固有の E2E scenario は `tests/e2e/` に配置する。

scenario manifest は Acceptance Criterion と実行コマンドを対応付ける。

例:

```json
{
  "scenarios": [
    {
      "id": "mechanical-press",
      "acIds": [
        "AC-F001-001",
        "AC-F001-002"
      ],
      "command": [
        "node",
        "tests/e2e/mechanical-press.mjs"
      ]
    }
  ]
}
```

scenario は結果を machine-readable な形式で返す。

例:

```json
{
  "scenario": "mechanical-press",
  "passed": true,
  "assertions": [
    {
      "name": "output item",
      "expected": "examplemod:copper_plate x1",
      "actual": "examplemod:copper_plate x1",
      "passed": true
    }
  ],
  "screenshots": [
    "press-result.png"
  ]
}
```

すべての対象 Acceptance Criterion に対して成功した観測結果が存在することを checkpoint 条件とする。

---

# 21. 画像レビュー

E2E scenario が visual な製品挙動を確認する screenshot を生成した場合、Claude が画像レビューを行う。

対象例は次のとおりである。

- block model
- item model
- texture
- GUI layout
- text placement
- transparency
- clipping
- animation の特定フレーム
- Acceptance Criterion に記述された見た目

## 21.1 初回画像レビュー

最初の画像レビューで、Claude は visual 上の指摘事項をすべて列挙する。

例:

```text
VR-001
VR-002
```

この時点で visual issue の集合を確定する。

## 21.2 修正後レビュー

Codex が visual issue を修正した場合、変更後の candidate に対して次を再実行する。

```text
compile
build
コードレビュー既存 issue 確認
E2E
screenshot 取得
visual issue 確認
```

Claude の画像再レビューは既存 visual issue の解消判定に限定する。

新しい visual issue は追加しない。

Codex はコードレビューと同様に、理由付きで visual issue を受容できる。

すべての visual issue が `resolved` または `accepted` になるまでループを継続する。

---

# 22. E2E 失敗

E2E の assertion が失敗した場合、その milestone attempt を失敗として扱う。

Harness は少なくとも次を保存する。

- 失敗した scenario
- 対応 Acceptance Criterion
- expected value
- actual value
- server log
- client log
- screenshot
- runtime command result

その後、作業中 candidate を破棄し、直前 checkpoint へ復元する。

次の Codex 実装には E2E failure report を入力として渡す。

これにより、

```text
実装
↓
build
↓
review
↓
E2E failure
↓
checkpoint へ復元
↓
failure report を基に再実装
```

を自動反復する。

---

# 23. Review と Failure の区別

レビューによる指摘は candidate を改善する通常工程として扱う。

次の状態では同じ candidate 上で修正を継続する。

- code review issue が残っている
- visual review issue が残っている

次の状態では attempt を失敗として扱い、直前 checkpoint へ復元する。

- compile failure
- build failure
- E2E assertion failure
- Minecraft 実行中の crash
- scenario process failure
- candidate の実行継続が成立しない runtime failure

この区別により、レビュー修正は高速に反復し、実行結果の失敗は常に既知の checkpoint から再構築する。

---

# 24. Checkpoint

milestone が次の条件を満たした場合、Harness が Git commit を作成する。

```text
compile 成功
+
build 成功
+
code review の全 issue が closed
+
対象 Acceptance Criterion の E2E 成功
+
visual issue が存在する場合は全 issue が closed
```

commit は milestone checkpoint として扱う。

commit message には少なくとも次を含む。

```text
Harness-Milestone: M01
Harness-AC: AC-F001-001, AC-F001-002
Harness-Attempt: 3
```

次の milestone は、この checkpoint を開始地点とする。

---

# 25. 失敗からの自動復旧

milestone 実行中の recoverable failure に対して Harness は自動復旧する。

処理は次のとおりである。

```text
failure 検出
   ↓
failure report 保存
   ↓
直前 checkpoint を特定
   ↓
working tree を checkpoint 状態へ完全復元
   ↓
milestone attempt state を初期化
   ↓
failure report を Codex へ追加
   ↓
同一 milestone を再実行
```

作業途中に追加された source、resource、生成物も candidate の一部として破棄対象とする。

Harness が保存する failure report や実行ログは checkpoint 復元後も保持する。

再試行回数には上限を設けず、milestone が成功するまで反復する。

---

# 26. Fatal Error

自動的な実装反復によって解決する対象と、実行基盤そのものが成立しない状態を区別する。

次のような状態を fatal error とする。

- `PROJECT.md` が実行可能な仕様として解釈できない
- 必須設定が欠落している
- 必須 executable が存在しない
- Git repository を利用できない
- checkpoint への復元に失敗する
- Harness の実行状態を読み取れない
- runtime の接続先や deployment target を決定できない
- Harness 実行中に Harness 本体が変更された
- 外部ツールとの入出力契約が成立せず処理を継続できない

fatal error 発生時は `develop` を停止し、原因を利用者へ表示する。

コードのコンパイル失敗、製品挙動の不一致、レビュー指摘など、実装によって改善できる事象は自動反復の対象とする。

---

# 27. Git

Git は milestone の既知状態を保持するために使用する。

`develop` 開始時には clean working tree を要求する。

各 milestone の成功時に Harness が checkpoint commit を作成する。

recoverable failure 時は直前 checkpoint まで working tree を完全に戻す。

これにより各 milestone は常に、

```text
検証済み checkpoint
   ↓
candidate
   ↓
成功 → 新 checkpoint

または

検証済み checkpoint
   ↓
candidate
   ↓
失敗 → 元 checkpoint
```

という単純な lifecycle を持つ。

---

# 28. Harness State

実行中の情報は `.harness-state/` に保存する。

利用者から見て必要な情報は次の程度とする。

```text
current plan
current milestone
current attempt
current phase
last checkpoint
review issues
failure reports
E2E results
logs
screenshots
```

`.harness-state/` は実装途中の状態と診断情報を保持する作業領域として扱う。

Git checkpoint には製品コードと製品仕様を記録し、実行ログ等は state 領域に保持する。

---

# 29. `harness chat`

`chat` は自然言語による製品仕様変更に使用する。

例:

```sh
harness chat "Mechanical Press の処理時間を100 tickに変更する"
```

Harness は要求を `PROJECT.md` の Feature、Requirement、Acceptance Criterion に反映する。

参考コードを指定する場合は次の形式を使用する。

```sh
harness chat \
  "この機械と同じ inventory 挙動にする" \
  --reference src/main/java/example/ExistingMachine.java
```

仕様変更後は `validate` を実行し、新しい plan を生成する。

---

# 30. Minecraft Runtime

E2E では専用の NeoForge server と client を使用する。

Harness は設定された runtime を使用して次を実行する。

```text
Mod 配置
server 起動
client 起動
world 接続
scenario 操作
状態観測
screenshot
log 取得
runtime 終了
```

scenario の要求に応じて、

- server restart
- client restart
- world reload
- 複数 client 接続

なども通常の scenario 操作として実行する。

---

# 31. Runtime World

E2E 用 world は Harness 専用の固定 world を使用する。

world は milestone 間で再利用できる。

scenario が初期状態を必要とする場合は scenario 自身が必要な状態を準備する。

保存後の再読み込みを要求する Acceptance Criterion では、同じ world を再起動後に読み込んで結果を確認する。

---

# 32. 実行ログ

Harness は compile/build、AI agent、Minecraft runtime、scenario の実行結果を保存する。

主な用途は次のとおりである。

- Codex の再実装入力
- fatal error の診断
- 利用者による失敗原因確認
- checkpoint に至るまでの履歴確認

ログ保存は開発ワークフローの診断補助を目的とし、milestone 完了条件そのものは E2E の観測結果とレビュー状態から判断する。

---

# 33. 完了条件

プロジェクトは次の条件を満たした時点で `complete` となる。

1. plan 内の全 milestone が checkpoint を持つ。
2. 全 active Acceptance Criterion がいずれかの完了済み milestone に含まれる。
3. 最終 milestone の E2E が成功している。
4. 最終 checkpoint が作成されている。
5. working tree が最終 checkpoint と一致している。

完了後、`harness status` は `complete` を表示する。

---

# 34. 全体状態遷移

通常系は次のとおりである。

```text
idle
 ↓
planning
 ↓
implementing
 ↓
building
 ↓
reviewing
 ↓
e2e
 ↓
checkpointing
 ↓
次 milestone
 ↓
...
 ↓
complete
```

compile/build または E2E の失敗時は次の遷移を行う。

```text
building / e2e
 ↓
retrying
 ↓
checkpoint restore
 ↓
implementing
```

レビュー指摘時は次の遷移を行う。

```text
reviewing
 ↓
implementing
 ↓
building
 ↓
reviewing
```

visual review 修正時は次の遷移を行う。

```text
e2e
 ↓
visual review
 ↓
implementing
 ↓
building
 ↓
reviewing
 ↓
e2e
 ↓
visual review
```

実行基盤に継続不能な問題が発生した場合は次の状態となる。

```text
fatal
```

---

# 35. 標準利用フロー

利用者による標準操作は次のとおりである。

```sh
harness init

harness doctor

# PROJECT.md を作成・編集

harness validate

harness plan

harness develop
```

`develop` 開始後は Harness が milestone を順番に処理する。

途中で compile/build や E2E が失敗した場合も、Harness が checkpoint 復元と再実装を自動的に反復する。

利用者による通常の操作は、完了後の成果確認、または fatal error 発生時の環境・仕様修正となる。

---

# 36. プロトタイプとしての対象範囲

本 Harness は、正常なプロジェクト設定と、実装中に発生する一般的な失敗からの自動復旧を主要対象とする。

主要な対象シナリオは次のとおりである。

- 正常に実装できる milestone
- compile error を修正して成功する milestone
- build error を修正して成功する milestone
- Claude のレビュー指摘を反復修正する milestone
- E2E assertion failure を基に再実装する milestone
- visual issue を反復修正する milestone
- server/client の一時的実行失敗後に再試行する milestone
- 複数 attempt を経て checkpoint に到達する milestone

この実行モデルにより、Harness の主要責務を「仕様を満たす candidate が完成するまで同一 milestone を自動反復すること」に集約する。