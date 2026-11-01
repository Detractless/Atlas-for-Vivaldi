#ifndef ATLAS_NATIVE_EVENTS_H
#define ATLAS_NATIVE_EVENTS_H
#include <stdbool.h>
#include <stdint.h>
/* Vivaldi can forward one AppKit event through the local monitor twice.
   Skip duplicate state transitions, preserving the first routing decision. */
typedef struct {
  double timestamp;
  uint64_t flags;
  int type, code, window;
  bool valid, consumed;
} AtlasNativeEvent;
typedef struct { AtlasNativeEvent entries[16]; unsigned next; } AtlasEventCache;
static inline int AtlasEventFind(AtlasEventCache *cache, AtlasNativeEvent e) {
  for(int n = 0; n < 16; n++) {
    AtlasNativeEvent p = cache->entries[n];
    if(p.valid && p.timestamp == e.timestamp && p.type == e.type && p.code == e.code &&
       p.flags == e.flags && p.window == e.window) return n;
  }
  return -1;
}
static inline int AtlasEventRemember(AtlasEventCache *cache, AtlasNativeEvent e) {
  unsigned slot = cache->next++ % 16;
  e.valid = true; cache->entries[slot] = e; return (int)slot;
}
/* Device-dependent flag bits from macOS IOLLEvent.h, not a toggle inferred
   from callback count. A duplicate down must remain a down. */
enum { AtlasLeftCommandMask = 0x08, AtlasRightCommandMask = 0x10 };
static inline bool AtlasNativeCommandDown(uint64_t flags, int code) {
  return (flags & (code == 54 ? AtlasRightCommandMask : AtlasLeftCommandMask)) != 0;
}
#endif
