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
import './state/workerState.js';
import './search/searchUrl.js';
import './limits/tabLimiter.js';
import './search/searchInterception.js';
import './social/socialBlock.js';
import './limits/pendingChanges.js';
import './messaging.js';
import './state/stateSync.js';
// PasteKit and the Element Remover were archived with the Tools sidebar
// (_old/archive/tools-runtime/RESTORE.md); this tidies what they left behind.
import './archivedCleanup.js';
