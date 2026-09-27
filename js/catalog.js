// catalog.js — index.html: catalog with realtime updates, pagination,
// Firestore-backed search, category/brand filters and sorting.
import { db } from "./firebase-config.js";
import {
  collection, query, where, orderBy, limit, onSnapshot, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { initAuthUI } from "./auth.js";
import { categoryGlyph, categoryMediaStyle, productMediaHtml } from "./icons.js";
import { formatPrice, starString, debounce, CATEGORIES, categoryLabel, qs, qsa, escapeHtml } from "./utils.js";

initAuthUI();

const grid = qs("#productGrid");
const emptyState = qs("#emptyState");
const loadMoreBtn = qs("#loadMoreBtn");
const resultCount = qs("#resultCount");
const searchInput = qs("#searchInput");
const sortSelect = qs("#sortSelect");
const brandSelect = qs("#brandSelect");
const inStockOnly = qs("#inStockOnly");
const categoryChips = qs("#categoryChips");
const clearFiltersBtn = qs("#clearFilters");

const state = {
  category: "",
  brand: "",
  inStockOnly: false,
  sort: "new",
  search: "",
  pageSize: 12,
};

let unsub = null;
let knownBrands = new Set();
let lastSnapshotSize = 0;

// ---- Category chips ----
function renderChips() {
  categoryChips.innerHTML =
    `<button class="chip ${state.category === "" ? "active" : ""}" data-cat="">Все категории</button>` +
    CATEGORIES.map(
      (c) => `<button class="chip ${state.category === c.id ? "active" : ""}" data-cat="${c.id}">${c.label}</button>`
    ).join("");
  qsa(".chip", categoryChips).forEach((btn) =>
    btn.addEventListener("click", () => {
      state.category = btn.dataset.cat;
      state.pageSize = 12;
      renderChips();
      subscribe();
    })
  );
}
renderChips();

// ---- Build + run the live query ----
function buildQuery() {
  const col = collection(db, "products");
  const clauses = [];
  if (state.category) clauses.push(where("category", "==", state.category));
  if (state.brand) clauses.push(where("brand", "==", state.brand));
  if (state.inStockOnly) clauses.push(where("stock", ">", 0));

  let tokens = [];
  if (state.search.trim()) {
    tokens = state.search.toLowerCase().trim().split(/\s+/).slice(0, 10);
    clauses.push(where("keywords", "array-contains-any", tokens));
  }

  let sortField = "createdAt", sortDir = "desc";
  if (state.sort === "price_asc") { sortField = "price"; sortDir = "asc"; }
  if (state.sort === "price_desc") { sortField = "price"; sortDir = "desc"; }
  if (state.sort === "rating") { sortField = "rating"; sortDir = "desc"; }

  // When doing an array-contains-any search, Firestore requires the first
  // orderBy to be on the filtered field if we also want stable pagination;
  // to keep this simple we rank matches client-side by keyword overlap
  // instead of asking Firestore to also sort them.
  if (tokens.length) {
    return { q: query(col, ...clauses, limit(200)), clientSearch: tokens };
  }

  // Firestore requires that when a range/inequality filter is present
  // (here: stock > 0), the FIRST orderBy must be on that same field. So
  // when "in stock only" is active, sort by stock first, then by the
  // user's chosen field as a tie-breaker.
  const orderClauses = state.inStockOnly
    ? [orderBy("stock", "desc"), orderBy(sortField, sortDir)]
    : [orderBy(sortField, sortDir)];

  return { q: query(col, ...clauses, ...orderClauses, limit(state.pageSize)) };
}

function subscribe() {
  if (unsub) unsub();
  renderSkeleton();
  const { q, clientSearch } = buildQuery();
  unsub = onSnapshot(
    q,
    (snap) => {
      let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      docs.forEach((p) => (p.brand ? knownBrands.add(p.brand) : null));
      refreshBrandOptions();

      if (clientSearch) {
        docs = docs
          .map((p) => ({ p, score: clientSearch.filter((t) => (p.keywords || []).includes(t)).length }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((x) => x.p);
        applyClientSort(docs);
        docs = docs.slice(0, state.pageSize);
      }

      lastSnapshotSize = snap.size;
      renderGrid(docs);
      loadMoreBtn.classList.toggle("hidden", clientSearch ? docs.length >= snap.size : snap.size < state.pageSize);
    },
    (err) => {
      console.error(err);
      grid.innerHTML = `<div class="state-block"><h3>Не удалось загрузить каталог</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  );
}

function applyClientSort(docs) {
  if (state.sort === "price_asc") docs.sort((a, b) => a.price - b.price);
  if (state.sort === "price_desc") docs.sort((a, b) => b.price - a.price);
  if (state.sort === "rating") docs.sort((a, b) => (b.rating || 0) - (a.rating || 0));
}

function refreshBrandOptions() {
  const current = brandSelect.value;
  brandSelect.innerHTML =
    `<option value="">Все бренды</option>` +
    [...knownBrands].sort().map((b) => `<option value="${b}">${b}</option>`).join("");
  brandSelect.value = current;
}

function renderSkeleton() {
  grid.innerHTML = Array.from({ length: 8 })
    .map(() => `<div class="card"><div class="skeleton" style="aspect-ratio:4/3"></div><div style="padding:14px"><div class="skeleton" style="height:14px;margin-bottom:8px"></div><div class="skeleton" style="height:14px;width:60%"></div></div></div>`)
    .join("");
}

function renderGrid(docs) {
  emptyState.classList.toggle("hidden", docs.length > 0);
  resultCount.textContent = docs.length ? `${docs.length} позиций` : "";
  if (!docs.length) { grid.innerHTML = ""; return; }

  grid.innerHTML = docs.map(cardHtml).join("");
}

function cardHtml(p) {
  const outOfStock = (p.stock ?? 0) <= 0;
  return `
  <a class="card" href="product.html?id=${p.id}">
    <div class="card__media" style="${categoryMediaStyle(p.category)}${p.imageUrl ? "padding:0;" : ""}">
      ${outOfStock ? '<span class="card__stock-flag">Нет в наличии</span>' : ""}
      ${productMediaHtml(p)}
    </div>
    <div class="card__body">
      <div class="card__cat">${categoryLabel(p.category)}</div>
      <div class="card__title">${escapeHtml(p.name)}</div>
      <div class="card__meta"><span class="stars">${starString(p.rating)}</span><span>(${p.reviewCount || 0})</span></div>
      <div class="card__footer">
        <div class="price">${formatPrice(p.price)}</div>
        <span style="font-size:11px;color:var(--ink-soft)">${p.brand || ""}</span>
      </div>
    </div>
  </a>`;
}

// ---- Stats (hero panel) ----
async function loadStats() {
  try {
    const totalSnap = await getCountFromServer(collection(db, "products"));
    qs("#statProducts").textContent = totalSnap.data().count;
    qs("#statCats").textContent = CATEGORIES.length;

    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const newSnap = await getCountFromServer(query(collection(db, "products"), where("createdAt", ">=", weekAgo)));
    qs("#statNew").textContent = newSnap.data().count;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const ordersSnap = await getCountFromServer(query(collection(db, "orders"), where("createdAt", ">=", todayStart)));
    qs("#statToday").textContent = ordersSnap.data().count;
  } catch (e) {
    // Stats are decorative — fail quietly (e.g. before seed data exists)
    qs("#statProducts").textContent = "0";
    qs("#statNew").textContent = "0";
    qs("#statToday").textContent = "0";
  }
}
loadStats();

// ---- Wiring ----
searchInput.addEventListener("input", debounce((e) => {
  state.search = e.target.value;
  state.pageSize = 12;
  subscribe();
}, 400));

sortSelect.addEventListener("change", (e) => { state.sort = e.target.value; subscribe(); });
brandSelect.addEventListener("change", (e) => { state.brand = e.target.value; state.pageSize = 12; subscribe(); });
inStockOnly.addEventListener("change", (e) => { state.inStockOnly = e.target.checked; state.pageSize = 12; subscribe(); });
loadMoreBtn.addEventListener("click", () => { state.pageSize += 12; subscribe(); });
clearFiltersBtn.addEventListener("click", () => {
  state.category = ""; state.brand = ""; state.inStockOnly = false; state.search = ""; state.sort = "new"; state.pageSize = 12;
  searchInput.value = ""; sortSelect.value = "new"; brandSelect.value = ""; inStockOnly.checked = false;
  renderChips();
  subscribe();
});

subscribe();
