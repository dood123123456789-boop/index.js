const axios = require("axios");
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const https = require("https");
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ============== إعدادات Render ==============
// ضع رابط خدمتك على Render هنا (مثال: https://your-service.onrender.com/)
const SELF_URL = "https://poi4.onrender.com/";

// ============== إعدادات الحساب ==============
const AUTH_TOKEN = "e2640097bfe27b751398218b604b1fc363274cf524139845badd2d3578225892"; // التوكن الثابت

// ============== إعدادات المشاهدة ==============
const ANIME_ID = "658";              // معرف الأنمي
const TOTAL_EPISODES = 1100;         // عدد الحلقات الإجمالي الذي تريد المرور عليه
const GROUP_SIZE = 45;               // عدد الحلقات المتوازية (المطلوب 20)
const HEARTBEAT_INTERVAL_MS = 61000; // مدة الانتظار قبل كل نبضة (60 ثانية)
const MAX_HEARTBEATS = 20;           // الحد الأقصى لمحاولات النبض (مثل الكود السابق)
const INITIAL_POSITION = 60;         // أول موضع تقدم
const POSITION_STEP = 60;            // الزيادة في الموضع عند كل نبضة
const CHUNK_DELAY_MS = 5000;         // مهلة صغيرة بين المجموعات

// ============== الحالة ==============
let isRunning = false;
let currentChunk = 0;
let totalEpisodesProcessed = 0;
let totalSuccessSessions = 0;
let lastError = "";

// ============== self-ping (لإبقاء Render نشطًا) ==============
setInterval(() => {
    axios.get(SELF_URL).catch(() => {});
    console.log("Keep-alive ping to " + SELF_URL);
}, 14 * 60 * 1000); // كل 14 دقيقة

// ============== هوية متغيرة ==============
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.114 Mobile Safari/537.36"
];

const TLS_CIPHER_SUITES = [
    "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384",
    "TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305",
    "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305",
    "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384"
];

function randomIP() {
    return `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
}

function createSecureAgent() {
    const ciphers = TLS_CIPHER_SUITES[Math.floor(Math.random() * TLS_CIPHER_SUITES.length)];
    return new https.Agent({
        keepAlive: false,
        ciphers: ciphers,
        honorCipherOrder: true,
        minVersion: "TLSv1.2",
        maxVersion: "TLSv1.3"
    });
}

function buildHeaders(token, identity) {
    const headers = {
        "Host": "app.sanime.net",
        "Content-Type": "application/json",
        "Origin": "https://app.anime-ar.com",
        "X-Country-Code": "",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "close",
        "Accept": "*/*",
        "User-Agent": identity.userAgent,
        "X-Device-ID": identity.deviceId,
        "Referer": "https://app.anime-ar.com/",
        "Accept-Language": "ar-SA,en;q=0.9",
        "X-Forwarded-For": identity.ip,
        "CLIENT-IP": identity.ip,
        "X-Real-IP": identity.ip
    };
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
}

// ============== دوال API ==============
async function apiPost(url, data, token, identity) {
    try {
        return await axios.post(url, data, {
            headers: buildHeaders(token, identity),
            timeout: 10000,
            httpsAgent: createSecureAgent()
        });
    } catch (err) { throw err; }
}

async function apiGet(url, token, identity) {
    try {
        return await axios.get(url, {
            headers: buildHeaders(token, identity),
            timeout: 10000,
            httpsAgent: createSecureAgent()
        });
    } catch (err) { throw err; }
}

async function startWatch(token, animeId, episode, identity) {
    try {
        const res = await apiPost(
            "https://app.sanime.net/anime-ar/backend/api/points.php?action=start_watch",
            { anime_id: animeId, episode },
            token,
            identity
        );
        return res.data?.session_token || null;
    } catch (err) {
        return null;
    }
}

async function sendHeartbeat(token, sessionToken, position, identity) {
    try {
        const res = await apiPost(
            "https://app.sanime.net/anime-ar/backend/api/points.php?action=watch_heartbeat",
            { session_token: sessionToken, position },
            token,
            identity
        );
        return res.data;
    } catch (err) {
        return null;
    }
}

async function getBalance(token, identity) {
    try {
        const res = await apiGet(
            "https://app.sanime.net/anime-ar/backend/api/points.php?action=balance",
            token,
            identity
        );
        return res.data?.balance || 0;
    } catch (err) {
        return 0;
    }
}

// ============== معالجة حلقة واحدة ==============
async function processEpisode(episode) {
    const identity = {
        ip: randomIP(),
        deviceId: uuidv4(),
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    };

    // بدء جلسة المشاهدة
    const sessionToken = await startWatch(AUTH_TOKEN, ANIME_ID, episode, identity);
    if (!sessionToken) {
        console.log(`[X] Watch start failed: EP ${episode}`);
        return { success: false, episode };
    }
    console.log(`[>] EP ${episode} - Session started`);

    let position = INITIAL_POSITION;
    let gotPoints = false;

    for (let i = 0; i < MAX_HEARTBEATS; i++) {
        await new Promise(r => setTimeout(r, HEARTBEAT_INTERVAL_MS));
        const hbRes = await sendHeartbeat(AUTH_TOKEN, sessionToken, position, identity);
        if (hbRes?.points_awarded_now) {
            gotPoints = true;
            console.log(`[✓] EP ${episode} - Points awarded at position ${position}`);
            break;
        }
        console.log(`[~] EP ${episode} - heartbeat ${i + 1} no points (position ${position})`);
        position += POSITION_STEP;
    }

    if (!gotPoints) {
        console.log(`[-] EP ${episode} - No points after ${MAX_HEARTBEATS} heartbeats`);
        return { success: false, episode };
    }

    return { success: true, episode };
}

// ============== تشغيل المجموعات ==============
async function mainLoop() {
    if (isRunning) return;
    isRunning = true;
    totalEpisodesProcessed = 0;
    totalSuccessSessions = 0;
    currentChunk = 0;
    lastError = "";

    console.log("[>] Started concurrent watch with one token");
    console.log(`Anime: ${ANIME_ID}, Episodes: 1-${TOTAL_EPISODES}, Group size: ${GROUP_SIZE}`);

    for (let startEp = 1; startEp <= TOTAL_EPISODES; startEp += GROUP_SIZE) {
        if (!isRunning) break;

        const endEp = Math.min(startEp + GROUP_SIZE - 1, TOTAL_EPISODES);
        const episodes = Array.from({ length: endEp - startEp + 1 }, (_, i) => startEp + i);
        currentChunk = Math.floor((startEp - 1) / GROUP_SIZE) + 1;
        console.log(`\n=== Chunk ${currentChunk}: Episodes ${startEp}-${endEp} ===`);

        // بدء جميع الحلقات في نفس الوقت
        const results = await Promise.allSettled(episodes.map(ep => processEpisode(ep)));

        const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        totalEpisodesProcessed += episodes.length;
        totalSuccessSessions += succeeded;
        console.log(`Chunk ${currentChunk} finished: ${succeeded}/${episodes.length} sessions with points`);

        if (endEp < TOTAL_EPISODES) {
            console.log(`Waiting ${CHUNK_DELAY_MS / 1000}s before next chunk...`);
            await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
        }
    }

    console.log("All chunks processed.");
    isRunning = false;
}

function startProcess() {
    if (isRunning) return;
    mainLoop();
}

function stopProcess() {
    isRunning = false;
    console.log("[S] Stopped");
}

// ============== لوحة التحكم ==============
app.get("/", (req, res) => {
    res.send(`
    <html><head><meta charset="UTF-8"/><style>
        body { background: #0d1117; color: #fff; font-family: sans-serif; padding: 20px; }
        button { margin: 4px; padding: 8px 16px; background: #161b22; color: #fff; border: 1px solid #30363d; border-radius: 4px; cursor: pointer; }
        button:hover { background: #238636; }
        .section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 15px; margin: 10px 0; max-width: 600px; }
        .stat { display: inline-block; padding: 10px; margin: 5px; background: #0d1117; border: 1px solid #30363d; border-radius: 5px; text-align: center; }
        .num { font-size: 1.5em; font-weight: bold; color: #3fb950; }
        .label { font-size: 0.8em; color: #8b949e; }
        a { text-decoration: none; }
        .highlight { color: #fbbf24; font-weight: bold; }
        .token { color: #8b949e; font-size: 0.8em; word-break: break-all; }
    </style></head><body>
        <h2>Concurrent Watch Bot (One Token)</h2>
        <div class="section">
            <p><b>Status:</b> ${isRunning ? 'Running' : 'Stopped'}</p>
            <p><b>Current Chunk:</b> ${currentChunk} / ${Math.ceil(TOTAL_EPISODES / GROUP_SIZE)}</p>
            <p><b>Token:</b> <span class="token">${AUTH_TOKEN.slice(0, 12)}...${AUTH_TOKEN.slice(-8)}</span></p>
            <p><b>Anime ID:</b> ${ANIME_ID} | <b>Total Episodes:</b> ${TOTAL_EPISODES} | <b>Group Size:</b> ${GROUP_SIZE}</p>
            <div>
                <div class="stat"><div class="num">${totalEpisodesProcessed}</div><div class="label">Episodes Processed</div></div>
                <div class="stat"><div class="num">${totalSuccessSessions}</div><div class="label">Successful Watch Sessions</div></div>
            </div>
        </div>
        <div class="section">
            <a href="/start"><button style="background:#238636;">Start</button></a>
            <a href="/stop"><button style="background:#da3633;">Stop</button></a>
            <a href="/"><button>Refresh</button></a>
        </div>
    </body></html>
    `);
});

app.get("/start", (req, res) => { startProcess(); res.redirect("/"); });
app.get("/stop", (req, res) => { stopProcess(); res.redirect("/"); });

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Keep-alive: ${SELF_URL}`);
    console.log(`Mode: ${GROUP_SIZE} concurrent episodes from 1 to ${TOTAL_EPISODES}`);