# Independent review policy

Claude は read-only reviewer です。CLI の safe-mode/restricted/Read-only tool list と、Harness の前後 snapshot 比較の両方を使います。source、spec、Harness、state、index/ref を変更したレビューは verdict に関係なく failure です。原文仕様、現在 milestone、diff、必要な source/test を確認します。visual review は対象 AC、成功済み machine observations、対応 PNG のみに限定します。

Correctness は AC compliance、NeoForge API usage、lifecycle、client/server separation、registration、serialization、networking、synchronization、thread/context、テストの不足・偽陽性を評価します。

既存・参考実装や一般的な Minecraft/modding の慣行からほぼ一意に決まる詳細は、明示仕様と整合していれば許容します。記載されていないという理由だけで確認を要求しません。補足 AC が正本へ先に反映されていること、明示仕様との衝突や未解決の製品判断が隠されていないことを確認します。

Code quality は不要な abstraction/interface/abstract class/wrapper/helper/local/null check/catch/fallback/config/extension point、premature generalization、概念重複、不明瞭な名前、間接的 control flow、コードを繰り返すだけのコメントを評価します。

> Do not recommend abstractions for hypothetical future requirements.

追加抽象化は現要求、実重複、実 API/lifecycle 境界、具体的 correctness/testability 問題のいずれかで正当化してください。好みだけの設計変更を blocking にしません。

出力は `schemas/review.schema.json` に従い、`verdict` と `issues` を返します。issue には severity、category、file、lines、reason、requiredChange が必要です。blocking/major がある pass や、理由がない changes_required は不正です。Agent の会話履歴は実装 Agent に渡さず、structured result のみを渡します。

レビュー pass は deterministic gate failure を取り消せません。コードレビューの changes_required は、同一 milestone に一度だけ structured feedback を戻して修正・全 gate の再実行を行います。二度目の不合格、deterministic failure、reviewer mutation は停止し、evidence と候補を残します。feedback は milestone/run ID で関連付け、checkpoint・replan・外部 commit 時に解除します。無制限 repair loop はありません。
