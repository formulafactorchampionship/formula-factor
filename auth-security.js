import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getFirestore, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Credentials and login state are owned exclusively by Firebase Authentication.
const firebaseConfig = {
  apiKey: "AIzaSyAS4RecsGAS4JWUn1d-9_VyqFRKmkF_CNs",
  authDomain: "formula-factor.firebaseapp.com",
  projectId: "formula-factor",
  storageBucket: "formula-factor.firebasestorage.app",
  messagingSenderId: "91130346513",
  appId: "1:91130346513:web:6bc223bfc59dffec5045b0"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function authError(code) {
  const value = String(code || "").toLowerCase();
  if (value.includes("email-already-in-use")) return "Este correo electrónico ya está registrado.";
  if (value.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (value.includes("invalid-email")) return "Formato de correo electrónico inválido.";
  if (value.includes("too-many-requests")) return "Demasiados intentos. Inténtalo de nuevo más tarde.";
  return "Correo o contraseña incorrectos. Verifica tus datos.";
}

function showError(message) {
  const box = document.getElementById("authAlertBox");
  const text = document.getElementById("authAlertText");
  if (text) text.textContent = message;
  if (box) {
    box.className = "auth-alert-box error";
    box.style.display = "flex";
  }
}

function closeModal() {
  const overlay = document.getElementById("userAuthOverlay");
  if (overlay) overlay.classList.remove("active");
  document.body.classList.remove("modal-open");
}

function setBusy(form, busy) {
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = busy;
}

function clearLegacyCredentials() {
  try { localStorage.removeItem("ffc_registered_users"); } catch (error) {}
}

clearLegacyCredentials();

onAuthStateChanged(auth, (user) => {
  if (user) return;
  const hadLegacySession = Boolean(localStorage.getItem("ffc_current_user"));
  try { localStorage.removeItem("ffc_current_user"); } catch (error) {}
  if (hadLegacySession && !sessionStorage.getItem("ffc_firebase_session_cleanup")) {
    sessionStorage.setItem("ffc_firebase_session_cleanup", "1");
    window.location.reload();
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.matches("#userLoginForm, #userRegisterForm, #userResetForm")) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  setBusy(form, true);

  try {
    if (form.id === "userLoginForm") {
      const email = document.getElementById("loginEmailInput")?.value.trim();
      const password = document.getElementById("loginPasswordInput")?.value;
      await signInWithEmailAndPassword(auth, email, password);
      closeModal();
      return;
    }

    if (form.id === "userRegisterForm") {
      const displayName = document.getElementById("registerNameInput")?.value.trim();
      const email = document.getElementById("registerEmailInput")?.value.trim().toLowerCase();
      const password = document.getElementById("registerPasswordInput")?.value;
      if (!displayName || !email || !password) throw { code: "auth/invalid-email" };
      if (password.length < 6) throw { code: "auth/weak-password" };

      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName });
      await setDoc(doc(db, "usuarios", credential.user.uid), {
        uid: credential.user.uid,
        displayName,
        email,
        createdAt: new Date().toISOString()
      }, { merge: true });
      closeModal();
      return;
    }

    const email = document.getElementById("resetEmailInput")?.value.trim();
    await sendPasswordResetEmail(auth, email);
    showError("Te hemos enviado un correo para restablecer la contraseña.");
  } catch (error) {
    showError(authError(error?.code || error?.message));
  } finally {
    setBusy(form, false);
  }
}, true);

// Preserve server-side admin verification while removing the old forged headers.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url || "";
  if (!url.startsWith("/api/")) return nativeFetch(input, init);

  const user = auth.currentUser;
  if (!user) return nativeFetch(input, init);
  const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  return nativeFetch(input, { ...init, headers });
};
