/* =========================================================
   level-data.js — 各レベルの詳細データ
   各エントリ: { story, hints[], approach, skills[], password, fs }
   ※ シナリオ・問題文はすべて独自に新規執筆。
   ※ password と fs はこの仮想環境内だけで意味を持つフィクションです。
   ========================================================= */

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
  }

};
