#import <AppKit/AppKit.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include "AtlasSequenceCore.h"
#include "AtlasNativeEvents.h"
#include <IOKit/hidsystem/IOLLEvent.h>
#include <dlfcn.h>
_Static_assert(AtlasLeftCommandMask == NX_DEVICELCMDKEYMASK, "left Command flag");
_Static_assert(AtlasRightCommandMask == NX_DEVICERCMDKEYMASK, "right Command flag");

static AtlasSequence sequence;
static bool swallowed[128];
static AtlasEventCache eventCache;
static unsigned long duplicates;
static id monitor;
static NSMutableArray *observers;
static __weak NSWindow *owner;
static __weak NSMenuItem *activityItem, *newItem, *closeItem, *prevItem, *nextItem, *backItem, *forwardItem;
static unsigned long capturedDown, capturedUp, starts, newActions, closeActions, prevActions, nextActions, backActions, forwardActions;
static bool bridgeReady;
static const char *statsPath;

static void WriteStats(void) {
  if (!statsPath) return;
  NSDictionary *stats = @{@"pid": @(getpid()), @"installed": @(monitor != nil),
    @"bridgeReady": @(bridgeReady), @"capturedDown": @(capturedDown),
    @"capturedUp": @(capturedUp), @"sequencesStarted": @(starts), @"duplicatesIgnored": @(duplicates),
    @"newActions": @(newActions), @"closeActions": @(closeActions),
    @"prevActions": @(prevActions), @"nextActions": @(nextActions),
    @"backActions": @(backActions), @"forwardActions": @(forwardActions),
    @"windowClass": owner ? NSStringFromClass(owner.class) : @"none"};
  NSData *data = [NSJSONSerialization dataWithJSONObject:stats options:0 error:nil];
  int fd = open(statsPath, O_WRONLY|O_CREAT|O_TRUNC|O_NOFOLLOW, 0600);
  if(fd >= 0){ (void)write(fd, data.bytes, data.length); close(fd); }
}
static void Cancel(void) {
  AtlasSequenceReset(&sequence); owner = nil;
  // Keep swallowed bits until key-up, even if focus changed mid-press.
}
static NSMenuItem *FindItem(NSMenu *menu, NSString *title) {
  for(NSMenuItem *item in menu.itemArray) {
    if([item.title isEqualToString:title]) return item;
    if(item.submenu) { NSMenuItem *found = FindItem(item.submenu, title); if(found) return found; }
  }
  return nil;
}
static bool Attached(NSMenuItem *item) {
  NSMenu *menu = item.menu;
  while(menu && menu != NSApp.mainMenu) menu = menu.supermenu;
  return item && menu && item.action && item.target;
}
static bool RefreshBridge(void) {
  if(!Attached(activityItem)) activityItem = FindItem(NSApp.mainMenu, @"__AtlasSequenceActivity_v1__");
  if(!Attached(newItem)) newItem = FindItem(NSApp.mainMenu, @"__AtlasSequenceNewTab_v1__");
  if(!Attached(closeItem)) closeItem = FindItem(NSApp.mainMenu, @"__AtlasSequenceCloseTab_v1__");
  if(!Attached(prevItem)) prevItem = FindItem(NSApp.mainMenu, @"__AtlasSequenceTabPrev_v1__");
  if(!Attached(nextItem)) nextItem = FindItem(NSApp.mainMenu, @"__AtlasSequenceTabNext_v1__");
  if(!Attached(backItem)) backItem = FindItem(NSApp.mainMenu, @"__AtlasSequenceNavBack_v1__");
  if(!Attached(forwardItem)) forwardItem = FindItem(NSApp.mainMenu, @"__AtlasSequenceNavForward_v1__");
  bridgeReady = Attached(activityItem) && Attached(newItem) && Attached(closeItem) &&
    Attached(prevItem) && Attached(nextItem) && Attached(backItem) && Attached(forwardItem);
  return bridgeReady;
}
static bool BrowserWindow(NSEvent *event) {
  NSWindow *key = NSApp.keyWindow;
  return NSApp.active && key && key == NSApp.mainWindow &&
    ![key isKindOfClass:NSPanel.class] && !key.sheetParent && !key.attachedSheet &&
    !NSApp.modalWindow && (!event.window || event.window == key);
}
static bool Dispatch(NSMenuItem *item) {
  if(!owner || owner != NSApp.keyWindow || !Attached(item)) { Cancel(); return false; }
  return [NSApp sendAction:item.action to:item.target from:item];
}
static unsigned Modifiers(NSEventModifierFlags f) {
  return ((f & NSEventModifierFlagShift) ? 1 : 0) |
    ((f & NSEventModifierFlagControl) ? 2 : 0) |
    ((f & NSEventModifierFlagOption) ? 4 : 0) |
    ((f & NSEventModifierFlagCommand) ? 8 : 0);
}
static NSEvent *Filter(NSEvent *event) {
  if(event.type == NSEventTypeLeftMouseDown || event.type == NSEventTypeRightMouseDown ||
     event.type == NSEventTypeOtherMouseDown) { Cancel(); return event; }
  unsigned code = event.keyCode;
  bool captured = code < 128 && swallowed[code];
  if(!BrowserWindow(event) || (owner && owner != NSApp.keyWindow)) Cancel();
  if(event.type == NSEventTypeKeyDown && captured) return nil; // includes auto-repeat
  if(event.type == NSEventTypeKeyUp && captured) {
    swallowed[code] = false; capturedUp++;
    int result = AtlasSequenceFeed(&sequence, event.timestamp, false, code, Modifiers(event.modifierFlags));
    if(result == AtlasNewTab && Dispatch(newItem)) newActions++;
    if(result == AtlasCloseTab && Dispatch(closeItem)) closeActions++;
    if(result == AtlasTabPrev && Dispatch(prevItem)) prevActions++;
    if(result == AtlasTabNext && Dispatch(nextItem)) nextActions++;
    if(result == AtlasGoBack && Dispatch(backItem)) backActions++;
    if(result == AtlasGoForward && Dispatch(forwardItem)) forwardActions++;
    WriteStats(); return nil;
  }
  if(!BrowserWindow(event)) return event;
  bool down = event.type == NSEventTypeKeyDown;
  if(event.type == NSEventTypeFlagsChanged) {
    if(code != 54 && code != 55) { Cancel(); return event; }
    down = AtlasNativeCommandDown(event.modifierFlags, code);
    if(down) {
      if(!RefreshBridge()) { Cancel(); WriteStats(); return event; }
      owner = NSApp.keyWindow;
    }
  } else if(event.type == NSEventTypeKeyDown && event.isARepeat) return event;
  bool starting = sequence.firstKind == 0 && sequence.heldCode == -1;
  int result = AtlasSequenceFeed(&sequence, event.timestamp, down, code, Modifiers(event.modifierFlags));
  if(result == AtlasCapture && down) {
    if(!owner || !RefreshBridge()) { Cancel(); return event; }
    if(starting && !Dispatch(activityItem)) { Cancel(); return event; }
    if(starting) starts++;
    swallowed[code] = true; capturedDown++; WriteStats(); return nil;
  }
  if(code == 54 || code == 55) WriteStats();
  return event;
}
static NSEvent *Route(NSEvent *event) {
  if(event.type != NSEventTypeKeyDown && event.type != NSEventTypeKeyUp &&
     event.type != NSEventTypeFlagsChanged) return Filter(event);
  AtlasNativeEvent packet = {event.timestamp, event.modifierFlags, (int)event.type,
    event.keyCode, (int)event.windowNumber, true, false};
  int slot = AtlasEventFind(&eventCache, packet);
  if(slot >= 0) {
    duplicates++; WriteStats();
    return eventCache.entries[slot].consumed ? nil : event;
  }
  slot = AtlasEventRemember(&eventCache, packet);
  NSEvent *routed = Filter(event);
  eventCache.entries[slot].consumed = routed == nil;
  return routed;
}
static void Observe(NSString *name, void (^block)(NSNotification *)) {
  [observers addObject:[NSNotificationCenter.defaultCenter addObserverForName:name
    object:nil queue:nil usingBlock:block]];
}
static void Install(void) {
  NSString *bundle = NSBundle.mainBundle.bundleIdentifier;
  if(![bundle isEqualToString:@"com.vivaldi.Vivaldi"] &&
     ![bundle isEqualToString:@"com.calibro.atlasshortcutprobe"]) return;
  for(NSString *arg in NSProcessInfo.processInfo.arguments) if([arg hasPrefix:@"--type="]) return;
  statsPath = getenv("ATLAS_SHORTCUT_STATS_PATH");
  AtlasSequenceReset(&sequence); observers = [NSMutableArray array];
  NSEventMask mask = NSEventMaskKeyDown|NSEventMaskKeyUp|NSEventMaskFlagsChanged|
    NSEventMaskLeftMouseDown|NSEventMaskRightMouseDown|NSEventMaskOtherMouseDown;
  monitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^NSEvent *(NSEvent *e){return Route(e);}];
  Observe(NSApplicationDidResignActiveNotification, ^(NSNotification *n){(void)n;Cancel();});
  Observe(NSWindowDidResignKeyNotification, ^(NSNotification *n){if(n.object == owner)Cancel();});
  Observe(NSApplicationWillTerminateNotification, ^(NSNotification *n){
    (void)n; if(monitor){[NSEvent removeMonitor:monitor];monitor=nil;} WriteStats();
  });
  WriteStats();
  // One diagnostic snapshot after initial native menu creation, no persistent polling.
  if(statsPath) dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 3*NSEC_PER_SEC),
    dispatch_get_main_queue(),^{RefreshBridge();WriteStats();});
}
/* The loader entry belongs only to this app. Do not inject our AppKit code
   into Chromium renderer/helper children. Preserve unrelated loader entries. */
static void RemoveOwnLoaderEntry(void) {
  const char *value = getenv("DYLD_INSERT_LIBRARIES");
  if(!value) return;
  Dl_info own = {0}; dladdr((const void *)&RemoveOwnLoaderEntry, &own);
  NSString *loaded = own.dli_fname ? @(own.dli_fname) : @"";
  NSMutableArray *keep = [NSMutableArray array];
  for(NSString *entry in [@(value) componentsSeparatedByString:@":"]) {
    if([entry isEqualToString:@"@executable_path/../Frameworks/AtlasShortcuts.dylib"] ||
       [entry isEqualToString:loaded]) continue;
    [keep addObject:entry];
  }
  if(keep.count) setenv("DYLD_INSERT_LIBRARIES", [keep componentsJoinedByString:@":"].UTF8String, 1);
  else unsetenv("DYLD_INSERT_LIBRARIES");
}
__attribute__((constructor)) static void Start(void) {
  @autoreleasepool { RemoveOwnLoaderEntry(); }
  dispatch_async(dispatch_get_main_queue(),^{Install();});
}
