# List Move Plugin

Obsidian で行またはリスト項目ブロックを上下に移動するプラグインです。  
`Alt + ArrowUp` / `Alt + ArrowDown` で操作できます。

## 機能
- 単一行カーソル時:
  - 通常行は 1 行単位で上下移動
  - リスト行は同一階層のリストブロック単位で上下移動
- 複数行選択時:
  - 選択範囲を連続行ブロックとして上下移動

## 動作仕様
- リスト判定対象:
  - 箇条書き: `-`, `*`, `+`
  - 番号付き: `1.`, `1)` 形式
  - タスク: `- [ ]`, `- [x]` 形式
- ネスト判定:
  - インデント（タブは 4 スペース換算）で階層を判定
- ブロック移動:
  - 同一インデントの兄弟項目のみを入れ替え対象とする
  - ブロック間に非空行がある場合は移動しない

## インストール（開発環境）
1. このフォルダを Obsidian Vault の `.obsidian/plugins/list-move-plugin` に配置する
2. `manifest.json` と `main.js` が存在することを確認する
3. Obsidian の `設定 > コミュニティプラグイン` で有効化する

## 開発メモ
- メイン実装: `/Users/donadona/Desktop/doc/.obsidian/plugins/list-move-plugin/main.js`
- メタ情報: `/Users/donadona/Desktop/doc/.obsidian/plugins/list-move-plugin/manifest.json`
- コマンドID:
  - `move-list-up`
  - `move-list-down`

## 制限事項
- 現状は設定画面を持たない（ホットキーはコマンド側で変更可能）
- デスクトップ/モバイルの可否は Obsidian 本体のホットキー挙動に依存する
