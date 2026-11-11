// src/services/tab-saver/index.js — keep the URL of every tab the limiter takes away.
//
// THE PROBLEM. The tab limiter closes tabs to keep the count down, and a tab held
// open is how people park something interesting they have not finished with. So
// the limiter's whole job is to destroy the thing the user was using it to store.
//
// URL LEVEL ONLY, deliberately. An earlier sketch archived full page state so a
// saved tab could be read without the site. That was dropped on the user's own
// reasoning: leaving a tab open does not preserve page state across a restart
// either, so archiving solves a problem nobody actually has, while costing the
// pageCapture permission and megabytes per page. A URL, title and favicon is
// exactly what an open tab was really storing.
//
// SAVED IN GROUPS (R-022), not as loose rows, because a set of tabs closed
// together is one thing you were doing rather than N unrelated addresses. That
// raised the only hard question here: the limiter closes tabs UNATTENDED, often
// one at a time, so a group per close would produce a pile of one-tab groups,
// which is worse than the flat list groups replaced. So the two paths differ:
//
//   MANUAL   save-and-clear makes ONE group and then offers a description.
//   AUTOMATIC limiter closes accumulate into a ROLLING GROUP PER DAY and never
//            prompt, because there is nobody there to answer.
//
// The pure helpers are separated out because everything else needs
// chrome.storage, and the decisions worth testing are which tabs get saved, how
// duplicates collapse, and which group an automatic save lands in.


export {
  shouldSaveTab,
  dayKey,
  addTabsToGroups,
  nextSeq,
  ensureSeq,
  pruneEmptyGroups,
  groupMatches,
  applyTabEdit,
} from './saved-tab-groups.js';
export {
  saveClosingTabs,
  listSavedGroups,
  removeSavedTab,
  updateSavedTab,
  removeSavedGroup,
  setGroupDescription,
} from './saved-tab-storage.js';
export {
  classifyOpenTabs,
  defaultSelection,
  planSaveAndClose,
  NEW_TAB_URL,
  listOpenTabCandidates,
  saveAndCloseSelected,
} from './open-tab-selection.js';
