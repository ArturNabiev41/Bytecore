// product.js — product.html
import { db } from "./firebase-config.js";
import {
  doc, onSnapshot, collection, query, where, limit, getDocs,
  addDoc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp, increment, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { initAuthUI, authReady, currentUser, requireLogin } from "./auth.js";
import { categoryGlyph, categoryMediaStyle, productMediaHtml } from "./icons.js";
import { formatPrice, starString, formatDate, categoryLabel, getUrlParam, qs, qsa, escapeHtml, toast } from "./utils.js";

initAuthUI();

const productId = getUrlParam("id");
if (!productId) location.href = "index.html";

let product = null;
let myReview = null;

// ---------------- Load product (realtime — stock/status updates live) ----------------
onSnapshot(doc(db, "products", productId), (snap) => {
  if (!snap.exists()) {
    qs("#pdRoot").classList.add("hidden");
    qs("#notFound").classList.remove("hidden");
    return;
  }
  product = { id: snap.id, ...snap.data() };
  renderProduct();
  loadRelated();
});

function renderProduct() {
  document.title = `${product.name} — ByteCore`;
  qs("#crumbCategory").innerHTML = `<a href="index.html">${categoryLabel(product.category)}</a>`;
  qs("#crumbName").textContent = product.name;

  const stock = product.stock ?? 0;
  const stockClass = stock <= 0 ? "out" : stock <= 5 ? "low" : "in";
  const stockText = stock <= 0 ? "Нет в наличии" : stock <= 5 ? `Осталось ${stock} шт.` : "В наличии";

  qs("#pdRoot").innerHTML = `
    <div class="pd__media" style="${categoryMediaStyle(product.category)}${product.imageUrl ? "padding:0;" : ""}">${productMediaHtml(product)}</div>
    <div>
      <div class="pd__cat">${categoryLabel(product.category)} · ${escapeHtml(product.brand || "")}</div>
      <h1>${escapeHtml(product.name)}</h1>
      <div class="pd__meta">
        <span class="stars">${starString(product.rating)}</span>
        <span>${(product.rating || 0).toFixed(1)} · ${product.reviewCount || 0} отзывов</span>
        <span>·</span><span>SKU ${product.id.slice(0, 8).toUpperCase()}</span>
      </div>
      <div class="pd__price">${formatPrice(product.price)}</div>
      <div class="pd__stock ${stockClass}">${stockText}</div>
      <div class="pd__qty">
        <div class="qty-stepper">
          <button type="button" id="qtyMinus">−</button>
          <input type="text" id="qtyInput" value="1" inputmode="numeric">
          <button type="button" id="qtyPlus">+</button>
        </div>
      </div>
      <div class="pd__actions">
        <button class="btn btn-copper" id="addToCartBtn" ${stock <= 0 ? "disabled" : ""}>Добавить в корзину</button>
        <a href="cart.html" class="btn btn-outline">Перейти в корзину</a>
      </div>
      <p class="pd__desc">${escapeHtml(product.description || "")}</p>
      <table class="spec-table">
        ${Object.entries(product.specs || {}).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`).join("")}
      </table>
    </div>
  `;
  qs("#pdContent").classList.remove("hidden");
  qs("#reviewCount").textContent = product.reviewCount || 0;

  wireQtyStepper(stock);
  qs("#addToCartBtn")?.addEventListener("click", addToCart);
  loadReviews();
}

function wireQtyStepper(stock) {
  const input = qs("#qtyInput");
  qs("#qtyMinus").addEventListener("click", () => { input.value = Math.max(1, +input.value - 1); });
  qs("#qtyPlus").addEventListener("click", () => { input.value = Math.min(stock || 99, +input.value + 1); });
}

// ---------------- Cart ----------------
async function addToCart() {
  const ok = await requireLogin("Войдите, чтобы добавить товар в корзину");
  if (!ok) return;
  const qty = Math.max(1, +qs("#qtyInput").value || 1);
  const ref = doc(db, "users", currentUser.uid, "cart", product.id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await updateDoc(ref, { qty: increment(qty) });
  } else {
    await setDoc(ref, {
      productId: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      imageUrl: product.imageUrl || null,
      qty,
      addedAt: serverTimestamp(),
    });
  }
  toast("Добавлено в корзину", "ok");
}

// ---------------- Tabs ----------------
qsa(".tabs-nav button").forEach((btn) =>
  btn.addEventListener("click", () => {
    qsa(".tabs-nav button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    qs("#tab-reviews").classList.toggle("hidden", btn.dataset.tab !== "reviews");
    qs("#tab-related").classList.toggle("hidden", btn.dataset.tab !== "related");
  })
);

// ---------------- Reviews ----------------
let selectedRating = 5;
function wireRatingInput() {
  const stars = qsa("#ratingInput span");
  const paint = (n) => stars.forEach((s) => s.classList.toggle("active", +s.dataset.star <= n));
  stars.forEach((s) =>
    s.addEventListener("click", () => { selectedRating = +s.dataset.star; paint(selectedRating); })
  );
  paint(selectedRating);
}
wireRatingInput();

async function loadReviews() {
  await authReady;
  const canReview = !!currentUser;
  qs("#loginToReview").classList.toggle("hidden", canReview);

  const snap = await getDocs(query(collection(db, "products", productId, "reviews"), limit(100)));
  const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  myReview = currentUser ? reviews.find((r) => r.userId === currentUser.uid) : null;

  if (canReview) {
    qs("#reviewForm").classList.remove("hidden");
    if (myReview) {
      selectedRating = myReview.rating;
      qs("#reviewText").value = myReview.text;
      wireRatingInput();
      qs("#submitReview").textContent = "Обновить отзыв";
    } else {
      qs("#submitReview").textContent = "Опубликовать";
    }
  }

  qs("#reviewList").innerHTML = reviews.length
    ? reviews.map(reviewHtml).join("")
    : `<p style="color:var(--ink-soft);font-size:13.5px;">Пока нет отзывов — станьте первым.</p>`;

  qsa("[data-del-review]").forEach((b) => b.addEventListener("click", () => deleteReview(b.dataset.delReview)));
}

function reviewHtml(r) {
  const mine = currentUser && r.userId === currentUser.uid;
  return `
  <div class="review">
    <div class="review__head">
      <div>
        <span class="review__author">${escapeHtml(r.userName)}</span>
        <span class="stars" style="margin-left:8px;">${starString(r.rating)}</span>
      </div>
      <span class="review__date">${r.createdAt ? formatDate(r.createdAt) : ""}</span>
    </div>
    <div class="review__text">${escapeHtml(r.text)}</div>
    ${mine ? `<div class="review__actions"><button data-del-review="${r.id}">Удалить</button></div>` : ""}
  </div>`;
}

qs("#submitReview")?.addEventListener("click", async () => {
  const ok = await requireLogin("Войдите, чтобы оставить отзыв");
  if (!ok) return;
  const text = qs("#reviewText").value.trim();
  if (!text) return toast("Напишите текст отзыва", "err");

  const reviewRef = doc(db, "products", productId, "reviews", currentUser.uid);
  const isNew = !myReview;
  await setDoc(reviewRef, {
    userId: currentUser.uid,
    userName: currentUser.name || currentUser.email,
    rating: selectedRating,
    text,
    createdAt: myReview?.createdAt || serverTimestamp(),
  });
  await recomputeRating();
  toast(isNew ? "Отзыв опубликован" : "Отзыв обновлён", "ok");
  loadReviews();
});

async function deleteReview(id) {
  if (!confirm("Удалить отзыв?")) return;
  await deleteDoc(doc(db, "products", productId, "reviews", id));
  await recomputeRating();
  toast("Отзыв удалён");
  loadReviews();
}

// Recompute product.rating / reviewCount from the reviews subcollection.
// A real production app would do this in a Cloud Function trigger; done
// client-side here since this project only uses Firestore + Auth.
async function recomputeRating() {
  const snap = await getDocs(collection(db, "products", productId, "reviews"));
  const ratings = snap.docs.map((d) => d.data().rating || 0);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  await updateDoc(doc(db, "products", productId), { rating: avg, reviewCount: ratings.length });
}

// ---------------- Related products ----------------
async function loadRelated() {
  const snap = await getDocs(query(collection(db, "products"), where("category", "==", product.category), limit(9)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.id !== product.id).slice(0, 8);
  qs("#relatedGrid").innerHTML = items.length
    ? items.map(relatedCard).join("")
    : `<p style="color:var(--ink-soft);font-size:13.5px;">Похожих товаров пока нет.</p>`;
}

function relatedCard(p) {
  return `
  <a class="card" href="product.html?id=${p.id}">
    <div class="card__media" style="${categoryMediaStyle(p.category)}${p.imageUrl ? "padding:0;" : ""}">${productMediaHtml(p)}</div>
    <div class="card__body">
      <div class="card__cat">${categoryLabel(p.category)}</div>
      <div class="card__title">${escapeHtml(p.name)}</div>
      <div class="card__footer"><div class="price">${formatPrice(p.price)}</div></div>
    </div>
  </a>`;
}
