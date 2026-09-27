// auth.js — authentication + the shared header behaviour used on every page.
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  onSnapshot,
  collection,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { toast, qs, qsa, setCartBadge, showConfigWarning } from "./utils.js";
import { isPlaceholderConfig } from "./firebase-config.js";

showConfigWarning(isPlaceholderConfig);

// currentUser = { uid, email, name, role } once resolved, else null
export let currentUser = null;

let resolveReady;
export const authReady = new Promise((res) => (resolveReady = res));

onAuthStateChanged(auth, async (fbUser) => {
  if (!fbUser) {
    currentUser = null;
    renderHeaderAuthState();
    setCartBadge(0);
    resolveReady(null);
    return;
  }
  const snap = await getDoc(doc(db, "users", fbUser.uid));
  const profile = snap.exists() ? snap.data() : { role: "user", name: fbUser.email };
  currentUser = { uid: fbUser.uid, email: fbUser.email, ...profile };
  renderHeaderAuthState();
  watchCartCount(fbUser.uid);
  resolveReady(currentUser);
});

export async function registerUser({ name, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    name,
    email,
    role: "user",
    phone: "",
    address: "",
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

export async function loginUser({ email, password }) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logoutUser() {
  await signOut(auth);
  toast("Вы вышли из аккаунта");
  location.href = "index.html";
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export function requireAdmin() {
  if (!currentUser || currentUser.role !== "admin") {
    toast("Доступ только для администратора", "err");
    location.href = "index.html";
    return false;
  }
  return true;
}

export async function requireLogin(message = "Войдите, чтобы продолжить") {
  await authReady;
  if (!currentUser) {
    toast(message, "err");
    openAuthModal("login");
    return false;
  }
  return true;
}

// ---------------- Shared header ----------------
function renderHeaderAuthState() {
  const guestBox = qs("[data-auth-guest]");
  const userBox = qs("[data-auth-user]");
  if (!guestBox || !userBox) return;
  if (currentUser) {
    guestBox.classList.add("hidden");
    userBox.classList.remove("hidden");
    qsa("[data-user-name]").forEach((el) => (el.textContent = currentUser.name || currentUser.email));
    qsa("[data-user-role]").forEach((el) => (el.textContent = currentUser.role === "admin" ? "admin" : "user"));
    qsa("[data-admin-link]").forEach((el) => el.classList.toggle("hidden", currentUser.role !== "admin"));
  } else {
    guestBox.classList.remove("hidden");
    userBox.classList.add("hidden");
  }
}

let unsubCart = null;
function watchCartCount(uid) {
  if (unsubCart) unsubCart();
  unsubCart = onSnapshot(collection(db, "users", uid, "cart"), (snap) => {
    let n = 0;
    snap.forEach((d) => (n += d.data().qty || 1));
    setCartBadge(n);
  });
}

// Modal wiring — index.html/product.html/cart.html/profile.html all include
// the same auth-modal markup (see components loaded via includeHeader()).
export function openAuthModal(tab = "login") {
  const overlay = qs("#authModal");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  switchAuthTab(tab);
}
export function closeAuthModal() {
  qs("#authModal")?.classList.add("hidden");
  qs("#authError")?.classList.add("hidden");
}
export function switchAuthTab(tab) {
  qsa(".modal__tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  qs("#loginForm")?.classList.toggle("hidden", tab !== "login");
  qs("#registerForm")?.classList.toggle("hidden", tab !== "register");
  qs("#authError")?.classList.add("hidden");
}

function showAuthError(err) {
  const box = qs("#authError");
  if (!box) return;
  box.textContent = friendlyAuthError(err);
  box.classList.remove("hidden");
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  const map = {
    "auth/email-already-in-use": "Этот email уже зарегистрирован.",
    "auth/invalid-email": "Некорректный email.",
    "auth/weak-password": "Пароль должен содержать не менее 6 символов.",
    "auth/invalid-credential": "Неверный email или пароль.",
    "auth/wrong-password": "Неверный email или пароль.",
    "auth/user-not-found": "Пользователь с таким email не найден.",
    "auth/too-many-requests": "Слишком много попыток. Попробуйте позже.",
    "auth/invalid-api-key": "Firebase не настроен: неверный API key в js/firebase-config.js.",
    "auth/configuration-not-found": "Firebase не настроен, или в Authentication → Sign-in method не включён Email/Password.",
    "auth/network-request-failed": "Нет соединения с Firebase. Проверьте интернет и настройки проекта.",
  };
  return map[code] || `Что-то пошло не так (${code || "неизвестная ошибка"}). Проверьте консоль браузера (F12).`;
}

export function initAuthUI() {
  qsa("[data-open-login]").forEach((b) => b.addEventListener("click", () => openAuthModal("login")));
  qs(".modal__close")?.addEventListener("click", closeAuthModal);
  qs("#authModal")?.addEventListener("click", (e) => {
    if (e.target.id === "authModal") closeAuthModal();
  });
  qsa(".modal__tab").forEach((b) => b.addEventListener("click", () => switchAuthTab(b.dataset.tab)));

  qs("#loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = qs("#loginEmail").value.trim();
    const password = qs("#loginPassword").value;
    try {
      await loginUser({ email, password });
      closeAuthModal();
      toast("С возвращением!", "ok");
    } catch (err) {
      showAuthError(err);
    }
  });

  qs("#registerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = qs("#registerName").value.trim();
    const email = qs("#registerEmail").value.trim();
    const password = qs("#registerPassword").value;
    if (password.length < 6) return showAuthError({ code: "auth/weak-password" });
    try {
      await registerUser({ name, email, password });
      closeAuthModal();
      toast("Аккаунт создан. Добро пожаловать!", "ok");
    } catch (err) {
      showAuthError(err);
    }
  });

  qs("#forgotPasswordLink")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = qs("#loginEmail").value.trim();
    if (!email) return toast("Сначала введите email", "err");
    try {
      await resetPassword(email);
      toast("Письмо для сброса пароля отправлено", "ok");
    } catch (err) {
      showAuthError(err);
    }
  });

  qsa("[data-logout]").forEach((b) => b.addEventListener("click", logoutUser));
}
