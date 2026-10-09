// Settings > Profiles. Adds the page to the settings UI (src/settings/shell.js):
// the list of profiles, Add profile, and the per-category share toggles.
// Click a profile to switch to it; the active one is highlighted. Right-click a
// profile (or press the menu key on it) for Edit (its own page,
// profileEditPage.js) and Delete.
(function () {
  const UI = window.AtlasSettingsUI, AP = window.AtlasProfiles;
  if (!UI || !AP) return;

  const ICON_SVG = '<circle cx="10" cy="7" r="3.2"/><path d="M3.8 16.5c.8-3 3.2-4.5 6.2-4.5s5.4 1.5 6.2 4.5"/>';
  const CHECK = '<svg class="pf-check" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9l3 3 6-7"/></svg>';
  const esc = AP.esc;
  /* Which profile's right-click menu is open (and where, in the row), and which
     is asking "delete, are you sure?". */
  let menuFor = null, menuAt = null, confirmId = null, focusMenu = false;

  function menu(p, s) {
    if (menuFor !== p.id) return "";
    const id = esc(p.id);
    const at = menuAt ? ` style="left:${menuAt.x}px;top:${menuAt.y}px"` : "";
    return `<div class="sp-popmenu${menuAt ? " sp-popmenu--at" : ""}" role="menu"${at}>
      <button role="menuitem" data-pf-edit="${id}">Edit</button>
      ${s.list.length > 1 ? `<button role="menuitem" class="danger" data-pf-delete="${id}">Delete</button>` : ""}
    </div>`;
  }

  function profileRow(p, s) {
    const active = p.id === s.active, id = esc(p.id);
    const ctl = confirmId === p.id
      ? `<span class="pf-ask">Delete ${esc(p.name)}?</span>
         <button class="sp-pill sm" data-pf-cancel>Cancel</button>
         <button class="sp-pill sm danger" data-pf-delete-go="${id}">Delete</button>`
      : "";
    return `<div class="pf-row${active ? " is-active" : ""}" data-pf-id="${id}">${menu(p, s)}
      <button class="pf-pick" data-pf-switch="${id}" aria-pressed="${active}" aria-haspopup="menu"
        title="${active ? "Current profile" : `Switch to ${esc(p.name)}`}. Right-click for Edit and Delete">
        <span class="pf-av pf-av--static">${AP.avatar(p, "pf-avatar")}</span>
        <span class="pf-fields"><span class="pf-name">${esc(p.name)}</span><span class="pf-label">${esc(p.label)}</span></span>
        ${active ? CHECK : ""}
      </button>
      ${ctl ? `<div class="pf-actions">${ctl}</div>` : ""}
    </div>`;
  }

  function render() {
    const s = AP.get();
    if (!s) return '<div class="sp-row-desc">Loading profiles...</div>';
    const shares = AP.CATS.map((c) => {
      const on = s.share[c.id] !== false;
      return UI.row(c.label, on ? c.on : c.off,
        `<button class="sp-toggle" role="switch" data-pf-share="${c.id}" aria-checked="${on}" aria-label="${esc(c.label)} shared between profiles"></button>`);
    });
    return UI.section("Your profiles", [
      `<div class="sp-card pf-card">${s.list.map((p) => profileRow(p, s)).join("")}
        <div class="pf-addrow"><button class="sp-pill" data-pf-add>+ Add profile</button></div></div>`
    ]) + UI.section("Shared between profiles", [
      `<p class="sp-row-desc pf-intro">On means every profile uses the same copy. Turn one off and each profile keeps its own. A new profile starts with default settings for anything that is not shared.</p>`,
      UI.card(shares)
    ]);
  }

  UI.register({ id: "profiles", label: "Profiles", icon: ICON_SVG, before: "search", render });
  AP.ready.then(() => UI.rerender());

  const content = UI.content;
  const onPage = () => UI.current() === "profiles";
  const redraw = () => {
    UI.rerender();
    if (!focusMenu) return;
    focusMenu = false;
    const first = content.querySelector(".pf-row .sp-popmenu button");
    if (first) first.focus();
  };
  AP.onChange(() => { if (onPage()) redraw(); });

  /* Open a profile's menu: at the pointer for a right-click, under the row for
     the menu key. The position is in the row's own pixels, which differ from
     the screen's when Settings is zoomed back from the new tab's UI scale. */
  function openMenu(row, e) {
    const r = row.getBoundingClientRect(), scale = row.offsetWidth ? r.width / row.offsetWidth : 1;
    menuAt = e && e.type === "contextmenu" && r.width
      ? { x: Math.round((e.clientX - r.left) / scale), y: Math.round((e.clientY - r.top) / scale) }
      : null;
    menuFor = row.dataset.pfId;
    confirmId = null;
    focusMenu = !(e && e.type === "contextmenu");
    redraw();
  }

  content.addEventListener("contextmenu", (e) => {
    const row = onPage() && e.target.closest && e.target.closest(".pf-row[data-pf-id]");
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    openMenu(row, e);
  });
  content.addEventListener("keydown", (e) => {
    if (!onPage() || !(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) return;
    const row = e.target.closest && e.target.closest(".pf-row[data-pf-id]");
    if (!row) return;
    e.preventDefault();
    openMenu(row, e);
  });

  content.addEventListener("click", (e) => {
    if (!onPage()) return;
    const t = (sel) => e.target.closest(sel);
    let b;
    if (t("[data-pf-add]")) {
      AP.add({ name: "New profile" }).then((p) => UI.go("profile", p.id));
    } else if ((b = t("[data-pf-edit]"))) {
      menuFor = null; UI.go("profile", b.dataset.pfEdit);
    } else if ((b = t("[data-pf-delete]"))) {
      menuFor = null; confirmId = b.dataset.pfDelete; redraw();
    } else if (t("[data-pf-cancel]")) {
      confirmId = null; redraw();
    } else if ((b = t("[data-pf-delete-go]"))) {
      confirmId = null; AP.remove(b.dataset.pfDeleteGo).then(redraw);
    } else if ((b = t("[data-pf-switch]"))) {
      const s = AP.get();
      if (s && s.active !== b.dataset.pfSwitch) AP.switchTo(b.dataset.pfSwitch);
    } else if ((b = t("[data-pf-share]"))) {
      const on = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", String(on));
      AP.setShare(b.dataset.pfShare, on).then(redraw);
    }
  });

  /* The menu closes on Escape (before Settings' own Escape closes Settings)
     and on any click outside it. */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || menuFor === null || !onPage()) return;
    e.preventDefault();
    e.stopPropagation();
    menuFor = null;
    redraw();
  }, true);
  document.addEventListener("click", (e) => {
    if (menuFor === null || !onPage()) return;
    if (e.target.closest && e.target.closest(".sp-popmenu")) return;
    menuFor = null;
    redraw();
  }, true);
})();
