/* =========================================================
   app.js
   全ページ共通: ナビ初期化、トースト、レベルカード hover、
   現在地ハイライト
   ========================================================= */

(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  // ---------- 現在ページのナビハイライト ----------
  function highlightCurrentNav() {
    const links = document.querySelectorAll(".nav__link[data-page]");
    if (!links.length) return;
    const path = location.pathname.split("/").pop() || "index.html";
    const page = path.replace(/\.html$/, "");
    links.forEach(a => {
      const target = a.dataset.page;
      if (target === page || (target === "index" && (page === "" || page === "index"))) {
        a.setAttribute("aria-current", "page");
      }
    });
  }

  // ---------- レベルカード: マウス追従ハイライト ----------
  function bindLevelCardHover() {
    document.querySelectorAll(".level-card").forEach(card => {
      card.addEventListener("pointermove", (ev) => {
        const r = card.getBoundingClientRect();
        const mx = ((ev.clientX - r.left) / r.width) * 100;
        const my = ((ev.clientY - r.top) / r.height) * 100;
        card.style.setProperty("--mx", mx + "%");
        card.style.setProperty("--my", my + "%");
      });
    });
  }

  // ---------- トースト ----------
  let toastEl = null;
  let toastTimer = null;
  function toast(msg, opts = {}) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("is-visible");
    }, opts.duration || 2200);
  }

  // ---------- 起動 ----------
  ready(() => {
    highlightCurrentNav();
    bindLevelCardHover();
  });

  // 公開
  window.App = {
    toast,
    rescan() {
      bindLevelCardHover();
    }
  };
})();
