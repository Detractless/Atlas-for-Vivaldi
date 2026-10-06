import { finder, attr as attrWordLike, className as classWordLike } from '@medv/finder';

/* Stable test/identity attributes we always allow finder to use even if its
   default word-likeness check is stricter. These are the hooks that survive
   React re-renders and site redeploys. */
const STABLE_ATTR = /^(data-testid|data-test|data-qa|data-cy|data-id|aria-label|role|name|title|alt|type)$/i;

/* Build a CSS selector for the clicked element.
 *
 * SPECIFIC (the default click/space): a UNIQUE, stable selector via @medv/finder,
 * which ranks id, then data-attributes / aria / role / name, then word-like
 * classes, and deliberately SKIPS hashed CSS-module names (like `_button_a1b2c`)
 * and Tailwind utility soup — the exact things that made the old
 * tag.class:nth-of-type paths break on React and after a site redeploy. finder
 * guarantees uniqueness, so it never over-matches.
 *
 * BROAD (the toggle): match SIMILAR elements by tag + its stable classes, on
 * purpose — this is the "hide all of these" mode. */
export function getSelector(el, isBroad) {
  if (!el || el.nodeType !== 1) return "";

  if (isBroad) {
    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList)
      .filter((c) => c !== "rhe-css-active" && classWordLike(c));
    /* Only offer a broad selector when there are distinguishing classes. A bare
       tag ("div", "span", or a class-less custom element like
       "yt-shelf-header-layout") matches a huge chunk of the page — broad-hiding
       it nukes the whole site. With no usable classes, fall through to the UNIQUE
       (specific) selector so "broad" can never collapse to "hide every div". */
    if (classes.length) return tag + "." + classes.join(".");
  }

  try {
    return finder(el, {
      className: (name) => name !== "rhe-css-active" && classWordLike(name),
      attr: (name, value) => STABLE_ATTR.test(name) || attrWordLike(name, value),
    });
  } catch (e) {
    /* finder throws if it cannot find a unique selector within its limits
       (detached node, timeout). Fall back to a structural path so we always
       return something. */
    return structuralPath(el);
  }
}

/* Last-resort structural path (the original engine). Brittle on React, but only
   reached when finder gives up. */
function structuralPath(el) {
  if (el.id) return "#" + el.id;
  const path = [];
  let parent = el;
  while (parent && parent.nodeType === 1) {
    let selector = parent.tagName.toLowerCase();
    if (parent.id) { path.unshift("#" + parent.id); break; }
    const classes = Array.from(parent.classList)
      .filter((c) => c !== "rhe-css-active" && classWordLike(c)).join(".");
    if (classes) selector += "." + classes;
    let sibling = parent, nth = 1;
    while ((sibling = sibling.previousElementSibling)) {
      if (sibling.tagName.toLowerCase() === parent.tagName.toLowerCase()) nth++;
    }
    if (nth > 1) selector += ":nth-of-type(" + nth + ")";
    path.unshift(selector);
    parent = parent.parentNode;
  }
  return path.join(" > ");
}
