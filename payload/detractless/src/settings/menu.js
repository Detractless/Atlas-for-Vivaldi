// src/settings/menu.js — the drop-down list a Settings pill opens. One menu
// element serves every pill; picking an option saves it through the control.
import { CONTROLS } from './controls.js';
import { CHECK } from './markup.js';

let menu = null;
let owner = null;

export function initMenu(menuEl, scrollHost) {
  menu = menuEl;
  menu.addEventListener("mousemove", (e) => { const li = e.target.closest(".sp-menu-item"); if (li && document.activeElement !== li) li.focus(); });
  menu.addEventListener("mouseleave", () => { if (owner) menu.focus(); });
  menu.addEventListener("click", (e) => { const li = e.target.closest(".sp-menu-item"); if (li) pick(li); });
  menu.addEventListener("keydown", onMenuKey, true);
  document.addEventListener("mousedown", (e) => {
    if (owner && !menu.contains(e.target) && !owner.contains(e.target)) closeMenu();
  });
  window.addEventListener("resize", closeMenu);
  scrollHost.addEventListener("scroll", closeMenu);
}

export function openMenu(btn) {
  if (owner === btn) return closeMenu();
  owner = btn;
  const c = CONTROLS[btn.dataset.select], cur = String(c.get());
  menu.innerHTML = c.options.map((o) =>
    `<li class="sp-menu-item" role="menuitemradio" tabindex="-1" aria-checked="${String(o.value) === cur}" data-value="${o.value}"><span>${o.label}</span>${CHECK}</li>`
  ).join("");
  const r = btn.getBoundingClientRect();
  menu.style.minWidth = Math.max(200, r.width) + "px";
  menu.style.top = r.bottom + 6 + "px";
  menu.style.left = "0px";
  menu.classList.add("open");
  const maxTop = window.innerHeight - menu.offsetHeight - 8;
  if (r.bottom + 6 > maxTop) menu.style.top = Math.max(8, r.top - menu.offsetHeight - 6) + "px";
  menu.style.left = Math.max(8, r.right - menu.offsetWidth) + "px";
  menu.focus();
}

export function closeMenu() {
  if (!menu) return;
  menu.classList.remove("open");
  owner = null;
}

export const menuIsOpen = () => !!owner;

function pick(li) {
  const btn = owner;
  btn.querySelector("span").textContent = li.textContent;
  closeMenu();
  btn.focus();
  CONTROLS[btn.dataset.select].set(li.dataset.value);
}

function onMenuKey(e) {
  const items = [...menu.children];
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (i === -1) return (menu.querySelector('[aria-checked="true"]') || items[0]).focus();
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  }
  if ((e.key === "Enter" || e.key === " ") && i !== -1) { e.preventDefault(); pick(items[i]); }
  if (e.key === "Escape") { e.stopPropagation(); const b = owner; closeMenu(); if (b) b.focus(); }
}
