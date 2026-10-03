# Modding Harness

NeoForge プロジェクトへ `.harness` Git submodule として導入する、仕様・実装・検証・local checkpoint の開発基盤です。Minecraft Mod テンプレートは内包しません。製品仕様は導入先の `PROJECT.md` に記述します。

Node.js 20 以上、npm、Git、プロジェクトに適合する Java と Gradle wrapper を使用します。実装／計画／仕様編集には Codex CLI、独立レビューと画像レビューには Claude Code、実 client 操作には MC Pilot を使用します。モデルは integration config の `model: null` で CLI/account default、明示設定で変更できます。

```sh
git clone https://github.com/lau-mods/modding-harness.git
cd modding-harness
npm ci
npm run build
npm link
harness --help
```

package binary は `harness` です。npm package をインストールして使うか、submodule では `node .harness/dist/cli/main.js` を使います。submodule 自体の install は Harness 起動前の初期準備として `npm --prefix .harness ci && npm --prefix .harness run build` を実行してください。

## 新規プロジェクト

```sh
harness create ./<project-name> --template-repo <project-name>
cd <project-name>
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
```

create で作成した場合は、template 由来のファイルも最初の commit に含めてください。以後の作業順序、計画固定、commit の条件、中断時の扱い、`.harness` の変更禁止は [検証 contract](docs/verification.md) に従います。

## 仕様変更

```sh
harness chat "プレイヤーが要求した製品変更をここに記述"
harness chat "既存の加工機に合わせて詳細を補足" --reference src/main/java/example/ExistingPress.java
harness develop
```

chat は Spec Editor → validation → projection 更新 → AC 差分 → spec commit → plan の順に動作します。手動変更時は `harness validate --refresh-projections` を実行し、仕様変更を commit します。`validate` 単独は projection の不一致を検出します。参考ファイルは `--reference` を繰り返して指定し、外部資料は必要な抜粋を要求本文に含めてください。

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
- 現行 contract 1 のみを受け付けます。
- 補足内容が既存仕様と意味的に矛盾しないことや、推定がほぼ一意であることは機械的には証明できません。根拠と明示仕様を優先する prompt、正本の AC のみを completion condition とする schema、独立レビューで制約します。利用者は spec revision diff を確認してください。
- 実環境での実施結果と HAR-AC の自己評価は [実装検証記録](docs/implementation-status.md) を参照してください。fake による成功を実 Minecraft 検証とは表示しません。
