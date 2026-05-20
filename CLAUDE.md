# Shell — プロジェクトコンテキスト

このファイルは Claude Code 向けのプロジェクトオンボーディング情報。新しいセッションが
始まったときにまず読み、現状の設計・制約・進捗を把握するために使う。

## プロジェクトの概要

OverTheWire の **Bandit** ウォーゲームに着想を得た、日本語の Linux 学習サイト。
営利企業の社員教育用途で運用される。35 のレベルを通じて、ターミナル未経験者が
Linux コマンドの感覚をブラウザ上で身につけられるようにする。

サイト名（暫定）: **Shell** — サブタイトル「ターミナルで、Linuxを身につける。」

## 重要な制約・方針

### ライセンス（最重要）
原典 Bandit は **CC BY-NC-SA 4.0**（非商用限定）。本プロジェクトは営利目的のため、
原文の翻訳・翻案は不可。**シナリオ・問題文・解説はすべて独自に新規執筆する**。
Bandit を参照していいのは「各レベルが扱う技術テーマ」のみ。

### 技術スタック
- **純粋な HTML / CSS / JS のみ**。ビルドツールやフレームワークは使わない。
- 全てのデータ・モジュールは `<script>` で読み込み、グローバル変数 (`window.X`) で
  公開する。`fetch` ベースだと `file://` で動かないため避ける。
- デプロイ先想定: GitHub Pages / Netlify / Vercel。Node.js は不要。

### デザイン
- Apple 風ダークモード固定（`tokens.css` の CSS 変数）
- 「AI っぽい」見た目を避ける。絵文字は使わない。
- ターミナルは macOS Terminal 風（信号機ヘッダー、bash 風配色のプロンプト）

### 進捗保存
- 通常: `localStorage` の `shell:progress:v1` に自動保存
- 設定ページから JSON エクスポート/インポート/リセット（端末横断・バックアップ用）
- プライベートブラウジング等では自動的にメモリ内フォールバック + バナー警告
- すべてのキーは `shell:` プレフィックス（GitHub Pages の同一オリジンで他プロジェクトと
  混ざらないため）

## ファイル構成

```
.
├── index.html              トップ。35レベルカードグリッド + 進捗バー
├── level.html              レベルページ。?l=N で内容を切り替える共通テンプレ
├── cheatsheet.html         Linux コマンド辞典 (106 コマンド + 検索)
├── settings.html           進捗エクスポート/インポート/リセット
├── about.html              クレジット・ライセンス・免責
├── README.md               セットアップとデプロイ手順
├── CLAUDE.md               このファイル
└── assets/
    ├── css/
    │   ├── tokens.css      デザイン変数 (色/タイポ/余白/モーション)
    │   ├── base.css        リセット + 共通レイアウト
    │   ├── components.css  ナビ/ボタン/カード/コードブロック/ヒーロー
    │   ├── pages.css       ページ別調整
    │   └── terminal.css    ターミナル + レベルページレイアウト
    ├── js/
    │   ├── progress.js     ハイブリッド進捗保存 + JSONエクスポート/インポート
    │   ├── app.js          ナビ/トースト/カード hover
    │   ├── copy.js         コードブロックのコピーボタン (ANSI escape は無関係)
    │   ├── search.js       チートシート検索・カテゴリ絞り込み
    │   ├── level.js        レベルページの描画とパスワード検証
    │   └── terminal/
    │       ├── vfs.js          仮想ファイルシステム (dir/file/symlink, perm, glob, find)
    │       ├── parser.js       シェル風パーサ (パイプ/リダイレクト/クォート/$展開)
    │       ├── shell.js        メインループ・コマンドレジストリ
    │       ├── commands.js     35のコマンド実装 (ls cat grep find ...)
    │       └── ui.js           ターミナル UI (入力/履歴/Tab補完/ANSI色)
    └── data/
        ├── levels.js       全35レベルのメタ (title, theme)
        ├── level-data.js   レベル詳細 (story, hints, approach, password, fs spec) ※現在 0〜10 まで執筆済み
        └── commands.js     チートシート用 106コマンドデータ
```

## 進捗状況 (フェーズ別)

| フェーズ | 内容 | 状態 |
|---|---|:---:|
| 1 | 骨格 (デザインシステム / index / about / settings / 進捗保存) | ✅ |
| 2 | チートシート (106 コマンド + 検索 + 絞り込み + コピー) | ✅ |
| 3 | 仮想ターミナル本体 (VFS / パーサ / 35コマンド / UI / ANSI色) | ✅ |
| 4 | レベル統合 (level.html + パスワード検証) | ✅ |
| 5a | レベル 0〜3 の詳細・仮想ファイルシステム執筆 + 通しテスト | ✅ |
| 5b1 | レベル 4〜10 の詳細・仮想ファイルシステム執筆 + 通しテスト | ✅ |
| 5b2 | レベル 11〜34 の詳細・仮想ファイルシステム執筆 | 未着手 |
| 5c | 上位レベル用の追加コマンド (gzip/bzip2/tar/openssl/git 擬似 等) | 未着手 |
| 6 | 仕上げ (a11y / レスポンシブ / アニメーション微調整) | 未着手 |

## 既知の良好な動作 (検証済み)

最後の通しトレース日: 2026-04-25 (フェーズ5b1 完了 + 批判レビューでバグ修正)

### 批判レビューで発見・修正したバグ
1. **parser**: 改行文字 (`\n`/`\r`) を SEMI として扱う (複数行ペースト対応)
2. **parser**: `$?` (直前の終了コード) 展開を特例で実装 (outer regex は `?` を許可するが inner regex が `[A-Za-z0-9_]` のみで name が空になっていた)
3. **commands.xxd -r**: hex 列の最初の空白から ASCII 表示を捨てる正規表現を `\s+` から `\s{2,}` に。hex 内の単一空白を保持
4. **shell.expandGlobsForArgs**: glob 検出正規表現に `[` を含めて vfs.glob と整合
5. **commands.file**: 0x7F 超を含むファイルを UTF-8 Unicode text として判別
6. **commands.clear**: 実際には画面を消去していなかった (clearScreen フラグが shell.run で消失)。ANSI CSI 2J を出力し ui.print で拾う方式に変更
7. **shell.cd**: `cd -` で OLDPWD に戻る挙動を追加
8. **ui._tabComplete**: 入力済みのバックスラッシュエスケープ (例 `cat hidden\ wo`) を考慮して prefix を抽出 (extractLastWord)
9. **terminal.css**: caret 点滅アニメが `steps(1)` で機能していなかった (実質常時表示) → `step-end` に
10. **Level 4 content**: file07 を純 ASCII にしてレッスン文 "ASCII text" と一致させた (旧: 日本語混じりで UTF-8 判定になっていた)

- **Level 0** (`pwd` / `ls` / `cat readme`): OK
- **Level 1** (ハイフン名): `cat -` は stdin 解釈で空、`cat ./-` / `cat /home/bandit1/-` /
  `cat < ./-` で正解。Tab補完は `cat ./` で `./-` を提示。
- **Level 2** (空白入り名): `cat 'hidden words inside.txt'` / バックスラッシュ /
  Tab補完 (自動エスケープ) で正解。
- **Level 3** (隠しファイル): `cd inhere; ls -a; cat .note` で正解。
- **Level 4** (file 判定): `cd inhere; file ./*` で file07 のみ "ASCII text" → cat。
- **Level 5** (find -size): `find inhere -type f -size 32c` で1ファイル特定 → cat。
- **Level 6** (find -user -group): `find / -user bandit7 -group bandit6 -size 35c` で
  ホーム外のターゲットを発見。group メンバーシップで読み取り可能 (mode 0o640)。
- **Level 7** (grep): `grep millionth data.txt` で1行ヒット (ten-/hundred-millionth は
  混乱回避のため意図的にデータから除外)。
- **Level 8** (sort | uniq -u): `sort data.txt | uniq -u` で唯一の非重複行が浮かぶ。
- **Level 9** (strings | grep): `strings data.txt | grep =` で === マーカーで囲まれた
  パスワード文字列を抽出。
- **Level 10** (base64 -d): `base64 -d data.txt` で復号。base64 文字列は PowerShell の
  Convert.ToBase64String で生成し往復検証済み。

## 仮想ターミナルの仕様 (要点)

### 仮想ファイルシステム (`vfs.js`)
- ノード: `{ type, name, owner, group, mode, mtime, content?|children?|target? }`
- パス解決: 絶対 / 相対 / `..` / `.` / `~`
- glob: `*` `?` `[]`
- パーミッションチェック: `canRead` `canWrite` `canExecute` (root はバイパス)

### パーサ (`parser.js`)
- パイプ `|`、リダイレクト `>` `>>` `<`、クォート `'` `"` `\`
- 変数展開 `$VAR` `${VAR}` `~`、コマンド置換 `$(...)` 簡易
- 接続 `;` `&&` `||`、末尾の `&` はフォアグラウンド扱い

### コマンドの規約 (`commands.js`)
コマンドは以下の形:
```js
name: {
  description: "...",
  run(ctx) { return { stdout, stderr, exitCode } }  // async でも OK
}
```
`ctx`: `{ shell, vfs, env, stdin, args, isTTY }`

`isTTY` はパイプ末尾かつ出力リダイレクトなしのときだけ true。色付き出力等の判断に使う。

### UI (`ui.js`)
- ANSI エスケープ (`\x1b[1;34m` 等) を解釈して `<span style="color:...">` に変換
- 色付きプロンプト (緑 user@host / 青 path / 白 `$`)
- Tab補完はコマンド名 + パス。**ファイル名内の特殊文字 (空白・記号) は自動でバックスラッシュエスケープ**
- フォーカス時のページスクロールは `preventScroll: true` で抑止
- `resize: vertical` でユーザーが縦サイズを手動調整可能 (初期 480px)

## 開発・テストの作法

### 確認の徹底
- **コードを書いて完了で済ませない。**
  ユーザーは過去に「実際に解いたか？」と確認することを徹底するよう要望している。
  各レベル変更後は必ず以下を実施:
    1. 想定解で正解パスワードに到達できるか、コードを追って検証
    2. 想定外の楽な解（バグ）がないか確認
    3. シナリオ文・ヒントと実装の挙動が食い違っていないか照合
- 通しトレースした内容は、ユーザーへの報告に明示的に書く。

### 動作確認
ローカル: `python -m http.server 8000` して http://localhost:8000/ で確認。
GitHub Pages 等にデプロイ後は実環境でも一度通しで動かす。

### Lint / 型チェック
TypeScript 検査の hint (例: `clipboardData` の型エラー、`unescape` 非推奨) は無視。
これらは標準のブラウザ API でランタイムに影響しない。

## メモリ参照

ユーザー・プロジェクトに関する追加メモリは
`C:\Users\hirakata-miniPC2\.claude\projects\g------------------bandit\memory\`
にも保存されている (license, design, tech, project_overview)。

## 計画ファイル

`C:\Users\hirakata-miniPC2\.claude\plans\https-overthewire-org-wargames-bandit-b-iterative-quilt.md`
に最新の実装計画と検証項目が書かれている。重要な意思決定はそこにアドホック追記する。

## 次にやること候補

短期 (次セッションで実装可能):
- Level 11 (ROT13 / `tr`) の詳細執筆 — `tr` は実装済み
- Level 12 (圧縮の入れ子) — `xxd` 実装済み、`gzip`/`bzip2`/`tar` を仮想化する必要
- Level 13 (SSH 鍵認証) の擬似実装

中期:
- Level 14〜20 (nc / openssl / setuid / リバースシェル) の擬似実装
- 上位コマンド (`gzip`/`bzip2`/`tar` の擬似実装、`openssl s_client` 擬似)

長期:
- Level 21〜34 (cron / vim escape / git) の擬似化
- a11y / モバイル UX の最終調整
- README にデプロイ手順詳細
