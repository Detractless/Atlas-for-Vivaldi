// ============================================================================
// SERVICE WORKER ENTRY
// Loads shared engine config + background modules so all chrome.*
// event listeners are registered during initial worker evaluation (MV3 requirement).
// ============================================================================

// Shared engine catalogue + parsing rules (single source of truth).
// These are consumed indirectly via the background modules that import them.
import '../constants/engines.js';
// URL-matching helpers for the parser rules defined in engines.js.
import '../utils/searchParsers.js';

// Background modules — order: state → url helpers → features → event listeners → lifecycle.
import './workerState.js';
import './searchUrl.js';
import './tabLimiter.js';
import './searchInterception.js';
import './pendingChanges.js';
import './messaging.js';
import './removerController.js';
import './stateSync.js';

// Pastekit modules — snippet message hub, install seeding, side-panel
// action behavior, and the "Save to Pastekit" context menu. Pastekit
// dispatches on msg.type, Detractless on message.action/message.path,
// so the two onMessage listeners coexist.
import { initMessageHub } from '../pastekit/services/messageHub.js';
import { initInstall } from '../pastekit/services/install.js';
import { initAction } from '../pastekit/services/action.js';
import { initClipMenu } from '../pastekit/services/clip.js';

initMessageHub();
initInstall();
initAction();
initClipMenu();
