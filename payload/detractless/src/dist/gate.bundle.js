(() => {
  // src/utils/themeResolver.js
  function resolveActiveTheme(cfg) {
    let active = cfg && cfg.Theme || "dark";
    if (active === "system") {
      active = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return active;
  }

  // src/utils/formatDuration.js
  function formatTimeCompact(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // src/constants/engines.js
  var DEFAULT_ENGINES = {
    default: { name: "Browser Default", url: null, icon: "src/assets/svg/default.api.svg", isDefault: true },
    google: { name: "Google", url: "https://www.google.com/search?q=", icon: "src/assets/svg/google.com.svg", isDefault: true },
    bing: { name: "Bing", url: "https://www.bing.com/search?q=", icon: "src/assets/svg/bing.com.svg", isDefault: true },
    duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=", icon: "src/assets/svg/duckduckgo.com.svg", isDefault: true },
    youtube: { name: "YouTube", url: "https://www.youtube.com/results?search_query=", icon: "src/assets/svg/youtube.com.svg", isDefault: true },
    reddit: { name: "Reddit", url: "https://www.reddit.com/search/?q=", icon: "src/assets/svg/reddit.com.svg", isDefault: true },
    yandex: { name: "Yandex", url: "https://yandex.com/search/?text=", icon: "src/assets/svg/yandex.com.svg", isDefault: true },
    yahoo: { name: "Yahoo", url: "https://search.yahoo.com/search?p=", icon: "src/assets/svg/yahoo.com.svg", isDefault: true },
    mojeek: { name: "Mojeek", url: "https://www.mojeek.com/search?q=", icon: "src/assets/svg/mojeek.com.svg", isDefault: true }
  };

  // src/pages/gate/searchQuery.js
  function extractSearchQuery(url) {
    try {
      const urlObj = new URL(url);
      const params = urlObj.searchParams;
      const query = params.get("q") || params.get("query") || params.get("p") || params.get("text") || params.get("search_query");
      return query || "";
    } catch {
      return "";
    }
  }
  function detectSearchEngine(url) {
    try {
      const hostname = new URL(url).hostname;
      for (const [, engine] of Object.entries(DEFAULT_ENGINES)) {
        if (!engine.url) continue;
        try {
          const domain = new URL(engine.url).hostname.split(".").slice(-2).join(".");
          if (hostname.includes(domain)) return { name: engine.name, icon: engine.icon };
        } catch {
          continue;
        }
      }
      return { name: "Search", icon: "" };
    } catch {
      return { name: "Search", icon: "" };
    }
  }

  // src/pages/gate/gate.js
  function applyThemeDOM(theme) {
    document.documentElement.dataset.theme = theme;
    document.body.className = "theme-" + theme;
  }
  var urlParams = new URLSearchParams(window.location.search);
  var searchUrl = urlParams.get("url");
  var timerInterval;
  var isRedirecting = false;
  var searchDelayMs = 0;
  function loadTheme() {
    try {
      chrome.storage.sync.get(["Theme"], function(result) {
        const cfg = result.Theme || {};
        let active = resolveActiveTheme(cfg);
        if (active !== "light") active = "dark";
        applyThemeDOM(active);
      });
    } catch (e) {
      console.log("Could not load theme");
    }
  }
  function displaySearchQuery() {
    chrome.storage.sync.get(["showQueryOnDelay"], function(result) {
      const showQuery = result.showQueryOnDelay || false;
      if (showQuery && searchUrl) {
        const queryDisplay = document.getElementById("query-display");
        const queryText = document.getElementById("query-text");
        const engineIcon = document.getElementById("engine-icon");
        const engineName = document.getElementById("engine-name");
        const query = extractSearchQuery(searchUrl);
        const engine = detectSearchEngine(searchUrl);
        if (query) {
          queryText.textContent = decodeURIComponent(query);
          engineName.textContent = `on ${engine.name}`;
          if (engine.icon) {
            engineIcon.src = chrome.runtime.getURL(engine.icon);
            engineIcon.alt = engine.name;
            engineIcon.style.display = "block";
          } else {
            engineIcon.style.display = "none";
          }
          queryDisplay.style.display = "flex";
        }
      }
    });
  }
  function checkDelayStatus(callback) {
    chrome.runtime.sendMessage(
      { action: "checkDelayStatus", url: searchUrl },
      function(response) {
        if (chrome.runtime.lastError) {
          console.error("Error checking delay status:", chrome.runtime.lastError);
          callback({ inDelay: false });
          return;
        }
        callback(response || { inDelay: false });
      }
    );
  }
  function startTimer(remainingSeconds) {
    let timeLeft = remainingSeconds;
    function updateDisplay() {
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        showRevealButton();
        return;
      }
      const timeDisplay = document.getElementById("time-remaining");
      if (timeDisplay) {
        timeDisplay.textContent = formatTimeCompact(timeLeft);
      }
      document.title = `(${formatTimeCompact(timeLeft)}) - Search Delay`;
      timeLeft--;
    }
    updateDisplay();
    timerInterval = setInterval(updateDisplay, 1e3);
  }
  function showRevealButton() {
    document.getElementById("timer-container").style.display = "none";
    document.getElementById("reveal-container").style.display = "block";
    document.title = "(0:00) - Search Delay Complete";
  }
  function markUrlAsCompleted() {
    if (isRedirecting) return;
    isRedirecting = true;
    const btn = document.getElementById("reveal-button");
    if (btn) {
      btn.textContent = "Opening...";
      btn.style.opacity = "0.7";
      btn.style.cursor = "wait";
    }
    chrome.runtime.sendMessage(
      { action: "markDelayCompleted", url: searchUrl },
      function() {
        if (chrome.runtime.lastError) {
          console.log("Error marking delay completed:", chrome.runtime.lastError);
          isRedirecting = false;
          if (btn) {
            btn.textContent = "Reveal Results";
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
          }
          return;
        }
        sessionStorage.setItem("redirecting_" + searchUrl, "true");
        window.location.replace(searchUrl);
      }
    );
  }
  function initializeDelayPage() {
    if (searchUrl && sessionStorage.getItem("redirecting_" + searchUrl)) {
      sessionStorage.removeItem("redirecting_" + searchUrl);
      window.location.replace(searchUrl);
      return;
    }
    const revealButton = document.getElementById("reveal-button");
    if (revealButton) {
      revealButton.addEventListener("click", markUrlAsCompleted);
    }
    checkDelayStatus((status) => {
      if (status.completed) {
        document.title = "(0:00) - Search Delay Complete";
        setTimeout(() => {
          window.location.replace(searchUrl);
        }, 500);
      } else if (!status.inDelay) {
        window.location.replace(searchUrl);
      } else if (status.showRevealButton) {
        showRevealButton();
      } else {
        startTimer(status.remainingSeconds);
      }
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    loadTheme();
    displaySearchQuery();
    chrome.storage.sync.get(["searchDelaySeconds"], (result) => {
      searchDelayMs = (result.searchDelaySeconds || 0) * 1e3;
      initializeDelayPage();
    });
  });
  window.addEventListener("beforeunload", () => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
  });
})();
//# sourceMappingURL=gate.bundle.js.map
