# 予定表（tadashi-calendar）

父の iPhone 用の、文字が大きく見やすいカレンダーのアプリです。
有料化されない自前のアプリとして作りました。予定は **Google カレンダー**に保存し、通知は Google カレンダーのアプリから届きます。

- 月・週・日・一覧の表示、祝日・六曜、繰り返し、通知の設定
- よく使う予定、持ち物のチェック、車での移動時間（高速あり・なし）と「出発の目安」、天気予報
- 文字の大きさ 5 段階、色のテーマ 6 種類、UD フォント
- 入力しても画面が拡大されない（指で広げる拡大はできる）、キーボードが出ても入力中の文字が見える
- 毎回のログインなし（合言葉で Google 側とつながる）、電波がなくても見られる
- 予定の時刻は入力したまま。「出発の目安」は別に表示するだけ

設置のしかたは **[手順書（家族向け）](docs/setup-guide.md)** を見てください。

## 構成

```
iPhone（ホーム画面のアプリ = PWA）
  app/ … 画面。GitHub Pages から配る。ビルドなしの JavaScript（ES modules）
    │  合言葉付きの POST（JSON）
    ▼
Google Apps Script（父のアカウントで動くウェブアプリ）
  gas/src → gas/dist/Code.gs
    ├─ Google カレンダー（予定の置き場所）
    ├─ 地図の機能（移動時間・場所の候補。1 日の回数に上限）
    └─ スプレッドシート（設定と、毎晩の控え）

天気予報: Open-Meteo（ブラウザから直接。1 時間の保存と 1 日の回数の上限あり）
地図の絵: 国土地理院（設定で OpenStreetMap にも切り替え可）
```

| 場所 | 中身 |
|---|---|
| `app/js/` | 日付・祝日・六曜・繰り返し・通知・出発の目安などの計算、端末への保存、送り直し |
| `app/js/ui/` | 画面（月・週・日・一覧・予定・入力・地図で探す・検索・設定・初めの設定） |
| `app/sw.js` | 電波がなくても開けるための保存係（Service Worker） |
| `gas/src/` | Google 側のプログラム（合言葉・予定の中継・地図・設定・控え） |
| `tests/` | 計算のテスト（`unit`）、Google 側のテスト（`gas`）、画面のテスト（`e2e`、iPhone の大きさで動かす） |
| `docs/` | 手順書、設計書、作業計画 |

## 開発

Node.js 22 を使います。

```sh
npm ci
npm test            # 計算と Google 側のテスト（日本以外の時間帯で動かして、日本時間の計算を確かめる）
npm run test:e2e    # 画面のテスト（Playwright の Chromium）
npm run test:all    # 両方
npm run serve       # http://127.0.0.1:8080/ で app/ を開く（「お試し」で見本の予定を触れる）
npm run build:gas   # gas/src から gas/dist/Code.gs を作る（Apps Script に貼るファイル）
```

部品を作り直すとき:

```sh
npm run copy-vendor # Leaflet（地図）を app/vendor に写す
npm run copy-fonts  # BIZ UDPゴシックを app/fonts に写す
npm run make-icons  # ホーム画面のアイコンを app/icons に作る
```

- `app/` の部品を足したり消したりしたら、`app/sw.js` の `PRECACHE` も直します（テストが教えてくれます）。
- 版を上げるときは `app/js/config.js` の `APP_VERSION` と `app/sw.js` の `VERSION` をそろえます。
- Google 側の作りを変えたら `gas/src/00_config.js` の `API_VERSION` を上げ、`app/js/main.js` の `REQUIRED_GAS_VERSION` もそろえます。

## 公開

`main` に入れると、GitHub Actions（`.github/workflows/pages.yml`）がテストを通してから `app/` を GitHub Pages に公開します。
公開のたびに `app/sw.js` の `BUILD` がコミットの印に書き換わるので、iPhone のアプリは次に開いたときに新しい版に切り替わります。

**父の予定・住所・合言葉・Google 側の URL は、このリポジトリに入れないでください**（公開リポジトリです）。
引っ越し用の取り込みファイル（.json）も同じです。

## 使わせてもらっているもの

- 天気予報: [Open-Meteo](https://open-meteo.com/)（CC BY 4.0、非商用の無料枠）
- 地図: [Leaflet](https://leafletjs.com/)（BSD-2-Clause）、[地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)、[OpenStreetMap](https://www.openstreetmap.org/copyright)
- 文字: [BIZ UDPゴシック](https://github.com/googlefonts/morisawa-biz-ud-gothic)（SIL Open Font License 1.1、`app/fonts/OFL.txt`）
