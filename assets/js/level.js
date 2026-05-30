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

  // AI に聞くための段階プロンプトを生成する。
  // 方針: 答え (コマンド行・パスワード) を直接出させない「誘導型」。
  // 課題サマリは window.LEVEL_AI_TASKS[n] を使い、無ければ story 先頭文へフォールバック。
  function buildAiPrompts(n, data) {
    const tasks = window.LEVEL_AI_TASKS || [];
    let task = tasks[n];
    if (!task) {
      const story = String((data && data.story) || "").trim();
      task = story.split(/[\n。]/).map(s => s.trim()).filter(Boolean)[0]
        || "Linux のコマンドラインの練習問題に取り組んでいます。";
      if (!/[。.!?！？]$/.test(task)) task += "。";
    }
    const intro =
      "あなたは Linux 初心者に教える、親切で丁寧な家庭教師です。" +
      "私はターミナル（コマンドライン）の練習問題に取り組んでいます。";
    const taskBlock = "\n\n【取り組んでいる課題】\n" + task;
    return [
      {
        label: "まずヒントが欲しいとき",
        text: intro + "\n\n" +
          "いきなり答えやコマンド全体は教えないでください。代わりに、最初に何へ注目すればよいか、" +
          "考えるきっかけになるヒントを1つだけ短く教えてください。" + taskBlock
      },
      {
        label: "使うコマンドの方向性を知りたいとき",
        text: intro + "\n\n" +
          "まだ解けません。次に試すとよいコマンドの『種類や方向性』のヒントだけください。" +
          "完成したコマンド行そのものは、まだ書かないでください。" + taskBlock
      },
      {
        label: "手順を一緒に整理したいとき",
        text: intro + "\n\n" +
          "考え方の手順を一緒に整理してください。ただし最終的な答え（実行するコマンド行や、" +
          "見つけ出すパスワードそのもの）は、私が自分で組み立てられるよう空欄やヒントのまま残してください。" + taskBlock
      }
    ];
  }

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
    // レベルページ以外 (テストハーネス等) で誤って実行されないようガード
    if (!$("levelStack")) return;
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

    const aiPromptsHtml = buildAiPrompts(n, data).map((p, i) =>
      `<details class="disclosure">
        <summary>AI への質問 ${i + 1}：${escapeHtml(p.label)}</summary>
        <div class="disclosure__body">
          <p class="muted" style="font-size: var(--t-small); margin: 0 0 var(--s-3);">下の文章をコピーして、ChatGPT などの AI にそのまま貼り付けてください。</p>
          <div class="code"><pre>${escapeHtml(p.text)}</pre></div>
        </div>
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

      ${aiPromptsHtml || approachHtml ? `
        <section class="level-card-block">
          <h3>AI に聞いてみる</h3>
          <p class="muted" style="font-size: var(--t-small);">行き詰まったら、答えを丸写しさせるのではなく、AI からヒントを引き出すのがコツです。下のプロンプトをコピーして ChatGPT などに貼り付け、上から順に試してみてください。どうしても分からないときだけ、最後の「正解までの道筋」を開きましょう。</p>
          <div class="stack" style="margin-top: var(--s-3);">
            ${aiPromptsHtml}
            ${approachHtml}
          </div>
        </section>
      ` : ""}
    `;

    // 動的に挿入した AI プロンプト (.code) にコピーボタンを付与する
    if (window.CopyButtons && typeof window.CopyButtons.rescan === "function") {
      window.CopyButtons.rescan();
    }

    // VFS とシェルの構築
    const fsSpec = data.fs || { user: "guest", home: "/home/guest", cwd: "/home/guest" };
    const vfs = new VFS(fsSpec);
    // レベル定義側で shellOptions ({restricted, shellName}) を指定できる (Lv32 等の制限シェル用)
    const shell = new Shell(Object.assign({ vfs }, fsSpec.shellOptions || {}));
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
        // 軽いクリア演出: パスワードゲートに success クラスを足して短い border-glow を 1 回流す
        const gate = document.querySelector(".password-gate");
        if (gate) gate.classList.add("password-gate--success");
        if (window.App && typeof window.App.toast === "function") {
          window.App.toast("Level " + n + " クリア");
        }
        // SR が「正解です」と読み終わる時間を確保 (900ms → 1400ms)
        setTimeout(() => {
          if (n + 1 < total) location.href = "level.html?l=" + (n + 1);
          else location.href = "index.html";
        }, 1400);
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

  // テストハーネスからの検証用に公開
  window.LevelPage = { buildAiPrompts: buildAiPrompts };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
