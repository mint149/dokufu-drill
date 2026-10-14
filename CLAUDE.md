# CLAUDE.md

## プロジェクト概要

ピアノ学習者向けの読譜トレーニング Web アプリ。主な利用環境は Android スマホの Chrome。
通勤中などのすき間時間に、片手で鍵盤をタップして練習する使い方を想定している。

## 現状の構成

- `index.html` 1 ファイルに HTML / CSS / JS をすべて含む。ビルド工程なし。
- 五線譜は SVG を手書きで描画。音部記号・変化記号は Noto Music フォント（Google Fonts）のグリフ。
- 音は Web Audio API で合成（外部音源なし）。
- 設定・記録は localStorage キー `dokufu.v1` に保存。形式を変えるときは移行処理を入れるか、キーのバージョンを上げる。

## 公開とバージョン

- GitHub Pages に Actions で公開する。`.github/build-site.sh` がトップ（最新の `v*` タグ）・`/vX.Y.Z/`（各タグ）・`/next/`（main）を組み立てる。
- `main` への push は `/next/` だけに反映される。リリースは `vX.Y.Z` タグの push で行う。
- 表示中のバージョンは `<meta name="app-version">` で、公開時にスクリプトが書き換える（ローカルでは `dev`）。
- localStorage は全バージョンで共有される。古いリリースが新しい形式のデータで壊れないようにする。

## 実装上の約束

- 鍵盤の判定は pointerup で行う。pointerdown の時点で判定すると、横スクロールしようとしたタップが誤答扱いになるため。
- 色はすべて `:root` の CSS 変数で定義し、ライト／ダークの両方を用意する。
- スマホ幅（約 400px）で横にはみ出さないこと。セーフエリア（`env(safe-area-inset-*)`）を考慮する。
- UI の文言は日本語。

## 今後の方向性

- 複数音・フレーズの出題、BPM 指定でのタイミング判定
- 機能が増えてきたら、Vite などを使ってファイルを分割する。楽譜描画には VexFlow や OpenSheetMusicDisplay も検討する
- 判定ロジック（音高・タイミング）は UI から切り離して、単体テストを書く
