# マップと部屋の呼び名

画面の左下に、いまいる場所が小さく出る。

```
B1F-R3 40,105
```

- `B1F`: マップ (ブロック) の名前。名前のないマップはブロック ID (`0.200`
  など、`static/map/block_0.200.json` の `0.200`) が出る
- `R3`: 部屋の名前。部屋の外 (廊下など) では出ない
- `40,105`: ブロック内の座標。生成スクリプト (`tools/generate_*.ts`) の
  `rect(...)` や `prop(...)` に書く座標と同じ

場所の話をするときは、この表示をそのまま伝えればよい。

## マップの名前

| 名前    | ファイル                   | 生成スクリプト                      |
| ------- | -------------------------- | ----------------------------------- |
| `START` | `block_-10000.-10000.json` | (手作業、各スクリプトが一部を更新)  |
| `B1F`   | `block_-400.400.json`      | `tools/generate_puzzle_dungeon.ts`  |
| `B2F`   | `block_200.400.json`       | `tools/generate_puzzle_dungeon2.ts` |
| `B3F`   | `block_400.400.json`       | `tools/generate_puzzle_dungeon3.ts` |
| `B4F`   | `block_400.200.json`       | `tools/generate_puzzle_dungeon4.ts` |
| `ZOO`   | `block_10000.10000.json`   | `tools/generate_preview_zoo.ts`     |
| `DEBUG` | `block_10000.-10000.json`  | `tools/generate_debug_map.ts`       |

地上のマップ (`block_0.0.json` など) には名前がなく、ブロック ID が出る。

## 部屋の名前

| マップ | 部屋                                                      |
| ------ | --------------------------------------------------------- |
| `B1F`  | `PLAZA` `ANNEX` `R1`〜`R7` `R8` (`R8A`〜`R8G`) `VAULT`    |
| `B2F`  | `PLAZA` `S1`〜`S6` `VAULT`                                |
| `B3F`  | `PLAZA` `T1`〜`T10`                                       |
| `B4F`  | `PLAZA` `K1`〜`K5`                                        |
| `ZOO`  | `CELLS` `ITEMS` `PROPS` `GATES` `ACTORS` `COMBOS` `WALLS` |

各部屋の中身は、それぞれの生成スクリプトの先頭のコメントに一覧がある。

## 部屋を追加・変更するとき

生成スクリプトで `room(id, x0, y0, x1, y1)` を宣言する (座標は `rect` と
同じくブロック内で、両端を含む)。部屋は入れ子にしてよく、重なった場所では
小さい部屋の名前が出る (`R8` の中の `R8A` など)。宣言はブロックの JSON の `name`
と `rooms` に書き出される (`tools/rooms.ts`)。
