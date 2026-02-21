# AGENTS.md

## 目的
このリポジトリは Obsidian プラグイン `list-move-plugin` を管理します。  
エージェントは変更時に既存挙動を壊さず、最小差分で修正してください。

## 対象
- メイン実装: `/Users/donadona/Desktop/doc/.obsidian/plugins/list-move-plugin/main.js`
- メタ情報: `/Users/donadona/Desktop/doc/.obsidian/plugins/list-move-plugin/manifest.json`

## 実装ルール
- Node/CommonJS スタイル（`require` / `module.exports`）を維持する。
- 既存ホットキー仕様（`Alt + ArrowUp/ArrowDown`）を変更しない。
- 複数行選択時は「連続行の移動」を優先する現仕様を維持する。
- リスト行単体時は「同一インデント階層のブロック移動」を優先する。
- 挙動変更を伴う場合は README の仕様セクションを同時に更新する。

## 変更時チェックリスト
- `manifest.json` の `id` / `name` / `minAppVersion` の整合性を確認する。
- 境界ケースを確認する。
  - 先頭行を上へ移動しないこと
  - 末尾行を下へ移動しないこと
  - リストブロック間に非空行がある場合はブロック移動しないこと
- エラーが出ないことを Obsidian 上で手動確認する。

## コミット方針
- 1コミット1主題で作成する。
- コミットメッセージは日本語 Conventional Commits 風にする。
  - 例: `fix(plugin): ネストしたリスト移動の境界判定を修正する`
