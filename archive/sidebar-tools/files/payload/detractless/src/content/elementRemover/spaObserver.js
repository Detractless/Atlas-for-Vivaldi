export function initSpaObserver(applyRules) {
  let lastUrl = location.href;

  chrome.runtime.onMessage.addListener(function (message) {
    if (message.action === "reapplyRules") { lastUrl = location.href; applyRules(); }
  });

  const observer = new MutationObserver(function () {
    if (!document.getElementById("rhe-persistence-style")) applyRules();
  });
  observer.observe(document.head || document.documentElement, { childList: true });

  /* SPA route changes: the display:none stylesheet keeps matching across a
     client-side nav on its own, but PATH-SPECIFIC rules must be re-evaluated for
     the new path. Back/forward fires popstate synchronously; pushState-style navs
     (which content scripts can't hook from the isolated world) are caught by the
     1s poll below. */
  function onNav() {
    if (location.href !== lastUrl) { lastUrl = location.href; applyRules(); }
  }
  window.addEventListener('popstate', onNav);
  setInterval(onNav, 1000);
}
