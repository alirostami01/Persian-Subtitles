# 🧩 مستندات فنی — Persian Subtitles Add-on

این فایل **مستندات داخلی/فنی** پروژه است و مخاطب آن برنامه‌نویسی است که می‌خواهد منطق افزونه را تغییر دهد، باگ استخراج را رفع کند یا runtime جدیدی اضافه کند.
راهنمای نصب، استقرار و مصرف کاربر در [README.md](../README.md) است و اینجا تکرار نمی‌شود.

> مبنای تمام توضیحات زیر، کد نسخه فعلی مخزن است: `package.json` نسخه `2.0.0` و `manifest.js` نسخه `1.0.0`. اگر منطق را عوض کردی، همین فایل را هم به‌روز کن.

## فهرست

1. معماری و تفاوت دو runtime — نقش هر فایل و جاهایی که Node و Worker جدا می‌شوند
2. نقشه ماژول‌ها — exportها، مصرف‌کننده‌ها و گراف وابستگی
3. قرارداد داده و API خارجی — شکل پاسخ SubSource/Cinemeta و خروجی افزونه
4. مستندات تابع‌به‌تابع — امضا، شرط‌ها، لاگ‌ها و خطوط حساس هر ماژول
5. الگوریتم تطبیق فصل/قسمت — الگوها، نرمال‌سازی و موارد ردشده
6. الگوریتم درج متن Promo در SRT
7. مدل خطاها و لاگ‌ها
8. پیکربندی کامل متغیرهای محیطی — مصرف‌شده در برابر مصرف‌نشده
9. مسائل شناخته‌شده و بدهی فنی — ۱۲ مورد مشخص و قابل شروع
10. راهنمای تست و بازبینی تغییرات — دستورهای واقعی + جدول تست‌های واحد
11. چک‌لیست افزودن تغییر به منطق

---

## ۱. معماری و تفاوت دو runtime

پروژه **یک منطق، دو نقطه ورود** است. هیچ هسته مشترکی به‌جز `manifest.js` وجود ندارد:

| | Node (`addon.js` / `server.js`) | Cloudflare Worker (`worker.js`) |
|---|---|---|
| HTTP server | Express 5 + `getRouter` از `stremio-addon-sdk` | handler `fetch` + regex router دستی |
| منطق جستجو | `subtitlesHandler.js` (ماژول جدا) | تابع `subtitlesHandler` داخل خود `worker.js` |
| دانلود و استخراج SRT | `downloadProxy.js` + `adm-zip` + `iconv-lite` | `downloadProxy` داخل Worker با پارسر ZIP دستی |
| retry | `apiClient.js` (axios + agent) | `fetchWithRetry` (fetch + `AbortController`) |
| config | `config.js` ← `.env` با `dotenv` | `env` ← Worker Vars/Secrets (بدون dotenv) |
| URL لینک زیرنویس | `http://${SERVER_IP}:${PORT}/download/{id}` | `${url.origin}/subtitles/download/{id}` |
| پیشوند مسیرها | ریشه (`/manifest.json`, `/subtitles/...`, `/download/...`) | همه‌چیز زیر `/subtitles` |
| لوگو در manifest | ❌ ندارد | ✅ `${origin}/subtitles/logo.png` |
| health | `/health` با `uptime`/`memory`/`cpuLoad` | `/subtitles/health` فقط `status:ok` |
| CORS | middleware `cors()` روی کل app | `withCors` روی پاسخ دانلود + `JSON_HEADERS` روی JSON |

```text
Stremio
   │
   ├─ Node ─────► addon.js ──► getRouter(builder) ──► subtitlesHandler.js
   │                │                                      │
   │                │                                      ├─ apiClient.js ──► SubSource / Cinemeta
   │                │                                      └─ config.js
   │                └─────────────────────────────────────► downloadProxy.js ──► ZIP → SRT → Promo
   │
   └─ Worker ───► worker.js (fetch) ──► subtitlesHandler() ──► fetchWithRetry
                        │                     └── filterSeriesSubtitles()
                        └────────────────────► downloadProxy() ──► extractFirstSrt() → Promo
                                                    ▲
                                             env.ASSETS (assets/icons)
```

**قانون طلایی:** هر تغییر رفتاری باید در **دو** پیاده‌سازی هم‌زمان اعمال شود. تنها فایل مشترک `manifest.js` است و اگر فقط یکی را عوض کنی، Node و Edge دو رفتار متفاوت پیدا می‌کنند و تست manual هم‌ارزی شکست می‌خورد.

---

## ۲. نقشه ماژول‌ها

| فایل | Export | مصرف‌کننده | وظیفه | خط‌های حساس |
|------|--------|-----------|--------|-------------|
| `manifest.js` | `module.exports = manifest` (CJS) | `addon.js`, `worker.js` | منبع حقیقت شناسه/نسخه/منابع افزونه | هیچ فیلد `logo` ندارد |
| `config.js` | آبجکت تنظیمات (CJS) | `addon.js`, `apiClient.js`, `subtitlesHandler.js`, `downloadProxy.js`, `server.js` | خواندن env + پیش‌فرض‌ها | `dotenv.config()` در زمان import اجرا می‌شود |
| `apiClient.js` | `{ apiRequest }` | `subtitlesHandler.js`, `downloadProxy.js` | retry + agent بدون keepAlive | `RETRYABLE_CODES`، فرمول backoff |
| `subtitlesHandler.js` | `async (args) => { subtitles: [] }` | `addon.js` (`defineSubtitlesHandler`) | جستجو، فیلتر، ساخت URL دانلود | خط ساخت `url`، بلوک `filter` |
| `downloadProxy.js` | `async (req, res) => void` | `addon.js` (`GET /download/:token`) | دانلود ZIP، استخراج SRT، encoding، Promo | `parseTimestamp`، `addPromoTextToSubtitle` |
| `addon.js` | `{ app, server }` | `server.js` (require) | ساخت Express app، routeها، لاگ، shutdown | ترتیب mount کردن `getRouter` |
| `server.js` | — (entry) | `npm start` | supervisor پروسه‌های cluster | شرط `CLUSTER_ENABLED && cluster.isMaster` |
| `worker.js` | `{ fetch(request, env) }` (ESM default) | Wrangler | router + منطق کامل Edge | `PUBLIC_PREFIX`، پارسر ZIP، `run_worker_first` |

### گراف وابستگی (Node)

```text
server.js
   └─► addon.js
         ├─► manifest.js
         ├─► config.js            (dotenv)
         ├─► subtitlesHandler.js
         │     ├─► config.js
         │     └─► apiClient.js ──► config.js
         └─► downloadProxy.js
               ├─► adm-zip, iconv-lite
               ├─► config.js
               └─► apiClient.js
```

`worker.js` عمداً تنها `manifest.js` را require می‌کند تا هیچ وابستگی Node-only (`express`, `adm-zip`, `iconv-lite`, `axios`, `dotenv`) وارد باندل Edge نشود.

---

## ۳. قرارداد داده و API خارجی

### پاسخ SubSource که کد به آن تکیه می‌کند

```jsonc
// GET /movies/search → { success, data: [ { movieId, ... } ] }
// GET /subtitles?...  → { success, data: [ { subtitleId, releaseInfo: [string, ...], ... } ] }
```

فیلدهایی که **واقعاً** خوانده می‌شوند: `success`، `data[]`، `data[].movieId`، `data[].subtitleId`، `data[].releaseInfo`.
هیچ اعتبارسنجی دقیق روی بقیه فیلدها وجود ندارد؛ اگر `subtitleId` عدد نباشد `String(sub.subtitleId)` در Worker و `sub.subtitleId.toString()` در Node رفتار متفاوتی دارند (در Node روی `undefined` خطا می‌دهد و به `{subtitles: []}` می‌افتد).

### درخواست خروجی افزونه

```text
GET https://api.subsource.net/api/v1/movies/search?searchType=text&q={name}&season={season}
GET https://api.subsource.net/api/v1/movies/search?searchType=imdb&imdb={imdbId}
GET https://api.subsource.net/api/v1/subtitles?movieId={id}&language=farsi_persian&sort=rating&limit=100
GET https://api.subsource.net/api/v1/subtitles/{subtitleId}/download     → ZIP (arraybuffer)
GET https://v3-cinemeta.strem.io/meta/series/{imdbId}.json               → { meta: { name } }
```

هدر احراز هویت همه‌جا: `X-API-Key` (در Worker با fallback به رشته خالی؛ اگر `API_KEY` نباشد `getMovieId` عمداً throw می‌کند).

### پاسخ به Stremio

```jsonc
{
  "subtitles": [
    {
      "id": "1234567",                       // subtitleId به رشته
      "url": "http://HOST:PORT/download/1234567",
      "lang": "fas",
      "title": "WEB-DL 1080p S01E05"         // releaseInfo.join(' ')
    }
  ]
}
```

قالب فایل تحویلی: `Content-Type: application/x-subrip; charset=utf-8` و بدنه SRT خالص (UTF-8). افزونه هیچ `behaviorHints` یا فیلد `id` منحصربه‌فرد سراسری (مثلاً hash) تولید نمی‌کند؛ `id` همان `subtitleId` سابسورس است.

---

## ۴. مستندات تابع‌به‌تابع

### manifest.js

آبجکت ثابت manifest استرمیو:

```js
{
  id: "community.subtitles.persian",
  version: "1.0.0",
  name: "Persian Subtitles",
  author: "Ali Rostami",
  description: "Provides Persian subtitles from the SubSource API.",
  resources: ["subtitles"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: []
}
```

- `idPrefixes: ["tt"]` یعنی Stremio فقط برای محتوا با IMDb این افزونه را صدا می‌زند؛ برای سریال‌های بدون IMDb هیچ درخواستی نمی‌آید.
- `resources: ["subtitles"]` تنها resource است؛ **catalog، meta و stream وجود ندارد**.
- نسخه Worker روی این آبجکت `behaviorHints.configurable: false` و `logo` را اضافه می‌کند (`getManifest(origin)`).

### config.js

```js
require('dotenv').config();
module.exports = { SERVER_IP, PORT, LONG_TIMEOUT, SHORT_TIMEOUT, API_KEY, CLUSTER_ENABLED, ... };
```

منطق همه‌جا یکسان است: `parseInt(process.env.X, 10) || default` برای عدد و `process.env.X === 'true'` برای بولین.

- ⚠️ چون `API_KEY` از `process.env` خوانده می‌شود و `dotenv.config()` فقط یک بار در اولین require اثر دارد، هر import زودهنگام‌تر از `config.js` می‌تواند `process.env` را بدون مقادیر `.env` ببیند. `subtitlesHandler.js` و `downloadProxy.js` مستقیماً `process.env.API_KEY` را چک می‌کنند (نه `config.API_KEY`) — این تنها سازگاری‌شان با dotenv است.
- `PORT` و `LONG_TIMEOUT` و `MAX_SOCKETS` از `config.js` مصرف می‌شوند؛ فهرست کامل و مقدارهای **مصرف‌نشده** در بخش [۸](#۸-پیکربندی-کامل-متغیرهای-محیطی) است.

### apiClient.js

```js
async function apiRequest({ method='get', url, headers={}, params={}, responseType='json',
                            timeout = config.LONG_TIMEOUT, retries = 3 })
```

مسیر اجرا:

1. حلقه `for (attempt = 0; attempt <= retries; ...)` → حداکثر **۴ تلاش** (اولی + ۳ retry).
2. `axios({ ..., httpAgent, httpsAgent, maxRedirects: 5 })`.
3. `catch` → اگر `!isRetryable(error)` یا آخرین تلاش بود، throw؛ در غیر این‌صورت `await delay(backoff)`.

```js
const backoff = 300 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
// attempt 0 → ~300–500ms، attempt 1 → ~600–800ms، attempt 2 → ~1200–1400ms
```

```js
RETRYABLE_CODES = { ECONNRESET, ECONNABORTED, ETIMEDOUT, EPIPE, EAI_AGAIN, ENOTFOUND }
isRetryable(e) = (e.code ∈ RETRYABLE_CODES) || (e.response && (status === 429 || status >= 500))
```

- `httpAgent`/`httpsAgent` با `keepAlive: false` و `maxSockets: config.MAX_SOCKETS` ساخته می‌شوند؛ هدف مشخصشان حذف socketهای مرده keep-alive است که منبع اصلی `read ECONNRESET` بودند.
- `ENOTFOUND` قابل retry است (DNS موقت) ولی هیچ backoff برای `429` متفاوت از `5xx` نیست؛ اگر سابسورس rate-limit کند، policy یکسان است.
- خروجی: پاسخ کامل axios (`response.data`, `response.status`). صداکننده مسئول چک کردن `success` بدنه است.

### subtitlesHandler.js

```js
async function subtitlesHandler(args)   // args = { type, id, ... } از SDK
```

جریان (با نام واقعی لاگ‌ها):

| گام | کد/شرط | لاگ |
|-----|--------|-----|
| 1 | ورودی | `Request for subtitles received for: {id}` |
| 2 | `if (!process.env.API_KEY)` → `return { subtitles: [] }` | `API Key is missing from .env file.` (خطا) |
| 3 | `type === 'series'` → `id.split(':')` به `[imdbId, season, episode]`، وگرنه `imdbId = id` | — |
| 4 | (سریال) Cinemeta `meta/series/{imdbId}.json` → `mediaRes.data.meta.name` | در صورت خطا: `Cinemeta fetch failed, falling back to Attempt 2. Error: ...` |
| 5 | جستجوی متنی: `movies/search?searchType=text&q={name}&season={season}` | `Attempt 1 (Primary): Searching with Series Name "..." and Season "..."` → `Success from Attempt 1. Found correct movieId: N` یا `Attempt 1 failed. Falling back to Attempt 2.` |
| 6 | fallback: `movies/search?searchType=imdb&imdb={imdbId}` | `Attempt 2 (Fallback): Searching with IMDb ID directly.` → `Success from Attempt 2. Found movieId: N` |
| 7 | `if (!movieId)` → `{ subtitles: [] }` | `Both attempts failed to find a movieId.` |
| 8 | `GET /subtitles?movieId=...&language=farsi_persian&sort=rating&limit=100` | در صورت نبود نتیجه: `No Persian subtitles found for movieId: N` |
| 9 | (سریال) فیلتر فصل/قسمت — بخش [۵](#۵-الگوریتم-تطبیق-فصلقسمت) | `Applying detailed filter for patterns: [S01E05, S1E5, 1x05] or season packs.` |
| 10 | `map` به قرارداد خروجی | `Successfully prepared N subtitles.` |
| 11 | `catch` سراسری → `{ subtitles: [] }` | `Error in subtitlesHandler: {message}` (خطا) |

نکات پیاده‌سازی که هنگام تغییر باید بدانی:

- **`season` در fallback دوم استفاده نمی‌شود**؛ یعنی اگر جستجوی متنی شکست بخورد، برای سریال نتیجه `movieId` سطح سریال برمی‌گردد و فیلتر مرحله ۹ باید قسمت را از دل آرشیو کل سریال بیرون بکشد.
- `mediaName` هیچ escape/trim اضافه‌ای نمی‌گیرد؛ کاراکترهای `&`, `:` در نام سریال به‌صورت خام در query string می‌روند (در URL template دستی، نه `params`). اگر سابسورس با نام‌های دارای `&` مشکل دارد، `encodeURIComponent(mediaName)` همین‌جا اعمال نشده است.
- هیچ تطبیق `type === 'movie'` با season انجام نمی‌شود؛ برای فیلم، هر ۱۰۰ زیرنویس برمی‌گردد (فیلتر فقط برای سریال).
- خروجی `url` تنها نقطه‌ای است که `SERVER_IP`/`PORT` به کاربر نهایی نشت می‌کند — بخش [۹، مورد ۲](#۹-مسائل-شناخته‌شده-و-بدهی-فنی).
- `Promise.resolve(...)` در بازگشت‌ها اختیاری است (تابع `async` است) ولی برای سازگاری با SDK نگه داشته شده.

### downloadProxy.js

```js
async function downloadProxy(req, res)   // mounted: GET /download/:token
```

1. `const { token } = req.params` — اگر خالی بود `400 No subtitle ID provided`.
2. اگر `!process.env.API_KEY` → `500 Server configuration error`.
3. `apiRequest({ url: /subtitles/{token}/download, responseType: 'arraybuffer', timeout: config.LONG_TIMEOUT, headers: { 'X-API-Key': ... } })` → لاگ `Proxying download for subtitle ID: {token}`.
4. `new AdmZip(response.data)` و `zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.srt'))` → **اولین** `.srt`، بدون اولویت‌دهی به نام بزرگ‌تر/بتر. نبودش = `404 No .srt file found in ZIP archive`.
5. `iconv.decode(rawBuffer, 'utf-8')`؛ اگر خروجی شامل `\uFFFD` بود → `iconv.decode(rawBuffer, 'win1256')` و لاگ `Re-encoded subtitle from Windows-1256 to UTF-8 for: {entryName}`.
6. `if (config.SUBTITLE_PROMO_TEXT)` → `addPromoTextToSubtitle(...)` در `try/catch` جدا (خطای promo هرگز دانلود را نمی‌شکند) → لاگ `Added promotional text ({position}) to subtitle {token}`.
7. `res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8')` و `res.send(srtContent)`.
8. `catch` → `500 Failed to proxy subtitle download` و لاگ `Proxy Download Error: {message}`.

تفاوت آگاهانه با Worker: اینجا `Content-Disposition` و `Cache-Control` ست **نمی‌شود** و `res.send` رشته را بدون `charset` اضافه می‌فرستد (هدر دستی ست شده). `token` هیچ اعتبارسنجی الگویی (مثلاً فقط رقم) ندارد و مستقیم در URL قرار می‌گیرد؛ مسیر نسبی با `encodeURIComponent` نساخته شده، پس کاراکترهای خاص در `token` به درخواست `/subtitles/...` منتقل می‌شوند.

### addon.js

نقطه ورود Node. ترتیب دقیق mount کردن مهم است:

```js
const builder = new addonBuilder(manifest);
builder.defineSubtitlesHandler(subtitlesHandler);

app.use(cors());
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(requestLogger);              // res.on('finish') → `${method} ${path} - ${status} (${duration}ms)`
app.get('/download/:token', downloadProxy);
app.use(getRouter(builder.getInterface()));   // ← /manifest.json و /subtitles/*
app.get('/health', ...);
```

- `getRouter` بعد از routeهای دستی mount شده؛ اگر در آینده مسیر `GET /` اضافه کنی و آن را **قبل** از router بگذاری، router همچنان `/manifest.json` را می‌گیرد ولی `/health` (که بعد از router است) با `GET /subtitles/:type/:id.json` تداخل ندارد.
- `app.listen(config.PORT, '0.0.0.0', ...)` — bind روی همه اینترفس؛ برای preview/برون‌سپاری لازم است.
- `gracefulShutdown(signal)` فقط `server.close()` را صدا می‌زند و بعد از `10000ms` با `process.exit(1)` force می‌کند. چون در `finally` نیست، اگر `server` تعریف نشده باشد مستقیم `process.exit(0)`.
- `process.on('uncaughtException' | 'unhandledRejection')` فقط لاگ می‌کنند و پروسه را نکُشند — در حالت cluster یعنی worker بعد از خطای غیرمنتظره زنده می‌ماند.
- export انتهایی `{ app, server }` برای تست‌های آینده (supertest) نگه داشته شده؛ `server` در زمان export هنوز `undefined` است چون `listen` async است.

### server.js

```js
const numCPUs = config.WORKER_COUNT > 0 ? config.WORKER_COUNT : os.cpus().length;
if (config.CLUSTER_ENABLED && cluster.isMaster) { /* fork ×N */ } else { require('./addon'); }
```

- master: fork به تعداد `numCPUs`، لاگ `Worker {pid} spawned` و `✓ Worker {pid} is online (k/N)`.
- `cluster.on('exit')` → لاگ `⚠️  Worker {pid} died (code: ..., signal: ...)` و بعد از `1000ms` fork جدید با لاگ `🔄 New worker {pid} started`.
- `gracefulShutdown` master: به هر worker پیام `'shutdown'` را `send` می‌کند (⚠️ هیچ `process.on('message')` در `addon.js` این پیام را مصرف نمی‌کند، پس فقط timer ۱۰ ثانیه‌ای و در نهایت `SIGKILL` عمل می‌کند)، سپس master بعد از `15000ms` خارج می‌شود.
- اگر `CLUSTER_ENABLED=false` باشد، `server.js` عملاً همان `addon.js` را در همان پروسه require می‌کند (بدون master) — تفاوت فقط در یک لاگ `Worker {pid} starting...`.

### worker.js

`export default { async fetch(request, env) }` و داخلش `handleRequest`:

| مسیر | پاسخ |
|------|------|
| `OPTIONS` هر مسیری | `204` + هدرهای CORS |
| غیر `GET` | `405 Method Not Allowed` |
| `/subtitles` یا `/subtitles/` | `{ status:'ok', service:'subsource-stremio-addon', runtime:'cloudflare-workers' }` |
| `/subtitles/health` | همان JSON بالا (بدون uptime) |
| `/subtitles/manifest.json` | `getManifest(url.origin)`، کش `public, max-age=300` |
| `/subtitles/logo.png` | `env.ASSETS.fetch` (بدون binding → `404`) |
| `/subtitles/download/{id}` | `downloadProxy(id, env)` |
| `/subtitles/{movie\|series}/{id}[.json]` | `json(await subtitlesHandler(type, id, env, url.origin))` |
| بقیه | `404 Not Found` |

توابع داخلی و جزئیاتشان:

- `json(data, status, extraHeaders)` — همیشه `access-control-allow-origin: *`، `content-type: application/json; charset=utf-8` و `cache-control: no-store`.
- `withCors(res)` — سه هدر CORS را روی یک پاسخ موجود کپی/ست می‌کند (برای بدنه SRT استفاده می‌شود).
- `fetchWithRetry(url, options, retries = 3)` — `AbortController` + `setTimeout` برای تایم‌اوت (پیش‌فرض `DEFAULT_TIMEOUT_MS = 60000`)، retry روی `[429,500,502,503,504]` و خطاهای throw شده، backoff `300 * 2 ** attempt + rand(0..199)`. ⚠️ مقدار `LONG_TIMEOUT` در `env` فقط در `downloadProxy` خوانده می‌شود، نه در `fetchJson` مسیر جستجو.
- `fetchJson` — اگر `!response.ok` باشد `Error('HTTP {status} for {url}')` throw می‌کند؛ یعنی پاسخ `4xx` retry نمی‌شود ولی `fetchWithRetry` آن را برگردانده و اینجا تبدیل به خطا می‌کند.
- `apiHeaders(env)`, `parseStremioId(type, id)` (بدون guard برای `id` بدون `:`؛ اگر سریال `tt1` بدون season بیاید، `season === undefined`).
- `getMovieId(type, imdbId, season, env)` — دقیقاً معادل Attempt 1/Attempt 2 نسخه Node، با `encodeURIComponent` روی `name`، `imdbId` و `season` (تفاوت با Node).
- `filterSeriesSubtitles(subtitles, season, episode)` — `Number.isInteger` روی هر دو؛ در نبودش `[]` برمی‌گرداند (رفتار متفاوت با Node که اینجا `NaN` را در pattern می‌گذارد و عملاً همه فیلتر می‌شوند).
- `findEndOfCentralDirectory(bytes)` — جستجوی `0x06054b50` از انتها تا `max(0, len-65557)`، یعنی حداکثر comment اندازه ۶۵۵۳۵ بایت پشتیبانی می‌شود. ⚠️ `readU32(new DataView(bytes.buffer, bytes.byteOffset, ...), i)` با offset ساخته می‌شود اما در حلقه اصلی `view` جداست؛ اگر `ArrayBuffer` یک `byteOffset` غیرصفر داشته باشد، مقایسه EOCD می‌تواند بی‌جهت بخورد.
- `extractFirstSrt(zipBytes)` — پارس central directory (`0x02014b50`)، خواندن `method`, `compressedSize`, `fileNameLength`, `localHeaderOffset`؛ فقط `method 0` (store) و `method 8` (deflate با `DecompressionStream('deflate-raw')`) پشتیبانی می‌شود، بقیه `throw`. ZIP64، data descriptor و archive با `entryCount > 65535` پشتیبانی نمی‌شوند.
- `parseTimestamp` / `toTimestamp` / `addPromoTextToSubtitle` — همان الگوریتم SRT بخش [۶](#۶-الگوریتم-درج-متن-promo-در-srt)؛ رنگ `&H00FFFF00` هاردکد است.
- `getAsset(pathname, request, env)` — `assetUrl.pathname = pathname` روی URL درخواست اصلی؛ یعنی assetها باید ریشه‌ی `assets.directory` باشند (`/logo.png` نه `/icons/logo.png`).
- حالت ماژول: فایل ESM است (`export default`) ولی خط اولش `require('./manifest')` است؛ خود `wrangler` این را resolve می‌کند، اما `node worker.js` مستقیم کار نمی‌کند (در `package.json` هم `type: "commonjs"` است).

---

## ۵. الگوریتم تطبیق فصل/قسمت

ورودی: `season`, `episode` (از `id` استرمیو) و `data[]` از endpoint `/subtitles`.

```js
release = sub.releaseInfo.join(' ').toUpperCase().replace(/[-._\s]/g, '');

episodePatterns = [
  `S${pad2(season)}E${pad2(episode)}`,   // S01E05
  `S${season}E${episode}`,               // S1E5
  `${season}x${pad2(episode)}`           // 1x05
];
seasonPatterns = [`SEASON${pad2(season)}`, `SEASON${season}`, `S${pad2(season)}`];

keep = episodePatterns.some(p => release.includes(p))
    || (release.includes('COMPLETE') && seasonPatterns.some(p => release.includes(p)));
```

خواص و دام‌های مهم:

- `releaseInfo` باید **آرایه** باشد؛ اگر رشته باشد یا نباشد، آن زیرنویس حذف می‌شود (`if (!Array.isArray(sub.releaseInfo)) return false`).
- نرمال‌سازی فقط `-`, `.`, `_` و فاصله را حذف می‌کند؛ `[]`, `()`, و کاراکترهای یونیکد دست‌نخورده می‌مانند. پس `[S01E05]` کار می‌کند ولی `1×5` (علامت ضربدر) خیر.
- چون `S1E5` پس از حذف صفرها نوشته می‌شود و `release` هم بدون جداکننده است، هر دو شکل `S01E05` و `S1E5` معمولاً با الگوی `S01E05` تطبیق می‌خورند؛ اما `1x5` (بدون pad) با `1x05` تطبیق **نمی‌خورد**.
- فصل‌های دو رقمی: `season = 10` → `S10E05` و `S10E5`، و `SEASON10` / `S10`؛ مشکلی نیست.
- حالت «پرونده نامعتبر»: اگر `season`/`episode` عددی نباشد (مثلاً `special`)، نسخه Node فیلتر را اجرا می‌کند و همه چیز حذف می‌شود، نسخه Worker زودتر `[]` برمی‌گرداند.
- **هیچ ترتیب/امتیازدهی اضافه‌ای وجود ندارد:** ترتیب خروجی همان ترتیب `sort=rating` از سابسورس است. اگر بخواهی «بهترین نسخه» اول بیاید، باید همان‌جا امتیازدهی (زیرنویس تک‌فایلی > season pack، ۱۰۸۰p > ۷۲۰p و...) اضافه کنی.

---

## ۶. الگوریتم درج متن Promo در SRT

```js
addPromoTextToSubtitle(srtContent, promoText, durationSeconds, position)
```

1. `srtContent.split(/\n\s*\n/)` → بلوک‌ها؛ اگر چیزی نبود، بدون تغییر برمی‌گردد.
2. متن با تگ ASS رنگ‌دار می‌شود: `{\c&H00FFFF00&}{متن}{\c}` (زرد). این تگ در SRT استاندارد نیست؛ پلیرهایی که ASS override را نمی‌فهمند آن را خام نمایش می‌دهند.
3. `position === 'start'` (Node):
   - تایم‌لاین بلوک اول پیدا می‌شود (اولین خط شامل `-->`)،
   - `promoBlock = 1\n00:00:00,000 --> {duration}\n{text}`،
   - همه بلوک‌های قبلی از `2` به بعد **شماره‌گذاری مجدد** می‌شوند.
4. `position === 'end'`:
   - از تایم‌لاین آخرین بلوک، `gapMs = min(3000, max(0, (end - start) * 0.3))`،
   - `promoStart = end - gapMs`، `promoEnd = promoStart + durationMs`،
   - شماره بلوک جدید = `blocks.length + 1`.
5. در Node یک fallback نهایی هم وجود دارد: اگر هیچ خط `-->` پیدا نشد، بلوک promo با `lastEndTime` به انتها اضافه می‌شود (در Worker در این حالت هیچ تغییری اعمال نمی‌شود — بخشی از بدهی هم‌رفتاری).

نکات تست: بلوک‌های دارای خط توضیحی اضافه، بلوک‌های چندخطی، و زیرنویس‌هایی که شماره‌شان از ۱ شروع نمی‌شود، رفتار شماره‌گذاری مجدد را می‌توانند خراب کنند.

---

## ۷. مدل خطاها و لاگ‌ها

- **هیچ‌وقت ۵۰۰ به Stremio برای مسیر جستجو برنمی‌گردد:** همه خطاها در `subtitlesHandler` (Node و Worker) بلعیده و به `{ subtitles: [] }` تبدیل می‌شوند. عیب‌یابی فقط از طریق لاگ ممکن است.
- مسیر دانلود **کد وضعیت واقعی** برمی‌گرداند: `400` (token خالی)، `500` (کلید نبود / خطای عمومی) در Node؛ `400`, `500`, `502` (خطای proxy) و پاس‌ترانس `response.status` از سابسورس در Worker.
- `worker.js` یک پوش نهایی دارد: هر throw نشده → `json({ error: 'Internal Server Error' }, 500)`.
- لاگ‌های Node همه `console.log/warn/error` ساده‌اند؛ `LOG_LEVEL` فیلتر ندارد. در حالت cluster لاگ همه workerها در یک stdout قاطی می‌شود و هیچ `pid` در خطوط درخواست نیست.
- برای افزودن ساختار به لاگ، جای امن همان middleware لاگ در `addon.js` است (`res.on('finish')`)؛ لاگ‌های `apiClient` را به `console.info` منتقل نکن اگر انتظار داری CI لاگ را نگه دارد.

---

## ۸. پیکربندی کامل متغیرهای محیطی

### Node — مصرف‌شده در کد

| متغیر | پیش‌فرض | خواننده |
|-------|---------|---------|
| `API_KEY` | — (اجباری رفتاری) | `subtitlesHandler.js`, `downloadProxy.js` (از `process.env`) |
| `PORT` | `7000` | `addon.js` (`listen`), `subtitlesHandler.js` (URL) |
| `SERVER_IP` | `127.0.0.1` | `addon.js` (لاگ نصب), `subtitlesHandler.js` (URL) |
| `LONG_TIMEOUT` | `60000` | `apiClient.js` (پیش‌فرض timeout), `downloadProxy.js` |
| `MAX_SOCKETS` | `50` | `apiClient.js` (agentها) |
| `CLUSTER_ENABLED` | `false` | `server.js` |
| `WORKER_COUNT` | `0` (= تعداد هسته) | `server.js` |
| `SUBTITLE_PROMO_TEXT` | متن حمایت پیش‌فرض | `downloadProxy.js` |
| `SUBTITLE_PROMO_DURATION` | `20` | `downloadProxy.js` |
| `SUBTITLE_PROMO_POSITION` | `end` | `downloadProxy.js` |

### Node — تعریف‌شده در `config.js` ولی بدون مصرف (بدهی فنی)

`SHORT_TIMEOUT` · `LOG_LEVEL` · `RATE_LIMIT_ENABLED` · `RATE_LIMIT_MAX` · `RATE_LIMIT_WINDOW_MS` · `CACHE_ENABLED` · `REDIS_URL` · `CACHE_TTL` · `MAX_FREE_SOCKETS`

این‌ها در `.env.example` هم وجود دارند؛ اگر پیاده‌سازی‌شان نکردی، تغییرشان هیچ اثری ندارد. دو گزینه: (الف) پیاده‌سازی، (ب) حذف از `config.js` و `.env.example` تا سند گمراه‌کننده نماند.

### Worker (Cloudflare)

| متغیر | منبع | رفتار نبودش |
|-------|------|--------------|
| `API_KEY` | Worker Secret (در CI با `wrangler secret put`) | `getMovieId` throw → `{subtitles: []}`؛ دانلود → `500 Server configuration error` |
| `LONG_TIMEOUT` | Var (اختیاری) | پیش‌فرض داخلی `60000ms` فقط در دانلود |
| `SUBTITLE_PROMO_TEXT` | Var (اختیاری) | `DEFAULT_PROMO_TEXT` داخل `worker.js`؛ رشته خالی = بدون promo |
| `SUBTITLE_PROMO_DURATION` / `_POSITION` | Var (اختیاری) | `20` / `end` |
| `ASSETS` | binding خودکار از `wrangler.jsonc` | نبودش → `404` روی `/subtitles/logo.png` |

---

## ۹. مسائل شناخته‌شده و بدهی فنی

۱. **تکرار منطق بین Node و Worker.** `subtitlesHandler`, `downloadProxy`, `parseTimestamp`, `toTimestamp`, `addPromoTextToSubtitle`, retry/backoff و الگوهای فصل/قسمت در دو جا پیاده‌سازی شده‌اند و هم‌اکنون ۴ تفاوت رفتاری دارند: `encodeURIComponent`، گارد `Number.isInteger`، گارد `startsWith('tt')`، و شاخه `position: 'start'` Worker که شماره‌گذاری مجدد نمی‌کند. راه‌حل پیشنهادی: یک `core.js` بدون I/O و بدون وابستگی Node-only، با تزریق `fetch`/`env`.

۲. **URL دانلود هاردکد `http://SERVER_IP:PORT`.** پشت TLS proxy یا پورت غیراستاندارد، لینک‌ها یا `http` می‌مانند یا پورت داخلی را لو می‌دهند. راه‌حل: ساخت URL از `x-forwarded-proto` + `Host` (`app.set('trust proxy', true)` از قبل فعال است) — الگوی آن در پروژه خواهرش با `req.get('host')` قابل پیاده‌سازی است؛ `subtitlesHandler` فعلی به `req` دسترسی ندارد، پس باید handler با `getRouter` یا middleware مقدار `baseUrl` را به args اضافه کند (SDK آن را در `args` نمی‌فرستد).

۳. **`LONG_TIMEOUT` در Worker بی‌اثر است** برای requestهای جستجو (فقط دانلود آن را می‌خواند). اگر جستجو آهسته باشد، تایم‌اوت ۶۰ ثانیه‌ای Edge را نزدیک سقف CPU/wall-clock Worker می‌برد.

۴. **متغیرهای مصرف‌نشده config** (بخش [۸](#۸-پیکربندی-کامل-متغیرهای-محیطی)) و نبود هرگونه rate limit در حالی که `RATE_LIMIT_*` وعده داده می‌شود.

۵. **پارسر ZIP Worker شکننده است:** فقط `method` ۰ و ۸، بدون ZIP64، بدون data descriptor، جستجوی EOCD با `DataView` که `byteOffset` بافر را در حلقه اصلی در نظر نمی‌گیرد، و انتخاب «اولین `.srt`» به‌جای «بزرگ‌ترین/پرسازش‌ترین». آرشیوهایی با چند فایل (`.srt` + `.idx` + `README.txt`) ممکن است فایل اشتباه بدهند.

۶. **بدون cache:** هر درخواست Stremio (مثلاً هر بار باز کردن صفحه یک قسمت) یک جستجوی جدید Cinemeta + دو request سابسورس می‌زند. `subtitleId`ها تغییرناپذیرند و کش `movieId → subtitles` برای چند دقیقه بی‌خطر است.

۷. **`subtitleId` بدون اعتبارسنجی الگو** به `downloadProxy` می‌رسد و مستقیم در مسیر URL قرار می‌گیرد؛ محدود به `encodeURIComponent` در Worker است، ولی در Node همان `req.params.token` خام است. یک `/^[0-9]+$/` ساده، سطح حمله و لاگ‌های عجیب را کم می‌کند.

۸. **`adm-zip`, `cheerio`, `axios-https-proxy-fix`, `https-proxy-agent`** در وابستگی‌ها هستند ولی در مسیر اصلی استفاده نمی‌شوند (`cheerio` هیچ‌جا import نشده؛ دو پکیج proxy هم مصرف‌کننده ندارند). `npm audit` و اندازه نصب را بی‌دلیل بزرگ می‌کنند.

۹. **نبود تست، lint، Dockerfile و فایل `LICENSE`** در مخزن؛ `npm test` عمداً `exit 1` می‌کند. تنها تست موجود، اجرای دستی + `wrangler deploy --dry-run` در CI است.

۱۰. **`cluster.on('exit')` بدون سقف restart:** اگر پروسه بلافاصله بعد از listen بمیرد (مثلاً `EADDRINUSE`)، حلقه fork/restart هر ۱ ثانیه بی‌نهایت ادامه پیدا می‌کند. یک counter با backoff افزایشی لازم است.

۱۱. **`message: 'shutdown'` بی‌مصرف** در `server.js`؛ worker آن را نمی‌فهمد و shutdown تدریجی واقعی (قطع اتصال‌های باز) انجام نمی‌شود.

۱۲. **`manifest.js` بدون `logo`** → نسخه Node در Stremio آیکن پیش‌فرض دارد در حالی که نسخه Worker لوگو نشان می‌دهد (ناهمانی ظاهری بین دو runtime).

---

## ۱۰. راهنمای تست و بازبینی تغییرات

قبل از PR، این حداقل‌ها را اجرا کن (همه با Node `20.18.1+`؛ نسخه CI: `22`):

```bash
# ۱) ساختار و syntax
node --check addon.js && node --check server.js && node --check apiClient.js \
  && node --check config.js && node --check downloadProxy.js && node --check manifest.js \
  && node --check subtitlesHandler.js

# ۲) boot Node بدون کلید واقعی (باید بدون crash بالا بیاید و /health بدهد)
API_KEY=dummy PORT=7101 SERVER_IP=127.0.0.1 node addon.js &
sleep 1
curl -s localhost:7101/manifest.json
curl -s localhost:7101/health
curl -s localhost:7101/subtitles/movie/tt0111161.json   # → {"subtitles":[]} یا لیست واقعی

# ۳) ruting Worker + باندل
npx --yes wrangler dev --port 8787
curl -s localhost:8787/subtitles/manifest.json
curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/     # انتظار: 404
curl -s localhost:8787/subtitles/movie/tt0111161.json

# ۴) بررسی نهایی که CI انجام می‌دهد
npx --yes wrangler@4.128.0 deploy --dry-run
```

تست‌های واحد پیشنهادی (هنوز در مخزن نیست، ولی منطق خالص‌اند و بدون شبکه کار می‌کنند):

| تابع | ورودی‌های مرزی که باید پاس شوند |
|------|-------------------------------|
| `addPromoTextToSubtitle` | زیرنویس ۱ بلوکی؛ بلوک بدون خط `-->`; `position: 'start'` با renumber; بلوک انتهایی با `end === start` |
| `parseTimestamp` / `toTimestamp` | `00:00:00,000`، `99:59:59,999`، رشته با فاصله اضافه |
| `filterSeriesSubtitles` | `S1E5` vs `S01E05`، `1x5` (باید رد شود)، `SEASON 01 COMPLETE`، `releaseInfo` غیرآرایه |
| `extractFirstSrt` / adm-zip | ZIP با `method 0`، `method 8`، آرشیو بدون `.srt`، آرشیو با comment > 0 |
| `isRetryable` / backoff | `ECONNRESET` (retry)، `404` (بدون retry)، `429` (retry)، `ENOTFOUND` (retry) |

برای تست بدون درگیری با سابسورس، `apiRequest` را mock کن و فقط تابع خالص را صدا بزن: در `worker.js` توابع export نشده‌اند، پس اگر خواستی تست node-based بنویسی، آن‌ها را با `export { ... }` یا یک `lib/` جدا قابل‌import کن (این هم یکی از دلایل پیشنهاد `core.js` در بخش ۹ است).

---

## ۱۱. چک‌لیست افزودن تغییر به منطق

- [ ] تغییر در `subtitlesHandler.js`؟ → همان را در `worker.js` اعمال کن و جدول بخش [۹، مورد ۱](#۹-مسائل-شناخته‌شده-و-بدهی-فنی) را به‌روز کن.
- [ ] تغییر فیلترهای فصل/قسمت؟ → الگوها در **دو** فایل هستند و هر دو باید یکسان بمانند؛ یک fixture از `releaseInfo` واقعی اضافه کن.
- [ ] تغییر در `downloadProxy.js`؟ → پارسر `extractFirstSrt` و مسیر `res.send` هر دو را بررسی کن؛ type پاسخ `application/x-subrip` را حفظ کن.
- [ ] افزودن متغیر محیطی؟ → `config.js` + `.env.example` + خواننده واقعی در کد + ستون «مصرف‌شده/مصرف‌نشده» جدول همین فایل.
- [ ] تغییر `manifest.js`؟ → هر دو runtime از آن استفاده می‌کنند؛ `version` manifest و `version` `package.json` را با هم بفرست (هم‌اکنون `1.0.0` و `2.0.0` هستند و عمداً جدا نگه داشته شده‌اند).
- [ ] تغییر فایل‌های `worker.js`/`manifest.js`/`wrangler.jsonc`/`package*.json`/`assets/icons/**`؟ → workflow دیپلوی اجرا می‌شود؛ `wrangler deploy --dry-run` را محلی بگیر تا CI قرمز نشود.
- [ ] بخش‌های مرتبط در [README.md](../README.md) (ساختار پروژه، جدول مسیرها، عیب‌یابی) و همین فایل به‌روز شد؟
