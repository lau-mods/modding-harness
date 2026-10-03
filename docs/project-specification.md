# PROJECT.md の記述

PROJECT.md は製品仕様の唯一の正本です。**実装方法ではなく、プレイヤーや server から観測可能な挙動**を記述してください。クラス分割、内部 helper、Agent 会話、implementation plan は製品要求ではありません。

init は [templates/PROJECT.md](../templates/PROJECT.md) の draft 雛形を使用します。Project ID、Mod ID、Minecraft、NeoForge、Java と未決定の製品判断を確定したら `Status: active` にします。Open Questions が `None.` 以外なら計画・開発を開始しません。Constraints と Persistence/Multiplayer/Visual/Performance/Compatibility には全体に適用する要件、対象外なら `None.` を記述します。

Feature はまとまりのある観測可能な機能です。Requirement はその機能に必須の挙動、AC は合否が判断できる具体例です。既存仕様と矛盾しない要件・AC の補足は許容します。補足は先に PROJECT.md へ記録してから派生仕様へ反映し、派生側だけに独立した AC を残しません。次は記述例です。

```markdown
### F-001: Copper Press

#### Description

プレイヤーが銅インゴットを銅板へ加工できる。

#### Requirements

##### R-F001-001: 銅板の加工

投入された銅インゴット 1 個を消費して銅板 1 個を出力する。

#### Acceptance Criteria

##### AC-F001-001: 銅 1 個から銅板 1 個が得られる

Preconditions:
入力 slot に銅インゴットが 1 個あり、出力 slot が空である。

Action:
プレイヤーが加工ボタンを押す。

Expected Result:
入力 slot は空になり、出力 slot に銅板が 1 個置かれる。

Verification:
- gametest
- e2e
```

Preconditions は開始条件、Action は一つの操作または明確な操作列、Expected Result は測定可能な結果です。「適切に動く」「見た目がよい」だけでは不十分です。画像が必要な要件は、例えば「ラベルが枠内に収まり、隣のボタンと重ならない」と記述し、visual を指定します。inventory count、GUI open、server connection は machine assertion で判定し、visual に置き換えません。

Verification は Markdown list で `unit`、`gametest`、`e2e`、`visual`、`persistence`、`multiplayer` の必要なものだけを指定します。Build 成功は共通 invariant なので列挙しません。persistence なら保存対象と再起動後の期待値、multiplayer なら actor/server/observer の結果を AC に明記します。

ID は `F-001`、`R-F001-001`、`AC-F001-001` の形式で、数字は 3 桁以上です。Requirement と AC の feature 部分は親 Feature と一致させます。ID の title 変更は可能ですが、意味を別の機能に流用しないでください。削除・retire した ID は再使用できません。項目の先頭に `Status: retired` と記述して履歴として残すこともできます。省略時は active、Feature の retire は子にも適用されます。

既存の類似実装、提示された参考実装、Minecraft/modding の極めて一般的な慣行から詳細がほぼ一意に決まる場合は、確認を待たず進めます。例えば既存加工機と同じ動作を要求され、その実装が破壊時に内容物を drop することを確認できれば、その挙動を Requirement/AC に根拠とともに補足できます。内部 API の選択だけなら AC を増やす必要はありません。明示された要件に反する参考動作は採用しません。

Open Questions は根拠を考慮しても実質的に異なる製品判断が残る場合に使います。加工中の素材を返すか消費するかについて、仕様にも参照実装にも根拠がなければ未決定として記録します。確定後は Requirement/AC/Constraints に反映し、Open Questions を `None.` にします。

変更・参考ファイル指定の操作は [README の仕様変更](../README.md#仕様変更) を参照してください。
