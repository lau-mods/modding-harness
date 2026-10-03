# Architecture

| モジュール | 責務 |
| --- | --- |
| `src/spec` | Markdown AST、ID、原文 projection、AC fingerprint |
| `src/planning` | AC の割当・依存順序の検査 |
| `src/workflow.ts` | phase 遷移、Agent 呼出し、checkpoint |
| `src/agents` | CLI 引数、構造化出力、変更の適用 |
| `src/git` | local Git 操作、snapshot、ID 履歴 |
| `src/verification` | [検証 contract](verification.md) の実行と証跡検査 |
| `src/runtime` | [MC Pilot と専用サーバー](runtime.md) の lifecycle |
| `src/project` | 外部 template の取得、初期化、設定・環境検査 |

Agent は隔離した一時 directory で read-only CLI を実行し、構造化出力を返します。Harness が許可された変更を適用します。前後の snapshot は source の内容・mode・untracked file、submodule source、Git index/ref/reflog/config、authoritative state を比較します。Gradle/scenario や悪意ある CLI executable を OS 全体から隔離する仕組みではありません。

Git hooks と GPG signing は Harness commit で無効化します。検証前後の candidate fingerprint が一致してから commit します。commit 後の state 書込み失敗を推測で復旧しません。

生成物は `.harness-state/{state.json,spec,plans,reviews,runs,evidence,runtime}` に保存します。projection は PROJECT.md と Harness version から再生成できます。state lock は同時実行を拒否し、異常終了時は実行プロセスを確認して利用者が stale lock を解除します。

仕様変更時は、feature の description/Requirement 変更でその feature の全 AC、cross-cutting/constraint 等の feature 外変更で全 AC を失効させます。変更のない AC は checkpoint を引き継ぎます。実装開始前または完了後の Harness 外 commit では全 AC を失効させます。削除・retire 済み ID は first-parent の PROJECT.md 履歴から検査し、過去の文書全体には現在の構文検証を適用しません。
