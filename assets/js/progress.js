/* =========================================================
   progress.js
   ハイブリッド進捗ストレージ:
     - 通常: localStorage `shell:progress:v1` に自動保存
     - フォールバック: 利用不可ならメモリ内保持 + バナー通知
     - 手動エクスポート / インポート / リセット
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "shell:progress:v1";
  const TOTAL_LEVELS = 35; // 0..34
  const SCHEMA_VERSION = 1;
  const HISTORY_MAX = 100;

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      cleared: {},
      lastLevel: 0,
      termHistory: []
    };
  }

  function isStorageAvailable() {
    try {
      const t = "__shell_test__";
      window.localStorage.setItem(t, t);
      window.localStorage.removeItem(t);
      return true;
    } catch (_) {
      return false;
    }
  }

  const HAS_STORAGE = isStorageAvailable();
  let memoryState = null;

  function readState() {
    if (HAS_STORAGE) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        return migrate(parsed);
      } catch (_) {
        return defaultState();
      }
    }
    if (!memoryState) memoryState = defaultState();
    return memoryState;
  }

  function writeState(state) {
    state.savedAt = new Date().toISOString();
    if (HAS_STORAGE) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (_) {
        // クオータ超過などはフォールバック
      }
    }
    memoryState = state;
    return false;
  }

  function migrate(state) {
    if (!state || typeof state !== "object") return defaultState();
    if (state.version === SCHEMA_VERSION) {
      // shape チェック
      if (typeof state.cleared !== "object" || state.cleared === null) state.cleared = {};
      if (typeof state.lastLevel !== "number") state.lastLevel = 0;
      if (!Array.isArray(state.termHistory)) state.termHistory = [];
      return state;
    }
    // 将来のバージョンマイグレーションをここに追加
    return defaultState();
  }

  // ---------- Public API ----------

  const Progress = {
    isPersistent() { return HAS_STORAGE; },

    get state() { return readState(); },

    isCleared(level) {
      const s = readState();
      return Boolean(s.cleared[String(level)]);
    },

    markCleared(level) {
      const s = readState();
      s.cleared[String(level)] = true;
      const n = Number(level);
      if (Number.isFinite(n) && n >= s.lastLevel) {
        s.lastLevel = Math.min(n + 1, TOTAL_LEVELS - 1);
      }
      writeState(s);
      dispatchChange();
    },

    setLastLevel(level) {
      const s = readState();
      s.lastLevel = Number(level) || 0;
      writeState(s);
      dispatchChange();
    },

    pushHistory(line) {
      if (!line) return;
      const s = readState();
      s.termHistory.push(String(line));
      if (s.termHistory.length > HISTORY_MAX) {
        s.termHistory = s.termHistory.slice(-HISTORY_MAX);
      }
      writeState(s);
    },

    getClearedCount() {
      const s = readState();
      return Object.keys(s.cleared).filter(k => s.cleared[k]).length;
    },

    getTotalLevels() { return TOTAL_LEVELS; },

    reset() {
      if (HAS_STORAGE) {
        try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      }
      memoryState = defaultState();
      dispatchChange();
    },

    /**
     * 進捗を JSON ファイルとしてダウンロード
     */
    exportToFile() {
      const s = readState();
      const blob = new Blob(
        [JSON.stringify(s, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href = url;
      a.download = `shell-progress-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 解放を遅延（一部ブラウザでDLが間に合わないことがあるため）
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    /**
     * JSON 文字列を取り込む。mode は 'merge' | 'replace'
     */
    importFromString(jsonText, mode = "merge") {
      let incoming;
      try {
        incoming = JSON.parse(jsonText);
      } catch (e) {
        throw new Error("不正なJSONです：" + e.message);
      }
      if (!incoming || typeof incoming !== "object") {
        throw new Error("進捗ファイルの形式が認識できません");
      }
      if (incoming.version !== SCHEMA_VERSION) {
        // 将来用：マイグレーションフックの場所
        // 今はバージョン違いを警告として扱い、可能な範囲で取り込む
      }
      const cleared = (incoming.cleared && typeof incoming.cleared === "object")
        ? incoming.cleared : {};
      const next = readState();
      if (mode === "replace") {
        next.cleared = {};
        next.termHistory = [];
        next.lastLevel = 0;
      }
      Object.keys(cleared).forEach(k => {
        if (cleared[k]) next.cleared[String(k)] = true;
      });
      if (typeof incoming.lastLevel === "number") {
        next.lastLevel = Math.max(next.lastLevel, incoming.lastLevel);
      }
      if (Array.isArray(incoming.termHistory) && mode === "replace") {
        next.termHistory = incoming.termHistory.slice(-HISTORY_MAX);
      }
      writeState(next);
      dispatchChange();
      return {
        importedCleared: Object.keys(cleared).length,
        totalCleared: Object.keys(next.cleared).filter(k => next.cleared[k]).length
      };
    },

    /**
     * File オブジェクトから取り込む
     */
    async importFromFile(file, mode = "merge") {
      const text = await file.text();
      return this.importFromString(text, mode);
    },

    /**
     * 変更通知 (DOM CustomEvent)
     */
    onChange(handler) {
      const listener = () => handler(readState());
      window.addEventListener("shell:progress-change", listener);
      return () => window.removeEventListener("shell:progress-change", listener);
    }
  };

  function dispatchChange() {
    try {
      window.dispatchEvent(new CustomEvent("shell:progress-change"));
    } catch (_) {}
  }

  // 起動時にフォールバック警告を表示（一度だけ）
  function maybeShowFallbackBanner() {
    if (HAS_STORAGE) return;
    if (window.__shellFallbackBannerShown) return;
    window.__shellFallbackBannerShown = true;
    const showBanner = () => {
      const host = document.querySelector("[data-storage-banner]");
      if (!host) return;
      host.innerHTML = `
        <div class="banner" role="status">
          <div>
            <div class="banner__title">進捗は自動保存されません</div>
            <div>このブラウザでは進捗の保存ができない設定になっています（プライベートブラウジング等）。続けることはできますが、画面を閉じると進捗は失われます。設定ページのエクスポート機能で手動保存をお試しください。</div>
          </div>
          <button class="banner__close" aria-label="閉じる" onclick="this.closest('.banner').remove()">閉じる</button>
        </div>`;
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showBanner);
    } else {
      showBanner();
    }
  }
  maybeShowFallbackBanner();

  // グローバル公開
  window.Progress = Progress;
})();
