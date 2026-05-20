/* =========================================================
   copy.js
   コードブロックにコピーボタンを自動付与する。
   対象: <pre data-copy> または .code 内の <pre>
   ========================================================= */

(function () {
  "use strict";

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        // フォールバックへ続く
      }
    }
    // execCommand フォールバック (file:// 等)
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-1000px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  function attachButton(codeEl) {
    if (codeEl.querySelector(".code__copy")) return;
    const pre = codeEl.querySelector("pre") || codeEl;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code__copy";
    btn.setAttribute("aria-label", "コードをコピー");
    btn.textContent = "コピー";
    btn.addEventListener("click", async () => {
      const text = pre.innerText.replace(/ /g, " ");
      const ok = await copyText(text);
      if (ok) {
        btn.dataset.state = "copied";
        btn.textContent = "コピーしました";
        setTimeout(() => {
          delete btn.dataset.state;
          btn.textContent = "コピー";
        }, 1600);
      } else {
        btn.textContent = "失敗";
        setTimeout(() => { btn.textContent = "コピー"; }, 1600);
      }
    });
    codeEl.appendChild(btn);
  }

  function init() {
    document.querySelectorAll(".code").forEach(attachButton);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // 動的に挿入されたコード用
  window.CopyButtons = { rescan: init };
})();
