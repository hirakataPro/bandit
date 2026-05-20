/* =========================================================
   vfs.js — 仮想ファイルシステム
   - ノード: dir | file | symlink
   - パス解決: 絶対 / 相対 / .. / . / ~
   - 宣言的 JSON から構築
   ========================================================= */

(function () {
  "use strict";

  // ---------- ヘルパ ----------
  function now() { return new Date(); }

  function splitPath(p) {
    // 連続スラッシュは1つにまとめる
    return String(p).replace(/\/+/g, "/").split("/").filter(s => s.length > 0);
  }

  function isAbs(p) { return typeof p === "string" && p.startsWith("/"); }

  function joinSegs(segs) { return "/" + segs.join("/"); }

  // パスを正規化 (.. と . を解決)
  function normalize(segs) {
    const out = [];
    for (const seg of segs) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") { if (out.length) out.pop(); continue; }
      out.push(seg);
    }
    return out;
  }

  // ---------- ノード構築 ----------
  function makeDir({ name = "", owner = "root", group = "root", mode = 0o755, mtime = now() } = {}) {
    return { type: "dir", name, owner, group, mode, mtime, children: Object.create(null) };
  }

  function makeFile({ name = "", owner = "root", group = "root", mode = 0o644, mtime = now(), content = "" } = {}) {
    return { type: "file", name, owner, group, mode, mtime, content };
  }

  function makeSymlink({ name = "", owner = "root", group = "root", mode = 0o777, mtime = now(), target } = {}) {
    return { type: "symlink", name, owner, group, mode, mtime, target };
  }

  // ---------- VFS クラス ----------
  function VFS(spec) {
    this.user = (spec && spec.user) || "guest";
    this.groups = (spec && spec.groups) || [this.user];
    this.home = (spec && spec.home) || ("/home/" + this.user);
    this.cwd = (spec && spec.cwd) || this.home;
    this.hostname = (spec && spec.hostname) || "shell";

    // 仮想ネットワーク: ポート番号 → { tls, handler(input)→output, banner? }
    // handler は async でも可。レベル定義から spec.ports で渡す。
    this.ports = Object.assign({}, (spec && spec.ports) || {});

    // SSH 認証情報: "user@host" → { authorizedKey, onAuth(ctx)→string }
    // ssh -i がこのキーを参照する。Lv13 等で使う。
    this.sshKeys = Object.assign({}, (spec && spec.sshKeys) || {});

    this.root = makeDir({ name: "", mode: 0o755 });

    // 必須ディレクトリ
    this._ensureDir("/etc");
    this._ensureDir("/tmp", { mode: 0o1777 });
    this._ensureDir("/var");
    this._ensureDir("/usr");
    this._ensureDir("/usr/bin");
    this._ensureDir("/home");

    // ユーザーホーム
    this._ensureDir(this.home, { owner: this.user, group: this.user });

    // 標準的な /etc/hostname
    this._writeFile("/etc/hostname", this.hostname + "\n", { owner: "root", group: "root", mode: 0o644 });
    this._writeFile("/etc/passwd",
      "root:x:0:0:root:/root:/bin/bash\n" +
      this.user + ":x:1000:1000::" + this.home + ":/bin/bash\n",
      { owner: "root", group: "root", mode: 0o644 });

    // ファイル定義の取り込み
    if (spec && spec.files) {
      for (const path of Object.keys(spec.files)) {
        const f = spec.files[path];
        if (f.type === "dir") {
          this._ensureDir(path, f);
        } else if (f.type === "symlink") {
          this._mkSymlink(path, f.target, f);
        } else {
          this._writeFile(path, f.content == null ? "" : f.content, f);
        }
      }
    }
  }

  VFS.prototype.absolutize = function (path) {
    if (path == null || path === "") return this.cwd;
    let s = String(path);
    if (s === "~") s = this.home;
    else if (s.startsWith("~/")) s = this.home + s.slice(1);
    if (!isAbs(s)) s = this.cwd + "/" + s;
    return joinSegs(normalize(splitPath(s)));
  };

  // 内部: パスをセグメントに分けて解決 (シンボリックリンクをたどる)
  VFS.prototype._walk = function (path, opts) {
    opts = opts || {};
    const followFinal = opts.followFinal !== false;
    const segs = normalize(splitPath(this.absolutize(path)));
    let node = this.root;
    let i = 0;
    let hops = 0;
    const HOP_MAX = 32;
    while (i < segs.length) {
      if (node.type !== "dir") {
        return { error: "ENOTDIR", path: joinSegs(segs.slice(0, i)) };
      }
      const seg = segs[i];
      const child = node.children[seg];
      if (!child) {
        return { error: "ENOENT", path: joinSegs(segs.slice(0, i + 1)), parent: node, last: seg, segs };
      }
      const isLast = i === segs.length - 1;
      if (child.type === "symlink" && (!isLast || followFinal)) {
        if (++hops > HOP_MAX) return { error: "ELOOP", path: joinSegs(segs) };
        const target = child.target;
        const resolved = isAbs(target) ? target : joinSegs(normalize(segs.slice(0, i).concat(splitPath(target))));
        const rest = segs.slice(i + 1);
        const newSegs = normalize(splitPath(resolved)).concat(rest);
        return this._walk(joinSegs(newSegs), opts);
      }
      node = child;
      i++;
    }
    return { node, segs, path: joinSegs(segs) };
  };

  // ---------- 書き込み系 (内部) ----------
  VFS.prototype._ensureDir = function (path, opts) {
    const segs = normalize(splitPath(this.absolutize(path)));
    let node = this.root;
    for (let i = 0; i < segs.length; i++) {
      const name = segs[i];
      if (!node.children[name]) {
        node.children[name] = makeDir(Object.assign({ name }, opts || {}));
      } else if (node.children[name].type !== "dir") {
        throw new Error("EEXIST: not a directory: " + joinSegs(segs.slice(0, i + 1)));
      }
      node = node.children[name];
    }
    if (opts) {
      // 親作成のときに付与するものと最終ディレクトリに付与するものを分ける必要があるが、簡易版
      if (opts.owner) node.owner = opts.owner;
      if (opts.group) node.group = opts.group;
      if (opts.mode != null) node.mode = typeof opts.mode === "string" ? parseInt(opts.mode, 8) : opts.mode;
    }
    return node;
  };

  VFS.prototype._writeFile = function (path, content, opts) {
    const abs = this.absolutize(path);
    const segs = normalize(splitPath(abs));
    if (!segs.length) throw new Error("EISDIR: /");
    const fileName = segs[segs.length - 1];
    const parentPath = joinSegs(segs.slice(0, -1));
    this._ensureDir(parentPath || "/");
    const r = this._walk(parentPath || "/");
    if (r.error) throw new Error(r.error + ": " + parentPath);
    r.node.children[fileName] = makeFile(Object.assign({ name: fileName, content }, opts || {}));
    if (opts && opts.mode != null) r.node.children[fileName].mode = typeof opts.mode === "string" ? parseInt(opts.mode, 8) : opts.mode;
    return r.node.children[fileName];
  };

  VFS.prototype._mkSymlink = function (path, target, opts) {
    const abs = this.absolutize(path);
    const segs = normalize(splitPath(abs));
    if (!segs.length) throw new Error("EINVAL: /");
    const name = segs[segs.length - 1];
    const parentPath = joinSegs(segs.slice(0, -1));
    this._ensureDir(parentPath || "/");
    const r = this._walk(parentPath || "/");
    if (r.error) throw new Error(r.error);
    r.node.children[name] = makeSymlink(Object.assign({ name, target }, opts || {}));
    return r.node.children[name];
  };

  // ---------- 公開 API ----------
  VFS.prototype.exists = function (path) {
    const r = this._walk(path);
    return !r.error;
  };

  VFS.prototype.stat = function (path) {
    const r = this._walk(path, { followFinal: true });
    if (r.error) return { error: r.error };
    return { node: r.node, path: r.path };
  };

  VFS.prototype.lstat = function (path) {
    const r = this._walk(path, { followFinal: false });
    if (r.error) return { error: r.error };
    return { node: r.node, path: r.path };
  };

  VFS.prototype.readFile = function (path) {
    const r = this._walk(path);
    if (r.error) return { error: r.error, path };
    if (r.node.type === "dir") return { error: "EISDIR", path };
    if (r.node.type !== "file") return { error: "EINVAL", path };
    if (!this.canRead(r.node)) return { error: "EACCES", path };
    return { content: r.node.content, node: r.node };
  };

  VFS.prototype.writeFile = function (path, content) {
    const abs = this.absolutize(path);
    const r = this._walk(abs);
    if (!r.error) {
      if (r.node.type === "dir") return { error: "EISDIR", path };
      if (!this.canWrite(r.node)) return { error: "EACCES", path };
      r.node.content = String(content);
      r.node.mtime = now();
      return { ok: true };
    }
    if (r.error === "ENOENT" && r.parent && this.canWrite(r.parent)) {
      r.parent.children[r.last] = makeFile({ name: r.last, owner: this.user, group: this.user, content: String(content) });
      return { ok: true, created: true };
    }
    return { error: r.error || "EACCES", path };
  };

  VFS.prototype.appendFile = function (path, content) {
    const r = this._walk(path);
    if (r.error === "ENOENT") return this.writeFile(path, content);
    if (r.error) return { error: r.error };
    if (r.node.type !== "file") return { error: "EISDIR", path };
    if (!this.canWrite(r.node)) return { error: "EACCES", path };
    r.node.content = (r.node.content || "") + String(content);
    r.node.mtime = now();
    return { ok: true };
  };

  VFS.prototype.list = function (path) {
    const target = path == null ? this.cwd : path;
    const r = this._walk(target);
    if (r.error) return { error: r.error, path: target };
    if (r.node.type !== "dir") {
      // ファイル指定の ls は単一エントリ
      const segs = splitPath(r.path);
      return { entries: [{ name: segs[segs.length - 1] || r.path, node: r.node }], path: r.path };
    }
    if (!this.canRead(r.node)) return { error: "EACCES", path: target };
    const entries = Object.keys(r.node.children).sort().map(name => ({
      name, node: r.node.children[name]
    }));
    return { entries, path: r.path };
  };

  VFS.prototype.mkdir = function (path, opts) {
    opts = opts || {};
    const abs = this.absolutize(path);
    const segs = normalize(splitPath(abs));
    if (!segs.length) return { error: "EEXIST", path: "/" };
    if (opts.recursive) {
      this._ensureDir(abs, { owner: this.user, group: this.user });
      return { ok: true };
    }
    const parentPath = joinSegs(segs.slice(0, -1));
    const last = segs[segs.length - 1];
    const r = this._walk(parentPath || "/");
    if (r.error) return { error: r.error, path: parentPath };
    if (r.node.type !== "dir") return { error: "ENOTDIR", path: parentPath };
    if (r.node.children[last]) return { error: "EEXIST", path: abs };
    if (!this.canWrite(r.node)) return { error: "EACCES", path: parentPath };
    r.node.children[last] = makeDir({ name: last, owner: this.user, group: this.user });
    return { ok: true };
  };

  VFS.prototype.rmdir = function (path) {
    const abs = this.absolutize(path);
    const segs = normalize(splitPath(abs));
    if (!segs.length) return { error: "EBUSY", path: "/" };
    const parentPath = joinSegs(segs.slice(0, -1));
    const last = segs[segs.length - 1];
    const r = this._walk(parentPath || "/");
    if (r.error) return { error: r.error, path: parentPath };
    const node = r.node.children[last];
    if (!node) return { error: "ENOENT", path: abs };
    if (node.type !== "dir") return { error: "ENOTDIR", path: abs };
    if (Object.keys(node.children).length > 0) return { error: "ENOTEMPTY", path: abs };
    if (!this.canWrite(r.node)) return { error: "EACCES", path: parentPath };
    delete r.node.children[last];
    return { ok: true };
  };

  VFS.prototype.unlink = function (path) {
    const abs = this.absolutize(path);
    const segs = normalize(splitPath(abs));
    if (!segs.length) return { error: "EISDIR", path: "/" };
    const parentPath = joinSegs(segs.slice(0, -1));
    const last = segs[segs.length - 1];
    const r = this._walk(parentPath || "/");
    if (r.error) return { error: r.error, path: parentPath };
    const node = r.node.children[last];
    if (!node) return { error: "ENOENT", path: abs };
    if (node.type === "dir") return { error: "EISDIR", path: abs };
    if (!this.canWrite(r.node)) return { error: "EACCES", path: parentPath };
    delete r.node.children[last];
    return { ok: true };
  };

  VFS.prototype.rmRecursive = function (path) {
    const abs = this.absolutize(path);
    if (abs === "/") return { error: "EBUSY", path: "/" };
    const r = this._walk(abs);
    if (r.error) return { error: r.error, path: abs };
    const segs = normalize(splitPath(abs));
    const parentPath = joinSegs(segs.slice(0, -1));
    const last = segs[segs.length - 1];
    const pr = this._walk(parentPath || "/");
    if (pr.error) return { error: pr.error };
    if (!this.canWrite(pr.node)) return { error: "EACCES", path: parentPath };
    delete pr.node.children[last];
    return { ok: true };
  };

  VFS.prototype.move = function (src, dst) {
    const sa = this.absolutize(src);
    const da = this.absolutize(dst);
    const sr = this._walk(sa, { followFinal: false });
    if (sr.error) return { error: sr.error, path: sa };
    const sSegs = normalize(splitPath(sa));
    const sParent = this._walk(joinSegs(sSegs.slice(0, -1)) || "/");
    if (sParent.error) return { error: sParent.error };
    const node = sr.node;

    // 移動先解決
    let dSegs = normalize(splitPath(da));
    let dParentPath = joinSegs(dSegs.slice(0, -1)) || "/";
    let newName = dSegs[dSegs.length - 1];
    const dr = this._walk(da);
    if (!dr.error && dr.node.type === "dir") {
      // dst がディレクトリなら、その中に同名で配置
      dParentPath = da;
      newName = sSegs[sSegs.length - 1];
    }
    const dParent = this._walk(dParentPath);
    if (dParent.error) return { error: dParent.error };
    if (!this.canWrite(dParent.node) || !this.canWrite(sParent.node)) return { error: "EACCES" };

    delete sParent.node.children[sSegs[sSegs.length - 1]];
    node.name = newName;
    dParent.node.children[newName] = node;
    return { ok: true };
  };

  VFS.prototype.copy = function (src, dst, recursive) {
    const sa = this.absolutize(src);
    const da = this.absolutize(dst);
    const sr = this._walk(sa);
    if (sr.error) return { error: sr.error, path: sa };
    if (sr.node.type === "dir" && !recursive) return { error: "EISDIR", path: sa };

    const dSegs = normalize(splitPath(da));
    let dParentPath = joinSegs(dSegs.slice(0, -1)) || "/";
    let newName = dSegs[dSegs.length - 1];
    const drExists = this._walk(da);
    if (!drExists.error && drExists.node.type === "dir") {
      dParentPath = da;
      newName = splitPath(sa).pop() || newName;
    }
    const dParent = this._walk(dParentPath);
    if (dParent.error) return { error: dParent.error };
    if (!this.canWrite(dParent.node)) return { error: "EACCES" };

    function clone(node, name) {
      if (node.type === "file") {
        return makeFile({ name, owner: node.owner, group: node.group, mode: node.mode, content: node.content });
      }
      if (node.type === "symlink") {
        return makeSymlink({ name, owner: node.owner, group: node.group, mode: node.mode, target: node.target });
      }
      const d = makeDir({ name, owner: node.owner, group: node.group, mode: node.mode });
      Object.keys(node.children).forEach(k => {
        d.children[k] = clone(node.children[k], k);
      });
      return d;
    }

    dParent.node.children[newName] = clone(sr.node, newName);
    return { ok: true };
  };

  // ---------- パーミッションチェック ----------
  VFS.prototype._classFor = function (node) {
    if (this.user === "root") return "root";
    if (node.owner === this.user) return "u";
    if (this.groups.includes(node.group)) return "g";
    return "o";
  };

  VFS.prototype.canRead = function (node) {
    if (!node) return false;
    const cls = this._classFor(node);
    if (cls === "root") return true;
    const m = node.mode;
    if (cls === "u") return Boolean(m & 0o400);
    if (cls === "g") return Boolean(m & 0o040);
    return Boolean(m & 0o004);
  };

  VFS.prototype.canWrite = function (node) {
    if (!node) return false;
    const cls = this._classFor(node);
    if (cls === "root") return true;
    const m = node.mode;
    if (cls === "u") return Boolean(m & 0o200);
    if (cls === "g") return Boolean(m & 0o020);
    return Boolean(m & 0o002);
  };

  VFS.prototype.canExecute = function (node) {
    if (!node) return false;
    const cls = this._classFor(node);
    if (cls === "root") return true;
    const m = node.mode;
    if (cls === "u") return Boolean(m & 0o100);
    if (cls === "g") return Boolean(m & 0o010);
    return Boolean(m & 0o001);
  };

  // ---------- ヘルパ ----------
  /**
   * パターン (* と ?) に合致するエントリを返す。
   * シンプルな glob: *.txt や file? など。
   */
  VFS.prototype.glob = function (pattern) {
    if (!/[*?\[]/.test(pattern)) {
      const r = this._walk(pattern);
      if (r.error) return [];
      return [this.absolutize(pattern)];
    }
    const abs = this.absolutize(pattern);
    const segs = splitPath(abs);
    return this._globSegs("/", segs, 0);
  };

  VFS.prototype._globSegs = function (basePath, segs, i) {
    if (i >= segs.length) return [basePath];
    const seg = segs[i];
    const r = this._walk(basePath);
    if (r.error || r.node.type !== "dir") return [];
    const entries = Object.keys(r.node.children);
    let matched;
    if (/[*?\[]/.test(seg)) {
      const re = globToRe(seg);
      matched = entries.filter(n => re.test(n));
    } else {
      matched = entries.indexOf(seg) >= 0 ? [seg] : [];
    }
    let out = [];
    for (const m of matched) {
      const next = (basePath === "/" ? "" : basePath) + "/" + m;
      out = out.concat(this._globSegs(next, segs, i + 1));
    }
    return out;
  };

  function globToRe(pat) {
    let s = "^";
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      if (c === "*") s += "[^/]*";
      else if (c === "?") s += "[^/]";
      else if (".+()|^$\\".indexOf(c) >= 0) s += "\\" + c;
      else s += c;
    }
    s += "$";
    return new RegExp(s);
  }

  /**
   * find ライク: ノードを再帰的に巡回して述語に一致するパスを返す。
   */
  VFS.prototype.find = function (startPath, predicate) {
    const out = [];
    const start = this._walk(startPath);
    if (start.error) return { error: start.error, results: [] };
    walk(start.node, start.path);
    return { results: out };

    function walk(node, p) {
      try {
        if (predicate(node, p)) out.push({ path: p, node });
      } catch (_) { /* ignore */ }
      if (node.type === "dir") {
        for (const k of Object.keys(node.children).sort()) {
          const child = node.children[k];
          const np = p === "/" ? "/" + k : p + "/" + k;
          walk(child, np);
        }
      }
    }
  };

  // ---------- フォーマッタ (ls -l 用) ----------
  VFS.formatMode = function (node) {
    const t = node.type === "dir" ? "d" : node.type === "symlink" ? "l" : "-";
    const m = node.mode;
    function bits(shift) {
      const r = (m >> shift) & 0o4;
      const w = (m >> shift) & 0o2;
      const x = (m >> shift) & 0o1;
      return (r ? "r" : "-") + (w ? "w" : "-") + (x ? "x" : "-");
    }
    return t + bits(6) + bits(3) + bits(0);
  };

  VFS.formatTime = function (d) {
    if (!d) return "Jan  1  1970";
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const M = months[d.getMonth()];
    const D = String(d.getDate()).padStart(2, " ");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return M + " " + D + " " + hh + ":" + mm;
  };

  VFS.fileSize = function (node) {
    if (node.type === "dir") return 4096;
    if (node.type === "symlink") return (node.target || "").length;
    return (node.content || "").length;
  };

  // ---------- 公開 ----------
  window.VFS = VFS;
})();
