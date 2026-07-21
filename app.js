const axios = require("axios");
const https = require("https");
const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.urlencoded({ extended: true }));

// ============== إعدادات ==============
let email = "iiii@ii.ii";
let password = "iiii@ii.ii";
let messageText = "Ss";
let messagesPerMinute = 300;  // عدد النبضات في الدقيقة
let concurrency = 1;          // عدد الرسائل المتوازية في النبضة الواحدة
let delay = (60 / messagesPerMinute) * 1000;
let botActive = false;
let totalSent = 0;            // إجمالي الرسائل الناجحة
let intervalId = null;

// معلومات الجلسة
let authToken = "";
let deviceId = "";
let chatUserAgent = "";

// ============== توليد هوية جهاز عشوائية ==============
function generateSessionData() {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  chatUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 (OtakuTime) AppV/1.1.0 Name/iPhone UUID/" + uuid + " Color/#182128 Link/https://app.anime-ar.com/?v=1 DeviceTime/" + Math.floor(Math.random() * 5000);
}

// ============== Headers ==============
const loginHeaders = {
  "Host": "app.sanime.net",
  "Content-Type": "application/json",
  "Origin": "https://app.anime-ar.com",
  "X-Country-Code": "",
  "Connection": "keep-alive",
  "Accept": "*/*",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_3 like Mac OS X) AppleWebKit/605.1.15",
  "Referer": "https://app.anime-ar.com/",
  "Accept-Language": "ar"
};

function getChatHeaders() {
  return {
    "Host": "app.sanime.net",
    "Content-Type": "application/json",
    "Origin": "https://app.anime-ar.com",
    "X-Country-Code": "",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Accept": "*/*",
    "Authorization": "Bearer " + authToken,
    "User-Agent": chatUserAgent,
    "X-Device-ID": deviceId,
    "Referer": "https://app.anime-ar.com/",
    "Accept-Language": "ar"
  };
}

// ============== تسجيل الدخول ==============
async function login() {
  try {
    const res = await axios.post(
      "https://app.sanime.net/anime-ar/backend/api/auth.php?action=login",
      JSON.stringify({ email, password }),
      { headers: loginHeaders, timeout: 10000 }
    );
    if (res.data?.success && res.data.token) {
      authToken = res.data.token;
      generateSessionData();
      console.log("✅ تم تسجيل الدخول");
      return true;
    }
    console.log("❌ فشل تسجيل الدخول:", res.data?.message);
    return false;
  } catch (err) {
    console.error("❌ خطأ تسجيل الدخول:", err.message);
    return false;
  }
}

// ============== إرسال رسالة واحدة ==============
async function sendSingleMessage() {
  if (!authToken) return;
  try {
    const res = await axios.post(
      "https://app.sanime.net/anime-ar/backend/api/community.php?type=chat",
      JSON.stringify({ text: messageText }),
      { headers: getChatHeaders(), timeout: 10000 }
    );
    if (res.data?.success) {
      totalSent++;
      console.log(`✅ رسالة ${totalSent}`);
    }
  } catch (err) {
    console.error("❌ خطأ إرسال:", err.message);
  }
}

// ============== إرسال دفعة متوازية ==============
async function sendBatch() {
  const tasks = [];
  for (let i = 0; i < concurrency; i++) {
    tasks.push(sendSingleMessage());
  }
  await Promise.allSettled(tasks);
}

// ============== بدء الإرسال ==============
async function startSending() {
  if (botActive) return;
  
  // تسجيل الدخول أولاً
  const loggedIn = await login();
  if (!loggedIn) {
    console.log("❌ تعذر تسجيل الدخول، لن يبدأ الإرسال");
    return;
  }

  botActive = true;
  totalSent = 0;
  delay = (60 / messagesPerMinute) * 1000;
  console.log(`💬 بدء | ${messagesPerMinute} نبضة/د | ${concurrency} متوازية | ~${messagesPerMinute * concurrency} رسالة/دقيقة`);

  // إرسال الدفعة الأولى فوراً
  sendBatch();
  
  // جدولة الدفعات التالية
  intervalId = setInterval(() => {
    if (!botActive) {
      clearInterval(intervalId);
      return;
    }
    sendBatch();
  }, delay);
}

function stopSending() {
  botActive = false;
  if (intervalId) clearInterval(intervalId);
  console.log(`⏹️ توقف | إجمالي الرسائل: ${totalSent}`);
}

// ============== لوحة التحكم ==============
app.get("/", (req, res) => {
  const effectiveRate = messagesPerMinute * concurrency;
  res.send(`
  <html><head><meta charset="UTF-8"/><style>
    body { background: #0d1117; color: #fff; font-family: sans-serif; padding: 20px; }
    input, button { margin: 4px; padding: 8px; background: #161b22; color: #fff; border: 1px solid #30363d; }
    button:hover { background: #238636; cursor: pointer; }
    .add-anime-form { margin-top: 30px; padding: 15px; border: 1px solid #30363d; background: #161b22; max-width: 400px; }
  </style></head><body>
    <h2>💬 شات ${botActive ? "✅ يعمل" : "🛑 متوقف"}</h2>
    <p>📨 تم الإرسال: ${totalSent} رسالة | السرعة الفعلية: ~${effectiveRate} رسالة/دقيقة</p>
    <form method="POST" action="/update">
      الإيميل: <input name="email" value="${email}" /><br>
      كلمة المرور: <input name="password" type="password" value="${password}" /><br>
      الرسالة: <input name="messageText" value="${messageText}" /><br>
      النبضات في الدقيقة: <input name="messagesPerMinute" type="number" value="${messagesPerMinute}" /><br>
      التوازي (رسائل/نبضة): <input name="concurrency" type="number" value="${concurrency}" /><br>
      <button type="submit">🔄 تحديث</button>
    </form>
    <form action="/start"><button>▶️ تشغيل</button></form>
    <form action="/stop"><button>⏹ إيقاف</button></form>
  </body></html>
  `);
});

app.post("/update", (req, res) => {
  email = req.body.email || email;
  password = req.body.password || password;
  messageText = req.body.messageText || messageText;
  messagesPerMinute = parseInt(req.body.messagesPerMinute) || messagesPerMinute;
  concurrency = parseInt(req.body.concurrency) || concurrency;
  if (concurrency < 1) concurrency = 1;
  delay = (60 / messagesPerMinute) * 1000;

  // إذا كان البوت يعمل، أعد التشغيل بالقيم الجديدة
  if (botActive) {
    stopSending();
    startSending();
  }
  res.redirect("/");
});

app.get("/start", (req, res) => {
  if (!botActive) startSending();
  res.redirect("/");
});

app.get("/stop", (req, res) => {
  stopSending();
  res.redirect("/");
});

// ============== Keep-alive ==============
const KEEP_ALIVE_URL = "https://acc-9hhh.onrender.com/";
setInterval(() => {
  fetch(KEEP_ALIVE_URL)
    .then(() => console.log("🔁 Keep-alive"))
    .catch(err => console.error("❌ Keep-alive:", err.message));
}, 1000 * 60 * 5);

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`🌐 Server on port ${PORT}`);
  // بدء تلقائي عند تشغيل السيرفر (مثل الكود المرجعي)
  startSending();
