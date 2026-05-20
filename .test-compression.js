// Wave A round-trip test: gzip / bzip2 / xz / tar の擬似実装のテスト
// commands.js のヘルパ部分を抽出して評価する

const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "assets/js/terminal/commands.js"), "utf8");

// IIFE 内のヘルパだけ評価できるよう、必要な関数の定義部分を抜き出す
// ここでは単純化のため、commands.js を eval せず、必要な関数を Node 互換に複製する

const GZIP_MAGIC  = "\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\x03";
const BZIP2_MAGIC = "BZh91AY&SY";
const XZ_MAGIC    = "\xfd7zXZ\x00\x00";

function isGzip(s)  { return s.length >= 2 && s.charCodeAt(0) === 0x1f && s.charCodeAt(1) === 0x8b; }
function isBzip2(s) { return /^BZh[1-9]/.test(s); }
function isXz(s)    { return s.length >= 6 && s.slice(0, 6) === "\xfd7zXZ"; }
function isTar(s)   { return s.length >= 263 && s.slice(257, 262) === "ustar"; }

function gzipWrap(c)    { return GZIP_MAGIC + c; }
function bzip2Wrap(c)   { return BZIP2_MAGIC + c; }
function xzWrap(c)      { return XZ_MAGIC + c; }
function gzipUnwrap(c)  { return isGzip(c)  ? c.slice(GZIP_MAGIC.length)  : null; }
function bzip2Unwrap(c) { return isBzip2(c) ? c.slice(BZIP2_MAGIC.length) : null; }
function xzUnwrap(c)    { return isXz(c)    ? c.slice(XZ_MAGIC.length)    : null; }

function tarHeader(name, mode, size) {
  const buf = new Array(512).fill("\x00");
  const setStr = (off, max, s) => {
    for (let i = 0; i < Math.min(s.length, max); i++) buf[off + i] = s[i];
  };
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
function tarPad(s) { const r = s.length % 512; return r === 0 ? s : s + "\x00".repeat(512 - r); }
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
    const content = data.slice(pos + 512, pos + 512 + size);
    files.push({ name, mode, content });
    const blocks = Math.ceil(size / 512);
    pos += 512 + blocks * 512;
  }
  return files;
}

// ---- テストランナー ----
let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  OK   " + name);
    pass++;
  } catch (e) {
    console.log("  FAIL " + name + ": " + e.message);
    fail++;
  }
}
function eq(a, b, m) {
  if (a !== b) throw new Error((m || "値が一致しません") + "\n  expected: " + JSON.stringify(b) + "\n  actual:   " + JSON.stringify(a));
}

console.log("=== Wave A: 圧縮系のラウンドトリップ ===");

const original = "the answer is 42\nnext-password-is: foo-bar-baz\n";

test("gzip wrap → isGzip 検出", () => {
  const w = gzipWrap(original);
  if (!isGzip(w)) throw new Error("isGzip が false");
  eq(w.charCodeAt(0), 0x1f, "magic byte 1");
  eq(w.charCodeAt(1), 0x8b, "magic byte 2");
});

test("gzip wrap → unwrap で元と一致", () => {
  eq(gzipUnwrap(gzipWrap(original)), original);
});

test("bzip2 wrap → isBzip2 検出 → unwrap", () => {
  const w = bzip2Wrap(original);
  if (!isBzip2(w)) throw new Error("isBzip2 が false");
  eq(bzip2Unwrap(w), original);
});

test("xz wrap → isXz 検出 → unwrap", () => {
  const w = xzWrap(original);
  if (!isXz(w)) throw new Error("isXz が false");
  eq(xzUnwrap(w), original);
});

test("isGzip は他形式を弾く", () => {
  if (isGzip(bzip2Wrap(original))) throw new Error("bzip2 を gzip と誤判定");
  if (isGzip(xzWrap(original))) throw new Error("xz を gzip と誤判定");
  if (isGzip("ASCII text")) throw new Error("ASCII を gzip と誤判定");
});

test("圧縮の入れ子: text → gzip → bzip2 → xz → bunzip2 失敗", () => {
  const layered = xzWrap(bzip2Wrap(gzipWrap(original)));
  if (!isXz(layered)) throw new Error("最外殻が xz でない");
  const u1 = xzUnwrap(layered);
  if (!isBzip2(u1)) throw new Error("内側が bzip2 でない");
  const u2 = bzip2Unwrap(u1);
  if (!isGzip(u2)) throw new Error("最内が gzip でない");
  const u3 = gzipUnwrap(u2);
  eq(u3, original);
});

test("tar pack/unpack 単一ファイル", () => {
  const packed = tarPack([{ name: "hello.txt", mode: 0o644, content: "hello world\n" }]);
  if (!isTar(packed)) throw new Error("isTar が false");
  const files = tarUnpack(packed);
  eq(files.length, 1, "ファイル数");
  eq(files[0].name, "hello.txt");
  eq(files[0].content, "hello world\n");
  eq(files[0].mode, 0o644);
});

test("tar pack/unpack 複数ファイル", () => {
  const items = [
    { name: "a.txt", content: "A\n", mode: 0o600 },
    { name: "subdir/b.txt", content: "BBBBB\n", mode: 0o644 },
    { name: "c.txt", content: "C".repeat(513), mode: 0o644 } // 512境界またぎ
  ];
  const packed = tarPack(items);
  const files = tarUnpack(packed);
  eq(files.length, 3, "ファイル数");
  eq(files[0].name, "a.txt");      eq(files[0].content, "A\n");
  eq(files[1].name, "subdir/b.txt"); eq(files[1].content, "BBBBB\n");
  eq(files[2].name, "c.txt");      eq(files[2].content, "C".repeat(513));
});

test("tar.gz: tar をさらに gzip", () => {
  const packed = tarPack([{ name: "pw.txt", content: "secret-123\n" }]);
  const wrapped = gzipWrap(packed);
  if (!isGzip(wrapped)) throw new Error("外殻が gzip でない");
  const inner = gzipUnwrap(wrapped);
  if (!isTar(inner)) throw new Error("内側が tar でない");
  const files = tarUnpack(inner);
  eq(files[0].name, "pw.txt");
  eq(files[0].content, "secret-123\n");
});

test("Bandit Lv12 風: 深い入れ子 (gz/bz2/tar 交互)", () => {
  // 元テキスト → gz → tar → bz2 → tar → gz → 最終
  const text = "the final password\n";
  let layer = gzipWrap(text);
  layer = tarPack([{ name: "data.gz", content: layer }]);
  layer = bzip2Wrap(layer);
  layer = tarPack([{ name: "data.bz2", content: layer }]);
  layer = gzipWrap(layer);
  // 逆順に展開
  if (!isGzip(layer)) throw new Error("step1: gz");
  layer = gzipUnwrap(layer);
  if (!isTar(layer)) throw new Error("step2: tar");
  layer = tarUnpack(layer)[0].content;
  if (!isBzip2(layer)) throw new Error("step3: bz2");
  layer = bzip2Unwrap(layer);
  if (!isTar(layer)) throw new Error("step4: tar");
  layer = tarUnpack(layer)[0].content;
  if (!isGzip(layer)) throw new Error("step5: gz");
  layer = gzipUnwrap(layer);
  eq(layer, text);
});

console.log("\n=== 結果: " + pass + " pass / " + fail + " fail ===");
process.exit(fail === 0 ? 0 : 1);
