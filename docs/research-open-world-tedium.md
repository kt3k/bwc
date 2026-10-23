# 調査: オープンワールドは単純作業と単調な景色をどう減らしているか

プレイテスト (docs/playtest-2026-10-21.md) で「単純作業の少なさ」が 2 回とも
全員 2 点だった。2 回目は「12 マス以内に必ず何かある」ようにしたあとでも
変わらず、「何もない灰色の平原」「押せない黒い四角が多い」と書かれた。
世の中のオープンワールド系ゲームの対策を調べ直し、このゲームのコードと
照らし合わせてアイデアを出す。

- 2026-10-22 の初版は、ネットワークの制限で記事本文が読めず、検索結果の要約
  だけで書いた。2026-10-23 に制限を外して原文を読み直した。
- **[確]** は記事本文で確かめたもの、**[未]** は検索結果や二次情報にしか
  なかったもの。引用は英語の原文から訳した。
- 制限を外したあとも DNS で開けないサイトがあった (末尾)。

## 1. 世の中の対策

### 1-1. 「引力」: 見えている物が寄り道させる

- **BotW の「引力」[確]**: 最初は塔と、塔の間のイベントで導いたが、テストで
  「導かれている、一本道すぎる」と言われた。そこで、目立ち方と大事さの違う
  建物をあちこちに置き、プレイヤーが建物から建物へ寄り道を繰り返すように
  した。テストプレイの移動のヒートマップで、どこで止まり、どこで退屈したかを
  見て置き直した
  ([nintendoeverything](http://nintendoeverything.com/nintendo-on-the-behind-the-scenes-creation-of-zelda-breath-of-the-wild/)、
  [zeldauniverse](https://zeldauniverse.net/2017/10/09/a-deep-dive-into-nintendos-development-of-breath-of-the-wild/))。
- **BotW の三角形 [確]**: 三角形の丘は「越えるか回るか」を選ばせ、越えた先に
  何があるかと思わせる。四角は物を完全に隠すのに使う
  ([80.lv](https://80.lv/articles/the-design-secrets-of-breath-of-the-wild/))。
- **Ghost of Tsushima [確]**: 「画面の UI で行き先を示す代わりに、島で迷って
  ほしかった」(Nate Fox)。風が目的地へ吹き、狐が祠へ、黄色い鳥が名所へ導く
  ([press-start](https://press-start.com.au/features/2020/05/22/ghost-of-tsushima-interview-weapon-upgrades-crafting-length-waypoints-and-more/)、
  [Wikipedia](https://en.wikipedia.org/wiki/Ghost_of_Tsushima))。
- **A Short Hike [確]**: 「好奇心をくすぐる目印を作ろうとした」「迷うことも
  遊びの一部にしたかった」「いちばん分かりやすい道の正反対へ行くプレイヤーを
  前提に作る」
  ([gamedeveloper](https://www.gamedeveloper.com/disciplines/road-to-the-igf-adam-robinson-yu-s-i-a-short-hike-i-)、
  [PlayStation Blog](https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/))。
- **AC Origins / Far Cry 5 [確]**: 塔に登って地図を開ける型をやめた。Origins は
  ミニマップをコンパスに替えて探索を促した
  ([Wikipedia: AC Origins](https://en.wikipedia.org/wiki/Assassin%27s_Creed_Origins)、
  [Wikipedia: Far Cry 5](https://en.wikipedia.org/wiki/Far_Cry_5))。

### 1-2. 景色の単調さ: 「地域ごとに少なく、はっきり」

- **Ghost of Tsushima [確]**: 3 つの地方に 40 以上の植生。「植生ごとに草木の
  種類を**絞った**ことで、地域ごとの新鮮さが出せた」。金色の森は現実の木の
  混ざり方をやめ、オレンジと黄色に寄せた (「大胆さと美しさの小さな塊」)
  ([PlayStation Blog](https://blog.playstation.com/?p=333111)、Wikipedia)。
- **夢をみる島 [確]**: 地上を 2×2 画面の単位に分け、単位ごとに専用のタイルを
  持てる。地域ごとに見た目を変える技術的な仕組み。何もない画面は地域と地域の
  間の「記憶のエアロック」になっている
  ([setsideb](https://setsideb.com/?p=133))。
- **No Man's Sky と「手続き生成のオートミール」[確]**: Kate Compton の言葉。
  数式の上では違っても、**見て違いが分からない**と全部同じに見える。限られた
  素材を組み合わせるだけでは足りず、その後のアップデートで地形・植生・天気の
  種類を足し続けた
  ([Wikipedia](https://en.wikipedia.org/wiki/No_Man%27s_Sky))。Compton は
  「一目で分かる違い」(景色に必要) と「覚えられる個性」(注目される物に必要) を
  分けている [未]。
- **Eastward [確]**: 「キャラクターと場所のそれぞれに、少なくとも 1 つ特別な
  所を見つける。それが探索の満足のいちばん大きな部分」
  ([gamedeveloper](https://www.gamedeveloper.com/disciplines/road-to-the-igf-pixpil-s-i-eastward-i-))。
- **A Short Hike [確]**: 「島の地域ごとに違う感じにしたかった」。

### 1-3. 単純なルールの掛け算

- **BotW の化学エンジン [確]**: 「要素は物の状態を変える」「要素どうしは状態を
  変え合う」「物どうしは状態を変えない」の 3 つだけ。「世界を一貫したルールで
  統一すれば、プレイヤーは自分で解き方を考える」。チームはこれを
  「掛け算のゲームプレイ」と呼んだ
  ([thumbsticks](https://www.thumbsticks.com/gdc-17-breath-of-the-wild-science-lies)、
  [gamedeveloper](https://www.gamedeveloper.com/design/forging-i-zelda-i-s-future-by-revisiting-its-past))。
- **ティアキン [確]**: 同じ地図に「新しい驚きの層を重ねる」(空・地上・地底)。
  空から降りること自体が地上の偵察になる
  ([nintendo.com Ask the Developer](https://www.nintendo.com/whatsnew/ask-the-developer-vol-9-the-legend-of-zelda-tears-of-the-kingdom-part-1/))。
- **Noita [確]**: 「世界を、仕組みの集まりとして探検する」。ただし
  「シミュレーションがかえって面白い遊びの邪魔になる」こともある
  ([gamedeveloper](https://www.gamedeveloper.com/game-platforms/road-to-the-igf-nolla-games-i-noita-i-))。

### 1-4. 生き物がプレイヤー抜きで生きている

- **Rain World [確]**: 「生き物はプレイヤーの障害物として置かれているのでは
  なく、それ自体のために存在する」「画面の外でも生きていて、餌を探し、縄張り
  争いをしている」。決まった巡回路はない
  ([gamedeveloper](https://www.gamedeveloper.com/design/crafting-the-complex-chaotic-ecosystem-of-i-rain-world-i-))。
- **RDR2 [確]**: 物資を探しにキャンプを出るだけで、別の出来事や目的に
  出会える。ただし手続き生成のミッションは「求めるつながりと作り込みに
  届かなかった」ので、手作りを選んだ
  ([gamingbolt](https://gamingbolt.com/red-dead-redemption-2-rockstar-talks-about-player-choice-dynamic-npc-interactions-indoor-environments-and-more))。

### 1-5. 歩くこと自体を遊びにする

- **A Short Hike [確]**: 「動き回ること、滑空することも楽しくしようとした。
  面白い景色は見るためだけでなく、その上で遊ぶためのもの」。歩きの合間に、
  脇道でミニゲームに出会う。
- **Death Stranding [確]**: 荷物の重さで歩き方が変わり、地形が障害になる。
  小島秀夫は、速くどこでも跳べる主人公を途中で試してやめた
  ([gamingbolt](https://gamingbolt.com/death-strandings-traversal-could-have-been-different-reveals-kojima/amp))。

### 1-6. 知識で進む

- **Outer Wilds [確]**: 「探索の唯一の目的は、いる世界についての問いに答える
  こと」「世界は、プレイヤーが実際に行って見つけられる物に絶えず言及する」
  ([gamedeveloper](https://www.gamedeveloper.com/design/road-to-the-igf-alex-beachum-s-i-outer-wilds-i-))。
- **Hollow Knight [確]**: 迷うこと自体を楽しませ、道しるべは最低限。ファスト
  トラベルの駅は少しずつ開く
  ([Wikipedia](https://en.wikipedia.org/wiki/Hollow_Knight))。

### 1-7. 移動の長さと近道

- **AC Origins [確]**: クエストが求める移動距離に上限を設けた。拠点ごとの
  「お笑い」ミッションと掃討ミッションは 1 つずつまで。
- **「ファストトラベルは松葉杖」[確]**: ファストトラベルはテンポを壊し、
  「だだっ広い退屈」を許してしまう。代わりに空間を詰めて折り重ね、危ない
  近道を選べるようにする (Metroidvania の近道と同じ)。本道は安全で遠回り、
  道を外れると近いが危ない
  ([gamedeveloper: Fast travel sucks](https://www.gamedeveloper.com/design/fast-travel-sucks)、
  [gamedeveloper: Fallout 4 without fast travel](https://www.gamedeveloper.com/design/5-changes-for-a-fallout-4-without-fast-travel))。
  どちらも個人のブログ。

### 1-8. 見どころの間隔

- **Witcher 3 の「40 秒ルール」[未]**: 約 40 秒ごとに何か (鹿の群れ、敵、人) が
  目に入るようにした、とされる。出典は noclip のドキュメンタリーで、本文は
  未確認。BotW の実測で平均 41.8 秒という動画もある [未]。
- 「60〜120 秒」[確] は strayspark.studio のブログにあるが、出典がない。

## 2. このゲームの現状 (コードから)

| 見たもの                  | 現状                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 島の広さ                  | 14×12 ブロック = 2800×2400 マス (tools/wilds_plan.json)。名所は 7 か所と村 12、街 3、洞窟                                                                                                 |
| 地面                      | 草地 `6`、砂 `y`、丘 `p`、道 `3` の 4 種類とも、絵は `gray2` と `gray3` の 2 色 (static/cell/floor5.png ほか)。森の地面 `f` も灰色。島全体で地域の差が見えない                            |
| 地形の作り方              | 高さ × 湿り気のノイズで 6 種類 (海・砂・草地・森・丘・岩) に分けるだけ。地域 (区画) ごとの個性はない                                                                                      |
| 散らし方                  | 木・岩・花・コイン・動物を密度と間隔で散らす (Poisson disc)。島全体で同じ種類から選ぶ                                                                                                     |
| 「何もない」の対策        | 12 マス以内に何もない所へ、不思議な物 8 種・生き物 7 種・巣などの 15 種から 1 つ置く (generate_wilds.ts の nothing empty)。**距離しか見ていない**ので、同じ物の繰り返しでも「ある」になる |
| 生き物                    | 好き・怖いがある (model/instinct.ts): りんご → うさぎ → 狐 → 羊が逃げる、蜂 → 狐・猫が逃げる。ただし羊・カラス・鶏は「好き」を持たない                                                    |
| 時間・天気                | 昼夜も天気もない                                                                                                                                                                          |
| 移動を短くする物          | 石碑 (ワープ、model/waystone.ts)、渡し舟 (model/ferry.ts)、倒れる茂み                                                                                                                     |
| 遠くへ行く理由            | お使い (距離に応じてコイン、model/errand.ts)、交易、噂 (方角と距離)                                                                                                                       |
| 絵の決まり (art-guide.md) | アクターとプロップはグレースケールだけ。アイテムは色つき。セルは色を使ってよい (水は青)                                                                                                   |

主人公の歩く速さは画面下のボタンで 1・2・4 ピクセル/フレームを選べる (60fps
なら毎秒約 3.75・7.5・15 マス)。12 マスは 1〜3 秒、40 秒は 150〜600
マスになる。**密度は Witcher
の目安よりずっと高い。それでも退屈なのは、量ではなく「違いが見えない」「何も起きない」から**
と考えられる。調査の中では、Compton の「オートミール」と Ghost of Tsushima の
「種類を絞る」がこの状態にいちばん近い。

## 3. アイデア (効きそうな順)

### A. 地域ごとに「顔」を作る (1-2 / 単調な景色への本命)

島を地域に分け、**地域ごとに使う物を絞る**。島全体で同じ 15 種から選ぶ今の
やり方の反対にする。

- 地域は村と名所を中心にしたボロノイ分割など、20 前後に分ける。
- 地域ごとに次を決める。
  - 地面の模様 1 つ: 草地の `noise` の形と色を地域ごとに変える。セルは色を
    使えるので、たとえば MOON SHRINE のまわりは `violet4` の点、FROSTREACH の
    まわりは `blue1` の霜、BONE VALLEY は `gray4` の筋にする。cell-decor.ts の
    `noise` はもう色と形を持てるので、地域ごとに別のセル (`6` の色違い) を
    足すだけで済む。
  - 散らす物を 2〜3 種に絞る: キノコの森、岩と巣箱の丘、花と蜂の野原。
  - その地域にしかない不思議な物を 1 つ。
- 夢をみる島のように、地域の境目には何もない帯をわざと残す。空白を
  「エアロック」として使う。
- 生成器は地域の表を引くだけになる。手作業でタイルを置く必要はない。

### B. 「12 マス以内に何か」を「数十秒ごとに初めての何か」に

- 今の充填は距離しか見ていない。同じ倉庫・同じ岩でも「何かある」になる。
- 道や、名所どうしを結ぶ直線に沿って歩いたとき、**最近 N 個に見ていない
  種類**に何マスごとに出会うかを生成器で数える。Witcher の 40 秒は、いちばん
  遅い速さでも約 150 マスなので、たとえば 60〜100 マスごとに 1 回を目安にする。
- 足りない区間には、種類の重複を避けて置く。同じ物は 40 マス以内に
  置かない、などの距離制限をつける。
- check_world.ts で、この指標を出せるようにする。

### C. 手作りの小さな場面を差し込む (1-4、RDR2 の手作り、Eastward)

ノイズと散らしだけでなく、10×10 程度の**物語のある小さな場面**を何十種類か
作り、草地に差し込む。素材は今あるもので足りる。

- 倒れた荷車とこぼれたりんご。うさぎが集まり、狐が近くの茂みにいる
- ひっくり返った舟と、魚をくわえた猫
- 誰かの野営の跡: 消えた焚き火と、読める手紙 1 通
- カラスの溜め場: 光るコインが集めてあり、近づくとカラスが騒ぐ
- 石を丸く並べた中で眠る羊

minipuzzles.ts の MAKERS と同じ形で、場面を作る関数を並べる。好き・怖いの
仕組みとつながるように置くと、通りかかったときに勝手に何かが起きる。

### D. 生き物どうしの出来事を増やし、遠くから見せる (1-4)

- 好きを持たない羊・カラス・鶏に好きを足す (2 回目の案 2)。カラスはコイン、
  羊は茂み、鶏は種。
- 生き物が、プレイヤーがいなくても好き・怖いで動き合うことを確かめる。
  通りかかったら、狐がうさぎを追っている最中、という場面に出会えるように。
- 出来事を遠くから見えるようにする。カラスの群れが飛び立つ、蜂が渦を巻く、
  などの効果を画面の端の方向に出す。

### E. 道案内の生き物と風 (1-1、Ghost of Tsushima)

- 噂を聞いたら、**その方角へ落ち葉が流れる**効果を数秒出す。風の代わりに
  なる。噂の仕組み (方角と距離) はもうあるので、向きを渡すだけで済む。
- 石碑の近くには、ついていくと次の石碑へ連れていく鳥 (`bird` のアクターは ある)
  を置く。
- **E-1 (作った, model/leaf-wind.ts)**: 「落ち葉はときどき、最後に聞いた場所
  の方へ流れる」。最後に聞いた噂の場所を 1 つ覚え (セーブにも残る)、聞いた
  直後の 4 秒は葉が流れ、そのあとは歩いていると近いほど短い間隔 (8〜30 秒)
  で数枚流れる。10 マス以内に着くと忘れて止まる。葉は `lime2`・`brown2`・
  `lime3` の 1〜2 ピクセルで地面の上に描く。
- **E-2 は作った** (model/waystone.ts の `spawnLeadBird` と `leadBird`、
  model/oddities.ts の `BirdDelegate`)。石碑を起こすと鳥が飛び立ち、まだ
  眠っている一番近い石碑へ 10 マス飛んでは降りて待つ。4 マス以内に近づくと
  また飛ぶ。16 マスより離れて 5 秒たつと、あきらめて飛び去る。石碑に着くと
  もう一度待ち、近づくと飛び去る。全部起きていれば鳥は出ない。石碑の一覧は START
  島の石碑の間の門 (static/map/block_-10000.-10000.json) から読む。

### F. 名所を「画面の外から」引く (1-1 の上面図版)

上から見るゲームでは、BotW のように遠くの塔は見えない。代わりに次の手で
「向こうに何かある」を伝える。

- 名所から立ちのぼる煙・光の柱を、画面の端にも描く (画面外の方角に、短い
  縦線の効果)。
- 大きな地図に、名所を最初からシルエットで出す。行くと名前が出る。
- 区画と区画の間に、三角形の役をする「越えるか回るか」の丘や森の帯を置く。
  越えた所で名所が画面に入るように。

### G. 跳ぶことを移動の道具に (1-5、2 回目の案 1)

- 跳ぶと、茂み 1 マス・柵・幅 1 の水路・小さな生き物を越えられる。
- 回り道を、跳べる所を探す遊びに変える。1 行のルールで済む。

### H. 同じ地図に時間の層を重ねる (1-3 のティアキン、No Man's Sky の天気)

- 昼と夜、または晴れと雨を足す。同じ灰色の平原が、夜は三日月 (moon-shell) が
  光って別の生き物が出る、雨の日は水たまりにカエルが出る、になる。
- 歩く場所は増やさずに、見え方と起きることを変えられる。費用は大きいが、
  地図を作り直さずに済む。

### I. 遠いお使いの見直しと、世界を縮める (1-7)

- お使いは距離に応じてコインが増えるので、長く退屈な道を歩くほど得をする。 AC
  Origins のように、お使いの行き先を隣の村くらいまでにする。または、
  遠いお使いの途中に寄り道の目印を出す。
- 島が 2800×2400 マスあるのは、内容に比べて広い。区画の数を減らすか、
  本道は安全で遠回り、道を外れると近いが森や崖や獣がいる、という作りにして、
  近道を選ぶ判断を作る。

## 4. 次の一手

単調な景色には **A (地域の顔)** と **C (手作りの場面)**、単純作業には **B
(初めての何かの間隔)** と **G (跳ぶ)** が、いちばん少ない手間で効きそう。 A と B
は生成器だけで済み、C は今ある素材の組み合わせで作れる。作ったら、 同じ 6
人の型でもう一度プレイテストし、「単純作業の少なさ」が 2 から動くかを 見る。

## 開けなかったサイト

DNS で解決できなかった: gmtk.substack.com、gigazine.net、 galaxykate0.tumblr.com
(Compton の原文)、news.xbox.com、s.famitsu.com、
cogconnected.com、pcgamesinsider.biz、tweaktown.com、muycomputer.com、
academia.edu、timeextension.com、superjumpmagazine.com、gamesbeat.com、
engadget.com、mobilesyrup.com、nintendo.co.uk、iwataasks.nintendo.com、
minecraft.wiki、tinysubversions.com。403: zeldadungeon.net、gamespot.com。 GDC
Vault の講演は会員限定で読めなかった。
