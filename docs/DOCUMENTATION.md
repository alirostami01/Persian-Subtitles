# 🧩 مستندات فنی — Persian Subtitles Add-on

این سند **مستندات فنی/توسعه‌دهنده** پروژه است و بر اساس کد واقعی در شاخه `main` راستی‌آزمایی شده است. مخاطب آن برنامه‌نویسی است که می‌خواهد منطق افزونه را بفهمد، آن را تغییر دهد یا runtime جدیدی اضافه کند. راهنمای نصب، استقرار و مصرف کاربر در [README.md](../README.md) است.

پروژه از یک نقطه ورود ساده‌ی Node به معماری **چندماژولی** تفکیک شده تا هم روی **Node.js/Express** و هم روی **Cloudflare Workers** بدون تغییر منطق اصلی اجرا شود:

- هسته منطق جستجو و فراخوانی API در `subtitlesHandler.js` است.
- لایه دانلود و استخراج `SRT` در `downloadProxy.js` قرار دارد.
- کلاینت HTTP با retry در `apiClient.js` است.
- manifest و پیکربندی به‌ترتیب در `manifest.js` و `config.js` هستند.
- سرور Node (همراه با حالت Cluster) در `addon.js` و `server.js` است.
- آداپتور Cloudflare Worker در `worker.js` است.
- پیکربندی Worker در `wrangler.jsonc` است.

> ⚠️ این پروژه هیچ فایل زیرنویس یا رسانه‌ای را میزبانی یا ذخیره نمی‌کند؛ فقط از API رسمی **SubSource** استفاده می‌کند و بنابراین وجود **کلید API** (`API_KEY`) الزامی است. مسئولیت رعایت قوانین کپی‌رایت بر عهده کاربر است.

---

## فهرست مطالب

- [معماری و دلیل تفکیک](#معماری-و-دلیل-تفکیک)
- [ساختار واقعی مخزن](#ساختار-واقعی-مخزن)
- [وابستگی‌ها و اسکریپت‌ها](#وابستگیها-و-اسکریپتها)
- [متغیرهای محیطی](#متغیرهای-محیطی)
- [Manifest افزونه](#manifest-افزونه)
- [کلاینت HTTP](#کلاینت-http)
- [نقشه ماژول‌ها](#نقشه-ماژولها)
  - [manifest.js](#manifestjs)
  - [config.js](#configjs)
  - [apiClient.js](#apiclientjs)
  - [subtitlesHandler.js](#subtitleshandlerjs)
  - [downloadProxy.js](#downloadproxyjs)
  - [addon.js — هسته](#addonjs--هسته)
  - [server.js — سرور کلاس](#serverjs--سرور-کلاس)
  - [worker.js — آداپتور Cloudflare](#workerjs--آداپتور-cloudflare)
  - [wrangler.jsonc](#wranglerjsonc)
- [جریان پردازش درخواست](#جریان-پردازش-درخواست)
- [تابع‌های کمکی عمومی](#تابعهای-کمکی-عمومی)
- [لایه جستجوی ترکیبی (Hybrid) در subtitlesHandler](#لایه-جستجوی-ترکیبی-hybrid-در-subtitleshandler)
- [الگوریتم تطبیق فصل/قسمت](#الگوریتم-تطبیق-فصلقسمت)
- [لایه دانلود و استخراج SRT](#لایه-دانلود-و-استخراج-srt)
- [الگوریتم درج متن Promo](#الگوریتم-درج-متن-promo)
- [سرور Node.js و روت‌ها](#سرور-nodejs-و-روتها)
- [Cloudflare Worker و روت‌ها](#cloudflare-worker-و-روتها)
- [ساختار خروجی subtitle](#ساختار-خروجی-subtitle)
- [نمونه درخواست‌ها](#نمونه-درخواستها)
- [استقرار](#استقرار)
- [CI/CD](#cicd)
- [عیب‌یابی](#عیبیابی)
- [حمایت از پروژه](#حمایت-از-پروژه)

---

## معماری و دلیل تفکیک

نسخه‌های اولیه همه‌چیز (manifest، منطق جستجو، دانلود، سرور Express و پیکربندی) را در یک فایل نگه می‌داشتند. این ساختار باعث می‌شد:

1. باندل Cloudflare Workers وابستگی‌های Node-only (`express`, `adm-zip`, `iconv-lite`, `dotenv`, `cors`) را حمل کند.
2. تست و import کردن منطق خالص بدون بالا آمدن سرور دشوار باشد.
3. منطق در دو runtime تکرار شود و هم‌رفتاری آن‌ها سخت تضمین شود.

معماری فعلی:

```text
                     ┌────────────────────┐
                     │     manifest.js     │  شناسه/نسخه/منابع — مشترک
                     └─────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌──────────────┐      ┌────────────────────┐   ┌─────────────────────┐
│  server.js   │      │      addon.js      │   │      worker.js      │
│  Cluster     │      │  Express + SDK     │   │  Cloudflare Worker  │
│  supervisor  │◄─────│  getRouter()       │   │  prefix /subtitles  │
└──────┬───────┘      └───┬───────┬────────┘   └──────────┬──────────┘
       │                  │       │                       │
       │                  ▼       ▼                       ▼
       │           subtitlesHandler.js              (پیاده‌سازی داخلی)
       │                  │       │                       │
       │                  ▼       ▼                       ▼
       │           apiClient.js ──► SubSource / Cinemeta
       │                  │
       │                  ▼
       │           downloadProxy.js ──► ZIP → SRT → Promo
       │               (adm-zip + iconv-lite)
       │
       └── config.js (dotenv) ── همه‌جا
```

**قانون طلایی:** `manifest.js` تنها فایل مشترک است. منطق جستجو (`subtitlesHandler`) و دانلود (`downloadProxy`) در دو نسخه‌ی Node و Worker وجود دارد. هر تغییر رفتاری باید در **هر دو** پیاده‌سازی اعمال شود تا Node و Edge هم‌رفتار بمانند.

---

## ساختار واقعی مخزن

خروجی `git ls-files` در شاخه اصلی:

```text
.
├── .env.example                   # الگوی کامل متغیرهای محیطی (کپی به .env)
├── .github/
│   └── workflows/
│       └── deploy-worker.yml      # دیپلوی خودکار Worker به Cloudflare
├── .gitignore
├── LICENSE                        # Apache License 2.0
├── README.md                      # راهنمای کاربر
├── addon.js                       # سرور Node/Express + SDK builder + روت‌ها
├── apiClient.js                   # کلاینت axios با retry و backoff
├── assets/
│   └── icons/
│       ├── logo.png               # لوگوی استفاده‌شده در manifest نسخه Worker
│       └── subtitles-fa.png       # تصویر استاتیک اضافی
├── config.js                      # تمام تنظیمات از env (dotenv) + پیش‌فرض‌ها
├── docs/
│   └── DOCUMENTATION.md           # همین سند
├── downloadProxy.js               # دانلود ZIP، استخراج SRT، repair encoding، درج Promo
├── manifest.js                    # manifest افزونه (subtitles / movie+series / tt)
├── package.json                   # main: server.js، اسکریپت‌ها، وابستگی‌ها
├── package-lock.json
├── server.js                      # راه‌انداز Cluster (main در package.json)
├── subtitlesHandler.js            # منطق جستجو و فیلتر زیرنویس در Node
├── worker.js                      # آداپتور Cloudflare Workers (main در wrangler.jsonc)
└── wrangler.jsonc                 # پیکربندی Worker: assets، bindings، run_worker_first
```

| مسیر | نقش |
|------|-----|
| `manifest.js` | تعریف `id`, `version`, `resources: ["subtitles"]`, `types: ["movie","series"]`, `idPrefixes: ["tt"]` — مشترک بین هر دو runtime |
| `config.js` | خواندن env با `dotenv` و مقادیر پیش‌فرض (`PORT=7000`, `LONG_TIMEOUT=60000`, `MAX_SOCKETS=50`, ...) |
| `apiClient.js` | `apiRequest()` — retry با backoff تصاعدی + jitter، agent بدون `keepAlive`، تشخیص خطای قابل‌تلاش‌مجدد |
| `subtitlesHandler.js` | پارس `id`، جستجوی Cinemeta/SubSource، فیلتر فصل/قسمت، ساخت خروجی `{ subtitles: [...] }` |
| `downloadProxy.js` | دانلود ZIP از SubSource، استخراج اولین `.srt`، تبدیل encoding، درج بلوک Promo |
| `addon.js` | `new addonBuilder(manifest)` + `defineSubtitlesHandler`، ساخت اپ Express، mount `getRouter`، route `/download/:token`، `GET /health`، لاگ‌کننده و graceful shutdown |
| `server.js` | منطق `cluster`؛ اگر `CLUSTER_ENABLED=true` بود master است و به تعداد هسته‌ها worker می‌سازد، در غیر این صورت همان پروسه `addon.js` را require می‌کند |
| `worker.js` | مسیرهای زیر prefix `/subtitles`، retry با `AbortController`، پارسر ZIP دستی، `TextDecoder` برای UTF-8/Windows-1256، سرو asset لوگو از `env.ASSETS` |
| `wrangler.jsonc` | `name: subsource-stremio-addon`، `main: worker.js`، `assets.directory: ./assets/icons` با binding `ASSETS` و `run_worker_first` |
| `.github/workflows/deploy-worker.yml` | push به `main` → `npm ci` → `wrangler deploy --dry-run` → `wrangler secret put API_KEY` → `wrangler deploy` (Wrangler نسخه `4.128.0` پین‌شده) |
| `assets/icons/logo.png` | لوگوی استفاده‌شده در manifest نسخه Worker |
| `assets/icons/subtitles-fa.png` | تصویر استاتیک اضافی (استفاده‌ی فعال ندارد) |

---

## وابستگی‌ها و اسکریپت‌ها

### package.json

```json
{
  "name": "Persian Subtitles",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "start:single": "node addon.js",
    "dev": "node addon.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "type": "commonjs",
  "engines": { "node": ">=14.0.0" },
  "dependencies": {
    "adm-zip": "^0.5.16",
    "axios": "^1.11.0",
    "axios-https-proxy-fix": "^0.17.1",
    "cheerio": "^1.1.2",
    "cors": "^2.8.5",
    "dotenv": "^17.2.3",
    "express": "^5.1.0",
    "https-proxy-agent": "^7.0.6",
    "iconv-lite": "^0.7.3",
    "stremio-addon-sdk": "^1.6.10"
  }
}
```

| دستور | عملکرد |
|-------|--------|
| `npm start` | اجرای `node server.js` (حالت Cluster اگر فعال باشد) |
| `npm run start:single` | اجرای `node addon.js` (تک‌پروسه، بدون Cluster) |
| `npm run dev` | اجرای `node addon.js` (تک‌پروسه) |

> `npm test` عمداً خطا برمی‌گرداند؛ تست خودکار در مخزن وجود ندارد.

### وابستگی‌های runtime

| پکیج | کاربرد | نکته |
|------|--------|------|
| `stremio-addon-sdk` | `addonBuilder` و `getRouter` در `addon.js` | فقط در Node؛ در Worker استفاده نمی‌شود |
| `express` | سرور HTTP در `addon.js` | فقط در Node |
| `cors` | middleware CORS در `addon.js` | فقط در Node |
| `dotenv` | خواندن `.env` در `config.js` و `addon.js` | فقط در Node |
| `axios` | درخواست‌های `apiClient.js` (SubSource/Cinemeta) | در Worker با `fetch` جایگزین می‌شود |
| `adm-zip` | استخراج `.srt` از ZIP در `downloadProxy.js` | فقط در Node؛ Worker پارسر Zip دستی دارد |
| `iconv-lite` | تبدیل encoding (`utf-8` ↔ `win1256`) در `downloadProxy.js` | فقط در Node؛ Worker از `TextDecoder` استفاده می‌کند |
| `cheerio`, `axios-https-proxy-fix`, `https-proxy-agent` | در وابستگی‌ها هستند ولی در مسیر اصلی import نمی‌شوند | — |

### نسخه Node.js

`package.json` نسخه `>=14.0.0` را اعلام می‌کند، اما نسخه قفل‌شده برخی پکیج‌ها (مثلاً `cheerio`) به Node `>=20.18.1` نیاز دارد. CI روی Node `22` اجرا می‌شود؛ برای توسعه لوکال Node `22` توصیه می‌شود.

---

## متغیرهای محیطی

### Node.js (config.js + addon.js)

`config.js` با `require('dotenv').config()` مقادیر env را در همان لحظه‌ی import می‌خواند. برای همه‌ی مقادیر عددی از `parseInt(...) || default` و برای بولین‌ها از `=== 'true'` استفاده می‌شود:

```js
require('dotenv').config();
module.exports = {
    SERVER_IP: process.env.SERVER_IP || '127.0.0.1',
    PORT: parseInt(process.env.PORT, 10) || 7000,
    LONG_TIMEOUT: parseInt(process.env.LONG_TIMEOUT, 10) || 60000,
    SHORT_TIMEOUT: parseInt(process.env.SHORT_TIMEOUT, 10) || 15000,
    API_KEY: process.env.API_KEY,
    CLUSTER_ENABLED: process.env.CLUSTER_ENABLED === 'true',
    WORKER_COUNT: parseInt(process.env.WORKER_COUNT, 10) || 0,
    // ...
};
```

| متغیر | پیش‌فرض | کجا مصرف می‌شود | توضیح |
|-------|---------|------------------|-------|
| `API_KEY` | — | `subtitlesHandler.js`, `downloadProxy.js` | کلید SubSource در هدر `X-API-Key`؛ اگر نباشد پاسخ `{ subtitles: [] }` |
| `PORT` | `7000` | `addon.js` (`listen`), `subtitlesHandler.js` (URL) | پورت سرور و بخشی از URL لینک زیرنویس |
| `SERVER_IP` | `127.0.0.1` | `addon.js` (لاگ نصب), `subtitlesHandler.js` (URL) | آدرس/دامنه‌ی عمومی در URL هر زیرنویس |
| `LONG_TIMEOUT` | `60000` | `apiClient.js` (پیش‌فرض timeout), `downloadProxy.js` | تایم‌اوت درخواست‌ها به SubSource (ms) |
| `MAX_SOCKETS` | `50` | `apiClient.js` (agentها) | سقف اتصال‌های هم‌زمان |
| `CLUSTER_ENABLED` | `false` | `server.js` | فعال‌سازی حالت Cluster |
| `WORKER_COUNT` | `0` (= تعداد هسته) | `server.js` | تعداد workerها در حالت Cluster |
| `SUBTITLE_PROMO_TEXT` | متن حمایت پیش‌فرض | `downloadProxy.js` | متن اضافه‌شده داخل زیرنویس؛ رشته خالی = بدون promo |
| `SUBTITLE_PROMO_DURATION` | `20` | `downloadProxy.js` | مدت نمایش متن (ثانیه) |
| `SUBTITLE_PROMO_POSITION` | `end` | `downloadProxy.js` | موقعیت درج: `start` یا `end` |
| `SHORT_TIMEOUT` | `15000` | تعریف‌شده در `config.js` | در runtime فعلی مصرف نمی‌شود |
| `RATE_LIMIT_*`, `LOG_LEVEL`, `CACHE_*`, `REDIS_URL`, `MAX_FREE_SOCKETS` | — | تعریف‌شده در `config.js` | در runtime فعلی مصرف نمی‌شوند |

نمونه `.env`:

```env
API_KEY=your-subsource-api-key
PORT=7000
SERVER_IP=127.0.0.1
LONG_TIMEOUT=60000
CLUSTER_ENABLED=false
```

### Cloudflare Workers (wrangler.jsonc + worker.js)

در Worker هیچ `dotenv`ای وجود ندارد؛ مقادیر از `env` (Vars/Secrets) می‌آیند:

| متغیر | منبع | رفتار نبودش |
|-------|------|--------------|
| `API_KEY` | Worker Secret (در CI با `wrangler secret put`) | `getMovieId` throw → `{ subtitles: [] }`؛ دانلود → `500` |
| `LONG_TIMEOUT` | Var (اختیاری) | پیش‌فرض داخلی `60000ms` فقط در دانلود |
| `SUBTITLE_PROMO_TEXT` | Var (اختیاری) | `DEFAULT_PROMO_TEXT` داخل `worker.js`؛ رشته خالی = بدون promo |
| `SUBTITLE_PROMO_DURATION` / `_POSITION` | Var (اختیاری) | `20` / `end` |
| `ASSETS` | binding خودکار از `wrangler.jsonc` | نبودش → `404` روی `/subtitles/logo.png` |

---

## Manifest افزونه

در `manifest.js`:

```js
const manifest = {
  "id": "org.alirostami.subtitles.persian",
  "version": "1.0.0",
  "name": "Persian Subtitles",
  "author": "Ali Rostami",
  contactEmail: 'rostami.ali@gmail.com',
  "description": "Provides Persian subtitles from the SubSource API.\n\nAuthor: Ali Rostami  \nWebsite: alirostami.com/support \nGitHub: https://github.com/alirostami01/Persian-Subtitles/",
  "resources": ["subtitles"],
  "types": ["movie", "series"],
  "idPrefixes": ["tt"],
  "catalogs": []
};
module.exports = manifest;
```

| فیلد | مقدار | توضیح |
|------|-------|-------|
| `id` | `org.alirostami.subtitles.persian` | شناسه یکتا |
| `version` | `1.0.0` | نسخه manifest — هم‌راستا با `package.json` |
| `resources` | `['subtitles']` | فقط زیرنویس؛ هیچ `stream`/`catalog`/`meta` ندارد |
| `types` | `['movie','series']` | فیلم و سریال |
| `idPrefixes` | `['tt']` | فقط IMDb؛ برای محتوای بدون IMDb Stremio این افزونه را صدا نمی‌زند |
| `catalogs` | `[]` | بدون catalog |
| `logo` | ندارد | در Node Stremio آیکن پیش‌فرض نشان می‌دهد؛ نسخه Worker لوگو اضافه می‌کند |

نکاته‌ها:

- `contactEmail` بدون گیومه نوشته شده؛ `JSON.stringify` خروجی معتبری می‌سازد.
- `description` عمداً چندخطی است؛ Stremio همین متن را در صفحه‌ی جزئیات افزونه نشان می‌دهد، پس لینک حمایت و GitHub داخل خود manifest سفر می‌کند.
- نسخه Worker روی این آبجکت `behaviorHints.configurable = false` و `logo` را اضافه می‌کند (`getManifest(origin)`).

---

## کلاینت HTTP

در `apiClient.js`، `apiRequest` همه‌ی درخواست‌های Node را انجام می‌دهد:

```js
const httpAgent = new http.Agent({ keepAlive: false, maxSockets: config.MAX_SOCKETS });
const httpsAgent = new https.Agent({ keepAlive: false, maxSockets: config.MAX_SOCKETS });

const RETRYABLE_CODES = new Set(['ECONNRESET','ECONNABORTED','ETIMEDOUT','EPIPE','EAI_AGAIN','ENOTFOUND']);

async function apiRequest({ method='get', url, headers={}, params={}, responseType='json',
                            timeout=config.LONG_TIMEOUT, retries=3 })
```

- حلقه `for (attempt = 0; attempt <= retries; ...)` → حداکثر **۴ تلاش** (اولی + ۳ retry).
- `axios({ ..., httpAgent, httpsAgent, maxRedirects: 5 })`.
- `catch` → اگر `!isRetryable(error)` یا آخرین تلاش بود throw؛ در غیر این صورت `await delay(backoff)`.

```js
const backoff = 300 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
// attempt 0 → ~300–500ms، attempt 1 → ~600–800ms، attempt 2 → ~1200–1400ms
```

```js
isRetryable(e) = (e.code ∈ RETRYABLE_CODES) || (e.response && (status === 429 || status >= 500))
```

- agentها `keepAlive: false` دارند تا socketهای مرده‌ی keep-alive باعث `read ECONNRESET` نشوند؛ هر درخواست یک اتصال تازه می‌گیرد.
- خروجی: پاسخ کامل axios (`response.data`, `response.status`). صداکننده مسئول چک کردن `success` بدنه است.

الگوهای مصرف زیر مستقیماً از `axios` استفاده می‌کنند (نه `apiRequest`):

| محل | تنظیمات |
|------|---------|
| Worker | اصلاً از axios استفاده نمی‌کند؛ `fetchWithRetry` با `AbortController` |
| Cinemeta (Node) | `apiRequest` با `url` مستقیم `v3-cinemeta.strem.io` |
| SubSource (Node) | `apiRequest` با `url` ساختگی از `API_BASE_URL` و هدر `X-API-Key` |

---

## نقشه ماژول‌ها

### manifest.js

آبجکت ثابت manifest استرمیو (CJS). تنها فایل مشترک بین `addon.js` و `worker.js`. هیچ فیلد `logo` و هیچ وابستگی ندارد؛ تغییر آن = تغییر خروجی `/manifest.json` (Node) و `/subtitles/manifest.json` (Worker).

### config.js

```js
require('dotenv').config();
module.exports = { SERVER_IP, PORT, LONG_TIMEOUT, SHORT_TIMEOUT, API_KEY, CLUSTER_ENABLED, WORKER_COUNT, MAX_SOCKETS, SUBTITLE_PROMO_* , ... };
```

- `dotenv.config()` فقط یک بار در اولین require اثر دارد؛ هر import زودهنگام‌تر از `config.js` ممکن است `process.env` را بدون مقادیر `.env` ببیند.
- `API_KEY` مستقیم از `process.env` خوانده می‌شود (نه `config.API_KEY`)، و کلاینت‌ها هم مستقیماً `process.env.API_KEY` را چک می‌کنند.

### apiClient.js

`module.exports = { apiRequest }`. مصرف‌کننده‌ها: `subtitlesHandler.js`، `downloadProxy.js`. وظیفه: retry با backoff و agent بدون keepAlive. بخش جزئیات در [کلاینت HTTP](#کلاینت-http).

### subtitlesHandler.js

`module.exports = async (args) => { subtitles: [] }` — مصرف‌کننده: `addon.js` (`defineSubtitlesHandler`). هسته‌ی منطق جستجو. بخش جزئیات در [لایه جستجوی ترکیبی](#لایه-جستجوی-ترکیبی-hybrid-در-subtitleshandler).

### downloadProxy.js

`module.exports = async (req, res) => void` — مصرف‌کننده: `addon.js` (`GET /download/:token`). Task: دانلود ZIP، استخراج `SRT`، repair encoding، درج Promo. بخش جزئیات در [لایه دانلود و استخراج SRT](#لایه-دانلود-و-استخراج-srt).

### addon.js — هسته

نقطه ورود Node/Express. ترتیب mount کردن مهم است:

```js
const builder = new addonBuilder(manifest);
builder.defineSubtitlesHandler(subtitlesHandler);

const app = express();
app.use(cors());
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(requestLogger);                      // res.on('finish') → `[ISO] METHOD path - status (durationms)`
app.get('/download/:token', downloadProxy);
app.use(getRouter(builder.getInterface()));   // → /manifest.json و /subtitles/*
app.get('/health', ...);
```

- `getRouter(builder.getInterface())` مسیرهای Stremio (`/manifest.json` و `/subtitles/:type/:id.json`) را می‌سازد.
- `app.listen(config.PORT, '0.0.0.0', ...)` — bind روی همه‌ی interfaceها (برای preview/استقرار لازم است).
- `gracefulShutdown(signal)` فقط `server.close()` را صدا می‌زند و بعد از `10000ms` با `process.exit(1)` force می‌کند؛ اگر `server` تعریف نشده باشد مستقیم `process.exit(0)`.
- `process.on('uncaughtException' | 'unhandledRejection')` فقط لاگ می‌کنند و پروسه را نمی‌کُشند.
- خروجی انتهایی: `module.exports = { app, server }` (برای تست‌های آینده؛ `server` در زمان export هنوز `undefined` است چون `listen` async است).

### server.js — سرور کلاس

```js
const numCPUs = config.WORKER_COUNT > 0 ? config.WORKER_COUNT : os.cpus().length;
if (config.CLUSTER_ENABLED && cluster.isMaster) { /* fork ×N */ } else { require('./addon'); }
```

- `main` در `package.json` است (`npm start` → `node server.js`).
- در حالت master: fork به تعداد `numCPUs`، لاگ `Worker {pid} spawned` و `✓ Worker {pid} is online (k/N)`.
- `cluster.on('exit')` → لاگ `⚠️  Worker {pid} died ...` و بعد از `1000ms` fork جدید با لاگ `🔄 New worker {pid} started`.
- `gracefulShutdown` master: به هر worker پیام `'shutdown'` send می‌کند، بعد از `10000ms` در صورت عدم خروج `SIGKILL`، و master بعد از `15000ms` خارج می‌شود.
- اگر `CLUSTER_ENABLED=false` باشد، `server.js` عملاً همان `addon.js` را در همان پروسه require می‌کند (بدون master).

### worker.js — آداپتور Cloudflare

`export default { async fetch(request, env) }`. تمام وابستگی‌های Node-only را پرهیز می‌کند و فقط `manifest.js` را require می‌کند؛ پارسر ZIP و retry را خودش پیاده‌سازی می‌کند. ساختار روت‌ها در [Cloudflare Worker و روت‌ها](#cloudflare-worker-و-روتها).

### wrangler.jsonc

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "subsource-stremio-addon",
  "main": "worker.js",
  "compatibility_date": "2026-09-02",
  "workers_dev": true,
  "assets": {
    "directory": "./assets/icons",
    "binding": "ASSETS"
  },
  "run_worker_first": ["/", "/health", "/manifest.json", "/download/*", "/subtitles/*"]
}
```

- `assets.directory: ./assets/icons` با binding `ASSETS` → فایل `logo.png` زیر ریشه‌ی هسته‌ای assetهاست (`/logo.png`).
- `run_worker_first` → این مسیرها را Worker هندل می‌کند، نه سرو مستقیم asset. مسیر لوگو (`/subtitles/logo.png`) توسط worker از `env.ASSETS` fetch می‌شود.

---

## جریان پردازش درخواست

### حالت Node.js (addon.js)

```text
GET /subtitles/movie/tt1234567.json
  ↓ Express
  ↓ app.get('/download/...')؟ → نه
  ↓ getRouter(builder.getInterface()) → builder.get({ resource:'subtitles', type:'movie', id:'tt1234567' })
  ↓ builder.defineSubtitlesHandler → subtitlesHandler({ type, id })
  ↓ API_KEY چک → اگر نبود { subtitles: [] }
  ↓ parse id → imdbId = 'tt1234567'
  ↓ (اختصاصی سریال) Cinemeta → mediaName → جستجوی text+season
  ↓ اگر movieId نبود → جستجوی imdb
  ↓ GET /subtitles?movieId=...&language=farsi_persian&sort=rating&limit=100
  ↓ (اختصاصی سریال) filterSeriesSubtitles
  ↓ map → { id, url, lang:'fas', title }
  ↓ { subtitles: [...] }
```

### حالت Cloudflare Workers (worker.js)

```text
GET /subtitles/movie/tt1234567.json
  ↓ worker.fetch()
  ↓ handleRequest → strip PUBLIC_PREFIX='/subtitles' → path='/movie/tt1234567.json'
  ↓ regex /^(movie|series)\/([^/]+?)(?:\.json)?$/ → { type:'movie', id:'tt1234567' }
  ↓ parseStremioId → { imdbId, season, episode }
  ↓ subtitlesHandler(type, id, env, origin)
  ↓ (مشابه هسته Node ولی با fetchWithRetry و filterSeriesSubtitles)
  ↓ json({ subtitles: [...] })
```

سریال:

```text
GET /subtitles/series/tt1234567:1:3.json  (Node)
GET /subtitles/series/tt1234567:1:3.json  (Worker)
  ↓ parse id → imdbId='tt1234567', season='1', episode='3'
  ↓ (سریال) Cinemeta → جستجوی text+season → fallback imdb
  ↓ GET /subtitles?movieId=...&limit=100
  ↓ filterSeriesSubtitles → الگوهای S01E03 / S1E3 / 1x03 یا season pack
  ↓ { subtitles: [...] }
```

---

## تابع‌های کمکی عمومی

### `isRetryable(error)` و `delay(ms)` (apiClient.js)

```js
function isRetryable(error) {
  if (!error) return false;
  if (error.code && RETRYABLE_CODES.has(error.code)) return true;
  if (error.response) return error.response.status === 429 || error.response.status >= 500;
  return false;
}
```

| کد/وضعیت | retry؟ |
|----------|--------|
| `ECONNRESET`, `ECONNABORTED`, `ETIMEDOUT`, `EPIPE`, `EAI_AGAIN`, `ENOTFOUND` | ✅ |
| `429` | ✅ |
| `5xx` | ✅ |
| سایر (مثل `404`) | ❌ |

`delay(ms)` یک `setTimeout` ساده است.

### `parseTimestamp(timestamp)` و `toTimestamp(ms)` (downloadProxy.js / worker.js)

تبدیل `HH:MM:SS,mmm` ↔ میلی‌ثانیه. هر دو در Node (`downloadProxy`) و Worker نسخه‌ی جدا دارند ولی رفتارشان یکی است.

### `addPromoTextToSubtitle(srtContent, promoText, durationSeconds, position)`

در بخش [الگوریتم درج متن Promo](#الگوریتم-درج-متن-promo).

### `filterSeriesSubtitles(subtitles, season, episode)`

در بخش [الگوریتم تطبیق فصل/قسمت](#الگوریتم-تطبیق-فصلقسمت). نسخه‌ی Worker قبل از `parseInt` با `Number.isInteger` گارد می‌گیرد؛ نسخه‌ی Node این گارد را ندارد.

### `parseStremioId(type, id)` (worker.js)

```js
function parseStremioId(type, id) {
  if (type === 'series') {
    const [imdbId, season, episode] = id.split(':');
    return { imdbId, season, episode };
  }
  return { imdbId: id, season: null, episode: null };
}
```

### پارسر ZIP دستی (worker.js)

| تابع | نقش |
|------|------|
| `readU16(view, offset)` | خواندن `Uint16` little-endian |
| `readU32(view, offset)` | خواندن `Uint32` little-endian |
| `findEndOfCentralDirectory(bytes)` | جستجوی `0x06054b50` از انتها تا `max(0, len-65557)` |
| `extractFirstSrt(zipBytes)` | پارس central directory (`0x02014b50`)، خواندن `method`/`compressedSize`/`localHeaderOffset` و استخراج اولین `.srt` |

- روش‌های `method 0` (store) و `method 8` (deflate با `DecompressionStream('deflate-raw')`) پشتیبانی می‌شوند؛ بقیه throw می‌کنند.
- ZIP64، data descriptor و آرشیو با `entryCount > 65535` را پشتیبانی نمی‌کند.
- نام فایل‌ها با `TextDecoder('utf-8', { fatal: false })` decode می‌شوند.

---

## لایه جستجوی ترکیبی (Hybrid) در subtitlesHandler

```js
async function subtitlesHandler(args)   // args = { type, id, ... }
```

جریان (با نام واقعی لاگ‌ها):

| گام | کد/شرط | لاگ |
|-----|--------|-----|
| 1 | ورودی | `Request for subtitles received for: {id}` |
| 2 | `if (!process.env.API_KEY)` → `return { subtitles: [] }` | `API Key is missing from .env file.` (خطا) |
| 3 | `type === 'series'` → `id.split(':')` به `[imdbId, season, episode]`، وگرنه `imdbId = id` | — |
| 4 | (سریال) Cinemeta `https://v3-cinemeta.strem.io/meta/series/{imdbId}.json` → `metaRes.data.meta.name` | در صورت خطا: `Cinemeta fetch failed, falling back to Attempt 2. Error: ...` |
| 5 | جستجوی متنی: `movies/search?searchType=text&q={name}&season={season}` | `Attempt 1 (Primary): Searching with Series Name "..." and Season "..."` → `Success from Attempt 1. Found correct movieId: N` یا `Attempt 1 failed. Falling back to Attempt 2.` |
| 6 | fallback: `movies/search?searchType=imdb&imdb={imdbId}` | `Attempt 2 (Fallback): Searching with IMDb ID directly.` → `Success from Attempt 2. Found movieId: N` |
| 7 | `if (!movieId)` → `{ subtitles: [] }` | `Both attempts failed to find a movieId.` |
| 8 | `GET /subtitles?movieId=...&language=farsi_persian&sort=rating&limit=100` | در صورت نبود نتیجه: `No Persian subtitles found for movieId: N` |
| 9 | (سریال) فیلتر فصل/قسمت | `Applying detailed filter for patterns: [S01E05, S1E5, 1x05] or season packs.` |
| 10 | `map` به قرارداد خروجی | `Successfully prepared N subtitles.` |
| 11 | `catch` سراسری → `{ subtitles: [] }` | `Error in subtitlesHandler: {message}` (خطا) |

نکات پیاده‌سازی:

- `API_BASE_URL = 'https://api.subsource.net/api/v1'` و `PERSIAN_LANG_CODE = 'farsi_persian'`.
- **`season` در fallback دوم استفاده نمی‌شود**؛ یعنی اگر جستجوی متنی شکست بخورد، نتیجه `movieId` سطح سریال برمی‌گردد و فیلتر مرحله ۹ باید قسمت را از دل آرشیو کل سریال بیرون بکشد.
- `mediaName` هیچ escape/trim اضافه‌ای نمی‌گیرد؛ کاراکترهای `&`, `:` در نام سریال به‌صورت خام در URL template می‌روند.
- هیچ تطبیقی با `season` برای فیلم انجام نمی‌شود؛ برای فیلم، هر ۱۰۰ زیرنویس برمی‌گردد (فیلتر فقط برای سریال).
- خروجی `url` تنها نقطه‌ی نشت `SERVER_IP`/`PORT` به کاربر است: `http://${SERVER_IP}:${PORT}/download/${subtitleId}`.
- `id` همان `sub.subtitleId.toString()` است؛ `lang` همیشه `'fas'` است؛ `title` همان `releaseInfo.join(' ')` است.

---

## الگوریتم تطبیق فصل/قسمت

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

خواص و نکات:

- `releaseInfo` باید **آرایه** باشد؛ اگر رشته باشد یا نباشد، آن زیرنویس حذف می‌شود (`if (!Array.isArray(sub.releaseInfo)) return false`).
- نرمال‌سازی فقط `-`, `.`, `_` و فاصله را حذف می‌کند؛ `[]`, `()`, و کاراکترهای یونیکد دست‌نخورده می‌مانند. پس `[S01E05]` کار می‌کند ولی `1×5` (علامت ضربدر) خیر.
- چون `S1E5` پس از حذف صفرها نوشته می‌شود و `release` هم بدون جداکننده است، هر دو شکل `S01E05` و `S1E5` معمولاً با الگوی `S01E05` تطبیق می‌خورند؛ اما `1x5` (بدون pad) با `1x05` تطبیق **نمی‌خورد**.
- فصل‌های دو رقمی: `season = 10` → `S10E05` و `S10E5`، و `SEASON10` / `S10`؛ مشکلی نیست.
- state «پرونده نامعتبر»: اگر `season`/`episode` عددی نباشد (مثلاً `special`)، نسخه Worker زودتر `[]` برمی‌گرداند (`Number.isInteger`)، نسخه Node فیلتر را اجرا می‌کند و عملاً همه‌چیز حذف می‌شود.
- **هیچ ترتیب/امتیازدهی اضافه‌ای وجود ندارد:** ترتیب خروجی همان ترتیب `sort=rating` از سابسورس است.

---

## لایه دانلود و استخراج SRT

```js
async function downloadProxy(req, res)   // mounted: GET /download/:token
```

1. `const { token } = req.params` — اگر خالی بود `400 No subtitle ID provided`.
2. اگر `!process.env.API_KEY` → `500 Server configuration error`.
3. `apiRequest({ url: /subtitles/{token}/download, responseType: 'arraybuffer', timeout: config.LONG_TIMEOUT, headers: { 'X-API-Key': ... } })` → لاگ `Proxying download for subtitle ID: {token}`.
4. `new AdmZip(response.data)` و `zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.srt'))` → **اولین** `.srt`. نبودش = `404 No .srt file found in ZIP archive`.
5. `iconv.decode(rawBuffer, 'utf-8')`؛ اگر خروجی شامل `\uFFFD` بود → `iconv.decode(rawBuffer, 'win1256')` و لاگ `Re-encoded subtitle from Windows-1256 to UTF-8 for: {entryName}`.
6. `if (config.SUBTITLE_PROMO_TEXT)` → `addPromoTextToSubtitle(...)` در `try/catch` جدا (خطای promo هرگز دانلود را نمی‌شکند) → لاگ `Added promotional text ({position}) to subtitle {token}`.
7. `res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8')` و `res.send(srtContent)`.
8. `catch` → `500 Failed to proxy subtitle download` و لاگ `Proxy Download Error: {message}`.

تفاوت آگاهانه با Worker:

| Node (`downloadProxy.js`) | Worker (`worker.js`) |
|---------------------------|----------------------|
| `adm-zip` + `iconv-lite` | پارسر ZIP دستی + `TextDecoder` |
| `Content-Type` + `res.send` | `Content-Disposition` + `Cache-Control` هم ست می‌کند |
| `token` بدون اعتبارسنجی الگو | `token` با `encodeURIComponent` در URL؛ بعد از match با `decodeURIComponent` |

---

## الگوریتم درج متن Promo

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
5. در Node یک fallback نهایی هم وجود دارد: اگر هیچ خط `-->` پیدا نشد، بلوک promo با `lastEndTime` به انتها اضافه می‌شود (در Worker در این حالت هیچ تغییری اعمال نمی‌شود).

نکات تست: بلوک‌های دارای خط توضیحی اضافه، بلوک‌های چندخطی، و زیرنویس‌هایی که شماره‌شان از ۱ شروع نمی‌شود، رفتار شماره‌گذاری مجدد را می‌توانند خراب کنند.

---

## سرور Node.js و روت‌ها

در `addon.js` و فقط وقتی `main` است (اجرای مستقیم) بالا می‌آید.

### ترتیب middleware (مهم)

| ترتیب | روت | منبع | توضیح |
|-------|-----|------|-------|
| ۱ | `*` | middleware `cors()` | CORS برای کل app |
| ۲ | `*` | `app.set('trust proxy', true)` + `disable('x-powered-by')` | شناسایی IP پشت proxy و حذف هدر امنیتی |
| ۳ | `*` | request logger | `res.on('finish')` → `[ISO] METHOD path - status (durationms)` |
| ۴ | `GET /download/:token` | `downloadProxy` | دانلود و استخراج SRT |
| ۵ | `*` | `getRouter(builder.getInterface())` | مسیرهای Stremio: `/manifest.json` و `/subtitles/:type/:id.json` |
| ۶ | `GET /health` | سفارشی | وضعیت process: uptime، memory، cpuLoad |

### مدیریت خطای سرور

```js
server = app.listen(config.PORT, '0.0.0.0', () => { ... });
```

- لاگ موفق:

```text
===========================================
Persian Subtitles Add-on Server Started
===========================================
Server listening on port: 7000
Available CPU cores: N
Install URL: http://127.0.0.1:7000/manifest.json
Health check: http://127.0.0.1:7000/health
===========================================
```

- `gracefulShutdown`: بعد از `SIGTERM`/`SIGINT` اول `server.close()`، بعد از `10s` force `process.exit(1)`.

---

## Cloudflare Worker و روت‌ها

### روت‌های پشتیبانی‌شده

`PUBLIC_PREFIX = '/subtitles'` — Worker پیشوند را جدا می‌کند و بقیه‌ی مسیر را match می‌کند:

| مسیر عمومی | مسیر بعد از prefix | هندلر |
|------------|--------------------|-------|
| `GET /subtitles` یا `/subtitles/` | `/` | status ok |
| `GET /subtitles/health` | `/health` | status ok |
| `GET /subtitles/manifest.json` | `/manifest.json` | `getManifest(url.origin)` + cache `public, max-age=300` |
| `GET /subtitles/logo.png` | `/logo.png` | `getAsset` از `env.ASSETS` |
| `GET /subtitles/download/{id}` | `/download/{id}` | `downloadProxy(id, env)` |
| `GET /subtitles/{movie\|series}/{id}[.json]` | `/movie|series/{id}[.json]` | `subtitlesHandler(type, id, env, url.origin)` |
| `OPTIONS` هر مسیری | — | `204` + هدرهای CORS |
| غیر `GET` | — | `405 Method Not Allowed` |
| بقیه | — | `404 Not Found` |

### پیاده‌سازی `handleRequest`

```js
const path = url.pathname === PUBLIC_PREFIX ? '/'
  : url.pathname.startsWith(`${PUBLIC_PREFIX}/`) ? url.pathname.slice(PUBLIC_PREFIX.length) : null;
```

- اگر `path === null` → `404`.
- regex دانلود: `/^\/download\/([^/]+)$/` → `downloadProxy(decodeURIComponent(...), env)`.
- regex جستجو: `/^\/(movie|series)\/([^/]+?)(?:\.json)?$/` → `subtitlesHandler(type, decodeURIComponent(id), env, url.origin)`.

### CORS

- همه‌ی پاسخ‌های JSON هدر `access-control-allow-origin: *` دارند (`JSON_HEADERS`).
- `withCors(response)` برای بدنه‌ی SRT سه هدر `access-control-*` را کپی می‌کند.
- `OPTIONS` هر مسیری → `204` با CORS.

### `getManifest(origin)`

```js
return {
  ...manifest,
  behaviorHints: { ...(manifest.behaviorHints || {}), configurable: false },
  logo: `${origin}${PUBLIC_PREFIX}/logo.png`
};
```

### Error handling

`fetch` بیرونی یک پوش نهایی دارد: هر throw نشده → `json({ error: 'Internal Server Error' }, 500)`.

---

## ساختار خروجی subtitle

```json
{
  "subtitles": [
    {
      "id": "1234567",
      "url": "http://HOST:PORT/download/1234567",
      "lang": "fas",
      "title": "WEB-DL 1080p S01E05"
    }
  ]
}
```

| فیلد | توضیح |
|------|-------|
| `id` | همان `subtitleId` سابسورس (به رشته) |
| `url` | لینک proxy افزونه؛ در Node `http://${SERVER_IP}:${PORT}/download/{id}`، در Worker `${origin}/subtitles/download/{id}` |
| `lang` | همیشه `'fas'` |
| `title` | `releaseInfo.join(' ')`؛ اگر `releaseInfo` آرایه نباشد → `'Subtitle'` (Node) یا `'Persian Subtitle'` (Worker) |

> فایل تحویل‌شده: `Content-Type: application/x-subrip; charset=utf-8` و بدنه‌ی SRT خالص (UTF-8). هیچ `behaviorHints` یا فیلد `hash`/`id` سراسری تولید نمی‌شود.

---

## نمونه درخواست‌ها

### Node.js (پورت 7000)

```bash
curl http://localhost:7000/manifest.json
curl http://localhost:7000/subtitles/movie/tt0111161.json
curl http://localhost:7000/subtitles/series/tt0903747:1:3.json
curl -I http://localhost:7000/download/1234567
curl http://localhost:7000/health
```

### Cloudflare Workers (لوکال با wrangler)

```bash
npx wrangler dev --port 8787
curl http://localhost:8787/subtitles/manifest.json
curl http://localhost:8787/subtitles/movie/tt0111161.json
curl http://localhost:8787/subtitles/series/tt0903747:1:3.json
curl http://localhost:8787/subtitles/download/1234567
curl http://localhost:8787/subtitles/logo.png
curl http://localhost:8787/subtitles
```

---

## استقرار

### گزینه A: Node.js hosting (VPS, Railway, Render, Fly.io, Heroku)

1. Node.js `20.18.1+`
2. `npm install`
3. ساخت `.env` و ست `API_KEY` (اجباری)
4. دستور اجرا:
   - تک‌پروسه: `npm run dev` یا `npm run start:single` (یعنی `node addon.js`)
   - Cluster: `npm start` (یعنی `node server.js`) با `CLUSTER_ENABLED=true`
5. متغیرهای رایج: `PORT` (پیش‌فرض `7000`)، `SERVER_IP` (باید روی دامنه‌ی عمومی ست شود تا URL زیرنویس درست باشد)
6. مسیرهای عمومی:
   ```
   /manifest.json
   /subtitles/movie/{imdbId}.json
   /subtitles/series/{imdbId}:{season}:{episode}.json
   /download/{subtitleId}
   /health
   ```
7. نصب: `stremio://YOUR_DOMAIN/manifest.json`

### گزینه B: Cloudflare Workers (پیشنهادی برای Edge)

1. `npm install`
2. ست Secret `API_KEY` (در CI انجام می‌شود یا با `wrangler secret put API_KEY`)
3. `npx wrangler deploy` (یا از طریق GitHub Actions)
4. آدرس نصب: `https://<worker>.workers.dev/subtitles/manifest.json` → تبدیل به `stremio://<worker>.workers.dev/subtitles/manifest.json`
5. لوگو خودکار: `https://<worker>.workers.dev/subtitles/logo.png`
6. assetها از `./assets/icons` سرو می‌شود؛ نیازی به سرور جدا نیست.

### نکات HTTPS و Proxy

- در Node، اگر پشت TLS proxy هستید، `app.set('trust proxy', true)` فعال است؛ اگر میزبان `X-Forwarded-Proto: https` را ست کند، رفتار درست است.
- در Worker، `url.origin` همیشه scheme درست را دارد.

---

## CI/CD

### `.github/workflows/deploy-worker.yml`

```yaml
name: Deploy Cloudflare Worker
on:
  push:
    branches: [main]
    paths:
      - 'worker.js'
      - 'manifest.js'
      - 'wrangler.jsonc'
      - 'package.json'
      - 'package-lock.json'
      - 'assets/icons/**'
      - '.github/workflows/deploy-worker.yml'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx --yes wrangler@4.128.0 deploy --dry-run
      - uses: ...  # wrangler secret put API_KEY with secrets.SUBSOURCE_API_KEY
      - run: npx --yes wrangler@4.128.0 deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- فقط تغییرات مرتبط با Worker دیپلوی را trigger می‌کند.
- **`wrangler deploy --dry-run`** قبل از دیپلوی، باندل را validate می‌کند.
- Secret `API_KEY` با `wrangler secret put API_KEY` از `secrets.SUBSOURCE_API_KEY` ست می‌شود.
- نیاز به secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUBSOURCE_API_KEY`.
- Wrangler نسخه `4.128.0` پین‌شده.

---

## عیب‌یابی

### `API Key is missing from .env file.`

در Node `API_KEY` را در `.env` یا Environment Variables اضافه کنید. در Worker، مقدار `API_KEY` را با `wrangler secret put API_KEY` یا در داشبورد Cloudflare ست کنید.

### `Port 7000 is already in use` (Node)

```bash
PORT=7001 npm run start:single
```

### زیرنویس برنمی‌گردد

- آیا `API_KEY` معتبر است؟
- آیا `GET /subtitles?movieId=...` پاسخ `{ success: true, data: [...] }` می‌دهد؟
- برای سریال: آیا `releaseInfo` شامل `S01E03` / `1x03` یا `SEASON01 COMPLETE` است؟

### `/health` در Worker 404 می‌دهد

Worker فقط `/subtitles/health` را دارد (`/health` بدون prefix توسط `run_worker_first` هندل نمی‌شود). برای health check از `/subtitles/health` یا `/subtitles` استفاده کنید.

### دانلود 404 می‌دهد

یعنی در ZIP آرشیو، هیچ فایل `.srt`ای نبوده (`No .srt file found in ZIP archive`). آرشیوهایی که فقط `.idx`/`README` دارند چنین خطایی می‌دهند.

### لوگو نمایش داده نمی‌شود (Worker)

- URL `https://<worker>/subtitles/logo.png` باید پاسخ `200` بدهد.
- `wrangler.jsonc` باید `assets.directory: ./assets/icons` و binding `ASSETS` داشته باشد.

### Worker دیپلوی نمی‌شود

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUBSOURCE_API_KEY` در secrets گیت‌هاب ست شده‌اند؟
- `wrangler@4.128.0 deploy --dry-run` را لوکال اجرا کنید و لاگ Action را چک کنید.

---

## حمایت از پروژه

اگر این افزونه برایت مفید بوده، حمایت تو کمک می‌کند پروژه پایدارتر و هماهنگ با تغییرات منابع زیرنویس بماند ❤️

```text
alirostami.com/support
```

ساخته شده با ❤️ برای جامعه فارسی‌زبان Stremio
