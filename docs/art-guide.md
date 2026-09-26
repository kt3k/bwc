# ドット絵の色ルール

これまで色の決まりはコミットメッセージ (dc4747b) とコード中のコメントに
しかなかったので、ここに明文化する。

## パレット

- すべてのピクセルアート (セル / アイテム / プロップ / アクター / エフェクト /
  UI) は [kt3k/vscode-pixeledit](https://github.com/kt3k/vscode-pixeledit) の
  パレット (`src/webview.ts` の `paletteColors`、不透明色 54 色) の色だけを
  使う。正本は `util/palette.ts` の定数 `Palette`。
- コードで色を使うときは `#xxxxxx` を直接書かず、`Palette.gray2` のように
  定数を使う。エフェクトやセルの色を受け取る API は型 `PaletteColor` しか
  受け付けないので、パレット外の色を書くと型検査 (`deno task check`) で 止まる。
- `deno task check-palette` は、`static/` 配下の全 PNG の画素、カタログの セルの
  `noise` の色、`static/index.html` に書かれた `#rrggbb` を検査する。
  パレット外の色が 1 つでもあれば失敗する。素材を追加・変更したら必ず実行 する
  (例外は素材の元絵 `static/actor/lena.png` のみ)。
- 1 スプライトの色数は 16x16 なら 4〜6 色まで (輪郭 + 基本色 + 影 + ハイライト
  - 差し色)。

定数名は「色相 + 段」で、段 1 が最も明るく 4 が最も暗い。グレーは白から黒へ
順に並べてある。

| 系統       | 定数                             | 色 (段 1 → 4)                                               |
| ---------- | -------------------------------- | ----------------------------------------------------------- |
| 白・グレー | `white` `gray1`〜`gray4` `black` | `#ffffff` `#bec1be` `#b9bcb9` `#6a6d6a` `#4a4d4a` `#000000` |
| 青         | `blue1`〜`blue4`                 | `#cceaff` `#68a5ff` `#1950c7` `#001480`                     |
| 藍         | `indigo1`〜`indigo4`             | `#dddeff` `#8c9cff` `#4b30e3` `#1f008a`                     |
| 紫         | `violet1`〜`violet4`             | `#ecdaff` `#b586ff` `#7322d6` `#38007a`                     |
| 赤紫       | `magenta1`〜`magenta4`           | `#f8d7fd` `#d975fd` `#951fa9` `#540056`                     |
| 桃         | `pink1`〜`pink4`                 | `#fcd5f5` `#e377b9` `#9d285c` `#5a0019`                     |
| 橙・赤     | `orange1`〜`orange4`             | `#fcdbcf` `#e58d68` `#983600` `#4f1000`                     |
| 金・茶     | `brown1`〜`brown4`               | `#f9e7b5` `#d49d29` `#7f4b01` `#3d1c00`                     |
| 黄         | `yellow1`〜`yellow4`             | `#f1f0aa` `#b2af0d` `#5e6400` `#253200`                     |
| 黄緑       | `lime1`〜`lime4`                 | `#dafaa9` `#7bc212` `#237601` `#013d00`                     |
| 緑         | `green1`〜`green4`               | `#c9febc` `#56c947` `#047e03` `#004000`                     |
| 青緑       | `teal1`〜`teal4`                 | `#c2fad7` `#46cb80` `#007644` `#013924`                     |
| 水色       | `cyan1`〜`cyan4`                 | `#c4f6f6` `#47c0c4` `#006e8a` `#002e55`                     |

## 画面に出す色の方針

**画面に表示される色は、すべてパレット (`util/palette.ts`) の色でなければ
ならない。** スプライトだけでなく、描画の結果として画面に出る色すべてが
対象で、パレット内の色同士を混ぜてできる中間色も認めない。

そのため次のことはしない。

- 半透明の重ね塗り (`rgba()` / `hsla()` のアルファ、`globalAlpha`、CSS の
  `opacity` を 0 と 1 以外にする、Tailwind の `bg-black/80` など)
- グラデーション (`createRadialGradient` / `createLinearGradient`、CSS gradient)
- フェードやクロスフェード (`opacity` や色の CSS `transition`)
- 合成モードやフィルタでの色の変化 (`globalCompositeOperation` で色を作る、CSS
  `filter`、`blur`、影)
- 拡大縮小や回転での補間 (`imageSmoothingEnabled` は false、CSS は `crisp-edges`
  / `pixelated`、回転は 90 度単位で整数の行列だけ)
- パレット外の UI 色 (Tailwind の `text-gray-400` など)

明るさを変えたいときは、パレットの隣の階調に置き換えるか、ディザ (市松
などのパターンで黒を置く) で表現する。例: 壁の土台の縁 (`casts`) は黒の
市松。夜の暗転はこの方針に反するため削除した。

### 文字

- フォント `8bit` (vaticanus) は 8px グリッドで作られている (1em = 1024
  units、1px = 128 units) ので、8px か 16px でだけ使う。それ以外の
  サイズではドットが画面の画素にそろわず、にじむ。
- 文字にはクラス `pixel-text` (16px、`pixel-text-sm` を足すと 8px) と インク
  `ink-white` / `ink-light` / `ink-mid` を付ける (`static/index.html`)。
  インクは SVG フィルタで、半分以上覆われた画素だけを残してパレットの 1 色
  (`#ffffff` / `#b9bcb9` / `#6a6d6a`) で塗る。ブラウザの文字の
  アンチエイリアスは CSS では確実に止められないため、この方法で中間色を
  消している。
- インクは要素全体を 1 色にするので、背景色を持つ要素には付けない。背景は
  外側の要素に、インクは内側の文字だけの要素に付ける (メッセージトースト
  がその形)。

### 演出

- 読み込み中のチャンクは黒で覆い、描き終わったら黒の市松を 150ms 見せて から消す
  (フェードの代わり)。
- アイテム取得の演出は位置だけ動かし、透明度は変えない。
- 画像は `img` / `canvas` すべて `image-rendering: pixelated` なので、
  高解像度の画面で拡大されても補間されない。

### 確認のしかた

ヘッドレスブラウザで画面を撮り、パレットにない色の画素を数える。 2026-09
の時点で、読み込み直後、静止時、トースト表示、アイテム取得の
途中、チャンク読み込みの覆いが出ている間、のどれも、デバイスピクセル比 1 と 2 で
0 画素だった。

## 地形セル (static/cell)

地形は **グレースケール** に限定する。キャラクター・アイテム・仕掛けが色で
浮き上がって見えるようにするため。

| 用途                              | 色                                |
| --------------------------------- | --------------------------------- |
| 床の地                            | `#b9bcb9`                         |
| 床の模様 (目地・小石・板の継ぎ目) | `#6a6d6a`                         |
| 床の濃い差し色 (影・砂利の黒石)   | `#4a4d4a`                         |
| 壁                                | `#b9bcb9` と `#000000`            |
| 氷                                | `#ffffff` の地に `#b9bcb9` のひび |
| 水                                | `#4a4d4a` の地に `#000000` の波   |
| 森床                              | `#4a4d4a` / `#6a6d6a` / `#b9bcb9` |

- 単色の床タイルは作らない。必ず 2 階調以上の模様を入れる (模様が薄くても、
  隣り合うタイルの継ぎ目が見えないことを 3x3 に敷いて確認する)。
- **色付きセル `g` (緑) / `a` (青) / `r` (赤) は地形に使わない。** 看板の
  文字を強調する背景専用。`b` (黒) は通行不可の目隠し。

## セルの単調さを崩す仕組み

16x16 のタイルをそのまま敷き詰めると模様の繰り返しが目立つので、描画時に
セルごとの変化を加える。すべて世界座標 `(i, j)` をシードにした決定的な乱数
なので、同じセルは何度描いても同じ見た目になる。実装は
`model/cell-decor.ts`、設定は `static/catalog/base.json` の各セル。

| フィールド | 値                              | 効果                                                                                                                             |
| ---------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `noise`    | `色=本数[:形]&...`              | 色の小さな印をセル内にランダムに置く。形は `line` (既定, 横 1〜3px) / `dot` / `vline` / `speck` (小石) / `diag` (ひび) / `cross` |
| `flip`     | `h` / `v` / `hv` / `rot`        | セルごとに画像を左右・上下反転、または 90 度単位で回転する                                                                       |
| `variants` | `{ "../cell/x_a.png": 5, ... }` | まれに差し替える別画像。値は出現率 (%)。欠けた石・花・格子など「たまにある物」を置く                                             |
| `casts`    | `true`                          | 壁。真下のセルが壁でないとき、壁セル自身の下 2 行に黒の市松 (最下行は偶数列、その上は奇数列) を描いて土台の縁を出す              |

- `noise` の本数は一様ではなく、6 マス周期のなだらかな場 (0〜2 倍) で
  増減する。汚れが「まだら」に固まり、きれいなセルとの差が出る。均一に
  散らしたいセルは `"noisePatches": false` にする (レンガ壁 `2` がそう)。
- `flip` は方向性のない模様にだけ使う (石畳・砂利・氷・ひび・モザイク・ 森は
  `rot` / `hv`、板・砂紋・レンガは `h` のみ、ベルトと壁は使わない)。
- `variants` は 1 セルにつき合計 10% 前後まで。多いと「まれな物」でなく
  なる。差分画像は元タイルの上に 1 か所だけ手を入れる (`x_worn`, `x_crack`,
  `x_missing` のような名前)。
- 影はパレットのグレー 1 段
  (`#ffffff → #b9bcb9 → #6a6d6a → #4a4d4a →
  #000000`)
  を落とすだけなので、どの床の上でもパレット内に収まる。色付き
  ピクセルは変えない。
- 新しい床を足すときは、まず `noise` の形と `flip` を決め、必要なら `variants`
  を 1〜2 枚描く。`static/preview.html` でセルの横に variants が
  並んで表示される。

## 床セルの一覧

| 記号      | ファイル       | 見た目            | 主な用途               |
| --------- | -------------- | ----------------- | ---------------------- |
| `0`       | floor0.png     | 市松の点          | 汎用の床、道           |
| `3`       | floor2.png     | 縁取りの点線      | チュートリアル         |
| `4`       | floor3.png     | 十字の刻み        | B2F                    |
| `5`       | floor4.png     | レンガ敷き        | B1F                    |
| `6`       | floor5.png     | 細かいディザ      | B3F                    |
| `f`       | forest.png     | 暗い地に斑点      | 森・草地               |
| `c`       | cobble.png     | 丸い石畳          | 村・広場               |
| `d`       | planks.png     | 板張り            | 桟橋・回廊・室内       |
| `m`       | mosaic.png     | 4px タイル + 光点 | 金庫・祭壇・広場の中心 |
| `p`       | gravel.png     | 砂利              | アリーナ・岩のレーン   |
| `h`       | steel.png      | 鋼板の菱形刻印    | 機械室・ベルト周り     |
| `y`       | sand.png       | 砂紋              | 水辺                   |
| `i`       | ice.png        | 氷 (滑る)         |                        |
| `x`       | cracked.png    | ひび (掘れる)     |                        |
| `n s o e` | conveyor_*.png | ベルト (強制移動) |                        |

## アイテム・プロップ・アクター

- 輪郭は黒 `#000000` か濃い茶 `#3d1c00` / 濃い緑 `#253200`。
- 金属・金は `#7f4b01` → `#d49d29` → `#f9e7b5` の 3 階調。コインのような
  「光るもの」は最も明るい `#f9e7b5` を左上の広い面に使い、影は右下の細い
  三日月だけにする (暗い階調が多いと卵や石に見える)。
- 光源は左上固定。ハイライトは数ピクセル、影は右下に形として置く。
- 仕掛けの状態は色で伝える: 青 (`#002e55` / `#1950c7` / `#cceaff`) は 「OFF
  で立つ壁」、赤 (`#4f1000` / `#983600` / `#e58d68`) は「ON で立つ壁」、
  金は「ボタン・ゲート」。
- 16x16 の下 1 行は空けて奥行きを出す (門・壁・箱)。

## アクターの 4 方向フレーム

- `down` / `up` / `left` の 3 方向を描き、`right` は `left` の鏡像にする
  (左右で非対称なデザインのときだけ別に描く)。
- 横向きは 3/4 の横顔。頭の輪郭 (幅・高さ) は正面と同じにし、目を 1 つ
  進行方向側の縁に寄せる。後ろ向きは顔を描かず、帽子・髪・うなじで頭を 埋める。
- 頭の上端と足元の行は全方向・全フレームで揃える。上下のバウンドは入れない
  (既存アクターは足の入れ替えと胴体の揺れだけで歩きを表現している)。
- 2 フレーム歩行は「前足と後ろ足を入れ替える」+ 尻尾・腕などの付属物を
  逆側へ振る。正面で左右に振れるものは後ろ向きでも左右に振る。
- 参考: `static/actor/boco/` (正面 2 枚を元に横・後ろを起こした例)。

## 参考資料

- [SLYNYRD Pixelblog 22 - Top Down Character Sprites](https://www.slynyrd.com/blog/2019/10/21/pixelblog-22-top-down-character-sprites):
  横向きは鏡像で足りる、頭は全高の 1/3〜1/2、ダミー (単色パーツ) で動きを
  決めてから描き込む
- [SLYNYRD Pixelblog 55 - Top Down Character Animation](https://www.slynyrd.com/blog/2025/3/24/pixelblog-55-top-down-character-animation)
- [Sandro Maglione - Top-down game Pixel art](https://www.sandromaglione.com/articles/pixel-art-top-down-game-sprite-design-and-animation):
  光は真上から (頭頂が明るく、頭の下の胴が暗い)、目は頭の下寄り、影で
  奥行きを出す
- OpenGameArt (CC0) の比較用素材:
  [16x16 Characters + Putting Animation](https://opengameart.org/content/16x16-characters-putting-animation)、
  [16x16 Animated Turtle](https://opengameart.org/content/16x16-animated-turtle)、
  [16x16 Coin Animated](https://opengameart.org/content/16x16-coin-animated)、
  [16x16 Spinning Coin + Pickup Animation](https://opengameart.org/content/16x16-spinning-coin-pickup-animation)

## 新しいセルの追加手順

1. `static/cell/<name>.png` を 16x16 で描き、3x3 に敷いて継ぎ目を確認する。
   `deno task check-palette` を通す
2. `static/catalog/base.json` の `cells` に記号を追加する (`canEnter`, 必要なら
   `noise` / `flip` / `variants` / `casts` / `slippery` / `water` / `conveyor` /
   `diggable`)
3. `tools/generate_preview_zoo.ts` の `CELLS` と `game/preview.ts` の `NOTES`
   に加える
4. 生成スクリプトで使う場所を決める (どの階のどの部屋か)
