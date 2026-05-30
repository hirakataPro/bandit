/* =========================================================
   level-data.js — 各レベルの詳細データ
   各エントリ: { story, hints[], approach, skills[], password, fs }
   ※ シナリオ・問題文はすべて独自に新規執筆。
   ※ password と fs はこの仮想環境内だけで意味を持つフィクションです。
   ========================================================= */

(function () {
  "use strict";

  // ---------- 圧縮/アーカイブのヘルパ (Lv12 等用) ----------
  // commands.js の isXxx / Wrap と同じマジックバイトを使う。
  const GZIP_MAGIC  = "\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\x03";
  const BZIP2_MAGIC = "BZh91AY&SY";
  const XZ_MAGIC    = "\xfd7zXZ\x00\x00";
  function _gz(s) { return GZIP_MAGIC  + s; }
  function _bz(s) { return BZIP2_MAGIC + s; }
  function _xz(s) { return XZ_MAGIC    + s; }

  // バイナリ文字列を xxd 風 16進ダンプテキストに変換 (xxd -r で復元可能)
  function _hexdump(text) {
    let out = "";
    for (let i = 0; i < text.length; i += 16) {
      const chunk = text.slice(i, i + 16);
      const groups = [];
      for (let j = 0; j < chunk.length; j += 2) {
        let g = (chunk.charCodeAt(j) & 0xff).toString(16).padStart(2, "0");
        if (j + 1 < chunk.length) g += (chunk.charCodeAt(j + 1) & 0xff).toString(16).padStart(2, "0");
        groups.push(g);
      }
      const hexLine = groups.join(" ");
      const ascii = chunk.split("").map(c => {
        const code = c.charCodeAt(0);
        return code >= 32 && code < 127 ? c : ".";
      }).join("");
      out += i.toString(16).padStart(8, "0") + ": " + hexLine + "  " + ascii + "\n";
    }
    return out;
  }

  // tar pack (Lv12 で必要なら使う) — commands.js の同名関数と同じロジック
  function _tarHeader(name, mode, size) {
    const buf = new Array(512).fill("\x00");
    const setStr = (off, max, s) => { for (let i = 0; i < Math.min(s.length, max); i++) buf[off + i] = s[i]; };
    setStr(0, 100, name);
    setStr(100, 8, mode.toString(8).padStart(7, "0") + "\x00");
    setStr(108, 8, "0000000\x00");
    setStr(116, 8, "0000000\x00");
    setStr(124, 12, size.toString(8).padStart(11, "0") + "\x00");
    setStr(136, 12, "00000000000\x00");
    for (let i = 0; i < 8; i++) buf[148 + i] = " ";
    buf[156] = "0";
    setStr(257, 6, "ustar\x00");
    setStr(263, 2, "00");
    setStr(265, 32, "root\x00");
    setStr(297, 32, "root\x00");
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += buf[i].charCodeAt(0);
    const ckStr = sum.toString(8).padStart(6, "0") + "\x00 ";
    for (let i = 0; i < 8; i++) buf[148 + i] = ckStr[i];
    return buf.join("");
  }
  function _tarPad(s) { const rem = s.length % 512; return rem === 0 ? s : s + "\x00".repeat(512 - rem); }
  function _tar(files) {
    let out = "";
    for (const f of files) {
      out += _tarHeader(f.name, f.mode == null ? 0o644 : f.mode, (f.content || "").length);
      out += _tarPad(f.content || "");
    }
    out += "\x00".repeat(1024);
    return out;
  }

  // ROT13 ヘルパ (Lv11 用)
  function _rot13(s) {
    return s.replace(/[A-Za-z]/g, c => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
  }

  // ===== AI に聞くためのプロンプト用「課題サマリ」 =====
  // 各レベルの “やりたいこと” を、答え（コマンド名・パスワード・具体オプション）を
  // 含めずに 1〜2 文で要約したもの。level.js がこれをテンプレに差し込んで、
  // ChatGPT 等にそのまま貼れる「誘導型」プロンプトを生成する。
  // ※ インデックス = レベル番号。未定義レベルは level.js が story 先頭文へ
  //   自動フォールバックする。31〜34 は現状プレースホルダ（準備中）。
  window.LEVEL_AI_TASKS = [
    // 0
    "ターミナルに初めてログインした状態です。ホームディレクトリに置かれたファイルの中身を画面に表示して、そこに書かれているパスワードを読み取りたい。",
    // 1
    "ホームディレクトリにある、ハイフン1文字だけの名前のファイルの中身を読みたい。ふつうに名前を指定すると、コマンドのオプションだと勘違いされてうまく読めません。",
    // 2
    "ホームディレクトリにある、名前の中に空白がいくつも入ったファイルの中身を読みたい。空白が区切り文字として扱われ、別々のファイル名だと解釈されてしまいます。",
    // 3
    "あるディレクトリの中にある、名前がドットで始まる『隠しファイル』の中身を読みたい。ふつうの一覧表示には出てきません。",
    // 4
    "あるディレクトリにたくさんのファイルがあり、そのうち1つだけが人間の読めるテキストで、残りはバイナリ（読めないデータ）です。どれがテキストかを見分けて、その中身を読みたい。",
    // 5
    "多数のサブディレクトリに散らばったファイルの中から、サイズがちょうど決まったバイト数で、人間が読めるファイルを効率よく1つ探し出したい。",
    // 6
    "サーバー全体（自分のホームの外も含む）から、所有者・グループ・サイズが指定の条件にすべて一致するファイルを1つ探し出して、その中身を読みたい。",
    // 7
    "大量の単語と文字列が1行ずつ並んだファイルから、ある特定の単語を含む1行だけを抜き出して、その行に書かれたパスワードを読みたい。",
    // 8
    "たくさんの行のうち大半が2回以上重複しているファイルから、『ただ一度だけ』現れる1行を見つけ出したい。",
    // 9
    "大部分がバイナリのファイルに紛れている『人間が読める文字列』だけを取り出し、その中で特定の記号で囲まれた文字列を読みたい。",
    // 10
    "ファイルの中身が Base64 という方式でエンコードされています。これを元の文章に戻して、中に書かれたパスワードを読みたい。",
    // 11
    "ファイルの中身が、アルファベットを13文字ずつずらす方式で置き換えられています。これを元に戻して読めるようにしたい。",
    // 12
    "1つのファイルが、まず16進数のダンプとして書かれ、さらに複数の圧縮・アーカイブ形式で何重にも包まれています。元のデータに戻し、形式を確かめながら一枚ずつ展開して、最後の中身を読みたい。",
    // 13
    "ホームに置かれた秘密鍵を使って、別のユーザーとしてサーバーにSSHでログインし、そのユーザーのファイルを読み出したい。",
    // 14
    "自分の現在のパスワードを、特定の番号のポートで動いているネットワークサービスに送信し、返ってくる次のパスワードを受け取りたい。",
    // 15
    "特定のポートのサービスに現在のパスワードを送りたいのですが、その通信は暗号化（SSL/TLS）されている必要があります。暗号化された通信路で送って、応答を受け取りたい。",
    // 16
    "ある範囲のポートをスキャンして開いているポートを見つけ、その中で暗号化通信を受け付けるサービスに現在のパスワードを送り、返ってきた秘密鍵で次のレベルにログインしたい。",
    // 17
    "よく似た2つのファイルを比較して、片方だけにある（内容が異なっている）行を見つけ出したい。",
    // 18
    "ログインすると設定ファイルの細工によってすぐ接続が切れてしまいます。対話シェルを開かずに、目的のファイルの中身だけを読み出す方法を知りたい。",
    // 19
    "別のユーザーの権限でコマンドを実行できる特別なプログラムを使って、普段は自分では読めないパスワードファイルを読み出したい。",
    // 20
    "指定したポートに接続し、送られた文字列が自分のパスワードと一致すれば次を教えてくれるプログラムがあります。自分で『待ち受け』を用意して現在のパスワードを置いてから接続したい。2つの処理を組み合わせる必要があります。",
    // 21
    "定期的にプログラムを自動実行するしくみ（cron）の設定を読み解き、あるジョブがパスワードをどこに書き出しているかを突き止めて、その出力先ファイルを読みたい。",
    // 22
    "cron で動くスクリプトを読み、計算（ハッシュ化）で決まる名前の一時ファイルがどれになるかを自分で割り出して、その中身を読みたい。",
    // 23
    "決まったディレクトリに置いたスクリプトを cron が別ユーザー権限で実行するしくみがあります。目的のパスワードを自分が読める場所にコピーするスクリプトを書いて仕掛けたい。",
    // 24
    "あるポートのサービスは『現在のパスワード＋4桁の秘密の数字』を送ると次を返します。数字は分からないので、総当たりで正しい組み合わせを探したい。",
    // 25
    "ログインすると、ふつうの操作ができない表示専用のプログラム（ページャ）に閉じ込められます。その表示プログラムの機能を使って別の場所のファイルを読み出したい。",
    // 26
    "テキストエディタの中から、シェルコマンドを呼び出して、別の場所にあるファイルの中身を読みたい。",
    // 27
    "サーバーにある Git リポジトリを自分の作業場所に複製（クローン）して、その中のファイルに書かれたパスワードを読みたい。",
    // 28
    "Git リポジトリの最新の状態では伏せられているパスワードを、過去の変更履歴をさかのぼって見つけ出したい。",
    // 29
    "Git リポジトリの今いるブランチには見当たらないパスワードを、別のブランチを探して見つけ出したい。",
    // 30
    "Git リポジトリのブランチにもファイルにも見当たらないパスワードを、コミットに付けられた目印（タグ）から見つけ出したい。",
    // 31（準備中）
    "Git リポジトリの指示どおりにファイルを用意してコミットし、リモートへ送信（プッシュ）すると、その応答に次の手がかりが含まれる、という課題に取り組みたい。",
    // 32（準備中）
    "打ち込んだコマンドが変形されてしまう制限された環境から抜け出して、通常のシェルを取り戻したい。",
    // 33（準備中）
    "これまで学んだコマンドの使い分けを振り返り、状況に応じてどのコマンドを選ぶべきかを整理したい。",
    // 34（準備中）
    "ここまでの学習を踏まえて、これから自分で Linux を使っていくための次の一歩を考えたい。"
  ];

  window.LEVEL_DATA = {

  // --------------------------------------------------------
  0: {
    story:
`新しい開発サーバー「training-server」のアカウントを受け取りました。
このサーバーでは、ターミナルから様々な作業ができます。
まずはサーバーに無事ログインできたかどうか、
そして自分が今どこにいるのかを確かめてみましょう。

あなたのホームディレクトリには「readme」という名前のファイルが置かれています。
その中に、次のレベルへ進むためのパスワードが書かれています。`,
    skills: ["pwd", "whoami", "ls", "cat"],
    hints: [
      "サーバーにログインしたら、まず自分が誰でどこにいるかを確かめるのが基本です。",
      "ホームディレクトリの中身を一覧で見るには ls が使えます。",
      "ファイルの中身を表示するには cat というコマンドがあります。"
    ],
    approach:
`1. pwd で今いる場所を確認する。
2. ls でホームディレクトリの中身を見る。「readme」というファイルがあるはずです。
3. cat readme でその中身を表示する。
4. 表示された文字列の中にパスワードがあります。それを下のフォームに貼り付けて次のレベルへ。`,
    password: "first-stride-on-the-shell-2026",
    fs: {
      user: "bandit0",
      hostname: "training-server",
      home: "/home/bandit0",
      cwd: "/home/bandit0",
      files: {
        "/home/bandit0/readme": {
          type: "file",
          owner: "bandit0",
          group: "bandit0",
          mode: "0644",
          content:
`Welcome to Shell — 仮想ターミナル学習環境

このサーバーには、Linux でよく使うコマンドの感覚を身につけるための
小さな課題が用意されています。各レベルをクリアすると、
次のレベルに進むためのパスワードが手に入ります。

このレベル（Level 0）のパスワード:
first-stride-on-the-shell-2026

おめでとう！
ページの下にあるフォームにこのパスワードを入力してみてください。
`
        }
      }
    }
  },

  // --------------------------------------------------------
  1: {
    story:
`次のサーバー (bandit1) に移りました。
ホームディレクトリには、ファイル名がたった「-」だけの小さなファイルが置かれています。

ところが、ターミナルでは「-」はオプションを意味する記号として扱われがちです。
そのまま cat - とすると、cat は「標準入力から読む」モードに入ってしまい、
このファイルを開いてくれません。

このファイルの中身に書かれたパスワードを、無事に取り出してみましょう。`,
    skills: ["cat", "パス指定", "リダイレクト"],
    hints: [
      "ファイル名そのものを開きたいなら、その前にディレクトリを明示するとシェルに「これはオプションじゃない」と伝えられます。",
      "例えば、カレントディレクトリのファイルを指すには ./ を頭につけます。/home/bandit1/- のような絶対パスを使う手もあります。",
      "別の定石は、リダイレクト < を使ってファイルを cat の標準入力に流し込む方法。cat < ./- のように書きます。"
    ],
    approach:
`1. ls で「-」というファイルがあることを確認します。
2. cat - とは打たないでください（cat にとって - は「標準入力から読む」の意味になり、何も表示されません）。
3. 次のいずれかでハイフン名ファイルを正しく開けます:
   - cat ./-
   - cat /home/bandit1/-
   - cat < ./-     （シェルのリダイレクトでファイルを cat の標準入力に渡す）
4. 表示された中の文字列が、次のレベルのパスワードです。`,
    password: "single-dash-confounds-novice-shells",
    fs: {
      user: "bandit1",
      hostname: "training-server",
      home: "/home/bandit1",
      cwd: "/home/bandit1",
      files: {
        "/home/bandit1/-": {
          type: "file",
          owner: "bandit1",
          group: "bandit1",
          mode: "0644",
          content:
`このレベル (Level 1) のパスワード:
single-dash-confounds-novice-shells

ハイフン1つでファイルを表すのは Unix ではよくある罠です。
ls で出てくるのに cat に渡しても開けない、というギャップを覚えておきましょう。
`
        }
      }
    }
  },

  // --------------------------------------------------------
  2: {
    story:
`bandit2 のホームディレクトリには、ファイル名に「空白」が含まれたファイルが置かれています。
シェルは空白を「引数の区切り」として解釈するため、
そのまま cat の後ろに名前を打っても、複数の別ファイルとして扱われてしまいます。

このようなファイル名でも、ちゃんと開ける書き方を身につけましょう。`,
    skills: ["クォート", "エスケープ", "cat"],
    hints: [
      "ふつうの ls だと、空白入りファイル名は周りのファイル名と区別がつきにくいです。ls -l を使うと、各ファイルが1行ずつ表示されてはっきり見分けられます。",
      "シングルクォート ' で囲むと、中身がそのままの文字列としてシェルに渡せます。例: cat 'hidden words inside.txt'",
      "ダブルクォート \" でも基本は同じですが、$ や ` が中で展開される点が異なります。",
      "クォートを使わずに、空白の前にバックスラッシュ \\ を置くという方法もあります。Tab で補完すると、シェルが自動でエスケープしてくれます。"
    ],
    approach:
`1. ls -l でファイル一覧を見ると、"hidden words inside.txt" という空白入りのファイルがあるとわかります。
2. cat 'hidden words inside.txt' のようにシングルクォートで囲んで開きます。
3. もしくは cat hidden\\ words\\ inside.txt のようにバックスラッシュで空白をエスケープします。
4. Tab 補完を使うと、シェルが自動でエスケープを入れてくれるので楽です: cat hi <Tab>`,
    password: "wrap-paths-with-quotes-when-spaced",
    fs: {
      user: "bandit2",
      hostname: "training-server",
      home: "/home/bandit2",
      cwd: "/home/bandit2",
      files: {
        "/home/bandit2/hidden words inside.txt": {
          type: "file",
          owner: "bandit2",
          group: "bandit2",
          mode: "0644",
          content:
`このレベル (Level 2) のパスワード:
wrap-paths-with-quotes-when-spaced

空白を含むファイル名は、必ずクォートかエスケープで囲みましょう。
忘れると、シェルは別々のファイル名として解釈してしまいます。
`
        },
        "/home/bandit2/note.txt": {
          type: "file",
          owner: "bandit2",
          group: "bandit2",
          mode: "0644",
          content:
`このファイルにはパスワードはありません。
本当のパスワードは、空白を含む別のファイルに入っています。
`
        }
      }
    }
  },

  // --------------------------------------------------------
  3: {
    story:
`bandit3 では、ホームディレクトリの中に「inhere」という名前のサブディレクトリがあります。
このサブディレクトリには、ふつうに ls してもなかなか見えてこないファイルが置かれています。

Linux では、名前がドット (.) で始まるファイル・ディレクトリは「隠しファイル」として扱われます。
ls はデフォルトでは隠しファイルを表示しません。
オプション 1 つで、隠れた仲間も見えるようにしてあげましょう。`,
    skills: ["cd", "ls -a", "cat"],
    hints: [
      "まずは inhere/ の中に移動するか、ls inhere の形で中身を覗いてみましょう。",
      "ls だけでは見つからないかもしれません。隠しファイルは . で始まる名前を持っています。",
      "ls -a で隠しファイルも含めて表示できます。"
    ],
    approach:
`1. cd inhere で inhere ディレクトリに移動。
2. ls だけだと何も見えない、または手がかりが少ないはず。
3. ls -a を試してみましょう。.note のような名前が見えるはずです。
4. cat .note でその中身を読み、パスワードを取得します。`,
    password: "dot-prefixed-files-are-still-real",
    fs: {
      user: "bandit3",
      hostname: "training-server",
      home: "/home/bandit3",
      cwd: "/home/bandit3",
      files: {
        "/home/bandit3/inhere": {
          type: "dir",
          owner: "bandit3",
          group: "bandit3",
          mode: "0755"
        },
        "/home/bandit3/inhere/.note": {
          type: "file",
          owner: "bandit3",
          group: "bandit3",
          mode: "0644",
          content:
`このレベル (Level 3) のパスワード:
dot-prefixed-files-are-still-real

ドット始まりは「隠したい」というよりは「ふつう表示したくない」設定ファイルや
履歴ファイルなどによく使われます。たとえば ~/.bashrc, ~/.ssh/ など。
`
        }
      }
    }
  },

  // --------------------------------------------------------
  4: {
    story:
`bandit4 のホームディレクトリには inhere というサブディレクトリがあり、
その中には10個ほどのファイルが置かれています。
ところが、ほとんどのファイルは中身がぐちゃぐちゃなバイナリで、
そのまま cat すると画面が文字化けで荒れてしまいます。

10個のうち、人間が読めるテキスト形式のファイルは1つだけ。
そのファイルを見つけ出し、中身を読みましょう。`,
    skills: ["file", "glob (*)", "cat"],
    hints: [
      "ファイルが「テキストか・バイナリか・空か」を判定するには file コマンドを使います。",
      "file inhere/* のように * を使うと、ディレクトリ内の全ファイルをまとめて指定できます。",
      "file の出力で 'data' と表示されるのはバイナリ (人間が読めない) です。'ASCII text' と表示されるのが人間が読めるテキストです。"
    ],
    approach:
`1. cd inhere で inhere に入ります。
2. file ./* でこのディレクトリの全ファイルの種類を一覧します。
3. ほとんどが 'data' (バイナリ) と表示されますが、1つだけ 'ASCII text' と出ます。
4. その1つを cat ./fileXX で開けば、パスワードが書かれています。`,
    password: "ascii-rises-among-binary-noise-04",
    fs: {
      user: "bandit4", hostname: "training-server",
      home: "/home/bandit4", cwd: "/home/bandit4",
      files: {
        "/home/bandit4/inhere": { type: "dir", owner: "bandit4", group: "bandit4", mode: "0755" },
        "/home/bandit4/inhere/file00": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content: "\x00\x01\x02noise junk binary\x03\x04" },
        "/home/bandit4/inhere/file01": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content: "\x07\x08garbage data here\x10\x11more" },
        "/home/bandit4/inhere/file02": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content: "\x00binary noise\x0e\x0fend" },
        "/home/bandit4/inhere/file03": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content: "\x10\x11\x12random binary\x13\x14" },
        "/home/bandit4/inhere/file04": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content: "\x00\x01\x02\x03\x04random\x05\x06\x07" },
        "/home/bandit4/inhere/file05": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content: "\x10\x11garbage data\x12\x13\x14\x15" },
        "/home/bandit4/inhere/file06": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content: "\x00\x00\x00binary stuff\x01\x02" },
        "/home/bandit4/inhere/file07": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content:
`Password for the next level:
ascii-rises-among-binary-noise-04

The 'file' command peeks inside files to detect their type,
so it works even when extensions are missing or wrong.
` },
        "/home/bandit4/inhere/file08": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content: "\x07\x08\x10\x11binary too\x0e" },
        "/home/bandit4/inhere/file09": { type: "file", owner: "bandit4", group: "bandit4", mode: "0644", content: "\x00\x01\x02\x03\x04binary stuff here\x05\x06" }
      }
    }
  },

  // --------------------------------------------------------
  5: {
    story:
`bandit5 のホームディレクトリには inhere というサブディレクトリがあります。
その中にはさらに maybehere00 〜 maybehere05 という6つのサブディレクトリがあり、
合わせて多数のファイルが散らばっています。

このレベルでは、目当てのファイルが1つだけあります。条件は次の通り:
  - 人間が読めるテキスト
  - サイズは 32 バイト
1つずつ cat していたら日が暮れてしまいます。
find で条件を組み合わせて1発で見つけましょう。`,
    skills: ["find", "-size", "-type"],
    hints: [
      "find コマンドは条件に合致するファイルを再帰的に探してくれます。",
      "サイズで絞り込むには -size オプション。バイト単位の指定は数字の後ろに c をつけます (例: -size 32c)。",
      "ディレクトリではなくファイルだけを対象にしたいときは -type f を加えます。"
    ],
    approach:
`1. find inhere -type f -size 32c のように、種別とサイズの両方を指定して探します。
2. 該当ファイルが1つ見つかります。表示されたパスを cat に渡せば中身が読めます。
3. 中の文字列がパスワードです。`,
    password: "size-and-shape-not-just-name-05",
    fs: {
      user: "bandit5", hostname: "training-server",
      home: "/home/bandit5", cwd: "/home/bandit5",
      files: {
        "/home/bandit5/inhere": { type: "dir", owner: "bandit5", group: "bandit5", mode: "0755" },
        "/home/bandit5/inhere/maybehere00": { type: "dir", owner: "bandit5", group: "bandit5", mode: "0755" },
        "/home/bandit5/inhere/maybehere00/file_a": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "junk" },
        "/home/bandit5/inhere/maybehere00/file_b": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "small junk file" },
        "/home/bandit5/inhere/maybehere01": { type: "dir", owner: "bandit5", group: "bandit5", mode: "0755" },
        "/home/bandit5/inhere/maybehere01/file_a": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "this is medium length data for test" },
        "/home/bandit5/inhere/maybehere01/file_b": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "padding text to vary the size sufficiently more" },
        "/home/bandit5/inhere/maybehere02": { type: "dir", owner: "bandit5", group: "bandit5", mode: "0755" },
        "/home/bandit5/inhere/maybehere02/file_a": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "some longer content for the filler files in this lesson" },
        "/home/bandit5/inhere/maybehere02/file_b": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "tiny" },
        "/home/bandit5/inhere/maybehere03": { type: "dir", owner: "bandit5", group: "bandit5", mode: "0755" },
        "/home/bandit5/inhere/maybehere03/file_a": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "a much larger blob of decoy data taking up many bytes here too." },
        "/home/bandit5/inhere/maybehere03/passwords-final": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "size-and-shape-not-just-name-05\n" },
        "/home/bandit5/inhere/maybehere04": { type: "dir", owner: "bandit5", group: "bandit5", mode: "0755" },
        "/home/bandit5/inhere/maybehere04/file_a": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "small junk file" },
        "/home/bandit5/inhere/maybehere05": { type: "dir", owner: "bandit5", group: "bandit5", mode: "0755" },
        "/home/bandit5/inhere/maybehere05/file_a": { type: "file", owner: "bandit5", group: "bandit5", mode: "0644", content: "padding text to vary the size sufficiently more" }
      }
    }
  },

  // --------------------------------------------------------
  6: {
    story:
`bandit6 のサーバーでは、目当てのファイルがホームディレクトリの中ではなく、
システムのどこかに置かれています。ヒントとなる属性は次の通り:
  - 所有者: bandit7
  - グループ: bandit6
  - サイズ: 35 バイト

これら3つの条件を満たすファイルは、サーバー内に1つだけ存在します。
ホーム以外の場所も含め、find でルート (/) から探しましょう。`,
    skills: ["find", "-user", "-group", "-size"],
    hints: [
      "find に -user / -group オプションを渡すと、所有者とグループで絞り込みできます。",
      "ルート (/) から再帰的に探すには find / と打ちます。",
      "3つの条件 (-user / -group / -size) は重ねて指定できます。",
      "実機では権限エラー行が大量に出るので 2>/dev/null で抑える定番がありますが、この仮想シェルでは不要です。"
    ],
    approach:
`1. find / -user bandit7 -group bandit6 -size 35c とまとめて指定します。
2. 該当する 1ファイルだけがパスとして出力されます。
3. そのパスを cat で開けば、パスワードが手に入ります。`,
    password: "owner-and-group-as-fingerprints-06",
    fs: {
      user: "bandit6", hostname: "training-server",
      home: "/home/bandit6", cwd: "/home/bandit6",
      files: {
        "/home/bandit6/notes.txt": { type: "file", owner: "bandit6", group: "bandit6", mode: "0644", content: "ホームには手がかりはなさそう。\nfind で / から探そう。\n" },
        // 同 owner だが別 group の囮
        "/etc/banditpasswords": { type: "dir", owner: "root", group: "root", mode: "0755" },
        "/etc/banditpasswords/data": { type: "file", owner: "bandit7", group: "bandit5", mode: "0644", content: "decoy with wrong group, irrelevant content here" },
        // 別 owner、自グループの囮
        "/var/spool/banditfiles": { type: "dir", owner: "root", group: "root", mode: "0755" },
        "/var/spool/banditfiles/temp01": { type: "file", owner: "bandit7", group: "bandit6", mode: "0644", content: "decoy file in spool, owner bandit7 group bandit6." },
        "/var/spool/banditfiles/temp02": { type: "file", owner: "bandit7", group: "bandit6", mode: "0644", content: "this is the second decoy in spool with owner bandit7 and group bandit6 but with totally different size from the actual target file we are looking for." },
        // ターゲット
        "/var/lib/data": { type: "dir", owner: "root", group: "root", mode: "0755" },
        "/var/lib/data/secret": { type: "file", owner: "bandit7", group: "bandit6", mode: "0640", content: "owner-and-group-as-fingerprints-06\n" }
      }
    }
  },

  // --------------------------------------------------------
  7: {
    story:
`bandit7 のホームには data.txt という大きなテキストファイルがあります。
中には 「順位の名前 + タブ + 値」 というフォーマットの行が大量に並んでおり、
その中の "millionth" の行に、次のレベルへのパスワードが書かれています。

cat で全部表示してから目で探すのは大変です。
パターンに合致する行だけ抜き出すには、grep が定番です。`,
    skills: ["grep", "パイプ", "cat"],
    hints: [
      "grep <パターン> <ファイル> で、ファイル内のパターンに合致する行だけを表示できます。",
      "grep millionth data.txt と打てば、millionth を含む行が一発で出てきます。",
      "cat data.txt | grep millionth のように、パイプで繋ぐ書き方も同じ結果になります。"
    ],
    approach:
`1. cat data.txt で中身をざっと眺めると、行数が多くて目で探すのは厳しいとわかります。
2. grep millionth data.txt と打てば、目的の1行だけが抜き出せます。
3. その行のタブの右側がパスワードです。`,
    password: "needle-found-by-pattern-not-luck-07",
    fs: {
      user: "bandit7", hostname: "training-server",
      home: "/home/bandit7", cwd: "/home/bandit7",
      files: {
        "/home/bandit7/data.txt": { type: "file", owner: "bandit7", group: "bandit7", mode: "0644", content:
`first\tapple
second\tbanana
third\tcherry
fourth\tdate
fifth\telderberry
tenth\tfig
hundredth\tguava
thousandth\thuckleberry
ten-thousandth\tindian-fig
hundred-thousandth\tjackfruit
millionth\tneedle-found-by-pattern-not-luck-07
billionth\tmango
trillionth\tpapaya
quadrillionth\tquince
quintillionth\traspberry
sextillionth\tstrawberry
septillionth\ttangerine
octillionth\tugli-fruit
nonillionth\tvoavanga
decillionth\twatermelon
googol\txigua
googolplex\tyellow-passion-fruit
infinity\tzucchini-flower
end-of-list\tdone
` }
      }
    }
  },

  // --------------------------------------------------------
  8: {
    story:
`bandit8 のホームには data.txt があります。中には文字列が並んでいますが、
ほとんどの行は何度も同じものが繰り返されています。
ただ1つだけ、その中にたった1回しか登場しない「孤独な行」があり、
それが次のレベルへのパスワードです。

並び替えと重複処理を組み合わせて、その1行を浮かび上がらせましょう。`,
    skills: ["sort", "uniq", "パイプ"],
    hints: [
      "uniq は「連続する」重複行をまとめます。バラバラに散らばった重複を扱うには、まず sort で揃えてから uniq に渡す必要があります。",
      "uniq -u オプションを使うと、重複が一切ない行 (1回だけ出現する行) だけを表示できます。",
      "コマンド同士はパイプ | で繋げます。'sort data.txt | uniq -u' と書くと、sort の結果が uniq の入力になります。"
    ],
    approach:
`1. cat data.txt で中身を見ると、同じ単語が繰り返し並んでいるとわかります。
2. sort data.txt | uniq -u と打つと、1度しか出現しない行だけが残ります。
3. それがパスワードです。`,
    password: "alone-amid-the-chorus-of-eight-08",
    fs: {
      user: "bandit8", hostname: "training-server",
      home: "/home/bandit8", cwd: "/home/bandit8",
      files: {
        "/home/bandit8/data.txt": { type: "file", owner: "bandit8", group: "bandit8", mode: "0644", content:
`apple
banana
cherry
apple
banana
cherry
apple
date
banana
date
cherry
apple
date
banana
alone-amid-the-chorus-of-eight-08
cherry
apple
date
banana
cherry
date
` }
      }
    }
  },

  // --------------------------------------------------------
  9: {
    story:
`bandit9 のホームには data.txt があります。中身は大半がバイナリのゴミですが、
ところどころに人間が読める文字列が紛れ込んでいます。
パスワードは、印字可能な文字列のうち、'==' という記号で囲まれた1行に書かれています。

バイナリの中から印字可能な文字列だけを取り出すには strings コマンドを使います。
そこから '==' を含む行だけ拾い上げれば、パスワードに辿り着けます。`,
    skills: ["strings", "grep", "パイプ"],
    hints: [
      "strings はバイナリファイルの中から、印字可能な ASCII 文字が4文字以上連続している部分を抜き出します。",
      "strings data.txt と打つだけで、ファイル中の人間が読める文字列が一覧表示されます。",
      "出力をさらに絞り込むには grep が便利。strings data.txt | grep = で '=' を含む行だけが残ります。"
    ],
    approach:
`1. cat data.txt をすると画面が文字化けで荒れます (バイナリのため)。
2. strings data.txt で印字可能な文字列だけを取り出します。
3. そこから '==' を含む行だけにするには、 strings data.txt | grep == とパイプします。
4. 表示された === ... === に挟まれた文字列がパスワードです。`,
    password: "printable-string-from-binary-haze-09",
    fs: {
      user: "bandit9", hostname: "training-server",
      home: "/home/bandit9", cwd: "/home/bandit9",
      files: {
        "/home/bandit9/data.txt": { type: "file", owner: "bandit9", group: "bandit9", mode: "0644", content:
"\x00\x00\x01\x02first decoy string here\x00\x00\x01\x02\x03more random data\x00\x00\x00\x00\x01\x02\x03=== printable-string-from-binary-haze-09 ===\x00\x00\x00\x01another scrap of text here\x00\x02\x03\x04short\x00\x05\x06trailing string at the end of file\x00\x00"
        }
      }
    }
  },

  // --------------------------------------------------------
  10: {
    story:
`bandit10 のホームには data.txt があります。中身は cat してもアルファベットと記号が並ぶばかりで、
何が書かれているかさっぱり分かりません。

これは Base64 という、バイナリやテキストを ASCII の限られた文字種だけで表現する方式で
エンコードされた状態です。元の文字列に戻すには、デコードが必要です。`,
    skills: ["base64", "リダイレクト", "cat"],
    hints: [
      "Base64 は = で終わることが多く、A-Za-z0-9+/= の文字だけで構成されています。これを見たら base64 デコードを疑いましょう。",
      "デコードするには base64 -d ファイル名 と打ちます。-d は decode の意味です。",
      "パイプで cat data.txt | base64 -d としても同じ結果になります。"
    ],
    approach:
`1. cat data.txt で内容を確認。Base64 っぽい文字列だと気づきます。
2. base64 -d data.txt でデコードします。
3. デコード結果の中にパスワードが書かれています。`,
    password: "decode-the-armor-and-read-clearly-10",
    fs: {
      user: "bandit10", hostname: "training-server",
      home: "/home/bandit10", cwd: "/home/bandit10",
      files: {
        "/home/bandit10/data.txt": { type: "file", owner: "bandit10", group: "bandit10", mode: "0644", content:
"VGhlIHBhc3N3b3JkIGZvciB0aGUgbmV4dCBsZXZlbCBpczoKZGVjb2RlLXRoZS1hcm1vci1hbmQtcmVhZC1jbGVhcmx5LTEwCg==\n"
        }
      }
    }
  },

  // --------------------------------------------------------
  11: (function () {
    const PW = "rotate-thirteen-and-read-truth-11";
    return {
      story:
`bandit11 のホームディレクトリには data.txt があります。
中身は英字ばかりで、一見すると意味のない文字列に見えますが、よく観察すると
「アルファベットを 13 文字ずらす」とふつうの英文に戻りそうです。

これは ROT13 という、シーザー暗号の一種です。各アルファベットを A→N、B→O...
のように 13 文字シフトすると元に戻る (ROT13 は自己逆変換)。
このシフトを tr コマンドでやってみましょう。`,
      skills: ["tr", "ROT13", "パイプ"],
      hints: [
        "tr は 1 文字ずつ別の文字に置き換えるコマンドです。tr 'abc' 'xyz' なら a→x, b→y, c→z。",
        "ROT13 は a→n, b→o, ..., m→z, n→a, ..., z→m と置換します。大文字も同様。",
        "cat data.txt | tr 'A-Za-z' 'N-ZA-Mn-za-m' が定石です。前半 (A-Za-z) と後半 (N-ZA-Mn-za-m) の文字数を合わせます。"
      ],
      approach:
`1. cat data.txt で内容を確認。"The password for the next level is:" の ROT13 化したような文字列が見えます。
2. cat data.txt | tr 'A-Za-z' 'N-ZA-Mn-za-m' で ROT13 を解きます。
3. 復号文の中にパスワードがあります。`,
      password: PW,
      fs: {
        user: "bandit11", hostname: "training-server",
        home: "/home/bandit11", cwd: "/home/bandit11",
        files: {
          "/home/bandit11/data.txt": { type: "file", owner: "bandit11", group: "bandit11", mode: "0644",
            content: _rot13("The password for the next level is:\n" + PW + "\n\nROT13 is its own inverse: applying it twice returns the original.\n") }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  12: (function () {
    const PW = "navigate-the-nested-archives-12";
    // 元テキスト → gzip → bzip2 → tar → xz → gzip の入れ子。
    // その上で xxd 風の hex ダンプにしてから data.txt に格納する。
    // 解き方: xxd -r で復元 → file で形式判定 → 適切に解凍 → 繰り返し。
    const finalText = "The password is:\n" + PW + "\n";
    let blob = _gz(finalText);                                            // .gz
    blob = _bz(blob);                                                     // .gz → .bz2
    blob = _tar([{ name: "step3.bz2", mode: 0o644, content: blob }]);     // → tar
    blob = _xz(blob);                                                     // .tar → .xz
    blob = _gz(blob);                                                     // .xz → .gz
    const hexDump = _hexdump(blob);
    return {
      story:
`bandit12 のホームにある data.txt は、いろいろな圧縮形式が入れ子になったバイナリを
16 進ダンプしたテキストです。

cat data.txt すると "00000000: 1f8b 0800 ..." のような行が並びます。
これを xxd -r で元のバイナリに戻し、file で形式を判定して順に解凍していくと、
最終的にパスワードを含むテキストにたどり着けます。`,
      skills: ["xxd", "file", "gzip/bzip2/xz", "tar", "mv"],
      hints: [
        "まず作業用のディレクトリを mkdir /tmp/work; cp data.txt /tmp/work; cd /tmp/work で作って、そこで作業すると安心です。",
        "xxd -r data.txt > data.bin で 16 進ダンプを元のバイナリに戻せます。出力リダイレクトで保存。",
        "file data.bin で形式を確認。gzip / bzip2 / XZ / POSIX tar のいずれかが出るはずです。",
        "形式に応じて拡張子を mv で付け替える → gunzip / bunzip2 / unxz / tar xf で展開、を繰り返します。",
        "解凍するたびに新しいファイルが出てくるので、また file で確認 → 適切に解凍、を続けます。"
      ],
      approach:
`1. cp data.txt /tmp/work-bandit12; cd /tmp/work-bandit12 (好みの作業場所で)
2. xxd -r data.txt > step.bin
3. file step.bin で形式を確認。例えば "gzip compressed data" と出る。
4. mv step.bin step.gz; gunzip step.gz → step が得られる。
5. また file step で次の形式を確認。XZ なら mv step step.xz; unxz step.xz。
6. tar アーカイブなら mv → tar xf で展開。
7. これを 5 層繰り返すと最終的に ASCII テキストが現れ、その中にパスワードが書かれています。`,
      password: PW,
      fs: {
        user: "bandit12", hostname: "training-server",
        home: "/home/bandit12", cwd: "/home/bandit12",
        files: {
          "/home/bandit12/data.txt": { type: "file", owner: "bandit12", group: "bandit12", mode: "0644",
            content: hexDump }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  13: (function () {
    const PW = "private-key-unlocks-the-next-door-13";
    // SSH 公開鍵認証の擬似化: bandit13 のホームに sshkey.private (秘密鍵) があり、
    // それで bandit14@localhost にログインできる。ログイン後に
    // /etc/bandit_pass/bandit14 を cat する (remoteFs に置いた) ことで次のパスワードを取得。
    const PRIVKEY =
"-----BEGIN RSA PRIVATE KEY-----\n" +
"MIIEpAIBAAKCAQEAxk1tdF1FbjcD8GpV1xkQzN5Wd2zNvKxFQjVqGmbU93rDfXc+\n" +
"VfL3Mzd1mLpC4z2P9k7ZTfa6gXh3sLpVxLgYRyKvBLAi8w5tnVpRTBgQTrPxKsLM\n" +
"y6jLZBjBb5LZTkH5pX0QyM0EHWcOj3OAh1cFTuFTBQbm5VFUkSWnhBgEY7pY3F5g\n" +
"(これは Shell 内のテスト用ダミー鍵です)\n" +
"-----END RSA PRIVATE KEY-----\n";
    return {
      story:
`bandit13 のホームディレクトリには sshkey.private という名のファイルが置かれています。
内容は SSH の秘密鍵 (PEM 形式) です。

このサーバーで bandit14 にログインするには、パスワードではなくこの秘密鍵で
公開鍵認証する必要があります (パスワード認証は無効化されています)。

ssh コマンドで秘密鍵を指定して bandit14 として localhost にログインし、
ホームに置かれている readme を読んでみましょう。`,
      skills: ["ssh", "公開鍵認証", "ssh -i"],
      hints: [
        "公開鍵認証では、相手のサーバーに登録された公開鍵に対応する秘密鍵をクライアント側で提示します。",
        "ssh コマンドで秘密鍵ファイルを指定するには -i オプション: ssh -i 秘密鍵 user@host のように使います。",
        "秘密鍵のパーミッションが他のユーザーから読める設定 (例: 0644) だと ssh は鍵を拒否します。chmod 600 等で絞ってから -i で渡します。",
        "ログインが成功したら、bandit14 として実行されるコマンドを ssh の引数に直接渡して結果を得る方法もあります (例: ssh -i key bandit14@localhost cat readme)。"
      ],
      approach:
`1. ls で sshkey.private があることを確認。
2. (このシェルでは既に 0600 ですが、念のため) ls -l sshkey.private でパーミッションを確認。
3. ssh -i sshkey.private bandit14@localhost cat readme で、bandit14 として readme を直接読みます。
4. 出力の中にパスワードが書かれています。`,
      password: PW,
      fs: {
        user: "bandit13", hostname: "training-server",
        home: "/home/bandit13", cwd: "/home/bandit13",
        files: {
          "/home/bandit13/sshkey.private": { type: "file", owner: "bandit13", group: "bandit13", mode: "0600",
            content: PRIVKEY }
        },
        sshKeys: {
          "bandit14@localhost": {
            authorizedKey: PRIVKEY,
            remoteFs: {
              user: "bandit14", hostname: "training-server",
              home: "/home/bandit14", cwd: "/home/bandit14",
              files: {
                "/home/bandit14/readme": { type: "file", owner: "bandit14", group: "bandit14", mode: "0640",
                  content: "次のレベル (Level 14) のパスワード:\n" + PW + "\n\n秘密鍵 1 本でドアが開く。これがパスワード認証より強い理由を考えてみましょう。\n" }
              }
            },
            onAuth: () => "Welcome to bandit14's shell.\n"
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  14: (function () {
    const PW_14 = "private-key-unlocks-the-next-door-13";   // 当レベルに入るためのパスワード (Lv13 の答え)
    const PW_15 = "tell-the-server-your-current-password-14";
    return {
      story:
`bandit14 では、自分自身のパスワード (今あなたが使ったもの) を localhost の 30000 番ポートに
送ると、次のレベルのパスワードが返ってきます。

ネットワーク経由とは言っても、自分自身のマシンに送るだけです。nc (netcat) という、
TCP の素朴な送受信ができるコマンドを使います。`,
      skills: ["nc", "パイプ", "/etc/bandit_pass"],
      hints: [
        "/etc/bandit_pass/bandit14 に自分のパスワードがあります。cat で読めます (自分自身は読めるよう設定済)。",
        "echo や cat の出力をパイプで nc に渡すと、相手のポートに送信されます。",
        "nc localhost 30000 のように接続します。標準入力で送ったテキストへのサーバ応答が標準出力に出ます。",
        "成功すれば、応答に次のレベルのパスワードが含まれます。"
      ],
      approach:
`1. cat /etc/bandit_pass/bandit14 で自分のパスワードを確認 (今ログインしたパスワードと一致)。
2. cat /etc/bandit_pass/bandit14 | nc localhost 30000 でパイプ送信。
3. サーバの応答が次のレベルのパスワードです。`,
      password: PW_15,
      fs: {
        user: "bandit14", hostname: "training-server",
        home: "/home/bandit14", cwd: "/home/bandit14",
        files: {
          "/etc/bandit_pass/bandit14": { type: "file", owner: "bandit14", group: "bandit14", mode: "0400",
            content: PW_14 + "\n" }
        },
        ports: {
          30000: {
            tls: false,
            banner: "shell-pass-checker 1.0",
            handler: (input) => {
              const got = String(input || "").trim();
              if (got === PW_14) return "Correct!\n" + PW_15 + "\n";
              return "Wrong! ご自分の現在のパスワードを送ってください。\n";
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  15: (function () {
    const PW_15 = "tell-the-server-your-current-password-14";
    const PW_16 = "tls-wraps-the-conversation-15";
    return {
      story:
`bandit15 では、Lv14 と似た仕組みですが、相手のポートが TLS (SSL) で暗号化されています。
ふつうの nc では暗号化を喋れないので、openssl の s_client サブコマンドを使います。

自分の現在のパスワードを 30001 番ポート (TLS) に送れば、次のレベルのパスワードが返ります。`,
      skills: ["openssl s_client", "TLS", "ハンドシェイク"],
      hints: [
        "nc localhost 30001 で接続を試すと、応答がバイナリ的なものになり、TLS だと気付けます。",
        "openssl s_client -connect localhost:30001 で TLS 越しに接続できます。",
        "openssl s_client は接続時にバナーや証明書情報を表示します。実際の対話に集中するには -quiet を付けると邪魔な情報が消えます。",
        "echo \"$(cat /etc/bandit_pass/bandit15)\" | openssl s_client -connect localhost:30001 -quiet でパスワードを送れます。"
      ],
      approach:
`1. nc localhost 30001 を試すと TLS だと気付かされます (応答がバイナリ)。
2. cat /etc/bandit_pass/bandit15 で自分のパスワードを確認。
3. cat /etc/bandit_pass/bandit15 | openssl s_client -connect localhost:30001 -quiet
4. 応答に次のレベルのパスワードが含まれます。`,
      password: PW_16,
      fs: {
        user: "bandit15", hostname: "training-server",
        home: "/home/bandit15", cwd: "/home/bandit15",
        files: {
          "/etc/bandit_pass/bandit15": { type: "file", owner: "bandit15", group: "bandit15", mode: "0400",
            content: PW_15 + "\n" }
        },
        ports: {
          30001: {
            tls: true,
            banner: "shell-pass-checker (TLS) 1.0",
            handler: (input) => {
              const got = String(input || "").trim();
              if (got === PW_15) return "Correct!\n" + PW_16 + "\n";
              return "Wrong! ご自分の現在のパスワードを TLS で送ってください。\n";
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  16: (function () {
    const PW_16 = "tls-wraps-the-conversation-15";
    const PW_17 = "scan-the-doors-find-the-key-16";
    const PRIVKEY_17 =
"-----BEGIN RSA PRIVATE KEY-----\n" +
"MIIEowIBAAKCAQEAtest17keytest17keytest17keytest17keytest17keyXX==\n" +
"-----END RSA PRIVATE KEY-----\n";
    // 30100-30200 の範囲に複数ポートを置く。
    // - 大半は echo サーバ
    // - 一部は TLS の echo
    // - 1 つだけ TLS で、正解パスワードを送ると秘密鍵を返す
    const ports = {};
    const echoH = input => String(input || "");
    ports[30101] = { tls: false, handler: echoH };
    ports[30115] = { tls: false, handler: echoH };
    ports[30130] = { tls: true,  handler: echoH };
    ports[30144] = { tls: true,  handler: echoH };
    ports[30180] = { tls: true,  handler: (input) => {
      if (String(input || "").trim() === PW_16) return PRIVKEY_17;
      return "Wrong.\n";
    }};
    ports[30195] = { tls: false, handler: echoH };
    return {
      story:
`bandit16 では、自分のパスワードを 30100〜30200 番のどれか 1 つのポートに送ると
秘密鍵が返ってきます。鍵は次のレベル (bandit17) として ssh ログインするのに使います。

ただし、どのポートが開いているか自分で調べないといけません。さらに、開いているポートの中でも
TLS を喋るもの・喋らないものが混在しており、TLS の中でも echo するだけ (送ったものをそのまま返す) のもの
が大半です。正解のポートは 1 つだけ。`,
      skills: ["nmap", "openssl s_client", "ポートスキャン", "TLS 判別"],
      hints: [
        "nmap localhost -p 30100-30200 で開いているポート一覧が得られます。",
        "nmap -sV を付けると各ポートのサービス種別を推定します。TLS のポートは ssl/unknown と表示されます。",
        "TLS ポートには openssl s_client、平文ポートには nc で接続できます。",
        "各ポートに自分の現在のパスワードを送り、応答が「送ったテキストと同じ (echo) でないもの」を探します。",
        "正解ポートからは BEGIN RSA PRIVATE KEY で始まる秘密鍵テキストが返ります。"
      ],
      approach:
`1. nmap -sV localhost -p 30100-30200 で開いているポートと TLS/非TLS を一覧。
2. 平文ポートには cat /etc/bandit_pass/bandit16 | nc localhost <port> で送って応答を確認。echo なので同じ文字列が返るだけ。
3. TLS ポートには cat /etc/bandit_pass/bandit16 | openssl s_client -connect localhost:<port> -quiet で順に試す。
4. ある TLS ポートだけは秘密鍵テキストを返します。それを取り出して保存。
5. 取り出した鍵で ssh -i 鍵 bandit17@localhost cat /etc/bandit_pass/bandit17 のように次レベルのパスワードを読みます。`,
      password: PW_17,
      fs: {
        user: "bandit16", hostname: "training-server",
        home: "/home/bandit16", cwd: "/home/bandit16",
        files: {
          "/etc/bandit_pass/bandit16": { type: "file", owner: "bandit16", group: "bandit16", mode: "0400",
            content: PW_16 + "\n" }
        },
        ports,
        sshKeys: {
          "bandit17@localhost": {
            authorizedKey: PRIVKEY_17,
            remoteFs: {
              user: "bandit17", hostname: "training-server",
              home: "/home/bandit17", cwd: "/home/bandit17",
              files: {
                "/etc/bandit_pass/bandit17": { type: "file", owner: "bandit17", group: "bandit17", mode: "0400",
                  content: PW_17 + "\n" }
              }
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  17: (function () {
    const PW = "the-only-line-that-differs-17";
    // ホームに passwords.old と passwords.new。1 行だけが異なる。
    // 異なっている方の行 (new の追加行) がパスワード。
    const baseLines = [
      "alpha-2026-spring", "beta-2025-winter", "gamma-2024-summer", "delta-2023-autumn",
      "epsilon-2022-spring", "zeta-2021-winter", "eta-2020-summer", "theta-2019-autumn"
    ];
    const oldContent = baseLines.join("\n") + "\n";
    // new は base から 1 行差し替え (位置 4 を PW に差し替え)
    const newLines = baseLines.slice();
    newLines[4] = PW;
    const newContent = newLines.join("\n") + "\n";
    return {
      story:
`bandit17 のホームには passwords.old と passwords.new の 2 つのファイルがあります。
中身はほとんど同じですが、1 行だけ違う行が含まれています。

その 1 行 (新しい方にあって古い方にない行) が次のパスワードです。`,
      skills: ["diff", "比較", "テキスト処理"],
      hints: [
        "diff コマンドで 2 つのテキストファイルの違いを表示できます。",
        "diff passwords.old passwords.new で違いが出ます。'<' が古い方の行、'>' が新しい方の行を意味します。",
        "新しい方にだけある行 (> で始まる行) が答えです。"
      ],
      approach:
`1. diff passwords.old passwords.new で違いを確認。
2. '>' で始まる行が新しい方にだけ存在する行。その行がパスワードです。`,
      password: PW,
      fs: {
        user: "bandit17", hostname: "training-server",
        home: "/home/bandit17", cwd: "/home/bandit17",
        files: {
          "/home/bandit17/passwords.old": { type: "file", owner: "bandit17", group: "bandit17", mode: "0644",
            content: oldContent },
          "/home/bandit17/passwords.new": { type: "file", owner: "bandit17", group: "bandit17", mode: "0644",
            content: newContent }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  18: (function () {
    const PW_18 = "the-only-line-that-differs-17";        // このレベルに入るために使ったパスワード
    const PW_19 = "bypass-bashrc-with-direct-command-18";
    const KEY =
"-----BEGIN RSA PRIVATE KEY-----\n" +
"MIIEpAIBAAKCAQEAt18keyforbandit18bypassbashrctest18bypassbashrcXX\n" +
"-----END RSA PRIVATE KEY-----\n";
    return {
      story:
`bandit18 のサーバーは、bandit18 でログインしようとすると .bashrc がすぐに exit してしまい、
ふつうの対話シェルでは何もできません。

けれど、ssh では「ログイン後にコマンドを実行する」という使い方ができます。
ssh user@host コマンド名 と書くと、リモート側で対話シェルを起動せずに直接そのコマンドだけが
走り、結果が返ってきます。.bashrc を実行する余地がない (もしくは無視される) 経路です。

このレベルでは、あなたは bandit17 として動いています。ホームの sshkey.private を使って
bandit18 にログインし、~/readme を読み出してみましょう。`,
      skills: ["ssh", "リモートコマンド実行", ".bashrc バイパス"],
      hints: [
        "ssh -i sshkey.private bandit18@localhost で繋ぐと、相手の .bashrc がすぐ exit するため何も得られません。",
        "ssh の最後にコマンドを書くと、対話シェルではなくそのコマンドを 1 回だけ実行する方法になります。",
        "ssh -i sshkey.private bandit18@localhost cat readme を試してみましょう。"
      ],
      approach:
`1. ssh -i sshkey.private bandit18@localhost で繋ぐと「Connection closed」のように切られる。
2. ssh -i sshkey.private bandit18@localhost cat readme で .bashrc を経由せず readme を読む。
3. 出力にパスワードが含まれます。`,
      password: PW_19,
      fs: {
        user: "bandit17", hostname: "training-server",    // 教育的に bandit17 のまま
        home: "/home/bandit17", cwd: "/home/bandit17",
        files: {
          "/home/bandit17/sshkey.private": { type: "file", owner: "bandit17", group: "bandit17", mode: "0600",
            content: KEY }
        },
        sshKeys: {
          "bandit18@localhost": {
            authorizedKey: KEY,
            autoExit: true,
            onAuth: () => "shell-server: .bashrc によって直ちに切断されました\n",
            remoteFs: {
              user: "bandit18", hostname: "training-server",
              home: "/home/bandit18", cwd: "/home/bandit18",
              files: {
                "/home/bandit18/readme": { type: "file", owner: "bandit18", group: "bandit18", mode: "0640",
                  content: "次のレベル (Level 19) のパスワード:\n" + PW_19 + "\n\n.bashrc がうるさい時は、対話シェルを介さず直接コマンドを送る手があります。\n" }
              }
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  19: (function () {
    const PW = "setuid-runs-as-the-owner-19";
    return {
      story:
`bandit19 のホームディレクトリには bandit20-do という名前の小さな setuid バイナリが置かれています。

このバイナリは「自分が指定したコマンドを bandit20 として実行する」シンプルなプログラムです。
所有者は bandit20、setuid ビット (mode の先頭が 4) が立っているので、誰が実行しても
プロセスは bandit20 の権限で動きます。

bandit20 だけが読める /etc/bandit_pass/bandit20 を、このバイナリ越しに cat してみましょう。`,
      skills: ["setuid", "実行ビット", "権限委譲"],
      hints: [
        "ls -l bandit20-do でモードを確認すると、先頭が 's' になっています (setuid)。",
        "通常の cat /etc/bandit_pass/bandit20 は権限エラーになります (mode 0400, owner bandit20)。",
        "./bandit20-do <コマンド> [<引数>...] のように呼ぶと、引数のコマンドが bandit20 として実行されます。",
        "つまり ./bandit20-do cat /etc/bandit_pass/bandit20 でパスワードが読めます。"
      ],
      approach:
`1. ls -l で bandit20-do が setuid (s ビット) であることを確認。
2. ./bandit20-do cat /etc/bandit_pass/bandit20 を実行。
3. 出力がパスワードです。`,
      password: PW,
      fs: {
        user: "bandit19", hostname: "training-server",
        home: "/home/bandit19", cwd: "/home/bandit19",
        files: {
          "/etc/bandit_pass/bandit20": { type: "file", owner: "bandit20", group: "bandit20", mode: "0400",
            content: PW + "\n" },
          "/home/bandit19/bandit20-do": {
            type: "file", owner: "bandit20", group: "bandit20", mode: "4755",
            content: "[ELF binary placeholder: setuid wrapper that runs args as bandit20]",
            exec: async (ctx, args) => {
              if (!args.length) return { stdout: "", stderr: "Run a program as bandit20: ./bandit20-do <cmd> [args ...]\n", exitCode: 1 };
              return await ctx.shell._execOne(args[0], args.slice(1), ctx.stdin || "", { isTTY: ctx.isTTY });
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  20: (function () {
    const PW = "listener-and-doas-handshake-20";
    // 簡略化: bandit20 のホームに suconnect という setuid バイナリ。
    // 引数: ポート番号。指定ポートに「自分の現在のパスワード」を送り、応答を返す。
    // ただし、ポート受信側 (= 自作テキスト) は事前に echo $(cat current_pw) > /tmp/listener-input;
    //   /tmp/listener-input の内容と一致すれば bandit21 のパスワードを返す、という仕組み。
    // これにより「listener と connector の 2 役を演じる」概念を擬似化。
    const PW_20 = "setuid-runs-as-the-owner-19";          // このレベルに入るためのパスワード
    return {
      story:
`bandit20 のホームには suconnect という setuid バイナリと、相棒となる /usr/bin/listener.sh があります。

suconnect は bandit21 として動き、指定したポートに対して自分のパスワードを送信して
応答を待つプログラムです。一方 listener.sh は、(本物の Bandit では nc -l ですが、ここでは
擬似化として) あなたが /tmp/listener-input にあらかじめ書いておいたテキストを返す
「サーバ」役を演じます。

自分のパスワード (bandit20) を /tmp/listener-input に書き、それと同じパスワードを suconnect が
送ってくる、というシナリオを成立させると、bandit21 のパスワードが得られます。`,
      skills: ["setuid", "リスナー / コネクタ", "/tmp"],
      hints: [
        "ls -l で suconnect が setuid であることを確認。",
        "まず自分のパスワードを取り出して /tmp/listener-input に書く: cat /etc/bandit_pass/bandit20 > /tmp/listener-input。",
        "次に suconnect <port> を呼ぶ (ここでは port 引数を 31000 等で固定)。",
        "suconnect は /tmp/listener-input を読んで一致を判定し、一致すれば bandit21 のパスワードを stdout に書きます。"
      ],
      approach:
`1. cat /etc/bandit_pass/bandit20 > /tmp/listener-input でリスナー入力を準備。
2. ./suconnect 31000 で接続。
3. 出力に次のパスワードが含まれます。`,
      password: PW,
      fs: {
        user: "bandit20", hostname: "training-server",
        home: "/home/bandit20", cwd: "/home/bandit20",
        files: {
          "/etc/bandit_pass/bandit20": { type: "file", owner: "bandit20", group: "bandit20", mode: "0400",
            content: PW_20 + "\n" },
          "/home/bandit20/suconnect": {
            type: "file", owner: "bandit21", group: "bandit21", mode: "4755",
            content: "[ELF binary placeholder: setuid connector that sends pw and checks against /tmp/listener-input]",
            // exec はクロージャでこのレベル用の期待値 (PW_20) を持つ。実 Bandit は
            // バイナリが setreuid(2) で実 UID と実効 UID を切り替えてパスワードを
            // 読み出すが、ここでは「期待値はバイナリ自体が知っている」体で擬似化。
            exec: async (ctx, args) => {
              if (!args.length) return { stdout: "", stderr: "Usage: ./suconnect <portnumber>\n", exitCode: 1 };
              const listenerIn = ctx.vfs.readFile("/tmp/listener-input");
              if (listenerIn.error) return { stdout: "", stderr: "suconnect: nothing on /tmp/listener-input (リスナーが入力を用意していません)\n", exitCode: 1 };
              if (listenerIn.content.trim() === PW_20.trim()) {
                return { stdout: PW + "\n", stderr: "Read: " + listenerIn.content.trim() + "\nPassword matches, sending reply.\n", exitCode: 0 };
              }
              return { stdout: "", stderr: "Read: " + listenerIn.content.trim() + "\nPasswords don't match\n", exitCode: 1 };
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  21: (function () {
    const PW = "cron-trail-leads-to-the-output-21";
    const cronD = "* * * * * bandit22 /usr/bin/cronjob_bandit22.sh &> /dev/null\n";
    const cronScript =
"#!/bin/bash\n" +
"chmod 644 /tmp/t7O6lds9S0RqQh9aMcz6ShpAoZKF7fgv\n" +
"cat /etc/bandit_pass/bandit22 > /tmp/t7O6lds9S0RqQh9aMcz6ShpAoZKF7fgv\n";
    return {
      story:
`bandit21 のサーバーでは、cron (時間ベースのジョブスケジューラ) が定期的に
何かを動かしているはずです。/etc/cron.d/ にその定義ファイル群があります。

cron が実行しているスクリプトを読み、その出力先を辿れば、bandit22 のパスワードが
取得できそうです。`,
      skills: ["cron", "/etc/cron.d", "シェルスクリプトを読む"],
      hints: [
        "ls /etc/cron.d/ で cron の定義ファイル一覧を見られます。",
        "気になる定義 (cronjob_bandit22) を cat すると、どのスクリプトを誰が動かすかが書かれています。",
        "スクリプト本体 (例: /usr/bin/cronjob_bandit22.sh) を cat すると、出力先ファイル名が分かります。",
        "出力先のファイルを cat すると、cron が書き出したパスワードが見えます。"
      ],
      approach:
`1. ls /etc/cron.d/ → 定義一覧。
2. cat /etc/cron.d/cronjob_bandit22 → /usr/bin/cronjob_bandit22.sh が動いている。
3. cat /usr/bin/cronjob_bandit22.sh → /tmp/<hash> に書き出している。
4. cat /tmp/<hash> でパスワードを取得。`,
      password: PW,
      fs: {
        user: "bandit21", hostname: "training-server",
        home: "/home/bandit21", cwd: "/home/bandit21",
        files: {
          "/etc/cron.d/cronjob_bandit22": { type: "file", owner: "root", group: "root", mode: "0644",
            content: cronD },
          "/usr/bin/cronjob_bandit22.sh": { type: "file", owner: "root", group: "root", mode: "0755",
            content: cronScript },
          "/etc/bandit_pass/bandit22": { type: "file", owner: "bandit22", group: "bandit22", mode: "0400",
            content: PW + "\n" },
          "/tmp/t7O6lds9S0RqQh9aMcz6ShpAoZKF7fgv": { type: "file", owner: "bandit22", group: "bandit22", mode: "0644",
            content: PW + "\n" }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  22: (function () {
    const PW = "md5-derived-filename-found-22";
    // Bandit Lv22 のロジック: hash = md5("I am user bandit23\n") の先頭 32 文字
    // 実機: 8ca319486bfbbc3663ea0fbe81326349
    const TARGET_HASH = "8ca319486bfbbc3663ea0fbe81326349";
    const cronScript =
"#!/bin/bash\n" +
"myname=$(whoami)\n" +
"mytarget=$(echo I am user $myname | md5sum | cut -d ' ' -f 1)\n" +
"echo 'Copying passwordfile /etc/bandit_pass/$myname to /tmp/$mytarget'\n" +
"cat /etc/bandit_pass/$myname > /tmp/$mytarget\n";
    return {
      story:
`bandit22 でも cron が動いています。今回のスクリプトは少し複雑で、whoami と md5sum を
使って動的に出力ファイル名を組み立てています。

スクリプトを読み、md5 ハッシュを自分で計算してターゲットのファイル名を推定し、
そのファイルを cat してパスワードを取り出してみましょう。`,
      skills: ["シェルスクリプト解読", "md5sum", "コマンド置換"],
      hints: [
        "/etc/cron.d/ から該当の cron 設定を辿り、スクリプト本体を cat。",
        "スクリプトは whoami の出力を含む文字列を md5sum し、その結果をファイル名に使います。",
        "echo 'I am user bandit23' | md5sum | cut -d ' ' -f 1 を自分で実行してハッシュを得ます (bandit23 部分は cron が走るユーザー名)。",
        "得たハッシュで /tmp/<ハッシュ> を cat するとパスワードが見えます。"
      ],
      approach:
`1. cat /etc/cron.d/cronjob_bandit23 でスクリプトのパスを確認。
2. cat /usr/bin/cronjob_bandit23.sh で内容を読み解く。
3. echo 'I am user bandit23' | md5sum | cut -d ' ' -f 1 でハッシュ = ${TARGET_HASH} を得る。
4. cat /tmp/${TARGET_HASH} でパスワードを取得。`,
      password: PW,
      fs: {
        user: "bandit22", hostname: "training-server",
        home: "/home/bandit22", cwd: "/home/bandit22",
        files: {
          "/etc/cron.d/cronjob_bandit23": { type: "file", owner: "root", group: "root", mode: "0644",
            content: "* * * * * bandit23 /usr/bin/cronjob_bandit23.sh &> /dev/null\n" },
          "/usr/bin/cronjob_bandit23.sh": { type: "file", owner: "root", group: "root", mode: "0755",
            content: cronScript },
          "/etc/bandit_pass/bandit23": { type: "file", owner: "bandit23", group: "bandit23", mode: "0400",
            content: PW + "\n" },
          ["/tmp/" + TARGET_HASH]: { type: "file", owner: "bandit23", group: "bandit23", mode: "0644",
            content: PW + "\n" }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  23: (function () {
    const PW = "your-script-ran-as-bandit24-23";
    const cronScript =
"#!/bin/bash\n" +
"myname=$(whoami)\n" +
"cd /var/spool/cron/$myname\n" +
"for s in ./*; do\n" +
"  if [ -f \"$s\" ]; then\n" +
"    echo 'Handling ' \"$s\"\n" +
"    bash \"$s\"\n" +
"    rm -f \"$s\"\n" +
"  fi\n" +
"done\n";
    return {
      story:
`bandit23 のサーバーでは、bandit24 のために動く cron が /var/spool/cron/bandit24 配下の
スクリプトを順に実行してくれるようになっています (cron 自身は bandit24 として動作)。

つまり、あなた (bandit23) が /var/spool/cron/bandit24 に書き込めるなら、bandit24 として
任意のコマンドを動かせるということ。bandit24 のパスワードをどこかにコピーするスクリプトを
仕込んで、(擬似) cron を動かせば次のパスワードが手に入ります。

実 Bandit では cron が 1 分単位で動きますが、ここでは /usr/local/bin/cron-tick という
setuid バイナリで「もう 1 回 cron を回す」ことを擬似化しています。`,
      skills: ["cron", "/var/spool/cron", "シェルスクリプトの書き込み", "setuid"],
      hints: [
        "/etc/cron.d/cronjob_bandit24 から /usr/bin/cronjob_bandit24.sh を辿ると、/var/spool/cron/bandit24 内のスクリプトを順に bash 実行する作りだと分かります。",
        "/var/spool/cron/bandit24 のパーミッションは bandit23 でも書き込み可能になっています。",
        "そこにスクリプトを書き、自分が読める場所にパスワードをコピーさせます (例: cat /etc/bandit_pass/bandit24 > /tmp/bandit23-out)。",
        "書いたら /usr/local/bin/cron-tick を実行 (setuid なので bandit24 として動き、あなたのスクリプトを実行)。",
        "結果のファイルを cat。"
      ],
      approach:
`1. cat /etc/cron.d/cronjob_bandit24, cat /usr/bin/cronjob_bandit24.sh で挙動を確認。
2. echo 'cat /etc/bandit_pass/bandit24 > /tmp/bandit23-out' > /var/spool/cron/bandit24/getpw.sh で スクリプトを設置。
3. /usr/local/bin/cron-tick で 1 回回す。
4. cat /tmp/bandit23-out で次のパスワード。`,
      password: PW,
      fs: {
        user: "bandit23", hostname: "training-server",
        home: "/home/bandit23", cwd: "/home/bandit23",
        files: {
          "/etc/cron.d/cronjob_bandit24": { type: "file", owner: "root", group: "root", mode: "0644",
            content: "* * * * * bandit24 /usr/bin/cronjob_bandit24.sh &> /dev/null\n" },
          "/usr/bin/cronjob_bandit24.sh": { type: "file", owner: "bandit24", group: "bandit24", mode: "0755",
            content: cronScript },
          "/etc/bandit_pass/bandit24": { type: "file", owner: "bandit24", group: "bandit24", mode: "0400",
            content: PW + "\n" },
          "/var/spool/cron/bandit24": { type: "dir", owner: "bandit24", group: "bandit24", mode: "0733" },
          "/usr/local/bin/cron-tick": {
            type: "file", owner: "bandit24", group: "bandit24", mode: "4755",
            content: "[setuid binary placeholder: simulates a single cron tick for bandit24]",
            exec: async (ctx) => {
              const r = ctx.vfs.list("/var/spool/cron/bandit24");
              if (r.error) return { stdout: "", stderr: "cron-tick: " + r.error + "\n", exitCode: 1 };
              let totalOut = "";
              for (const e of r.entries) {
                if (e.node.type !== "file") continue;
                const sR = ctx.vfs.readFile("/var/spool/cron/bandit24/" + e.name);
                if (sR.error) continue;
                totalOut += "Handling ./" + e.name + "\n";
                const runRes = await ctx.shell.run(sR.content);
                totalOut += runRes.output || "";
                ctx.vfs.unlink("/var/spool/cron/bandit24/" + e.name);
              }
              return { stdout: totalOut, stderr: "", exitCode: 0 };
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  24: (function () {
    const PW = "brute-force-4digit-pin-yields-24";
    const PW_24 = "your-script-ran-as-bandit24-23";
    const CORRECT_PIN = "1729";
    return {
      story:
`bandit24 のサーバーは、ローカルポート 30002 で「現在のパスワード + スペース + 4 桁の PIN」を
受け取ると、PIN が正しければ次のパスワードを返してくれます。

PIN は 0000〜9999 の 10000 通り。1 つずつ試して当たれば良い、典型的なブルートフォースです。
シェルの for ループと nc を組み合わせて全パターンを送るのが定石。`,
      skills: ["ブルートフォース (概念)", "nc", "$() コマンド置換"],
      hints: [
        "自分の (bandit24) パスワードは /etc/bandit_pass/bandit24 にあります。",
        "リクエスト形式は \"<パスワード> <PIN>\\n\"。改行で 1 試行が確定します。",
        "echo \"$(cat /etc/bandit_pass/bandit24) <PIN>\" | nc localhost 30002 で 1 個ずつ試せます。",
        "ヒント: 正解の PIN は数学者ハーディとラマヌジャンの逸話に出てくる「タクシー数」(4 桁) です。",
        "(実 Bandit では bash の for ループで 10000 通り総当たりしますが、本擬似シェルでは for/while 構文が制限されているため、$() インライン送信か、手で当てる経路を想定しています。)"
      ],
      approach:
`1. cat /etc/bandit_pass/bandit24 で自分のパスワードを確認。
2. echo "$(cat /etc/bandit_pass/bandit24) 1729" | nc localhost 30002 を送る。
3. 応答に次のレベル (Level 25) のパスワードが含まれます。
   ※ 1729 はハーディ・ラマヌジャン数 (2 通りの方法で 2 つの立方数の和に表せる最小の自然数)。
     本物の bandit24 ではこの値は不明で、10000 通りを総当たりします。`,
      password: PW,
      fs: {
        user: "bandit24", hostname: "training-server",
        home: "/home/bandit24", cwd: "/home/bandit24",
        files: {
          "/etc/bandit_pass/bandit24": { type: "file", owner: "bandit24", group: "bandit24", mode: "0400",
            content: PW_24 + "\n" }
        },
        ports: {
          30002: {
            tls: false,
            banner: "shell-pin-checker 1.0",
            handler: (input) => {
              // 入力は複数行になり得る (for ループの結果)
              const lines = String(input || "").split(/\r?\n/).filter(l => l.length > 0);
              let response = "I am the pincode checker. Enter <password> <pincode>.\n";
              for (const line of lines) {
                const parts = line.split(/\s+/);
                if (parts.length < 2) { response += "Wrong! malformed input.\n"; continue; }
                const [givenPw, givenPin] = parts;
                if (givenPw !== PW_24) { response += "Wrong! (bandit24 password mismatch)\n"; continue; }
                if (givenPin === CORRECT_PIN) {
                  response += "Correct! The password for the next level is: " + PW + "\n";
                } else {
                  response += "Wrong! Try again.\n";
                }
              }
              return response;
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  25: (function () {
    const PW = "less-shell-escape-via-bang-25";
    // /etc/bandit_pass/bandit26 を bandit25 で直接 cat できないが、
    // less から !cmd 経由なら setuid のような特権が要らずとも、別パス (例: /home/bandit26 にある readable file)
    // を読ませる構成にする。
    // 教育意図: 「less から ! でシェル脱出できる」を体験する。
    return {
      story:
`bandit25 のサーバーでは、ログインシェルがちょっと変わっています。
ホームに showtext というスクリプトがあり、いきなり長いテキストファイルが less で
表示されるよう設定されています。あなたは less の中に放り込まれ、ふつうのシェルには
直接戻れません。

less は終了するだけでなく、内部から ! コマンド で任意のシェルコマンドを実行できる
ことを知っていますか?この機能を使えば、less の中から他の場所のファイルを覗けます。

ちなみに /home/bandit26/.readme には bandit26 のパスワードが書かれています。
less から脱出してそれを読みましょう。`,
      skills: ["less", "! でシェル脱出", "pager"],
      hints: [
        "less welcome.txt のように less を開きます。",
        "less が表示中に :q ではなく ! を打つと、シェルコマンドを入力できます (less の \"!cmd\" 機能)。",
        "! の後に cat /home/bandit26/.readme などと打つと、その結果が less の中に表示されます。",
        "q で less を終了し、得たパスワードを次レベルの入力欄に貼ります。"
      ],
      approach:
`1. less welcome.txt で less を開く。
2. !cat /home/bandit26/.readme を打って bandit26 のパスワードを読む。
3. q で less を終了。`,
      password: PW,
      fs: {
        user: "bandit25", hostname: "training-server",
        home: "/home/bandit25", cwd: "/home/bandit25",
        files: {
          "/home/bandit25/welcome.txt": { type: "file", owner: "bandit25", group: "bandit25", mode: "0644",
            content: "Welcome to bandit25.\n\nふつうの方法では bandit26 のパスワードは手に入りません。\nless の中から特別な方法を使う必要があります。\n" },
          "/home/bandit26/.readme": { type: "file", owner: "bandit26", group: "bandit26", mode: "0644",
            content: "Hello from bandit26.\n次のレベル (Level 26) のパスワード:\n" + PW + "\n" }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  26: (function () {
    const PW = "vim-bang-cmd-jailbreaks-the-26";
    return {
      story:
`bandit26 のシェルもまた制限された pager 経由ですが、less の中で v を押すと vim が起動する
というクラシックな経路があります (ここでは直接 vim を起動できる形にしています)。

vim も less と同様、:!cmd や :shell でシェルコマンド/シェル本体を起動できます。
:shell まで使わなくても :!cat /home/bandit27/secret で十分です。`,
      skills: ["vim", ":! でシェル実行", ":shell", "エディタ脱出"],
      hints: [
        "vim を引数なしで開きます (vim だけ)。または vim ファイル名 で。",
        "vim の中で :!cat /home/bandit27/secret を打つと、cat の結果が画面に表示されます。",
        "確認したら :q で vim を終了します。"
      ],
      approach:
`1. vim を起動 (vim、もしくは vim somefile)。
2. :!cat /home/bandit27/secret で読む。
3. 表示されたパスワードを控えて :q で終了。`,
      password: PW,
      fs: {
        user: "bandit26", hostname: "training-server",
        home: "/home/bandit26", cwd: "/home/bandit26",
        files: {
          "/home/bandit26/welcome.txt": { type: "file", owner: "bandit26", group: "bandit26", mode: "0644",
            content: "Welcome to bandit26.\n\nvim の中からシェルコマンドを呼べることを思い出してください。\n" },
          "/home/bandit27/secret": { type: "file", owner: "bandit27", group: "bandit27", mode: "0644",
            content: "次のレベル (Level 27) のパスワード:\n" + PW + "\n" }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  27: (function () {
    const PW = "git-clone-and-read-the-readme-27";
    return {
      story:
`bandit27 のサーバーには git でアクセスできるリポジトリ
ssh://bandit27-git@localhost/home/bandit27-git/repo があります。
このリポジトリをクローンし、README を読むと次のレベルのパスワードが書かれています。`,
      skills: ["git", "git clone", "README"],
      hints: [
        "作業ディレクトリを /tmp/work などに作って cd で移ってから clone するのが安心です。",
        "git clone ssh://bandit27-git@localhost/home/bandit27-git/repo でクローン。",
        "クローン後に cd repo して ls すると README が見えます。"
      ],
      approach:
`1. mkdir -p /tmp/work-27 && cd /tmp/work-27
2. git clone ssh://bandit27-git@localhost/home/bandit27-git/repo
3. cd repo && cat README
4. 出力にパスワードが含まれます。`,
      password: PW,
      fs: {
        user: "bandit27", hostname: "training-server",
        home: "/home/bandit27", cwd: "/home/bandit27",
        gitRepos: {
          "ssh://bandit27-git@localhost/home/bandit27-git/repo": {
            defaultBranch: "master",
            branches: { master: "c2701" },
            tags: {},
            commits: {
              c2701: { parent: null,
                       author: "shell-git <git@shell>",
                       date: "Mon May 23 09:00:00 2026 +0900",
                       message: "initial commit",
                       tree: { "README": "Welcome to the bandit27 repo.\n次のレベル (Level 28) のパスワード:\n" + PW + "\n" } }
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  28: (function () {
    const PW = "git-log-reveals-hidden-history-28";
    return {
      story:
`bandit28 にも git リポジトリ ssh://bandit28-git@localhost/home/bandit28-git/repo があります。
クローンして README を見ると、パスワードらしき行があるものの「***REDACTED***」と隠されています。
ところが、コミット履歴を見ると過去のリビジョンに生のパスワードが残っていることがあります。`,
      skills: ["git log", "git show", "コミット履歴"],
      hints: [
        "git clone でクローン後、cd repo して cat README するとパスワードがマスクされていることが分かります。",
        "git log でこのリポジトリのコミット履歴を見ます。コミットメッセージから '機密削除' のような怪しいものを探します。",
        "git show <コミットハッシュ> でそのコミット時点での差分が見えます。マスク前のパスワードが含まれているはず。"
      ],
      approach:
`1. mkdir -p /tmp/work-28 && cd /tmp/work-28
2. git clone ssh://bandit28-git@localhost/home/bandit28-git/repo && cd repo
3. cat README → "***REDACTED***" でマスクされている
4. git log で過去のコミットを確認
5. git show <初期コミットのハッシュ> で マスク前のパスワードを取得`,
      password: PW,
      fs: {
        user: "bandit28", hostname: "training-server",
        home: "/home/bandit28", cwd: "/home/bandit28",
        gitRepos: {
          "ssh://bandit28-git@localhost/home/bandit28-git/repo": {
            defaultBranch: "master",
            branches: { master: "c2802" },
            tags: {},
            commits: {
              c2801: { parent: null,
                       author: "ben <ben@shell>",
                       date: "Mon May 23 09:00:00 2026 +0900",
                       message: "initial: add password",
                       tree: { "README": "# bandit28 repo\n\nname: secret-repo\npassword: " + PW + "\n" } },
              c2802: { parent: "c2801",
                       author: "ben <ben@shell>",
                       date: "Mon May 23 09:30:00 2026 +0900",
                       message: "fix info leak: redact password",
                       tree: { "README": "# bandit28 repo\n\nname: secret-repo\npassword: ***REDACTED***\n" } }
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  29: (function () {
    const PW = "switch-branch-and-find-the-truth-29";
    return {
      story:
`bandit29 のリポジトリ ssh://bandit29-git@localhost/home/bandit29-git/repo を clone して
README を見ると、現在 (master) のブランチには本番用と思わしき「no password yet」しかありません。

しかし、他のブランチに開発中のパスワードが残っている可能性があります。`,
      skills: ["git branch", "git checkout", "ブランチ"],
      hints: [
        "git branch でローカルブランチ一覧、-a を付けると remote-tracking も含めて見られます。",
        "気になるブランチを git checkout <名前> で切り替えると、作業ツリーがその内容に変わります。",
        "切り替えてから README を見直してみましょう。"
      ],
      approach:
`1. mkdir -p /tmp/work-29 && cd /tmp/work-29
2. git clone ssh://bandit29-git@localhost/home/bandit29-git/repo && cd repo
3. cat README → "no password yet"
4. git branch -a で dev ブランチがあることを発見
5. git checkout dev → cat README で次のパスワード`,
      password: PW,
      fs: {
        user: "bandit29", hostname: "training-server",
        home: "/home/bandit29", cwd: "/home/bandit29",
        gitRepos: {
          "ssh://bandit29-git@localhost/home/bandit29-git/repo": {
            defaultBranch: "master",
            branches: { master: "c2901", dev: "c2902" },
            tags: {},
            commits: {
              c2901: { parent: null, author: "ben", date: "M",
                       message: "init: empty README",
                       tree: { "README": "# bandit29 repo\npassword: <no password yet>\n" } },
              c2902: { parent: "c2901", author: "ben", date: "M",
                       message: "wip: add password (dev only)",
                       tree: { "README": "# bandit29 repo (dev)\npassword: " + PW + "\n" } }
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  30: (function () {
    const PW = "find-the-hidden-tag-30";
    return {
      story:
`bandit30 のリポジトリ ssh://bandit30-git@localhost/home/bandit30-git/repo を clone しても
README にはパスワードがありません。ブランチも master 1 本だけ。

タグ (tag) を確認してみましょう。隠しタグがあって、それが指すコミットに何かが残っている
可能性があります。`,
      skills: ["git tag", "git show", "タグ"],
      hints: [
        "git tag でタグ一覧を表示できます。",
        "気になるタグを git show <タグ名> で内容を確認できます。",
        "タグ付きコミットには別ファイル (例: secret) が含まれているかもしれません。"
      ],
      approach:
`1. mkdir -p /tmp/work-30 && cd /tmp/work-30
2. git clone ssh://bandit30-git@localhost/home/bandit30-git/repo && cd repo
3. cat README → 手がかりなし
4. git tag → "secret" タグを発見
5. git show secret で内容を見るか、git checkout secret して cat secret`,
      password: PW,
      fs: {
        user: "bandit30", hostname: "training-server",
        home: "/home/bandit30", cwd: "/home/bandit30",
        gitRepos: {
          "ssh://bandit30-git@localhost/home/bandit30-git/repo": {
            defaultBranch: "master",
            branches: { master: "c3001" },
            tags: { secret: "c3002" },
            commits: {
              c3001: { parent: null, author: "ben", date: "M",
                       message: "init",
                       tree: { "README": "# bandit30 repo\njust a readme, nothing here.\n" } },
              c3002: { parent: "c3001", author: "ben", date: "M",
                       message: "tagged stash with secret",
                       tree: {
                         "README": "# bandit30 repo\njust a readme, nothing here.\n",
                         "secret": PW + "\n"
                       } }
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  31: (function () {
    const PW = "push-the-correct-key-and-receive-31";
    return {
      story:
`bandit31 のリポジトリ ssh://bandit31-git@localhost/home/bandit31-git/repo の README には、
特定の内容を持つファイル key.txt を作って master に push しろ、と書かれています。

正しいファイルを push できれば、サーバ側のフックから次のパスワードが返ってきます。`,
      skills: ["git add", "git commit", "git push", "リモート連携"],
      hints: [
        "クローンして README を読むと、key.txt に書くべき内容が分かります。",
        "echo 'May I come in?' > key.txt のように作成して git add → git commit → git push。",
        "git push の応答 (remote: ...) に次のパスワードが含まれます。"
      ],
      approach:
`1. mkdir -p /tmp/work-31 && cd /tmp/work-31
2. git clone ssh://bandit31-git@localhost/home/bandit31-git/repo && cd repo
3. cat README で要求を確認。
4. echo 'May I come in?' > key.txt
5. git add key.txt && git commit -m 'add key'
6. git push の応答に次のパスワードが含まれます。`,
      password: PW,
      fs: {
        user: "bandit31", hostname: "training-server",
        home: "/home/bandit31", cwd: "/home/bandit31",
        gitRepos: {
          "ssh://bandit31-git@localhost/home/bandit31-git/repo": {
            defaultBranch: "master",
            branches: { master: "c3101" },
            tags: {},
            commits: {
              c3101: { parent: null, author: "ben", date: "M",
                       message: "init",
                       tree: {
                         "README.md": "Push a file `key.txt` containing the text 'May I come in?' to master.\n"
                       } }
            },
            onPush: async (state) => {
              const head = state.head.startsWith("@") ? state.head.slice(1) : state.branches[state.head];
              const tree = state.commits[head] && state.commits[head].tree;
              if (tree && tree["key.txt"] && tree["key.txt"].trim() === "May I come in?") {
                return "Well done!\n次のレベル (Level 32) のパスワード:\n" + PW + "\n";
              }
              return "rejected: key.txt の内容が正しくありません。\n";
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  32: (function () {
    const PW = "uppercase-shell-yields-to-dollar-zero-32";
    return {
      story:
`bandit32 にログインすると「UPPERCASE シェル」というおかしなシェルに放り込まれます。
あなたが入力する文字はすべて大文字に変換されてから実行されるので、ls も LS になって
コマンドが見つかりません。

ただし、bash には $0 という特別な変数があります。これは「現在のシェル名」を返し、
大文字化の影響を受けません ($ も 0 も英字でないため)。$0 を実行すると、もう一つ別の
シェル (大文字化のかからない普通のシェル) が起動して脱出できます。`,
      skills: ["制限シェル", "シェル変数", "$0 脱出"],
      hints: [
        "まずは ls / cat 等を試してみてください。すべて「コマンドが見つかりません」と返ってくるはずです (大文字化されているので)。",
        "$0 と入力します。これは現在のシェル名 (このレベルでは /bin/sh) に展開され、大文字化の前段で実行されます。",
        "通常シェルに切り替わったら、cat /etc/bandit_pass/bandit33 で次のレベルのパスワードを読みましょう。"
      ],
      approach:
`1. 何かコマンドを打つ (例: whoami) → "WHOAMI: コマンドが見つかりません" のようなメッセージ。
2. $0 を入力。/bin/sh が実行され、制限が解除されます。
3. cat /etc/bandit_pass/bandit33 で次のパスワードを取得。`,
      password: PW,
      fs: {
        user: "bandit32", hostname: "training-server",
        home: "/home/bandit32", cwd: "/home/bandit32",
        // groups にも bandit33 を追加して /etc/bandit_pass/bandit33 (0440) を読めるようにする
        groups: ["bandit32", "bandit33"],
        shellOptions: { restricted: "uppercase", shellName: "/bin/sh" },
        files: {
          "/etc/bandit_pass/bandit33": { type: "file", owner: "bandit33", group: "bandit33", mode: "0440",
            content: PW + "\n" },
          "/bin/sh": {
            type: "file", owner: "root", group: "root", mode: "0755",
            content: "[ELF binary placeholder: /bin/sh — escapes uppercase mode]",
            exec: (ctx) => {
              ctx.shell.restricted = null;
              return { stdout: "$ (制限シェルから脱出しました)\n", stderr: "", exitCode: 0 };
            }
          }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  33: (function () {
    return {
      story:
`おめでとうございます。bandit33 にたどり着いた時点で、あなたは

  - ファイルとディレクトリの基本 (ls / cat / cp / mv / mkdir / rm)
  - 隠しファイルや変な名前のファイルの扱い (cd ./- / quotes / -a)
  - テキスト処理 (grep / sort / uniq / cut / tr / strings / base64 / xxd)
  - 圧縮とアーカイブ (gzip / bzip2 / xz / tar)
  - ネットワークの基礎 (nc / openssl / nmap)
  - SSH と鍵認証 (ssh -i)
  - 権限と setuid / cron
  - ページャ・エディタからの脱出 (less / vim)
  - git の基本 (clone / log / show / branch / tag / push)
  - 制限シェルからの脱出 ($0)

これだけのコマンドと、それらを組み合わせる「シェルらしい考え方」が身についた状態です。

このレベルにパスワードはありません。次のレベル (Level 34) のメッセージを読みに行きましょう。`,
      skills: ["振り返り", "学びの整理"],
      hints: [
        "ホームの readme を cat すると、ここまでで覚えてほしいキーワードと、よくある詰まりどころが書かれています。",
        "そのファイルの末尾にある合言葉を、そのまま下のフォームに貼ってください。"
      ],
      approach:
`1. cat readme
2. ファイル末尾の合言葉を入力欄に貼って次へ進む。`,
      password: "thanks-for-staying-with-the-shell-33",
      fs: {
        user: "bandit33", hostname: "training-server",
        home: "/home/bandit33", cwd: "/home/bandit33",
        files: {
          "/home/bandit33/readme": { type: "file", owner: "bandit33", group: "bandit33", mode: "0644",
            content:
`Welcome, you've reached the end of the standard course.

ここまで来たあなたは、Linux のシェルを「使われる側」から「使う側」になりました。
コマンドを覚えるよりも、コマンドを組み合わせて目的を達成する経路を組み立てる感覚を
身につけたなら、それがこのコースの最大の収穫です。

よく使う組み合わせを 3 つだけ:

  1. find + xargs / -exec で「条件に合うファイルにまとめて何かする」
  2. cut / awk / sort / uniq でログを集計する
  3. ssh の -i / -p / リモートコマンド実行で、対話シェルを介さず素早く目的を達成

詰まったとき:
  - file <ファイル> で種別を確認
  - ls -la / stat で権限の確認
  - man <コマンド> で本物のマニュアル (このサイトのチートシートでも代替可)

合言葉:
thanks-for-staying-with-the-shell-33
` }
        }
      }
    };
  })(),

  // --------------------------------------------------------
  34: (function () {
    return {
      story:
`Level 34 はゴールです。
このサイトの旅はここで終わりですが、Linux の世界はまだまだ広がっています。

ここでパスワードを入れる必要はありません (このレベルがゴールなので)。
ホームの next-steps.md を読んで、自分の次の一歩を選んでみてください。`,
      skills: ["卒業", "次の一歩"],
      hints: [
        "cat next-steps.md で次に学ぶとよさそうな方向の選択肢を一覧できます。",
        "本物の OverTheWire Bandit に挑戦すると、本サイトで学んだ概念が実機でどう動くかを体感できます。"
      ],
      approach:
`1. cat next-steps.md
2. 自分が興味を持ったキーワードに、ブラウザの別タブで触れに行きましょう。
3. このサイトに戻ってきても、いつでも各レベルを復習できます。`,
      password: "thanks-for-finishing-the-shell-34",
      fs: {
        user: "bandit34", hostname: "training-server",
        home: "/home/bandit34", cwd: "/home/bandit34",
        files: {
          "/home/bandit34/next-steps.md": { type: "file", owner: "bandit34", group: "bandit34", mode: "0644",
            content:
`# 次の一歩

おつかれさまでした。Shell の 35 レベル、よくここまで来ましたね。

## このまま続けるなら

1. OverTheWire 本家 — Bandit の続き (Natas / Leviathan / Krypton 等のシリーズ)
2. Linux Journey (https://linuxjourney.com/) — 体系的に学び直したいとき
3. The Linux Command Line (William Shotts) の和訳本 — 紙でじっくり

## シェルの先

- bash スクリプト (本サイトのレベル 22-23 で触れた程度から一歩深く)
- awk / sed / Perl の 1 行スクリプト
- Python の標準ライブラリ (subprocess / pathlib)

## 自分のサーバを 1 台持つ

- Raspberry Pi / 仮想マシン (multipass / WSL) / 安価な VPS
- 自分の手で sshd の設定 / cron の登録 / log の監視 をやってみると、Bandit の問題が
  「現場でなぜ大事なのか」が一気に腑に落ちます。

合言葉:
thanks-for-finishing-the-shell-34
` }
        }
      }
    };
  })()

};

})();
