# Architecture

`PROJECT.md` → Markdown AST → validated specification → deterministic projections → structured plan → milestone gates → local checkpoint → full regression の明示的な状態機械です。会話履歴に依存しません。製品判断を state、plan、config に保存しません。

`src/spec` は mdast-util-from-markdown による heading/section/source range/親子関係の抽出、stable ID と Verification の検査、exact source excerpt の projection、deterministic AC fingerprint を担当します。cross-cutting/constraint 等の feature 外変更は全 AC、feature description/Requirement 変更は feature 全 AC を無効化します。削除・retire 済み ID の再登場は first-parent Git specification history から検査するため、state を消しても再利用できません。

`src/workflow.ts` が phase と gate を所有します。plan の completion は既存 AC IDs と Harness invariant で定義し、自然言語 approach を新しい合格条件として使いません。各 pending AC は milestone、blocked、明示 scope 外の excluded のどれかになります。already verified の省略は Harness state と checkpoint/evidence でのみ認めます。

`src/agents/agents.ts` は Codex/Claude の CLI-specific flags、JSON schema、isolated working directory をまとめた小さな境界です。Spec Editor は全文 Markdown、Implementation は許可された file content 変更を返します。Harness が適用するので、Agent に commit や runtime lifecycle の権限を渡しません。Planner と reviewer は read-only です。レビューには source と現在 diff、実装には relevant feature の原文と必要な source、必要時 structured review のみを渡します。

`src/git` は local Git の allowlist を持ちます。開始時は clean tree を要求し、Agent 前後は内容 hash・mode・untracked file・submodule source・Git index/ref/reflog/config・authoritative state を比較します。Git hooks は Harness commit で無効化し、GPG signing は使いません。verified candidate の fingerprint を gates 前後で比較してから commit します。commit 後に state 書き込みが中断しても、成功を推測して復旧せず停止します。既存 checkpoint は改変しません。

`src/verification` は Static/Unit/Review/Build/GameTest/E2E を順番に実行します。deterministic failure を AI verdict で上書きしません。各 run の結果・process output・JUnit XML・runtime logs・screenshots・review result は `.harness-state` に保存され、AC、spec hash、milestone、run ID に関連付きます。

`src/runtime/mc-pilot.ts` だけが mct の引数・JSON envelope・client launch/wait-ready/stop を知ります。NeoForge server は明示 argv の subprocess で起動し、Minecraft の readiness log を待機、stdin の stop によって終了させます。専用 runtime は `.harness-state/runtime/` に置き、通常 user の client を引き継ぎません。Persistence は実停止・再起動・world identity を検査し、Multiplayer は別 client と server assertions を要求します。

生成物は `.harness-state/{state.json,spec,plans,reviews,runs,evidence,runtime}` です。spec は current PROJECT.md + Harness version から再生成可能です。state/schema 不一致を移行や推測で修復しません。state 削除は製品仕様を失わせませんが、検証状態は失います。state lock は同時実行を拒否し、異常終了時の stale lock は実行プロセスを確認して利用者が手動で解除します。

create は唯一の bootstrap 境界です。明示 repository/ref から regular file blobs を materialize し、独立 Git init、Harness submodule add、init を実施します。通常 workflow の remote 禁止と、create に必要な取得を分離しています。テンプレートの symlink・埋め込み submodule は明示エラーです。
