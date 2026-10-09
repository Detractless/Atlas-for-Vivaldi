// src/utils/addBookmarkFlow.js — the four answers behind adding a bookmark.
//
// Lives in utils for the same reason as pillSelection.js: pure state, no DOM.
// The add popup (components/addPopup) checks its bookmark answers with it.
//
// WHY A REDUCER AND NOT FOUR VARIABLES. The flow got Back buttons (R-021 pass),
// and Back has to restore what you already typed. Module-level `let`s could hold
// that, but nothing could test it, and the previous incarnation of this flow had
// exactly the bug that state-in-widgets produces: it read the chosen group out of
// a <select>.value, so the answer lived in the thing displaying it.
//
// NOTHING IS WRITTEN UNTIL THE END. Each step used to be able to commit on its
// own; with Escape now cancelling the whole flow, a per-step write would leave a
// half-made bookmark, or worse a new group, behind. The reducer accumulates and
// the caller writes once.
//
// NO STEP COUNTER, deliberately. The wizard this replaces showed "Step 2 of 4"
// over a conditional step, so the number was wrong whenever an existing group was
// chosen. Sequencing was never the problem; lying about progress was.

/** Order matters: page precedes group, per R-017. A group is a key inside a page. */
export const STEPS = ['name', 'url', 'page', 'group'];

/** Sentinel for "create a new group", kept off the namespace of real group names. */
export const NEW_GROUP = 'new-group ';

/**
 * @param {number|string|null} defaultPage the page the user is looking at, which
 *   is always a valid answer and so is never null in practice.
 */
export function createFlowState(defaultPage = null) {
  return {
    stepIndex: 0,
    name: '',
    url: '',
    page: defaultPage,
    group: null,
    newGroupName: '',
  };
}

export function currentStep(state) {
  return STEPS[state.stepIndex] || null;
}

export function isFirstStep(state) {
  return state.stepIndex <= 0;
}

export function isComplete(state) {
  return state.stepIndex >= STEPS.length;
}

/**
 * Record an answer. Returns a NEW state; the caller's object is never mutated,
 * so a cancelled flow cannot leave edits behind in a shared object.
 *
 * Changing the page CLEARS the group, because the groups on offer belong to the
 * page (R-017). Keeping a group from a different page is how the old
 * name-to-page map silently picked the wrong one when two pages shared a group
 * name.
 */
export function setValue(state, key, value) {
  const next = { ...state, [key]: value };
  if (key === 'page' && String(value) !== String(state.page)) {
    next.group = null;
    next.newGroupName = '';
  }
  if (key === 'group' && value !== NEW_GROUP) {
    next.newGroupName = '';
  }
  return next;
}

export function goNext(state) {
  return { ...state, stepIndex: Math.min(state.stepIndex + 1, STEPS.length) };
}

export function goBack(state) {
  return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) };
}

/**
 * Why the current step cannot be accepted, or null when it can.
 * Mirrors the validation the single-card form used to run on submit, moved to
 * the step that actually collects each value so the message lands where the user
 * can act on it.
 */
export function validateStep(state, step = currentStep(state)) {
  switch (step) {
    case 'name':
      return state.name.trim() ? null : 'Give the bookmark a name.';
    case 'url':
      return state.url.trim() ? null : 'Give the bookmark a URL.';
    case 'page':
      return (state.page === null || state.page === undefined) ? 'Choose a page.' : null;
    case 'group':
      if (state.group === null) return 'Choose a group.';
      if (state.group === NEW_GROUP && !state.newGroupName.trim()) {
        return 'Give the new group a name.';
      }
      return null;
    default:
      return null;
  }
}

/**
 * The values to write, or an error. Re-validates every step rather than trusting
 * that the walk through them was clean: Back means steps can be revisited in any
 * order, so "we got here" is not proof the earlier answers survived.
 */
export function resolveFlow(state) {
  for (const step of STEPS) {
    const error = validateStep(state, step);
    if (error) return { error };
  }
  const isNew = state.group === NEW_GROUP;
  return {
    name: state.name.trim(),
    url: state.url.trim(),
    group: isNew ? state.newGroupName.trim() : state.group,
    page: state.page,
  };
}
