/* =========================================================
   commands.js — 仮想シェル用コマンド実装
   各コマンド: { description, run(ctx) → { stdout, stderr, exitCode } }
   ctx: { shell, vfs, env, stdin, args }
   ========================================================= */

(function () {
  "use strict";

  // ---------- ヘルパ ----------
  const ok = (stdout = "", code = 0) => ({ stdout, stderr: "", exitCode: code });
  const err = (msg, code = 1, stdout = "") => ({ stdout, stderr: msg.endsWith("\n") ? msg : msg + "\n", exitCode: code });

  function parseFlags(args, opts) {
    // opts: { boolean: ['l','a',...], string: ['n','t'], stopOnNonFlag: bool }
    const flags = {};
    const positional = [];
    const boolFlags = new Set(opts && opts.boolean || []);
    const stringFlags = new Set(opts && opts.string || []);
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "--") { positional.push.apply(positional, args.slice(i + 1)); break; }
      if (a.length > 1 && a.startsWith("-") && !a.startsWith("--") && a !== "-") {
        // -abc → 各文字を分解
        const chars = a.slice(1).split("");
        let consumed = false;
        for (let j = 0; j < chars.length; j++) {
          const ch = chars[j];
          if (stringFlags.has(ch)) {
            const rest = chars.slice(j + 1).join("");
            if (rest) { flags[ch] = rest; consumed = true; break; }
            else if (i + 1 < args.length) { flags[ch] = args[++i]; consumed = true; break; }
            else flags[ch] = "";
          } else {
            flags[ch] = true;
          }
        }
        if (consumed) continue;
        continue;
      }
      if (a.startsWith("--")) {
        const eq = a.indexOf("=");
        if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
        else flags[a.slice(2)] = true;
        continue;
      }
      positional.push(a);
    }
    return { flags, positional };
  }

  function pathBase(p) {
    const s = String(p).replace(/\/+$/, "");
    const idx = s.lastIndexOf("/");
    return idx >= 0 ? s.slice(idx + 1) : s;
  }

  function splitLines(s) {
    if (!s) return [];
    const arr = s.split("\n");
    if (arr[arr.length - 1] === "") arr.pop();
    return arr;
  }

  // ファイル種別ごとに ANSI 色をかぶせる (isTTY=true のときのみ)
  function colorName(name, node, useColor) {
    if (!useColor || !node) return name;
    if (node.type === "dir")     return "\x1b[1;34m" + name + "\x1b[0m";
    if (node.type === "symlink") return "\x1b[1;36m" + name + "\x1b[0m";
    if ((node.mode & 0o111) !== 0) return "\x1b[1;32m" + name + "\x1b[0m";
    return name;
  }

  // ---------- 各コマンド ----------
  const COMMANDS = {

    pwd: {
      description: "現在のディレクトリを表示",
      run(ctx) { return ok(ctx.vfs.cwd + "\n"); }
    },

    whoami: {
      description: "現在のユーザー名を表示",
      run(ctx) { return ok(ctx.vfs.user + "\n"); }
    },

    id: {
      description: "ユーザー ID とグループ ID を表示",
      run(ctx) {
        const u = ctx.vfs.user;
        const groups = ctx.vfs.groups.join(",");
        return ok(`uid=1000(${u}) gid=1000(${u}) groups=1000(${groups})\n`);
      }
    },

    hostname: {
      description: "ホスト名を表示",
      run(ctx) { return ok(ctx.vfs.hostname + "\n"); }
    },

    uname: {
      description: "OS 名・カーネル情報を表示",
      run(ctx) {
        const { flags } = parseFlags(ctx.args, { boolean: ["a", "s", "n", "r", "m"] });
        const sys = "Linux";
        const node = ctx.vfs.hostname;
        const rel = "5.15.0-shell";
        const mach = "x86_64";
        if (flags.a) return ok(`${sys} ${node} ${rel} #1 SMP ${mach}\n`);
        if (flags.n) return ok(node + "\n");
        if (flags.r) return ok(rel + "\n");
        if (flags.m) return ok(mach + "\n");
        return ok(sys + "\n");
      }
    },

    echo: {
      description: "引数を表示する",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["n", "e"] });
        let s = positional.join(" ");
        if (flags.e) {
          s = s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
        }
        return ok(s + (flags.n ? "" : "\n"));
      }
    },

    clear: {
      description: "画面をクリアする",
      // 実 terminal の挙動に合わせ ANSI エスケープ (CSI 2J / CSI H) を出力。
      // ui.js 側でこれを拾って画面消去する。
      run() { return { stdout: "\x1b[H\x1b[2J", stderr: "", exitCode: 0 }; }
    },

    help: {
      description: "使えるコマンド一覧を表示する (Shell 独自)",
      run(ctx) {
        const names = Object.keys(ctx.shell.commands).concat(["cd", "exit", "alias", "export"]).sort();
        const lines = names.map(n => {
          const c = ctx.shell.commands[n];
          const d = c ? c.description : "(組み込み)";
          return "  " + n.padEnd(12) + d;
        }).join("\n");
        return ok(
          "使えるコマンド一覧:\n" +
          lines + "\n" +
          "\n" +
          "右上のチートシートに各コマンドの詳しい使い方が載っています。\n"
        );
      }
    },

    ls: {
      description: "ディレクトリの中身を表示",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["l", "a", "A", "h", "1", "F", "R", "r", "t", "S", "n", "i", "d"] });
        const useColor = ctx.isTTY && flags.color !== "never";
        const targets = positional.length ? positional : ["."];
        let out = "";
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          const r = ctx.vfs.list(t);
          if (r.error) {
            out += "ls: " + t + ": " + (r.error === "ENOENT" ? "そのようなファイルやディレクトリはありません"
              : r.error === "EACCES" ? "権限がありません" : r.error) + "\n";
            continue;
          }
          let entries = r.entries.slice();
          if (!flags.a && !flags.A) entries = entries.filter(e => !e.name.startsWith("."));
          if (flags.a) {
            entries = [
              { name: ".", node: ctx.vfs.stat(r.path).node },
              { name: "..", node: ctx.vfs.stat(r.path === "/" ? "/" : r.path.replace(/\/[^/]*$/, "") || "/").node }
            ].concat(entries);
          }
          if (targets.length > 1) out += t + ":\n";
          if (flags.l || flags.n) {
            for (const e of entries) {
              const n = e.node;
              const mode = window.VFS.formatMode(n);
              const own = flags.n ? "1000" : n.owner;
              const grp = flags.n ? "1000" : n.group;
              const size = window.VFS.fileSize(n);
              const sizeFmt = flags.h ? humanSize(size) : String(size);
              const time = window.VFS.formatTime(n.mtime);
              let nameRender = colorName(e.name, n, useColor);
              if (n.type === "dir" && flags.F) nameRender += "/";
              if (n.type === "symlink") nameRender = colorName(e.name, n, useColor) + " -> " + (n.target || "");
              out += `${mode} 1 ${own.padEnd(8)} ${grp.padEnd(8)} ${sizeFmt.padStart(6)} ${time} ${nameRender}\n`;
            }
          } else {
            const names = entries.map(e => {
              let s = colorName(e.name, e.node, useColor);
              if (e.node.type === "dir" && flags.F) s += "/";
              return s;
            });
            out += names.join("  ") + (names.length ? "\n" : "");
          }
          if (i < targets.length - 1) out += "\n";
        }
        return ok(out);
      }
    },

    cat: {
      description: "ファイルの中身を表示",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["n", "A", "s", "E", "T"] });
        if (positional.length === 0) {
          // 標準入力をそのまま
          return ok(ctx.stdin || "");
        }
        let out = "";
        let lineNo = 1;
        for (const p of positional) {
          let content;
          if (p === "-") {
            // 実 bash と同様、引数の "-" は標準入力を意味する
            content = ctx.stdin || "";
          } else {
            const r = ctx.vfs.readFile(p);
            if (r.error) {
              return err("cat: " + p + ": " + (r.error === "ENOENT" ? "そのようなファイルやディレクトリはありません"
                : r.error === "EISDIR" ? "ディレクトリです"
                : r.error === "EACCES" ? "権限がありません" : r.error));
            }
            content = r.content;
          }
          if (flags.n) {
            content = content.split("\n").map((l, i, arr) => {
              if (i === arr.length - 1 && l === "") return l;
              const n = lineNo++;
              return String(n).padStart(6) + "  " + l;
            }).join("\n");
          }
          out += content;
        }
        return ok(out);
      }
    },

    head: {
      description: "ファイルの先頭を表示",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { string: ["n", "c"] });
        const n = parseInt(flags.n != null ? flags.n : "10", 10) || 10;
        const sources = positional.length ? positional : null;
        let out = "";
        if (!sources) {
          out = splitLines(ctx.stdin).slice(0, n).join("\n");
          if (out) out += "\n";
          return ok(out);
        }
        for (let i = 0; i < sources.length; i++) {
          const r = ctx.vfs.readFile(sources[i]);
          if (r.error) { out += "head: " + sources[i] + ": エラー\n"; continue; }
          if (sources.length > 1) out += "==> " + sources[i] + " <==\n";
          out += splitLines(r.content).slice(0, n).join("\n");
          if (out && !out.endsWith("\n")) out += "\n";
        }
        return ok(out);
      }
    },

    tail: {
      description: "ファイルの末尾を表示",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { string: ["n", "c"], boolean: ["f", "F"] });
        const n = parseInt(flags.n != null ? flags.n : "10", 10) || 10;
        const sources = positional.length ? positional : null;
        let out = "";
        if (!sources) {
          out = splitLines(ctx.stdin).slice(-n).join("\n");
          if (out) out += "\n";
          return ok(out);
        }
        for (let i = 0; i < sources.length; i++) {
          const r = ctx.vfs.readFile(sources[i]);
          if (r.error) { out += "tail: " + sources[i] + ": エラー\n"; continue; }
          if (sources.length > 1) out += "==> " + sources[i] + " <==\n";
          out += splitLines(r.content).slice(-n).join("\n");
          if (out && !out.endsWith("\n")) out += "\n";
        }
        if (flags.f || flags.F) out += "tail: -f はこの仮想シェルでは実装されていません。\n";
        return ok(out);
      }
    },

    wc: {
      description: "行数・単語数・文字数を数える",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["l", "w", "c", "m"] });
        const showAll = !flags.l && !flags.w && !flags.c && !flags.m;
        function count(text, name) {
          const lines = (text.match(/\n/g) || []).length + (text && !text.endsWith("\n") ? 1 : 0);
          const words = text.split(/\s+/).filter(Boolean).length;
          const chars = text.length;
          const parts = [];
          if (showAll || flags.l) parts.push(String(lines).padStart(7));
          if (showAll || flags.w) parts.push(String(words).padStart(7));
          if (showAll || flags.c || flags.m) parts.push(String(chars).padStart(7));
          let line = parts.join(" ");
          if (name) line += " " + name;
          return line;
        }
        if (positional.length === 0) return ok(count(ctx.stdin || "", "") + "\n");
        let out = "";
        let totals = { l: 0, w: 0, c: 0 };
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) { out += "wc: " + p + ": エラー\n"; continue; }
          out += count(r.content, p) + "\n";
          totals.l += (r.content.match(/\n/g) || []).length;
          totals.w += r.content.split(/\s+/).filter(Boolean).length;
          totals.c += r.content.length;
        }
        if (positional.length > 1) {
          out += String(totals.l).padStart(7) + " " + String(totals.w).padStart(7) + " " + String(totals.c).padStart(7) + " 合計\n";
        }
        return ok(out);
      }
    },

    file: {
      description: "ファイルの種類を判別",
      run(ctx) {
        const { positional } = parseFlags(ctx.args, { boolean: ["b"] });
        if (positional.length === 0) return err("file: ファイル名が必要です");
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.lstat(p);
          if (r.error) { out += p + ": cannot open: そのようなファイルはありません\n"; continue; }
          const node = r.node;
          let kind;
          if (node.type === "dir") kind = "directory";
          else if (node.type === "symlink") kind = "symbolic link to " + (node.target || "?");
          else {
            const c = node.content || "";
            if (c.length === 0) kind = "empty";
            else if (/^\x7fELF/.test(c)) kind = "ELF binary";
            else if (/[\x00-\x08\x0E-\x1F]/.test(c.slice(0, 1024))) kind = "data";
            else {
              // 0x7F 超の文字を含めば UTF-8 (実 file はもっと細かく判定するが簡易版)
              let hasHigh = false;
              for (let k = 0; k < Math.min(c.length, 1024); k++) {
                if (c.charCodeAt(k) > 0x7f) { hasHigh = true; break; }
              }
              kind = hasHigh ? "UTF-8 Unicode text" : "ASCII text";
            }
          }
          out += p + ": " + kind + "\n";
        }
        return ok(out);
      }
    },

    stat: {
      description: "ファイルの詳細情報を表示",
      run(ctx) {
        const { positional } = parseFlags(ctx.args, {});
        if (positional.length === 0) return err("stat: ファイル名が必要です");
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.stat(p);
          if (r.error) { out += "stat: cannot stat '" + p + "'\n"; continue; }
          const n = r.node;
          out += `  File: ${p}\n`;
          out += `  Size: ${window.VFS.fileSize(n)}\tType: ${n.type}\n`;
          out += `Access: (${n.mode.toString(8).padStart(4, "0")})  Uid: (${n.owner})  Gid: (${n.group})\n`;
          out += `Modify: ${(n.mtime || new Date()).toISOString()}\n`;
        }
        return ok(out);
      }
    },

    mkdir: {
      description: "ディレクトリを作成",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["p", "v"] });
        if (positional.length === 0) return err("mkdir: 作成するディレクトリ名が必要です");
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.mkdir(p, { recursive: !!flags.p });
          if (r.error) {
            return err("mkdir: " + p + ": " + (r.error === "EEXIST" ? "既に存在します" : r.error));
          }
          if (flags.v) out += "mkdir: created '" + p + "'\n";
        }
        return ok(out);
      }
    },

    rmdir: {
      description: "空のディレクトリを削除",
      run(ctx) {
        const { positional } = parseFlags(ctx.args, {});
        if (positional.length === 0) return err("rmdir: 削除するディレクトリ名が必要です");
        for (const p of positional) {
          const r = ctx.vfs.rmdir(p);
          if (r.error) return err("rmdir: " + p + ": " + (r.error === "ENOTEMPTY" ? "ディレクトリが空ではありません" : r.error));
        }
        return ok();
      }
    },

    rm: {
      description: "ファイル / ディレクトリを削除",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["r", "R", "f", "i", "v"] });
        if (positional.length === 0) return err("rm: 削除するパスが必要です");
        const recursive = flags.r || flags.R;
        let out = "";
        for (const p of positional) {
          if (recursive) {
            const r = ctx.vfs.rmRecursive(p);
            if (r.error && !flags.f) return err("rm: " + p + ": " + r.error);
          } else {
            const r = ctx.vfs.unlink(p);
            if (r.error && !flags.f) {
              return err("rm: " + p + ": " + (r.error === "EISDIR" ? "ディレクトリです (-r が必要)" : r.error));
            }
          }
          if (flags.v) out += "removed '" + p + "'\n";
        }
        return ok(out);
      }
    },

    touch: {
      description: "空のファイルを作成 / 更新時刻を変更",
      run(ctx) {
        const { positional } = parseFlags(ctx.args, {});
        for (const p of positional) {
          const r = ctx.vfs.stat(p);
          if (r.error) {
            const w = ctx.vfs.writeFile(p, "");
            if (w.error) return err("touch: " + p + ": " + w.error);
          } else {
            r.node.mtime = new Date();
          }
        }
        return ok();
      }
    },

    cp: {
      description: "ファイル / ディレクトリをコピー",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["r", "R", "v", "f"] });
        if (positional.length < 2) return err("cp: 元と先のパスが必要です");
        const dst = positional.pop();
        for (const src of positional) {
          const r = ctx.vfs.copy(src, dst, !!(flags.r || flags.R));
          if (r.error) return err("cp: " + src + ": " + r.error);
        }
        return ok();
      }
    },

    mv: {
      description: "ファイル / ディレクトリを移動 / 改名",
      run(ctx) {
        const { positional } = parseFlags(ctx.args, {});
        if (positional.length < 2) return err("mv: 元と先のパスが必要です");
        const dst = positional.pop();
        for (const src of positional) {
          const r = ctx.vfs.move(src, dst);
          if (r.error) return err("mv: " + src + ": " + r.error);
        }
        return ok();
      }
    },

    grep: {
      description: "パターンに合致する行を抜き出す",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["i", "v", "n", "c", "l", "E", "r", "R", "H", "h", "F", "q"], string: ["e", "f"] });
        if (positional.length === 0 && !flags.e) return err("grep: パターンが必要です");
        const pattern = flags.e != null ? flags.e : positional.shift();
        let re;
        try {
          const flagsRe = "g" + (flags.i ? "i" : "");
          const src = flags.F ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pattern;
          re = new RegExp(src, flagsRe);
        } catch (e) {
          return err("grep: パターンが不正です: " + e.message);
        }
        function searchText(text, fileLabel) {
          const lines = text.split("\n");
          let out = "";
          let count = 0;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (i === lines.length - 1 && line === "") continue;
            re.lastIndex = 0;
            const matched = re.test(line);
            const want = flags.v ? !matched : matched;
            if (want) {
              count++;
              if (flags.c || flags.l || flags.q) continue;
              let prefix = "";
              if (fileLabel && (positional.length > 1 || flags.H || flags.r || flags.R)) prefix += fileLabel + ":";
              if (flags.n) prefix += (i + 1) + ":";
              out += prefix + line + "\n";
            }
          }
          if (flags.c) out = (fileLabel ? fileLabel + ":" : "") + count + "\n";
          if (flags.l && count > 0) out = fileLabel + "\n";
          if (flags.q) out = "";
          return { out, count };
        }
        const sources = positional;
        if (sources.length === 0) {
          const r = searchText(ctx.stdin || "", null);
          return { stdout: r.out, stderr: "", exitCode: r.count > 0 ? 0 : 1 };
        }
        let out = ""; let totalCount = 0;
        for (const p of sources) {
          const fr = ctx.vfs.readFile(p);
          if (fr.error) { out += "grep: " + p + ": " + fr.error + "\n"; continue; }
          const r = searchText(fr.content, p);
          out += r.out;
          totalCount += r.count;
        }
        return { stdout: out, stderr: "", exitCode: totalCount > 0 ? 0 : 1 };
      }
    },

    find: {
      description: "ファイルを再帰的に検索",
      run(ctx) {
        const args = ctx.args.slice();
        let start = ".";
        if (args.length && !args[0].startsWith("-")) start = args.shift();

        // 条件を順にパース
        const conds = [];
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === "-name") conds.push({ kind: "name", value: args[++i] });
          else if (a === "-iname") conds.push({ kind: "iname", value: args[++i] });
          else if (a === "-type") conds.push({ kind: "type", value: args[++i] });
          else if (a === "-size") conds.push({ kind: "size", value: args[++i] });
          else if (a === "-user") conds.push({ kind: "user", value: args[++i] });
          else if (a === "-group") conds.push({ kind: "group", value: args[++i] });
          else if (a === "-perm") conds.push({ kind: "perm", value: args[++i] });
          else if (a === "-not" || a === "!") conds.push({ kind: "not" });
          else if (a === "-print") conds.push({ kind: "print" });
          // 未知のフラグは黙って無視
        }

        function nameMatch(seg, pat, ci) {
          // pat は glob 風 (* と ?)
          const re = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
            ci ? "i" : "");
          return re.test(seg);
        }

        function parseSize(spec) {
          // 例: +100k, -10M, 5
          let cmp = "=";
          if (spec[0] === "+") { cmp = ">"; spec = spec.slice(1); }
          else if (spec[0] === "-") { cmp = "<"; spec = spec.slice(1); }
          const m = /^(\d+)([ckMG]?)$/.exec(spec);
          if (!m) return null;
          let n = parseInt(m[1], 10);
          const unit = m[2];
          if (unit === "k") n *= 1024;
          else if (unit === "M") n *= 1024 * 1024;
          else if (unit === "G") n *= 1024 * 1024 * 1024;
          else if (unit === "" || unit === "c") n = n * (unit === "c" ? 1 : 512);
          return { cmp, n };
        }

        function evalConds(node, p) {
          let neg = false;
          for (let i = 0; i < conds.length; i++) {
            const c = conds[i];
            if (c.kind === "not") { neg = !neg; continue; }
            let r = true;
            const seg = pathBase(p);
            switch (c.kind) {
              case "name":  r = nameMatch(seg, c.value, false); break;
              case "iname": r = nameMatch(seg, c.value, true); break;
              case "type":
                r = (c.value === "f" && node.type === "file") ||
                    (c.value === "d" && node.type === "dir") ||
                    (c.value === "l" && node.type === "symlink");
                break;
              case "size": {
                const s = parseSize(c.value);
                if (!s) { r = false; break; }
                const sz = window.VFS.fileSize(node);
                r = s.cmp === ">" ? sz > s.n : s.cmp === "<" ? sz < s.n : sz === s.n;
                break;
              }
              case "user":  r = node.owner === c.value; break;
              case "group": r = node.group === c.value; break;
              case "perm": {
                const want = parseInt(c.value, 8);
                r = (node.mode & 0o777) === want;
                break;
              }
              case "print": r = true; break;
              default: r = true;
            }
            if (neg) { r = !r; neg = false; }
            if (!r) return false;
          }
          return true;
        }

        const r = ctx.vfs.find(start, evalConds);
        if (r.error) return err("find: '" + start + "': " + r.error);
        const lines = r.results.map(x => x.path).join("\n");
        return ok(lines + (lines ? "\n" : ""));
      }
    },

    sort: {
      description: "行を並び替える",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["n", "r", "u", "f"] });
        let text;
        if (positional.length) {
          text = "";
          for (const p of positional) {
            const r = ctx.vfs.readFile(p);
            if (r.error) return err("sort: " + p + ": " + r.error);
            text += r.content;
          }
        } else {
          text = ctx.stdin || "";
        }
        let lines = splitLines(text);
        const cmp = flags.n
          ? (a, b) => parseFloat(a) - parseFloat(b)
          : flags.f
            ? (a, b) => a.toLowerCase().localeCompare(b.toLowerCase())
            : (a, b) => a < b ? -1 : a > b ? 1 : 0;
        lines.sort(cmp);
        if (flags.r) lines.reverse();
        if (flags.u) {
          const seen = new Set();
          lines = lines.filter(l => { if (seen.has(l)) return false; seen.add(l); return true; });
        }
        return ok(lines.join("\n") + (lines.length ? "\n" : ""));
      }
    },

    uniq: {
      description: "連続した重複行を扱う (sort と組み合わせる)",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["c", "d", "u", "i"] });
        let text = positional.length ? (ctx.vfs.readFile(positional[0]).content || "") : (ctx.stdin || "");
        const lines = splitLines(text);
        const out = [];
        let i = 0;
        while (i < lines.length) {
          let j = i + 1;
          while (j < lines.length && (flags.i ? lines[j].toLowerCase() === lines[i].toLowerCase() : lines[j] === lines[i])) j++;
          const count = j - i;
          if (flags.d && count < 2) { i = j; continue; }
          if (flags.u && count > 1) { i = j; continue; }
          out.push((flags.c ? String(count).padStart(7) + " " : "") + lines[i]);
          i = j;
        }
        return ok(out.join("\n") + (out.length ? "\n" : ""));
      }
    },

    cut: {
      description: "各行の特定列を切り出す",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { string: ["d", "f", "c"] });
        const delim = flags.d != null ? flags.d : "\t";
        let text = positional.length ? (ctx.vfs.readFile(positional[0]).content || "") : (ctx.stdin || "");
        const lines = splitLines(text);
        function fieldsOf(spec) {
          if (!spec) return [];
          const result = [];
          spec.split(",").forEach(part => {
            if (part.indexOf("-") >= 0) {
              const [a, b] = part.split("-");
              const lo = parseInt(a, 10) || 1;
              const hi = parseInt(b, 10) || 999;
              for (let i = lo; i <= hi; i++) result.push(i);
            } else {
              result.push(parseInt(part, 10));
            }
          });
          return result;
        }
        const fset = fieldsOf(flags.f);
        const cset = fieldsOf(flags.c);
        const out = lines.map(line => {
          if (flags.c) {
            return cset.map(i => line.slice(i - 1, i)).join("");
          }
          if (flags.f) {
            const parts = line.split(delim);
            return fset.map(i => parts[i - 1] || "").join(delim);
          }
          return line;
        });
        return ok(out.join("\n") + (out.length ? "\n" : ""));
      }
    },

    tr: {
      description: "文字単位の置換 / 削除",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["d", "s", "c"] });
        const a = positional[0] || "";
        const b = positional[1] || "";
        function expand(set) {
          // a-z などの範囲を展開
          const out = [];
          for (let i = 0; i < set.length; i++) {
            if (i + 2 < set.length && set[i + 1] === "-") {
              const lo = set.charCodeAt(i);
              const hi = set.charCodeAt(i + 2);
              for (let c = lo; c <= hi; c++) out.push(String.fromCharCode(c));
              i += 2;
            } else {
              out.push(set[i]);
            }
          }
          return out;
        }
        const setA = expand(a);
        const setB = expand(b);
        let text = ctx.stdin || "";
        let out = "";
        for (const ch of text) {
          if (flags.d) {
            if (setA.indexOf(ch) >= 0) continue;
            out += ch;
          } else {
            const idx = setA.indexOf(ch);
            if (idx >= 0) out += setB[Math.min(idx, setB.length - 1)] || "";
            else out += ch;
          }
        }
        if (flags.s) {
          out = out.replace(/(.)\1+/g, "$1");
        }
        return ok(out);
      }
    },

    rev: {
      description: "各行を逆順にする",
      run(ctx) {
        let text;
        if (ctx.args.length) {
          const r = ctx.vfs.readFile(ctx.args[0]);
          if (r.error) return err("rev: " + ctx.args[0] + ": " + r.error);
          text = r.content;
        } else text = ctx.stdin || "";
        const out = splitLines(text).map(l => l.split("").reverse().join("")).join("\n");
        return ok(out + (out ? "\n" : ""));
      }
    },

    base64: {
      description: "Base64 エンコード / デコード",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["d"] });
        let text;
        if (positional.length) {
          const r = ctx.vfs.readFile(positional[0]);
          if (r.error) return err("base64: " + positional[0] + ": " + r.error);
          text = r.content;
        } else text = ctx.stdin || "";
        try {
          if (flags.d) {
            const raw = atob(text.replace(/\s+/g, ""));
            return ok(raw);
          }
          const enc = btoa(unescape(encodeURIComponent(text)));
          // 76 桁で改行 (GNU 既定)
          const wrapped = enc.match(/.{1,76}/g).join("\n");
          return ok(wrapped + "\n");
        } catch (e) {
          return err("base64: " + e.message);
        }
      }
    },

    xxd: {
      description: "ファイルを16進ダンプ表示",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["r"] });
        let text;
        if (positional.length) {
          const r = ctx.vfs.readFile(positional[0]);
          if (r.error) return err("xxd: " + positional[0] + ": " + r.error);
          text = r.content;
        } else text = ctx.stdin || "";

        if (flags.r) {
          // 復元: 16進 → 文字列
          // 1) 各行の先頭の "00000000: " のようなオフセットを除去
          // 2) hex 列とその右の ASCII 表示の間は空白2つ以上で区切られているので、
          //    \s{2,} 以降を行末まで除去 (hex 内の単一空白を保持)
          // 3) 残った hex 列の空白を全削除
          const hex = text.replace(/^[0-9a-fA-F]+:\s*/gm, "").replace(/\s{2,}.*$/gm, "").replace(/\s/g, "");
          let out = "";
          for (let i = 0; i + 1 < hex.length; i += 2) {
            out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
          }
          return ok(out);
        }

        // 実 xxd と同じく 2バイト1グループ・グループ間は単一スペース
        // (中央に余分な空白を入れないことで xxd -r の \s{2,}.*$ が
        // 一意に hex/ascii 境界に当たる)
        let out = "";
        for (let i = 0; i < text.length; i += 16) {
          const chunk = text.slice(i, i + 16);
          const groups = [];
          for (let j = 0; j < chunk.length; j += 2) {
            let g = (chunk.charCodeAt(j) & 0xff).toString(16).padStart(2, "0");
            if (j + 1 < chunk.length) {
              g += (chunk.charCodeAt(j + 1) & 0xff).toString(16).padStart(2, "0");
            }
            groups.push(g);
          }
          const hexLine = groups.join(" ");
          const ascii = chunk.split("").map(c => {
            const code = c.charCodeAt(0);
            return code >= 32 && code < 127 ? c : ".";
          }).join("");
          out += i.toString(16).padStart(8, "0") + ": " + hexLine + "  " + ascii + "\n";
        }
        return ok(out);
      }
    },

    strings: {
      description: "バイナリから印字可能な文字列を抜き出す",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { string: ["n"] });
        const min = parseInt(flags.n != null ? flags.n : "4", 10) || 4;
        let text;
        if (positional.length) {
          const r = ctx.vfs.readFile(positional[0]);
          if (r.error) return err("strings: " + positional[0] + ": " + r.error);
          text = r.content;
        } else text = ctx.stdin || "";
        const re = new RegExp("[\\x20-\\x7e]{" + min + ",}", "g");
        const matches = text.match(re) || [];
        return ok(matches.join("\n") + (matches.length ? "\n" : ""));
      }
    },

    diff: {
      description: "2つのファイルの差分を表示",
      run(ctx) {
        if (ctx.args.length < 2) return err("diff: 2つのファイルが必要です");
        const a = ctx.vfs.readFile(ctx.args[0]);
        const b = ctx.vfs.readFile(ctx.args[1]);
        if (a.error) return err("diff: " + ctx.args[0] + ": " + a.error);
        if (b.error) return err("diff: " + ctx.args[1] + ": " + b.error);
        const al = splitLines(a.content);
        const bl = splitLines(b.content);
        // 簡易差分: ハッシュベース行マッチで <> を出すだけ
        const out = [];
        let i = 0, j = 0;
        while (i < al.length || j < bl.length) {
          if (al[i] === bl[j]) { i++; j++; continue; }
          if (i < al.length && bl.indexOf(al[i], j) === -1) { out.push("< " + al[i++]); continue; }
          if (j < bl.length && al.indexOf(bl[j], i) === -1) { out.push("> " + bl[j++]); continue; }
          if (i < al.length) out.push("< " + al[i++]);
          if (j < bl.length) out.push("> " + bl[j++]);
        }
        return { stdout: out.join("\n") + (out.length ? "\n" : ""), stderr: "", exitCode: out.length ? 1 : 0 };
      }
    },

    history: {
      description: "コマンド履歴を表示",
      run(ctx) {
        const out = ctx.shell.history.map((h, i) => String(i + 1).padStart(5) + "  " + h).join("\n");
        return ok(out + (out ? "\n" : ""));
      }
    },

    env: {
      description: "環境変数を表示",
      run(ctx) {
        const lines = Object.keys(ctx.env).sort().map(k => k + "=" + ctx.env[k]);
        return ok(lines.join("\n") + (lines.length ? "\n" : ""));
      }
    },

    printenv: {
      description: "環境変数を表示",
      run(ctx) {
        if (ctx.args.length === 0) {
          const lines = Object.keys(ctx.env).sort().map(k => k + "=" + ctx.env[k]);
          return ok(lines.join("\n") + (lines.length ? "\n" : ""));
        }
        return ok(ctx.args.map(k => ctx.env[k] || "").join("\n") + "\n");
      }
    },

    date: {
      description: "現在日時を表示",
      run() {
        const d = new Date();
        return ok(d.toString() + "\n");
      }
    },

    sleep: {
      description: "指定秒数だけ待機する",
      async run(ctx) {
        const sec = parseFloat(ctx.args[0] || "0");
        if (!isFinite(sec) || sec < 0) return err("sleep: 不正な秒数");
        await new Promise(res => setTimeout(res, Math.min(sec * 1000, 5000))); // 最大5秒に制限
        return ok();
      }
    },

    "true": { description: "成功 (0) を返す", run() { return ok(); } },
    "false": { description: "失敗 (1) を返す", run() { return { stdout: "", stderr: "", exitCode: 1 }; } },

    man: {
      description: "コマンドの説明を表示 (チートシートへの誘導)",
      run(ctx) {
        const name = ctx.args[0];
        if (!name) return err("man: コマンド名が必要です");
        const cmd = ctx.shell.commands[name];
        if (cmd) {
          return ok(`NAME\n    ${name} — ${cmd.description}\n\nこのシェルでは簡易マニュアルのみ提供しています。\n詳しくは右上のチートシートをご覧ください: cheatsheet.html\n`);
        }
        return err("man: " + name + ": マニュアルがありません");
      }
    },

    // 教育用: 制限のあるコマンドを優しくガイドする
    ssh: {
      description: "(模擬) 別ホストへ ssh 接続を試みる",
      run(ctx) {
        const target = ctx.args.find(a => !a.startsWith("-"));
        if (!target) return err("ssh: 接続先を指定してください (例: ssh user@localhost)");
        // この仮想環境では実 ssh は動かない。レベル進行のためのフックは別途 level.js が拾う
        return {
          stdout: "",
          stderr: `ssh: この仮想ターミナルでは ssh の接続は擬似的に処理されます。\n対象: ${target}\nこのレベル内のパスワード入力欄から進めてください。\n`,
          exitCode: 1,
          sshIntent: { target }
        };
      }
    },

    nc: {
      description: "(模擬) ネットワーク接続",
      run(ctx) {
        return err("nc: この仮想ターミナルではネットワーク機能は擬似的に再現されます。\n各レベルの説明に従って操作してください。");
      }
    }
  };

  // 公開
  window.SHELL_COMMANDS = COMMANDS;

  // ---------- 補助 ----------
  function humanSize(n) {
    if (n < 1024) return n + "";
    const units = ["K", "M", "G", "T"];
    let v = n / 1024, u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
    return v.toFixed(v >= 10 ? 0 : 1) + units[u];
  }
})();
