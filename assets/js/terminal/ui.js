/* =========================================================
   ui.js — 仮想ターミナルの UI
   - macOS Terminal 風ウィンドウ
   - 出力エリア + 入力行
   - ANSI カラーエスケープ対応 (\x1b[1;34m など)
   - 色付きプロンプト (user@host 緑 / path 水色 / $ 白)
   - キー操作: Enter / ↑↓ (履歴) / Tab (補完) / Ctrl+L (クリア)
   ========================================================= */

(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---------- ANSI → HTML ----------
  // 対応: ESC[Nm / ESC[N;Mm / ESC[0m / 30-37 / 90-97 / 1 (bold) / 2 (dim)
  const ANSI_FG = {
    30: "#000", 31: "#ff5e5e", 32: "#5af78e", 33: "#f3f99d",
    34: "#57c7ff", 35: "#ff6ac1", 36: "#9aedfe", 37: "#f1f1f0",
    90: "#686868", 91: "#ff5e5e", 92: "#5af78e", 93: "#f3f99d",
    94: "#57c7ff", 95: "#ff6ac1", 96: "#9aedfe", 97: "#ffffff"
  };

  function ansiToHtml(text) {
    const escaped = escapeHtml(text);
    const re = /\x1b\[([0-9;]*)m/g;
    let out = "";
    let last = 0;
    let openSpans = 0;
    let m;
    while ((m = re.exec(escaped)) !== null) {
      out += escaped.slice(last, m.index);
      const codes = m[1] ? m[1].split(";").map(s => parseInt(s, 10) || 0) : [0];
      // reset
      if (codes.length === 1 && codes[0] === 0) {
        while (openSpans > 0) { out += "</span>"; openSpans--; }
      } else {
        let style = "";
        let bold = false, dim = false;
        for (const c of codes) {
          if (c === 0) {
            while (openSpans > 0) { out += "</span>"; openSpans--; }
            bold = false; dim = false; style = "";
          } else if (c === 1) bold = true;
          else if (c === 2) dim = true;
          else if (ANSI_FG[c]) style += "color:" + ANSI_FG[c] + ";";
        }
        if (bold) style += "font-weight:600;";
        if (dim)  style += "opacity:.65;";
        if (style) { out += '<span style="' + style + '">'; openSpans++; }
      }
      last = m.index + m[0].length;
    }
    out += escaped.slice(last);
    while (openSpans > 0) { out += "</span>"; openSpans--; }
    return out;
  }

  // ---------- Terminal ----------
  function Terminal(host, shell, opts) {
    this.host = typeof host === "string" ? document.querySelector(host) : host;
    if (!this.host) throw new Error("Terminal: host 要素が見つかりません");
    this.shell = shell;
    this.opts = opts || {};
    this.histIndex = -1;
    this.histDraft = "";
    this.busy = false;
    this.onCommand = this.opts.onCommand || null;

    this._build();
    this._wire();
    if (this.opts.banner) this.print(this.opts.banner);
    this._renderPrompt();
  }

  Terminal.prototype._build = function () {
    this.host.classList.add("term");
    this.host.innerHTML = `
      <div class="term__chrome">
        <div class="term__lights" aria-hidden="true">
          <span class="term__light term__light--red"></span>
          <span class="term__light term__light--yellow"></span>
          <span class="term__light term__light--green"></span>
        </div>
        <div class="term__title"></div>
        <div class="term__chrome-spacer"></div>
      </div>
      <div class="term__body" tabindex="0">
        <div class="term__output" aria-live="polite"></div>
        <div class="term__line">
          <span class="term__prompt"></span><span class="term__input" contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off" inputmode="text" aria-label="ターミナル入力"></span><span class="term__caret" aria-hidden="true"></span>
        </div>
      </div>
    `;
    this.titleEl   = this.host.querySelector(".term__title");
    this.bodyEl    = this.host.querySelector(".term__body");
    this.outputEl  = this.host.querySelector(".term__output");
    this.promptEl  = this.host.querySelector(".term__prompt");
    this.inputEl   = this.host.querySelector(".term__input");
    if (this.opts.title) this.titleEl.textContent = this.opts.title;
  };

  Terminal.prototype._wire = function () {
    const self = this;

    // クリックで入力にフォーカス（テキスト選択中はそのまま）
    this.host.addEventListener("click", () => {
      const sel = window.getSelection();
      if (sel && sel.toString()) return;
      self.inputEl.focus();
      self._moveCaretToEnd();
    });

    // ペースト: プレーンテキスト化
    this.inputEl.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      document.execCommand("insertText", false, text);
    });

    this.inputEl.addEventListener("keydown", (e) => {
      if (self.busy) {
        if (e.ctrlKey && e.key === "c") {
          self.busy = false;
          self.print("^C\n");
          self._renderPrompt();
          e.preventDefault();
          return;
        }
        e.preventDefault();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        self._submit(self.inputEl.textContent);
        return;
      }
      if (e.key === "ArrowUp")   { e.preventDefault(); self._historyBack(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); self._historyForward(); return; }
      // 対話モード中 (less/vim 等) は Tab 補完を無効化する。シェルコマンド名を
      // 補完しに行くと less の :prompt で意図しない動作になるため。
      if (e.key === "Tab")       {
        e.preventDefault();
        if (self.shell._interactive) return;
        self._tabComplete();
        return;
      }
      if (e.key === "l" && e.ctrlKey) { e.preventDefault(); self.clear(); return; }
      if (e.key === "u" && e.ctrlKey) { e.preventDefault(); self.inputEl.textContent = ""; return; }
      if (e.key === "c" && e.ctrlKey) {
        const sel = window.getSelection();
        if (sel && sel.toString()) return; // コピーが選択中ならブラウザに任せる
        e.preventDefault();
        self.print(self._renderPromptString() + self.inputEl.textContent + "\n");
        self.print("^C\n");
        self.inputEl.textContent = "";
        self._renderPrompt();
        return;
      }
      if (e.key === "d" && e.ctrlKey) {
        if (self.inputEl.textContent === "") {
          e.preventDefault();
          self.print("exit\n");
          self._submit("exit");
        }
      }
    });

    this.inputEl.addEventListener("focus", () => {
      self.host.classList.add("is-focused");
      self.bodyEl.scrollTop = self.bodyEl.scrollHeight;
    });
    this.inputEl.addEventListener("blur", () => {
      self.host.classList.remove("is-focused");
    });
  };

  Terminal.prototype._moveCaretToEnd = function () {
    const range = document.createRange();
    range.selectNodeContents(this.inputEl);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // 色付きプロンプトを HTML として生成
  Terminal.prototype._renderPromptHTML = function () {
    // 対話モード中 (less / vim 等) は専用プロンプトを表示
    if (this.shell._interactive) {
      const p = this.shell._interactive.prompt || ":";
      return '<span class="term__p-sym">' + escapeHtml(p) + "</span>";
    }
    const v = this.shell.vfs;
    const u = v.user;
    const h = v.hostname;
    let cwd = v.cwd;
    if (cwd === v.home) cwd = "~";
    else if (cwd.startsWith(v.home + "/")) cwd = "~" + cwd.slice(v.home.length);
    return (
      '<span class="term__p-user">' + escapeHtml(u) + "@" + escapeHtml(h) + "</span>" +
      '<span class="term__p-sep">:</span>' +
      '<span class="term__p-path">' + escapeHtml(cwd) + "</span>" +
      '<span class="term__p-sym">$ </span>'
    );
  };

  // テキスト版（コマンドエコー時に出力に書き込む用）
  Terminal.prototype._renderPromptString = function () {
    if (this.shell._interactive) return this.shell._interactive.prompt || ":";
    return this.shell.prompt();
  };

  Terminal.prototype._renderPrompt = function () {
    this.promptEl.innerHTML = this._renderPromptHTML();
    this.inputEl.textContent = "";
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
    setTimeout(() => this.inputEl.focus({ preventScroll: true }), 0);
  };

  // 出力 (ANSI 解釈つき)
  Terminal.prototype.print = function (text) {
    if (text == null || text === "") return;
    let s = String(text);
    // 画面クリアエスケープ (CSI 2J)。clear コマンドが出力する。
    // [H (カーソルホーム) も同時に来るので一緒に取り除く。
    if (s.indexOf("\x1b[2J") >= 0) {
      this.clear();
      s = s.replace(/\x1b\[[0-9;]*[HJ]/g, "");
      if (!s) return;
    }
    const html = ansiToHtml(s);
    const span = document.createElement("span");
    span.innerHTML = html;
    this.outputEl.appendChild(span);
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  };

  // エコー (色付きプロンプト + 入力をそのまま) — HTML 出力
  Terminal.prototype._echoCommand = function (line) {
    const wrap = document.createElement("div");
    wrap.className = "term__echo";
    wrap.innerHTML = this._renderPromptHTML() +
      '<span class="term__echo-input">' + escapeHtml(line) + "</span>";
    this.outputEl.appendChild(wrap);
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  };

  Terminal.prototype.clear = function () {
    this.outputEl.innerHTML = "";
  };

  Terminal.prototype.focus = function () {
    this.inputEl.focus();
  };

  Terminal.prototype._submit = async function (line) {
    const trimmed = String(line || "");
    this._echoCommand(trimmed);
    this.inputEl.textContent = "";
    this.histIndex = -1;
    this.histDraft = "";

    // 対話モード中: 通常コマンドではなく less/vim 等のハンドラに流す
    if (this.shell._interactive) {
      this.busy = true;
      this.host.classList.add("is-busy");
      let result;
      try {
        result = await this.shell.continueInteractive(trimmed);
      } catch (e) {
        result = { output: "interactive: 内部エラー: " + (e && e.message ? e.message : String(e)) + "\n", exit: true };
        this.shell._interactive = null;
      }
      if (result && result.output) this.print(result.output);
      this.busy = false;
      this.host.classList.remove("is-busy");
      if (typeof this.onCommand === "function") {
        try { this.onCommand(trimmed, { exitCode: 0, output: (result && result.output) || "", interactive: !!this.shell._interactive }); }
        catch (e) { console.error(e); }
      }
      this._renderPrompt();
      return;
    }

    if (!trimmed.trim()) {
      this._renderPrompt();
      return;
    }

    this.busy = true;
    this.host.classList.add("is-busy");

    let result;
    try {
      result = await this.shell.run(trimmed);
    } catch (e) {
      result = { exitCode: 1, output: "shell: 内部エラー: " + (e && e.message ? e.message : String(e)) + "\n" };
    }

    if (result && result.output) this.print(result.output);

    if (typeof this.onCommand === "function") {
      try { this.onCommand(trimmed, result); } catch (e) { console.error(e); }
    }

    if (window.Progress) Progress.pushHistory(trimmed);

    if (this.shell._exitRequested) {
      this.print("logout\n");
      this.busy = false;
      this.host.classList.remove("is-busy");
      this.inputEl.contentEditable = "false";
      this.host.classList.add("is-closed");
      return;
    }

    this.busy = false;
    this.host.classList.remove("is-busy");
    this._renderPrompt();
  };

  // ---------- 履歴 ----------
  Terminal.prototype._historyBack = function () {
    const h = this.shell.history;
    if (h.length === 0) return;
    if (this.histIndex === -1) this.histDraft = this.inputEl.textContent;
    if (this.histIndex < h.length - 1) this.histIndex++;
    this.inputEl.textContent = h[h.length - 1 - this.histIndex] || "";
    this._moveCaretToEnd();
  };

  Terminal.prototype._historyForward = function () {
    const h = this.shell.history;
    if (this.histIndex <= 0) {
      this.histIndex = -1;
      this.inputEl.textContent = this.histDraft || "";
      this._moveCaretToEnd();
      return;
    }
    this.histIndex--;
    this.inputEl.textContent = h[h.length - 1 - this.histIndex] || "";
    this._moveCaretToEnd();
  };

  // ---------- Tab 補完 ----------
  // 行末の "単語" を取り出す。ただし、空白の直前がバックスラッシュなら
  // エスケープされているので単語の一部として取り込む (例: "hidden\ wo")
  function extractLastWord(line) {
    let i = line.length;
    while (i > 0) {
      const ch = line[i - 1];
      if (ch === " " || ch === "\t") {
        // 直前のバックスラッシュ数を数える
        let bs = 0, k = i - 2;
        while (k >= 0 && line[k] === "\\") { bs++; k--; }
        if (bs % 2 === 1) { i -= 2; continue; } // エスケープされた空白
        break;
      }
      i--;
    }
    return line.slice(i);
  }

  Terminal.prototype._tabComplete = function () {
    const line = this.inputEl.textContent;
    const rawPrefix = extractLastWord(line);
    // バックスラッシュエスケープを剥がして、VFS のエントリ名と直接マッチさせる
    const prefix = rawPrefix.replace(/\\(.)/g, "$1");
    const before = line.slice(0, line.length - rawPrefix.length);
    const isFirstWord = !/\S/.test(before);

    let candidates;
    if (isFirstWord && !prefix.startsWith(".") && !prefix.startsWith("/") && !prefix.includes("/")) {
      const cmds = Object.keys(this.shell.commands).concat(["cd", "exit", "alias", "export", "unset"]);
      candidates = cmds.filter(c => c.startsWith(prefix)).sort();
    } else {
      candidates = this._completePath(prefix);
    }

    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      this.inputEl.textContent = before + candidates[0];
      this._moveCaretToEnd();
      return;
    }
    const common = longestCommonPrefix(candidates);
    if (common.length > rawPrefix.length) {
      this.inputEl.textContent = before + common;
      this._moveCaretToEnd();
      return;
    }
    this._echoCommand(line);
    this.print(candidates.join("  ") + "\n");
  };

  // 補完されたファイル名のうち、シェルが特別に解釈する文字をバックスラッシュで
  // エスケープする。これにより "hidden words.txt" → "hidden\ words.txt" のように
  // 補完結果がそのまま実行可能な引数になる。
  function shellEscape(name) {
    return name.replace(/([ \t"'\\$`()&|;<>*?\[#])/g, "\\$1");
  }

  Terminal.prototype._completePath = function (prefix) {
    const slashIdx = prefix.lastIndexOf("/");
    let listDir, displayDir, partial;
    if (slashIdx >= 0) {
      listDir = prefix.slice(0, slashIdx + 1);
      displayDir = listDir;
      partial = prefix.slice(slashIdx + 1);
    } else {
      // ユーザーが "/" を入れていないので、補完結果に "./" を付与しない。
      // ただし VFS には何かを渡す必要があるためカレントを意味する "." を渡す。
      listDir = ".";
      displayDir = "";
      partial = prefix;
    }
    const r = this.shell.vfs.list(listDir);
    if (r.error) return [];
    const matches = r.entries.filter(e => e.name.startsWith(partial));
    return matches.map(e => {
      const isDir = e.node && e.node.type === "dir";
      return displayDir + shellEscape(e.name) + (isDir ? "/" : "");
    });
  };

  function longestCommonPrefix(arr) {
    if (arr.length === 0) return "";
    let p = arr[0];
    for (let i = 1; i < arr.length; i++) {
      while (!arr[i].startsWith(p)) p = p.slice(0, -1);
      if (!p) return "";
    }
    return p;
  }

  window.Terminal = Terminal;
})();
