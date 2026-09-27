// admin.js — admin.html
import { db } from "./firebase-config.js";
import {
  collection, collectionGroup, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp, getCountFromServer, where, getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { authReady, requireAdmin, initAuthUI } from "./auth.js";
import { formatPrice, formatDate, categoryLabel, CATEGORIES, qs, qsa, escapeHtml, toast } from "./utils.js";
import { categoryGlyph, categoryMediaStyle, productMediaHtml } from "./icons.js";

initAuthUI();

authReady.then((user) => {
  if (!requireAdmin()) return;
  qs("#gate").classList.add("hidden");
  qs("#adminShell").classList.remove("hidden");
  boot();
});

const STATUS_LABEL = {
  pending: "Ожидает обработки", processing: "В обработке", shipped: "Отправлен",
  completed: "Завершён", cancelled: "Отменён",
};

let productsCache = [];
let ordersCache = [];
let usersCache = [];

function boot() {
  wireNav();
  fillCategorySelects();
  loadDashboard();
  watchProducts();
  watchOrders();
  watchUsers();
  watchReviews();
  wireProductModal();
}

// ---------------- Section nav ----------------
function wireNav() {
  qsa(".admin-side button[data-section]").forEach((btn) =>
    btn.addEventListener("click", () => {
      qsa(".admin-side button[data-section]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      qsa("main > section").forEach((s) => s.classList.toggle("hidden", s.id !== `section-${btn.dataset.section}`));
    })
  );
}

function fillCategorySelects() {
  const opts = CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
  qs("#pfCategory").innerHTML = opts;
  qs("#adminCategoryFilter").innerHTML = `<option value="">Все категории</option>` + opts;
}

// ---------------- Dashboard ----------------
async function loadDashboard() {
  const [pCount, oCount, pendingCount, uCount] = await Promise.all([
    getCountFromServer(collection(db, "products")).catch(() => ({ data: () => ({ count: 0 }) })),
    getCountFromServer(collection(db, "orders")).catch(() => ({ data: () => ({ count: 0 }) })),
    getCountFromServer(query(collection(db, "orders"), where("status", "==", "pending"))).catch(() => ({ data: () => ({ count: 0 }) })),
    getCountFromServer(collection(db, "users")).catch(() => ({ data: () => ({ count: 0 }) })),
  ]);
  qs("#dashProducts").textContent = pCount.data().count;
  qs("#dashOrders").textContent = oCount.data().count;
  qs("#dashPending").textContent = pendingCount.data().count;
  qs("#dashUsers").textContent = uCount.data().count;

  onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(8)), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    qs("#dashRecentOrders").innerHTML = rows.map((o) => `
      <tr>
        <td class="order-id">${o.id.slice(0, 6).toUpperCase()}</td>
        <td>${escapeHtml(o.userName || "—")}</td>
        <td>${escapeHtml((o.items || []).map((i) => i.name).join(", ").slice(0, 60))}</td>
        <td>${formatPrice(o.total)}</td>
        <td><span class="status-pill status-${o.status}">${STATUS_LABEL[o.status] || o.status}</span></td>
        <td>${o.createdAt ? formatDate(o.createdAt) : "..."}</td>
      </tr>`).join("") || `<tr><td colspan="6" style="color:var(--ink-soft)">Заказов пока нет</td></tr>`;
  });
}

// ---------------- Products ----------------
function watchProducts() {
  onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snap) => {
    productsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderProductsTable();
  });
}

function renderProductsTable() {
  const term = qs("#adminProductSearch").value.trim().toLowerCase();
  const cat = qs("#adminCategoryFilter").value;
  const rows = productsCache.filter((p) =>
    (!term || p.name.toLowerCase().includes(term)) && (!cat || p.category === cat)
  );
  qs("#productsTable").innerHTML = rows.map((p) => `
    <tr>
      <td><div class="thumb-tiny" style="${categoryMediaStyle(p.category)}${p.imageUrl ? "padding:0;" : ""}">${productMediaHtml(p)}</div></td>
      <td>${escapeHtml(p.name)}</td>
      <td>${categoryLabel(p.category)}</td>
      <td>${escapeHtml(p.brand || "")}</td>
      <td>${formatPrice(p.price)}</td>
      <td>${p.stock ?? 0}</td>
      <td>${(p.rating || 0).toFixed(1)} (${p.reviewCount || 0})</td>
      <td class="row-actions">
        <button data-edit="${p.id}">Изменить</button>
        <button data-delete="${p.id}">Удалить</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="8" style="color:var(--ink-soft)">Ничего не найдено</td></tr>`;

  qsa("[data-edit]").forEach((b) => b.addEventListener("click", () => openProductModal(b.dataset.edit)));
  qsa("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteProduct(b.dataset.delete)));
}
qs("#adminProductSearch").addEventListener("input", renderProductsTable);
qs("#adminCategoryFilter").addEventListener("change", renderProductsTable);

function buildKeywords(...fields) {
  const text = fields.join(" ").toLowerCase();
  const tokens = text.match(/[a-zа-я0-9]+/gi) || [];
  return [...new Set(tokens)].slice(0, 40);
}

function wireProductModal() {
  qs("#newProductBtn").addEventListener("click", () => openProductModal(null));
  qs("#productModalClose").addEventListener("click", closeProductModal);
  qs("#productModal").addEventListener("click", (e) => { if (e.target.id === "productModal") closeProductModal(); });

  qs("#productForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = qs("#pfId").value;
    const name = qs("#pfName").value.trim();
    const brand = qs("#pfBrand").value.trim();
    const category = qs("#pfCategory").value;
    const price = Number(qs("#pfPrice").value);
    const stock = Number(qs("#pfStock").value);
    const model = qs("#pfModel").value.trim();
    const imageUrl = qs("#pfImageUrl").value.trim();
    const description = qs("#pfDescription").value.trim();
    const specs = parseSpecs(qs("#pfSpecs").value);

    const payload = {
      name, brand, category, price, stock, model, description, specs,
      imageUrl: imageUrl || null,
      keywords: buildKeywords(name, brand, model, category, description),
    };

    try {
      if (id) {
        await updateDoc(doc(db, "products", id), payload);
        toast("Товар обновлён", "ok");
      } else {
        await addDoc(collection(db, "products"), { ...payload, rating: 0, reviewCount: 0, createdAt: serverTimestamp() });
        toast("Товар добавлен", "ok");
      }
      closeProductModal();
    } catch (err) {
      toast(err.message, "err");
    }
  });
}

function parseSpecs(text) {
  const specs = {};
  text.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx > -1) specs[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return specs;
}

function openProductModal(id) {
  const p = productsCache.find((x) => x.id === id);
  qs("#productModalTitle").textContent = p ? "Изменить товар" : "Новый товар";
  qs("#pfId").value = p?.id || "";
  qs("#pfName").value = p?.name || "";
  qs("#pfBrand").value = p?.brand || "";
  qs("#pfCategory").value = p?.category || CATEGORIES[0].id;
  qs("#pfPrice").value = p?.price ?? "";
  qs("#pfStock").value = p?.stock ?? "";
  qs("#pfModel").value = p?.model || "";
  qs("#pfImageUrl").value = p?.imageUrl || "";
  qs("#pfDescription").value = p?.description || "";
  qs("#pfSpecs").value = p ? Object.entries(p.specs || {}).map(([k, v]) => `${k}: ${v}`).join("\n") : "";
  qs("#productModal").classList.remove("hidden");
}
function closeProductModal() { qs("#productModal").classList.add("hidden"); }

async function deleteProduct(id) {
  if (!confirm("Удалить товар безвозвратно?")) return;
  await deleteDoc(doc(db, "products", id));
  toast("Товар удалён");
}



// ---------------- Orders ----------------
function watchOrders() {
  onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
    ordersCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrdersTable();
  });
}
function renderOrdersTable() {
  const statusFilter = qs("#orderStatusFilter").value;
  const rows = ordersCache.filter((o) => !statusFilter || o.status === statusFilter);
  qs("#ordersTable").innerHTML = rows.map((o) => `
    <tr>
      <td class="order-id">${o.id.slice(0, 6).toUpperCase()}</td>
      <td>${escapeHtml(o.userName || "—")}</td>
      <td>${escapeHtml((o.items || []).map((i) => `${i.name} ×${i.qty}`).join(", ").slice(0, 70))}</td>
      <td>${formatPrice(o.total)}</td>
      <td>${escapeHtml(o.address || "—")}</td>
      <td>
        <select data-status="${o.id}">
          ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${o.status === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </td>
      <td>${o.createdAt ? formatDate(o.createdAt) : "..."}</td>
    </tr>`).join("") || `<tr><td colspan="7" style="color:var(--ink-soft)">Заказов нет</td></tr>`;

  qsa("[data-status]").forEach((sel) =>
    sel.addEventListener("change", async () => {
      await updateDoc(doc(db, "orders", sel.dataset.status), { status: sel.value });
      toast("Статус заказа обновлён", "ok");
    })
  );
}
qs("#orderStatusFilter").addEventListener("change", renderOrdersTable);

// ---------------- Users ----------------
function watchUsers() {
  onSnapshot(collection(db, "users"), (snap) => {
    usersCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderUsersTable();
  });
}
function renderUsersTable() {
  qs("#usersTable").innerHTML = usersCache.map((u) => `
    <tr>
      <td>${escapeHtml(u.name || "—")}</td>
      <td>${escapeHtml(u.email || "—")}</td>
      <td><span class="status-pill ${u.role === "admin" ? "status-shipped" : "status-processing"}">${u.role || "user"}</span></td>
      <td>${u.createdAt ? formatDate(u.createdAt) : "—"}</td>
      <td class="row-actions">
        <button data-toggle-role="${u.id}" data-current="${u.role || "user"}">
          ${u.role === "admin" ? "Снять права админа" : "Сделать админом"}
        </button>
      </td>
    </tr>`).join("");

  qsa("[data-toggle-role]").forEach((b) =>
    b.addEventListener("click", async () => {
      const newRole = b.dataset.current === "admin" ? "user" : "admin";
      await updateDoc(doc(db, "users", b.dataset.toggleRole), { role: newRole });
      toast(`Роль изменена на «${newRole}»`, "ok");
    })
  );
}

// ---------------- Reviews moderation ----------------
function watchReviews() {
  onSnapshot(collectionGroup(db, "reviews"), async (snap) => {
    const reviews = snap.docs.map((d) => ({ id: d.id, productId: d.ref.parent.parent.id, ...d.data() }));
    const productNames = {};
    productsCache.forEach((p) => (productNames[p.id] = p.name));
    qs("#reviewsTable").innerHTML = reviews.map((r) => `
      <tr>
        <td>${escapeHtml(productNames[r.productId] || r.productId)}</td>
        <td>${escapeHtml(r.userName || "—")}</td>
        <td>${"★".repeat(r.rating || 0)}</td>
        <td style="max-width:320px;">${escapeHtml((r.text || "").slice(0, 140))}</td>
        <td class="row-actions"><button data-mod-delete="${r.id}" data-product="${r.productId}">Удалить</button></td>
      </tr>`).join("") || `<tr><td colspan="5" style="color:var(--ink-soft)">Отзывов нет</td></tr>`;

    qsa("[data-mod-delete]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Удалить этот отзыв?")) return;
        await deleteDoc(doc(db, "products", b.dataset.product, "reviews", b.dataset.modDelete));
        const revSnap = await getDocs(collection(db, "products", b.dataset.product, "reviews"));
        const ratings = revSnap.docs.map((d) => d.data().rating || 0);
        const avg = ratings.length ? ratings.reduce((a, c) => a + c, 0) / ratings.length : 0;
        await updateDoc(doc(db, "products", b.dataset.product), { rating: avg, reviewCount: ratings.length });
        toast("Отзыв удалён (модерация)");
      })
    );
  });
}
