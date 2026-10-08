/* ══════════════════════════════════════════════════════════════════════
   SCROLL AFFORDANCE (R-010)
   Two-way fade plus a hidden-item count, for any scroll region.

   WHY THIS EXISTS. base.css:40-41 hides scrollbars across the whole
   extension with a * selector, so no scroll region can show a bar and
   every one of them needs a substitute. Bookmarks grew one first; when
   settings became the second adopter, R-007's promotion clause said it
   moves here rather than being copied. Styles live in components.css.

   THE INVARIANT, and it is the whole point (R-008, corrected in R-009):

     a fade is visible  ⟺  the count at that end is above zero
     an item counts     ⟺  it is NOT FULLY VISIBLE at that end

   Both ends therefore mean the same thing, so a fade can never paint over
   something the user can still read. The two defects this replaced were a
   fade derived from SCROLL POSITION while the count was derived from
   ITEMS (they disagree by the container's own padding), and a top end that
   tested an item's BOTTOM edge, which lags the truth by a whole item. If
   you are tempted to reintroduce either, read those rulings first.

   Measurement is by getBoundingClientRect against the scroller, not by
   offsetTop, so nested items (a row inside a group inside the scroller)
   measure correctly and no assumption is made about which ancestor happens
   to be positioned.
   ══════════════════════════════════════════════════════════════════════ */

function make(tag, className) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

/**
 * @param {Element} scroller  the element with overflow-y: auto
 * @param {object}  [options]
 * @param {string}  [options.items]  selector for countable items, resolved
 *        inside the scroller. Defaults to the scroller's direct children.
 *        Pass one when the meaningful units are nested or interleaved with
 *        things that are not units (settings mixes rows and headers).
 * @param {Element} [options.host]   existing positioned wrapper. When
 *        omitted a .scroll-affordance wrapper is inserted around the
 *        scroller, so callers that cannot change their markup still work.
 * @param {string}  [options.noun]   plural noun for the pill. Default "".
 * @param {string}  [options.prefix] class-name stem, default "scroll", giving
 *        .scroll-affordance / .scroll-fade / .scroll-count as components.css
 *        authors them. PasteKit's on-page surfaces pass "pk-scroll" because they
 *        render in a CLOSED shadow root that components.css cannot reach, so
 *        they carry their own copy of the paint in onPageSurface.js. BEHAVIOUR
 *        is not duplicated by that: it is this function, and the invariant above
 *        holds for every adopter whatever its classes are called.
 * @returns {{refresh: () => void, host: Element}}
 */
export function attachScrollAffordance(scroller, options = {}) {
  if (!scroller) return { refresh: () => {}, host: null };

  const p = options.prefix || "scroll";

  let host = options.host;
  if (!host) {
    host = make("div", `${p}-affordance`);
    scroller.parentNode.insertBefore(host, scroller);
    host.appendChild(scroller);
  }

  const fadeTop = make("div", `${p}-fade ${p}-fade-top hidden`);
  const fadeBot = make("div", `${p}-fade ${p}-fade-bot hidden`);
  const countTop = make("span", `${p}-count ${p}-count-top hidden`);
  const countBot = make("span", `${p}-count ${p}-count-bot hidden`);
  for (const pill of [countTop, countBot]) {
    pill.appendChild(make("i", `${p}-count-chev`));
    pill.appendChild(document.createTextNode(""));
  }
  host.append(fadeTop, fadeBot, countTop, countBot);

  // The fade must clip to exactly the SCROLLER's corners. Any mismatch shows:
  // a fade rounder than its scroller cuts a notch out of itself and lets the
  // un-faded content show through at the corners; a fade squarer than its
  // scroller overhangs and paints its own colour past the corner onto whatever
  // is behind. This is read from the scroller rather than authored per adopter
  // because the first attempt exposed a --scroll-fade-radius custom property
  // and two of the three adopters set it on the SCROLLER, which is a SIBLING of
  // the fades, so it never reached them and both silently fell back to the
  // default. Deriving it here removes the chance to get it wrong.
  const syncRadius = () => {
    const cs = getComputedStyle(scroller);
    fadeTop.style.borderRadius =
      `${cs.borderTopLeftRadius} ${cs.borderTopRightRadius} 0 0`;
    fadeBot.style.borderRadius =
      `0 0 ${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius}`;
  };
  syncRadius();

  const noun = options.noun ? " " + options.noun : "";
  const items = () => (options.items
    ? scroller.querySelectorAll(options.items)
    : scroller.children);

  const setState = (above, below) => {
    fadeTop.classList.toggle("hidden", above === 0);
    fadeBot.classList.toggle("hidden", below === 0);
    countTop.classList.toggle("hidden", above === 0);
    countBot.classList.toggle("hidden", below === 0);
    countTop.lastChild.textContent = above + noun + " above";
    countBot.lastChild.textContent = below + noun + " below";
  };

  const refresh = () => {
    const box = scroller.getBoundingClientRect();
    // A scroller that is display:none measures zero, and every item would read
    // as "above". CLEAR rather than early-return: the fade and pill live on the
    // wrapper, not inside the scroller, so leaving them alone would strand two
    // gradients and a stale count over a collapsed box. Callers that hide their
    // list (the search pills) depend on this to tidy up after themselves.
    if (box.height === 0) { setState(0, 0); return; }

    let above = 0, below = 0;
    for (const el of items()) {
      // Skips display:none items, which matters wherever one scroller holds
      // several panes and shows one at a time (settings sub-pages).
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.top < box.top - 2) above++;
      else if (r.bottom > box.bottom + 2) below++;
    }

    setState(above, below);
  };

  // Coalesce to one measurement per frame. A mutation burst (a settings pane
  // swapping, a list re-rendering) would otherwise re-measure every item once
  // per mutation record.
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; refresh(); });
  };

  // Scrolling is measured immediately: a frame of lag here is visible as the
  // fade trailing the content.
  scroller.addEventListener("scroll", refresh, { passive: true });

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => { syncRadius(); schedule(); });
    ro.observe(scroller);           // first reveal, window resize
    for (const child of scroller.children) ro.observe(child);
  }
  if (typeof MutationObserver !== "undefined") {
    // Content can change height without anything being RESIZED: a settings
    // sub-page toggles [hidden], a list is re-rendered into place. Chrome does
    // not reliably deliver a ResizeObserver entry for an element going to
    // display:none, so that case was leaving the previous pane's counts on
    // screen. Watching the subtree is what actually catches it.
    // Safe from feedback: this observes the SCROLLER, while refresh only ever
    // touches the fade and pill elements, which are siblings of it under host.
    new MutationObserver(schedule).observe(scroller, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["hidden", "style", "class"]
    });
  }
  schedule();

  return { refresh, host };
}
