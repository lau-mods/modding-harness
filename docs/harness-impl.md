# Task

このrepositoryに、Minecraft Java Edition / NeoForge Mod開発用の **Modding Harness本体** を実装してください。

計画だけを提示して終了してはいけません。repositoryを調査し、設計、実装、テスト、ドキュメント整備、claudeによる自己レビューまで一回の実行で完了してください。

不明な内部実装事項について質問はせず、以下の設計原則から最も単純で保守しやすい選択をしてください。

ただし、製品仕様上の意味を勝手に追加してはいけません。

---

# Goal

このHarnessは、既存または新規のNeoForge projectに `.harness` Git submoduleとして追加される独立した開発基盤です。

Harnessが管理する対象は、

- `PROJECT.md` に確定された製品仕様
- AIによる仕様編集
- execution planning
- milestone単位の実装
- independent review
- deterministic verification
- Minecraft runtime verification
- visual verification
- local Git checkpoint
- full-project regression

です。

Harness自身はMinecraft Mod templateを所有しません。

最終的な開発状態は、

- `PROJECT.md` の全active Acceptance Criteriaが実装済み
- 必要なverificationがすべて成功
- 各milestoneが検証済みlocal commitとして確定
- 最後にPROJECT全体のregressionが成功

した状態です。

---

# Core architectural principle

Harnessを「LLM同士を自由に会話させるmulti-agent framework」として設計しないでください。

中心は明示的なstate machineです。

概念的には以下です。

```text
User Request
    ↓
Spec Edit
    ↓
Spec Validation
    ↓
Deterministic Projection
    ↓
Execution Planning
    ↓
Milestone
    ├─ Implementation
    ├─ Static / Unit
    ├─ Independent Code Review
    ├─ Build
    ├─ GameTest
    ├─ E2E
    ├─ Visual / Persistence / Multiplayer
    └─ Verified Local Commit
    ↓
Next Milestone
    ↓
Full Regression
    ↓
Complete
```

AIは推論を行うコンポーネントであり、system stateの正本ではありません。

現在phase、検証状態、checkpoint可否、完了判定はHarnessが決定してください。

---

# Non-negotiable specification rules

## PROJECT.md

`PROJECT.md` は唯一の製品仕様の正本です。

以下は最終的にすべて `PROJECT.md` に存在しなければなりません。

- Feature
- Requirement
- Acceptance Criterion
- Scope
- Non-goals
- Constraints
- Visual requirements
- Persistence requirements
- Multiplayer requirements
- Compatibility requirements
- Performance requirements
- Open Questions

Agent conversation、Execution Plan、generated projection、review result、test resultは製品仕様の正本ではありません。

情報が競合した場合は `PROJECT.md` を優先してください。

---

# PROJECT.md standard structure

最低限、次の形式を扱ってください。

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

## Scope

### In Scope

### Non-goals

## Terminology

## Features

### F-001: Feature name

#### Description

#### Requirements

##### R-F001-001: Requirement name

Requirement description.

#### Acceptance Criteria

##### AC-F001-001: Criterion name

Preconditions:
...

Action:
...

Expected Result:
...

Verification:
- unit
- gametest
- e2e
- visual
- persistence
- multiplayer

## Cross-cutting Requirements

### Persistence

### Multiplayer

### Visual

### Performance

### Compatibility

## Constraints

## Open Questions
```

Feature、Requirement、Acceptance Criterionにはstable IDを要求してください。

削除済みIDを別の意味へ再利用してはいけません。

Verificationの標準typeは、

- unit
- gametest
- e2e
- visual
- persistence
- multiplayer

です。

Build成功は各AC固有のverificationではなく、checkpoint共通のHarness invariantとして扱ってください。

---

# Specification Projection

Specification ProjectionはAI生成要約にしてはいけません。

`PROJECT.md`から機械的かつ決定論的に、

- Feature view
- Acceptance Criteria view
- Testing view
- Agent context

などを生成してください。

許可する処理は、

- Markdown AST parsing
- section抽出
- heading抽出
- ID indexing
- source range記録
- parent-child relation
- verification type集約
- deterministic formatting

です。

禁止する処理は、

- AIによる要約
- Requirementの追加
- ACの追加
- 暗黙条件の追加
- wordingの意味的書き換え
- product semanticsの推定

です。

materializeされたprojectionが存在する場合、`validate`で `PROJECT.md` から再生成した内容と一致することを検査してください。

projectionを直接編集した状態はvalidation errorにしてください。

---

# Execution Plan

Execution PlanはAIによる推論を許可します。

Plannerは、

- milestone分割
- milestone順序
- source変更候補
- dependency
- implementation approach
- test implementation strategy
- verification順序

を決定して構いません。

ただし、

- すべてのmilestoneは1個以上の既存ACに紐付く
- PROJECT.mdに存在しない製品要件を追加しない
- PROJECT.mdにないものをmilestone completion conditionにしない

ことを保証してください。

Milestone boundaryは、単なるコード構造だけでなく **高コストなMinecraft runtime verification回数を減らすこと** も考慮してください。

例えば、

```text
block registration
block rendering
GUI
GUI texture
```

を意味なく別々のruntime milestoneへ分割しないでください。

一方、GameTestだけで検証できるserver logicと、実clientが必要なvisual/UIは分離して構いません。

---

# Agent responsibilities

モデル固有のコードをworkflow全体へ散らさず、薄いadapterへ閉じ込めてください。

ただし将来の未知のAgent provider向けplugin frameworkは作らないでください。

現時点で必要なのは以下だけです。

## Spec Editor

基本的にはCodex CLIを使用します。

Userのproduct changeを既存 `PROJECT.md` 構造へ反映します。

Spec Editorは利用者が要求していない外部観測可能な挙動を追加してはいけません。

実装に不可欠な製品判断が複数存在する場合は、勝手に決めずOpen Questionとして扱ってください。

Spec Editor実行後は必ずdeterministic validationを行ってください。

---

## Planner

Codex CLIを使用して構いません。

PROJECT.mdのACをmilestoneへ分割します。

Planner outputはstructured JSONとし、schema validationしてください。

自然言語だけをsystem stateとして使わないでください。

---

## Implementation Agent

Codex CLIを使用します。

Implementation Agentは現在milestoneだけを実装します。

Implementation Agentには、

- relevant PROJECT.md projection
- current milestone
- relevant source files
- previous review feedback if any
- code-quality policy

だけを可能な限り小さく渡してください。

Implementation Agentは以下を変更してはいけません。

- `PROJECT.md`
- `.harness/`
- Harness state
- Git history

Agent実行後にGit diffを検査し、禁止pathを変更していたらfailureにしてください。

Implementation Agent自身にはcommitさせないでください。

Implementation Agent自身にはMinecraft clientを起動させないでください。

`runClient`やMC Pilot runtime startはHarnessだけが制御してください。

---

## Review Agent

Claude Code / Claude Opusを使用する想定です。

Review Agentはread-only reviewerです。

Review Agentへsource変更を許可しないでください。

CLIのpermission modeだけに依存せず、review前後のGit状態をHarness側でも比較し、変更が発生した場合はfailureにしてください。

Review対象は、

### Correctness

- target AC compliance
- NeoForge API usage
- lifecycle correctness
- client/server separation
- registration
- serialization
- networking
- synchronization
- thread/context correctness

### Code quality

- unnecessary abstraction
- unnecessary interface
- unnecessary abstract class
- unnecessary wrapper
- unnecessary private helper
- unnecessary temporary/local variable
- unnecessary null checks
- unnecessary broad exception handling
- unnecessary fallback
- speculative configuration
- speculative extension points
- premature generalization
- duplicate concepts
- unclear names
- unnecessarily indirect control flow
- comments that only restate code

です。

Review Agentに次の原則を明示してください。

> Do not recommend abstractions for hypothetical future requirements.

追加の抽象化は、

- current requirement
- existing real duplication
- real API/lifecycle boundary
- concrete correctness problem
- concrete testability problem

のいずれかで正当化されなければなりません。

Review outputもstructured JSONとし、schema validationしてください。

例えば、

```json
{
  "verdict": "changes_required",
  "issues": [
    {
      "severity": "blocking",
      "category": "unnecessary_abstraction",
      "file": "src/...",
      "lines": "10-40",
      "reason": "...",
      "requiredChange": "..."
    }
  ]
}
```

のような形式です。

Review Agentの長い会話履歴をImplementation Agentへ渡さず、structured review resultだけを渡してください。

---

# Code-quality philosophy

このHarness自身の実装にも同じ基準を適用してください。

「コード行数を最小にする」ことは目的ではありません。

**同じ責務を満たすなら、概念数、間接参照、状態数が少ない実装を優先してください。**

次を避けてください。

- 1 implementationしかないinterface
- 現在不要なabstract base class
- factory of factory
- provider registry
- dependency injection container
- generic plugin architecture
- event bus
- speculative extension mechanism
- unnecessary repository/service/controller layering
- trivial wrapper
- one-line private method proliferation
- metricを満たすためだけのmethod分割
- 将来必要かもしれないという理由だけのconfig option
- legacy compatibility layer
- migration framework
- fallback chain

必要な境界だけを作ってください。

特に、

```text
Git
Gradle
Codex
Claude
MC Pilot
```

へのsubprocess境界は分離して構いません。

---

# Technology

以下をdefaultにしてください。

- Node.js >= 20
- TypeScript
- ESM
- npm
- Node built-in test runner `node:test`
- Node built-in `util.parseArgs`
- Node built-in `child_process`
- Markdown AST parserとして必要最小限の依存を使用

CLI framework、DI framework、workflow frameworkは導入しないでください。

Markdown構造を正規表現だけで無理に解析せず、AST parserを使用してください。

runtime dependencyは必要最小限にしてください。

TypeScriptはstrict modeにしてください。

---

# Repository architecture

概ね以下の責務構造にしてください。

厳密にこのdirectory名へ従う必要はありませんが、不要な層を増やさないでください。

```text
/
├── src/
│   ├── cli/
│   ├── project/
│   ├── spec/
│   │   ├── parser
│   │   ├── validator
│   │   ├── projector
│   │   └── diff
│   ├── planning/
│   ├── agents/
│   │   ├── codex
│   │   └── claude
│   ├── review/
│   ├── verification/
│   │   ├── static
│   │   ├── unit
│   │   ├── build
│   │   ├── gametest
│   │   ├── e2e
│   │   ├── visual
│   │   ├── persistence
│   │   └── multiplayer
│   ├── runtime/
│   │   └── mc-pilot
│   ├── git/
│   └── state/
│
├── schemas/
├── prompts/
├── docs/
├── test/
├── package.json
├── tsconfig.json
└── README.md
```

Harness repository内にNeoForge MDK、Minecraft Mod sample project、固定NeoForge project templateを含めないでください。

---

# Project layout after installation

Harnessを導入されたprojectは概ね以下です。

```text
my-mod/
├── .git/
├── .gitmodules
├── .harness/
├── .harness-config.json
├── .harness-state/
├── PROJECT.md
├── tests/
│   └── e2e/
├── src/
├── gradle/
├── build.gradle
├── gradle.properties
├── settings.gradle
└── ...
```

`.harness-state/` はgenerated runtime stateでありgitignore対象です。

製品仕様を `.harness-state/` に保存してはいけません。

---

# Project-local config

`.harness-config.json` はHarness integrationだけを保持してください。

製品仕様を入れてはいけません。

例えば、

```json
{
  "gradle": {
    "build": "build",
    "test": "test",
    "gameTest": "runGameTestServer",
    "client": "runClient"
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
    "provider": "mc-pilot",
    "command": "mct"
  }
}
```

モデル名のように変化し得る値をsourceへhard-codeしないでください。

modelがnullならCLI/account defaultを使用してください。

---

# Explicit configuration policy

project capabilityの判定順序は、

```text
explicit config
↓
single unambiguous detection
↓
error
```

としてください。

多数のtask名、古いlayout、legacy configなどを総当たりしないでください。

判定不能なら明確なerrorを出してください。

---

# CLI

最低限、以下を実装してください。

```text
harness create
harness init
harness doctor
harness validate
harness status
harness chat
harness plan
harness develop
harness regression
```

package binaryとして利用できるようにしてください。

## create

概念上、

```text
clone specified NeoForge repository/ref
↓
materialize project files
↓
create independent Git repository
↓
add this Harness as .harness submodule
↓
init
```

です。

想定interface:

```sh
harness create ./my-mod \
  --template-repo <repo> \
  --template-ref <revision>
```

Harness repository自身のremote originからsubmodule URLを一意に取得できない場合だけ、明示的な `--harness-repo` を要求して構いません。

推測fallbackは行わないでください。

NeoForge template側の `.git` historyをそのままproject repositoryとして利用せず、独立したGit repositoryへmaterializeしてください。

---

## init

既存NeoForge projectへHarness contractを導入します。

最低限、

- Git repository確認
- `.harness` submodule確認
- Gradle wrapper確認
- NeoForge project capability確認
- mod metadata確認
- `PROJECT.md`確認
- PROJECT.mdがなければ詳細template生成
- `.harness-config.json`生成
- `.harness-state/` gitignore設定

を行ってください。

既存 `PROJECT.md` や既存configを無条件に上書きしてはいけません。

---

## doctor

外部runtimeを診断してください。

最低限、

- node
- git
- java
- Gradle wrapper
- codex CLI
- claude CLI
- mct / MC Pilot

を確認してください。

external CLIが存在しない場合、Harness自体のinstallを壊さず、

```text
available
unavailable
misconfigured
```

を明確に表示してください。

---

## validate

最低限、

- Project Contract
- PROJECT.md structure
- duplicate IDs
- invalid IDs
- unknown verification type
- missing AC required fields
- projection consistency
- config schema
- state schema

を検証してください。

推測修復しないでください。

---

## status

人間が現在状態を短く把握できる出力にしてください。

例えば、

- project revision
- spec hash
- current phase
- active milestone
- verified AC count
- pending AC count
- blocked AC count
- last checkpoint
- working tree status

です。

---

## chat

Product Changeの入口です。

概念的に、

```text
User Request
↓
Spec Editor
↓
PROJECT.md modification
↓
validate
↓
projection regenerate
↓
changed AC detection
↓
local spec revision commit
↓
replan
```

としてください。

Spec Editor自身にはcommitさせず、validation後にHarnessがcommitしてください。

ユーザー要求から導けない製品挙動を追加してはいけません。

---

## plan

PROJECT.mdのactive ACをmilestoneへ分解します。

structured Execution Planを生成し、schema validationしてください。

全active ACが以下のどれかになることを確認してください。

- planned
- already verified
- blocked
- explicitly excluded from requested scope

理由なく未割当ACを残さないでください。

---

## develop

通常の開発入口です。

概念的に、

```text
validate
↓
plan if required
↓
milestone loop
↓
final regression
```

です。

---

## regression

現在の `PROJECT.md` 全体を対象に必要verificationを再実行します。

最終complete判定はregression成功後だけにしてください。

---

# Git policy

Git操作は極めて保守的にしてください。

禁止:

```text
git reset --hard
git clean -fd
git push
git push --force
automatic destructive checkout
automatic stash of user work
```

remote操作は禁止です。

Harness workflow開始時に未コミットの利用者変更が存在する場合、原則としてfail-fastしてください。

自動的に破棄、stash、commitしないでください。

milestoneがfailureした場合、失敗したworking treeとevidenceを残してください。

---

# Milestone checkpoint

各milestoneは、

```text
implementation complete
+
required review successful
+
build successful
+
all required verification successful
```

の場合だけHarnessがlocal commitしてください。

Agent自身にはcommitさせないでください。

commit messageにはmachine-readable trailerを入れてください。

例えば、

```text
harness: complete M02

Harness-Milestone: M02
Harness-Spec-Hash: sha256:...
Harness-AC: AC-F002-003, AC-F002-004
Harness-Verification-Run: <run-id>
```

Git commitはverified checkpointです。

単なる「Agent作業終了」をcheckpointにしてはいけません。

---

# Spec revision commit

Product Changeによって `PROJECT.md` を更新した場合は、validation成功後にmilestoneとは別のspec revision commitを作ってください。

例えば、

```text
harness(spec): define Copper Press behavior
```

です。

これにより、

```text
PROJECT v1
  M01
  M02

PROJECT v2
  M03
```

という履歴をGit上で明確にしてください。

---

# State and artifacts

generated stateは `.harness-state/` 以下へ保存してください。

概ね、

```text
.harness-state/
├── state.json
├── spec/
│   ├── index.json
│   └── projections/
├── plans/
├── reviews/
├── runs/
└── evidence/
```

です。

generated artifactを削除しても製品仕様を失わない構造にしてください。

少なくともspec projectionは、

```text
PROJECT.md + current Harness version
```

から再生成できなければなりません。

---

# Spec hash and invalidation

`PROJECT.md`変更前後をdeterministicに比較してください。

少なくとも、

- unchanged AC
- changed AC
- added AC
- removed AC

を取得してください。

changed ACはverified stateを自動継承してはいけません。

Constraintやcross-cutting requirementの変更などimpactが広い場合は、過度に賢い意味推論を作らず、安全側に再検証してください。

過去のverified milestone commitを書き換えてはいけません。

修正が必要なら新しいmilestoneを作ってください。

---

# Verification architecture

可能な限りdeterministic verificationをAI判断より優先してください。

AI reviewerはdeterministic failureを上書きできません。

Verification順序は原則、

```text
Static
↓
Unit
↓
Code Review
↓
Build
↓
GameTest
↓
E2E
↓
Visual / Persistence / Multiplayer
```

です。

Minecraft runtimeを最も高コストなverificationとして最後まで遅延してください。

---

# Static/resource validation

Minecraftを起動する前に可能な範囲を検査してください。

少なくとも拡張可能な責務として、

- JSON syntax
- known resource reference consistency
- generated resource existence where deterministic
- duplicate identifiers
- obvious invalid asset paths

を扱える設計にしてください。

ただしMinecraft resource systemの完全な再実装はしないでください。

Harness自身がMinecraft parserになる必要はありません。

---

# GameTest

GameTestが利用できるprojectでは、client不要なMinecraft logicの検証に使用してください。

Gradle taskはproject configまたはunambiguous detectionから取得してください。

Minecraft GUIを起動する前にGameTestを完了させてください。

---

# E2E convention

Harness repositoryに特定ModのE2Eを含めてはいけません。

project側に、

```text
tests/e2e/
```

というconventionを定義してください。

過剰な独自DSLは作らないでください。

例えば、

```text
tests/e2e/manifest.json
tests/e2e/scenarios/*.mjs
```

程度で構いません。

manifestは、

- scenario id
- covered AC IDs
- verification types
- command

を宣言できるようにしてください。

Harnessはscenario commandを実行し、machine-readable resultを回収してください。

---

# MC Pilot

Minecraft runtime automationはMC Pilotを使用する前提です。

MC Pilot専用処理は一つの薄いadapterへ閉じ込めてください。

Harness内部の他の部分が `mct` CLIの細部へ依存しないようにしてください。

もし実装環境に `mct` が存在する場合は、まず実際の `mct --help` / relevant subcommand helpを確認して現在のCLI contractに合わせてください。

存在しない場合、

- コマンドを推測して「動作確認済み」としない
- process runnerを注入可能な小さな境界として実装
- fake executableを使ったHarness unit/integration testを作る
- `doctor`ではMC Pilot unavailableと正しく報告する

ようにしてください。

MC Pilotそのものをvendorしないでください。

---

# Minecraft runtime budget

Implementation Agentが自由にclientを起動できないようにしてください。

runtime起動はHarnessが必要verificationから判断します。

Milestone planning時にもMinecraft起動コストを考慮してください。

通常milestoneについて、

- staticだけならruntimeなし
- unitだけならruntimeなし
- gametestだけならclient runtimeなし
- e2e/visualならruntimeあり
- persistenceなら必要なprocess restartを許可
- multiplayerなら必要なserver/multi-client構成を許可

という原則です。

「少し変更 → client起動 → screenshot → 少し変更」を標準workflowにしないでください。

---

# Visual verification

Visual verificationは画像でしか十分判断できないACだけに使用してください。

画像で判定してはいけない例:

- client processが生きている
- GUIがopen状態である
- inventory count
- block state
- server connection
- entity state

これらはmachine-readable assertionで確認してください。

画像で判定する例:

- missing texture
- broken model
- UV error
- texture orientation
- clipping
- overlap
- text overflow
- unintended transparency
- z-fighting
- malformed GUI layout
- visual mismatch against explicit AC

Visual review前にmachine-readable preconditionを成功させてください。

Claudeへ渡す入力は最小化してください。

例えば、

```text
AC text
+
machine observations
+
relevant screenshot
```

だけです。

PROJECT.md全文、repository全文、巨大なlatest.log全文を毎回渡さないでください。

---

# Evidence

EvidenceはrunとACに紐付けてください。

例:

```text
.harness-state/evidence/<run-id>/
├── manifest.json
├── AC-F001-001/
│   └── result.json
├── AC-F002-003/
│   ├── result.json
│   └── screenshot.png
└── runtime.log
```

最低限、

- AC ID
- spec hash
- milestone
- verification type
- result
- relevant artifact paths

を追跡してください。

失敗evidenceを失敗を隠す目的で削除しないでください。

---

# Persistence verification

`persistence` verificationは同一process内のstate確認だけで成功にしないでください。

必要な場合、

```text
state setup
↓
save
↓
process stop
↓
process restart
↓
world reload
↓
state assertion
```

を要求してください。

---

# Multiplayer verification

`multiplayer` verificationは単一clientからの見かけだけで成功にしないでください。

必要な場合、

```text
Client A action
↓
Server state
↓
Client B observation
```

を検証できるE2E contractを用意してください。

---

# Full regression

全milestone完了後、必ず現在のPROJECT全体についてregressionを実行してください。

regressionでは可能な範囲で、

```text
compile
all unit
build
all GameTests
runtime start
all relevant E2E
visual
persistence
multiplayer
log scan
```

を効率的にbatchしてください。

Milestone中に別milestoneの未実装作業を先取りする必要はありません。

Final regressionだけは全PROJECTを対象として構いません。

regression failure時に過去checkpointを改変してはいけません。

必要なfixを新しいcorrective milestoneとして扱ってください。

---

# Fail-fast policy

明確な前提違反を自動修復しないでください。

例:

- invalid PROJECT.md
- duplicate ID
- unknown verification type
- missing Gradle wrapper
- missing required task
- ambiguous task detection
- invalid state schema
- dirty working tree where clean tree is required
- reviewer modified files
- Implementation Agent modified PROJECT.md
- unsupported Harness contract

は明確な理由を出して停止してください。

以下は作らないでください。

- corrupted JSON guessing repair
- legacy schema migration
- old config alias
- unknown Gradle task fallback chain
- old project layout exhaustive search
- broken checkpoint guessing recovery

---

# Version policy

Harnessはcurrent/latest contractだけを正式サポートします。

後方互換性frameworkは作らないでください。

- legacy CLI aliases不要
- old state reader不要
- old schema migration不要
- legacy PROJECT parser不要
- compatibility adapter不要

Git上で古いHarness revisionをcheckoutできることと、最新Harnessが古いstateを読めることは別です。

projectは `.harness` submodule pointerによって利用Harness revisionを固定します。

---

# Harness self-tests

Minecraft、Codex、Claude、MC Pilotの実環境がなくてもHarnessの大部分を検証できるようにしてください。

最低限、次をtestしてください。

## Spec

- valid PROJECT.md parse
- invalid structure
- duplicate Feature ID
- duplicate Requirement ID
- duplicate AC ID
- unknown verification type
- projection determinism
- projection tamper detection
- spec diff
- changed AC invalidation

## Project

- init does not overwrite existing PROJECT.md
- init generates PROJECT.md when absent
- config creation
- gitignore handling
- Project Contract failure

## Planning

- every milestone references existing AC
- unknown AC rejected
- unassigned active AC rejected
- blocked AC handling
- structured plan schema validation

## Agents

fake `codex` executableとfake `claude` executableをPATHへ置く方式などで、

- subprocess execution
- structured output parsing
- invalid output
- nonzero exit
- Implementation Agent changing PROJECT.md detection
- Review Agent modifying files detection

をtestしてください。

## Git

temporary Git repositoryを使用して、

- dirty tree protection
- no destructive operation
- verified checkpoint commit
- commit trailers
- no commit on failed verification

をtestしてください。

## Verification

fake Gradle / fake scenario commandsを使って、

- gate order
- build failure stops runtime
- GameTest failure stops runtime
- e2e result collection
- evidence generation
- final regression state

をtestしてください。

外部CLIがないことを理由にHarnessのcore testsをskipしないでください。

---

# CI

GitHub Actionsを用意してください。

最低限、

```text
npm ci
typecheck
test
build
```

を実行してください。

実Minecraft、Codex、Claude、MC PilotをCI必須にはしないでください。

---

# Documentation

最低限以下を作成してください。

```text
README.md
docs/architecture.md
docs/project-specification.md
docs/code-quality.md
docs/review-policy.md
docs/verification.md
docs/runtime.md
```

## README

次を説明してください。

- Harnessとは何か
- 何を正本とするか
- create
- init
- PROJECT.md
- plan
- develop
- regression
- checkpoint model
- external dependencies
- current limitations

## project-specification.md

Mod作者向けにPROJECT.mdの書き方を説明してください。

特に、

- Feature
- Requirement
- AC
- Preconditions
- Action
- Expected Result
- Verification
- Non-goals
- Open Questions

の書き方を具体例付きで説明してください。

実装方法ではなく観測可能な挙動を書くことを明記してください。

## code-quality.md

Implementation Agent向けに、

- current requirements only
- no speculative abstraction
- direct NeoForge API preferred
- readability over cleverness
- minimal conceptual complexity
- no unnecessary defensive code

を明記してください。

## review-policy.md

Claude reviewer向け基準を明記してください。

---

# Harness Acceptance Criteria

少なくとも以下を満たしてください。

HAR-AC-001  
`PROJECT.md` にFeature、Requirement、ACを直接記述できる。

HAR-AC-002  
Harnessは `PROJECT.md` に存在しない製品ACを自動生成しない。

HAR-AC-003  
派生仕様は `PROJECT.md` の内容だけから決定的に再生成できる。

HAR-AC-004  
派生仕様への直接変更を `validate` が検出する。

HAR-AC-005  
Agent Chatの機能追加要求が最初に `PROJECT.md` へ反映される。

HAR-AC-006  
`PROJECT.md` 更新後に派生仕様が更新される。

HAR-AC-007  
実装計画のすべてのmilestoneが `PROJECT.md` のACに対応する。

HAR-AC-008  
一つのmilestone成功ごとにlocal commitが作成される。

HAR-AC-009  
未検証milestoneはcommit済みcheckpointとして扱わない。

HAR-AC-010  
全milestone後に `PROJECT.md` 全体のregressionが実行される。

HAR-AC-011  
新規projectは指定されたNeoForge repository/refを基礎として作成される。

HAR-AC-012  
Harness repositoryはNeoForge templateを内包しない。

HAR-AC-013  
新規projectにはHarnessが `.harness` submoduleとして追加される。

HAR-AC-014  
既存NeoForge projectにHarness submoduleとinitを適用すると、新規作成projectと同一Project Contractになる。

HAR-AC-015  
runtimeはprojectの生成経路を判定材料にしない。

HAR-AC-016  
最新Harnessは旧artifact/state formatの互換性を保証しない。

HAR-AC-017  
unsupported stateは推測修復せずfail-fastする。

HAR-AC-018  
Harnessはremote Git操作を行わない。

HAR-AC-019  
Implementation Agentは `PROJECT.md` を変更しない。

HAR-AC-020  
Product仕様変更はUser Requestから `PROJECT.md` 更新を経由する。

HAR-AC-021  
`PROJECT.md`変更で過去の検証済みmilestone commitを書き換えない。

HAR-AC-022  
最終状態では `PROJECT.md` のすべての有効ACにverification evidenceが存在する。

---

# Important implementation strategy

まずrepositoryを調査してください。

既存実装が存在する場合、

- 有用な部分を維持する
- このcontractと矛盾する旧設計だけを削除または置換する
- 互換性のためだけに旧設計を残さない

ようにしてください。

その後、内部で実装順序を決め、最後まで実行してください。

推奨する実装順序は、

```text
1. project/config/types
2. PROJECT parser + validator
3. deterministic projection
4. state model
5. Git safety/checkpoint
6. planner schema
7. Codex adapter
8. Claude reviewer
9. Gradle verification
10. milestone state machine
11. E2E/evidence
12. MC Pilot boundary
13. regression
14. create/init
15. CLI polish
16. docs
17. tests/CI
18. self-review
```

ですが、既存repository状態を見て合理的に変更して構いません。

---

# External CLI handling

Codex、Claude、MC PilotのCLI optionは変化し得ます。

実装環境にCLIがインストールされている場合は、実際に

```text
<command> --help
```

等を確認して現在のcontractに合わせてください。

存在しない場合は、推測したoptionを「検証済み」と扱わないでください。

CLI-specific argument constructionを一箇所へ閉じ込め、fake executableでtestしてください。

---

# Do not fake completeness

外部Minecraft runtimeやCLIが利用できないため実E2Eを実行できなかった場合、

「実装済み」と「実環境で検証済み」を区別してください。

unit/integration testで境界を検証することは構いませんが、実Minecraftで確認していないものを確認済みと報告してはいけません。

READMEのCurrent Limitationsにも正確に記述してください。

---

# Final self-review

実装終了前に必ず自分のdiffをレビューしてください。

特に以下を探してください。

- unnecessary abstraction
- unnecessary interfaces
- wrapper proliferation
- duplicated concepts
- dead code
- speculative config
- unused extension points
- broad catch
- silent fallback
- destructive Git behavior
- source-of-truth violations
- PROJECT.mdをAI生成物から復元しようとする設計
- stateがconversation historyに依存する設計
- reviewerがsourceを書き換えられる経路
- agentがcommitできる経路
- Minecraft起動がImplementation Agentへ露出している経路

見つけた場合は修正してください。

---

# Completion criteria for this task

このrepositoryのone-shot実装は最低限、

```text
npm install
npm run typecheck
npm test
npm run build
```

が成功し、

主要CLIが `--help` まで動作し、

READMEと設計文書が現在の実装と一致し、

HAR-AC-001〜HAR-AC-022について、

- implemented
- partially implemented
- blocked by unavailable external runtime

のいずれかを正確に自己評価できる状態で完了とします。

可能なHAR-ACはすべて実装してください。

単なるscaffold、TODO一覧、interfaceだけを作って完了してはいけません。

未完部分がある場合も、core architectureとテスト可能な境界まで実装し、何が不足しているかを具体的に記録してください。

最終的に、一時環境でNeoForge Projectをinitし、このHarnessでexamplemodがE2Eテストできることまで確認してください。

---

# Final response

作業終了後の回答は簡潔にしてください。

次だけ報告してください。

1. 実装した主要機能
2. 主要な設計判断
3. 実行したtest/buildと結果
4. 実環境で未検証のexternal integration
5. 残っているblocking issueがあればその内容

実装内容の長い再説明は不要です。

計画を提示して終了せず、今このrepositoryへ実装してください。