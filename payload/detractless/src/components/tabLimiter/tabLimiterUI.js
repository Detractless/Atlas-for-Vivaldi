import './tabLimiterUI.css';
import { formatTimeRemaining } from '../../utils/formatDuration.js';
import { getTabCount } from '../../services/tabService.js';
import { sendToBackground } from '../../services/backgroundMessenger.js';
import {
  limiterUpdateInterval, setLimiterUpdateInterval
} from '../../pages/newtab/newtabState.js';

export function initializeTabLimiter() { updateLimiterUI(); setLimiterUpdateInterval(setInterval(updateLimiterUI, 1000)); initLimitButtons(); }

export async function updateLimiterUI() {
  const result = await window.chrome.storage.sync.get(["tabLimit", "managementMethod", "pendingIncrease"]);
  const tabLimit = result.tabLimit !== undefined ? result.tabLimit : 0;
  const managementMethod = result.managementMethod || "block";

  const tabCount = await getTabCount();
  const limitDisplay = document.getElementById("current-limit"); const countDisplay = document.getElementById("current-tabs");

  if (limitDisplay) limitDisplay.textContent = (tabLimit === 0) ? "Off" : tabLimit;
  if (countDisplay) countDisplay.textContent = tabCount;

  const buttons = document.querySelectorAll(".limit-btn");
  buttons.forEach((btn) => {
    if (btn.classList.contains('delay-btn')) return;
    const btnLimit = parseInt(btn.dataset.limit, 10);
    if (btnLimit === tabLimit) { btn.classList.add("active"); } else { btn.classList.remove("active"); }
    if (result.pendingIncrease && result.pendingIncrease.targetLimit === btnLimit) { btn.classList.add("pending"); } else { btn.classList.remove("pending"); }
  });
  const radios = document.querySelectorAll('input[name="management-method"]'); radios.forEach(radio => { if (radio.value === managementMethod) radio.checked = true; });
  updatePendingDisplay(result.pendingIncrease);
}

export function initLimitButtons() {
  const limitButtons = document.querySelectorAll(".limit-btn");
  limitButtons.forEach((btn) => {
    if (btn.classList.contains('delay-btn')) return;
    if (btn.classList.contains('scale-btn')) return;

    btn.addEventListener("click", async () => {
      const newLimit = parseInt(btn.dataset.limit, 10);
      if (isNaN(newLimit)) return;

      try {
        const { tabLimit } = await window.chrome.storage.sync.get("tabLimit");
        const currentLimit = tabLimit !== undefined ? tabLimit : 0;

        if (newLimit === currentLimit) return;

        const effectiveCurrent = currentLimit === 0 ? 9999 : currentLimit;
        const effectiveNew = newLimit === 0 ? 9999 : newLimit;

        if (effectiveNew < effectiveCurrent) {
          await window.chrome.storage.sync.set({ tabLimit: newLimit });
          await window.chrome.storage.sync.remove("pendingIncrease");
          updateLimiterUI();

          if (newLimit !== 0) {
            const tabCount = await getTabCount();
            if (tabCount > newLimit) {
              await sendToBackground({ action: "enforceLimit" });
            }
          }
        } else {
          const startTime = Date.now();
          await window.chrome.storage.sync.set({ pendingIncrease: { targetLimit: newLimit, startTime: startTime } });
          await sendToBackground({ action: "startIncrease", targetLimit: newLimit, startTime: startTime });
          updateLimiterUI();
        }
      } catch (error) { }
    });
  });

  const methodRadios = document.querySelectorAll('input[name="management-method"]');
  methodRadios.forEach((radio) => {
    radio.addEventListener("change", async (event) => {
      const method = event.target.value;
      if (method) { await window.chrome.storage.sync.set({ managementMethod: method }); updateLimiterUI(); }
    });
  });

  const cancelIncreaseBtn = document.getElementById("cancel-increase");
  if (cancelIncreaseBtn) cancelIncreaseBtn.addEventListener("click", async () => {
    await window.chrome.storage.sync.remove("pendingIncrease");
    await sendToBackground({ action: "cancelIncrease" });
    updateLimiterUI();
  });
}

// R-011: there is no longer a "no pending increase" element to reveal. The
// panel says nothing when there is nothing to say, and the queued value is
// marked on the chooser itself instead of in a section of its own.
function updatePendingDisplay(pendingIncrease) {
  const pendingBox = document.getElementById("limiter-pending-box");
  if (!pendingBox) return;

  if (pendingIncrease && pendingIncrease.targetLimit !== undefined && pendingIncrease.startTime) {
    const elapsed = Date.now() - pendingIncrease.startTime;
    const remaining = Math.max(0, (30 * 60 * 1000) - elapsed);

    if (remaining > 0) {
      pendingBox.style.display = "block";

      const targetElement = document.getElementById("pending-target");
      const timeElement = document.getElementById("time-remaining");

      if (targetElement) targetElement.textContent = (pendingIncrease.targetLimit === 0) ? "Off" : pendingIncrease.targetLimit;
      if (timeElement) timeElement.textContent = formatTimeRemaining(remaining);
      return;
    }
  }
  pendingBox.style.display = "none";
}
