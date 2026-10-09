// Settings > Profiles. Adds the page to the settings UI (src/settings/shell.js):
// the list of profiles, Add profile, and the per-category share toggles.
// Click a profile to switch to it; the active one is highlighted. Right-click a
// profile (or press the menu key on it) for Atlas's own right-click menu
// (components/atlas/atlas-menu.js) with Edit (its own page, profileEditPage.js)
// and Delete.
(function () {
  const UI = window.AtlasSettingsUI, AP = window.AtlasProfiles;
  if (!UI || !AP) return;

  const ICON_SVG = '<circle cx="10" cy="7" r="3.2"/><path d="M3.8 16.5c.8-3 3.2-4.5 6.2-4.5s5.4 1.5 6.2 4.5"/>';
  const CHECK = '<svg class="pf-check" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9l3 3 6-7"/></svg>';
  const esc = AP.esc;

  function profileRow(p, s) {
    const active = p.id === s.active, id = esc(p.id);
    return `<div class="pf-row${active ? " is-active" : ""}" data-pf-id="${id}">
      <button class="pf-pick" data-pf-switch="${id}" aria-pressed="${active}" aria-haspopup="menu"
        title="${active ? "Current profile" : `Switch to ${esc(p.name)}`}. Right-click for Edit and Delete">
        <span class="pf-av pf-av--static">${AP.avatar(p, "pf-avatar")}</span>
        <span class="pf-fields"><span class="pf-name">${esc(p.name)}</span><span class="pf-label">${esc(p.label)}</span></span>
        ${active ? CHECK : ""}
      </button>
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

  /* A profile's menu, the same right-click menu Atlas shows on web pages:
     its pointer at the click for a right-click, under the row's picture for
     the menu key (with the keyboard in the menu). */
  function openMenu(row, e) {
    const s = AP.get(), id = row.dataset.pfId;
    if (!s || !window.__atlasMenu) return;
    const items = [{ label: "Edit", run: () => UI.go("profile", id) }];
    /* Delete acts at once (the user asked for no confirmation). The last profile can't be deleted. */
    if (s.list.length > 1) items.push({ label: "Delete", run: () => AP.remove(id).then(redraw) });
    const byMouse = e.type === "contextmenu";
    const r = row.getBoundingClientRect();
    const at = byMouse ? e : { clientX: r.left + 30, clientY: r.bottom - 6 };
    window.__atlasMenu.open(at, items, { focus: !byMouse });
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
    } else if ((b = t("[data-pf-switch]"))) {
      const s = AP.get();
      if (s && s.active !== b.dataset.pfSwitch) AP.switchTo(b.dataset.pfSwitch);
    } else if ((b = t("[data-pf-share]"))) {
      const on = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", String(on));
      AP.setShare(b.dataset.pfShare, on).then(redraw);
    }
  });

})();
