#include "AtlasSequenceCore.h"
#include <assert.h>
#include <stdio.h>
static AtlasSequence s;
static void leader(int code) {
  AtlasSequenceReset(&s);
  assert(AtlasSequenceFeed(&s, 1, true, code, 8) == AtlasPass);
  assert(AtlasSequenceFeed(&s, 1.03, false, code, 0) == AtlasPass);
}
static int tap(double at, int code) {
  int down = AtlasSequenceFeed(&s, at, true, code, 0);
  int up = AtlasSequenceFeed(&s, at + .03, false, code, 0);
  return down == AtlasCapture ? up : AtlasPass;
}
int main(void) {
  int assertions = 0;
  int keys[] = {49, 51, 117, 123, 124, 43, 47};
  int wanted[] = {AtlasNewTab, AtlasCloseTab, AtlasCloseTab, AtlasTabPrev, AtlasTabNext,
                  AtlasGoBack, AtlasGoForward};
  for(int cmd = 54; cmd <= 55; cmd++) for(int n = 0; n < 7; n++) {
    leader(cmd); assert(tap(1.1, keys[n]) == AtlasCapture);
    assert(tap(1.2, keys[n]) == wanted[n]); assertions += 2;
    assert(tap(1.3, keys[n]) == AtlasPass); assertions++;
  }
  AtlasSequenceReset(&s); assert(tap(1, 49) == AtlasPass); assertions++;
  leader(55); assert(tap(3.01, 49) == AtlasPass); assertions++;
  leader(55); assert(tap(2.9, 49) == AtlasCapture);
  assert(tap(4.8, 49) == AtlasNewTab); assertions += 2;
  leader(55); tap(1.1, 51); assert(tap(3.11, 51) == AtlasPass); assertions++;
  leader(55); tap(1.1, 49); assert(tap(1.2, 51) == AtlasPass); assertions++;
  /* Left and right arrows are separate targets: one of each never completes. */
  leader(55); tap(1.1, 123); assert(tap(1.2, 124) == AtlasPass); assertions++;
  leader(55); tap(1.1, 124); assert(tap(1.2, 123) == AtlasPass); assertions++;
  leader(55); tap(1.1, 123); assert(tap(1.2, 49) == AtlasPass); assertions++;
  /* Comma and period are separate targets: back then forward never completes. */
  leader(55); tap(1.1, 43); assert(tap(1.2, 47) == AtlasPass); assertions++;
  leader(55); tap(1.1, 47); assert(tap(1.2, 43) == AtlasPass); assertions++;
  leader(55); tap(1.1, 43); assert(tap(1.2, 123) == AtlasPass); assertions++;
  /* Shift+comma ('<') and Command chords are not captured. */
  leader(55); assert(AtlasSequenceFeed(&s, 1.1, true, 43, 1) == AtlasPass); assertions++;
  /* An arrow with a modifier held (Shift+Left selects text) is never captured. */
  leader(55); assert(AtlasSequenceFeed(&s, 1.1, true, 123, 1) == AtlasPass); assertions++;
  /* Arrows without a Command leader pass straight through. */
  AtlasSequenceReset(&s); assert(tap(1, 123) == AtlasPass); assert(tap(1.1, 123) == AtlasPass); assertions += 2;
  /* The arrow target window is two seconds, as for Space and Delete. */
  leader(55); assert(tap(3.01, 124) == AtlasPass); assertions++;
  leader(55); tap(1.1, 124); assert(tap(3.11, 124) == AtlasPass); assertions++;
  leader(55); AtlasSequenceFeed(&s, 1.1, true, 0, 0);
  assert(tap(1.2, 49) == AtlasPass); assertions++;
  leader(55); AtlasSequenceFeed(&s, 1.1, true, 49, 2);
  assert(tap(1.2, 49) == AtlasPass); assertions++;
  /* Both Command keys held together cannot arm the parser. */
  AtlasSequenceReset(&s); AtlasSequenceFeed(&s, 1, true, 55, 8);
  AtlasSequenceFeed(&s, 1.01, true, 54, 8); AtlasSequenceFeed(&s, 1.02, false, 54, 8);
  AtlasSequenceFeed(&s, 1.03, false, 55, 0); assert(tap(1.2, 49) == AtlasPass); assertions++;
  /* Native parser must not arm Space/Delete after a focus-toggle double tap. */
  leader(55); AtlasSequenceFeed(&s, 1.1, true, 54, 8);
  AtlasSequenceFeed(&s, 1.13, false, 54, 0); assert(tap(1.2, 49) == AtlasPass); assertions++;
  /* A chord invalidates its Command release. */
  AtlasSequenceReset(&s); AtlasSequenceFeed(&s, 1, true, 55, 8);
  AtlasSequenceFeed(&s, 1.01, true, 0, 8); AtlasSequenceFeed(&s, 1.03, false, 55, 0);
  assert(tap(1.2, 51) == AtlasPass); assertions++;
  /* Canceled and long-held captured keys cannot execute a delayed action. */
  leader(55); tap(1.1, 49); AtlasSequenceReset(&s);
  assert(tap(1.2, 49) == AtlasPass); assertions++;
  leader(55); AtlasSequenceFeed(&s, 1.1, true, 49, 0);
  assert(AtlasSequenceFeed(&s, 3.2, false, 49, 0) == AtlasPass); assertions++;
  puts("Native sequence core checks passed"); printf("%d behavior assertions plus leader checks\n", assertions);
}
