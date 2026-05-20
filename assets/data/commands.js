/* =========================================================
   commands.js — Linux コマンドチートシート（90+件）
   各エントリ: { name, category, summary, synopsis, options, examples, tips?, related? }
   ========================================================= */

window.COMMAND_CATEGORIES = [
  "ファイル操作",
  "テキスト処理",
  "検索",
  "圧縮・アーカイブ",
  "ネットワーク",
  "プロセス・ジョブ",
  "権限・所有権",
  "システム情報",
  "シェル基礎",
  "その他"
];

window.COMMANDS = [

  /* ===== ファイル操作 ===== */
  {
    name: "ls", category: "ファイル操作",
    summary: "ディレクトリの中身を一覧表示する。最も基本のコマンド。",
    synopsis: "ls [オプション] [パス...]",
    options: [
      { flag: "-l", desc: "詳細形式（パーミッション・所有者・サイズ・更新日時）" },
      { flag: "-a", desc: "隠しファイル（.で始まる）も表示" },
      { flag: "-h", desc: "サイズを KB / MB の形で読みやすく" },
      { flag: "-t", desc: "更新日時の新しい順" },
      { flag: "-r", desc: "並びを逆にする" },
      { flag: "-R", desc: "サブディレクトリも再帰的に表示" }
    ],
    examples: [
      { cmd: "ls -la", desc: "詳細＋隠しファイル含む（最頻出の組み合わせ）" },
      { cmd: "ls -lh /var/log", desc: "/var/log の中身を読みやすいサイズで表示" }
    ],
    tips: "Tab キーでファイル名補完が効く。困ったらまず ls から。",
    related: ["cd", "pwd", "find", "tree"]
  },
  {
    name: "cd", category: "ファイル操作",
    summary: "カレントディレクトリ（今いる場所）を移動する。",
    synopsis: "cd [パス]",
    options: [
      { flag: "(なし)", desc: "ホームディレクトリに戻る" },
      { flag: "-",     desc: "直前にいた場所に戻る" },
      { flag: "..",    desc: "一つ上のディレクトリへ" },
      { flag: "~",     desc: "ホームディレクトリ" }
    ],
    examples: [
      { cmd: "cd /tmp",   desc: "/tmp に移動" },
      { cmd: "cd ../../", desc: "二つ上のディレクトリへ" },
      { cmd: "cd -",      desc: "直前の場所に戻る（行ったり来たりに便利）" }
    ],
    related: ["pwd", "ls", "pushd"]
  },
  {
    name: "pwd", category: "ファイル操作",
    summary: "今いるディレクトリの絶対パスを表示する。",
    synopsis: "pwd",
    options: [],
    examples: [
      { cmd: "pwd", desc: "例: /home/user/projects/shell" }
    ],
    tips: "迷子になったらまず pwd。",
    related: ["cd", "ls"]
  },
  {
    name: "cp", category: "ファイル操作",
    summary: "ファイルやディレクトリをコピーする。",
    synopsis: "cp [オプション] コピー元 コピー先",
    options: [
      { flag: "-r", desc: "ディレクトリを再帰的にコピー" },
      { flag: "-i", desc: "上書き前に確認する" },
      { flag: "-p", desc: "更新日時・パーミッションを保つ" },
      { flag: "-v", desc: "コピーした内容を表示" }
    ],
    examples: [
      { cmd: "cp a.txt b.txt",        desc: "a.txt を b.txt として複製" },
      { cmd: "cp -r src/ backup/",    desc: "ディレクトリ src を backup の中に再帰コピー" }
    ],
    related: ["mv", "rsync"]
  },
  {
    name: "mv", category: "ファイル操作",
    summary: "ファイルやディレクトリを移動・改名する。",
    synopsis: "mv [オプション] 元 先",
    options: [
      { flag: "-i", desc: "上書き前に確認" },
      { flag: "-n", desc: "既存ファイルがあれば上書きしない" },
      { flag: "-v", desc: "実行内容を表示" }
    ],
    examples: [
      { cmd: "mv old.txt new.txt", desc: "ファイルを改名" },
      { cmd: "mv *.log /var/log/",  desc: "全ログを /var/log/ に移動" }
    ],
    related: ["cp", "rename"]
  },
  {
    name: "rm", category: "ファイル操作",
    summary: "ファイルやディレクトリを削除する。元に戻せないので注意。",
    synopsis: "rm [オプション] パス...",
    options: [
      { flag: "-r", desc: "ディレクトリを中身ごと削除" },
      { flag: "-f", desc: "確認せず強制的に削除" },
      { flag: "-i", desc: "1件ずつ確認" },
      { flag: "-v", desc: "削除したファイルを表示" }
    ],
    examples: [
      { cmd: "rm a.txt",      desc: "ファイルを1つ削除" },
      { cmd: "rm -ri old/",   desc: "ディレクトリを中身ごと、確認しながら削除" }
    ],
    tips: "rm -rf / のような操作は絶対に実行しない。一度消したファイルは戻ってこない。",
    related: ["rmdir", "trash"]
  },
  {
    name: "mkdir", category: "ファイル操作",
    summary: "ディレクトリを新規作成する。",
    synopsis: "mkdir [オプション] ディレクトリ名...",
    options: [
      { flag: "-p", desc: "親ディレクトリも必要なら一緒に作る" },
      { flag: "-m", desc: "パーミッションを指定" },
      { flag: "-v", desc: "作成したパスを表示" }
    ],
    examples: [
      { cmd: "mkdir docs",                    desc: "docs を作る" },
      { cmd: "mkdir -p path/to/deep/dir",     desc: "存在しない親も含めて一気に作る" }
    ],
    related: ["rmdir", "rm"]
  },
  {
    name: "rmdir", category: "ファイル操作",
    summary: "空のディレクトリを削除する。中身がある場合は失敗する（安全）。",
    synopsis: "rmdir [オプション] ディレクトリ",
    options: [
      { flag: "-p", desc: "親ディレクトリも空なら一緒に消す" }
    ],
    examples: [
      { cmd: "rmdir empty_dir", desc: "空ディレクトリを削除" }
    ],
    tips: "中身ごと消したいなら rm -r を使う。",
    related: ["rm", "mkdir"]
  },
  {
    name: "touch", category: "ファイル操作",
    summary: "空のファイルを作る。または既存ファイルの更新日時を現在時刻にする。",
    synopsis: "touch [オプション] ファイル...",
    options: [
      { flag: "-a", desc: "アクセス時刻のみ更新" },
      { flag: "-m", desc: "更新時刻のみ更新" },
      { flag: "-t", desc: "指定した日時に設定（YYYYMMDDhhmm）" }
    ],
    examples: [
      { cmd: "touch new.txt",                        desc: "空のファイルを作成" },
      { cmd: "touch -t 202501010000 file.txt",       desc: "更新日時を 2025-01-01 00:00 に変更" }
    ],
    related: ["stat", "ls"]
  },
  {
    name: "ln", category: "ファイル操作",
    summary: "ファイルへのリンク（別名）を作る。シンボリックリンクが一般的。",
    synopsis: "ln [オプション] ターゲット リンク名",
    options: [
      { flag: "-s", desc: "シンボリックリンクを作る（実用ではほぼ常にこれ）" },
      { flag: "-f", desc: "リンク名が既存なら上書き" },
      { flag: "-v", desc: "作成内容を表示" }
    ],
    examples: [
      { cmd: "ln -s /usr/local/bin/node ~/bin/node", desc: "node コマンドへのショートカットを作成" }
    ],
    tips: "Windows のショートカットに似た仕組み。実体ではなく目印。",
    related: ["readlink", "ls"]
  },
  {
    name: "file", category: "ファイル操作",
    summary: "ファイルの種類を中身を見て判別する（拡張子に頼らない）。",
    synopsis: "file [オプション] ファイル...",
    options: [
      { flag: "-b", desc: "ファイル名を出力に含めない" },
      { flag: "-i", desc: "MIME タイプ形式で表示" }
    ],
    examples: [
      { cmd: "file mystery",          desc: "拡張子のないファイルが何なのか調べる" },
      { cmd: "file *",                desc: "カレントディレクトリ全部の種類を一覧" }
    ],
    related: ["stat", "xxd"]
  },
  {
    name: "stat", category: "ファイル操作",
    summary: "ファイルの詳細情報（サイズ・所有者・タイムスタンプ等）を表示。",
    synopsis: "stat [オプション] ファイル",
    options: [
      { flag: "-c", desc: "出力フォーマットを指定" }
    ],
    examples: [
      { cmd: "stat /etc/passwd",          desc: "/etc/passwd の詳細を表示" },
      { cmd: "stat -c '%s %n' *.txt",     desc: "サイズとファイル名だけ" }
    ],
    related: ["ls", "file"]
  },
  {
    name: "du", category: "ファイル操作",
    summary: "ディレクトリやファイルがどれだけディスクを使っているか調べる。",
    synopsis: "du [オプション] [パス...]",
    options: [
      { flag: "-h", desc: "読みやすいサイズ表記（KB, MB, GB）" },
      { flag: "-s", desc: "合計のみ表示（中身は集計だけ）" },
      { flag: "-d", desc: "深さの上限（例: -d 1）" },
      { flag: "-a", desc: "ファイルも含めて表示" }
    ],
    examples: [
      { cmd: "du -sh *",     desc: "カレント直下の各ディレクトリ合計サイズ" },
      { cmd: "du -h -d 1",   desc: "1階層分だけ表示" }
    ],
    related: ["df", "ls"]
  },
  {
    name: "df", category: "ファイル操作",
    summary: "ファイルシステムごとのディスク使用量を表示。",
    synopsis: "df [オプション] [パス]",
    options: [
      { flag: "-h", desc: "読みやすい単位で表示" },
      { flag: "-T", desc: "ファイルシステムの種類も表示" },
      { flag: "-i", desc: "inode の使用状況を表示" }
    ],
    examples: [
      { cmd: "df -h",     desc: "全ファイルシステムの空き容量を一覧" }
    ],
    related: ["du", "lsblk"]
  },
  {
    name: "tree", category: "ファイル操作",
    summary: "ディレクトリ構造を木の形で表示する（要インストール）。",
    synopsis: "tree [オプション] [パス]",
    options: [
      { flag: "-L", desc: "表示する階層の深さ（例: -L 2）" },
      { flag: "-a", desc: "隠しファイルも表示" },
      { flag: "-d", desc: "ディレクトリのみ表示" }
    ],
    examples: [
      { cmd: "tree -L 2", desc: "2階層までを木構造で表示" }
    ],
    tips: "入っていないディストリも多い。なければ ls -R で代用できる。",
    related: ["ls", "find"]
  },

  /* ===== テキスト処理 ===== */
  {
    name: "cat", category: "テキスト処理",
    summary: "ファイルの中身をそのまま画面に出す。短いファイル向け。",
    synopsis: "cat [オプション] [ファイル...]",
    options: [
      { flag: "-n", desc: "行番号をつける" },
      { flag: "-A", desc: "改行・タブなどの制御文字を可視化" },
      { flag: "-s", desc: "連続した空行を1行に" }
    ],
    examples: [
      { cmd: "cat /etc/hostname",     desc: "ホスト名を表示" },
      { cmd: "cat a.txt b.txt > c.txt", desc: "2つを連結して新ファイルへ" }
    ],
    tips: "長いファイルでは画面が流れてしまうので less を使う。",
    related: ["less", "head", "tail"]
  },
  {
    name: "less", category: "テキスト処理",
    summary: "ファイルを1画面ずつスクロールしながら読むビューア。長いログ向け。",
    synopsis: "less [オプション] ファイル",
    options: [
      { flag: "-N", desc: "行番号を表示" },
      { flag: "+F", desc: "tail -f のように末尾を追従" }
    ],
    examples: [
      { cmd: "less /var/log/syslog", desc: "ログを開く" }
    ],
    tips: "操作: スペースで次画面、b で前画面、/word で検索、q で終了。",
    related: ["more", "cat", "tail"]
  },
  {
    name: "more", category: "テキスト処理",
    summary: "less の旧来版。1画面ずつ進む基本ビューア。",
    synopsis: "more ファイル",
    options: [],
    examples: [{ cmd: "more file.txt", desc: "1画面ずつ表示" }],
    tips: "今は less の方が機能が多い。困らなければ less でよい。",
    related: ["less", "cat"]
  },
  {
    name: "head", category: "テキスト処理",
    summary: "ファイルの先頭部分だけを表示。デフォルトは10行。",
    synopsis: "head [オプション] ファイル...",
    options: [
      { flag: "-n", desc: "表示する行数（例: -n 20）" },
      { flag: "-c", desc: "表示するバイト数" }
    ],
    examples: [
      { cmd: "head -n 5 /etc/passwd", desc: "先頭5行" }
    ],
    related: ["tail", "cat"]
  },
  {
    name: "tail", category: "テキスト処理",
    summary: "ファイルの末尾を表示。ログを追跡する -f が便利。",
    synopsis: "tail [オプション] ファイル",
    options: [
      { flag: "-n", desc: "表示する行数（-n +5 で5行目から末尾まで）" },
      { flag: "-f", desc: "ファイルが追記されるたびに表示し続ける" },
      { flag: "-F", desc: "-f に加え、ファイルが入れ替わっても追従" }
    ],
    examples: [
      { cmd: "tail -n 50 access.log", desc: "末尾50行" },
      { cmd: "tail -f /var/log/syslog", desc: "ログをリアルタイム監視" }
    ],
    related: ["head", "less"]
  },
  {
    name: "wc", category: "テキスト処理",
    summary: "行数・単語数・バイト数を数える（word count）。",
    synopsis: "wc [オプション] ファイル...",
    options: [
      { flag: "-l", desc: "行数のみ" },
      { flag: "-w", desc: "単語数のみ" },
      { flag: "-c", desc: "バイト数のみ" },
      { flag: "-m", desc: "文字数（マルチバイト対応）" }
    ],
    examples: [
      { cmd: "wc -l file.txt",        desc: "ファイルの行数" },
      { cmd: "ls | wc -l",            desc: "ディレクトリの中のファイル数" }
    ],
    related: ["awk"]
  },
  {
    name: "grep", category: "テキスト処理",
    summary: "テキストの中から、パターンに一致する行を抜き出す。",
    synopsis: "grep [オプション] パターン [ファイル...]",
    options: [
      { flag: "-i", desc: "大文字小文字を区別しない" },
      { flag: "-v", desc: "一致しない行を出す（反転）" },
      { flag: "-r", desc: "ディレクトリを再帰検索" },
      { flag: "-n", desc: "行番号も表示" },
      { flag: "-E", desc: "拡張正規表現（egrep と同じ）" },
      { flag: "-c", desc: "一致した行の件数だけ表示" },
      { flag: "-l", desc: "一致したファイル名だけ表示" }
    ],
    examples: [
      { cmd: "grep -rn 'TODO' src/",      desc: "src 以下の TODO を全部探す" },
      { cmd: "ps aux | grep nginx",       desc: "実行中の nginx プロセスを探す" }
    ],
    tips: "迷ったらまず grep。パイプの先で頻出。",
    related: ["egrep", "sed", "awk", "find"]
  },
  {
    name: "egrep", category: "テキスト処理",
    summary: "拡張正規表現を使う grep。grep -E と同じ。",
    synopsis: "egrep [オプション] パターン [ファイル...]",
    options: [],
    examples: [
      { cmd: "egrep '(error|warn)' app.log", desc: "error または warn を含む行" }
    ],
    related: ["grep"]
  },
  {
    name: "sort", category: "テキスト処理",
    summary: "行を並べ替える。",
    synopsis: "sort [オプション] [ファイル...]",
    options: [
      { flag: "-n", desc: "数値として比較" },
      { flag: "-r", desc: "降順" },
      { flag: "-u", desc: "重複を取り除く" },
      { flag: "-k", desc: "並べ替えに使う列を指定（例: -k 2）" },
      { flag: "-t", desc: "区切り文字を指定" }
    ],
    examples: [
      { cmd: "sort -n -r ages.txt",  desc: "数値の降順でソート" },
      { cmd: "sort -t: -k3 -n /etc/passwd", desc: "/etc/passwd を UID 順" }
    ],
    related: ["uniq"]
  },
  {
    name: "uniq", category: "テキスト処理",
    summary: "連続した重複行をまとめる（事前に sort が必要）。",
    synopsis: "uniq [オプション] [ファイル]",
    options: [
      { flag: "-c", desc: "各行の出現回数も表示" },
      { flag: "-d", desc: "重複している行のみ" },
      { flag: "-u", desc: "1回しか出ない行のみ" }
    ],
    examples: [
      { cmd: "sort access.log | uniq -c | sort -rn", desc: "件数の多い順ランキング" }
    ],
    related: ["sort"]
  },
  {
    name: "cut", category: "テキスト処理",
    summary: "各行から、指定した列だけを切り出す。",
    synopsis: "cut [オプション] [ファイル]",
    options: [
      { flag: "-d", desc: "区切り文字（デフォルトはタブ）" },
      { flag: "-f", desc: "切り出すフィールド番号" },
      { flag: "-c", desc: "文字の位置で切る（例: -c 1-10）" }
    ],
    examples: [
      { cmd: "cut -d: -f1 /etc/passwd",  desc: ": 区切りの1列目（ユーザー名一覧）" }
    ],
    related: ["awk", "sed"]
  },
  {
    name: "tr", category: "テキスト処理",
    summary: "標準入力の文字を1対1で置換・削除する。",
    synopsis: "tr [オプション] 集合1 [集合2]",
    options: [
      { flag: "-d", desc: "集合1の文字を削除" },
      { flag: "-s", desc: "連続した同じ文字を1つに" },
      { flag: "-c", desc: "集合1の補集合に対して動作" }
    ],
    examples: [
      { cmd: "echo hello | tr a-z A-Z",   desc: "小文字を大文字に" },
      { cmd: "tr -d ' ' < in.txt",        desc: "全ての空白を削除" }
    ],
    tips: "ROT13 は echo Hello | tr 'A-Za-z' 'N-ZA-Mn-za-m'",
    related: ["sed"]
  },
  {
    name: "sed", category: "テキスト処理",
    summary: "テキストをストリームのまま編集（最頻出は置換）。",
    synopsis: "sed [オプション] 'スクリプト' [ファイル]",
    options: [
      { flag: "-i", desc: "ファイルを直接書き換え（要注意）" },
      { flag: "-n", desc: "明示的に p 指定した行だけ表示" },
      { flag: "-e", desc: "複数のスクリプトを与える" }
    ],
    examples: [
      { cmd: "sed 's/old/new/g' file",        desc: "old を全て new に置換して表示" },
      { cmd: "sed -n '5,10p' file",           desc: "5〜10行目だけ表示" },
      { cmd: "sed -i.bak 's/foo/bar/g' a.txt", desc: "バックアップを取りつつ直接置換" }
    ],
    related: ["awk", "tr", "grep"]
  },
  {
    name: "awk", category: "テキスト処理",
    summary: "列ごとの集計や条件抽出に強いミニ言語。",
    synopsis: "awk 'パターン { アクション }' [ファイル]",
    options: [
      { flag: "-F", desc: "区切り文字" }
    ],
    examples: [
      { cmd: "awk '{print $1}' file",                    desc: "各行の1列目だけ" },
      { cmd: "awk -F: '$3>=1000 {print $1}' /etc/passwd", desc: "UID 1000以上のユーザー名" },
      { cmd: "awk '{s+=$1} END {print s}' nums.txt",      desc: "1列目の合計" }
    ],
    related: ["sed", "cut"]
  },
  {
    name: "paste", category: "テキスト処理",
    summary: "複数ファイルを横方向に結合する（行ごと）。",
    synopsis: "paste [オプション] ファイル...",
    options: [
      { flag: "-d", desc: "区切り文字を指定（既定はタブ）" },
      { flag: "-s", desc: "縦方向の内容を1行に" }
    ],
    examples: [
      { cmd: "paste names.txt scores.txt", desc: "2ファイルを左右に並べる" }
    ],
    related: ["cut", "join"]
  },
  {
    name: "tee", category: "テキスト処理",
    summary: "標準入力を画面とファイルの両方に出す。",
    synopsis: "tee [オプション] ファイル...",
    options: [
      { flag: "-a", desc: "ファイルに追記（既定は上書き）" }
    ],
    examples: [
      { cmd: "ls | tee list.txt",      desc: "結果を画面に出しつつ list.txt にも保存" },
      { cmd: "echo 1 | sudo tee /sys/.../on", desc: "sudo + リダイレクトの定番" }
    ],
    related: ["cat"]
  },
  {
    name: "rev", category: "テキスト処理",
    summary: "各行の文字を逆順にする。",
    synopsis: "rev [ファイル]",
    options: [],
    examples: [
      { cmd: "echo Hello | rev", desc: "olleH" }
    ],
    related: ["tac", "tr"]
  },
  {
    name: "diff", category: "テキスト処理",
    summary: "2つのファイルの違いを表示する。",
    synopsis: "diff [オプション] ファイルA ファイルB",
    options: [
      { flag: "-u", desc: "統一形式（git でもおなじみ）" },
      { flag: "-r", desc: "ディレクトリ同士を再帰比較" },
      { flag: "-i", desc: "大文字小文字を無視" },
      { flag: "-q", desc: "違いの有無だけ報告" }
    ],
    examples: [
      { cmd: "diff -u old.txt new.txt", desc: "+- 形式の差分" }
    ],
    related: ["cmp", "patch"]
  },

  /* ===== 検索 ===== */
  {
    name: "find", category: "検索",
    summary: "条件に合うファイルを再帰的に探す。最も多機能な探索コマンド。",
    synopsis: "find [起点] [条件...] [アクション]",
    options: [
      { flag: "-name",   desc: "ファイル名（ワイルドカード可）" },
      { flag: "-iname",  desc: "大文字小文字を区別しない -name" },
      { flag: "-type",   desc: "種類（f: ファイル, d: ディレクトリ, l: リンク）" },
      { flag: "-size",   desc: "サイズ（+1M, -100k 等）" },
      { flag: "-mtime",  desc: "更新からの日数（-7 で7日以内）" },
      { flag: "-user",   desc: "所有者で絞り込み" },
      { flag: "-perm",   desc: "パーミッションで絞り込み" },
      { flag: "-exec",   desc: "見つかったファイルにコマンドを実行" }
    ],
    examples: [
      { cmd: "find . -name '*.log'",                    desc: "カレント以下の .log ファイル" },
      { cmd: "find / -size +100M 2>/dev/null",          desc: "100MB超のファイル" },
      { cmd: "find . -type f -name '*.tmp' -delete",    desc: "一時ファイルをまとめて削除" }
    ],
    tips: "条件を組み合わせるときは順序が大事。-name より先に -type を書く方が高速。",
    related: ["grep", "locate", "xargs"]
  },
  {
    name: "locate", category: "検索",
    summary: "事前に作られたデータベースを使って素早くファイル名を探す。",
    synopsis: "locate [オプション] パターン",
    options: [
      { flag: "-i", desc: "大文字小文字を区別しない" },
      { flag: "-c", desc: "件数のみ表示" }
    ],
    examples: [
      { cmd: "locate sshd_config", desc: "sshd_config の場所をすぐ見つける" }
    ],
    tips: "事前に updatedb が走っている必要がある。リアルタイム検索ではない。",
    related: ["find", "which"]
  },
  {
    name: "which", category: "検索",
    summary: "コマンドの実行ファイルがどこにあるか調べる（PATH 内）。",
    synopsis: "which コマンド名",
    options: [
      { flag: "-a", desc: "見つかった全ての場所" }
    ],
    examples: [
      { cmd: "which python", desc: "/usr/bin/python など" }
    ],
    related: ["whereis", "type"]
  },
  {
    name: "whereis", category: "検索",
    summary: "コマンドのバイナリ・マニュアル・ソースの場所を一括で調べる。",
    synopsis: "whereis コマンド名",
    options: [
      { flag: "-b", desc: "バイナリのみ" },
      { flag: "-m", desc: "マニュアルのみ" }
    ],
    examples: [
      { cmd: "whereis ls", desc: "ls の関連ファイル一式" }
    ],
    related: ["which", "type"]
  },
  {
    name: "type", category: "検索",
    summary: "シェルコマンドの正体（エイリアス・関数・組み込み・実行ファイル）を表示。",
    synopsis: "type [-a] コマンド名",
    options: [
      { flag: "-a", desc: "見つかった全ての種類を表示" }
    ],
    examples: [
      { cmd: "type ll", desc: "alias ll='ls -alF' のように内訳がわかる" }
    ],
    related: ["which", "alias"]
  },

  /* ===== 圧縮・アーカイブ ===== */
  {
    name: "tar", category: "圧縮・アーカイブ",
    summary: "複数ファイルを1つにまとめる（tar）/ 取り出す。",
    synopsis: "tar [オプション] アーカイブ ファイル...",
    options: [
      { flag: "-c", desc: "新規作成" },
      { flag: "-x", desc: "展開" },
      { flag: "-t", desc: "中身一覧" },
      { flag: "-z", desc: "gzip 連動" },
      { flag: "-j", desc: "bzip2 連動" },
      { flag: "-J", desc: "xz 連動" },
      { flag: "-f", desc: "ファイル名指定（ほぼ必須）" },
      { flag: "-v", desc: "経過を表示" }
    ],
    examples: [
      { cmd: "tar -czvf out.tar.gz src/", desc: "src/ を gzip 圧縮で out.tar.gz に" },
      { cmd: "tar -xzvf out.tar.gz",      desc: "展開" },
      { cmd: "tar -tzvf out.tar.gz",      desc: "中身一覧" }
    ],
    tips: "覚え方: czf=作る、xzf=展開する、tzf=中身を見る。",
    related: ["gzip", "bzip2", "zip"]
  },
  {
    name: "gzip", category: "圧縮・アーカイブ",
    summary: "ファイルを gzip 形式で圧縮（拡張子 .gz）。元ファイルは消える。",
    synopsis: "gzip [オプション] ファイル...",
    options: [
      { flag: "-d", desc: "展開（gunzip と同じ）" },
      { flag: "-k", desc: "元ファイルを残す" },
      { flag: "-9", desc: "最高圧縮（時間がかかる）" }
    ],
    examples: [
      { cmd: "gzip -k file.txt", desc: "file.txt.gz を作り、元も残す" }
    ],
    related: ["gunzip", "tar"]
  },
  {
    name: "gunzip", category: "圧縮・アーカイブ",
    summary: "gzip ファイル（.gz）を展開する。",
    synopsis: "gunzip ファイル.gz",
    options: [
      { flag: "-k", desc: "元の .gz を残す" }
    ],
    examples: [
      { cmd: "gunzip file.txt.gz", desc: "file.txt に戻す" }
    ],
    related: ["gzip"]
  },
  {
    name: "bzip2", category: "圧縮・アーカイブ",
    summary: "bzip2 形式の圧縮（.bz2）。gzip より高圧縮だが遅い。",
    synopsis: "bzip2 [オプション] ファイル",
    options: [
      { flag: "-d", desc: "展開（bunzip2 と同じ）" },
      { flag: "-k", desc: "元ファイルを残す" }
    ],
    examples: [
      { cmd: "bzip2 -k file.txt", desc: "file.txt.bz2 を作る" }
    ],
    related: ["bunzip2", "tar"]
  },
  {
    name: "bunzip2", category: "圧縮・アーカイブ",
    summary: "bzip2 ファイル（.bz2）を展開する。",
    synopsis: "bunzip2 ファイル.bz2",
    options: [],
    examples: [
      { cmd: "bunzip2 file.txt.bz2", desc: "展開" }
    ],
    related: ["bzip2"]
  },
  {
    name: "zip", category: "圧縮・アーカイブ",
    summary: "ZIP 形式で圧縮。Windows との受け渡しに便利。",
    synopsis: "zip [オプション] アーカイブ.zip ファイル...",
    options: [
      { flag: "-r", desc: "ディレクトリを再帰圧縮" },
      { flag: "-9", desc: "最高圧縮" }
    ],
    examples: [
      { cmd: "zip -r out.zip dir/", desc: "dir/ を out.zip に" }
    ],
    related: ["unzip"]
  },
  {
    name: "unzip", category: "圧縮・アーカイブ",
    summary: "ZIP ファイルを展開する。",
    synopsis: "unzip [オプション] アーカイブ.zip",
    options: [
      { flag: "-l", desc: "中身一覧（展開しない）" },
      { flag: "-d", desc: "展開先ディレクトリ" }
    ],
    examples: [
      { cmd: "unzip out.zip -d dist/", desc: "dist/ に展開" }
    ],
    related: ["zip"]
  },
  {
    name: "xz", category: "圧縮・アーカイブ",
    summary: "xz 形式の高圧縮ツール（.xz）。Linux ソース配布で多用。",
    synopsis: "xz [オプション] ファイル",
    options: [
      { flag: "-d", desc: "展開（unxz と同じ）" },
      { flag: "-k", desc: "元ファイルを残す" }
    ],
    examples: [
      { cmd: "xz -k file.txt",     desc: "file.txt.xz を作る" },
      { cmd: "tar -xJf x.tar.xz",  desc: "tar と組み合わせて展開" }
    ],
    related: ["tar"]
  },

  /* ===== ネットワーク ===== */
  {
    name: "ssh", category: "ネットワーク",
    summary: "別のコンピュータに暗号化された接続でログインする。",
    synopsis: "ssh [オプション] ユーザー@ホスト",
    options: [
      { flag: "-p", desc: "ポート番号を指定（既定 22）" },
      { flag: "-i", desc: "秘密鍵ファイルを指定" },
      { flag: "-v", desc: "詳細なログを出す（接続が失敗するとき有用）" },
      { flag: "-L", desc: "ローカルポート転送" }
    ],
    examples: [
      { cmd: "ssh user@example.com",            desc: "user で example.com にログイン" },
      { cmd: "ssh -i ~/.ssh/id_ed25519 -p 2222 user@host", desc: "鍵指定 + ポート指定" }
    ],
    tips: "exit または Ctrl+D でログアウト。",
    related: ["scp", "sftp"]
  },
  {
    name: "scp", category: "ネットワーク",
    summary: "SSH 経由でファイルを安全にコピー。",
    synopsis: "scp [オプション] 元 先",
    options: [
      { flag: "-r", desc: "ディレクトリを再帰" },
      { flag: "-P", desc: "ポート番号（大文字 P）" },
      { flag: "-i", desc: "鍵ファイル" }
    ],
    examples: [
      { cmd: "scp file.txt user@host:/tmp/",     desc: "ローカル → リモートへ" },
      { cmd: "scp -r user@host:/var/log ./logs", desc: "リモート → ローカル（再帰）" }
    ],
    related: ["ssh", "rsync"]
  },
  {
    name: "rsync", category: "ネットワーク",
    summary: "差分だけを転送する効率的な同期コマンド。バックアップにも。",
    synopsis: "rsync [オプション] 元 先",
    options: [
      { flag: "-a", desc: "アーカイブ（保持＋再帰）" },
      { flag: "-v", desc: "詳細表示" },
      { flag: "-z", desc: "転送中に圧縮" },
      { flag: "--delete", desc: "コピー先から消えたファイルも削除" }
    ],
    examples: [
      { cmd: "rsync -avz src/ user@host:/dest/", desc: "差分同期（末尾の / がポイント）" }
    ],
    tips: "末尾スラッシュ有無で挙動が変わるので注意。",
    related: ["scp", "cp"]
  },
  {
    name: "curl", category: "ネットワーク",
    summary: "URL からデータを取得・送信する万能ツール。",
    synopsis: "curl [オプション] URL",
    options: [
      { flag: "-O", desc: "URL の末尾名で保存" },
      { flag: "-o", desc: "保存名を指定" },
      { flag: "-L", desc: "リダイレクトを追従" },
      { flag: "-X", desc: "HTTP メソッド（POST など）" },
      { flag: "-H", desc: "ヘッダーを追加" },
      { flag: "-d", desc: "POST データ" },
      { flag: "-s", desc: "進捗を出さない（サイレント）" },
      { flag: "-I", desc: "ヘッダーのみ取得（HEAD）" }
    ],
    examples: [
      { cmd: "curl -O https://example.com/file.zip", desc: "ファイルをダウンロード" },
      { cmd: "curl -X POST -H 'Content-Type: application/json' -d '{\"a\":1}' http://api/", desc: "API に JSON を POST" }
    ],
    related: ["wget", "httpie"]
  },
  {
    name: "wget", category: "ネットワーク",
    summary: "URL からファイルを再帰ダウンロードできる古典ツール。",
    synopsis: "wget [オプション] URL",
    options: [
      { flag: "-O", desc: "保存名を指定" },
      { flag: "-c", desc: "中断したダウンロードを再開" },
      { flag: "-r", desc: "リンクを辿って再帰" },
      { flag: "--mirror", desc: "サイト全体をミラー" }
    ],
    examples: [
      { cmd: "wget https://example.com/file.zip", desc: "シンプルにダウンロード" }
    ],
    related: ["curl"]
  },
  {
    name: "ping", category: "ネットワーク",
    summary: "相手に小さなパケットを送って到達と遅延を測る。",
    synopsis: "ping [オプション] ホスト",
    options: [
      { flag: "-c", desc: "送る回数（例: -c 4）" },
      { flag: "-i", desc: "送信間隔（秒）" }
    ],
    examples: [
      { cmd: "ping -c 4 8.8.8.8", desc: "Google DNS に4回 ping" }
    ],
    tips: "Ctrl+C で停止。返答が無い＝必ずしも相手がいないとは限らない（ICMP遮断）。",
    related: ["traceroute", "mtr"]
  },
  {
    name: "nc", category: "ネットワーク",
    summary: "ネットワークの swiss army knife。listen / 接続 / 簡易チャットなど。",
    synopsis: "nc [オプション] [ホスト] [ポート]",
    options: [
      { flag: "-l", desc: "listen モード（受け側）" },
      { flag: "-p", desc: "ポート番号" },
      { flag: "-v", desc: "詳細表示" },
      { flag: "-z", desc: "ポートが開いているか確認のみ" },
      { flag: "-u", desc: "UDP" }
    ],
    examples: [
      { cmd: "nc -lvnp 4444",        desc: "ポート 4444 で待機" },
      { cmd: "nc target 80",         desc: "target の80番に接続" },
      { cmd: "nc -zv host 22",       desc: "ポート22が開いているか確認" }
    ],
    related: ["ncat", "socat"]
  },
  {
    name: "nmap", category: "ネットワーク",
    summary: "ホストの開いているポートやサービスを調べるスキャナ。",
    synopsis: "nmap [オプション] ホスト",
    options: [
      { flag: "-sS", desc: "SYN スキャン（要 root）" },
      { flag: "-sV", desc: "サービスのバージョン検出" },
      { flag: "-p",  desc: "対象ポート（例: -p 22,80,443）" },
      { flag: "-A",  desc: "OS検出 + バージョン + スクリプト + traceroute" }
    ],
    examples: [
      { cmd: "nmap -p 1-1024 host", desc: "1〜1024 番までスキャン" }
    ],
    tips: "他人のホストを無断でスキャンしないこと。",
    related: ["nc", "masscan"]
  },
  {
    name: "dig", category: "ネットワーク",
    summary: "DNS の問い合わせを行う。名前解決のデバッグに必須。",
    synopsis: "dig [オプション] ドメイン [タイプ]",
    options: [
      { flag: "+short", desc: "結果だけ簡潔に" },
      { flag: "@",      desc: "DNS サーバを指定（例: @8.8.8.8）" }
    ],
    examples: [
      { cmd: "dig +short example.com",              desc: "A レコード" },
      { cmd: "dig MX example.com",                  desc: "メールサーバ（MX）を引く" }
    ],
    related: ["host", "nslookup"]
  },
  {
    name: "host", category: "ネットワーク",
    summary: "簡易な DNS 検索コマンド。",
    synopsis: "host ドメイン",
    options: [],
    examples: [
      { cmd: "host example.com", desc: "IP アドレスを表示" }
    ],
    related: ["dig"]
  },

  /* ===== プロセス・ジョブ ===== */
  {
    name: "ps", category: "プロセス・ジョブ",
    summary: "今動いているプロセスの一覧を表示する。",
    synopsis: "ps [オプション]",
    options: [
      { flag: "aux",   desc: "BSD 形式で全ユーザーの全プロセス" },
      { flag: "-ef",   desc: "System V 形式で全プロセス" },
      { flag: "--forest", desc: "親子関係を木で表示" }
    ],
    examples: [
      { cmd: "ps aux | grep nginx",  desc: "nginx プロセスを探す" },
      { cmd: "ps -ef --forest",      desc: "親子関係付きで一覧" }
    ],
    related: ["top", "kill", "pgrep"]
  },
  {
    name: "top", category: "プロセス・ジョブ",
    summary: "リアルタイムにプロセスとリソース消費を表示。",
    synopsis: "top",
    options: [],
    examples: [
      { cmd: "top",  desc: "CPU/メモリ消費の高い順に並ぶ" }
    ],
    tips: "操作: P=CPU順, M=メモリ順, k=プロセス終了, q=終了。",
    related: ["htop", "ps"]
  },
  {
    name: "htop", category: "プロセス・ジョブ",
    summary: "top の見やすい改良版（要インストール）。色付きでマウスも使える。",
    synopsis: "htop",
    options: [],
    examples: [{ cmd: "htop", desc: "対話的なプロセスモニター" }],
    related: ["top"]
  },
  {
    name: "kill", category: "プロセス・ジョブ",
    summary: "プロセスにシグナルを送る（多くはプロセスを終了させるため）。",
    synopsis: "kill [-シグナル] PID...",
    options: [
      { flag: "-9",   desc: "SIGKILL（強制終了、最終手段）" },
      { flag: "-15",  desc: "SIGTERM（既定、丁寧に終了）" },
      { flag: "-l",   desc: "シグナル一覧" }
    ],
    examples: [
      { cmd: "kill 1234",     desc: "PID 1234 に SIGTERM" },
      { cmd: "kill -9 1234",  desc: "強制終了" }
    ],
    related: ["ps", "killall", "pkill"]
  },
  {
    name: "killall", category: "プロセス・ジョブ",
    summary: "プロセス名を指定して、合致するすべてに信号を送る。",
    synopsis: "killall [オプション] プロセス名",
    options: [
      { flag: "-9", desc: "SIGKILL" }
    ],
    examples: [
      { cmd: "killall firefox", desc: "firefox を全部終了" }
    ],
    related: ["kill", "pkill"]
  },
  {
    name: "jobs", category: "プロセス・ジョブ",
    summary: "シェルの現在のジョブ（バックグラウンド・停止中）一覧を見る。",
    synopsis: "jobs [-l]",
    options: [
      { flag: "-l", desc: "PID も表示" }
    ],
    examples: [
      { cmd: "jobs -l", desc: "現在のジョブとPID" }
    ],
    related: ["fg", "bg"]
  },
  {
    name: "bg", category: "プロセス・ジョブ",
    summary: "停止中のジョブをバックグラウンドで再開する。",
    synopsis: "bg [%ジョブ番号]",
    options: [],
    examples: [
      { cmd: "bg %1", desc: "ジョブ1をバックグラウンドへ" }
    ],
    tips: "Ctrl+Z で実行中のジョブを停止 → bg で背後へ。",
    related: ["fg", "jobs"]
  },
  {
    name: "fg", category: "プロセス・ジョブ",
    summary: "バックグラウンドのジョブを手前（フォアグラウンド）に戻す。",
    synopsis: "fg [%ジョブ番号]",
    options: [],
    examples: [
      { cmd: "fg %1", desc: "ジョブ1を手前に" }
    ],
    related: ["bg", "jobs"]
  },
  {
    name: "nohup", category: "プロセス・ジョブ",
    summary: "ターミナルを閉じても続けて動かす（HUP シグナルを無視）。",
    synopsis: "nohup コマンド &",
    options: [],
    examples: [
      { cmd: "nohup ./long_job.sh &",  desc: "ログアウト後も動き続ける" }
    ],
    tips: "出力は nohup.out に書かれる。",
    related: ["disown", "screen", "tmux"]
  },
  {
    name: "&", category: "プロセス・ジョブ",
    summary: "コマンドの末尾につけると、そのコマンドはバックグラウンドで動く。",
    synopsis: "コマンド &",
    options: [],
    examples: [
      { cmd: "long_task &", desc: "プロンプトをすぐ取り戻して別作業へ" }
    ],
    related: ["bg", "jobs"]
  },

  /* ===== 権限・所有権 ===== */
  {
    name: "chmod", category: "権限・所有権",
    summary: "ファイルやディレクトリのパーミッションを変更する。",
    synopsis: "chmod [オプション] モード パス...",
    options: [
      { flag: "-R", desc: "再帰的に変更" }
    ],
    examples: [
      { cmd: "chmod 644 file",          desc: "数値指定（rw-r--r--）" },
      { cmd: "chmod u+x script.sh",     desc: "所有者に実行権限を追加" },
      { cmd: "chmod -R go-w dir/",      desc: "グループ・他者の書き込みを再帰で外す" }
    ],
    tips: "数値 4=読, 2=書, 1=実行。3桁=所有者・グループ・他者。",
    related: ["chown", "umask"]
  },
  {
    name: "chown", category: "権限・所有権",
    summary: "ファイルの所有者・グループを変える（要 sudo）。",
    synopsis: "chown [オプション] ユーザー[:グループ] パス...",
    options: [
      { flag: "-R", desc: "再帰的に変更" }
    ],
    examples: [
      { cmd: "sudo chown alice:dev file.txt", desc: "所有者 alice、グループ dev に" }
    ],
    related: ["chmod", "chgrp"]
  },
  {
    name: "chgrp", category: "権限・所有権",
    summary: "ファイルのグループだけを変更する。",
    synopsis: "chgrp [オプション] グループ パス...",
    options: [
      { flag: "-R", desc: "再帰" }
    ],
    examples: [
      { cmd: "chgrp dev file.txt", desc: "グループのみ変更" }
    ],
    related: ["chown"]
  },
  {
    name: "sudo", category: "権限・所有権",
    summary: "他のユーザー（既定は root）の権限でコマンドを実行する。",
    synopsis: "sudo [オプション] コマンド",
    options: [
      { flag: "-u", desc: "実行ユーザーを指定" },
      { flag: "-i", desc: "対象ユーザーのログインシェルを起動" },
      { flag: "-l", desc: "実行可能なコマンドを一覧" }
    ],
    examples: [
      { cmd: "sudo apt update",  desc: "管理者権限でパッケージ更新" },
      { cmd: "sudo -u alice ls", desc: "alice として ls" }
    ],
    tips: "強い力が必要なときだけ。常用しない。",
    related: ["su"]
  },
  {
    name: "su", category: "権限・所有権",
    summary: "別ユーザーに切り替える（switch user）。",
    synopsis: "su [オプション] [ユーザー名]",
    options: [
      { flag: "-",  desc: "ログインシェルとして起動（環境を切り替え）" },
      { flag: "-c", desc: "1つのコマンドだけ実行" }
    ],
    examples: [
      { cmd: "su - alice", desc: "alice に切り替えてログイン環境にする" }
    ],
    related: ["sudo"]
  },
  {
    name: "umask", category: "権限・所有権",
    summary: "新規ファイルが作られたときに自動で除外されるパーミッション。",
    synopsis: "umask [マスク値]",
    options: [],
    examples: [
      { cmd: "umask",      desc: "現在の値を表示" },
      { cmd: "umask 022",  desc: "他者の書き込み権限を新規ファイルから自動的に外す" }
    ],
    related: ["chmod"]
  },

  /* ===== システム情報 ===== */
  {
    name: "uname", category: "システム情報",
    summary: "OS とカーネルの情報を表示する。",
    synopsis: "uname [オプション]",
    options: [
      { flag: "-a", desc: "全部表示" },
      { flag: "-r", desc: "カーネルバージョン" },
      { flag: "-m", desc: "ハードウェア種別" }
    ],
    examples: [
      { cmd: "uname -a", desc: "Linux host 5.15.0 ... など" }
    ],
    related: ["hostname"]
  },
  {
    name: "whoami", category: "システム情報",
    summary: "今ログインしているユーザー名を表示する。",
    synopsis: "whoami",
    options: [],
    examples: [{ cmd: "whoami", desc: "alice" }],
    related: ["id", "who"]
  },
  {
    name: "id", category: "システム情報",
    summary: "ユーザー ID・グループ ID を表示する。",
    synopsis: "id [ユーザー名]",
    options: [
      { flag: "-u", desc: "UID のみ" },
      { flag: "-g", desc: "GID のみ" },
      { flag: "-G", desc: "全所属グループ" }
    ],
    examples: [
      { cmd: "id",           desc: "自分の情報" },
      { cmd: "id alice",     desc: "alice の情報" }
    ],
    related: ["whoami", "groups"]
  },
  {
    name: "hostname", category: "システム情報",
    summary: "コンピュータのホスト名を表示・設定する。",
    synopsis: "hostname [新ホスト名]",
    options: [
      { flag: "-I", desc: "全 IP アドレス" }
    ],
    examples: [
      { cmd: "hostname",    desc: "現在のホスト名" },
      { cmd: "hostname -I", desc: "全 IP" }
    ],
    related: ["uname"]
  },
  {
    name: "date", category: "システム情報",
    summary: "現在の日時を表示・整形する。",
    synopsis: "date [+フォーマット]",
    options: [],
    examples: [
      { cmd: "date",                            desc: "現在時刻" },
      { cmd: "date +'%Y-%m-%d %H:%M:%S'",       desc: "整形して表示" },
      { cmd: "date -d 'next Monday'",           desc: "次の月曜日の日付" }
    ],
    related: ["cal"]
  },
  {
    name: "uptime", category: "システム情報",
    summary: "起動からの経過時間とロード平均を表示する。",
    synopsis: "uptime",
    options: [
      { flag: "-p", desc: "簡潔形式" }
    ],
    examples: [
      { cmd: "uptime", desc: "現在時刻、稼働時間、ユーザー数、ロード" }
    ],
    related: ["w", "top"]
  },
  {
    name: "free", category: "システム情報",
    summary: "メモリ・スワップの使用状況を表示する。",
    synopsis: "free [オプション]",
    options: [
      { flag: "-h", desc: "読みやすい単位" },
      { flag: "-m", desc: "MB 表示" }
    ],
    examples: [
      { cmd: "free -h", desc: "メモリ使用量を読みやすく" }
    ],
    related: ["vmstat", "top"]
  },
  {
    name: "lsblk", category: "システム情報",
    summary: "ブロックデバイス（ディスク・パーティション）一覧を木で表示。",
    synopsis: "lsblk [オプション]",
    options: [
      { flag: "-f", desc: "ファイルシステム情報も表示" }
    ],
    examples: [
      { cmd: "lsblk -f", desc: "ディスクとマウント状況" }
    ],
    related: ["df", "mount"]
  },

  /* ===== シェル基礎 ===== */
  {
    name: "echo", category: "シェル基礎",
    summary: "引数の文字列をそのまま表示する。",
    synopsis: "echo [オプション] 文字列...",
    options: [
      { flag: "-n", desc: "末尾の改行を出さない" },
      { flag: "-e", desc: "\\n や \\t を解釈" }
    ],
    examples: [
      { cmd: "echo Hello",       desc: "Hello" },
      { cmd: "echo $HOME",       desc: "ホームディレクトリのパス" }
    ],
    related: ["printf"]
  },
  {
    name: "printf", category: "シェル基礎",
    summary: "C 言語風のフォーマット指定で文字列を出す。echo より厳密。",
    synopsis: "printf 'フォーマット' 引数...",
    options: [],
    examples: [
      { cmd: "printf '%-10s %d\\n' 'apple' 100", desc: "整形して出力" }
    ],
    related: ["echo"]
  },
  {
    name: "history", category: "シェル基礎",
    summary: "過去に打ったコマンドの履歴を表示する。",
    synopsis: "history [N]",
    options: [],
    examples: [
      { cmd: "history",       desc: "全履歴" },
      { cmd: "history 20",    desc: "直近 20 件" },
      { cmd: "!42",           desc: "履歴 42 番目を再実行" }
    ],
    tips: "Ctrl+R でインクリメンタル検索もできる。",
    related: ["!", "fc"]
  },
  {
    name: "alias", category: "シェル基礎",
    summary: "コマンドに別名（ショートカット）を付ける。",
    synopsis: "alias [名前='コマンド']",
    options: [],
    examples: [
      { cmd: "alias",                           desc: "現在のエイリアス一覧" },
      { cmd: "alias ll='ls -alF'",              desc: "ll を ls -alF に" },
      { cmd: "alias gs='git status'",           desc: "git のお供に" }
    ],
    tips: "永続化するには ~/.bashrc などに書く。",
    related: ["unalias", "type"]
  },
  {
    name: "unalias", category: "シェル基礎",
    summary: "エイリアスを解除する。",
    synopsis: "unalias 名前",
    options: [
      { flag: "-a", desc: "全エイリアスを解除" }
    ],
    examples: [{ cmd: "unalias ll", desc: "ll エイリアスを削除" }],
    related: ["alias"]
  },
  {
    name: "export", category: "シェル基礎",
    summary: "シェル変数を環境変数として子プロセスに渡せる形にする。",
    synopsis: "export 変数=値",
    options: [],
    examples: [
      { cmd: "export PATH=$PATH:~/bin",   desc: "~/bin を PATH に追加" },
      { cmd: "export DEBUG=1",            desc: "DEBUG という環境変数を設定" }
    ],
    related: ["env", "set"]
  },
  {
    name: "env", category: "シェル基礎",
    summary: "現在の環境変数を表示する。または変更した環境でコマンド実行。",
    synopsis: "env [VAR=value...] [コマンド]",
    options: [],
    examples: [
      { cmd: "env",                  desc: "全環境変数" },
      { cmd: "env LANG=C ls --help", desc: "LANG=C でだけ ls を実行" }
    ],
    related: ["export", "printenv"]
  },
  {
    name: "source", category: "シェル基礎",
    summary: "現在のシェルでスクリプトを読み込む（変数や関数を取り込む）。",
    synopsis: "source ファイル / . ファイル",
    options: [],
    examples: [
      { cmd: "source ~/.bashrc", desc: ".bashrc の変更を即反映" },
      { cmd: ". ./venv/bin/activate", desc: "Python 仮想環境を有効化" }
    ],
    tips: ". は source の別名。両方とも「同じシェル内で実行」する。",
    related: ["export"]
  },
  {
    name: "basename", category: "シェル基礎",
    summary: "パスからディレクトリ部分を除いて、ファイル名だけ取り出す。",
    synopsis: "basename パス [拡張子]",
    options: [],
    examples: [
      { cmd: "basename /path/to/file.txt",       desc: "file.txt" },
      { cmd: "basename /path/to/file.txt .txt",  desc: "file" }
    ],
    related: ["dirname"]
  },
  {
    name: "dirname", category: "シェル基礎",
    summary: "パスからファイル名部分を除いて、ディレクトリだけ取り出す。",
    synopsis: "dirname パス",
    options: [],
    examples: [
      { cmd: "dirname /path/to/file.txt", desc: "/path/to" }
    ],
    related: ["basename"]
  },
  {
    name: "true / false", category: "シェル基礎",
    summary: "何もせずに、それぞれ成功/失敗のステータスを返す。スクリプトの条件分岐で使う。",
    synopsis: "true / false",
    options: [],
    examples: [
      { cmd: "while true; do date; sleep 1; done", desc: "1秒おきに日時表示" }
    ],
    related: ["[", "test"]
  },
  {
    name: "sleep", category: "シェル基礎",
    summary: "指定した秒数だけ待つ。",
    synopsis: "sleep 秒数",
    options: [],
    examples: [
      { cmd: "sleep 3",        desc: "3秒待つ" },
      { cmd: "sleep 1m && say done", desc: "1分後に終了通知" }
    ],
    tips: "末尾に s/m/h/d をつけて単位指定（GNU sleep）。",
    related: ["wait"]
  },
  {
    name: "xargs", category: "シェル基礎",
    summary: "標準入力を引数に変換して別のコマンドに渡す。",
    synopsis: "xargs [オプション] コマンド",
    options: [
      { flag: "-n", desc: "1回に渡す引数の最大数" },
      { flag: "-I", desc: "プレースホルダを指定（例: -I {} mv {} dir/）" },
      { flag: "-0", desc: "区切りを NUL 文字に（find -print0 とセット）" }
    ],
    examples: [
      { cmd: "find . -name '*.tmp' | xargs rm",    desc: "見つけた tmp を一括削除" },
      { cmd: "ls *.jpg | xargs -I {} cp {} backup/", desc: "1つずつバックアップにコピー" }
    ],
    related: ["find", "parallel"]
  },

  /* ===== その他 ===== */
  {
    name: "xxd", category: "その他",
    summary: "ファイルを16進ダンプ表示する。バイナリの中身を覗くのに使う。",
    synopsis: "xxd [オプション] [ファイル]",
    options: [
      { flag: "-r", desc: "16進ダンプから元のバイナリに戻す" },
      { flag: "-l", desc: "表示するバイト数" },
      { flag: "-s", desc: "開始位置（オフセット）" }
    ],
    examples: [
      { cmd: "xxd -l 64 file",         desc: "先頭 64 バイトを 16 進表示" },
      { cmd: "xxd dump.hex | xxd -r > restored.bin", desc: "ダンプから復元" }
    ],
    related: ["od", "strings", "hexdump"]
  },
  {
    name: "od", category: "その他",
    summary: "ファイルを8進・16進・文字などでダンプ表示する。",
    synopsis: "od [オプション] [ファイル]",
    options: [
      { flag: "-c", desc: "文字として表示" },
      { flag: "-x", desc: "16進表示" },
      { flag: "-N", desc: "表示するバイト数" }
    ],
    examples: [
      { cmd: "od -c -N 64 file", desc: "先頭 64 バイトを文字で" }
    ],
    related: ["xxd", "hexdump"]
  },
  {
    name: "base64", category: "その他",
    summary: "テキストやバイナリを base64 でエンコード・デコードする。",
    synopsis: "base64 [オプション] [ファイル]",
    options: [
      { flag: "-d", desc: "デコード" },
      { flag: "-w", desc: "改行を入れる桁数（0で改行なし）" }
    ],
    examples: [
      { cmd: "echo hello | base64",            desc: "aGVsbG8K" },
      { cmd: "echo aGVsbG8K | base64 -d",      desc: "hello" }
    ],
    related: ["xxd", "openssl"]
  },
  {
    name: "md5sum", category: "その他",
    summary: "ファイルの MD5 ハッシュを計算する。整合性チェック用。",
    synopsis: "md5sum [オプション] ファイル...",
    options: [
      { flag: "-c", desc: "ハッシュリストを照合" }
    ],
    examples: [
      { cmd: "md5sum file",                desc: "ハッシュを表示" },
      { cmd: "md5sum -c sums.md5",         desc: "リストと突き合わせ" }
    ],
    tips: "MD5 はセキュリティ用途には使わない（衝突が見つかっている）。整合性確認には可。",
    related: ["sha256sum"]
  },
  {
    name: "sha256sum", category: "その他",
    summary: "SHA-256 ハッシュを計算する。MD5 より安全。",
    synopsis: "sha256sum [オプション] ファイル...",
    options: [
      { flag: "-c", desc: "リスト照合" }
    ],
    examples: [
      { cmd: "sha256sum download.iso", desc: "ダウンロードファイルの整合性確認" }
    ],
    related: ["md5sum", "openssl"]
  },
  {
    name: "openssl", category: "その他",
    summary: "暗号化・証明書・接続テストの万能ツール。",
    synopsis: "openssl サブコマンド [オプション]",
    options: [],
    examples: [
      { cmd: "openssl s_client -connect example.com:443", desc: "TLS 接続のテスト" },
      { cmd: "openssl rand -base64 24",                    desc: "ランダムなパスワード生成" },
      { cmd: "openssl dgst -sha256 file",                  desc: "SHA-256 ハッシュ" }
    ],
    related: ["curl", "ssh"]
  },
  {
    name: "vim", category: "その他",
    summary: "高機能なテキストエディタ。Linux では事実上の標準。",
    synopsis: "vim ファイル",
    options: [],
    examples: [
      { cmd: "vim file.txt", desc: "編集を始める" }
    ],
    tips: "i で挿入、Esc で戻る、:w で保存、:q で終了、:wq で保存して終了、:q! で破棄して終了。",
    related: ["nano", "vi"]
  },
  {
    name: "nano", category: "その他",
    summary: "シンプルで初心者向けのテキストエディタ。",
    synopsis: "nano [ファイル]",
    options: [],
    examples: [
      { cmd: "nano file.txt", desc: "ファイルを編集" }
    ],
    tips: "操作は画面下に表示される。^ は Ctrl のこと。^O 保存、^X 終了。",
    related: ["vim"]
  },
  {
    name: "man", category: "その他",
    summary: "コマンドのオフラインマニュアルを表示する。",
    synopsis: "man [セクション] コマンド",
    options: [
      { flag: "-k", desc: "キーワードでマニュアルを検索（apropos）" }
    ],
    examples: [
      { cmd: "man ls",       desc: "ls のマニュアル" },
      { cmd: "man -k chown", desc: "chown 関連のマニュアルを検索" }
    ],
    tips: "操作: スペースで次画面、/word で検索、q で終了。",
    related: ["help", "info", "tldr"]
  },
  {
    name: "watch", category: "その他",
    summary: "コマンドを定期的に繰り返し実行し、結果の変化を見せる。",
    synopsis: "watch [オプション] コマンド",
    options: [
      { flag: "-n", desc: "実行間隔（秒、既定 2）" },
      { flag: "-d", desc: "差分をハイライト" }
    ],
    examples: [
      { cmd: "watch -n 1 -d df -h",  desc: "1秒おきに df -h を実行" }
    ],
    related: ["top"]
  },
  {
    name: "yes", category: "その他",
    summary: "指定した文字列を延々と表示し続ける。スクリプトに自動応答する用途。",
    synopsis: "yes [文字列]",
    options: [],
    examples: [
      { cmd: "yes | apt remove pkg", desc: "y/n の確認に全て y を返す" }
    ],
    related: ["expect"]
  },
  {
    name: "clear", category: "その他",
    summary: "ターミナルの画面をクリアする。",
    synopsis: "clear",
    options: [],
    examples: [{ cmd: "clear", desc: "画面をリセット" }],
    tips: "Ctrl+L でも同じ操作ができる。",
    related: []
  },
  {
    name: "exit", category: "その他",
    summary: "シェルを終了する。SSH ならログアウト、ターミナルなら閉じる。",
    synopsis: "exit [終了コード]",
    options: [],
    examples: [
      { cmd: "exit",   desc: "正常終了" },
      { cmd: "exit 1", desc: "終了コード1で終わる（スクリプト用）" }
    ],
    tips: "Ctrl+D でも同じ。",
    related: ["logout"]
  }
];
