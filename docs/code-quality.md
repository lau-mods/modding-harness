# Code quality

同じ責務なら、概念数・間接参照・状態数が少なく、読みやすい名前と直接的な制御 flow を持つ実装を選びます。NeoForge API は直接利用します。

抽象化は現在の要求、実在する重複、API/lifecycle 境界、具体的な correctness/testability の問題で説明できる場合だけ導入します。将来用の interface・factory・provider registry・DI container・plugin architecture は作りません。

未使用コード、旧仕様の互換処理、現実的にほぼ無視できる異常系への対応、不要な wrapper・変数・null check・catch・fallback は削除します。追加行を抑え、不要になった処理を残しません。共通ルールは一つの文書に集約し、他の文書から参照します。

作業範囲は [検証 contract](verification.md)、未指定の製品判断は [仕様記述ガイド](project-specification.md) に従います。
