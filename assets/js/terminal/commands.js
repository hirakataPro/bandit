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

  // ---------- 圧縮 / アーカイブのマジック ----------
  // 実コマンドのマジックバイトに合わせ、`file` が正しく判別できるようにする。
  // 圧縮は擬似 (実圧縮はせずヘッダだけ被せる) だが、ヘキサダンプ・ワークフローが
  // 本物の感覚で進められればよい。
  const GZIP_MAGIC  = "\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\x03"; // 10B header
  const BZIP2_MAGIC = "BZh91AY&SY";                                // 10B
  const XZ_MAGIC    = "\xfd7zXZ\x00\x00";                          // 7B

  // マジック検出は「マジック以降にも 1 バイト以上の本体がある」最小長を要求する。
  // これがないと "\x1f\x8b" だけの 2 バイトファイルが isGzip=true になり、
  // gunzip が無声に空文字を返してしまう (本物の gzip は header だけのものは無効データ扱い)。
  function isGzip(s)  { return s.length >  GZIP_MAGIC.length  && s.charCodeAt(0) === 0x1f && s.charCodeAt(1) === 0x8b; }
  function isBzip2(s) { return s.length >  BZIP2_MAGIC.length && /^BZh[1-9]/.test(s); }
  // 実 xz のマジックは 6 バイト: FD 37 7A 58 5A 00
  function isXz(s)    { return s.length >  XZ_MAGIC.length    && s.slice(0, 6) === "\xfd7zXZ\x00"; }
  function isTar(s)   { return s.length >= 263                && s.slice(257, 262) === "ustar"; }

  function gzipWrap(content)   { return GZIP_MAGIC + content; }
  function bzip2Wrap(content)  { return BZIP2_MAGIC + content; }
  function xzWrap(content)     { return XZ_MAGIC + content; }
  function gzipUnwrap(content) { return isGzip(content)  ? content.slice(GZIP_MAGIC.length)  : null; }
  function bzip2Unwrap(content){ return isBzip2(content) ? content.slice(BZIP2_MAGIC.length) : null; }
  function xzUnwrap(content)   { return isXz(content)    ? content.slice(XZ_MAGIC.length)    : null; }

  // tar: ustar 形式 (512バイト固定ヘッダ + 512アラインのコンテンツ + 末尾に2x512 0ブロック)
  function tarHeader(name, mode, size) {
    const buf = new Array(512).fill("\x00");
    const setStr = (off, max, s) => {
      for (let i = 0; i < Math.min(s.length, max); i++) buf[off + i] = s[i];
    };
    setStr(0, 100, name);
    setStr(100, 8, mode.toString(8).padStart(7, "0") + "\x00");
    setStr(108, 8, "0000000\x00");                    // uid
    setStr(116, 8, "0000000\x00");                    // gid
    setStr(124, 12, size.toString(8).padStart(11, "0") + "\x00");
    setStr(136, 12, "00000000000\x00");               // mtime
    for (let i = 0; i < 8; i++) buf[148 + i] = " ";   // checksum 領域は計算前は空白
    buf[156] = "0";                                   // typeflag = regular file
    setStr(257, 6, "ustar\x00");
    setStr(263, 2, "00");
    setStr(265, 32, "root\x00");                      // uname
    setStr(297, 32, "root\x00");                      // gname
    // checksum (空白を含めた合計)
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += buf[i].charCodeAt(0);
    const ckStr = sum.toString(8).padStart(6, "0") + "\x00 ";
    for (let i = 0; i < 8; i++) buf[148 + i] = ckStr[i];
    return buf.join("");
  }
  function tarPad(s) {
    const rem = s.length % 512;
    return rem === 0 ? s : s + "\x00".repeat(512 - rem);
  }
  function tarPack(files) {
    let out = "";
    for (const f of files) {
      out += tarHeader(f.name, f.mode == null ? 0o644 : f.mode, (f.content || "").length);
      out += tarPad(f.content || "");
    }
    out += "\x00".repeat(1024);
    return out;
  }
  function tarUnpack(data) {
    const files = [];
    let pos = 0;
    while (pos + 512 <= data.length) {
      const hdr = data.slice(pos, pos + 512);
      // 全 0 ブロックは EOF マーカー
      let allZero = true;
      for (let i = 0; i < 512; i++) if (hdr.charCodeAt(i) !== 0) { allZero = false; break; }
      if (allZero) break;
      if (hdr.slice(257, 262) !== "ustar") break;
      let nameEnd = 0;
      while (nameEnd < 100 && hdr.charCodeAt(nameEnd) !== 0) nameEnd++;
      const name = hdr.slice(0, nameEnd);
      const modeStr = hdr.slice(100, 107).replace(/[\x00 ].*$/, "").trim();
      const mode = parseInt(modeStr, 8) || 0o644;
      const sizeStr = hdr.slice(124, 135).replace(/[\x00 ].*$/, "").trim();
      const size = parseInt(sizeStr, 8) || 0;
      const typeflag = hdr[156] || "0";
      const content = data.slice(pos + 512, pos + 512 + size);
      files.push({ name, mode, content, typeflag });
      const blocks = Math.ceil(size / 512);
      pos += 512 + blocks * 512;
    }
    return files;
  }


  // ---------- MD5 (純 JS 実装) ----------
  // WebCrypto には MD5 がない (SHA-1/256/384/512 のみ) ため、教育用に小さく実装する。
  // RFC 1321 のリファレンス実装に準じる。
  function md5(str) {
    // 文字列を UTF-8 バイト列に
    const u8 = unescape(encodeURIComponent(str));
    const bytes = new Array(u8.length);
    for (let i = 0; i < u8.length; i++) bytes[i] = u8.charCodeAt(i) & 0xff;
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    // 64-bit little-endian length (上位 32bit は 0 で十分)
    for (let i = 0; i < 4; i++) bytes.push((bitLen >>> (i * 8)) & 0xff);
    for (let i = 0; i < 4; i++) bytes.push(0);

    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
    const T = [
      0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
      0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
      0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
      0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
      0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
      0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
      0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
      0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391
    ];
    const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
               5, 9,14,20,5, 9,14,20,5, 9,14,20,5, 9,14,20,
               4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
               6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    function rotl(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }

    for (let off = 0; off < bytes.length; off += 64) {
      const M = new Array(16);
      for (let j = 0; j < 16; j++) {
        M[j] = (bytes[off + j*4]) |
               (bytes[off + j*4 + 1] << 8) |
               (bytes[off + j*4 + 2] << 16) |
               (bytes[off + j*4 + 3] << 24);
        M[j] = M[j] >>> 0;
      }
      let A = a, B = b, C = c, D = d;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16)      { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D;          g = (3 * i + 5) % 16; }
        else             { F = C ^ (B | ~D);       g = (7 * i) % 16; }
        F = (F + A + T[i] + M[g]) >>> 0;
        A = D;
        D = C;
        C = B;
        B = (B + rotl(F, S[i])) >>> 0;
      }
      a = (a + A) >>> 0;
      b = (b + B) >>> 0;
      c = (c + C) >>> 0;
      d = (d + D) >>> 0;
    }
    function toHex(n) {
      let h = "";
      for (let i = 0; i < 4; i++) {
        h += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
      }
      return h;
    }
    return toHex(a) + toHex(b) + toHex(c) + toHex(d);
  }

  // SHA-256 は WebCrypto を使う (非同期)
  async function sha256(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const arr = new Uint8Array(buf);
    let h = "";
    for (let i = 0; i < arr.length; i++) h += arr[i].toString(16).padStart(2, "0");
    return h;
  }

  // ---------- Git 擬似化のヘルパ ----------
  // 仮想リポジトリ状態は vfs._gitStates: Map<repoRootPath, state> に保持。
  // 各 state = { remoteUrl, head, branches, tags, commits, staged, origin }
  // commits[hash] = { parent, author, date, message, tree:{path:content} }

  // cwd から親へ遡り、.git ディレクトリを持つ最寄りディレクトリを探す
  function gitFindRepoRoot(vfs, cwdOverride) {
    let p = cwdOverride || vfs.cwd;
    const seen = new Set();
    while (p && !seen.has(p)) {
      seen.add(p);
      if (vfs._gitStates && vfs._gitStates.has(p)) {
        return { repoRoot: p, state: vfs._gitStates.get(p) };
      }
      if (p === "/") break;
      p = p.replace(/\/[^/]*\/?$/, "") || "/";
    }
    return null;
  }

  // URL からリポジトリ名を抽出 (例: ssh://x@y/path/repo[.git] → "repo")
  function gitParseRepoName(url) {
    const m = String(url).match(/\/([^/]+?)(?:\.git)?\/?$/);
    return m ? m[1] : "repo";
  }

  // 40 桁の擬似ハッシュ (時刻 + 乱数で衝突回避)
  function gitMakeHash() {
    let h = "";
    for (let i = 0; i < 40; i++) h += Math.floor(Math.random() * 16).toString(16);
    return h;
  }

  // ref を解決: branch → tag → commit (完全一致 → prefix 一致)
  function gitResolveRef(state, ref) {
    if (!ref) return null;
    if (state.branches[ref])    return state.branches[ref];
    if (state.tags[ref])        return state.tags[ref];
    if (state.commits[ref])     return ref;
    const matches = Object.keys(state.commits).filter(h => h.startsWith(ref));
    if (matches.length === 1)   return matches[0];
    return null;
  }

  // state.head が指している現在のコミットハッシュ
  function gitHeadCommit(state) {
    if (!state.head) return null;
    if (state.head.startsWith("@")) return state.head.slice(1);   // detached
    return state.branches[state.head] || null;
  }

  // working tree の git 管理ファイルを削除する (.git/ は温存)
  function gitClearWorkingTree(vfs, repoRoot) {
    const r = vfs._walk(repoRoot);
    if (r.error || r.node.type !== "dir") return;
    for (const name of Object.keys(r.node.children)) {
      if (name === ".git") continue;
      delete r.node.children[name];
    }
  }

  // tree (path→content) を repoRoot に書き出す
  function gitMaterializeTree(vfs, repoRoot, tree) {
    gitClearWorkingTree(vfs, repoRoot);
    for (const path of Object.keys(tree)) {
      const abs = repoRoot + "/" + path;
      const parentPath = abs.replace(/\/[^/]*$/, "") || "/";
      vfs.mkdir(parentPath, { recursive: true });
      vfs.writeFile(abs, tree[path]);
    }
  }

  // working tree から path → content の map を作る (.git/ 除く)
  function gitSnapshotWorkingTree(vfs, repoRoot) {
    const out = {};
    const fr = vfs.find(repoRoot, n => n.type === "file");
    if (fr.error) return out;
    for (const f of fr.results) {
      if (f.path.startsWith(repoRoot + "/.git/") || f.path === repoRoot + "/.git") continue;
      const rel = f.path.startsWith(repoRoot + "/") ? f.path.slice(repoRoot.length + 1) : f.path;
      out[rel] = f.node.content;
    }
    return out;
  }

  // deep-copy: コミット履歴・ブランチ・タグを別個の object として複製
  function gitDeepCopySpec(remote) {
    return {
      defaultBranch: remote.defaultBranch || Object.keys(remote.branches || { master: 1 })[0] || "master",
      branches: Object.assign({}, remote.branches || {}),
      tags:     Object.assign({}, remote.tags     || {}),
      commits:  Object.keys(remote.commits || {}).reduce((acc, h) => {
        const c = remote.commits[h];
        acc[h] = {
          parent:  c.parent || null,
          author:  c.author || "shell-git <git@shell>",
          date:    c.date   || new Date().toUTCString(),
          message: c.message || "",
          tree:    Object.assign({}, c.tree || {})
        };
        return acc;
      }, {})
    };
  }

  // ---------- git サブコマンド実装 ----------

  async function gitClone(ctx, args) {
    let url = null, destDir = null;
    for (const a of args) {
      if (a.startsWith("-")) continue;
      if (!url) url = a;
      else if (!destDir) destDir = a;
    }
    if (!url) return err("fatal: You must specify a repository to clone.");

    const remote = ctx.vfs.gitRepos[url];
    if (!remote) return err("fatal: repository '" + url + "' does not exist (vfs.gitRepos に未登録)");

    const repoName = destDir || gitParseRepoName(url);
    const repoRoot = ctx.vfs.absolutize(repoName);

    if (ctx.vfs.exists(repoRoot)) {
      const r = ctx.vfs.stat(repoRoot);
      if (!r.error && r.node.type === "dir") {
        const ls = ctx.vfs.list(repoRoot);
        if (ls.entries && ls.entries.length > 0) {
          return err("fatal: destination path '" + repoName + "' already exists and is not an empty directory.");
        }
      } else {
        return err("fatal: destination path '" + repoName + "' already exists.");
      }
    }

    ctx.vfs.mkdir(repoRoot, { recursive: true });
    ctx.vfs.mkdir(repoRoot + "/.git", { recursive: true });

    // リモートの履歴を deep-copy
    const spec = gitDeepCopySpec(remote);
    const state = {
      remoteUrl: url,
      head: spec.defaultBranch,
      branches: spec.branches,
      tags:     spec.tags,
      commits:  spec.commits,
      staged:   {},
      origin:   "origin"
    };
    ctx.vfs._gitStates.set(repoRoot, state);

    // HEAD ブランチの tree を materialize
    const headHash = gitHeadCommit(state);
    if (headHash && state.commits[headHash]) {
      gitMaterializeTree(ctx.vfs, repoRoot, state.commits[headHash].tree);
    }

    // ダミー .git/HEAD
    ctx.vfs.writeFile(repoRoot + "/.git/HEAD", "ref: refs/heads/" + state.head + "\n");

    const objCount = Object.keys(state.commits).length;
    return {
      stdout: "",
      stderr:
        "Cloning into '" + repoName + "'...\n" +
        "remote: Enumerating objects: " + objCount + ", done.\n" +
        "remote: Counting objects: 100% (" + objCount + "/" + objCount + "), done.\n" +
        "Receiving objects: 100% (" + objCount + "/" + objCount + "), done.\n",
      exitCode: 0
    };
  }

  function gitLog(ctx, args, repo) {
    const { state } = repo;
    const oneline = args.includes("--oneline");
    let limit = Infinity;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-n" || args[i] === "--max-count") limit = parseInt(args[++i], 10) || Infinity;
      else if (/^-\d+$/.test(args[i])) limit = parseInt(args[i].slice(1), 10) || Infinity;
    }
    let c = gitHeadCommit(state);
    if (!c) return ok("fatal: your current branch does not have any commits yet\n");
    let count = 0;
    let out = "";
    while (c && count < limit) {
      const commit = state.commits[c];
      if (!commit) break;
      if (oneline) {
        out += c.slice(0, 7) + " " + commit.message.split("\n")[0] + "\n";
      } else {
        out += "\x1b[33mcommit " + c + "\x1b[0m\n";
        out += "Author: " + commit.author + "\n";
        out += "Date:   " + commit.date + "\n\n";
        out += "    " + commit.message.replace(/\n/g, "\n    ") + "\n\n";
      }
      c = commit.parent;
      count++;
    }
    return ok(out);
  }

  function gitFormatDiff(prevTree, curTree) {
    const all = new Set(Object.keys(prevTree || {}).concat(Object.keys(curTree || {})));
    let out = "";
    for (const f of [...all].sort()) {
      const a = (prevTree && prevTree[f]) || null;
      const b = (curTree  && curTree[f])  || null;
      if (a === b) continue;
      out += "diff --git a/" + f + " b/" + f + "\n";
      if (a === null)      out += "new file mode 100644\n--- /dev/null\n+++ b/" + f + "\n";
      else if (b === null) out += "deleted file mode 100644\n--- a/" + f + "\n+++ /dev/null\n";
      else                 out += "--- a/" + f + "\n+++ b/" + f + "\n";
      // 簡易: 全行を - / + で出す (ユニファイドハンク無し、教育用)
      if (a) for (const line of a.split("\n").slice(0, -1).concat(a.endsWith("\n") ? [] : [a.split("\n").pop()])) out += "-" + line + "\n";
      if (b) for (const line of b.split("\n").slice(0, -1).concat(b.endsWith("\n") ? [] : [b.split("\n").pop()])) out += "+" + line + "\n";
    }
    return out;
  }

  function gitShow(ctx, args, repo) {
    const { state } = repo;
    const ref = args.find(a => !a.startsWith("-")) || (state.head.startsWith("@") ? state.head.slice(1) : state.head);
    const c = gitResolveRef(state, ref);
    if (!c) return err("fatal: ambiguous argument '" + ref + "': unknown revision or path not in the working tree.");
    const commit = state.commits[c];
    let out = "\x1b[33mcommit " + c + "\x1b[0m\n";
    out += "Author: " + commit.author + "\n";
    out += "Date:   " + commit.date + "\n\n";
    out += "    " + commit.message.replace(/\n/g, "\n    ") + "\n\n";
    const parent = commit.parent ? state.commits[commit.parent] : null;
    out += gitFormatDiff(parent ? parent.tree : {}, commit.tree);
    return ok(out);
  }

  function gitBranch(ctx, args, repo) {
    const { state } = repo;
    const { flags, positional } = parseFlags(args, { boolean: ["a", "r", "v"], string: ["d", "D"] });
    if (flags.d || flags.D) {
      const name = flags.d || flags.D;
      if (!state.branches[name]) return err("error: branch '" + name + "' not found.");
      if (state.head === name) return err("error: Cannot delete branch '" + name + "' checked out at this repo");
      delete state.branches[name];
      return ok("Deleted branch " + name + "\n");
    }
    if (positional.length) {
      // 新規作成
      const name = positional[0];
      if (state.branches[name]) return err("fatal: A branch named '" + name + "' already exists.");
      state.branches[name] = gitHeadCommit(state);
      return ok();
    }
    let out = "";
    const headName = state.head.startsWith("@") ? null : state.head;
    for (const b of Object.keys(state.branches).sort()) {
      out += (b === headName ? "* \x1b[32m" + b + "\x1b[0m" : "  " + b) + "\n";
    }
    if (flags.a || flags.r) {
      // origin/<branch> 風の remote-tracking を fake で表示 (Lv29 想定)
      for (const b of Object.keys(state.branches).sort()) {
        out += "  \x1b[31mremotes/origin/" + b + "\x1b[0m\n";
      }
    }
    return ok(out);
  }

  function gitCheckout(ctx, args, repo) {
    const { state, repoRoot } = repo;
    const { flags, positional } = parseFlags(args, { boolean: ["b", "B", "f"] });
    if ((flags.b || flags.B) && positional.length) {
      const name = positional[0];
      state.branches[name] = gitHeadCommit(state);
      state.head = name;
      return ok("Switched to a new branch '" + name + "'\n");
    }
    const ref = positional[0];
    if (!ref) return err("error: ref を指定してください");
    if (state.branches[ref] != null) {
      state.head = ref;
      const c = state.branches[ref];
      if (state.commits[c]) gitMaterializeTree(ctx.vfs, repoRoot, state.commits[c].tree);
      return ok("Switched to branch '" + ref + "'\n");
    }
    const c = gitResolveRef(state, ref);
    if (c) {
      state.head = "@" + c;
      gitMaterializeTree(ctx.vfs, repoRoot, state.commits[c].tree);
      return ok(
        "Note: switching to '" + ref + "'.\n\n" +
        "You are in 'detached HEAD' state. \n" +
        "HEAD is now at " + c.slice(0, 7) + " " + state.commits[c].message.split("\n")[0] + "\n"
      );
    }
    return err("error: pathspec '" + ref + "' did not match any file(s) known to git");
  }

  function gitTag(ctx, args, repo) {
    const { state } = repo;
    const { flags, positional } = parseFlags(args, { boolean: ["l", "n", "d"] });
    if (flags.d && positional.length) {
      delete state.tags[positional[0]];
      return ok("Deleted tag '" + positional[0] + "'\n");
    }
    if (positional.length) {
      const name = positional[0];
      const target = positional[1] ? gitResolveRef(state, positional[1]) : gitHeadCommit(state);
      if (!target) return err("fatal: Failed to resolve '" + (positional[1] || "HEAD") + "' as a valid ref.");
      state.tags[name] = target;
      return ok();
    }
    return ok(Object.keys(state.tags).sort().join("\n") + (Object.keys(state.tags).length ? "\n" : ""));
  }

  function gitStatus(ctx, args, repo) {
    const { state, repoRoot } = repo;
    const headName = state.head.startsWith("@") ? "HEAD detached at " + state.head.slice(1, 8) : "On branch " + state.head;
    let out = headName + "\n";
    const headHash = gitHeadCommit(state);
    const headTree = headHash && state.commits[headHash] ? state.commits[headHash].tree : {};
    const working = gitSnapshotWorkingTree(ctx.vfs, repoRoot);
    const stagedKeys = Object.keys(state.staged);
    if (stagedKeys.length) {
      out += "\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n";
      for (const f of stagedKeys.sort()) {
        out += "\t" + (headTree[f] == null ? "new file:   " : "modified:   ") + f + "\n";
      }
    }
    const modified = [];
    const untracked = [];
    for (const f of Object.keys(working).sort()) {
      if (state.staged[f] != null) continue;
      if (headTree[f] == null) untracked.push(f);
      else if (working[f] !== headTree[f]) modified.push(f);
    }
    if (modified.length) {
      out += "\nChanges not staged for commit:\n";
      for (const f of modified) out += "\tmodified:   " + f + "\n";
    }
    if (untracked.length) {
      out += "\nUntracked files:\n  (use \"git add <file>...\" to include in what will be committed)\n";
      for (const f of untracked) out += "\t" + f + "\n";
    }
    if (!stagedKeys.length && !modified.length && !untracked.length) {
      out += "\nnothing to commit, working tree clean\n";
    }
    return ok(out);
  }

  function gitAdd(ctx, args, repo) {
    const { state, repoRoot } = repo;
    const { positional } = parseFlags(args, { boolean: ["A", "n", "v"] });
    if (!positional.length) return err("Nothing specified, nothing added.");
    for (const file of positional) {
      // "." の場合は repoRoot 配下を全て add
      if (file === ".") {
        const working = gitSnapshotWorkingTree(ctx.vfs, repoRoot);
        for (const f of Object.keys(working)) state.staged[f] = working[f];
        continue;
      }
      const abs = ctx.vfs.absolutize(file);
      const rel = abs.startsWith(repoRoot + "/") ? abs.slice(repoRoot.length + 1) : file;
      const r = ctx.vfs.readFile(abs);
      if (r.error) return err("fatal: pathspec '" + file + "' did not match any files");
      state.staged[rel] = r.content;
    }
    return ok();
  }

  function gitCommit(ctx, args, repo) {
    const { state } = repo;
    let msg = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-m" || args[i] === "--message") msg = args[++i];
      else if (args[i].startsWith("--message=")) msg = args[i].slice(10);
    }
    if (!msg) return err("error: -m '<msg>' を指定してください (この擬似 git はエディタ起動による commit はサポートしません)");
    const stagedKeys = Object.keys(state.staged);
    if (stagedKeys.length === 0) {
      return err("nothing to commit, working tree clean");
    }
    const parentHash = gitHeadCommit(state);
    const parentTree = parentHash && state.commits[parentHash] ? state.commits[parentHash].tree : {};
    const newTree = Object.assign({}, parentTree);
    for (const k of stagedKeys) newTree[k] = state.staged[k];
    const hash = gitMakeHash();
    state.commits[hash] = {
      parent:  parentHash,
      author:  (ctx.vfs.user || "user") + " <" + (ctx.vfs.user || "user") + "@" + (ctx.vfs.hostname || "shell") + ">",
      date:    new Date().toUTCString(),
      message: msg,
      tree:    newTree
    };
    if (state.head.startsWith("@")) {
      state.head = "@" + hash;   // detached のまま進める
    } else {
      state.branches[state.head] = hash;
    }
    state.staged = {};
    const changed = stagedKeys.length;
    return ok("[" + (state.head.startsWith("@") ? "detached HEAD" : state.head) + " " + hash.slice(0, 7) + "] " + msg + "\n" +
              " " + changed + " file" + (changed === 1 ? "" : "s") + " changed\n");
  }

  async function gitPush(ctx, args, repo) {
    const { state } = repo;
    const remote = state.remoteUrl ? ctx.vfs.gitRepos[state.remoteUrl] : null;
    let extraOut = "";
    if (remote) {
      // fast-forward 前提でブランチ/タグ/コミットを書き戻し
      remote.branches = remote.branches || {};
      remote.tags     = remote.tags     || {};
      remote.commits  = remote.commits  || {};
      Object.assign(remote.commits, state.commits);
      Object.assign(remote.branches, state.branches);
      Object.assign(remote.tags, state.tags);
      if (typeof remote.onPush === "function") {
        try {
          const res = await remote.onPush(state, ctx);
          if (typeof res === "string") {
            // 各行を "remote: " プレフィックスで出力
            extraOut = res.split("\n").map(l => l ? "remote: " + l : l).join("\n");
            if (!extraOut.endsWith("\n")) extraOut += "\n";
          }
        } catch (e) {
          return err("error: server-side push hook failed: " + (e && e.message ? e.message : String(e)));
        }
      }
    }
    return {
      stdout: "",
      stderr:
        (extraOut || "") +
        "To " + (state.remoteUrl || "<unknown>") + "\n" +
        "   <fast-forward>  " + (state.head.startsWith("@") ? "HEAD" : state.head) +
        " -> " + (state.head.startsWith("@") ? "HEAD" : state.head) + "\n",
      exitCode: 0
    };
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
            // マジックバイトの優先判定 (圧縮 / アーカイブ)
            if (c.length === 0) kind = "empty";
            else if (isGzip(c))  kind = "gzip compressed data";
            else if (isBzip2(c)) kind = "bzip2 compressed data";
            else if (isXz(c))    kind = "XZ compressed data";
            else if (isTar(c))   kind = "POSIX tar archive";
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

    chmod: {
      description: "ファイルのパーミッション (mode) を変更",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["R", "v"] });
        if (positional.length < 2) return err("chmod: 用法: chmod <mode> <file>...");
        const modeArg = positional[0];
        const targets = positional.slice(1);
        // 8 進数モード (例: 600, 4755) のみ実装。シンボリック (u+x 等) は未対応。
        if (!/^[0-7]+$/.test(modeArg)) {
          return err("chmod: " + modeArg + ": シンボリックモード (u+x 等) は未対応です。8 進数で指定してください。");
        }
        const newMode = parseInt(modeArg, 8);
        let out = "";
        function apply(path) {
          const r = ctx.vfs.lstat(path);
          if (r.error) { out += "chmod: " + path + ": " + r.error + "\n"; return; }
          // 所有者か root のみが mode 変更可
          if (ctx.vfs.user !== "root" && r.node.owner !== ctx.vfs.user) {
            out += "chmod: changing permissions of '" + path + "': Operation not permitted\n";
            return;
          }
          r.node.mode = newMode;
          if (flags.v) out += "mode of '" + path + "' changed to 0" + newMode.toString(8) + "\n";
          if (flags.R && r.node.type === "dir") {
            for (const name of Object.keys(r.node.children)) apply(path + "/" + name);
          }
        }
        for (const t of targets) apply(t);
        return out ? { stdout: out, stderr: "", exitCode: 0 } : ok();
      }
    },

    chown: {
      description: "ファイルの所有者 / グループを変更 (root 専用)",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["R", "v"] });
        if (positional.length < 2) return err("chown: 用法: chown <owner>[:<group>] <file>...");
        const spec = positional[0];
        const targets = positional.slice(1);
        let owner = spec, group = null;
        if (spec.includes(":")) { [owner, group] = spec.split(":"); }
        if (ctx.vfs.user !== "root") {
          return err("chown: changing ownership: Operation not permitted (root 専用)");
        }
        function apply(path) {
          const r = ctx.vfs.lstat(path);
          if (r.error) return;
          r.node.owner = owner;
          if (group) r.node.group = group;
          if (flags.R && r.node.type === "dir") {
            for (const name of Object.keys(r.node.children)) apply(path + "/" + name);
          }
        }
        for (const t of targets) apply(t);
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

    gzip: {
      description: "ファイルを gzip 圧縮 (.gz を作成)",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["d", "c", "k", "f", "q", "v"] });
        if (flags.d) {
          // gzip -d は gunzip と同じ。残りの flag を渡し直す。
          const newArgs = [];
          if (flags.c) newArgs.push("-c");
          if (flags.k) newArgs.push("-k");
          if (flags.f) newArgs.push("-f");
          if (flags.q) newArgs.push("-q");
          if (flags.v) newArgs.push("-v");
          for (const p of positional) newArgs.push(p);
          return ctx.shell.commands.gunzip.run(Object.assign({}, ctx, { args: newArgs }));
        }
        if (!positional.length) {
          const data = ctx.stdin || "";
          return ok(gzipWrap(data));
        }
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("gzip: " + p + ": " + r.error);
          const wrapped = gzipWrap(r.content);
          if (flags.c) { out += wrapped; continue; }
          const dst = p + ".gz";
          const w = ctx.vfs.writeFile(dst, wrapped);
          if (w.error) return err("gzip: " + dst + ": " + w.error);
          if (!flags.k) ctx.vfs.unlink(p);
        }
        return ok(out);
      }
    },

    gunzip: {
      description: "gzip 圧縮ファイルを展開",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["c", "k", "f", "q", "v", "t"] });
        if (!positional.length) {
          const data = ctx.stdin || "";
          if (!isGzip(data)) return err("gunzip: 入力は gzip 形式ではありません");
          return ok(gzipUnwrap(data));
        }
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("gunzip: " + p + ": " + r.error);
          if (!isGzip(r.content)) return err("gunzip: " + p + ": gzip 形式ではありません (file で確認してください)");
          const inner = gzipUnwrap(r.content);
          if (flags.c) { out += inner; continue; }
          // 拡張子 .gz を取り除く。ない場合はそのまま .out
          const dst = p.endsWith(".gz") ? p.slice(0, -3) : p + ".out";
          const w = ctx.vfs.writeFile(dst, inner);
          if (w.error) return err("gunzip: " + dst + ": " + w.error);
          if (!flags.k) ctx.vfs.unlink(p);
        }
        return ok(out);
      }
    },

    zcat: {
      description: "gzip ファイルを展開して標準出力へ",
      run(ctx) {
        const { positional } = parseFlags(ctx.args, {});
        if (!positional.length) {
          const data = ctx.stdin || "";
          if (!isGzip(data)) return err("zcat: 入力は gzip 形式ではありません");
          return ok(gzipUnwrap(data));
        }
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("zcat: " + p + ": " + r.error);
          if (!isGzip(r.content)) return err("zcat: " + p + ": gzip 形式ではありません");
          out += gzipUnwrap(r.content);
        }
        return ok(out);
      }
    },

    bzip2: {
      description: "ファイルを bzip2 圧縮 (.bz2 を作成)",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["d", "c", "k", "f", "q", "v"] });
        if (flags.d) {
          const newArgs = [];
          if (flags.c) newArgs.push("-c");
          if (flags.k) newArgs.push("-k");
          if (flags.f) newArgs.push("-f");
          if (flags.q) newArgs.push("-q");
          if (flags.v) newArgs.push("-v");
          for (const p of positional) newArgs.push(p);
          return ctx.shell.commands.bunzip2.run(Object.assign({}, ctx, { args: newArgs }));
        }
        if (!positional.length) {
          const data = ctx.stdin || "";
          return ok(bzip2Wrap(data));
        }
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("bzip2: " + p + ": " + r.error);
          const wrapped = bzip2Wrap(r.content);
          if (flags.c) { out += wrapped; continue; }
          const dst = p + ".bz2";
          const w = ctx.vfs.writeFile(dst, wrapped);
          if (w.error) return err("bzip2: " + dst + ": " + w.error);
          if (!flags.k) ctx.vfs.unlink(p);
        }
        return ok(out);
      }
    },

    bunzip2: {
      description: "bzip2 圧縮ファイルを展開",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["c", "k", "f", "q", "v"] });
        if (!positional.length) {
          const data = ctx.stdin || "";
          if (!isBzip2(data)) return err("bunzip2: 入力は bzip2 形式ではありません");
          return ok(bzip2Unwrap(data));
        }
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("bunzip2: " + p + ": " + r.error);
          if (!isBzip2(r.content)) return err("bunzip2: " + p + ": bzip2 形式ではありません (file で確認してください)");
          const inner = bzip2Unwrap(r.content);
          if (flags.c) { out += inner; continue; }
          const dst = p.endsWith(".bz2") ? p.slice(0, -4) : p + ".out";
          const w = ctx.vfs.writeFile(dst, inner);
          if (w.error) return err("bunzip2: " + dst + ": " + w.error);
          if (!flags.k) ctx.vfs.unlink(p);
        }
        return ok(out);
      }
    },

    bzcat: {
      description: "bzip2 ファイルを展開して標準出力へ",
      run(ctx) {
        const { positional } = parseFlags(ctx.args, {});
        if (!positional.length) {
          const data = ctx.stdin || "";
          if (!isBzip2(data)) return err("bzcat: 入力は bzip2 形式ではありません");
          return ok(bzip2Unwrap(data));
        }
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("bzcat: " + p + ": " + r.error);
          if (!isBzip2(r.content)) return err("bzcat: " + p + ": bzip2 形式ではありません");
          out += bzip2Unwrap(r.content);
        }
        return ok(out);
      }
    },

    xz: {
      description: "ファイルを xz 圧縮 (.xz を作成)",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["d", "c", "k", "f", "q", "v"] });
        if (flags.d) {
          const newArgs = [];
          if (flags.c) newArgs.push("-c");
          if (flags.k) newArgs.push("-k");
          if (flags.f) newArgs.push("-f");
          if (flags.q) newArgs.push("-q");
          if (flags.v) newArgs.push("-v");
          for (const p of positional) newArgs.push(p);
          return ctx.shell.commands.unxz.run(Object.assign({}, ctx, { args: newArgs }));
        }
        if (!positional.length) {
          const data = ctx.stdin || "";
          return ok(xzWrap(data));
        }
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("xz: " + p + ": " + r.error);
          const wrapped = xzWrap(r.content);
          if (flags.c) { out += wrapped; continue; }
          const dst = p + ".xz";
          const w = ctx.vfs.writeFile(dst, wrapped);
          if (w.error) return err("xz: " + dst + ": " + w.error);
          if (!flags.k) ctx.vfs.unlink(p);
        }
        return ok(out);
      }
    },

    unxz: {
      description: "xz 圧縮ファイルを展開",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["c", "k", "f", "q", "v"] });
        if (!positional.length) {
          const data = ctx.stdin || "";
          if (!isXz(data)) return err("unxz: 入力は xz 形式ではありません");
          return ok(xzUnwrap(data));
        }
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("unxz: " + p + ": " + r.error);
          if (!isXz(r.content)) return err("unxz: " + p + ": xz 形式ではありません (file で確認してください)");
          const inner = xzUnwrap(r.content);
          if (flags.c) { out += inner; continue; }
          const dst = p.endsWith(".xz") ? p.slice(0, -3) : p + ".out";
          const w = ctx.vfs.writeFile(dst, inner);
          if (w.error) return err("unxz: " + dst + ": " + w.error);
          if (!flags.k) ctx.vfs.unlink(p);
        }
        return ok(out);
      }
    },

    xzcat: {
      description: "xz ファイルを展開して標準出力へ",
      run(ctx) {
        const { positional } = parseFlags(ctx.args, {});
        if (!positional.length) {
          const data = ctx.stdin || "";
          if (!isXz(data)) return err("xzcat: 入力は xz 形式ではありません");
          return ok(xzUnwrap(data));
        }
        let out = "";
        for (const p of positional) {
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("xzcat: " + p + ": " + r.error);
          if (!isXz(r.content)) return err("xzcat: " + p + ": xz 形式ではありません");
          out += xzUnwrap(r.content);
        }
        return ok(out);
      }
    },

    tar: {
      description: "tar アーカイブの作成・展開・一覧",
      // 主要モード: -cf (create), -xf (extract), -tf (list)
      //   z (gzip), j (bzip2), J (xz) を組み合わせて -czf / -xzf 等
      // f の次の引数はアーカイブファイル名。-C で展開先ディレクトリ。
      run(ctx) {
        // tar は POSIX 流の合字オプション (-xvf)。先頭 1 引数を分解して扱う。
        const args = ctx.args.slice();
        let modeChar = null; // c / x / t
        let useZ = false, useJ = false, useJJ = false, hasF = false, verbose = false;
        let archiveFile = null;
        let chdir = null;
        let positional = [];
        let i = 0;
        // 最初の引数がオプションを束ねたもの (先頭にハイフンがなくてもOK)
        if (args.length && /^-?[cxtvfzjJC]+$/.test(args[0])) {
          const s = args[0].replace(/^-/, "");
          for (const ch of s) {
            if (ch === "c" || ch === "x" || ch === "t") modeChar = ch;
            else if (ch === "z") useZ = true;
            else if (ch === "j") useJ = true;
            else if (ch === "J") useJJ = true;
            else if (ch === "v") verbose = true;
            else if (ch === "f") hasF = true;
            else if (ch === "C") { /* 後で chdir 引数を取る */ chdir = "_PENDING_"; }
          }
          i = 1;
        }
        // 残り引数: -C <dir>, -f <file>, それ以外はポジショナル
        while (i < args.length) {
          const a = args[i];
          if (a === "-C") { chdir = args[++i]; i++; continue; }
          if (a === "-f") { archiveFile = args[++i]; i++; continue; }
          if (chdir === "_PENDING_") { chdir = a; i++; continue; }
          if (hasF && archiveFile == null) { archiveFile = a; i++; continue; }
          positional.push(a);
          i++;
        }
        if (!modeChar) return err("tar: -c / -x / -t のいずれかが必要です");
        if (!archiveFile) return err("tar: -f でアーカイブファイル名を指定してください");

        function maybeWrap(data) {
          if (useZ)  return gzipWrap(data);
          if (useJ)  return bzip2Wrap(data);
          if (useJJ) return xzWrap(data);
          return data;
        }
        function maybeUnwrap(data) {
          if (useZ) {
            if (!isGzip(data)) return { error: "gzip 形式ではありません" };
            return { data: gzipUnwrap(data) };
          }
          if (useJ) {
            if (!isBzip2(data)) return { error: "bzip2 形式ではありません" };
            return { data: bzip2Unwrap(data) };
          }
          if (useJJ) {
            if (!isXz(data)) return { error: "xz 形式ではありません" };
            return { data: xzUnwrap(data) };
          }
          return { data };
        }

        if (modeChar === "c") {
          if (!positional.length) return err("tar: アーカイブする対象を指定してください");
          // 各対象を 1 ファイルずつエントリ化 (ディレクトリ再帰は簡易対応)
          const entries = [];
          const baseDir = chdir ? ctx.vfs.absolutize(chdir) : ctx.vfs.cwd;
          function relTo(absPath) {
            // baseDir からの相対パス。なければそのまま basename。
            if (absPath.startsWith(baseDir + "/")) return absPath.slice(baseDir.length + 1);
            if (absPath === baseDir) return ".";
            return pathBase(absPath);
          }
          for (const target of positional) {
            // 入力は baseDir 起点で相対解釈する
            const abs = chdir
              ? (target.startsWith("/") ? target : baseDir + "/" + target)
              : ctx.vfs.absolutize(target);
            const st = ctx.vfs.stat(abs);
            if (st.error) return err("tar: " + target + ": " + st.error);
            if (st.node.type === "file") {
              entries.push({ name: relTo(abs), mode: st.node.mode, content: st.node.content });
            } else if (st.node.type === "dir") {
              const fr = ctx.vfs.find(abs, n => n.type === "file");
              if (fr.error) return err("tar: " + target + ": " + fr.error);
              for (const f of fr.results) {
                entries.push({ name: relTo(f.path), mode: f.node.mode, content: f.node.content });
              }
            }
          }
          const packed = maybeWrap(tarPack(entries));
          const w = ctx.vfs.writeFile(archiveFile, packed);
          if (w.error) return err("tar: " + archiveFile + ": " + w.error);
          return ok(verbose ? entries.map(e => e.name).join("\n") + "\n" : "");
        }

        // x / t: アーカイブを読む
        const r = ctx.vfs.readFile(archiveFile);
        if (r.error) return err("tar: " + archiveFile + ": " + r.error);
        const u = maybeUnwrap(r.content);
        if (u.error) return err("tar: " + archiveFile + ": " + u.error);
        if (!isTar(u.data)) return err("tar: " + archiveFile + ": tar アーカイブではありません");
        const files = tarUnpack(u.data);

        if (modeChar === "t") {
          return ok(files.map(f => f.name).join("\n") + (files.length ? "\n" : ""));
        }
        // x: 展開
        const outBase = chdir ? ctx.vfs.absolutize(chdir) : ctx.vfs.cwd;
        let log = "";
        for (const f of files) {
          const destPath = outBase + "/" + f.name;
          // 親ディレクトリを必要に応じて作る
          const segs = destPath.split("/");
          const parentPath = segs.slice(0, -1).join("/") || "/";
          ctx.vfs.mkdir(parentPath, { recursive: true });
          const w = ctx.vfs.writeFile(destPath, f.content);
          if (w.error) return err("tar: " + f.name + ": " + w.error);
          if (verbose) log += f.name + "\n";
        }
        return ok(log);
      }
    },

    less: {
      description: "ファイルをページャで表示 (! でシェル脱出, q で終了)",
      run(ctx) {
        const target = ctx.args.find(a => !a.startsWith("-"));
        if (!target) return err("less: ファイルを指定してください");
        const r = ctx.vfs.readFile(target);
        if (r.error) return err("less: " + target + ": " + r.error);
        const banner = r.content +
          "\n\x1b[1m" + target + "\x1b[0m (END)\n" +
          "less: q で終了 / !cmd でシェルを実行\n";

        ctx.shell._interactive = {
          name: "less",
          prompt: ":",
          handler: async (line, ctx2) => {
            const t = String(line).trim();
            // q / Q / :q / 空 (Enter のみ) で終了
            if (t === "" || t === "q" || t === "Q" || t === ":q") {
              return { output: "", exit: true };
            }
            // !cmd でシェル脱出 (現在のシェルコンテキストでサブコマンド実行)
            if (t.startsWith("!")) {
              const sub = t.slice(1).trim();
              if (!sub) return { output: "(less) シェルコマンドを ! の後に書いてください\n", exit: false };
              const saved = ctx2.shell._interactive;
              ctx2.shell._interactive = null;
              const res = await ctx2.shell.run(sub);
              // 子コマンドが対話モード (less/vim 等) を開始した場合は入れ子不可
              if (ctx2.shell._interactive) {
                ctx2.shell._interactive = saved;
                return { output: "(less) ! 内で対話コマンド (less/vim 等) は起動できません\n", exit: false };
              }
              ctx2.shell._interactive = saved;
              return { output: (res.output || "") + "(less に戻ります)\n", exit: false };
            }
            if (t === "h" || t === ":h" || t === "help") {
              return { output: "less: q 終了 / !cmd シェル実行\n", exit: false };
            }
            // 未知のキー: 何もしない
            return { output: "", exit: false };
          }
        };
        return { stdout: banner, stderr: "", exitCode: 0, interactive: true };
      }
    },

    more: {
      description: "ファイルをページャで表示 (less と同等の簡易版)",
      run(ctx) { return ctx.shell.commands.less.run(ctx); }
    },

    vim: {
      description: "(簡易) テキストエディタ。:!cmd / :shell でシェル脱出",
      run(ctx) {
        const target = ctx.args.find(a => !a.startsWith("-"));
        const filename = target || "(無題)";
        let content = "";
        if (target) {
          const r = ctx.vfs.readFile(target);
          if (r.error && r.error !== "ENOENT") return err("vim: " + target + ": " + r.error);
          content = (r.error || !r.content) ? "" : r.content;
        }
        const banner =
          (content ? content : "\n") +
          "\x1b[7m" + filename + "\x1b[0m  -- VIM (簡易モード) --\n" +
          "  :q              終了\n" +
          "  :!cmd           シェルコマンドを実行\n" +
          "  :shell / :sh    通常シェルに脱出 (vim を抜ける)\n" +
          "  :set shell=...  :shell で起動するシェルを変更\n";

        let shellOverride = null;

        ctx.shell._interactive = {
          name: "vim",
          prompt: ":",
          handler: async (line, ctx2) => {
            let t = String(line).trim();
            if (t === "") return { output: "", exit: false };
            // : を打たずに入力された場合も Ex コマンドとして解釈する (教育用)
            if (!t.startsWith(":")) t = ":" + t;
            if (t === ":q" || t === ":q!" || t === ":wq" || t === ":x" || t === ":exit") {
              return { output: "", exit: true };
            }
            if (t.startsWith(":!")) {
              const sub = t.slice(2).trim();
              if (!sub) return { output: "(vim) ! の後にコマンドを書いてください\n", exit: false };
              const saved = ctx2.shell._interactive;
              ctx2.shell._interactive = null;
              const res = await ctx2.shell.run(sub);
              if (ctx2.shell._interactive) {
                ctx2.shell._interactive = saved;
                return { output: "(vim) :! 内で対話コマンド (less/vim 等) は起動できません\n", exit: false };
              }
              ctx2.shell._interactive = saved;
              return { output: (res.output || "") + "(Press ENTER) (vim に戻ります)\n", exit: false };
            }
            if (t === ":shell" || t === ":sh") {
              // 通常シェルに脱出 (vim を抜ける)。shellOverride が設定されていれば
              // 表示メッセージで示す。
              const which = shellOverride || "/bin/bash";
              return {
                output: "vim: " + which + " に脱出します (vim を終了)\n",
                exit: true
              };
            }
            if (t.startsWith(":set shell=")) {
              shellOverride = t.slice(":set shell=".length).trim();
              return { output: "vim: shell = " + shellOverride + "\n", exit: false };
            }
            if (t === ":help" || t === ":h") {
              return { output: "vim: :q 終了  :!cmd  シェル実行  :shell  脱出  :set shell=...\n", exit: false };
            }
            return { output: "vim: 未知のコマンド: " + t + "\n", exit: false };
          }
        };
        return { stdout: banner, stderr: "", exitCode: 0, interactive: true };
      }
    },

    vi: {
      description: "(簡易) vim と同じ",
      run(ctx) { return ctx.shell.commands.vim.run(ctx); }
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

    // SSH 鍵認証 (擬似)。vfs.sshKeys["user@host"] = { authorizedKey, onAuth, remoteFs, autoExit }
    // 鍵が一致したら onAuth ハンドラの返り値を welcome メッセージと共に表示する。
    // リモートコマンドが指定された場合: remoteFs を使って一時 Shell を立て、そこで実行。
    ssh: {
      description: "SSH リモートログイン (擬似: 鍵認証のみ対応)",
      async run(ctx) {
        // ssh [-i keyfile] [-p port] [-o opt=val] user@host [remote command args...]
        let identityFile = null;
        let port = 22;
        let target = null;
        const remoteCmd = [];   // target 以降の引数 = リモートで実行するコマンド
        const args = ctx.args.slice();
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (target) { remoteCmd.push(a); continue; }            // target が決まった後は全てリモートコマンド
          if (a === "-i") { identityFile = args[++i]; continue; }
          if (a === "-p") { port = parseInt(args[++i], 10); continue; }
          if (a === "-o") { i++; continue; }                      // -o option=value は無視
          if (a === "-t" || a === "-T" || a === "-q" || a === "-v" || a === "-N") continue;
          if (a.startsWith("-i") && a.length > 2) { identityFile = a.slice(2); continue; }
          if (a.startsWith("-p") && a.length > 2) { port = parseInt(a.slice(2), 10); continue; }
          if (a.startsWith("-")) continue;                        // 未対応フラグは無視
          target = a;
        }
        if (!target) return err("ssh: user@host を指定してください (例: ssh -i key bandit14@localhost)");
        if (!target.includes("@")) return err("ssh: 形式は user@host です");

        const sshKeys = ctx.vfs.sshKeys || {};
        const config = sshKeys[target] || sshKeys[target + ":" + port];

        // 鍵を読む
        let providedKey = null;
        if (identityFile) {
          const r = ctx.vfs.readFile(identityFile);
          if (r.error) {
            return err("Warning: Identity file " + identityFile + " not accessible: " + r.error);
          }
          providedKey = r.content;
          // 実 ssh は秘密鍵のパーミッションが緩いと拒否する
          const st = ctx.vfs.lstat(identityFile);
          if (!st.error && (st.node.mode & 0o077) !== 0 && st.node.owner === ctx.vfs.user) {
            return err(
              "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n" +
              "@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @\n" +
              "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n" +
              "Permissions 0" + (st.node.mode & 0o777).toString(8) + " for '" + identityFile + "' are too open.\n" +
              "It is required that your private key files are NOT accessible by others.\n" +
              "This private key will be ignored.\n" +
              "Load key \"" + identityFile + "\": bad permissions\n" +
              target + ": Permission denied (publickey)."
            );
          }
        }

        if (!config) {
          return err("ssh: Could not resolve hostname or no key configured for " + target);
        }

        const authorized = (config.authorizedKey || "").trim();
        if (!providedKey || providedKey.trim() !== authorized) {
          if (!identityFile) {
            return err("ssh: " + target + ": Permission denied (publickey).\n(この環境ではパスワード認証は無効。-i で秘密鍵を指定してください)");
          }
          return err("ssh: " + target + ": Permission denied (publickey).");
        }

        // 認証成功

        // リモートコマンドが指定されていれば、相手側の VFS で実行する。
        // これにより .bashrc のような対話初期化スクリプトをバイパスできる (Lv18 想定)。
        if (remoteCmd.length > 0) {
          if (!config.remoteFs) {
            return err("ssh: " + target + ": 相手側のファイルシステム (remoteFs) が設定されていません");
          }
          const remoteVfs = new window.VFS(config.remoteFs);
          const remoteShell = new window.Shell({ vfs: remoteVfs });
          remoteShell.registerMany(window.SHELL_COMMANDS);
          // リモートコマンドを 1 行に組み立てて run() に渡す (クォートは保持できないので簡易)
          // 引数に空白を含む場合に備えて、空白を含むトークンはシングルクォートで括る
          const line = remoteCmd.map(t => /[\s'"$`\\]/.test(t) ? "'" + t.replace(/'/g, "'\\''") + "'" : t).join(" ");
          try {
            const r = await remoteShell.run(line);
            return ok(r.output || "");
          } catch (e) {
            return err("ssh: リモートコマンド実行エラー: " + (e && e.message ? e.message : String(e)));
          }
        }

        // 対話ログイン (リモートコマンドなし)。autoExit が true ならログイン直後に切断される。
        if (config.autoExit) {
          let exitBanner = "";
          if (typeof config.onAuth === "function") {
            try { exitBanner = await config.onAuth(ctx); }
            catch (e) { exitBanner = "(onAuth エラー: " + (e && e.message ? e.message : String(e)) + ")\n"; }
          }
          return ok(
            (exitBanner || "") +
            "Connection to " + target.split("@")[1] + " closed.\n"
          );
        }

        let body = "";
        if (typeof config.onAuth === "function") {
          try { body = await config.onAuth(ctx); }
          catch (e) { body = "(onAuth エラー: " + (e && e.message ? e.message : String(e)) + ")\n"; }
        }
        const welcome =
          "Linux training-server 5.15.0-shell #1 SMP x86_64\n" +
          "\n" +
          " * このセッションは Shell の擬似 ssh ログインです。\n" +
          " * 実シェルへの遷移は行わず、相手側でのコマンド結果を以下に表示します。\n" +
          "\n";
        return ok(welcome + (typeof body === "string" ? body : ""));
      }
    },

    nc: {
      description: "TCP / UDP の生接続。stdin を送って応答を受け取る",
      async run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["l", "z", "v", "n", "u", "k"], string: ["p", "w"] });
        // -l 待受モードは未実装 (将来 setuid 連携で必要)
        if (flags.l) return err("nc: -l (listen) はこの仮想環境では未実装です");
        // -z スキャン: 入出力なしで接続可否のみ
        if (flags.z) {
          if (positional.length < 2) return err("nc: -z にはホストとポートが必要です");
          const host = positional[0];
          const port = parseInt(positional[1], 10);
          const p = ctx.vfs.ports[port];
          if (!p) return err("nc: connect to " + host + " port " + port + " (tcp) failed: Connection refused");
          const verbose = flags.v;
          return ok(verbose ? "Connection to " + host + " " + port + " port [tcp/*] succeeded!\n" : "");
        }
        if (positional.length < 2) return err("nc: 用法: nc <host> <port>");
        const host = positional[0];
        const port = parseInt(positional[1], 10);
        if (!Number.isFinite(port)) return err("nc: 無効なポート: " + positional[1]);
        const p = ctx.vfs.ports[port];
        if (!p) {
          return err("nc: connect to " + host + " port " + port + " (tcp) failed: Connection refused");
        }
        // TLS ポートに生 nc で繋ぐと意味不明な応答 (TLS ServerHello バイナリ) になる
        if (p.tls) {
          // 教育目的でハンドラ出力を返しつつ、見た目はバイナリっぽい応答に
          // (現実の nc → TLS は ClientHello を待つので何も返ってこないが、
          //  学習者が「これは違う」と気付けるよう、明示的にエラー文も出す)
          return {
            stdout: "\x16\x03\x01\x00\x02\x02\x28",  // TLS Alert っぽい固定バイト
            stderr: "nc: 受け取った応答は TLS のように見えます。openssl s_client を試してみてください。\n",
            exitCode: 0
          };
        }
        const input = ctx.stdin || "";
        let res;
        try {
          res = await p.handler(input, { vfs: ctx.vfs, env: ctx.env });
        } catch (e) {
          return err("nc: サーバ処理中にエラー: " + (e && e.message ? e.message : String(e)));
        }
        return ok(typeof res === "string" ? res : "");
      }
    },

    openssl: {
      description: "openssl サブコマンド (s_client のみ実装)",
      async run(ctx) {
        const sub = ctx.args[0];
        if (sub !== "s_client") {
          return err("openssl: この仮想環境では s_client サブコマンドのみ実装されています");
        }
        // openssl は単一ハイフン + 長い名前 (-quiet, -connect 等) を取るので
        // parseFlags の "短いフラグを 1 文字ずつ分解" 流儀は使えない。手動パース。
        const rest = ctx.args.slice(1);
        const flags = {};
        const positional = [];
        const BOOL = new Set(["quiet", "ign_eof", "showcerts", "debug", "msg", "no_ign_eof"]);
        const STR  = new Set(["connect", "servername", "cert", "key", "CAfile", "verify"]);
        for (let i = 0; i < rest.length; i++) {
          const a = rest[i];
          if (a.startsWith("-") && a.length > 1) {
            const name = a.slice(1);
            if (BOOL.has(name)) { flags[name] = true; continue; }
            if (STR.has(name))  { flags[name] = rest[++i]; continue; }
            // 未知のフラグは無視 (実 openssl はエラーだがここでは寛容に)
            continue;
          }
          positional.push(a);
        }
        // -connect host:port
        const target = flags.connect || positional[0];
        if (!target || !target.includes(":")) {
          return err("openssl s_client: -connect <host>:<port> を指定してください");
        }
        const [host, portStr] = target.split(":");
        const port = parseInt(portStr, 10);
        const p = ctx.vfs.ports[port];
        const banner =
          "CONNECTED(00000003)\n" +
          "Certificate chain\n" +
          " 0 s:CN = " + host + "\n" +
          "   i:CN = Shell Training Local CA\n" +
          "---\n" +
          "Server certificate\n" +
          "-----BEGIN CERTIFICATE-----\n" +
          "MIIBszCCAVqgAwIBAgIUE+xQqLb0YjA1Z3RvbnNoZWxsX2NlcnQwCgYIKoZIzj0\n" +
          "(略 — テスト用ダミー)\n" +
          "-----END CERTIFICATE-----\n" +
          "---\n" +
          "SSL handshake has read 4096 bytes and written 312 bytes\n" +
          "---\n" +
          "New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384\n" +
          "Verify return code: 0 (ok)\n" +
          "---\n";

        if (!p) {
          return {
            stdout: flags.quiet ? "" : "",
            stderr: "openssl: " + host + ":" + port + ": Connection refused\n",
            exitCode: 1
          };
        }
        if (!p.tls) {
          // TLS でないポートに s_client するとハンドシェイクが失敗する
          return {
            stdout: flags.quiet ? "" : "CONNECTED(00000003)\n",
            stderr: "openssl: SSL handshake failure (相手は TLS を喋っていないようです)\n",
            exitCode: 1
          };
        }
        const input = ctx.stdin || "";
        let res;
        try {
          res = await p.handler(input, { vfs: ctx.vfs, env: ctx.env });
        } catch (e) {
          return err("openssl: サーバ処理中にエラー: " + (e && e.message ? e.message : String(e)));
        }
        const body = typeof res === "string" ? res : "";
        return ok((flags.quiet ? "" : banner) + body);
      }
    },

    nmap: {
      description: "ポートスキャン (仮想)",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["sV", "sS", "sT", "Pn", "v"], string: ["p"] });
        const host = positional[0] || "localhost";
        // -p の範囲指定 (1-65535 / 22 / 30000-32000 / 80,443)
        let portsToScan = [];
        if (flags.p) {
          for (const part of String(flags.p).split(",")) {
            if (part.includes("-")) {
              const [lo, hi] = part.split("-").map(s => parseInt(s, 10));
              for (let i = lo; i <= hi; i++) portsToScan.push(i);
            } else {
              portsToScan.push(parseInt(part, 10));
            }
          }
        } else {
          // デフォルトは vfs.ports に登録されているものだけスキャン (デモ用)
          portsToScan = Object.keys(ctx.vfs.ports).map(Number).sort((a, b) => a - b);
        }
        let out = "Starting Nmap (Shell virtual nmap) ( https://nmap.org )\n";
        out += "Nmap scan report for " + host + "\n";
        out += "Host is up.\n";
        const open = portsToScan.filter(n => ctx.vfs.ports[n]);
        if (open.length === 0) {
          out += "All scanned ports on " + host + " are: closed\n";
        } else {
          // 列の幅は実 nmap 風 (PORT は 9 文字, STATE は 5 文字)
          const head = flags.sV
            ? "PORT      STATE SERVICE  VERSION\n"
            : "PORT      STATE SERVICE\n";
          out += head;
          for (const port of open) {
            const p = ctx.vfs.ports[port];
            const portCol = (port + "/tcp").padEnd(10, " ");
            const stateCol = "open ";
            const svc = p.tls ? "ssl/unknown" : "unknown";
            const ver = flags.sV ? "  " + (p.banner || "") : "";
            out += portCol + stateCol + svc + ver + "\n";
          }
        }
        out += "Nmap done: 1 IP address (1 host up) scanned\n";
        return ok(out);
      }
    },

    // crontab: -l で現在のユーザーの cron 定義を表示する。
    // 実 cron デーモンは仮想化しないが、Lv21-23 ではこのコマンドと
    // /etc/cron.d/ 等の事前配置ファイルを読むことで「cron が何を動かしているか」を辿れる。
    crontab: {
      description: "現在のユーザーの cron 定義を一覧 (-l)",
      run(ctx) {
        const { flags, positional } = parseFlags(ctx.args, { boolean: ["l", "e", "r"], string: ["u"] });
        // -u user で別ユーザーの crontab を見る (実 cron では root のみ。教育用は寛容に)
        const user = flags.u || ctx.vfs.user;
        if (flags.r) {
          if (ctx.vfs.crontabs && ctx.vfs.crontabs[user]) delete ctx.vfs.crontabs[user];
          return ok();
        }
        if (flags.e) {
          return err("crontab: -e は対話編集モードです。代わりに `crontab <ファイル>` を使うか、vim で /var/spool/cron/crontabs/" + user + " を編集してください");
        }
        if (flags.l || (!positional.length && !flags.e && !flags.r)) {
          const entries = (ctx.vfs.crontabs && ctx.vfs.crontabs[user]) || "";
          if (!entries) return err("no crontab for " + user);
          return ok(entries.endsWith("\n") ? entries : entries + "\n");
        }
        // crontab <file>: ファイルから cron を登録
        const r = ctx.vfs.readFile(positional[0]);
        if (r.error) return err("crontab: " + positional[0] + ": " + r.error);
        ctx.vfs.crontabs[user] = r.content;
        return ok();
      }
    },

    md5sum: {
      description: "MD5 ハッシュを計算 (ファイル or 標準入力)",
      run(ctx) {
        const { positional } = parseFlags(ctx.args, {});
        if (!positional.length) {
          const text = ctx.stdin || "";
          return ok(md5(text) + "  -\n");
        }
        let out = "";
        for (const p of positional) {
          if (p === "-") {
            out += md5(ctx.stdin || "") + "  -\n";
            continue;
          }
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("md5sum: " + p + ": " + r.error);
          out += md5(r.content) + "  " + p + "\n";
        }
        return ok(out);
      }
    },

    sha256sum: {
      description: "SHA-256 ハッシュを計算",
      async run(ctx) {
        const { positional } = parseFlags(ctx.args, {});
        if (!positional.length) {
          return ok((await sha256(ctx.stdin || "")) + "  -\n");
        }
        let out = "";
        for (const p of positional) {
          if (p === "-") { out += (await sha256(ctx.stdin || "")) + "  -\n"; continue; }
          const r = ctx.vfs.readFile(p);
          if (r.error) return err("sha256sum: " + p + ": " + r.error);
          out += (await sha256(r.content)) + "  " + p + "\n";
        }
        return ok(out);
      }
    },

    git: {
      description: "git のサブコマンド (clone/log/show/branch/checkout/tag/add/commit/push/status)",
      async run(ctx) {
        const sub = ctx.args[0];
        const rest = ctx.args.slice(1);
        if (!sub || sub === "--help" || sub === "-h") {
          return ok(
            "usage: git <command> [<args>]\n\n" +
            "  clone     リポジトリをクローン\n" +
            "  log       コミット履歴を表示\n" +
            "  show      コミットの内容と差分を表示\n" +
            "  branch    ブランチ一覧 / 作成 / 削除\n" +
            "  checkout  ブランチ・タグ・コミットの切り替え\n" +
            "  tag       タグ一覧 / 作成\n" +
            "  status    作業ツリーの状態\n" +
            "  add       ステージング\n" +
            "  commit    コミット (-m <msg> 必須)\n" +
            "  push      リモートに送る\n"
          );
        }

        const KNOWN = ["clone","log","show","branch","checkout","tag","status","add","commit","push"];
        if (KNOWN.indexOf(sub) < 0) {
          return err("git: '" + sub + "' is not a git command. See 'git --help'.");
        }

        if (sub === "clone") return await gitClone(ctx, rest);

        const repo = gitFindRepoRoot(ctx.vfs);
        if (!repo) return err("fatal: not a git repository (or any of the parent directories): .git");

        switch (sub) {
          case "log":      return gitLog(ctx, rest, repo);
          case "show":     return gitShow(ctx, rest, repo);
          case "branch":   return gitBranch(ctx, rest, repo);
          case "checkout": return gitCheckout(ctx, rest, repo);
          case "tag":      return gitTag(ctx, rest, repo);
          case "status":   return gitStatus(ctx, rest, repo);
          case "add":      return gitAdd(ctx, rest, repo);
          case "commit":   return gitCommit(ctx, rest, repo);
          case "push":     return await gitPush(ctx, rest, repo);
        }
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
