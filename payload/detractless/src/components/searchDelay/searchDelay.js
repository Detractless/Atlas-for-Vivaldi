import { formatTimeRemaining } from '../../utils/formatDuration.js';
import { loadDelaySettings, getDelaySeconds, saveDelaySeconds, clearPendingDecrease, savePendingDecrease, getPendingDecrease } from '../../services/delayStorage.js';
import { sendToBackground } from '../../services/backgroundMessenger.js';
import {
  searchDelaySeconds, setSearchDelaySeconds,
  delayUpdateInterval, setDelayUpdateInterval
} from '../../pages/newtab/newtabState.js';

export function initializeSearchDelaySettings() {
  const delayButtons = document.querySelectorAll('.delay-btn');
  const showQueryCheck = document.getElementById('show-query-checkbox');

  loadDelaySettings().then(res => {
    setSearchDelaySeconds(res.searchDelaySeconds !== undefined ? res.searchDelaySeconds : 0);
    if (showQueryCheck) showQueryCheck.checked = res.showQueryOnDelay !== undefined ? res.showQueryOnDelay : true;
    updateDelayPendingUI();
  });

  delayButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const newDelay = parseInt(e.target.dataset.value);
      const currentDelay = await getDelaySeconds();
      const actualCurrent = currentDelay !== undefined ? currentDelay : 0;

      if (newDelay === actualCurrent) return;

      if (newDelay > actualCurrent) {
        await saveDelaySeconds(newDelay);
        await clearPendingDecrease();
        setSearchDelaySeconds(newDelay);
        await sendToBackground({ action: "updateSearchDelay", delaySeconds: newDelay });
        updateDelayPendingUI();
      } else if (newDelay < actualCurrent) {
        const startTime = Date.now();
        await savePendingDecrease(newDelay, startTime);
        await sendToBackground({ action: "startDelayDecrease" });
        updateDelayPendingUI();
      }
    });
  });

  const cancelBtn = document.getElementById('cancel-delay-decrease');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      await clearPendingDecrease();
      await sendToBackground({ action: "cancelDelayDecrease" });
      updateDelayPendingUI();
    });
  }

  if (delayUpdateInterval) clearInterval(delayUpdateInterval);
  setDelayUpdateInterval(setInterval(updateDelayPendingUI, 1000));

  if (showQueryCheck) {
    showQueryCheck.addEventListener('change', () => {
      window.chrome.storage.sync.set({ showQueryOnDelay: showQueryCheck.checked });
    });
  }
}

export async function updateDelayPendingUI() {
  // R-011: no "no pending changes" element and no current-value readout. The
  // lit pill states the delay, and a queued value is marked on the chooser.
  const box = document.getElementById('delay-pending-box');
  const targetSpan = document.getElementById('delay-target-time');
  const timeSpan = document.getElementById('delay-time-remaining');
  const delayButtons = document.querySelectorAll('.delay-btn');

  const pendingDelayDecrease = await getPendingDecrease();

  delayButtons.forEach(btn => {
    const val = parseInt(btn.dataset.value);
    btn.classList.remove('active', 'pending');
    if (val === searchDelaySeconds) btn.classList.add('active');
  });

  if (pendingDelayDecrease && pendingDelayDecrease.startTime) {
    const elapsed = Date.now() - pendingDelayDecrease.startTime;
    const remaining = Math.max(0, (30 * 60 * 1000) - elapsed);

    if (remaining > 0) {
      if (box) box.style.display = 'block';
      if (targetSpan) targetSpan.textContent = pendingDelayDecrease.targetDelay + 's';
      if (timeSpan) timeSpan.textContent = formatTimeRemaining(remaining);

      delayButtons.forEach(btn => {
        if (parseInt(btn.dataset.value) === pendingDelayDecrease.targetDelay) {
          btn.classList.add('pending');
        }
      });
      return;
    }
  }
  if (box) box.style.display = 'none';
}
