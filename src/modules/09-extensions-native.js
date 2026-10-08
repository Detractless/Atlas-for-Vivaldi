/* ── 09-extensions-native.js: drives Vivaldi's own Extensions toolbar so an
   extension's popup opens from the Atlas popover. ── */

/* While Atlas clicks Vivaldi's Extensions toggle itself (to make the extension
   buttons exist), the capture listener in 10-extensions-popover.js must let
   those synthetic clicks through instead of treating them as the user opening
   the Atlas popover. setDrivingNative() is the only writer of the flag. */
var drivingNative = false;
function setDrivingNative(on) { drivingNative = !!on; }

/* Dispatch synthetic mouse/pointer event sequence to drive native buttons */
function fireSeq(el, cx, cy) {
  if (cx === undefined) {
    var r = el.getBoundingClientRect();
    if (r.width && r.height) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    else {
      var a = (document.querySelector('.toolbar-extensions') || el).getBoundingClientRect();
      cx = a.right - 8; cy = a.bottom + 2;
    }
  }
  cx = Math.round(cx); cy = Math.round(cy);
  var o = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1,
            clientX: cx, clientY: cy, screenX: cx, screenY: cy };
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(function (t) {
    el.dispatchEvent(t.indexOf('pointer') === 0 ? new PointerEvent(t, o) : new MouseEvent(t, o));
  });
}

function extExpanded() {
  var icon = document.querySelector('.ExtensionToggleIcon');
  return icon && getComputedStyle(icon).getPropertyValue('--extensionsExpanded').trim() === '1';
}

var SPECIAL_EXT_BUTTONS = {
  'jplgfhpmjnbigmhklmmbgecoobifkmpa': '[data-name="VPNButton"]'
};

/* Anchor popup under address-field pill */
function anchorExtPopup() {
  function getAnchorRect() {
    var pill = document.querySelector('.UrlBar-AddressField');
    if (pill) return pill.getBoundingClientRect();
    var tb = document.querySelector('.toolbar-extensions');
    return tb ? tb.getBoundingClientRect() : { right: window.innerWidth - 8, bottom: 44 };
  }
  function place(p, tr) {
    p.style.setProperty('position', 'fixed', 'important');
    p.style.setProperty('transition', 'none', 'important');
    var w = p.getBoundingClientRect().width || 370;
    var left = Math.max(8, Math.min(Math.round(tr.right - w), window.innerWidth - w - 8));
    p.style.setProperty('left', left + 'px', 'important');
    p.style.setProperty('top', Math.round(tr.bottom + 4) + 'px', 'important');
  }
  var tries = 0;
  (function poll() {
    var p = document.querySelector('.extension-popup, [class*="ExtensionPopup"]');
    if (p) { place(p, getAnchorRect()); return; }
    if (++tries <= 25) setTimeout(poll, 40);
  })();
}

/* Prewarm puzzle on first open so extension buttons exist */
function prewarmNativePuzzle() {
  try {
    if (extExpanded()) return;
    var toggle = document.querySelector('.toolbar-extensions [data-name="Extensions"]');
    if (!toggle) return;
    setDrivingNative(true);
    fireSeq(toggle);
    setTimeout(function () { if (extExpanded()) fireSeq(toggle); setDrivingNative(false); }, 220);
  } catch (e) { setDrivingNative(false); }
}

function openExtensionAction(extId, done) {
  var specialSel = SPECIAL_EXT_BUTTONS[extId];
  var special = specialSel && document.querySelector(specialSel);
  if (special) { fireSeq(special); anchorExtPopup(); done(true); return; }
  var toggle = document.querySelector('.toolbar-extensions [data-name="Extensions"]');
  if (!toggle) { done(false); return; }
  setDrivingNative(true);
  var wasExpanded = extExpanded();
  if (!wasExpanded) fireSeq(toggle);
  var tries = 0, retried = false;
  (function poll() {
    var btn = document.querySelector('.toolbar-extensions button[data-name="' + extId + '"]');
    if (btn) {
      var box = btn.closest('.button-toolbar') || btn, boxPrev = box.style.cssText;
      var btnHadHidden = btn.classList.contains('ExtensionIcon--Hidden');
      var tr2 = toggle.getBoundingClientRect();
      var clickCx = Math.round(tr2.left + tr2.width / 2), clickCy = Math.round(tr2.top + tr2.height / 2);
      if (!wasExpanded && extExpanded()) fireSeq(toggle);
      box.style.cssText = 'display:flex!important;visibility:visible!important;' +
        'position:fixed!important;left:-9999px!important;top:0!important;' +
        'width:28px!important;height:28px!important;opacity:0!important;pointer-events:auto!important';
      if (btnHadHidden) btn.classList.remove('ExtensionIcon--Hidden');
      void box.offsetWidth;
      fireSeq(btn, clickCx, clickCy);
      anchorExtPopup();
      var popupSeen = false, watchTries = 0;
      (function watchPopup() {
        var p = document.querySelector('.extension-popup, [class*="ExtensionPopup"]');
        if (p) {
          popupSeen = true;
          setTimeout(watchPopup, 100);
          return;
        }
        if (!popupSeen && ++watchTries <= 20) { setTimeout(watchPopup, 50); return; }
        box.style.cssText = boxPrev;
        if (btnHadHidden) btn.classList.add('ExtensionIcon--Hidden');
        if (!wasExpanded && extExpanded()) fireSeq(toggle);
        setDrivingNative(false);
      })();
      done(true);
      return;
    }
    if (++tries > 30) {
      if (!retried) {
        retried = true; tries = 0;
        if (!extExpanded()) fireSeq(toggle);
        setTimeout(poll, 90);
        return;
      }
      if (!wasExpanded && extExpanded()) fireSeq(toggle);
      setDrivingNative(false);
      done(false);
      return;
    }
    setTimeout(poll, 50);
  })();
}
