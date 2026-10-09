// Settings > Profiles > one profile: image, name, label, Google account and
// Delete (spec 001, phases 3 and 4). A hidden settings page (src/settings/shell.js): Edit on the
// Profiles list opens it with the profile's id, and its Back link returns to
// the list. Changes save at once through AtlasProfiles (profilesCore.js).
(function () {
  const UI = window.AtlasSettingsUI, AP = window.AtlasProfiles;
  if (!UI || !AP) return;

  const esc = AP.esc;
  let confirming = false, notice = "", shownId = null;
  /* A Google address that isn't an email stays in the box with a note, unsaved. */
  let googleDraft = null, googleProblem = "";

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

  const profile = (id) => { const s = AP.get(); return (s && s.list.find((p) => p.id === id)) || null; };
  const onPage = () => UI.current() === "profile";
  const redraw = () => UI.rerender();

  /* The Google accounts the browser window found (src/modules/16-google-accounts.js
     caches them in chrome.storage.local). Shown on the Google row; asked for
     afresh each time a profile's page opens. */
  let gaCache = null;
  try {
    chrome.storage.local.get(["atlasGoogleAccounts"], (r) => { gaCache = (r && r.atlasGoogleAccounts) || null; if (onPage()) redraw(); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.atlasGoogleAccounts) return;
      gaCache = changes.atlasGoogleAccounts.newValue || null;
      if (onPage() && !typing()) redraw();
    });
  } catch (e) { /* no chrome.storage (page opened outside the browser): nothing found */ }

  function askForAccounts() {
    try { chrome.runtime.sendMessage({ atlas: { act: "google-accounts", refresh: true } }, () => void chrome.runtime.lastError); }
    catch (e) { /* no browser window to ask: the cached list stays */ }
  }

  function accountsLine() {
    if (!gaCache) return "Looking for the Google accounts signed into Vivaldi…";
    if (gaCache.error) return `Couldn't read your Google accounts: ${gaCache.error}`;
    const list = gaCache.accounts || [];
    if (!list.length) return "No Google accounts are signed in to Vivaldi.";
    return `Found ${list.length} Google account${list.length === 1 ? "" : "s"}: ` +
      list.map((a) => a.email + (a.signedIn ? "" : " (signed out)")).join(", ");
  }

  function head(p) {
    const id = esc(p.id);
    return `<div class="pfe-head">
      <button class="pf-av" data-pfe-icon="${id}" title="Choose an image" aria-label="Choose an image for ${esc(p.name)}">${AP.avatar(p, "pf-avatar")}</button>
      <div class="pfe-head-btns">
        <button class="sp-pill sm" data-pfe-icon="${id}">Choose image</button>
        ${p.icon ? `<button class="sp-pill sm" data-pfe-clear-icon="${id}">Remove image</button>` : ""}
        <span class="pf-notice" role="status">${esc(notice)}</span>
      </div>
    </div>`;
  }

  function fields(p) {
    const id = esc(p.id);
    return UI.card([
      UI.row("Name", "", `<input class="pf-input" data-pfe-name="${id}" value="${esc(p.name)}" maxlength="40" aria-label="Profile name" spellcheck="false" autocomplete="off">`),
      UI.row("Label", "Such as Personal or School", `<input class="pf-input" data-pfe-label="${id}" value="${esc(p.label)}" maxlength="24" aria-label="Profile label" spellcheck="false" autocomplete="off">`),
      googleRow(p)
    ]);
  }

  /* The Google account this profile opens Google links as (services/googleAccount.js
     in the bundle). Typed in for now; detecting the signed-in accounts comes later. */
  function googleRow(p) {
    const id = esc(p.id), linked = p.google ? p.google.email : "";
    const value = googleDraft !== null ? googleDraft : linked;
    const desc = (googleProblem ? `<span class="pf-notice">${esc(googleProblem)}</span>`
      : "Google links you open from the new tab use this account while this profile is active") +
      `<span class="pfe-ga" data-pfe-ga>${esc(accountsLine())}</span>`;
    return UI.row("Google account", desc,
      `<input class="pf-input" type="email" data-pfe-google="${id}" value="${esc(value)}" placeholder="you@gmail.com" aria-label="Google account email" spellcheck="false" autocomplete="off">` +
      (linked ? `<button class="sp-pill sm" data-pfe-google-unlink="${id}">Unlink</button>` : ""));
  }

  function deleteCard(p, s) {
    const id = esc(p.id), only = s.list.length < 2;
    const desc = only ? "You need at least one profile, so this one can't be deleted."
      : p.id === s.active ? "You'll switch to the first remaining profile."
        : "Its own settings and bookmarks go with it.";
    const ctl = confirming
      ? `<span class="pf-ask">Delete ${esc(p.name)}?</span>
         <button class="sp-pill sm" data-pfe-delete-cancel>Cancel</button>
         <button class="sp-pill sm danger" data-pfe-delete-go="${id}">Delete</button>`
      : `<button class="sp-pill sm danger" data-pfe-delete="${id}"${only ? " disabled" : ""}>Delete</button>`;
    return UI.card([UI.row("Delete this profile", desc, ctl)]);
  }

  function render(id) {
    if (id !== shownId) { shownId = id; confirming = false; notice = ""; googleDraft = null; googleProblem = ""; askForAccounts(); }
    const s = AP.get(), p = profile(id);
    if (!s || !p) return '<p class="sp-row-desc">This profile no longer exists.</p>';
    return UI.section("", [head(p), fields(p)]) + UI.section("", [deleteCard(p, s)]);
  }

  UI.register({
    id: "profile", hidden: true, parent: "profiles",
    title: (id) => (profile(id) || {}).name || "Profile",
    render
  });

  const content = UI.content;
  const typing = () => { const a = document.activeElement; return !!(a && content.contains(a) && a.tagName === "INPUT"); };
  AP.onChange(() => { if (onPage() && !typing()) redraw(); });

  content.addEventListener("click", (e) => {
    if (!onPage()) return;
    const t = (sel) => e.target.closest(sel);
    let b;
    if ((b = t("[data-pfe-icon]"))) {
      iconFor = b.dataset.pfeIcon; fileInput.value = ""; fileInput.click();
    } else if ((b = t("[data-pfe-clear-icon]"))) {
      AP.update(b.dataset.pfeClearIcon, { icon: "" }).then(redraw);
    } else if ((b = t("[data-pfe-google-unlink]"))) {
      googleDraft = null; googleProblem = "";
      AP.update(b.dataset.pfeGoogleUnlink, { google: null }).then(redraw);
    } else if ((b = t("[data-pfe-delete]"))) {
      if (!b.disabled) { confirming = true; redraw(); }
    } else if (t("[data-pfe-delete-cancel]")) {
      confirming = false; redraw();
    } else if ((b = t("[data-pfe-delete-go]"))) {
      confirming = false;
      AP.remove(b.dataset.pfeDeleteGo).then(() => UI.go("profiles"));
    }
  });

  /* Name and label commit on blur or Enter, so typing never redraws mid-word. */
  content.addEventListener("change", (e) => {
    if (!onPage()) return;
    const n = e.target.closest("[data-pfe-name]"), l = e.target.closest("[data-pfe-label]"), g = e.target.closest("[data-pfe-google]");
    if (n) AP.update(n.dataset.pfeName, { name: n.value.trim() || "Profile" }).then(redraw);
    else if (l) AP.update(l.dataset.pfeLabel, { label: l.value.trim() }).then(redraw);
    else if (g) saveGoogle(g.dataset.pfeGoogle, g.value.trim());
  });
  content.addEventListener("keydown", (e) => {
    if (onPage() && e.key === "Enter" && e.target.matches && e.target.matches(".pf-input")) { e.preventDefault(); e.target.blur(); }
  });

  /* Empty unlinks; an email links; anything else stays in the box with a note. */
  function saveGoogle(id, email) {
    if (email && !AP.googleOf({ email })) {
      googleDraft = email; googleProblem = "That doesn't look like an email address.";
      redraw();
      return;
    }
    googleDraft = null; googleProblem = "";
    AP.update(id, { google: email ? { email } : null }).then(redraw);
  }

  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0], id = iconFor;
    if (!f || !id) return;
    toIcon(f).then((data) => AP.update(id, { icon: data })).then(() => { notice = ""; redraw(); })
      .catch((err) => { notice = err.message || "Could not use that image."; redraw(); });
  });
})();
