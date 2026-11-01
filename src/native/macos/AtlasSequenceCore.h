#ifndef ATLAS_SEQUENCE_CORE_H
#define ATLAS_SEQUENCE_CORE_H
#include <stdbool.h>
#include <string.h>
/* Times are monotonic seconds. Native key codes: left/right Cmd 55/54,
   Space 49, Backspace 51, forward Delete 117, Left arrow 123, Right arrow 124,
   comma 43, period 47. */
enum { AtlasPass, AtlasCapture, AtlasNewTab, AtlasCloseTab, AtlasTabPrev, AtlasTabNext,
       AtlasGoBack, AtlasGoForward };
typedef struct {
  double commandAt, previousTap, leaderUntil, targetUntil;
  int commandCode, firstKind, heldCode;
} AtlasSequence;
static inline void AtlasSequenceReset(AtlasSequence *s) {
  memset(s, 0, sizeof(*s));
  s->commandAt = s->previousTap = -1;
  s->commandCode = s->heldCode = -1;
}
static inline int AtlasSequenceKind(int code) {
  switch (code) {
    case 49: return 1;
    case 51: case 117: return 2;
    case 123: return 3;
    case 124: return 4;
    case 43: return 5;
    case 47: return 6;
    default: return 0;
  }
}
static inline int AtlasSequenceFeed(AtlasSequence *s, double now, bool down,
                                   int code, unsigned modifiers) {
  if (code == 54 || code == 55) {
    if (down) {
      double previous = s->previousTap;
      bool valid = modifiers == 8 && s->commandCode == -1;
      AtlasSequenceReset(s);
      if (valid) {
        s->commandAt = now; s->commandCode = code; s->previousTap = previous;
      }
    } else {
      double at = s->commandAt, previous = s->previousTap;
      bool valid = s->commandCode == code && modifiers == 0 && now >= at && now - at <= 2;
      AtlasSequenceReset(s);
      if (!valid) return AtlasPass;
      bool shortTap = now - at <= .45;
      bool doubleTap = shortTap && previous >= 0 && at >= previous && at - previous <= .45;
      if (!doubleTap) {
        s->leaderUntil = at + 2;
        s->previousTap = shortTap ? at : -1;
      }
    }
    return AtlasPass;
  }
  int kind = AtlasSequenceKind(code);
  double deadline = s->firstKind || s->heldCode != -1 ? s->targetUntil : s->leaderUntil;
  if (!kind || modifiers || s->commandCode != -1 || deadline <= 0 || now > deadline) {
    AtlasSequenceReset(s); return AtlasPass;
  }
  if (down) {
    if (s->heldCode != -1 || (s->firstKind && s->firstKind != kind)) {
      AtlasSequenceReset(s); return AtlasPass;
    }
    if (!s->firstKind) s->targetUntil = now + 2;
    s->heldCode = code; s->previousTap = -1;
    return AtlasCapture;
  }
  if (s->heldCode != code) { AtlasSequenceReset(s); return AtlasPass; }
  s->heldCode = -1;
  if (!s->firstKind) { s->firstKind = kind; return AtlasCapture; }
  AtlasSequenceReset(s);
  switch (kind) {
    case 1: return AtlasNewTab;
    case 2: return AtlasCloseTab;
    case 3: return AtlasTabPrev;
    case 4: return AtlasTabNext;
    case 5: return AtlasGoBack;
    default: return AtlasGoForward;
  }
}
#endif
