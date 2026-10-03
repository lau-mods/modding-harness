# Minecraft runtime / MC Pilot

MC Pilot 専用処理は `src/runtime/mc-pilot.ts` に限定します。利用者が準備した NeoForge server と MC Pilot の NeoForge client を対象とし、特定 Mod、Minecraft version、NeoForge version、model ID は固定しません。

初期 config は runtime 未設定です。unit/GameTest だけの milestone は client を起動しません。E2E が必要なら、専用 server を `.harness-state/runtime/server/`、MC Pilot home を `.harness-state/runtime/mct-home/` に準備します。`MCT_HOME` と `MCT_CACHE_DIR=.harness-state/runtime/mct-cache` を指定して mct の実際の --help/schema を確認してください。Harness は MC Pilot の vendor/自動 install、loader の推測変更、EULA 自動承認をしません。

runtime config 例（各 path と名前を実環境に合わせて確定）:

```json
{
  "command": "mct",
  "clients": ["harness-a", "harness-b"],
  "clientOptions": {
    "javaCommand": "/absolute/path/to/native-java-21/bin/java",
    "maxMemory": "3072m",
    "earlyWindowControl": false
  },
  "server": {
    "command": ["/absolute/path/to/native-java-21/bin/java", "-Dneoforge.readTimeout=120", "@libraries/net/neoforged/neoforge/<version>/unix_args.txt", "--nogui"],
    "directory": ".harness-state/runtime/server",
    "address": "127.0.0.1:25575"
  },
  "deploy": [
    {"source":"build/libs/<mod>.jar", "target":".harness-state/runtime/server/mods/<mod>.jar"},
    {"source":"build/libs/<mod>.jar", "target":".harness-state/runtime/mct-home/clients/harness-a/minecraft/mods/<mod>.jar"},
    {"source":"build/libs/<mod>.jar", "target":".harness-state/runtime/mct-home/clients/harness-b/minecraft/mods/<mod>.jar"}
  ],
  "logs": [
    ".harness-state/runtime/mct-home/logs/client-harness-a.log",
    ".harness-state/runtime/mct-home/logs/client-harness-b.log"
  ]
}
```

Minecraft server の eula.txt は利用者が同意済みである必要があります。server.properties の server-ip/server-port は上記 loopback address と一致させます。MC Pilot clients は停止済みで、対象と同じ Minecraft/NeoForge version、必要な MC Pilot mod を準備してください。`client list` で NeoForge loader と停止状態を検査し、server 起動後に `client launch NAME --server ADDRESS`、`client wait-ready NAME --timeout 120` を実行します。すでに起動した client を取り込みません。

`clientOptions` は省略可能で、指定した項目だけを停止済みの全クライアントへ適用します。`javaCommand` と `maxMemory` は MC Pilot の `instance.json`、`earlyWindowControl` は `minecraft/config/fml.toml` に反映します。Apple Silicon では ARM 版 Java 21 の実際のパスを両側に指定してください。`maxMemory` は `3072m` / `3G` の形式です。サーバーの `-Dneoforge.readTimeout=120` は JVM 引数に指定します。`wait-ready --timeout 120` は Harness の参加完了待ちであり、ゲームの接続制限やヒープを変更しません。

deploy は build 完了後、runtime 起動前だけに行います。source は今回の build output、target は専用 runtime 内です。Mod が server/client にロードされたことは scenario の machine assertions でも検査してください。シナリオは `HARNESS_MCT_COMMAND` と `HARNESS_CLIENTS` を利用し、mct 呼び出しの success envelope と内部 action success の両方を確認してください。

停止は server stdin の stop による保存・client 切断を先に行い、その後 MC Pilot の client stop で client process を終了します。30 秒以内に終了しない専用 server は kill して run を失敗扱いにします。Persistence は同じ world を保持してこの lifecycle をもう一度実行します。runtime log と設定された client logs の当該 run 中の追加分を検査し、実装中 Mod に関連するエラーがあれば checkpoint しません。ログの対象判定は [検証 contract](verification.md) に従います。

検査用 world はスーパーフラット固定です。Harness が server.properties を設定し、同一実装プロジェクトでは専用 world `harness-superflat` を milestone・再検証・process restart をまたいで使い回します。

2026-10-01 に、参考リポジトリ内の MC Pilot 0.16.0 の実 --help、up/down/client list/server list と実装を確認しました。MC Pilot 0.16.0 の up は標準 server manager 用で、NeoForge installer を提供しないため、この Harness は明示された Java argv で専用 NeoForge server を管理します。実 client 起動・停止は MC Pilot に委譲します。

参照: [MC Pilot upstream](https://github.com/kzheart/mc-pilot)、[NeoForge setup](https://docs.neoforged.net/docs/1.21.1/gettingstarted/)、[提供された参考実装](https://github.com/lau-mods/modding-harness-1.21.1/tree/orchestration)。Codex 引数は installed exec --help、[公式 CLI documentation](https://learn.chatgpt.com/docs/developer-commands?surface=cli)、Claude 引数は installed --help で確認しました。これらの CLI 契約確認と、実 Minecraft E2E 成功は別の検証です。
