# Modding Harness

NeoForge プロジェクトへ `.harness` Git submodule として導入する、仕様・実装・検証・local checkpoint の開発基盤です。Minecraft Mod テンプレートは内包しません。**AC などの詳細も含む製品仕様の唯一の正本は、導入先の `PROJECT.md` です。** 矛盾しない要件・AC の補足は先に正本へ記録し、そこから派生仕様を決定的に再生成します。

Node.js 20 以上、npm、Git、プロジェクトに適合する Java と Gradle wrapper を使用します。実装／計画／仕様編集には Codex CLI、独立レビューと画像レビューには Claude Code、実 client 操作には MC Pilot を使用します。モデルは integration config の `model: null` で CLI/account default、明示設定で変更できます。

```sh
git clone https://github.com/lau-mods/modding-harness.git
cd modding-harness
npm ci
npm run build
npm link
harness --help
```

package binary は `harness` です。npm package をインストールして使うか、submodule では `node .harness/dist/cli/main.js` を使います。submodule 自体を install する際は `npm --prefix .harness ci && npm --prefix .harness run build` を実行してください。

## 新規プロジェクト

```sh
harness create ./<project-name> --template-repo <project-name>
cd my-mod
```

取得元の default branch の HEAD を使用します。revision を指定する場合は `--template-ref <commit-or-ref>` を追加してください。新しい独立 Git repository に materialize し、この Harness を `.harness` submodule として導入します。テンプレートの Git 履歴は継承しません。create だけは template と Harness を取得する clone/submodule add を行います。通常 workflow は remote Git 操作を一切行いません。push、reset、clean、stash、履歴書き換えは実装していません。

## 既存プロジェクト

```sh
git submodule add https://github.com/lau-mods/modding-harness.git .harness
npm --prefix .harness ci
npm --prefix .harness run build
node .harness/dist/cli/main.js init
node .harness/dist/cli/main.js doctor
```

init は Git/submodule、wrapper、NeoForge plugin、mod metadata を検査します。既存の `PROJECT.md` と `.harness-config.json` は上書きしません。未作成なら [templates/PROJECT.md](templates/PROJECT.md) と integration config を使用し、`.harness-state/` を gitignore に追加します。曖昧な build file・metadata・task は明示 config が必要です。

`PROJECT.md` を [仕様記述ガイド](docs/project-specification.md) に従って記述し、`Status: active`、Open Questions を `None.` にします。手編集後は明示的に projection を再生成してから bootstrap を自分で commit してください。

```sh
harness validate --refresh-projections
git add PROJECT.md .harness-config.json .gitignore .gitmodules .harness
git commit -m "Define project and install harness"
harness plan
harness develop
harness status
harness regression
```

create で作成した場合は、template 由来のファイルも最初の commit に含めてください。通常 workflow は dirty tree で開始できません。失敗時は変更と evidence を残し、自動破棄・stash・利用者変更の commit はしません。

## 仕様変更と checkpoint

```sh
harness chat "プレイヤーが要求した製品変更をここに記述"
harness chat "既存の加工機に合わせて詳細を補足" --reference src/main/java/example/ExistingPress.java
harness develop
```

chat は Spec Editor → deterministic validation → projection 更新 → AC 差分 → local spec revision commit → replan の順に動作します。未決定事項は draft/Open Questions に残し、開発を blocked にします。手編集も可能ですが、`validate --refresh-projections` と利用者による commit が必要です。通常の `validate` は projection の直接編集をエラーにします。

既存・参考実装や Minecraft/modding の一般的な慣行からほぼ一意に決まる詳細は、明示仕様との整合を保って確認なしに進めます。Spec Editor へ実装を示す場合は `--reference` を必要な project source/test path ごとに指定します。外部 URL の内容は自動取得しないため、必要な抜粋を要求本文へ含めてください。実質的に異なる製品判断が残る場合だけ Open Questions にします。

milestone は既存 AC のみを対象に実装し、Static、Unit、Claude review、Build、GameTest、必要な E2E を通過した候補だけを local commit にします。commit には `Harness-Milestone`、`Harness-Spec-Hash`、`Harness-AC`、`Harness-Verification-Run` trailer が入ります。最後に全 active AC の regression を実行した場合だけ complete です。blocked AC がある状態は complete になりません。

plan は全 active AC を網羅します。変更された AC、feature 要件が変わった AC、cross-cutting/constraint 変更の影響を受ける全 AC は検証済み状態を引き継ぎません。過去 checkpoint は残し、新しい milestone を作ります。

この選択的な状態継承は `harness chat` の spec revision に適用します。手編集後の commit を含む Harness 外の commit は、安全側に全 AC の verified 状態を失効させます。古い `PROJECT.md` は ID の出現・削除・廃止のみを調べ、現在の仕様形式で再検証しません。

## 検証と開発

[検証 contract](docs/verification.md)、[runtime 準備](docs/runtime.md)、[アーキテクチャ](docs/architecture.md)、[コード品質](docs/code-quality.md)、[レビュー方針](docs/review-policy.md) を参照してください。

```sh
npm install
npm run typecheck
npm test
npm run build
```

core tests は fake CLI と一時 Git repository を使用し、Minecraft、Codex、Claude、MC Pilot の実環境がなくても省略せず実行します。GitHub Actions は npm ci/typecheck/test/build を実行します。

## Current limitations

- OS support は POSIX (Linux/macOS) です。Windows の Gradle `.bat` 実行／process lifecycle は未対応です。
- 現行 contract 1 のみを受け付けます。旧 artifact migration、旧 layout 探索、破損 JSON の推測修復はありません。
- 補足内容が既存仕様と意味的に矛盾しないことや、推定がほぼ一意であることは機械的には証明できません。根拠と明示仕様を優先する prompt、正本の AC のみを completion condition とする schema、独立レビューで制約します。利用者は spec revision diff を確認してください。
- Agent は隔離された一時 directory、read-only CLI、shell/MCP/plugin 無効化で構造化出力を返します。Harness は前後の Git・source・authoritative generated state を比較し、許可された返却ファイルだけを適用します。これは悪意ある CLI executable やプロジェクト内の Gradle/scenario コードを OS 全体から隔離するセキュリティ境界ではありません。
- AC ごとの unit/GameTest は `tests/verification.json` に JUnit testcase の対応が必要です。GameTest task が XML を出すように、導入先で設定してください。終了コードだけ、NO-SOURCE、skip されたテストでは AC を検証済みにしません。
- runtime は利用者が準備した専用 NeoForge server と MC Pilot client を使用します。Minecraft／MC Pilot／loader の installer を内包せず、EULA を自動承認しません。接続先・build artifact deployment・client logs を明示設定してください。
- runtime の機械観測内容と visual review の品質はプロジェクト側 assertion および reviewer に依存します。resource validation はローカル model/texture 参照等に限定し、Minecraft resource system 全体の再実装はしません。
- コードレビュー不合格には同一実行内で一度だけ修正を試みます。停止後の dirty candidate の自動 resume はありません。evidence を確認して利用者が作業を整理・commit し、再計画してください。その commit を verified checkpoint として扱うことはありません。state を削除した場合も完了を推定せず、再検証が必要です。
- 実環境での実施結果と HAR-AC の自己評価は [実装検証記録](docs/implementation-status.md) を参照してください。fake による成功を実 Minecraft 検証とは表示しません。
