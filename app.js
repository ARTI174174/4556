import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, deleteDoc,
  doc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ======== 1. ВСТАВЬ СВОИ КЛЮЧИ FIREBASE ЗДЕСЬ ======== */
const firebaseConfig = {
  apiKey: "AIzaSyAkfRcVP8sTq83GbsEvVePiEpOTal3I5V4",
  authDomain: "fileshare-cb7be.firebaseapp.com",
  projectId: "fileshare-cb7be",
  storageBucket: "fileshare-cb7be.firebasestorage.app",
  messagingSenderId: "292926562182",
  appId: "1:292926562182:web:ad5db5b102275acf849607"
};
/* ====================================================== */

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ====== Навигация ====== */
window.showScreen = (id) => {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.getElementById("reg-error").textContent = "";
  document.getElementById("log-error").textContent = "";
};

let currentFile = null;
document.getElementById("file-input").addEventListener("change", e => {
  currentFile = e.target.files[0];
  document.getElementById("file-name").textContent = currentFile ? currentFile.name : "Файл не выбран";
});

/* ====== Регистрация ====== */
window.register = async () => {
  const loginVal = document.getElementById("reg-login").value.trim();
  const passVal  = document.getElementById("reg-pass").value;
  const err      = document.getElementById("reg-error");

  if (!/^[A-Za-z0-9_]{3,20}$/.test(loginVal)) {
    err.textContent = "Логин: только английские буквы/цифры, 3–20 символов";
    return;
  }
  if (passVal.length < 5) {
    err.textContent = "Пароль должен быть от 5 символов";
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, `${loginVal}@fileshare.local`, passVal);
  } catch (e) {
    err.textContent = "Логин уже занят или ошибка сети";
  }
};

/* ====== Вход ====== */
window.login = async () => {
  const loginVal = document.getElementById("log-login").value.trim();
  const passVal  = document.getElementById("log-pass").value;
  const err      = document.getElementById("log-error");

  if (!loginVal || !passVal) { err.textContent = "Заполни все поля"; return; }

  try {
    await signInWithEmailAndPassword(auth, `${loginVal}@fileshare.local`, passVal);
  } catch (e) {
    err.textContent = "Неверный логин или пароль";
  }
};

/* ====== Выход ====== */
window.logout = () => signOut(auth);

/* ====== Авторизация ====== */
onAuthStateChanged(auth, (user) => {
  if (user) {
    const login = user.email.split("@")[0];
    document.getElementById("user-label").textContent = "👤 " + login;
    showScreen("screen-chat");
    listenFiles();
  } else {
    showScreen("screen-menu");
  }
});

/* ====== Загрузка файла (в Firestore как base64) ====== */
window.uploadFile = async () => {
  if (!currentFile) { alert("Выбери файл"); return; }
  if (currentFile.size > 900 * 1024) {
    alert("Файл больше 900 КБ. Пока что можно только маленькие файлы (ограничение бесплатного Firestore).");
    return;
  }
  const minutes = parseInt(document.getElementById("ttl").value, 10);
  const user = auth.currentUser;
  if (!user) return;
  const login = user.email.split("@")[0];

  // читаем файл в base64
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      await addDoc(collection(db, "files"), {
        name: currentFile.name,
        type: currentFile.type,
        size: currentFile.size,
        data: e.target.result,  // base64 строка
        login,
        expiresAt: Date.now() + minutes * 60 * 1000,
        createdAt: serverTimestamp()
      });

      currentFile = null;
      document.getElementById("file-name").textContent = "Файл не выбран";
      document.getElementById("file-input").value = "";
    } catch (err) {
      alert("Ошибка загрузки: " + err.message);
    }
  };
  reader.readAsDataURL(currentFile);
};

/* ====== Список файлов ====== */
let unsubscribe = null;
function listenFiles() {
  if (unsubscribe) unsubscribe();
  const q = query(collection(db, "files"), orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(q, snap => {
    const list = document.getElementById("files-list");
    list.innerHTML = "";
    const now = Date.now();

    snap.forEach(d => {
      const f = d.data();
      if (f.expiresAt <= now) {
        deleteDoc(doc(db, "files", d.id));   // просрочен — удаляем
        return;
      }
      const left = Math.ceil((f.expiresAt - now) / 60000);
      const card = document.createElement("div");
      card.className = "file-card";

      let preview = "";
      if (f.type.startsWith("image/")) {
        preview = `<div class="preview"><img src="${f.data}" /></div>`;
      } else if (f.type.startsWith("video/")) {
        preview = `<div class="preview"><video src="${f.data}" controls></video></div>`;
      } else if (f.type.startsWith("audio/")) {
        preview = `<div class="preview"><audio src="${f.data}" controls></audio></div>`;
      }

      card.innerHTML = `
        ${preview}
        <div class="name">${f.name}</div>
        <div class="meta">${f.login} • ${(f.size/1024).toFixed(1)} КБ • ⏳ ${left} мин</div>
        <a href="${f.data}" download="${f.name}">⬇ Скачать</a>
      `;
      list.appendChild(card);
    });
  });
}

/* Автоочистка каждые 30 сек */
setInterval(() => {
  if (auth.currentUser) listenFiles();
}, 30000);