# PROJECT.md の記述

PROJECT.md は製品仕様の唯一の正本です。**実装方法ではなく、プレイヤーや server から観測可能な挙動**を記述してください。クラス分割、内部 helper、Agent 会話、implementation plan は製品要求ではありません。

init が全必須 section を含む draft 雛形を生成します。Project ID、Mod ID、Minecraft、NeoForge、Java と全製品判断を確定したら `Status: active` にします。Open Questions が `None.` 以外なら計画・開発を開始しません。Scope/In Scope には対象、Non-goals には今回実現しない機能を明示します。Constraints と Persistence/Multiplayer/Visual/Performance/Compatibility には全体に適用する要件、対象外なら `None.` を記述します。

Feature はまとまりのある観測可能な機能です。Requirement はその機能に必須の挙動、AC は合否が判断できる具体例です。次は記述例であり、Harness が自動的に Mod の要件へ追加するものではありません。

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

Open Questions は複数解釈のある製品判断を利用者に戻す場所です。例えば「加工中に block を壊したとき、素材を返すか消費するか」は利用者の判断が必要です。AI は独自に選びません。確定後はその内容を Requirement/AC/Constraints に反映し、Open Questions を `None.` にします。

通常の製品変更は `harness chat '要求'` を使用します。手動変更時は `harness validate --refresh-projections` で明示的に派生情報を更新し、自分で spec commit してください。`validate` 単独は projection の不一致を拒否します。生成ファイルを製品仕様の編集先にしないでください。
