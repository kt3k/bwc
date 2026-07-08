# ゲームを面白くする7つのアイデア

現状のコードベース(collect delegate / idle delegate / pushed delegate / onEnter
/ signals + UI コンポーネント)の拡張ポイントに沿って実装できるアイデア集。

## 1. コイン + スコアUI

集めるとカウントされるコインアイテム。

- 新アイテム `coin`(`collect: "coin"`)。CollectDelegate で `coinCount` signal
  をインクリメント
- `AppleCounter` と同様のカウンターUIを ui-panel に追加、`ItemGetEffector`
  にも飛ぶ演出を追加
- 道沿い・氷の湖の上・宝箱の中身としてマップに配置する
- 素材: `static/item/coin.png` を新規作成(16x16 ピクセルアート)

## 2. 追いかけてくる敵

プレイヤーが近づくと追跡してくる敵。捕まる(押される)とりんごを1個盗まれる。

- `IdleDelegateChase` を追加: プレイヤーとのマンハッタン距離が閾値以内なら
  プレイヤー方向へ 1 歩移動(大きい軸を優先)、範囲外ならその場で待機
- 接触時は既存の `tryMove` の bounce → `onPushed`
  経路でプレイヤーをノックバックさせ、 クールダウン付きで `appleCount`
  を減らす(赤いエフェクト)
- `IField` に `me`(プレイヤー参照)を公開する必要がある
- 素材: 未使用の `static/actor/boco/` スプライトを使用
- 配置: 暗い森ブロックに数体。序盤エリアには置かない

## 3. ジャンプ台

乗ると進行方向に飛ばされる床。川越えショートカットや一方通行の仕掛けに。

- prop の `onEnter: "spring"` を追加: `jump` + 進行方向へ `slide` x3 を enqueue
- 進行方向が塞がっている場合はその場ジャンプのみ(無限バウンスのソフトロック防止)
- 素材: `static/prop/spring.png` を新規作成
- 配置: 川(水セル)を飛び越える位置、ショートカット

## 4. 看板 + メッセージ表示

押すとメッセージが表示される看板。道案内と世界観づけ。

- prop `sign`(`pushed: "sign"`, `dataSchema: { text: string }`)
- `message` signal + トーストUIコンポーネント(数秒表示して消える、font-8bit)
- エディタの dataSchema フォームでテキストを編集できる
- 素材: `static/prop/sign.png` を新規作成
- 配置: 交差点・エリア入口に方向案内(例: "N: FROZEN LAKE")

## 5. 宝箱

壊すと中からアイテム(コイン・りんご等)が飛び出す。

- prop `chest`(`pushed: "chest"`,
  `dataSchema: { drops: string, count: number }`)
- break 演出の後、`IField.spawnItem(type, i, j)`(新設)で周囲の enterable
  なセルへアイテムを `go` アクション付きでばらまく
- 注意: prop は再アクティベートで復活する(壊したクレートと同じ挙動)
- 素材: `static/prop/chest.png` を新規作成
- 配置: 森の空き地・湖の島・ゲートの先の宝物庫

## 6. 滑る氷の床

乗ると同じ方向へ滑り続けて止まれない床。氷湖パズルに。

- `CellDefinition` / catalog に `slippery?: boolean` を追加
- `IField.isSlippery(i, j)` を新設
- `Actor.step` の move 完了時: 現在セルが slippery かつ進行方向へ進めるなら
  `slide` を unshift(入力無視で滑る。NPC も滑る)
- 滑りながらコイン回収が可能(moveEnd の collect は維持)
- 素材: `static/cell/ice.png`(通行可・slippery)、あわせて
  `static/cell/water.png`(通行不可)を地形用に追加
- 配置: 凍った湖ブロック。コインを氷上に置いて滑走ルートを考えさせる

## 7. りんごゲート

りんごを N 個持っていると開く扉。エリア解放の進行要素。

- prop `apple-gate`(`pushed: "apple-gate"`, `dataSchema: { count: number }`)
- 押されたとき `appleCount >= count` なら演出付きで自身を remove
- 足りなければ #4 のメッセージトーストで "NEED n APPLES (x/n)"
  を表示(機能の相乗り)
- 素材: `static/prop/gate.png` を新規作成
- 配置: 宝物庫や特別エリアの入口

# マップ拡張計画(20ファイル)

現状 8 ファイル → 12 ブロック追加で 20 ファイルにする。

- 既存ワールド: 原点クラスタ 2列x3行(i ∈ {-200, 0}, j ∈ {-200, 0, 200})+
  スタート島 `block_-10000.-10000`(ポータルで接続)+ `block_not_found`
- 拡張: 4列x5行(i ∈ {-400..200}, j ∈ {-400..400})から角2つ (-400,400), (200,400)
  を除いた 18 ブロック → 18 + スタート島 + not_found = 20 ファイル
- 生成は `tools/` にスクリプトを追加して行う:
  - 既存ブロックの端の通行可否を読み取り、道が既存の道と揃うように新ブロック側を彫る
  - 各ブロック中央を通る道グリッド(縦横)で全体の連結性を保証
  - ブロックごとにテーマを持たせる: 森(壁セル=木)、湖(水セル+橋+ジャンプ台)、
    凍った湖(氷セル+コイン)、村(既存の建物風)、宝物庫(りんごゲート+宝箱)
  - 新機能の Actor / Prop / Item
    をテーマに沿って配置し、全機能が実際に試せるようにする
