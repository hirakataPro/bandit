/* =========================================================
   shell.js — シェルのメインループ
   - コマンドレジストリ
   - AST 実行（パイプライン / 接続 / リダイレクト）
   - 環境変数 / cwd / 終了コード
   ========================================================= */

(function () {
  "use strict";

  function Shell(opts) {
    opts = opts || {};
    this.vfs = opts.vfs;
    if (!this.vfs) throw new Error("Shell requires a VFS instance");
    this.env = Object.assign({
      HOME: this.vfs.home,
      USER: this.vfs.user,
      LOGNAME: this.vfs.user,
      HOSTNAME: this.vfs.hostname,
      SHELL: "/bin/bash",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      LANG: "C.UTF-8",
      TERM: "xterm-256color",
      PS1: "\\u@\\h:\\w$ "
    }, opts.env || {});
    this.lastExit = 0;
    this.commands = Object.create(null);
    this.aliases = Object.create(null);
    this.history = [];
    // 対話モード (less/vim 等): { handler, prompt, name } または null
    // handler は async (line, ctx) → { output, exit } を返す。
    this._interactive = null;
  }

  Shell.prototype.register = function (name, cmd) {
    this.commands[name] = Object.assign({ name }, cmd);
  };

  Shell.prototype.registerMany = function (map) {
    Object.keys(map).forEach(k => this.register(k, map[k]));
  };

  Shell.prototype.has = function (name) { return Boolean(this.commands[name]); };

  Shell.prototype.getVar = function (name) {
    if (name === "?") return String(this.lastExit);
    if (name === "PWD") return this.vfs.cwd;
    if (name === "OLDPWD") return this.oldcwd || this.vfs.cwd;
    return this.env[name] != null ? String(this.env[name]) : "";
  };

  Shell.prototype.setVar = function (name, value) {
    this.env[name] = String(value);
  };

  Shell.prototype.cd = function (target) {
    // cd - で OLDPWD に戻る
    if (target === "-") {
      if (!this.oldcwd) return { error: "cd: OLDPWD not set" };
      const swap = this.vfs.cwd;
      this.vfs.cwd = this.oldcwd;
      this.oldcwd = swap;
      return { ok: true, message: this.vfs.cwd + "\n" };
    }
    const next = target == null ? this.vfs.home : target;
    const abs = this.vfs.absolutize(next);
    const r = this.vfs.stat(abs);
    if (r.error) return { error: "cd: " + abs + ": そのようなファイルやディレクトリはありません" };
    if (r.node.type !== "dir") return { error: "cd: " + abs + ": ディレクトリではありません" };
    if (!this.vfs.canExecute(r.node)) return { error: "cd: " + abs + ": 権限がありません" };
    this.oldcwd = this.vfs.cwd;
    this.vfs.cwd = abs;
    return { ok: true };
  };

  Shell.prototype.expandGlobsForArgs = function (args) {
    const out = [];
    for (const a of args) {
      // *, ?, [ を含むなら glob 候補 (vfs.glob は3種すべて対応)
      if (/[*?\[]/.test(a)) {
        const matches = this.vfs.glob(a);
        if (matches.length) out.push.apply(out, matches);
        else out.push(a); // ヒットなしはそのまま
      } else {
        out.push(a);
      }
    }
    return out;
  };

  /**
   * 入力行を実行する。返り値: { exitCode, output: 連結された stdout/stderr 行 }
   */
  Shell.prototype.run = async function (line) {
    line = String(line || "").trim();
    if (!line) return { exitCode: 0, output: "" };

    // ヒストリ
    this.history.push(line);

    // パーサに渡す getVar (コマンド置換も簡易対応)
    const self = this;
    const getVar = function (name) { return self.getVar(name); };
    getVar.__runCmdSub = function (cmd) {
      // 同期でないので簡易: 空文字を返す
      // フェーズ4以降で必要なら別途同期実行用の経路を作る
      return "";
    };

    const parsed = window.ShellParser.parse(line, getVar);
    if (parsed.error) {
      this.lastExit = 2;
      return { exitCode: 2, output: "shell: 構文エラー: " + parsed.error + "\n" };
    }

    let out = "";
    let lastCode = 0;
    for (const item of parsed.ast.items) {
      // && / || による短絡
      if (item._skip) continue;
      const r = await this._runPipeline(item.pipeline);
      out += r.output;
      lastCode = r.exitCode;
      this.lastExit = lastCode;
      // 次の項目を実行するか？
      const nextIdx = parsed.ast.items.indexOf(item) + 1;
      if (nextIdx < parsed.ast.items.length) {
        if (item.op === "and" && lastCode !== 0) {
          // 失敗したら次のスキップ。さらに ; までスキップ
          for (let k = nextIdx; k < parsed.ast.items.length; k++) {
            parsed.ast.items[k]._skip = true;
            if (parsed.ast.items[k].op === "semi") break;
          }
        } else if (item.op === "or" && lastCode === 0) {
          for (let k = nextIdx; k < parsed.ast.items.length; k++) {
            parsed.ast.items[k]._skip = true;
            if (parsed.ast.items[k].op === "semi") break;
          }
        }
      }
    }
    return { exitCode: lastCode, output: out };
  };

  Shell.prototype._runPipeline = async function (pipeline) {
    const cmds = pipeline.commands;
    let stdin = "";
    let outAccum = "";
    let lastCode = 0;
    for (let i = 0; i < cmds.length; i++) {
      const c = cmds[i];
      const isLast = i === cmds.length - 1;

      const argv = this.expandGlobsForArgs(c.argv.slice());
      const name = argv[0];
      const args = argv.slice(1);

      // input redirect: < file は最初のコマンドのみ
      let cmdStdin = i === 0 ? stdin : stdin;
      for (const r of c.redirects) {
        if (r.kind === "in") {
          const fr = this.vfs.readFile(r.target);
          if (fr.error) {
            outAccum += name + ": " + r.target + ": そのようなファイルがありません\n";
            this.lastExit = 1;
            return { output: outAccum, exitCode: 1 };
          }
          cmdStdin = fr.content;
        }
      }

      // パイプ末尾かつ出力リダイレクトなしのときだけ TTY 扱い (色付き出力等)
      const hasOutRedirect = c.redirects.some(r => r.kind === "out" || r.kind === "append");
      const isTTY = isLast && !hasOutRedirect;

      // 実行
      let res;
      try {
        res = await this._execOne(name, args, cmdStdin, { isTTY });
      } catch (e) {
        res = { stdout: "", stderr: name + ": " + (e && e.message ? e.message : String(e)) + "\n", exitCode: 1 };
      }
      lastCode = res.exitCode || 0;

      let stdout = res.stdout || "";
      const stderr = res.stderr || "";

      // output redirects: 最後のコマンドにのみ実体ファイル書き出し
      let absorbed = false;
      for (const r of c.redirects) {
        if (r.kind === "out") {
          const w = this.vfs.writeFile(r.target, stdout);
          if (w.error) outAccum += name + ": " + r.target + ": " + w.error + "\n";
          absorbed = true;
        } else if (r.kind === "append") {
          const w = this.vfs.appendFile(r.target, stdout);
          if (w.error) outAccum += name + ": " + r.target + ": " + w.error + "\n";
          absorbed = true;
        }
      }

      // stderr は常に画面へ
      if (stderr) outAccum += stderr;

      if (isLast) {
        if (!absorbed) outAccum += stdout;
      } else {
        // 次へパイプ
        stdin = stdout;
      }
    }
    return { output: outAccum, exitCode: lastCode };
  };

  Shell.prototype._execOne = async function (name, args, stdin, opts) {
    opts = opts || {};
    if (!name) return { stdout: "", stderr: "", exitCode: 0 };

    // alias 展開
    if (this.aliases[name]) {
      const expanded = this.aliases[name];
      // 簡易: alias の文字列を再パースして実行する代わりに argv 連結で
      const parts = expanded.split(/\s+/).filter(Boolean);
      if (parts.length) {
        name = parts[0];
        args = parts.slice(1).concat(args);
      }
    }

    // 組み込みコマンド: cd, exit, alias, export 等は shell に直結
    if (name === "cd") {
      const r = this.cd(args[0]);
      if (r.error) return { stdout: "", stderr: r.error + "\n", exitCode: 1 };
      // cd - のときは新しい場所を表示 (実 bash と同じ挙動)
      return { stdout: r.message || "", stderr: "", exitCode: 0 };
    }
    if (name === "exit" || name === "logout") {
      this._exitRequested = true;
      const code = parseInt(args[0], 10);
      return { stdout: "", stderr: "", exitCode: Number.isFinite(code) ? code : 0 };
    }
    if (name === "export") {
      for (const a of args) {
        const eq = a.indexOf("=");
        if (eq > 0) this.setVar(a.slice(0, eq), a.slice(eq + 1));
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (name === "unset") {
      for (const a of args) delete this.env[a];
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (name === "alias") {
      if (args.length === 0) {
        const lines = Object.keys(this.aliases).sort()
          .map(k => "alias " + k + "='" + this.aliases[k] + "'")
          .join("\n");
        return { stdout: lines + (lines ? "\n" : ""), stderr: "", exitCode: 0 };
      }
      for (const a of args) {
        const eq = a.indexOf("=");
        if (eq > 0) {
          let v = a.slice(eq + 1);
          // 端的なクォート除去
          if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
            v = v.slice(1, -1);
          }
          this.aliases[a.slice(0, eq)] = v;
        }
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (name === "unalias") {
      for (const a of args) delete this.aliases[a];
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    // レジストリから探す
    const cmd = this.commands[name];
    if (!cmd) {
      return {
        stdout: "",
        stderr: name + ": コマンドが見つかりません。　help と打つと使えるコマンドの一覧が表示されます。\n",
        exitCode: 127
      };
    }

    const ctx = {
      shell: this,
      vfs: this.vfs,
      env: this.env,
      stdin: stdin || "",
      args,
      isTTY: !!opts.isTTY
    };
    const result = await cmd.run(ctx);
    return Object.assign({ stdout: "", stderr: "", exitCode: 0 }, result || {});
  };

  // プロンプト生成
  Shell.prototype.prompt = function () {
    const u = this.vfs.user;
    const h = this.vfs.hostname;
    let cwd = this.vfs.cwd;
    if (cwd === this.vfs.home) cwd = "~";
    else if (cwd.startsWith(this.vfs.home + "/")) cwd = "~" + cwd.slice(this.vfs.home.length);
    return u + "@" + h + ":" + cwd + "$ ";
  };

  // 対話モード継続: less/vim の入力 1 行を処理する
  Shell.prototype.continueInteractive = async function (line) {
    if (!this._interactive) return { output: "", exit: true };
    const handler = this._interactive.handler;
    const ctx = {
      shell: this,
      vfs: this.vfs,
      env: this.env,
      args: [],
      stdin: "",
      isTTY: true
    };
    let result;
    try {
      result = await handler(String(line), ctx);
    } catch (e) {
      result = { output: "interactive: 内部エラー: " + (e && e.message ? e.message : String(e)) + "\n", exit: true };
    }
    if (result && result.exit) this._interactive = null;
    return result || { output: "", exit: true };
  };

  window.Shell = Shell;
})();
