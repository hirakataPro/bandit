/* =========================================================
   level.js — レベルページのレンダリングと制御
   構成 (上から順): シナリオ → 仮想ターミナル → パスワード入力 → ヒント
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

  function $(id) { return document.getElementById(id); }

  // bash 風 last login (ランダム IP で十分それっぽくなる)
  function makeBanner(vfs) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const d = new Date();
    const dStr = `${wd[d.getDay()]} ${months[d.getMonth()]} ${String(d.getDate()).padStart(2," ")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")} ${d.getFullYear()}`;
    const fakeIp = "192.0.2." + (10 + Math.floor(Math.random() * 240));
    return (
`Linux ${vfs.hostname} 5.15.0-shell #1 SMP x86_64 GNU/Linux

The programs included with this Shell training environment are
free educational software; the exact terms are described in
the about page.

Last login: ${dStr} from ${fakeIp}

ヒント: \x1b[1;36mhelp\x1b[0m と打つと、使えるコマンドの一覧が出ます。
\n`
    );
  }

  function render() {
    const params = new URLSearchParams(location.search);
    let n = parseInt(params.get("l"), 10);
    if (!Number.isFinite(n)) n = 0;
    const total = Progress.getTotalLevels();
    if (n < 0) n = 0;
    if (n >= total) n = total - 1;

    const meta = (window.LEVELS && window.LEVELS[n]) || {};
    const data = (window.LEVEL_DATA && window.LEVEL_DATA[n]) || null;

    document.title = "Level " + n + " — " + (meta.title || "Shell");

    // ヘッダー
    $("lvNum").textContent = "LEVEL " + String(n).padStart(2, "0");
    $("lvTitle").textContent = meta.title || ("Level " + n);
    $("lvTheme").textContent = meta.theme || "";

    // ナビゲーション
    const prev = $("lvPrev");
    const next = $("lvNext");
    if (n <= 0) {
      prev.setAttribute("aria-disabled", "true");
      prev.removeAttribute("href");
    } else {
      prev.setAttribute("href", "level.html?l=" + (n - 1));
      prev.removeAttribute("aria-disabled");
    }
    if (n >= total - 1) {
      next.setAttribute("aria-disabled", "true");
      next.removeAttribute("href");
    } else {
      next.setAttribute("href", "level.html?l=" + (n + 1));
      next.removeAttribute("aria-disabled");
    }

    const stack = $("levelStack");

    if (!data) {
      stack.innerHTML = `
        <div class="level-card-block">
          <h3>このレベルは執筆中です</h3>
          <p>シナリオと仮想ファイルシステムは現在作成中です。すでに公開されている他のレベルをお試しください。</p>
          <div class="row" style="margin-top: var(--s-4);">
            <a class="btn btn--primary" href="level.html?l=0">Level 0 から始める</a>
            <a class="btn btn--ghost" href="cheatsheet.html">チートシートを見る</a>
          </div>
        </div>`;
      return;
    }

    const isCleared = Progress.isCleared(n);
    const clearedBanner = isCleared
      ? `<div class="banner" style="background: rgba(48,209,88,0.1); border-color: rgba(48,209,88,0.3); color: var(--accent-success); margin-bottom: var(--s-5);">
          <div><div class="banner__title">クリア済み</div><div>このレベルは既にクリア済みです。再挑戦してもOK、そのまま次へ進むこともできます。</div></div>
        </div>`
      : "";

    const skillsHtml = (data.skills || []).map(s =>
      `<span class="chip">${escapeHtml(s)}</span>`
    ).join("");

    const hintsHtml = (data.hints || []).map((h, i) =>
      `<details class="disclosure">
        <summary>ヒント ${i + 1}</summary>
        <div class="disclosure__body">${escapeHtml(h)}</div>
      </details>`
    ).join("");

    const approachHtml = data.approach
      ? `<details class="disclosure">
          <summary>正解までの道筋（最後のヒント）</summary>
          <div class="disclosure__body" style="white-space: pre-wrap;">${escapeHtml(data.approach)}</div>
        </details>`
      : "";

    // 上から順に: シナリオ / ターミナル / パスワード / ヒント
    stack.innerHTML = `
      ${clearedBanner}

      <section class="level-card-block">
        <h3>シナリオ</h3>
        <p style="white-space: pre-wrap;">${escapeHtml(data.story || "")}</p>
        ${skillsHtml ? `<div class="skill-pills">${skillsHtml}</div>` : ""}
      </section>

      <section class="level-terminal">
        <div class="level-terminal__hint muted">
          下のターミナルにコマンドを打ち込むと、すぐに結果が返ってきます。
          <kbd>Tab</kbd> 補完 / <kbd>↑↓</kbd> 履歴 / <kbd>Ctrl+L</kbd> クリア / <kbd>help</kbd> でコマンド一覧。
        </div>
        <div id="termHost"></div>
      </section>

      <section class="password-gate">
        <div class="password-gate__title">パスワードを入力して次のレベルへ</div>
        <div class="password-gate__sub">仮想ターミナルでパスワード文字列を見つけたら、ここに貼り付けてください。完全一致で認証されます。</div>
        <div class="password-gate__row">
          <input class="password-gate__input" id="pwInput" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="例: xxxxx-xxxxx-xxxxx" aria-label="パスワード">
          <button class="btn btn--primary" id="pwSubmit">確認</button>
        </div>
        <div class="password-gate__feedback" id="pwFeedback" role="status" aria-live="polite"></div>
      </section>

      ${hintsHtml || approachHtml ? `
        <section class="level-card-block">
          <h3>ヒント</h3>
          <p class="muted" style="font-size: var(--t-small);">行き詰まったら、上から順番に開いて読んでください。最後の「正解までの道筋」が一番大きな手がかりです。</p>
          <div class="stack" style="margin-top: var(--s-3);">
            ${hintsHtml}
            ${approachHtml}
          </div>
        </section>
      ` : ""}
    `;

    // VFS とシェルの構築
    const fsSpec = data.fs || { user: "guest", home: "/home/guest", cwd: "/home/guest" };
    const vfs = new VFS(fsSpec);
    const shell = new Shell({ vfs });
    shell.registerMany(window.SHELL_COMMANDS);

    new Terminal("#termHost", shell, {
      title: vfs.user + "@" + vfs.hostname + ": " + (vfs.cwd === vfs.home ? "~" : vfs.cwd),
      banner: makeBanner(vfs)
    });

    // パスワード検証
    function tryPassword(value) {
      const pw = String(value || "").trim();
      const fb = $("pwFeedback");
      if (!pw) {
        fb.textContent = "パスワードを入力してください。";
        fb.className = "password-gate__feedback is-error";
        return;
      }
      if (pw === data.password) {
        fb.textContent = "正解です。次のレベルへ進みます…";
        fb.className = "password-gate__feedback is-success";
        Progress.markCleared(n);
        setTimeout(() => {
          if (n + 1 < total) location.href = "level.html?l=" + (n + 1);
          else location.href = "index.html";
        }, 900);
      } else {
        fb.textContent = "違うようです。仮想ターミナル内をもう一度探してみましょう。";
        fb.className = "password-gate__feedback is-error";
      }
    }

    $("pwSubmit").addEventListener("click", () => tryPassword($("pwInput").value));
    $("pwInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); tryPassword(e.target.value); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
