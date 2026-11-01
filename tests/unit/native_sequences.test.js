'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');
function start() {
  const listeners={}, actions=[], queries=[], signals=[], tabs=[]; let time=0, resets=0;
  const event=name=>({addListener:f=>listeners[name]=f, removeListener:()=>{}});
  const chrome={runtime:{lastError:null,getURL:p=>'atlas://'+p,sendMessage:m=>signals.push(m)},
    tabs:{query:(q,cb)=>queries.push({q,cb}),sendMessage:(id,m,cb)=>{signals.push([id,m]);cb();},
      create:o=>actions.push(['new',o]),remove:(id,cb)=>{actions.push(['close',id]);cb();},
      update:(id,o,cb)=>{actions.push(['activate',id,o]);cb();},
      goBack:(id,cb)=>{actions.push(['back',id]);cb();},goForward:(id,cb)=>{actions.push(['forward',id]);cb();},onActivated:event('tab')},
    windows:{onFocusChanged:event('focus')}};
  const Atlas={resetCommandTaps:()=>resets++, resetUiShortcuts:()=>resets++};
  const window={__Atlas:Atlas,vivaldiWindowId:7,vivaldi:{menubar:{onActivated:event('menu')}},addEventListener:(n,f)=>listeners[n]=f};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../../src/modules/31-native-sequences.js','utf8'),{window,chrome,ATLAS_NEWTAB_URL:'atlas://index.html',navigator:{platform:'MacIntel'},performance:{now:()=>time}});
  return {listeners,actions,queries,signals,Atlas,window,advance:()=>time=5000, resets:()=>resets,
    emit:(act,id=7)=>listeners.menu(id,'ATLAS_SEQUENCE_'+act), answer:(id=9)=>{const q=queries.shift();q.cb([{id,windowId:7}]);},
    answerWith:tabs=>{const q=queries.shift();q.cb(tabs);return q.q;}};
}
test('native capture creates exactly one tab in its owner window after checking the original tab',()=>{
  const e=start();e.emit('ACTIVITY');assert.equal(e.resets(),2);e.answer();
  assert.ok(e.signals.some(x=>Array.isArray(x)&&x[1].atlasResetShortcuts));
  e.emit('NEW_TAB');assert.equal(e.actions.length,0);e.answer();
  assert.equal(e.actions.length,1);assert.equal(e.actions[0][0],'new');assert.equal(e.actions[0][1].windowId,7);
  e.emit('NEW_TAB');assert.equal(e.actions.length,1);
});
test('a second tap arriving before the snapshot callback waits and closes only the original tab',()=>{
  const e=start();e.emit('ACTIVITY');e.emit('CLOSE_TAB');assert.equal(e.actions.length,0);
  e.answer(9);e.answer(9);assert.deepEqual(e.actions,[['close',9]]);
});
test('wrong-window events, unprefixed actions and tab changes cannot close a tab',()=>{
  const e=start();e.emit('ACTIVITY',8);e.emit('CLOSE_TAB',8);assert.equal(e.queries.length,0);
  e.emit('CLOSE_TAB');assert.equal(e.queries.length,0);
  e.emit('ACTIVITY');e.answer();e.listeners.tab({windowId:7});e.emit('CLOSE_TAB');assert.equal(e.actions.length,0);
});
test('focus loss, timeout and changed active tab cancel even a queued action',()=>{
  for(const cancel of [e=>e.listeners.focus(8),e=>e.listeners.unload()]){
    const e=start();e.emit('ACTIVITY');e.answer();e.emit('CLOSE_TAB');cancel(e);e.answer();assert.deepEqual(e.actions,[]);
  }
  const e=start();e.emit('ACTIVITY');e.answer();e.advance();e.emit('CLOSE_TAB');assert.equal(e.actions.length,0);
  const changed=start();changed.emit('ACTIVITY');changed.answer();changed.emit('CLOSE_TAB');changed.answer(10);assert.equal(changed.actions.length,0);
});
const strip=[{id:4},{id:5},{id:6}];
test('native tab-left and tab-right switch relative to the original tab, wrapping at the ends',()=>{
  for(const [act,from,to] of [['TAB_PREV',5,4],['TAB_NEXT',5,6],['TAB_PREV',4,6],['TAB_NEXT',6,4]]){
    const e=start();e.emit('ACTIVITY');e.answer(from);
    e.emit(act);assert.deepEqual(e.actions,[]);
    e.answer(from);
    assert.equal(JSON.stringify(e.answerWith(strip)),'{"windowId":7}');
    assert.equal(JSON.stringify(e.actions),JSON.stringify([['activate',to,{active:true}]]));
  }
});
test('a lone tab, a vanished tab, a changed tab or a canceled sequence never switches tabs',()=>{
  const run=(act,tabs,id=5)=>{const e=start();e.emit('ACTIVITY');e.answer(id);e.emit(act);e.answer(id);e.answerWith(tabs);return e.actions;};
  assert.deepEqual(run('TAB_NEXT',[{id:5}]),[]);
  assert.deepEqual(run('TAB_PREV',strip,8),[]);
  const moved=start();moved.emit('ACTIVITY');moved.answer(5);moved.emit('TAB_NEXT');moved.answer(6);
  assert.equal(moved.queries.length,0);assert.deepEqual(moved.actions,[]);
  const late=start();late.emit('ACTIVITY');late.answer(5);late.emit('TAB_NEXT');late.answer(5);
  late.listeners.focus(8);late.answerWith(strip);assert.deepEqual(late.actions,[]);
  const wrong=start();wrong.emit('ACTIVITY',8);wrong.emit('TAB_NEXT',8);assert.equal(wrong.queries.length,0);
  const bare=start();bare.emit('TAB_NEXT');assert.equal(bare.queries.length,0);
});
test('native back and forward navigate only the original tab and cancel when it changed',()=>{
  for(const [act,name] of [['NAV_BACK','back'],['NAV_FORWARD','forward']]){
    const e=start();e.emit('ACTIVITY');e.answer(5);e.emit(act);assert.deepEqual(e.actions,[]);e.answer(5);
    assert.deepEqual(e.actions,[[name,5]]);
    const moved=start();moved.emit('ACTIVITY');moved.answer(5);moved.emit(act);moved.answer(6);assert.deepEqual(moved.actions,[]);
    const late=start();late.emit('ACTIVITY');late.answer(5);late.emit(act);late.listeners.focus(8);late.answer(5);assert.deepEqual(late.actions,[]);
    const bare=start();bare.emit(act);assert.equal(bare.queries.length,0);
    const wrong=start();wrong.emit('ACTIVITY',8);wrong.emit(act,8);assert.equal(wrong.queries.length,0);
  }
});
test('a double-Command toggle can clear the old page leader without launching a tab action',()=>{
  const e=start();e.emit('ACTIVITY');e.answer();e.Atlas.resetNativeSequencePage();e.answer();e.emit('NEW_TAB');assert.equal(e.actions.length,0);
});
test('core menu hook retains the native menu, adds hidden events only after UI readiness and is idempotent',()=>{
  const setups=[],listeners=[];
  const api={setup:items=>setups.push(items)};
  const window={vivaldi:{menubar:api}},chrome={runtime:{id:'atlas',onMessage:{addListener:f=>listeners.push(f)}}};
  const script=fs.readFileSync(__dirname+'/../../payload/install-files/atlas-native-menu-bridge.js','utf8');
  vm.runInNewContext(script,{window,chrome,navigator:{platform:'MacIntel'}});vm.runInNewContext(script,{window,chrome,navigator:{platform:'MacIntel'}});
  const original=[{name:'Native',action:'MENU_APPLE_APP'}];api.setup(original);assert.equal(setups[0].length,1);
  listeners[0]({atlasNativeSequenceReady:true},{id:'atlas',url:'https://example.test/'});assert.equal(setups.length,1);
  listeners[0]({atlasNativeSequenceReady:true},{id:'atlas',url:'chrome-extension://atlas/window.html?windowId=7'});
  const hooked=setups.at(-1);assert.equal(hooked.length,2);assert.equal(original.length,1);
  assert.equal(hooked[1].visible,false);assert.equal(hooked[1].items.length,7);
  assert.deepEqual(Array.from(hooked[1].items,i=>i.action),['ATLAS_SEQUENCE_ACTIVITY','ATLAS_SEQUENCE_NEW_TAB','ATLAS_SEQUENCE_CLOSE_TAB','ATLAS_SEQUENCE_TAB_PREV','ATLAS_SEQUENCE_TAB_NEXT','ATLAS_SEQUENCE_NAV_BACK','ATLAS_SEQUENCE_NAV_FORWARD']);
  assert.deepEqual(Array.from(hooked[1].items,i=>i.name).slice(3),['__AtlasSequenceTabPrev_v1__','__AtlasSequenceTabNext_v1__','__AtlasSequenceNavBack_v1__','__AtlasSequenceNavForward_v1__']);
  for(const item of hooked[1].items){assert.equal(item.visible,false);assert.equal(item.shortcut,undefined);}
  api.setup(hooked);assert.equal(setups.at(-1).length,2);assert.equal(listeners.length,1);
});
