import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, deleteDoc,
  doc, serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ======== ТВОИ КЛЮЧИ FIREBASE ======== */
const firebaseConfig = {
  apiKey: "AIzaSyAkfRcVP8sTq83GbsEvVePiEpOTal3I5V4",
  authDomain: "fileshare-cb7be.firebaseapp.com",
  projectId: "fileshare-cb7be",
  storageBucket: "fileshare-cb7be.firebasestorage.app",
  messagingSenderId: "292926562182",
  appId: "1:292926562182:web:ad5db5b102275acf849607"
};
/* ===================================== */

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

/* ====== Файлы: выбор (до 10) ====== */
let currentFiles = [];
document.getElementById("file-input").addEventListener("change", e => {
  const all = Array.from(e.target.files);
  currentFiles = all.slice(0, 10);
  const shown = currentFiles.length;
  document.getElementById("file-name").textContent =
    shown === 0 ? "Файлы не выбраны" :
    all.length > 10 ? `Выбрано ${shown} из ${all.length} (лимит 10)` :
    `Выбрано: ${shown} файл(ов)`;
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

window.logout = () => signOut(auth);

/* ====== Авторизация ====== */
onAuthStateChanged(auth, (user) => {
  if (user) {
    const login = user.email.split("@")[0];
    document.getElementById("user-label").textContent = "👤 " + login;
    showScreen("screen-chat");
    listenFiles();
    listenMessages();
  } else {
    showScreen("screen-menu");
  }
});

/* ====== Загрузка файлов (до 10 за раз) ====== */
window.uploadFiles = async () => {
  if (currentFiles.length === 0) { alert("Выбери файлы"); return; }
  const minutes = parseInt(document.getElementById("ttl").value, 10);
  const user = auth.currentUser;
  if (!user) return;
  const login = user.email.split("@")[0];

  let okCount = 0, skipCount = 0;

  for (const f of currentFiles) {
    if (f.size > 900 * 1024) { skipCount++; continue; }
    try {
      const base64 = await fileToBase64(f);
      await addDoc(collection(db, "files"), {
        name: f.name,
        type: f.type,
        size: f.size,
        data: base64,
        login,
        expiresAt: Date.now() + minutes * 60 * 1000,
        createdAt: serverTimestamp()
      });
      okCount++;
    } catch (e) {
      skipCount++;
    }
  }

  currentFiles = [];
  document.getElementById("file-name").textContent = "Файлы не выбраны";
  document.getElementById("file-input").value = "";

  if (skipCount > 0) {
    alert(`Загружено: ${okCount}\nПропущено (больше 900 КБ или ошибка): ${skipCount}`);
  }
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ====== Список файлов ====== */
let unsubscribeFiles = null;
function listenFiles() {
  if (unsubscribeFiles) unsubscribeFiles();
  const q = query(collection(db, "files"), orderBy("createdAt", "desc"), limit(50));
  unsubscribeFiles = onSnapshot(q, snap => {
    const list = document.getElementById("files-list");
    list.innerHTML = "";
    const now = Date.now();

    snap.forEach(d => {
      const f = d.data();
      if (f.expiresAt <= now) {
        deleteDoc(doc(db, "files", d.id));
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
        <div class="name">${escapeHtml(f.name)}</div>
        <div class="meta">${escapeHtml(f.login)} • ${(f.size/1024).toFixed(1)} КБ • ⏳ ${left} мин</div>
        <a href="${f.data}" download="${escapeHtml(f.name)}">⬇ Скачать</a>
      `;
      list.appendChild(card);
    });
  });
}

/* ====== Чат: отправка ====== */
window.sendMessage = async () => {
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if (!text) return;
  const user = auth.currentUser;
  if (!user) return;
  const login = user.email.split("@")[0];

  const minutes = parseInt(document.getElementById("msg-ttl").value, 10);
  const expiresAt = Date.now() + minutes * 60 * 1000;

  try {
    await addDoc(collection(db, "messages"), {
      text,
      login,
      expiresAt,
      createdAt: serverTimestamp()
    });
    input.value = "";
    input.focus();
  } catch (e) {
    alert("Ошибка отправки: " + e.message);
  }
};

document.getElementById("msg-input").addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

/* ====== Чат: чтение + авто-удаление ====== */
let unsubscribeMsgs = null;
function listenMessages() {
  if (unsubscribeMsgs) unsubscribeMsgs();
  const q = query(collection(db, "messages"), orderBy("createdAt", "asc"), limit(100));
  unsubscribeMsgs = onSnapshot(q, snap => {
    const box = document.getElementById("messages");
    box.innerHTML = "";
    const myLogin = auth.currentUser.email.split("@")[0];
    const now = Date.now();

    snap.forEach(d => {
      const m = d.data();

      // авто-удаление просроченных
      if (m.expiresAt && m.expiresAt <= now) {
        deleteDoc(doc(db, "messages", d.id));
        return;
      }

      const time = m.createdAt?.toDate
        ? m.createdAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
        : '';

      const leftMin = m.expiresAt ? Math.ceil((m.expiresAt - now) / 60000) : null;

      const div = document.createElement("div");
      div.className = "msg" + (m.login === myLogin ? " own" : "");
      div.innerHTML = `
        <span class="author">${escapeHtml(m.login)}:</span>
        <span>${escapeHtml(m.text)}</span>
        <span class="time">${time}${leftMin !== null ? ' • ⏳ ' + leftMin + ' мин' : ''}</span>
      `;
      box.appendChild(div);
    });

    box.scrollTop = box.scrollHeight;
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[s]));
}

/* ====== Автоочистка файлов и чата каждые 15 сек ====== */
setInterval(() => {
  if (!auth.currentUser) return;
  listenFiles();
  listenMessages();
}, 15000);
