# CLAUDE.md

## プロジェクト概要

ピアノ学習者向けの読譜トレーニング Web アプリ。主な利用環境は Android スマホの Chrome。
通勤中などのすき間時間に、片手で鍵盤をタップして練習する使い方を想定している。

## 現状の構成

- Vite でビルドする静的サイト。`index.html` はマークアップだけで、CSS と JS は `src/` にある。
  - `theory.js`：音符のモデル、出題範囲、出題の選び方（純粋関数）
  - `judge.js`：正誤判定とセッションの集計（純粋関数）
  - `staff.js`：五線譜の描画 / `keyboard.js`：画面の鍵盤 / `audio.js`：合成音と振動
  - `midi-input.js`：電子ピアノからの入力（Web MIDI） / `store.js`：設定と記録 / `version.js`：表示バージョン
  - `main.js`：画面の流れ（出題、モード、設定・記録のシート）
- 五線譜は SVG を手書きで描画。音部記号・変化記号は Noto Music フォント（Google Fonts）のグリフ。
- 音は Web Audio API で合成（外部音源なし）。
- 設定・記録は localStorage キー `dokufu.v1` に保存。形式を変えるときは移行処理を入れるか、キーのバージョンを上げる。

## 開発

- `npm run dev`：開発サーバー / `npm test`：単体テスト（Vitest） / `npm run build`：`dist/` にビルド
- 判定や音楽理論のロジックは DOM に触れない純粋関数として `theory.js`・`judge.js` などに置き、`*.test.js` でテストする。
- 段階的な計画は `docs/ROADMAP.md` にある。

## 公開とバージョン

- GitHub Pages に Actions で公開する。`.github/build-site.sh` がトップ（最新の `v*` タグ）・`/vX.Y.Z/`（各タグ）・`/next/`（main）を組み立てる。
- 各バージョンはその時点のコードでビルドする（`package.json` があればビルドして `dist/` を公開、ない v0.0.x はファイルをそのまま公開）。テストが失敗すると公開しない。
- `main` への push は `/next/` だけに反映される。リリースは `vX.Y.Z` タグの push で行う。
- 表示中のバージョンは `<meta name="app-version">` で、公開時にスクリプトが書き換える（ローカルでは `dev`）。
- localStorage は全バージョンで共有される。古いリリースが新しい形式のデータで壊れないようにする。

## 実装上の約束

- 鍵盤の判定は pointerup で行う。pointerdown の時点で判定すると、横スクロールしようとしたタップが誤答扱いになるため。
- 色はすべて `:root` の CSS 変数で定義し、ライト／ダークの両方を用意する。
- スマホ幅（約 400px）で横にはみ出さないこと。セーフエリア（`env(safe-area-inset-*)`）を考慮する。
- UI の文言は日本語。

## 今後の方向性

`docs/ROADMAP.md` を参照。最終目標は、MIDI ファイルの全体または区間を指定 BPM で弾き、和音を含めて正確さを判定すること。
