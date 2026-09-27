// cart.js — cart.html
import { db } from "./firebase-config.js";
import {
  collection, doc, onSnapshot, updateDoc, deleteDoc, addDoc, serverTimestamp,
  runTransaction, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { initAuthUI, authReady, currentUser } from "./auth.js";
import { categoryGlyph, categoryMediaStyle, productMediaHtml } from "./icons.js";
import { formatPrice, categoryLabel, qs, qsa, escapeHtml, toast } from "./utils.js";

initAuthUI();

let items = [];
let unsub = null;

authReady.then((user) => {
  if (!user) {
    qs("#loggedOutState").classList.remove("hidden");
    return;
  }
  watchCart(user.uid);
});

function watchCart(uid) {
  unsub = onSnapshot(collection(db, "users", uid, "cart"), (snap) => {
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}

function render() {
  const layout = qs("#cartLayout");
  const empty = qs("#emptyCart");
  if (!items.length) {
    layout.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  layout.classList.remove("hidden");

  qs("#cartItems").innerHTML = items.map(rowHtml).join("");

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  qs("#sumCount").textContent = items.reduce((s, i) => s + i.qty, 0);
  qs("#sumSubtotal").textContent = formatPrice(subtotal);
  qs("#sumTotal").textContent = formatPrice(subtotal);

  qsa("[data-qty-minus]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.qtyMinus, -1)));
  qsa("[data-qty-plus]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.qtyPlus, 1)));
  qsa("[data-remove]").forEach((b) => b.addEventListener("click", () => removeItem(b.dataset.remove)));
}

function rowHtml(i) {
  return `
  <div class="cart-row">
    <div class="cart-row__media" style="${categoryMediaStyle(i.category)}${i.imageUrl ? "padding:0;" : ""}">${productMediaHtml(i)}</div>
    <div>
      <div class="cart-row__name">${escapeHtml(i.name)}</div>
      <div class="cart-row__cat">${categoryLabel(i.category)} · ${formatPrice(i.price)}</div>
      <button class="cart-row__remove" data-remove="${i.id}">Удалить</button>
    </div>
    <div class="qty-stepper">
      <button type="button" data-qty-minus="${i.id}">−</button>
      <input type="text" value="${i.qty}" readonly>
      <button type="button" data-qty-plus="${i.id}">+</button>
    </div>
    <div class="price">${formatPrice(i.price * i.qty)}</div>
  </div>`;
}

async function changeQty(id, delta) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty < 1) return removeItem(id);
  await updateDoc(doc(db, "users", currentUser.uid, "cart", id), { qty: newQty });
}

async function removeItem(id) {
  await deleteDoc(doc(db, "users", currentUser.uid, "cart", id));
  toast("Товар удалён из корзины");
}

qs("#checkoutBtn").addEventListener("click", async () => {
  const errBox = qs("#checkoutError");
  errBox.textContent = "";
  const address = qs("#checkoutAddress").value.trim();
  if (!address) { errBox.textContent = "Укажите адрес доставки"; return; }
  if (!items.length) return;

  const btn = qs("#checkoutBtn");
  btn.disabled = true;
  btn.textContent = "Оформляем...";

  try {
    await runTransaction(db, async (tx) => {
      // Verify stock for every item before committing the order
      const productRefs = items.map((i) => doc(db, "products", i.productId || i.id));
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));

      productSnaps.forEach((snap, idx) => {
        const stock = snap.data()?.stock ?? 0;
        if (stock < items[idx].qty) {
          throw new Error(`Недостаточно на складе: ${items[idx].name} (осталось ${stock})`);
        }
      });

      const total = items.reduce((s, i) => s + i.price * i.qty, 0);
      const orderRef = doc(collection(db, "orders"));
      tx.set(orderRef, {
        userId: currentUser.uid,
        userName: currentUser.name || currentUser.email,
        items: items.map((i) => ({ productId: i.productId || i.id, name: i.name, price: i.price, qty: i.qty, category: i.category })),
        total,
        address,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      productSnaps.forEach((snap, idx) => {
        tx.update(productRefs[idx], { stock: (snap.data().stock || 0) - items[idx].qty });
      });
    });

    // Clear cart (separate batch — outside the transaction, after it succeeds)
    const batch = writeBatch(db);
    items.forEach((i) => batch.delete(doc(db, "users", currentUser.uid, "cart", i.id)));
    await batch.commit();

    toast("Заказ оформлен!", "ok");
    location.href = "profile.html";
  } catch (err) {
    errBox.textContent = err.message || "Не удалось оформить заказ";
  } finally {
    btn.disabled = false;
    btn.textContent = "Оформить заказ";
  }
});
