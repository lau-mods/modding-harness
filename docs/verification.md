# Verification contract

milestone 検証は Static → Unit → Claude review → Build → GameTest → E2E (必要な Visual/Persistence/Multiplayer を含む) の順です。compile/unit/build task は常に実行し、GameTest と client runtime は対象 AC の Verification から判断します。build/GameTest failure 後に client を起動しません。全 active AC の検証済み checkpoint が揃い、working tree が clean なら complete です。過去 checkpoint を改変して修復しません。

初回計画で作業を milestone に分割し、いずれかの milestone の実装を開始した時点で、その計画を固定します。以後は milestone の再分割・統合・追加・削除・実行順序・依存関係・対象 AC の変更を含め、計画の変更を禁止します。実装の難しさや検証の失敗を理由に再計画せず、当初の milestone ごとに全 AC の実装を揃えて検証・checkpoint します。一部だけを先行して実装・検証し、残りを後回しにしてはいけません。

次の milestone の実装は現在の milestone の checkpoint 成功後に開始します。Harness の外側から操作する Agent も、失敗後の直接実装・commit・plan/state の削除や書換えでこの順序を回避してはいけません。実装途中の `plan`、仕様変更による再計画、Harness 外の commit による計画破棄は拒否し、元の計画を保持します。

commit は milestone の全検証が成功した checkpoint 作成時だけ許可します。例外は初期セットアップと、ユーザー指示に起因する PROJECT.md の仕様変更 commit のみです。作業中断・検証失敗時の途中経過は、git add・commit・stash・破棄をせず、変更した作業ツリーと evidence をそのまま保持します。途中経過を例外の commit に混ぜてはいけません。外側の Agent にも同じルールを適用します。

Harness 動作中（失敗対応・再試行中を含む）の `.harness` submodule への変更は一切禁止します。外側の Agent にも適用し、source・設定・prompt・依存関係・生成物の変更、install・build、submodule の Git 操作・参照先変更を含みます。検証失敗の回避を目的とした変更も禁止です。

## Unit / GameTest

`.harness-config.json` の gradle task を実行し、存在を tasks --all で確認します。単一の conventional task のみを自動検出します。AC が要求する unit/GameTest は、導入先の `tests/verification.json` に新鮮な JUnit XML testcase を対応付けてください。

```json
{
  "contract": 1,
  "tests": [
    {"acId":"AC-F001-001", "type":"unit", "report":"build/test-results/test/TEST-example.PressTest.xml", "classname":"example.PressTest", "name":"oneInputProducesOneOutput"}
  ]
}
```

type は unit/gametest。report は build/ 内の XML、classname/name は testcase の正確な属性です。run 前に宣言済み生成 report を削除し、task に --rerun-tasks を指定するため、過去結果では通りません。testcase が存在しない、重複、skipped、failure、error は失敗です。GameTest の XML 出力先と testcase 名はプロジェクト自身の Gradle/test 設定で確定してください。

compile/build gate は Gradle の通常の up-to-date 判定を使います。unit/GameTest gate の `--rerun-tasks` は、その task と依存 task の graph を再実行します。結果の鮮度を確保するための再 compile は発生しますが、後続の build gate は成功済みテストを強制再実行しません。

## E2E

E2E シナリオの検証対象は、この Mod が追加・変更した処理のみです。継承してそのまま利用する標準動作など、Minecraft / NeoForge / その他依存Mod側で担保されている処理は再検証しません。

Mod 固有の scenario は導入先に置きます。`tests/e2e/manifest.json` と普通の実行可能コマンドを使い、DSL は導入しません。

```json
{
  "contract": 1,
  "scenarios": [
    {"id":"press", "acIds":["AC-F001-001"], "verification":["e2e"], "command":["node","tests/e2e/scenarios/press.mjs"]}
  ]
}
```

Harness は shell を介さず argv を実行します。scenario は `HARNESS_RESULT_PATH` に JSON を書きます。`HARNESS_RUN_ID`、`HARNESS_SCENARIO_ID`、`HARNESS_STAGE`、`HARNESS_RUNTIME_GENERATION`、`HARNESS_AC_IDS`、`HARNESS_EVIDENCE_DIR`、`HARNESS_CLIENTS`、`HARNESS_MCT_COMMAND`、MC Pilot の専用環境変数が渡されます。scenario は runtime lifecycle を管理せず、起動済み client を観測・操作します。

```js
import { writeFile } from 'node:fs/promises';
// 実際の MC Pilot machine-readable observation に対する assertion を行う。
await writeFile(process.env.HARNESS_RESULT_PATH, JSON.stringify({
  contract: 1,
  scenarioId: process.env.HARNESS_SCENARIO_ID,
  runId: process.env.HARNESS_RUN_ID,
  stage: process.env.HARNESS_STAGE,
  passed: observedCount === 1,
  assertions: [{ name: 'output count', passed: observedCount === 1, observed: String(observedCount) }],
  screenshots: [], persistence: null, multiplayer: null
}));
```

`observedCount` は例示上の変数で、実 scenario が API の結果から取得します。固定値で成功を返さないでください。正式 schema は `schemas/scenario-result.schema.json`。exit 0 と passed=true に加えて、少なくとも一つの成功 assertion と run/scenario/stage identity の一致が必要です。

visual は milestone 検証で machine assertion 成功後にのみ画像レビューします。screenshots は `[{"acId":"AC-F001-001","path":"capture.png"}]` のように evidence directory 内の PNG を示します。画像を読む reviewer には対象 AC、observations、初回の画像レビュー結果を渡します。

persistence を宣言した scenario は、HARNESS_STAGE=setup で setup/save し、`persistence:{worldId:"stable-world-id",saved:true,reloaded:false}` を返します。Harness が全 client/server を停止・再起動した後、stage=assert で同じ world を reload し、state assertion と `reloaded:true` を返します。同一 process 内だけの確認は通りません。

multiplayer では `multiplayer:{actorClient:"client-a",observerClient:"client-b",serverAssertion:{name:"server state",passed:true,observed:"..."},observerAssertion:{name:"remote state",passed:true,observed:"..."}}` を返します。actor/observer は設定済みの異なる client、server と observer の assertion は成功必須です。見かけだけの単一 client 判定は通りません。

## Evidence and failure

`.harness-state/evidence/<run-id>/manifest.json`、AC ごとの result.json、コピーされた JUnit XML と PNG、process output、MC Pilot call、runtime log が保存されます。すべての required AC/type pair が成功し、review/build 等の共通 invariant を満たした場合だけ checkpoint できます。失敗 evidence を削除して合格へ見せかける処理はありません。

E2E は `ScenarioError` の場合だけ修正へ戻し、それ以外は E2E だけを同一実行内で一度再試行します。再試行の証跡は同じ run の `e2e-retry/`、各試行の失敗理由は `e2e-failure.json` に残します。再試行も失敗した場合は、既存の検証済み AC を修正対象に戻さず停止します。停止後の部分 resume は行いません。

runtime logs も、この Mod が追加・変更した処理のみを検査対象にします。スタックトレースを含むログ単位で、PROJECT.md の Mod ID または src/main の Java/Kotlin クラス名（完全名・NeoForge の省略名）を含む ERROR/FATAL レベル、Exception、OutOfMemoryError、missing texture/model、load failure を停止理由にします。Minecraft/NeoForge/依存 Mod のログや発生元不明のログで、対象 Mod の識別子を含まないものは `log-scan.json` の `excluded` に保存し、不合格の理由にしません。これは識別子に基づく判定であり、独自 logger 名など識別子のないエラーは対象外になります。起動・接続・シナリオ・正常終了の失敗は引き続き停止理由です。AI reviewer に判定の免除権限は与えません。resource validator は JSON syntax、重複パス、不正 asset path、既知ローカル model/texture reference を検査します。外部 namespace や Minecraft resource loader の意味論までは検証しません。
