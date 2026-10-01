# Code quality

Current requirements only. No speculative abstraction. Direct NeoForge API preferred. Readability over cleverness. Minimal conceptual complexity. No unnecessary defensive code.

同じ責務なら、概念数・間接参照・状態数が少ない実装を選びます。行数最小化は目的ではありません。読みやすい名前と直接的な制御 flow を優先してください。

一つの実装しかない interface、不要な abstract base class、provider registry、factory の多重化、DI container、event bus、generic plugin architecture、将来用 extension point は導入しません。trivial wrapper、one-line helper の増殖、不要な temporary variable、意味のない null check、broad catch、silent fallback、旧仕様だけの互換層を避けます。

抽象化は current requirement、実在する重複、実 API/lifecycle 境界、具体的な correctness/testability 問題で説明できる場合だけ認めます。Git、Gradle、Codex、Claude、MC Pilot の subprocess 境界は実在する境界です。

実装 Agent は現在 milestone の AC のみを実装し、PROJECT.md、Harness、config、state、Git history を編集しません。Minecraft 起動は Harness が決めます。検証コードを弱めて failure を隠さず、action と observed result を検査するテストを書いてください。
