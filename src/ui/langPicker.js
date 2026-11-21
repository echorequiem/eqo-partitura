// langPicker.js — the language menu in the Echo look (glass list, accent check), replacing the native dropdown
// (Windows draws its list white, which clashed with the dark theme and made the names unreadable).
// The real <select> stays in the page, hidden: choosing here sets its value and fires "change", so the rest of
// the app keeps listening to the select. Call sync() after the value was set from code.

const ICON_GLOBE = '<svg class="d-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
const ICON_CHEVRON = '<svg class="d-ico lang-chevron" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>';
const ICON_CHECK = '<svg class="d-ico lang-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

export function createLangPicker(select) {
  const wrap = document.createElement("div");
  wrap.className = "lang-picker";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "lang-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `${ICON_GLOBE}<span class="lang-current"></span>${ICON_CHEVRON}`;
  const menu = document.createElement("ul");
  menu.className = "lang-menu d-glass";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  for (const opt of select.options) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.value = opt.value;
    li.tabIndex = -1;
    li.innerHTML = `<span>${opt.textContent}</span>${ICON_CHECK}`;
    menu.appendChild(li);
  }
  wrap.append(btn, menu);
  select.after(wrap);
  select.hidden = true;

  const items = [...menu.children];
  const label = btn.querySelector(".lang-current");

  function sync() {
    const opt = select.options[select.selectedIndex];
    label.textContent = opt ? opt.textContent : "";
    btn.title = label.textContent;
    items.forEach((li) => li.setAttribute("aria-selected", String(li.dataset.value === select.value)));
  }

  function open() {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    wrap.classList.add("open");
    const cur = items.find((li) => li.dataset.value === select.value) || items[0];
    cur.focus({ preventScroll: true });
    cur.scrollIntoView({ block: "nearest" });
    document.addEventListener("pointerdown", onOutside, true);
  }

  function close(refocus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    wrap.classList.remove("open");
    document.removeEventListener("pointerdown", onOutside, true);
    if (refocus) btn.focus();
  }

  function choose(value) {
    close(true);
    if (value === select.value) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
  }

  function onOutside(e) {
    if (!wrap.contains(e.target)) close();
  }

  btn.addEventListener("click", () => (menu.hidden ? open() : close()));
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); open(); }
  });
  menu.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li) choose(li.dataset.value);
  });
  menu.addEventListener("keydown", (e) => {
    const i = items.indexOf(document.activeElement);
    const go = (n) => { const li = items[(n + items.length) % items.length]; li.focus(); li.scrollIntoView({ block: "nearest" }); };
    if (e.key === "ArrowDown") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (i >= 0) choose(items[i].dataset.value); }
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(true); }
  });

  sync();
  return { sync, close };
}
