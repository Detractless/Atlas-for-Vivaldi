// Settings > Profiles. Adds the page to the settings UI (src/settings/shell.js):
// the list of profiles, Add profile, and the per-category share toggles.
// Click a profile to switch to it; the active one is highlighted. Each profile's
// ⋮ menu holds Edit (its own page, profileEditPage.js) and Delete.
(function () {
  const UI = window.AtlasSettingsUI, AP = window.AtlasProfiles;
  if (!UI || !AP) return;

  const ICON_SVG = '<circle cx="10" cy="7" r="3.2"/><path d="M3.8 16.5c.8-3 3.2-4.5 6.2-4.5s5.4 1.5 6.2 4.5"/>';
  const CHECK = '<svg class="pf-check" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9l3 3 6-7"/></svg>';
  const esc = AP.esc;
  /* Which profile's ⋮ menu is open, and which is asking "delete, are you sure?". */
  let menuFor = null, confirmId = null;

  function menu(p, s) {
    if (menuFor !== p.id) return "";
    const id = esc(p.id);
    return `<div class="sp-popmenu" role="menu">
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
      : `<span class="sp-menuwrap"><button class="sp-kebab" data-pf-menu="${id}" aria-haspopup="menu" aria-expanded="${menuFor === p.id}"
           aria-label="More for ${esc(p.name)}" title="More">${UI.kebab}</button>${menu(p, s)}</span>`;
    return `<div class="pf-row${active ? " is-active" : ""}" data-pf-id="${id}">
      <button class="pf-pick" data-pf-switch="${id}" aria-pressed="${active}" title="${active ? "Current profile" : `Switch to ${esc(p.name)}`}">
        <span class="pf-av pf-av--static">${AP.avatar(p, "pf-avatar")}</span>
        <span class="pf-fields"><span class="pf-name">${esc(p.name)}</span><span class="pf-label">${esc(p.label)}</span></span>
        ${active ? CHECK : ""}
      </button>
      <div class="pf-actions">${ctl}</div>
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
  const redraw = () => UI.rerender();
  AP.onChange(() => { if (onPage()) redraw(); });

  content.addEventListener("click", (e) => {
    if (!onPage()) return;
    const t = (sel) => e.target.closest(sel);
    let b;
    if (t("[data-pf-add]")) {
      AP.add({ name: "New profile" }).then((p) => UI.go("profile", p.id));
    } else if ((b = t("[data-pf-menu]"))) {
      menuFor = menuFor === b.dataset.pfMenu ? null : b.dataset.pfMenu; confirmId = null; redraw();
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

  /* The ⋮ menu closes on Escape (before Settings' own Escape closes Settings)
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
    if (e.target.closest && e.target.closest(".sp-popmenu, [data-pf-menu]")) return;
    menuFor = null;
    redraw();
  }, true);
})();
