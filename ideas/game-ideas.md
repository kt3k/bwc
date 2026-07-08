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

# 追加の7つのアイデア

## 8. 効果音

イベントに効果音を付ける。jsfxr は導入済み(main.ts でクリック時に pickupCoin
を再生している)なので、それをイベント全般に配線する。

- `sound` signal(またはイベント名の Signal)を追加し、UI コンポーネント
  (SoundPlayer)が subscribe して jsfxr のプリセットを再生
- 対象: アイテム取得(pickupCoin)、ジャンプ(jump)、壁バウンス(hitHurt)、
  クレート破壊(explosion)、ゲート開放(powerUp)、敵に盗まれた(hitHurt)
- モバイルの自動再生制限があるため、初回タップで AudioContext を解放する
- 素材不要。小さい労力で手触りが大きく変わる

## 9. セーブ機能

現状はリロードで全部リセットされる。進行状況を localStorage に永続化する。

- 保存対象: `appleCount` / `greenAppleCount` / `coinCount` の各 signal、
  `Item.#collectedItemIds`(回収済みアイテム)、最後にいた座標
- signal の subscribe で書き込み、起動時に読み込んで signal を初期化
- `Item.collect` / `isCollected` に serialize/deserialize を追加
- リセット手段(タイトルに戻る/NEW
  GAME)としてスタート島に「リセットポータル」を置く

## 10. ミニマップ

拡張後の20ブロックの世界を歩き回るための小さな地図UI。

- `currentBlock` signal は既にあるので、ブロックの `field` セル配列を
  縮小して小さい canvas(例: 50x50、4セル=1px)に描画
- セルの色分け: 通行可=明色、壁=暗色、水=青、氷=白、プレイヤー=赤点
- `centerGrid` signal でプレイヤー位置マーカーを更新
- ui-panel の下に配置。タップで表示/非表示切り替え

## 11. 木を植えて育てる

種を植えると時間経過で育ち、収穫できる木になる。

- 新アイテム `seed`(コインで買う/宝箱から出る)。collect ではなく
  「所持して空き地で使う」形にするなら、collect で `seedCount` signal を増やし、
  空き地で space キー使用時に苗 prop を `field.props.add` する
- 苗 prop は `step()` で `field.time` を数え、一定時間ごとに画像を差し替えて
  成長(苗 → 若木 → 実った木)。実った木を押すとりんごが落ちて再び若木に戻る
- prop はディアクティベートで消えるので、成長状態は 座標キーの static
  Map(またはセーブ機能 #9)に持たせる
- 素材: `sapling.png` / `tree_young.png` / `tree_fruit.png`

## 12. 昼夜サイクル + ランタン

`field.time` ベースで昼夜が巡り、夜は画面が暗くなる。

- 一定周期(例: 実時間5分)で `timeOfDay` signal を更新し、ゲーム画面に かぶせた
  DOM オーバーレイの不透明度をなめらかに変える(既存の curtain と同様の手法)
- 夜はチェイサー(#2)の索敵範囲を2倍にする、コインの出現が増える、など
  リスクとリワードを付ける
- `lantern` prop はオーバーレイに radial-gradient の穴を開けて周囲を照らす
- 素材: `lantern.png`

## 13. 釣り

水セル(#6 で追加)の隣で space を押すと釣りができる。

- `IdleMainActor` の space 処理を拡張: 目の前のセルが水 (`IField.isWater(i, j)`
  を追加)なら釣りモードに入る
- 待ち時間(1〜3秒のランダム)後に判定: フィッシュ(既存のフォロワー魚!)、
  コイン、なにも釣れない、をランダムで
- 釣り中は待機アニメーション(既存の idle 2フレームで十分)+ 釣れた瞬間に
  line-pattern エフェクト
- 既存の fish follower 機構の入手経路が増え、水地形に意味が出る

## 14. 転がる岩

押すと滑って転がっていく岩。障害物に当たるまで直進し、
敵を潰したりクレートを壊したりできる。

- prop は座標が readonly なので「動く prop」の仕組みが必要:
  `FieldProps.move(fromI, fromJ, toI, toJ)` を追加して remove + add
  で実現するか、 岩だけ実体を Actor(idle なし、pushed:
  "roll")として実装する方が簡単
- 押されたら押された方向へ `slide` を繰り返し、`canEnterStatic` が false になる
  手前で停止。停止先に敵がいたら敵を消して(潰して)コインをドロップ
- 氷(#6)の上では止まらない、水(#6)に落とすと橋になる(セルを差し替える)
  と、他の機能と組み合わせたパズルが作れる
- 素材: `boulder.png`
- 配置: 氷湖パズル、川渡しパズル

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
