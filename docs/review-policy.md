# Independent review policy

Claude は [Agent 実行境界](architecture.md) に従う read-only reviewer です。ファイルを変更したレビューは verdict に関係なく failure です。原文仕様、現在 milestone、diff、必要な source/test を確認します。visual review は対象 AC、成功済み machine observations、対応 PNG、初回の画像レビュー結果に限定します。

コードレビューおよび画像レビューは初回に指摘をまとめ、同じ AC 仕様・scenario の milestone 再レビューでは初回指摘と新規 critical のみを扱います。critical はクラッシュ、データ損失、セキュリティ脆弱性、明示された主要動作の不成立や明示 AC の主要表示が欠落・破綻・判読不能となり利用を妨げる欠陥などで、既存 severity の `blocking` に対応します。Harness は初回結果を保持し、参照のない／無効な新規 major/minor を修正要求から除外します。実装修正で初回結果をリセットせず、AC 仕様の変更時は新たな初回とします。元の結果は `result`、適用後の判定は `effectiveReview` に保存し、修正指示・checkpoint 判定は後者を使います。

Correctness は AC compliance、NeoForge API usage、lifecycle、client/server separation、registration、serialization、networking、synchronization、thread/context、テストの不足・偽陽性を評価します。

製品判断は [仕様記述ガイド](project-specification.md)、設計・実装は [コード品質](code-quality.md) に従って評価します。好みだけの設計変更を blocking にしません。

出力は `schemas/review.schema.json` に従い、`verdict` と `issues` を返します。issue には severity、category、file、lines、reason、requiredChange が必要です。blocking/major がある pass や、理由がない changes_required は不正です。Agent の会話履歴は実装 Agent に渡さず、structured result のみを渡します。

レビュー pass は deterministic gate failure を取り消せません。コードレビューの changes_required は、同一 milestone に一度だけ structured feedback を戻して修正・全 gate の再実行を行います。二度目の不合格、deterministic failure、reviewer mutation は停止し、evidence と候補を残します。feedback は milestone/run ID で関連付け、checkpoint・replan・外部 commit 時に解除します。無制限 repair loop はありません。
