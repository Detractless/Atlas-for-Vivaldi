// Settings > Profiles. Adds the page to the settings UI (src/settings/shell.js) and
// manages profiles through AtlasProfiles (profilesCore.js): add, remove, rename,
// label, image, switch, and the per-category share toggles.
(function () {
  const UI = window.AtlasSettingsUI, AP = window.AtlasProfiles;
  if (!UI || !AP) return;

  let confirmId = null, notice = "";
  const ICON_SVG = '<circle cx="10" cy="7" r="3.2"/><path d="M3.8 16.5c.8-3 3.2-4.5 6.2-4.5s5.4 1.5 6.2 4.5"/>';
  const esc = AP.esc;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);
  let iconFor = null;

  /* Centre-crop to a square and shrink, so the stored image stays small. */
  function toIcon(file) {
    return new Promise((resolve, reject) => {
      if (file.size > 12 * 1024 * 1024) return reject(new Error("That image is too large (12 MB max)."));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h);
        if (!side) return reject(new Error("That image has no size. Try a PNG or JPEG."));
        const c = document.createElement("canvas");
        c.width = c.height = 96;
        c.getContext("2d").drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 96, 96);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file is not an image the browser can open.")); };
      img.src = url;
    });
  }

  function profileRow(p, s) {
    const active = p.id === s.active, only = s.list.length < 2;
    const removing = confirmId === p.id;
    const actions = removing
      ? `<span class="pf-ask">Remove ${esc(p.name)}?</span>
         <button class="sp-pill sm" data-pf-cancel>Cancel</button>
         <button class="sp-pill sm danger" data-pf-remove-go="${esc(p.id)}">Remove</button>`
      : `${active ? '<span class="pf-badge">Current</span>' : `<button class="sp-pill sm" data-pf-switch="${esc(p.id)}">Switch</button>`}
         ${p.icon ? `<button class="sp-pill sm" data-pf-clear-icon="${esc(p.id)}">Remove image</button>` : ""}
         <button class="sp-pill sm danger" data-pf-remove="${esc(p.id)}" ${only ? 'disabled title="You need at least one profile"' : ""}>Remove</button>`;
    return `<div class="pf-row${active ? " is-active" : ""}" data-pf-id="${esc(p.id)}">
      <button class="pf-av" data-pf-icon="${esc(p.id)}" title="Choose an image" aria-label="Choose an image for ${esc(p.name)}">${AP.avatar(p, "pf-avatar")}</button>
      <div class="pf-fields">
        <input class="pf-input pf-name" data-pf-name="${esc(p.id)}" value="${esc(p.name)}" maxlength="40" placeholder="Name" aria-label="Profile name" spellcheck="false" autocomplete="off">
        <input class="pf-input pf-label" data-pf-label="${esc(p.id)}" value="${esc(p.label)}" maxlength="24" placeholder="Label, such as Personal or School" aria-label="Profile label" spellcheck="false" autocomplete="off">
      </div>
      <div class="pf-actions">${actions}</div>
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
        <div class="pf-addrow"><button class="sp-pill" data-pf-add>+ Add profile</button><span class="pf-notice" role="status">${esc(notice)}</span></div></div>`
    ]) + UI.section("Shared between profiles", [
      `<p class="sp-row-desc pf-intro">On means every profile uses the same copy. Turn one off and each profile keeps its own. A new profile starts with default settings for anything that is not shared.</p>`,
      UI.card(shares)
    ]);
  }

  UI.register({ id: "profiles", label: "Profiles", icon: ICON_SVG, before: "search", render });
  AP.ready.then(() => UI.rerender());

  const content = UI.content;
  const onProfiles = () => UI.current() === "profiles";
  const redraw = () => UI.rerender();
  const typing = () => { const a = document.activeElement; return !!(a && content.contains(a) && a.tagName === "INPUT"); };

  AP.onChange(() => { if (onProfiles() && !typing()) redraw(); });

  content.addEventListener("click", (e) => {
    const t = (sel) => e.target.closest(sel);
    let b;
    if (t("[data-pf-add]")) {
      notice = "";
      AP.add({ name: "New profile" }).then((p) => {
        redraw();
        const el = content.querySelector(`[data-pf-name="${p.id}"]`);
        if (el) { el.focus(); el.select(); }
      });
    } else if ((b = t("[data-pf-switch]"))) {
      AP.switchTo(b.dataset.pfSwitch);
    } else if ((b = t("[data-pf-icon]"))) {
      iconFor = b.dataset.pfIcon; fileInput.value = ""; fileInput.click();
    } else if ((b = t("[data-pf-clear-icon]"))) {
      AP.update(b.dataset.pfClearIcon, { icon: "" }).then(redraw);
    } else if ((b = t("[data-pf-remove]"))) {
      if (!b.disabled) { confirmId = b.dataset.pfRemove; redraw(); }
    } else if (t("[data-pf-cancel]")) {
      confirmId = null; redraw();
    } else if ((b = t("[data-pf-remove-go]"))) {
      confirmId = null;
      AP.remove(b.dataset.pfRemoveGo).then(redraw);
    } else if ((b = t("[data-pf-share]"))) {
      const on = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", String(on));
      AP.setShare(b.dataset.pfShare, on).then(redraw);
    }
  });

  /* Name and label commit on blur or Enter, so typing never re-renders mid-word. */
  content.addEventListener("change", (e) => {
    const n = e.target.closest("[data-pf-name]"), l = e.target.closest("[data-pf-label]");
    if (n) {
      const id = n.dataset.pfName, v = n.value.trim() || "Profile";
      n.value = v;
      AP.update(id, { name: v }).then(() => {
        const p = AP.get().list.find((q) => q.id === id), av = content.querySelector(`[data-pf-icon="${id}"]`);
        if (p && av) av.innerHTML = AP.avatar(p, "pf-avatar");
      });
    } else if (l) {
      AP.update(l.dataset.pfLabel, { label: l.value.trim() });
    }
  });
  content.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches && e.target.matches(".pf-input")) { e.preventDefault(); e.target.blur(); }
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0], id = iconFor;
    if (!f || !id) return;
    toIcon(f).then((data) => AP.update(id, { icon: data })).then(() => { notice = ""; redraw(); })
      .catch((err) => { notice = err.message || "Could not use that image."; redraw(); });
  });
})();
