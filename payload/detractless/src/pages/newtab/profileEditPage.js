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
  let gaCache = null, gaLooking = false, googleTyped = false;
  try {
    chrome.storage.local.get(["atlasGoogleAccounts"], (r) => { gaCache = (r && r.atlasGoogleAccounts) || null; if (onPage()) redraw(); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.atlasGoogleAccounts) return;
      gaCache = changes.atlasGoogleAccounts.newValue || null;
      gaLooking = false;
      if (onPage() && !typing()) redraw();
    });
  } catch (e) { /* no chrome.storage (page opened outside the browser): nothing found */ }

  function askForAccounts() {
    try { chrome.runtime.sendMessage({ atlas: { act: "google-accounts", refresh: true } }, () => void chrome.runtime.lastError); }
    catch (e) { /* no browser window to ask: the cached list stays */ }
  }

  function accountsLine() {
    if (gaLooking || !gaCache) return "Looking for the Google accounts signed into Vivaldi…";
    if (gaCache.error) return `Couldn't read your Google accounts: ${gaCache.error}`;
    if (!(gaCache.accounts || []).length) return "No Google accounts are signed in to Vivaldi.";
    return ""; // the accounts themselves are shown; no line needed
  }

  /* ── The account picker (spec 002, phase 2): the found accounts as rows; one
     click links one. Names and emails come from Google, so they are escaped,
     and only Google's own photo links are loaded. ── */
  const PHOTO_RE = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//i;
  const accountList = () => (gaCache && !gaLooking && !gaCache.error && gaCache.accounts) || [];

  function accountFace(a) {
    if (PHOTO_RE.test(a.photo || "")) return `<img class="pfe-acc-photo" src="${esc(a.photo)}" alt="" referrerpolicy="no-referrer">`;
    const initials = String(a.name || a.email).split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();
    return `<span class="pfe-acc-initials">${esc(initials)}</span>`;
  }

  function accountButton(email, face, label, note, on, disabled) {
    return `<button class="pfe-acc" data-pfe-pick="${esc(email)}" aria-pressed="${on}"${disabled ? " disabled" : ""}>${face}` +
      `<span class="pfe-acc-text"><span class="pfe-acc-name">${esc(label)}</span>${note ? `<span class="pfe-acc-email">${esc(note)}</span>` : ""}</span>` +
      `${on ? '<span class="pfe-acc-check" aria-hidden="true">✓</span>' : ""}</button>`;
  }

  /* Each found account (a signed-out one can't be picked), a linked account
     that isn't signed in now, then None. */
  function pickerList(linked) {
    const want = linked.toLowerCase(), list = accountList();
    const rows = list.map((a) => {
      const on = a.email.toLowerCase() === want, out = a.signedIn ? "" : "signed out";
      const note = a.name ? a.email + (out ? ` · ${out}` : "") : out;
      return accountButton(a.email, accountFace(a), a.name || a.email, note, on, !a.signedIn && !on);
    });
    if (linked && !list.some((a) => a.email.toLowerCase() === want)) {
      rows.unshift(accountButton(linked, '<span class="pfe-acc-initials">?</span>', linked, "not signed in right now", true, false));
    }
    rows.push(accountButton("", '<span class="pfe-acc-initials">–</span>', "None", "", !linked, false));
    return `<div class="pfe-accs" role="group" aria-label="Google account for this profile">${rows.join("")}</div>`;
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
     in the bundle): picked from the found accounts, or typed in when there is no
     list or the user asks to type. */
  function googleRow(p) {
    const id = esc(p.id), linked = p.google ? p.google.email : "";
    const hasList = accountList().length > 0, showBox = googleTyped || !hasList;
    const value = googleDraft !== null ? googleDraft : linked;
    const links = '<span class="pfe-ga-links">' +
      (hasList ? `<button class="pfe-link" data-pfe-typed>${googleTyped ? "Pick from the list" : "Type an email instead"}</button> · ` : "") +
      '<button class="pfe-link" data-pfe-ga-refresh>Refresh</button></span>';
    const line = accountsLine();
    const desc = (googleProblem ? `<span class="pf-notice">${esc(googleProblem)}</span>`
      : "Google links you open from the new tab use this account while this profile is active") +
      (line ? `<span class="pfe-ga" data-pfe-ga>${esc(line)}</span>` : "") + links;
    const box = showBox
      ? `<input class="pf-input" type="email" data-pfe-google="${id}" value="${esc(value)}" placeholder="you@gmail.com" aria-label="Google account email" spellcheck="false" autocomplete="off">` +
        (linked ? `<button class="sp-pill sm" data-pfe-google-unlink="${id}">Unlink</button>` : "")
      : "";
    /* The accounts go under the row, across the whole card, so each is a large target. */
    return UI.row("Google account", desc, box) + (hasList && !googleTyped ? pickerList(linked) : "");
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
    if (id !== shownId) { shownId = id; confirming = false; notice = ""; googleDraft = null; googleProblem = ""; googleTyped = false; askForAccounts(); }
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
    } else if ((b = t("[data-pfe-pick]"))) {
      if (b.disabled) return;
      const email = b.dataset.pfePick;
      googleDraft = null; googleProblem = "";
      AP.update(shownId, { google: email ? { email } : null }).then(redraw);
    } else if (t("[data-pfe-typed]")) {
      googleTyped = !googleTyped; redraw();
    } else if (t("[data-pfe-ga-refresh]")) {
      gaLooking = true; askForAccounts(); redraw();
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
