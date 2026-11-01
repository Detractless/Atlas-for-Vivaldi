#include "AtlasSequenceCore.h"
#include "AtlasNativeEvents.h"
#include <assert.h>
#include <stdio.h>
static const AtlasNativeEvent fixture[] = {
#include "duplicate_events.inc"
};
static int replay(bool deduplicate) {
  AtlasSequence s; AtlasSequenceReset(&s);
  AtlasEventCache cache = {0}; bool swallowed[128] = {0}; unsigned held = 0;
  int actions = 0;
  for(unsigned n=0; n<sizeof(fixture)/sizeof(fixture[0]); n++) {
    AtlasNativeEvent e = fixture[n];
    if(deduplicate && AtlasEventFind(&cache,e)>=0) continue;
    AtlasEventRemember(&cache,e);
    bool down = e.type == 10, captured = e.code>=0 && e.code<128 && swallowed[e.code];
    if(e.type == 10 && captured) continue;
    if(e.type == 12) {
      unsigned bit = e.code == 54 ? 1 : 2;
      down = deduplicate ? AtlasNativeCommandDown(e.flags,e.code) : (e.flags & (1<<20)) && !(held&bit);
      if(down) held|=bit; else held&=~bit;
    }
    unsigned mods=(e.flags & (1<<20)) ? 8 : 0;
    int result=AtlasSequenceFeed(&s,e.timestamp,down,e.code,mods);
    if(e.type == 10 && result == AtlasCapture) swallowed[e.code] = true;
    if(e.type == 11 && captured) swallowed[e.code] = false;
    if(result == AtlasNewTab || result == AtlasCloseTab) actions++;
  }
  return actions;
}
int main(void) {
  int broken=replay(false),fixed=replay(true);
  printf("Recorded native-event replay: old adapter=%d actions; fixed adapter=%d actions\n",broken,fixed);
  assert(broken == 0); assert(fixed == 2);
  /* Exact repeats match; a new physical event, release or different window does not. */
  AtlasEventCache cache={0}; AtlasNativeEvent e={1,1048848,12,54,1,true,false};
  assert(AtlasEventFind(&cache,e)==-1);int slot=AtlasEventRemember(&cache,e);
  cache.entries[slot].consumed=true;assert(AtlasEventFind(&cache,e)==slot);
  e.timestamp=1.1;assert(AtlasEventFind(&cache,e)==-1);e.timestamp=1;e.window=2;
  assert(AtlasEventFind(&cache,e)==-1);e.window=1;e.type=11;assert(AtlasEventFind(&cache,e)==-1);
  assert(AtlasNativeCommandDown(1048848,54));assert(!AtlasNativeCommandDown(256,54));
  assert(AtlasNativeCommandDown(1048840,55));assert(!AtlasNativeCommandDown(256,55));
  puts("Duplicate-delivery regression checks passed");
}
