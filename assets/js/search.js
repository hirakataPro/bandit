/* =========================================================
   search.js
   チートシートページの検索・カテゴリ絞り込み・カード描画
   ========================================================= */

(function () {
  "use strict";

  const STATE = {
    query: "",
    category: "ALL"
  };

  let allCommands = [];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function matches(cmd, q) {
    if (!q) return true;
    const t = q.toLowerCase();
    if (cmd.name.toLowerCase().includes(t)) return true;
    if (cmd.summary && cmd.summary.toLowerCase().includes(t)) return true;
    if (cmd.synopsis && cmd.synopsis.toLowerCase().includes(t)) return true;
    if (cmd.category && cmd.category.includes(q)) return true;
    if (cmd.options && cmd.options.some(o =>
      (o.flag && o.flag.toLowerCase().includes(t)) ||
      (o.desc && o.desc.toLowerCase().includes(t))
    )) return true;
    if (cmd.examples && cmd.examples.some(ex =>
      (ex.cmd && ex.cmd.toLowerCase().includes(t)) ||
      (ex.desc && ex.desc.toLowerCase().includes(t))
    )) return true;
    if (cmd.related && cmd.related.some(r => r.toLowerCase().includes(t))) return true;
    return false;
  }

  function renderCard(cmd) {
    const optsHtml = (cmd.options && cmd.options.length)
      ? `<dl class="cmd-options">${cmd.options.map(o =>
          `<dt>${escapeHtml(o.flag)}</dt><dd>${escapeHtml(o.desc)}</dd>`
        ).join("")}</dl>`
      : "";

    const examplesHtml = (cmd.examples && cmd.examples.length)
      ? `<div class="cmd-examples">${cmd.examples.map(ex =>
          `<div>
            <div class="cmd-example__cmd"><code>${escapeHtml(ex.cmd)}</code></div>
            <div class="cmd-example__desc">${escapeHtml(ex.desc)}</div>
          </div>`
        ).join("")}</div>`
      : "";

    const tipHtml = cmd.tips
      ? `<div class="cmd-card__tip">${escapeHtml(cmd.tips)}</div>`
      : "";

    const relatedHtml = (cmd.related && cmd.related.length)
      ? `<div class="cmd-card__related">関連: ${cmd.related.map(r =>
          `<a href="#cmd-${escapeHtml(r)}" data-jump="${escapeHtml(r)}">${escapeHtml(r)}</a>`
        ).join(" ")}</div>`
      : "";

    return `
      <article class="cmd-card" id="cmd-${escapeHtml(cmd.name)}" data-name="${escapeHtml(cmd.name)}" data-category="${escapeHtml(cmd.category)}">
        <header class="cmd-card__head">
          <div class="cmd-card__name">${escapeHtml(cmd.name)}</div>
          <div class="cmd-card__cat">${escapeHtml(cmd.category)}</div>
        </header>
        <p class="cmd-card__summary">${escapeHtml(cmd.summary)}</p>
        ${cmd.synopsis ? `<div class="cmd-card__synopsis"><code>${escapeHtml(cmd.synopsis)}</code></div>` : ""}
        ${(optsHtml || examplesHtml) ? `
          <details class="cmd-card__details" ${STATE.query ? "open" : ""}>
            <summary>オプション・使用例</summary>
            ${optsHtml}
            ${examplesHtml}
          </details>
        ` : ""}
        ${tipHtml}
        ${relatedHtml}
      </article>
    `;
  }

  function applyFilter() {
    const grid = document.getElementById("sheetGrid");
    const meta = document.getElementById("sheetMeta");
    if (!grid) return;

    const filtered = allCommands.filter(c =>
      (STATE.category === "ALL" || c.category === STATE.category) &&
      matches(c, STATE.query)
    );

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state__title">該当するコマンドはありません</div>
          <div class="empty-state__sub">検索語やフィルタを変えてみてください。</div>
        </div>`;
    } else {
      grid.innerHTML = filtered.map(renderCard).join("");
    }

    meta.textContent = filtered.length + " / " + allCommands.length + " 件";

    // 関連リンクのスムーズジャンプ
    grid.querySelectorAll("a[data-jump]").forEach(a => {
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const name = a.dataset.jump;
        const target = document.getElementById("cmd-" + name);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          target.style.transition = "background 1s";
          target.style.background = "rgba(41, 151, 255, 0.08)";
          setTimeout(() => { target.style.background = ""; }, 1200);
        }
      });
    });
  }

  function init() {
    if (!window.COMMANDS) return;
    allCommands = window.COMMANDS.slice();

    // カテゴリチップを生成
    const filtersHost = document.getElementById("sheetFilters");
    if (filtersHost && window.COMMAND_CATEGORIES) {
      const cats = ["ALL"].concat(window.COMMAND_CATEGORIES);
      filtersHost.innerHTML = cats.map(c =>
        `<button class="chip ${c === "ALL" ? "is-active" : ""}" data-cat="${c}" aria-pressed="${c === "ALL"}">
          ${c === "ALL" ? "すべて" : c}
        </button>`
      ).join("");
      filtersHost.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".chip");
        if (!btn) return;
        STATE.category = btn.dataset.cat;
        filtersHost.querySelectorAll(".chip").forEach(b => {
          const active = b.dataset.cat === STATE.category;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-pressed", String(active));
        });
        applyFilter();
      });
    }

    // 検索入力
    const input = document.getElementById("sheetSearch");
    if (input) {
      input.addEventListener("input", (ev) => {
        STATE.query = ev.target.value.trim();
        applyFilter();
      });
      // フォーカスショートカット (/ キー)
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "/" && document.activeElement !== input) {
          ev.preventDefault();
          input.focus();
        }
      });
    }

    applyFilter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
