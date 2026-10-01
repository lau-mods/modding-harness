# Implementation and verification record

2026-10-01 (Asia/Tokyo) の実装記録です。core tests の fake runtime と、実 Minecraft の結果を区別します。

## Harness acceptance criteria

| AC | Self-assessment | Implementation / evidence |
| --- | --- | --- |
| HAR-AC-001 | implemented | PROJECT.md に Feature/Requirement/AC を直接記述、AST parsing と stable ID 検査 |
| HAR-AC-002 | implemented | projection は機械抽出のみ。planner/実装は既存 AC のみ。Spec Editor の製品判断は user request に制限する prompt と schema/構造検査で制約。意味的正しさの限界は README に明記 |
| HAR-AC-003 | implemented | PROJECT.md と Harness version から deterministic projection |
| HAR-AC-004 | implemented | projection tamper detection tests |
| HAR-AC-005 | implemented | chat は spec-edit を最初に実行し、実装を直接起動しない |
| HAR-AC-006 | implemented | validation 後に projection materialize、AC invalidation |
| HAR-AC-007 | implemented | plan schema、unknown/unassigned AC rejection、scope と blocked 検査 |
| HAR-AC-008 | implemented | milestone 成功ごとの local commit と machine-readable trailers |
| HAR-AC-009 | implemented | candidate digest、review、build、AC/type evidence を checkpoint 前に検査 |
| HAR-AC-010 | implemented | 全 milestone 後に full regression。failure は corrective milestone に戻す |
| HAR-AC-011 | implemented | 指定 external repository/ref の blobs を新規 Git repository に materialize。実公式 MDK でも create 成功 |
| HAR-AC-012 | implemented | Mod template/MDK をこの repository に含めない。test fixtures は fake executable のための合成データ |
| HAR-AC-013 | implemented | 新規 project の .harness gitlink / .gitmodules / submodule HEAD を検査 |
| HAR-AC-014 | implemented | create の最終処理も同じ init と Project Contract |
| HAR-AC-015 | implemented | runtime は config と PROJECT AC のみを参照し、生成経路を使わない |
| HAR-AC-016 | implemented | current contract 1 の strict schema のみ |
| HAR-AC-017 | implemented | 不正 JSON/state、旧 contract は fail-fast、修復/migration なし |
| HAR-AC-018 | implemented | 通常 workflow の Git allowlist に remote operation なし。明示 create の clone/submodule add は要求仕様上の bootstrap 例外 |
| HAR-AC-019 | implemented | Agent を read-only 隔離、出力ファイル allowlist と前後 snapshot で PROJECT.md 変更を拒否 |
| HAR-AC-020 | implemented | 製品変更は chat → PROJECT validation → local spec commit。手編集も明示 refresh と利用者 commit が必要 |
| HAR-AC-021 | implemented | 過去 checkpoint は保持し、新 ID の milestone。partially invalidated checkpoint の回帰テストあり |
| HAR-AC-022 | implemented | complete は全 active AC の verified checkpoint と現在 spec/revision の regression evidence が必要。artifact 不足も validation error |

ここで implemented は Harness の制御・実装を指します。任意の Mod に対する AI の判断品質、任意の Minecraft/NeoForge/OS の実機対応を保証する分類ではありません。

## Automated checks

`npm install`、`npm ci`、`npm run typecheck`、`npm test`、`npm run build` を実行。core test は最終 58 件成功、skip 0。AST/ID/projection/diff/invalidation、bootstrap/config/gitignore、plan schema、fake Codex/Claude subprocess、read-only guard、Git dirty protection、verification ordering、JUnit mapping、E2E/visual/persistence/multiplayer evidence、checkpoint/regression、spec revision、historical checkpoint の部分失効、旧・不完全な仕様履歴の ID 検査、binary template の保存、large source、CLI help を含みます。

`npm pack` と一時 prefix への npm install で package artifact を確認。MC Pilot 再起動時の空き WebSocket port 割当は loopback bind を使用するため、ネットワーク bind を禁止する sandbox 内での test 実行には許可が必要です。通常 CI は実 Minecraft/AI CLI を要求しません。

## Real environment

公式 repository: `https://github.com/NeoForgeMDKs/MDK-1.21.1-ModDevGradle.git`

指定 template revision: `7819b902a351b03fe71db00754d103b5a31c4ebf`

新規 project: `/private/tmp/new-harness-live-lhoc2B/official-examplemod`

- 実装した `harness create` CLI で独立 Git repository と .harness submodule を作成。
- Minecraft 1.21.1、NeoForge 21.1.252、Gradle wrapper 9.2.1、Java 21 (arm64)。
- library/cache は既存のダウンロードをコピーして再利用し、server/client directory と world は専用の新規コピーを作成。元 project は変更していない。
- stock examplemod に不足する model/blockstate resource を、この一時 project にのみ vanilla texture 参照として追加した。この Harness repository には含めていない。
- 実 Gradle compile/unit task/build、実 Claude code review、実 MC Pilot client 起動と machine observation、実 server/client 停止・再起動、保存状態の assertion、runtime log scan が成功。
- AC: inventory を clear して `examplemod:example_item` を 1 個 give し、再起動の前後とも machine-readable inventory に 1 個存在する。
- 成功 run ID: `26b61627-3346-4bea-a61c-918cc997fec6`。元の manifest と process/review/runtime/assertion evidence は上記 project の `.harness-state/evidence/` と `.harness-state/reviews/` に保存。
- 実 Codex adapter も structured planning を実行し、JSON schema validation が成功。曖昧な試験用仕様を、製品判断を捏造せず blocked として返すことも確認。
- その後、実 `harness develop` が Codex planning/implementation → Claude review → Gradle/runtime verification → local checkpoint → full regression の全経路を完了。phase は `complete`、active AC は 1 verified、working tree は clean。
- checkpoint: `af2e43882b548f6ac65c75b0db1e93345f16eaf1`。milestone run: `38cc3ce5-e417-42b6-a398-9386d50b8b1d`。develop 内 regression: `02885c51-a1ce-4be8-8d22-75ff0f06435a`。
- 最終レビュー修正後にも実 `harness regression` を再実行。run `0e584751-5c65-4b0e-93db-963ce688bbeb` で E2E/persistence と log scan が合格し、再び `complete`。
- 検証にはこの repository の最新 `dist/cli/main.js --project <new-project>` を使用した。.harness の gitlink は実装途中の local snapshot を固定しているため、その旧 submodule binary の検証とは主張しない。
- sample の Gradle unit task は NO-SOURCE。宣言した AC は E2E/persistence のみであり、Mod の unit testcase を実行したとは扱わない。

一時環境が削除されても結果の概要を確認できるよう、state、checkpoint/regression manifest、再起動後 assertion、log scan の記録を [実機検証 JSON](validation/neoforge-1.21.1.json) に保存した。scenario や Mod の source/template はこの repository へコピーしていない。

初回実検証で発見した問題は記録を残して修正した。MC Pilot の client 停止を先にすると server に connection reset が出るため server の正常保存・切断を先行させた。再起動時の WebSocket TIME_WAIT は新しい OS-selected port で回避した。Codex structured output は全 schema value の type 宣言が必要で、uniqueItems は provider schema から除き、Harness 側の Ajv で強制する。

## Review and remaining external scope

Claude Code に Harness 全体の独立 read-only snapshot を渡して自己レビューを実施。初回・二回目の指摘から、未追跡 source のレビュー漏れ、feedback の run/milestone 対応、binary context 計算、過去ログの混入、shared test manifest の context、historical checkpoint の部分失効、regression の過大な AI context、template ref/local URL の解決を修正し、再発テストを追加した。

三回目では過去の不完全な PROJECT.md の扱いを修正し、Git subprocess を統一、手編集 commit の全失効を明記、log artifact の命名と path assertion の名称を改善、build の不要な強制再実行を削除した。修正対象への最終 Claude follow-up は `pass`。残った minor 指摘は `--rerun-tasks` が依存 task も再実行する説明であり、文書を訂正した。各回の structured findings と対応を [自己レビュー記録](validation/claude-self-review.json) に保存。未解決の blocking/major 指摘はない。

実機未検証: visual AC の Claude 画像判定、二 client の multiplayer assertions、実 GameTest testcase/JUnit XML mapping、実 Codex による chat/spec-edit、Linux runtime と Windows (未対応)。これらの Harness 境界は fake executable tests で確認済み。実環境で成功した E2E/persistence と混同しない。
