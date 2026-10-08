import { generateExportData } from '../../services/dataExport.js';
import { persistImportData } from '../../services/dataImport.js';
import { packageArchive, isDetractlessFile, openArchive } from '../../services/detractlessFormat.js';
import { buildExport, importJson } from '../../services/snippetBackup.js';
import { refreshBookmarkCache } from '../../components/bookmarks/bookmarkCache.js';
import {
  activeTabs,
  setActiveTabs, setSearchEngines, setDefaultEngineKey, setCurrentEngine,
  setAppThemeConfig, setFadeInEnabled, setSpotlightVisible, setSearchEngineBehavior, setBookmarkPillBehavior
} from './newtabState.js';

let _onImportComplete = null;
export function setImportCompleteCallback(cb) { _onImportComplete = cb; }

export async function applyImportData(importData) {
  await persistImportData(importData);
  await refreshBookmarkCache();

  if (importData.activeTabs) setActiveTabs(importData.activeTabs);
  if (importData.customSearchEngines) setSearchEngines(importData.customSearchEngines);
  if (importData.defaultEngineKey) setDefaultEngineKey(importData.defaultEngineKey);
  if (importData.selectedSearchEngine) setCurrentEngine(importData.selectedSearchEngine);
  if (importData.Theme) setAppThemeConfig(importData.Theme);
  if (importData.fadeInEnabled !== undefined) setFadeInEnabled(importData.fadeInEnabled);
  if (importData.spotlightVisible !== undefined) setSpotlightVisible(importData.spotlightVisible);
  if (importData.searchEngineBehavior !== undefined) setSearchEngineBehavior(importData.searchEngineBehavior);
  if (importData.bookmarkPillBehavior !== undefined) setBookmarkPillBehavior(importData.bookmarkPillBehavior);

  if (_onImportComplete) await _onImportComplete(importData);
}

/**
 * Apply an already-sniffed .detractless ZIP buffer.
 *
 * The single entry point for applying an archive. A v2 archive may legitimately
 * carry no `newtab/` namespace (it came from the phone), so an absent config is
 * normal, not an error — the returned flags let the caller say what actually
 * applied instead of claiming a full restore.
 */
export async function applyArchiveBuffer(buffer) {
  const { layout, detractlessConfig, pastekitData } = await openArchive(buffer);

  let appliedConfig = false;
  if (detractlessConfig) {
    await applyImportData(detractlessConfig);
    appliedConfig = true;
  }

  let appliedSnippets = false;
  if (pastekitData) {
    await importJson({ format: 'pastekit-snippets', version: 1, ...pastekitData }, 'replace');
    appliedSnippets = true;
  }

  return { layout, appliedConfig, appliedSnippets };
}

/** Human-readable summary of an applyArchiveBuffer() result. */
export function describeApplied({ appliedConfig, appliedSnippets }) {
  const parts = [];
  if (appliedConfig) parts.push('bookmarks and settings');
  if (appliedSnippets) parts.push('snippets');
  return parts.length ? parts.join(', ') : '';
}

export async function exportBookmarks() {
  try {
    const [detractlessConfig, pastekitExport] = await Promise.all([
      generateExportData(activeTabs),
      buildExport(),
    ]);
    const archive = await packageArchive({ detractlessConfig, pastekitExport });
    const dateStr = new Date().toISOString().split('T')[0];
    const blob = new Blob([archive], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${dateStr}.detractless`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    // "Error exporting data." over a locked store sends the user hunting for a
    // fault that isn't there. Locked is a state with an obvious remedy, so say it.
    alert(error && error.locked
      ? 'Your snippets are locked. Unlock them first — click "Locked" at the top of the page — then export again.'
      : 'Error exporting data.');
  }
}

export async function importBookmarks(event) {
  const file = event.target.files[0]; if (!file) return;

  // Disable the import button and show a loading label so the UI does not
  // appear frozen during the synchronous ZIP decompression step.
  const importBtn = document.getElementById('import-btn');
  const originalLabel = importBtn ? importBtn.textContent : null;
  if (importBtn) { importBtn.disabled = true; importBtn.textContent = 'Importing\u2026'; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    let pendingAlert = null;
    try {
      // Yield one event-loop tick so the "Importing…" label renders before the
      // blocking unzipSync call locks the thread.
      await new Promise((r) => setTimeout(r, 0));
      pendingAlert = await applyImportFile(file, /** @type {ArrayBuffer} */ (e.target.result));
    } catch (error) {
      console.error(error);
      pendingAlert = 'Error importing file. Please ensure it is a valid Detractless export.';
    } finally {
      if (importBtn) { importBtn.disabled = false; importBtn.textContent = originalLabel; }
      if (pendingAlert) {
        const msg = pendingAlert;
        setTimeout(() => showImportToast(msg), 50);
      }
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

/** Apply one imported file; returns the message to show the user. */
async function applyImportFile(file, buffer) {
  let applied = null;
  if (isDetractlessFile(buffer)) {
    // A .detractless archive: v2 namespaced, or v1 from either app.
    applied = await applyArchiveBuffer(buffer);
  } else if (file.name.endsWith('.pastekit')) {
    // Standalone PasteKit export — snippets only
    const pastekitData = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer)));
    await importJson(pastekitData, 'replace');
    return 'Import successful! Snippets restored.';
  } else {
    // Legacy .detractless.json format — keep working forever
    const importData = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer)));
    await applyImportData(importData);
  }

  if (applied && !applied.appliedConfig && !applied.appliedSnippets) {
    return 'That archive was read successfully but contained no recognisable data — nothing was changed.\n\n' +
      'If you created or modified this file outside of Detractless (e.g. with a ZIP tool on Windows), ' +
      'make sure it was re-zipped with a tool that stores paths using forward slashes. ' +
      'Some tools, like PowerShell\u2019s Compress-Archive, use backslashes internally, ' +
      'which prevents Detractless from finding the files inside.';
  }
  if (applied) return `Import successful! Restored ${describeApplied(applied)}.`;
  return 'Import successful! Bookmarks, settings, and snippets restored.';
}

/** A short status toast at the bottom of the page (red for errors). */
function showImportToast(msg) {
  const isError = msg.toLowerCase().startsWith('error');
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.setAttribute('role', 'status');
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', left: '50%',
    transform: 'translateX(-50%)',
    background: isError ? '#b91c1c' : '#166534',
    color: '#fff', padding: '10px 20px',
    borderRadius: '8px', fontSize: '14px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: '999999', maxWidth: '480px',
    textAlign: 'center', lineHeight: '1.4',
    opacity: '0', transition: 'opacity 0.2s ease',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, isError ? 6000 : 3500);
}

export function downloadExampleExport() {
  const exampleData = {
    page1: { SOCIAL: [{ name: "Twitter", url: "https://twitter.com" }, { name: "Instagram", url: "https://instagram.com" }] },
    activeTabs: [{ id: 'search', label: 'HOME', type: 'search' }, { id: 1, label: 'PAGE 1', type: 'bookmarks' }]
  };
  const dateStr = new Date().toISOString().split('T')[0];
  const blob = new Blob([JSON.stringify(exampleData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${dateStr}.detractless-example.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
