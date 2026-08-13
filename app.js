const axios = require("axios");
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const https = require("https");
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ============== إعدادات ==============
const TARGET_USER_ID = "49607";
const ANIME_ID = "529";
const EPISODE = 2;
const BATCH_SIZE = 20;
const BATCH_DELAY = 120000;
const ACCOUNTS = [];
for (let i = 100; i <= 3500; i++) {
    ACCOUNTS.push({ email: `tyt${i}@gmail.com`, password: "tyt123" });
}

let isRunning = false;
let totalProcessed = 0;
let totalPointsSent = 0;
let currentBatch = 0;
let lastAccount = "";

// ============== self-ping ==============
const SELF_URL = "https://poi4.onrender.com/";
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
            timeout: 8000,
            httpsAgent: createSecureAgent()
        });
    } catch (err) { throw err; }
}

async function apiGet(url, token, identity) {
    try {
        return await axios.get(url, {
            headers: buildHeaders(token, identity),
            timeout: 8000,
            httpsAgent: createSecureAgent()
        });
    } catch (err) { throw err; }
}

async function apiDelete(url, token, identity) {
    try {
        return await axios.delete(url, {
            headers: buildHeaders(token, identity),
            timeout: 8000,
            httpsAgent: createSecureAgent()
        });
    } catch (err) { throw err; }
}

async function login(email, password, identity) {
    try {
        const res = await apiPost(
            "https://app.sanime.net/anime-ar/backend/api/auth.php?action=login",
            { email, password }, null, identity
        );
        if (res.data?.success && res.data.token) {
            return { success: true, token: res.data.token, userId: res.data.user?.id || res.data.user_id };
        }
        return { success: false };
    } catch (err) { return { success: false }; }
}

async function spinWheel(token, identity) {
    try {
        const res = await apiPost(
            "https://app.sanime.net/anime-ar/backend/api/points.php?action=spin",
            {}, token, identity
        );
        if (res.data && !res.data.error) {
            return { success: true, points: res.data.points || res.data.reward || 0 };
        } else if (res.data?.error === "SPIN_IP_CONFLICT") {
            return { success: false, conflict: true };
        }
        return { success: false };
    } catch (err) { return { success: false }; }
}

async function startWatch(token, animeId, episode, identity) {
    try {
        const res = await apiPost(
            "https://app.sanime.net/anime-ar/backend/api/points.php?action=start_watch",
            { anime_id: animeId, episode }, token, identity
        );
        return res.data?.session_token || null;
    } catch (err) { return null; }
}

async function sendHeartbeat(token, sessionToken, position, identity) {
    try {
        const res = await apiPost(
            "https://app.sanime.net/anime-ar/backend/api/points.php?action=watch_heartbeat",
            { session_token: sessionToken, position }, token, identity
        );
        return res.data;
    } catch (err) { return null; }
}

async function getBalance(token, identity) {
    try {
        const res = await apiGet(
            "https://app.sanime.net/anime-ar/backend/api/points.php?action=balance",
            token, identity
        );
        return res.data?.balance || 0;
    } catch (err) { return 0; }
}

async function sendGift(token, toUserId, points, identity) {
    try {
        const res = await apiPost(
            "https://app.sanime.net/anime-ar/backend/api/points.php?action=send_gift",
            { to_user_id: parseInt(toUserId), points }, token, identity
        );
        if (res.data && !res.data.error) {
            return { success: true };
        }
        return { success: false };
    } catch (err) { return { success: false }; }
}

async function fetchPosts(token, identity) {
    try {
        const res = await apiGet(
            "https://app.sanime.net/anime-ar/backend/api/community.php?type=posts",
            token, identity
        );
        return res.data?.posts || [];
    } catch (err) { return []; }
}

async function deletePost(token, postId, identity) {
    try {
        const res = await apiDelete(
            `https://app.sanime.net/anime-ar/backend/api/community.php?type=posts&post_id=${postId}`,
            token, identity
        );
        return res.data?.success === true || res.status === 200;
    } catch (err) { return false; }
}

// ============== حذف هدايا حتى نجاح واحد ==============
async function deleteGiftPosts(token, identity) {
    let successOnce = false;
    for (let round = 0; round < 3; round++) {
        const posts = await fetchPosts(token, identity);
        const targetGiftPosts = posts.filter(
            post => post.is_gift === true && post.gift_to_user_id === parseInt(TARGET_USER_ID)
        );
        if (targetGiftPosts.length === 0) {
            return true;
        }
        for (const post of targetGiftPosts) {
            const postId = post.id;
            for (let attempt = 0; attempt < 3; attempt++) {
                if (await deletePost(token, postId, identity)) {
                    successOnce = true;
                    console.log(`[D] Deleted gift post #${postId} (${post.user})`);
                    break;
                }
                await new Promise(r => setTimeout(r, 500));
            }
            if (successOnce) break;
        }
        if (successOnce) break;
        await new Promise(r => setTimeout(r, 2000));
    }
    return successOnce;
}

// ============== معالجة حساب واحد ==============
async function processAccount(acc) {
    console.log(`[>] ${acc.email}`);
    const identity = {
        ip: randomIP(),
        deviceId: uuidv4(),
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    };

    const loginRes = await login(acc.email, acc.password, identity);
    if (!loginRes.success) {
        console.log(`[X] Login failed: ${acc.email}`);
        return { success: false, email: acc.email };
    }
    const token = loginRes.token;
    const userId = loginRes.userId;
    console.log(`[OK] Login: ${acc.email} (ID: ${userId})`);

    const spinRes = await spinWheel(token, identity);
    if (spinRes.success) console.log(`[*] Spin OK: ${acc.email}`);
    else console.log(`[-] Spin failed (continue): ${acc.email}`);

    const sessionToken = await startWatch(token, ANIME_ID, EPISODE, identity);
    if (!sessionToken) {
        console.log(`[X] Watch start failed: ${acc.email}`);
        return { success: false, email: acc.email };
    }

    let position = 60;
    let gotPoints = false;
    for (let i = 0; i < 20; i++) {
        const hbRes = await sendHeartbeat(token, sessionToken, position, identity);
        if (hbRes?.points_awarded_now) {
            gotPoints = true;
            break;
        }
        position += 60;
        await new Promise(r => setTimeout(r, 61000));
    }
    if (!gotPoints) {
        console.log(`[-] No points from watch: ${acc.email}`);
        return { success: false, email: acc.email };
    }

    const balance = await getBalance(token, identity);
    console.log(`[$] Balance: ${balance} (${acc.email})`);
    if (balance < 10) {
        console.log(`[-] Balance < 10: ${acc.email}`);
        return { success: false, email: acc.email };
    }

    const giftRes = await sendGift(token, TARGET_USER_ID, balance, identity);
    if (!giftRes.success) {
        console.log(`[X] Gift failed: ${acc.email}`);
        return { success: false, email: acc.email };
    }
    totalPointsSent += balance;
    console.log(`[G] Sent ${balance} pts to ${TARGET_USER_ID}`);

    const deleteSuccess = await deleteGiftPosts(token, identity);
    if (!deleteSuccess) {
        console.log(`[!] Could not delete any gift post for ${acc.email}`);
    }

    lastAccount = acc.email;
    return { success: true, email: acc.email };
}

// ============== دفعات ==============
async function processBatch(startIdx) {
    const batch = ACCOUNTS.slice(startIdx, startIdx + BATCH_SIZE);
    console.log(`\n=== Batch ${currentBatch + 1}: ${batch.length} accounts ===`);
    const tasks = batch.map(acc => processAccount(acc));
    const results = await Promise.allSettled(tasks);
    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    totalProcessed += succeeded;
    console.log(`Batch completed: ${succeeded}/${batch.length} succeeded. Total processed: ${totalProcessed}`);
}

async function mainLoop() {
    if (!isRunning) return;
    for (let i = 0; i < ACCOUNTS.length; i += BATCH_SIZE) {
        if (!isRunning) break;
        await processBatch(i);
        currentBatch++;
        await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
    console.log("All accounts processed.");
    isRunning = false;
}

function startProcess() {
    if (isRunning) return;
    isRunning = true;
    totalProcessed = 0;
    totalPointsSent = 0;
    currentBatch = 0;
    lastAccount = "";
    console.log("[>] Started spin+watch+gift+delete");
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
    </style></head><body>
        <h2>Spin + Watch + Gift + Delete Bot</h2>
        <div class="section">
            <p><b>Status:</b> ${isRunning ? 'Running' : 'Stopped'}</p>
            <p><b>Batch:</b> ${currentBatch + 1} / ${Math.ceil(ACCOUNTS.length / BATCH_SIZE)}</p>
            <p><b>Last account:</b> <span class="highlight">${lastAccount || 'None'}</span></p>
            <div>
                <div class="stat"><div class="num">${totalProcessed}</div><div class="label">Processed</div></div>
                <div class="stat"><div class="num">${totalPointsSent}</div><div class="label">Points Sent</div></div>
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
    console.log(`Mode: ${BATCH_SIZE} concurrent, ${BATCH_DELAY/1000}s between batches`);
    console.log(`Self-ping to ${SELF_URL} every 14 minutes`);
});