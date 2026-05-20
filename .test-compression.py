# Wave A round-trip test
# commands.js の圧縮/アーカイブのアルゴリズムを Python に移植して検証する。
# JS 文字列も UTF-16 のコードユニット列であり、本実装は全マジックが BMP 内 + ASCII
# のため、Python str (Unicode) と等価に動作する。

import sys

GZIP_MAGIC  = "\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\x03"
BZIP2_MAGIC = "BZh91AY&SY"
XZ_MAGIC    = "\xfd7zXZ\x00\x00"

def is_gzip(s):  return len(s) >= 2 and ord(s[0]) == 0x1f and ord(s[1]) == 0x8b
def is_bzip2(s): return len(s) >= 4 and s[:3] == "BZh" and s[3] in "123456789"
def is_xz(s):    return len(s) >= 6 and s[:6] == "\xfd7zXZ\x00"
def is_tar(s):   return len(s) >= 263 and s[257:262] == "ustar"

def gzip_wrap(c):     return GZIP_MAGIC + c
def bzip2_wrap(c):    return BZIP2_MAGIC + c
def xz_wrap(c):       return XZ_MAGIC + c
def gzip_unwrap(c):   return c[len(GZIP_MAGIC):]  if is_gzip(c)  else None
def bzip2_unwrap(c):  return c[len(BZIP2_MAGIC):] if is_bzip2(c) else None
def xz_unwrap(c):     return c[len(XZ_MAGIC):]    if is_xz(c)    else None

def tar_header(name, mode, size):
    buf = ["\x00"] * 512
    def set_str(off, mx, s):
        for i in range(min(len(s), mx)):
            buf[off + i] = s[i]
    set_str(0, 100, name)
    set_str(100, 8, format(mode, "07o") + "\x00")
    set_str(108, 8, "0000000\x00")
    set_str(116, 8, "0000000\x00")
    set_str(124, 12, format(size, "011o") + "\x00")
    set_str(136, 12, "00000000000\x00")
    for i in range(8): buf[148 + i] = " "
    buf[156] = "0"
    set_str(257, 6, "ustar\x00")
    set_str(263, 2, "00")
    set_str(265, 32, "root\x00")
    set_str(297, 32, "root\x00")
    s = sum(ord(c) for c in buf)
    ck = format(s, "06o") + "\x00 "
    for i in range(8): buf[148 + i] = ck[i]
    return "".join(buf)

def tar_pad(s):
    r = len(s) % 512
    return s if r == 0 else s + "\x00" * (512 - r)

def tar_pack(files):
    out = ""
    for f in files:
        out += tar_header(f["name"], f.get("mode", 0o644), len(f.get("content", "")))
        out += tar_pad(f.get("content", ""))
    out += "\x00" * 1024
    return out

def tar_unpack(data):
    files = []
    pos = 0
    while pos + 512 <= len(data):
        hdr = data[pos:pos+512]
        if all(c == "\x00" for c in hdr): break
        if hdr[257:262] != "ustar": break
        name_end = 0
        while name_end < 100 and hdr[name_end] != "\x00": name_end += 1
        name = hdr[:name_end]
        mode_str = hdr[100:107].split("\x00")[0].split(" ")[0]
        mode = int(mode_str, 8) if mode_str else 0o644
        size_str = hdr[124:135].split("\x00")[0].split(" ")[0]
        size = int(size_str, 8) if size_str else 0
        content = data[pos+512:pos+512+size]
        files.append({"name": name, "mode": mode, "content": content})
        blocks = (size + 511) // 512
        pos += 512 + blocks * 512
    return files

# ---- runner ----
pas, fai = 0, 0
def test(name, fn):
    global pas, fai
    try:
        fn()
        print("  OK   " + name)
        pas += 1
    except Exception as e:
        print("  FAIL " + name + ": " + str(e))
        fai += 1
def eq(a, b, m=""):
    if a != b:
        raise Exception((m or "mismatch") + "\n    expected: " + repr(b)[:120] + "\n    actual:   " + repr(a)[:120])

print("=== Wave A: 圧縮系のラウンドトリップ ===")

original = "the answer is 42\nnext-password-is: foo-bar-baz\n"

def t1():
    w = gzip_wrap(original)
    assert is_gzip(w)
    eq(ord(w[0]), 0x1f); eq(ord(w[1]), 0x8b)
test("gzip wrap → is_gzip 検出", t1)

def t2(): eq(gzip_unwrap(gzip_wrap(original)), original)
test("gzip round-trip", t2)

def t3():
    w = bzip2_wrap(original); assert is_bzip2(w); eq(bzip2_unwrap(w), original)
test("bzip2 round-trip", t3)

def t4():
    w = xz_wrap(original); assert is_xz(w); eq(xz_unwrap(w), original)
test("xz round-trip", t4)

def t5():
    assert not is_gzip(bzip2_wrap(original))
    assert not is_gzip(xz_wrap(original))
    assert not is_gzip("ASCII text")
    assert not is_bzip2(gzip_wrap(original))
    assert not is_xz(gzip_wrap(original))
test("マジック判別の相互排他", t5)

def t6():
    layered = xz_wrap(bzip2_wrap(gzip_wrap(original)))
    assert is_xz(layered)
    u1 = xz_unwrap(layered);   assert is_bzip2(u1)
    u2 = bzip2_unwrap(u1);     assert is_gzip(u2)
    u3 = gzip_unwrap(u2);      eq(u3, original)
test("入れ子 text → gz → bz2 → xz の逆展開", t6)

def t7():
    packed = tar_pack([{"name": "hello.txt", "mode": 0o644, "content": "hello world\n"}])
    assert is_tar(packed)
    files = tar_unpack(packed)
    eq(len(files), 1)
    eq(files[0]["name"], "hello.txt")
    eq(files[0]["content"], "hello world\n")
    eq(files[0]["mode"], 0o644)
test("tar 単一ファイル", t7)

def t8():
    items = [
        {"name": "a.txt", "content": "A\n", "mode": 0o600},
        {"name": "subdir/b.txt", "content": "BBBBB\n", "mode": 0o644},
        {"name": "c.txt", "content": "C" * 513, "mode": 0o644}
    ]
    packed = tar_pack(items)
    files = tar_unpack(packed)
    eq(len(files), 3)
    eq(files[0]["name"], "a.txt"); eq(files[0]["content"], "A\n")
    eq(files[1]["name"], "subdir/b.txt"); eq(files[1]["content"], "BBBBB\n")
    eq(files[2]["name"], "c.txt"); eq(files[2]["content"], "C" * 513)
test("tar 複数 + 512境界またぎ", t8)

def t9():
    packed = tar_pack([{"name": "pw.txt", "content": "secret-123\n"}])
    wrapped = gzip_wrap(packed)
    assert is_gzip(wrapped)
    inner = gzip_unwrap(wrapped); assert is_tar(inner)
    files = tar_unpack(inner)
    eq(files[0]["name"], "pw.txt"); eq(files[0]["content"], "secret-123\n")
test("tar.gz: tar をさらに gzip", t9)

def t10():
    text = "the final password\n"
    layer = gzip_wrap(text)
    layer = tar_pack([{"name": "data.gz", "content": layer}])
    layer = bzip2_wrap(layer)
    layer = tar_pack([{"name": "data.bz2", "content": layer}])
    layer = gzip_wrap(layer)
    assert is_gzip(layer); layer = gzip_unwrap(layer)
    assert is_tar(layer);  layer = tar_unpack(layer)[0]["content"]
    assert is_bzip2(layer); layer = bzip2_unwrap(layer)
    assert is_tar(layer);  layer = tar_unpack(layer)[0]["content"]
    assert is_gzip(layer); layer = gzip_unwrap(layer)
    eq(layer, text)
test("Bandit Lv12 風: 深い入れ子", t10)

print("\n=== 結果: {} pass / {} fail ===".format(pas, fai))
sys.exit(0 if fai == 0 else 1)
