// utils.js — small shared helpers used across every page

export function formatPrice(v) {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0 }).format(v) + " ₸";
}

export function formatDate(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export function debounce(fn, ms = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function starString(rating = 0) {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const CATEGORIES = [
  { id: "prebuilt", label: "Готовые ПК" },
  { id: "cpu", label: "Процессоры" },
  { id: "gpu", label: "Видеокарты" },
  { id: "motherboard", label: "Материнские платы" },
  { id: "ram", label: "Оперативная память" },
  { id: "storage", label: "Накопители" },
  { id: "psu", label: "Блоки питания" },
  { id: "case", label: "Корпусы" },
  { id: "cooling", label: "Охлаждение" },
  { id: "monitor", label: "Мониторы" },
  { id: "peripheral", label: "Периферия" },
];

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || id;
}

// ---- Toasts ----
function toastStack() {
  let el = document.querySelector(".toast-stack");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast-stack";
    document.body.appendChild(el);
  }
  return el;
}

export function toast(message, type = "") {
  const stack = toastStack();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---- Local cart-count cache (avoids a flash of 0 before Firestore responds) ----
export function setCartBadge(n) {
  document.querySelectorAll("[data-cart-badge]").forEach((el) => {
    el.textContent = n;
    el.style.display = n > 0 ? "flex" : "none";
  });
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}
export function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function getUrlParam(name) {
  return new URLSearchParams(location.search).get(name);
}

// ---- Loud, unmissable setup warnings ----
// A half-configured Firebase project fails *silently*: the catalog just
// stays empty and the login button does nothing, with no visible error.
// These banners turn that into an obvious, actionable message on the page
// itself instead of something only visible in DevTools.
export function showBanner(message, id) {
  if (document.getElementById(id)) return;
  const bar = document.createElement("div");
  bar.id = id;
  bar.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:999;background:#b23a2f;color:#fff;" +
    "font-family:system-ui,sans-serif;font-size:13.5px;padding:10px 16px;text-align:center;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.25);";
  bar.innerHTML = message;
  document.body.prepend(bar);
  document.body.style.paddingTop = bar.offsetHeight + "px";
}

export function showConfigWarning(isPlaceholderConfig) {
  if (!isPlaceholderConfig) return;
  showBanner(
    '⚠️ Firebase не настроен: в <code>js/firebase-config.js</code> всё ещё стоят placeholder-значения ' +
    '("YOUR_API_KEY" и т.д.). Каталог и вход не будут работать, пока вы не впишете туда настоящий конфиг ' +
    'вашего проекта из Firebase Console → Project settings. Подробности в README.md.',
    "configWarningBanner"
  );
}

// If a product's photo (imageUrl) fails to load — broken link, hotlink
// blocked, wrong URL typed in the admin form — fall back to the category
// glyph instead of showing a broken-image icon. Wired up as a global because
// it's referenced from an inline onerror="" attribute (see icons.js).
window.__bcImgFallback = function (img) {
  img.style.display = "none";
  const fallback = img.nextElementSibling;
  if (fallback) fallback.style.display = "flex";
};
