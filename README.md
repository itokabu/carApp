# 街クルマクイズ

日本の道でよく見る車を、最新の販売ランキングから出題するクイズと図鑑のサイト（PWA）。

- **ランキング**: 自販連（登録車）と全軽自協（軽自動車）が毎月公開する車名別の販売台数。直近2年の同じ期間（1月〜最新月）を合計して上位100車種を選ぶ
- **写真**: Wikipedia の各車種の記事にある世代ごとの表から、最新モデルの前・後ろの写真と、旧モデルの写真を取得する（Wikimedia Commons、作者とライセンスを表示）
- **自動更新**: GitHub Actions が毎月8日と20日に `npm run update` を実行し、変更があればコミットして GitHub Pages に公開する

## ローカルで動かす

```sh
npm install
npm run update   # データを取り直す（public/data/cars.json）
npm start        # http://localhost:3000
```

## 公開する（GitHub Pages）

1. GitHub に新しいリポジトリを作って push する
2. リポジトリの Settings → Pages → Source を「GitHub Actions」にする
3. Actions タブ →「データ更新と公開」→ Run workflow で初回の公開をする

以降は毎月自動で更新されます。

## 写真がおかしいとき

自動で正しい記事を当てられない車種は `data/overrides.json` で指定できます（キーは `メーカー|販売名`）。

```json
{
  "日産|フェアレディ": { "wiki": "日産・フェアレディZ", "name": "フェアレディZ" },
  "トヨタ|ピクシス": { "exclude": true }
}
```

- `wiki`: 使う Wikipedia の記事名
- `name`: 表示する車名
- `exclude`: 出題しない

更新時に `写真なし: …` と出た車種は、ここで記事名を指定すると写真が付きます。
