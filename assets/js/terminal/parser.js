/* =========================================================
   parser.js — シェル風コマンドラインの構文解析
   対応:
     - 単純コマンド: ls -la /tmp
     - パイプ: a | b | c
     - リダイレクト: > >> <
     - クォート: 'literal' / "expand" / \エスケープ
     - 変数展開: $VAR / ${VAR} / ~
     - コマンド置換: $(cmd) — 浅いネストのみ
     - 接続: ;  &&  ||
     - 末尾の & はフォアグラウンド扱い（無視）
   出力:
     { ok: true, ast } または { error: string, pos: number }
   ========================================================= */

(function () {
  "use strict";

  const TT = {
    WORD: "WORD",
    PIPE: "PIPE",
    REDIR_OUT: "REDIR_OUT",
    REDIR_APPEND: "REDIR_APPEND",
    REDIR_IN: "REDIR_IN",
    AND: "AND",
    OR: "OR",
    SEMI: "SEMI",
    AMP: "AMP",
    EOF: "EOF"
  };

  // ---------- トークナイザ ----------
  function tokenize(input, getVar) {
    const tokens = [];
    let i = 0;
    const n = input.length;

    function isSpace(c) { return c === " " || c === "\t"; }

    while (i < n) {
      const c = input[i];

      // 空白スキップ
      if (isSpace(c)) { i++; continue; }

      // 改行は ; と同じ扱い (複数行ペースト時に各行を独立コマンドとして実行)
      if (c === "\n" || c === "\r") { tokens.push({ type: TT.SEMI, pos: i }); i++; continue; }

      // 演算子
      if (c === "|") {
        if (input[i + 1] === "|") { tokens.push({ type: TT.OR, pos: i }); i += 2; continue; }
        tokens.push({ type: TT.PIPE, pos: i }); i++; continue;
      }
      if (c === "&") {
        if (input[i + 1] === "&") { tokens.push({ type: TT.AND, pos: i }); i += 2; continue; }
        tokens.push({ type: TT.AMP, pos: i }); i++; continue;
      }
      if (c === ";") { tokens.push({ type: TT.SEMI, pos: i }); i++; continue; }
      if (c === ">") {
        if (input[i + 1] === ">") { tokens.push({ type: TT.REDIR_APPEND, pos: i }); i += 2; continue; }
        tokens.push({ type: TT.REDIR_OUT, pos: i }); i++; continue;
      }
      if (c === "<") { tokens.push({ type: TT.REDIR_IN, pos: i }); i++; continue; }

      // 単語をひとかたまり読み込む
      const startPos = i;
      let value = "";
      while (i < n) {
        const ch = input[i];
        if (isSpace(ch) || "|&;<>\n\r".indexOf(ch) >= 0) break;

        if (ch === "\\") {
          if (i + 1 < n) { value += input[i + 1]; i += 2; continue; }
          else { return { error: "末尾のバックスラッシュ", pos: i }; }
        }

        if (ch === "'") {
          // 単一引用符: そのままリテラル
          i++;
          while (i < n && input[i] !== "'") { value += input[i++]; }
          if (i >= n) return { error: "閉じていないシングルクォート", pos: startPos };
          i++;
          continue;
        }

        if (ch === '"') {
          // 二重引用符: $展開とエスケープを許す
          i++;
          while (i < n && input[i] !== '"') {
            if (input[i] === "\\") {
              if (i + 1 < n && '"\\$`'.indexOf(input[i + 1]) >= 0) {
                value += input[i + 1]; i += 2;
              } else {
                value += input[i++];
              }
              continue;
            }
            if (input[i] === "$") {
              const r = readDollar(input, i, getVar);
              if (r.error) return r;
              value += r.value;
              i = r.next;
              continue;
            }
            value += input[i++];
          }
          if (i >= n) return { error: "閉じていないダブルクォート", pos: startPos };
          i++;
          continue;
        }

        if (ch === "$") {
          const r = readDollar(input, i, getVar);
          if (r.error) return r;
          value += r.value;
          i = r.next;
          continue;
        }

        if (ch === "~" && value === "") {
          // 単語の先頭でだけチルダ展開
          const home = (getVar && getVar("HOME")) || "/";
          // ~/path 形式
          if (i + 1 < n && input[i + 1] === "/") {
            value += home;
            i++;
          } else if (i + 1 >= n || isSpace(input[i + 1]) || "|&;<>".indexOf(input[i + 1]) >= 0) {
            value += home;
            i++;
          } else {
            value += ch; i++;
          }
          continue;
        }

        value += ch; i++;
      }
      tokens.push({ type: TT.WORD, value, pos: startPos });
    }

    tokens.push({ type: TT.EOF, pos: i });
    return { tokens };
  }

  // $VAR / ${VAR} / $(cmd) を読む
  function readDollar(input, i, getVar) {
    if (input[i] !== "$") return { error: "internal: not dollar", pos: i };
    let j = i + 1;
    if (j >= input.length) return { value: "$", next: j };

    if (input[j] === "{") {
      j++;
      const start = j;
      while (j < input.length && input[j] !== "}") j++;
      if (j >= input.length) return { error: "閉じていない ${", pos: i };
      const name = input.slice(start, j);
      j++;
      const v = (getVar && getVar(name)) || "";
      return { value: v, next: j };
    }

    if (input[j] === "(") {
      // $(cmd) 浅いネスト対応
      j++;
      let depth = 1;
      const start = j;
      while (j < input.length && depth > 0) {
        if (input[j] === "(") depth++;
        else if (input[j] === ")") depth--;
        if (depth > 0) j++;
      }
      if (depth !== 0) return { error: "閉じていない $(", pos: i };
      const cmd = input.slice(start, j);
      j++;
      const v = (getVar && getVar.__runCmdSub) ? getVar.__runCmdSub(cmd) : "";
      return { value: v, next: j };
    }

    // $? や $# のような単独記号変数 (1文字のみ)
    if (input[j] === "?" || input[j] === "#") {
      const name = input[j];
      j++;
      const v = (getVar && getVar(name)) || "";
      return { value: v, next: j };
    }

    if (/[A-Za-z_]/.test(input[j])) {
      const start = j;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      const name = input.slice(start, j);
      const v = (getVar && getVar(name)) || "";
      return { value: v, next: j };
    }

    // $ 単体
    return { value: "$", next: j };
  }

  // ---------- パーサ ----------
  function parse(input, getVar) {
    const tk = tokenize(input, getVar);
    if (tk.error) return { error: tk.error, pos: tk.pos };
    const tokens = tk.tokens;
    let p = 0;

    function peek() { return tokens[p]; }
    function eat() { return tokens[p++]; }
    function accept(type) { if (peek().type === type) return eat(); return null; }

    // simple command: WORD+ with redirects scattered
    function parseSimple() {
      const argv = [];
      const redirects = [];
      while (true) {
        const t = peek();
        if (t.type === TT.WORD) { argv.push(t.value); p++; continue; }
        if (t.type === TT.REDIR_OUT || t.type === TT.REDIR_APPEND || t.type === TT.REDIR_IN) {
          const op = eat();
          const f = peek();
          if (f.type !== TT.WORD) return { error: "リダイレクト先のファイル名が必要です", pos: op.pos };
          eat();
          redirects.push({
            kind: op.type === TT.REDIR_OUT ? "out" : op.type === TT.REDIR_APPEND ? "append" : "in",
            target: f.value
          });
          continue;
        }
        break;
      }
      if (argv.length === 0 && redirects.length === 0) return { error: "コマンドが空です", pos: peek().pos };
      return { argv, redirects };
    }

    function parsePipeline() {
      const commands = [];
      const first = parseSimple();
      if (first.error) return first;
      commands.push(first);
      while (accept(TT.PIPE)) {
        const next = parseSimple();
        if (next.error) return next;
        commands.push(next);
      }
      return { commands };
    }

    function parseList() {
      const items = [];
      while (peek().type !== TT.EOF) {
        const pipe = parsePipeline();
        if (pipe.error) return pipe;
        let op = "semi";
        const t = peek();
        if (t.type === TT.AND)      { op = "and"; eat(); }
        else if (t.type === TT.OR)  { op = "or";  eat(); }
        else if (t.type === TT.SEMI){ op = "semi"; eat(); }
        else if (t.type === TT.AMP) { op = "semi"; eat(); /* バックグラウンド非対応: 単に終端 */ }
        items.push({ pipeline: pipe, op });
        if (peek().type === TT.EOF) break;
      }
      return { items };
    }

    const ast = parseList();
    if (ast.error) return ast;
    return { ok: true, ast };
  }

  window.ShellParser = { parse, tokenize, TT };
})();
