// profile.js — profile.html
import { db } from "./firebase-config.js";
import {
  collection, collectionGroup, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { initAuthUI, authReady, currentUser } from "./auth.js";
import { formatPrice, formatDate, categoryLabel, starString, qs, qsa, escapeHtml, toast } from "./utils.js";

initAuthUI();

const STATUS_LABEL = {
  pending: "Ожидает обработки",
  processing: "В обработке",
  shipped: "Отправлен",
  completed: "Завершён",
  cancelled: "Отменён",
};

authReady.then((user) => {
  if (!user) { qs("#loggedOutState").classList.remove("hidden"); return; }
  qs("#profileLayout").classList.remove("hidden");
  watchOrders(user.uid);
  loadMyReviews(user.uid);
  fillSettings(user);
});

// ---------------- Panels ----------------
qsa(".profile-nav button[data-panel]").forEach((btn) =>
  btn.addEventListener("click", () => {
    qsa(".profile-nav button[data-panel]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    ["orders", "reviews", "settings"].forEach((p) =>
      qs(`#panel-${p}`).classList.toggle("hidden", p !== btn.dataset.panel)
    );
  })
);

// ---------------- Orders (realtime) ----------------
function watchOrders(uid) {
  const q = query(collection(db, "orders"), where("userId", "==", uid), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    qs("#ordersEmpty").classList.toggle("hidden", orders.length > 0);
    qs("#ordersList").innerHTML = orders.map(orderCard).join("");
  }, (err) => {
    qs("#ordersList").innerHTML = `<p style="color:var(--danger);font-size:13px;">${escapeHtml(err.message)}</p>`;
  });
}

function orderCard(o) {
  const itemsText = o.items.map((i) => `${i.name} × ${i.qty}`).join(", ");
  return `
  <div class="order-card">
    <div class="order-card__head">
      <div>
        <span class="order-id">№ ${o.id.slice(0, 8).toUpperCase()}</span>
        <span style="color:var(--ink-soft);font-size:12.5px;"> · ${o.createdAt ? formatDate(o.createdAt) : "..."}</span>
      </div>
      <span class="status-pill status-${o.status}">${STATUS_LABEL[o.status] || o.status}</span>
    </div>
    <div class="order-items">${escapeHtml(itemsText)}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
      <span style="font-size:12.5px;color:var(--ink-soft)">Доставка: ${escapeHtml(o.address || "—")}</span>
      <span class="price">${formatPrice(o.total)}</span>
    </div>
  </div>`;
}

// ---------------- My reviews (collectionGroup query) ----------------
async function loadMyReviews(uid) {
  try {
    const q = query(collectionGroup(db, "reviews"), where("userId", "==", uid));
    onSnapshot(q, async (snap) => {
      const reviews = snap.docs.map((d) => ({ id: d.id, productId: d.ref.parent.parent.id, ...d.data() }));
      qs("#reviewsEmpty").classList.toggle("hidden", reviews.length > 0);
      if (!reviews.length) { qs("#reviewsList").innerHTML = ""; return; }

      const withNames = await Promise.all(reviews.map(async (r) => {
        const psnap = await getDoc(doc(db, "products", r.productId));
        return { ...r, productName: psnap.exists() ? psnap.data().name : "Товар удалён" };
      }));

      qs("#reviewsList").innerHTML = withNames.map(myReviewCard).join("");
      qsa("[data-del-my-review]").forEach((b) =>
        b.addEventListener("click", () => deleteMyReview(b.dataset.delMyReview, b.dataset.productId))
      );
    });
  } catch (e) {
    qs("#reviewsList").innerHTML = `<p style="font-size:13px;color:var(--ink-soft);">Не удалось загрузить отзывы: ${escapeHtml(e.message)}</p>`;
  }
}

function myReviewCard(r) {
  return `
  <div class="review">
    <div class="review__head">
      <a href="product.html?id=${r.productId}" class="review__author" style="text-decoration:underline">${escapeHtml(r.productName)}</a>
      <span class="stars">${starString(r.rating)}</span>
    </div>
    <div class="review__text">${escapeHtml(r.text)}</div>
    <div class="review__actions">
      <a href="product.html?id=${r.productId}">Редактировать</a>
      <button data-del-my-review="${r.id}" data-product-id="${r.productId}">Удалить</button>
    </div>
  </div>`;
}

async function deleteMyReview(reviewId, productId) {
  if (!confirm("Удалить отзыв?")) return;
  await deleteDoc(doc(db, "products", productId, "reviews", reviewId));
  toast("Отзыв удалён");
}

// ---------------- Settings ----------------
function fillSettings(user) {
  qs("#settingsName").value = user.name || "";
  qs("#settingsEmail").value = user.email || "";
  qs("#settingsPhone").value = user.phone || "";
  qs("#settingsAddress").value = user.address || "";
}

qs("#settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await updateDoc(doc(db, "users", currentUser.uid), {
    name: qs("#settingsName").value.trim(),
    phone: qs("#settingsPhone").value.trim(),
    address: qs("#settingsAddress").value.trim(),
  });
  toast("Профиль обновлён", "ok");
});
