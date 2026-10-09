// Settings > Profiles. Adds the page to the settings UI (src/settings/shell.js):
// the list of profiles (read-only, with Switch and Edit), Add profile, and the
// per-category share toggles. Editing one profile (image, name, label, Google
// account, Delete) happens on its own page, profileEditPage.js.
(function () {
  const UI = window.AtlasSettingsUI, AP = window.AtlasProfiles;
  if (!UI || !AP) return;

  const ICON_SVG = '<circle cx="10" cy="7" r="3.2"/><path d="M3.8 16.5c.8-3 3.2-4.5 6.2-4.5s5.4 1.5 6.2 4.5"/>';
  const esc = AP.esc;

  function profileRow(p, s) {
    const active = p.id === s.active;
    const switchCtl = active
      ? '<span class="pf-badge">Current</span>'
      : `<button class="sp-pill sm" data-pf-switch="${esc(p.id)}">Switch</button>`;
    return `<div class="pf-row${active ? " is-active" : ""}" data-pf-id="${esc(p.id)}">
      <span class="pf-av pf-av--static">${AP.avatar(p, "pf-avatar")}</span>
      <div class="pf-fields">
        <div class="pf-name">${esc(p.name)}</div>
        <div class="pf-label">${esc(p.label)}</div>
      </div>
      <div class="pf-actions">${switchCtl}
        <button class="sp-pill sm" data-pf-edit="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">Edit</button>
      </div>
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
  AP.onChange(() => { if (UI.current() === "profiles") UI.rerender(); });

  content.addEventListener("click", (e) => {
    if (UI.current() !== "profiles") return;
    const t = (sel) => e.target.closest(sel);
    let b;
    if (t("[data-pf-add]")) {
      AP.add({ name: "New profile" }).then((p) => UI.go("profile", p.id));
    } else if ((b = t("[data-pf-switch]"))) {
      AP.switchTo(b.dataset.pfSwitch);
    } else if ((b = t("[data-pf-edit]"))) {
      UI.go("profile", b.dataset.pfEdit);
    } else if ((b = t("[data-pf-share]"))) {
      const on = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", String(on));
      AP.setShare(b.dataset.pfShare, on).then(() => UI.rerender());
    }
  });
})();
