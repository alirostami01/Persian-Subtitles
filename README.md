<p align="center">
  <img src="assets/icons/logo.png" alt="Persian Subtitles" width="180" />
</p>

<h1 align="center">Persian Subtitles</h1>

<p align="center">
  افزونه غیررسمی استرمیو (Stremio) برای زیرنویس فارسی فیلم و سریال، متصل به API سرویس SubSource
</p>

<p align="center">
  اگر این افزونه برایت مفید بوده، با حمایتت کمک کن پروژه زنده، سریع و به‌روز بماند ❤️<br />
  <strong>حمایت از پروژه:</strong>
  <a href="https://alirostami.com/support">alirostami.com/support</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-Addon-blue?style=flat-square" alt="Stremio Addon" />
  <img src="https://img.shields.io/badge/Node.js-20.18.1%2B-green?style=flat-square" alt="Node.js" />
  <img src="https://img.shields.io/badge/Cloudflare-Workers-orange?style=flat-square" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/Version-v1.0.0-purple?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/License-Apache--2.0-yellow?style=flat-square" alt="License" />
</p>

---

## 📖 معرفی

**Persian Subtitles** یک افزونه غیررسمی برای Stremio است که با دریافت شناسه IMDb از استرمیو، فیلم یا سریال متناظر را در SubSource پیدا می‌کند و زیرنویس‌های فارسی همان محتوا را به‌صورت فایل `SRT` آماده در اختیار Stremio می‌گذارد.

جریان کار نسخه فعلی:

1. Stremio شناسه `tt...` (فیلم) یا `tt1234567:1:3` (سریال) را به resource نوع `subtitles` می‌فرستد.
2. برای سریال‌ها، نام سریال از Cinemeta گرفته و با `q={name}&season={n}` در SubSource جستجو می‌شود؛ در نبود نتیجه، fallback به جستجوی مستقیم `imdb` همان است.
3. با `movieId` به‌دست‌آمده، زیرنویس‌های `language=farsi_persian` با `sort=rating&limit=100` دریافت می‌شوند.
4. برای سریال‌ها، نتیجه روی الگوهای فصل/قسمت (`S01E05`، `S1E5`، `1x05` یا season pack کامل) فیلتر می‌شود.
5. لینک هر زیرنویس به proxy خود افزونه (`/download/{subtitleId}`) اشاره می‌کند؛ آن‌جا فایل ZIP دانلود، `SRT` از آن بیرون کشیده و با encoding درست به Stremio تحویل داده می‌شود.

> ⚠️ این پروژه میزبان هیچ فایل زیرنویس یا رسانه‌ای نیست؛ فقط از API رسمی SubSource استفاده می‌کند و به همین دلیل داشتن **کلید API** (`API_KEY`) الزامی است. مسئولیت رعایت قوانین کپی‌رایت و قوانین محلی بر عهده کاربر است.

---

## ✨ قابلیت‌ها

- 💬 **زیرنویس فارسی از SubSource** با منبع رسمی `api.subsource.net/api/v1`
- 🧠 **استراتژی جستجوی ترکیبی (Hybrid)** برای سریال‌ها: اول «نام سریال + شماره فصل» از طریق Cinemeta، سپس fallback به «جستجو با IMDb»
- 🎯 **تطبیق هوشمند فصل و قسمت** با الگوهای `S01E05`، `S1E5`، `1x05` و پشتیبانی از **Season Pack** (`COMPLETE` + `SEASON01` / `S01`)
- 🧪 **نرمال‌سازی قبل از تطبیق** با حذف فاصله، `-`، `.` و `_` و بزرگ‌نمایی نام ریلیز تا الگوهای متفاوت یک فایل جواب بدهند
- 📦 **Decoder مستقل ZIP** در دو runtime: در Node با `adm-zip` و در Worker با پارسر دستی ZIP + `DecompressionStream('deflate-raw')` (بدون وابستگی)
- 🔤 **تشخیص خودکار encoding** فارسی: تلاش با `UTF-8` و در صورت دیدن کاراکتر جایگزینی (`\uFFFD`) یا throw در حالت strict، تبدیل از `Windows-1256`
- 🏷️ **`lang: fas` و `title` برچسب‌دار** برای هر زیرنویس تا در لیست Stremio نام ریلیز (مثلاً `WEB-DL 1080p`) دیده شود
- 🟡 **متن حمایت (Promo) داخل زیرنویس** با رنگ زرد، مدت و موقعیت قابل تنظیم (`start` / `end`)
- 🔁 **کلاینت HTTP با retry**: حداکثر ۳ تلاش مجدد با backoff تصاعدی + jitter برای خطاهای `ECONNRESET`، `ETIMEDOUT`، `EAI_AGAIN`، `429` و `5xx`
- ⚡ **جلوگیری از socket مرده**: `keepAlive: false` روی agentهای `http`/`https` تا اتصال stale باعث `read ECONNRESET` نشود
- 🖥️ **حالت Cluster** برای استفاده از همه هسته‌های CPU با راه‌اندازی مجدد خودکار worker مرده و shutdown تدریجی
- 🩺 **`/health` با وضعیت process** (uptime، memory، `cpuLoad`) برای load balancer و مانیتورینگ
- 🚦 **لاگ درخواست‌ها** با زمان پاسخ (`GET /manifest.json - 200 (15ms)`)
- 🌐 **CORS، `trust proxy` و حذف `X-Powered-By`** در نسخه Node؛ هدرهای `access-control-*` روی همه پاسخ‌های Worker
- 🧯 **بدون crash برای کاربر**: هر خطا به `{ "subtitles": [] }` تبدیل می‌شود تا Stremio فقط لیست خالی نشان دهد
- 📦 **دو runtime**: Node.js/Express (`server.js` / `addon.js`) و Cloudflare Workers (`worker.js`) با `manifest.js` مشترک
- 🚀 **دیپلوی خودکار Worker** با GitHub Actions و validate شدن bundle قبل از deploy (`--dry-run`)

---

## 🗂️ ساختار پروژه

ساختار واقعی و به‌روز پروژه (خروجی `git ls-files`):

```text
.
├── .env.example                     # الگوی کامل متغیرهای محیطی (کپی کن به .env)
├── .github/
│   └── workflows/
│       └── deploy-worker.yml        # دیپلوی خودکار Worker به Cloudflare
├── .gitignore
├── README.md                        # همین فایل — راهنمای کاربر و راه‌اندازی
├── addon.js                         # نقطه ورود Node/Express + SDK builder
├── apiClient.js                     # کلاینت axios با retry و backoff
├── assets/
│   └── icons/
│       ├── logo.png                 # لوگوی ۲۵۶×۲۵۶ استفاده‌شده در manifest نسخه Worker
│       └── subtitles-fa.png         # تصویر استاتیک اضافی (۲۰۴۸×۲۰۴۸)
├── config.js                        # تمام تنظیمات از env (dotenv) + مقادیر پیش‌فرض
├── docs/
│   └── DOCUMENTATION.md             # مستندات فنی: منطق، تابع‌ها، بدهی فنی و راهنمای تست
├── downloadProxy.js                 # دانلود ZIP، استخراج SRT، repair encoding، درج متن Promo
├── manifest.js                      # manifest افزونه (subtitles / movie+series / tt)
├── package.json                     # اسکریپت‌ها و وابستگی‌های Node.js
├── package-lock.json                # نسخه‌های قفل‌شده وابستگی‌ها
├── server.js                        # راه‌انداز Cluster (main در package.json)
├── subtitlesHandler.js              # منطق جستجو و فیلتر زیرنویس در Node
├── worker.js                        # آداپتور Cloudflare Workers (main در wrangler.jsonc)
└── wrangler.jsonc                   # پیکربندی Worker: assets، bindings، run_worker_first
```

| مسیر | نقش |
|------|-----|
| `manifest.js` | تعریف `id`, `version`, `resources: ["subtitles"]`, `types: ["movie","series"]`, `idPrefixes: ["tt"]` — مشترک بین هر دو runtime |
| `addon.js` | `new addonBuilder(manifest)` + `defineSubtitlesHandler`، ساخت اپ Express، `getRouter(builder.getInterface())`، route `/download/:token`، `GET /health`، لاگ‌کننده و graceful shutdown |
| `config.js` | خواندن env با `dotenv` و پیش‌فرض‌ها (`PORT=7000`, `LONG_TIMEOUT=60000`, `MAX_SOCKETS=50`, ...) |
| `apiClient.js` | `apiRequest()` — retry با backoff تصاعدی + jitter، agent بدون `keepAlive`، تشخیص خطای قابل‌تلاش مجدد |
| `subtitlesHandler.js` | پارس `id`، جستجوی Cinemeta/SubSource، فیلتر فصل/قسمت، ساخت خروجی `{ subtitles: [...] }` |
| `downloadProxy.js` | دانلود ZIP از SubSource، استخراج اولین `.srt`، تبدیل encoding، درج بلوک Promo، پاسخ با `application/x-subrip` |
| `server.js` | منطقی `cluster`؛ اگر `CLUSTER_ENABLED=true` بود master هست و به تعداد هسته‌ها worker می‌سازد، در غیر این صورت همان پروسه `addon.js` را require می‌کند |
| `docs/DOCUMENTATION.md` | مستندات فنی برنامه‌نویس: معماری، مستندات تابع‌به‌تابع، الگوریتم تطبیق فصل/قسمت، جدول کامل env و فهرست ۱۲‌موردی بدهی فنی |
| `worker.js` | مسیرهای زیر prefix `/subtitles`، retry با `AbortController`، پارسر ZIP دستی، `TextDecoder` برای UTF-8/Windows-1256، سرو asset لوگو از `env.ASSETS` |
| `wrangler.jsonc` | `name: subsource-stremio-addon`، `main: worker.js`، `compatibility_date: 2026-09-02`، `assets.directory: ./assets/icons` با binding `ASSETS` و `run_worker_first` |
| `.github/workflows/deploy-worker.yml` | push به `main` → `npm ci` → `wrangler deploy --dry-run` → `wrangler secret put API_KEY` → `wrangler deploy` (Wrangler نسخه `4.128.0` پین‌شده) |

> `docs/DOCUMENTATION.md` مستندات فنی کامل (منطق تابع‌به‌تابع، الگوریتم‌ها و بدهی فنی) را نگه می‌دارد. پروژه در حال حاضر فایل تست، پیکربندی lint و `Dockerfile` **ندارد** و `LICENSE` هم در ریشه مخزن موجود نیست (مقدار `license` در `package.json` برابر `Apache License 2.0` است)؛ تنها فایل نمونه تنظیمات، `.env.example` است.

---

## 🚀 نصب و راه‌اندازی محلی

### پیش‌نیازها

- [Node.js](https://nodejs.org/) نسخه `20.18.1` یا بالاتر
  - `package.json` مقدار `engines.node >= 14.0.0` را اعلام می‌کند، ولی نسخه قفل‌شده `cheerio` در `package-lock.json` مقدار `engines.node >= 20.18.1` دارد؛ برای امنیت خود نسخه `22` توصیه می‌شود (CI هم روی Node `22` اجرا می‌شود).
- npm
- **کلید API سرویس SubSource** (از [subsource.net](https://subsource.net)) — بدون آن خروجی افزونه خالی است
- برای حالت Worker: [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`npx wrangler`)
- برنامه Stremio برای تست نصب افزونه

### ۱. دریافت کد

```bash
git clone https://github.com/alirostami01/Persian-Subtitles.git
cd Persian-Subtitles
```

### ۲. نصب وابستگی‌ها

```bash
npm install          # یا برای نصب دقیق بر اساس lock: npm ci
```

### ۳. ساخت فایل `.env` (برای Node)

```bash
cp .env.example .env
```

سپس `API_KEY` را در آن ست کن. حداقل تنظیمات لازم:

```env
SERVER_IP=127.0.0.1
PORT=7000
API_KEY=your-subsource-api-key
```

| متغیر | وضعیت | پیش‌فرض | توضیح |
|-------|-------|---------|-------|
| `API_KEY` | **اجباری** | — | کلید SubSource؛ در هدر `X-API-Key` ارسال می‌شود. اگر نباشد لاگ `API Key is missing from .env file.` چاپ و پاسخ `{ subtitles: [] }` می‌شود |
| `PORT` | اختیاری | `7000` | پورت سرور HTTP (`app.listen` در `addon.js`) و جزء URL لینک زیرنویس |
| `SERVER_IP` | اختیاری | `127.0.0.1` | آدرس/دامنه‌ای که در `url` هر زیرنویس نوشته می‌شود؛ در استقرار **باید** روی دامنه عمومی تنظیم شود |

سه متغیر بالا به‌علاوه `LONG_TIMEOUT` و `SUBTITLE_PROMO_*` مقدارهایی هستند که در کد Node واقعاً مصرف می‌شوند؛ فهرست کامل (همراه با تنظیمات runtime Worker) در [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) آمده است:

| متغیر | پیش‌فرض | توضیح |
|-------|---------|-------|
| `LONG_TIMEOUT` | `60000` | تایم‌اوت requestها به SubSource (میلی‌ثانیه) |
| `SUBTITLE_PROMO_TEXT` | متن حمایت پروژه | متن اضافه‌شده داخل زیرنویس؛ با مقدار خالی، درج متن متوقف می‌شود |
| `SUBTITLE_PROMO_DURATION` | `20` | مدت نمایش متن به ثانیه |
| `SUBTITLE_PROMO_POSITION` | `end` | موقعیت درج متن: `start` یا `end` |
| `MAX_SOCKETS` | `50` | سقف اتصال‌های همزمان agentها در `apiClient.js` |
| `CLUSTER_ENABLED` | `false` | فعال‌سازی حالت cluster (فقط با `npm start`) |
| `WORKER_COUNT` | `0` | تعداد پروسه‌های cluster؛ `0` یعنی به تعداد هسته‌های CPU |

برای Cloudflare Workers هیچ `.env` خوانده نمی‌شود؛ `API_KEY` باید به‌صورت **Worker Secret** تنظیم شود و متن Promo از `env` یا پیش‌فرض داخلی (`DEFAULT_PROMO_TEXT` در `worker.js`) می‌آید:

```bash
npx wrangler secret put API_KEY                      # برای پروداکشن
printf 'API_KEY="..."\n' > .dev.vars                 # فقط برای wrangler dev محلی
```

اگر ترجیح می‌دهی فایل `.env` نسازی، در Node می‌توانی مقدارها را inline بدهی:

```bash
API_KEY=xxxx SERVER_IP=127.0.0.1 PORT=7000 node server.js
```

### ۴. اجرای برنامه

#### حالت Node.js — توسعه (تک‌پروسه)

```bash
npm run dev          # => node addon.js
```

خروجی موفق:

```text
===========================================
Persian Subtitles Add-on Server Started
===========================================
Server listening on port: 7000
Available CPU cores: 8
Install URL: http://127.0.0.1:7000/manifest.json
Health check: http://127.0.0.1:7000/health
===========================================
```

#### حالت Node.js — پروداکشن (Cluster)

```bash
npm start            # => node server.js
```

```text
===========================================
Starting Cluster Mode
===========================================
Master process 4123 started
Detected 8 CPU cores
Spawning 8 worker processes...
===========================================

Worker 4124 spawned
✓ Worker 4124 is online (1/8)
...
✅ All workers are ready to handle requests!
```

> `CLUSTER_ENABLED=true` در `.env` لازم است؛ اگر `false` باشد `server.js` همان مسیر تک‌پروسه را می‌رود. برای تعداد ثابت worker، `WORKER_COUNT` را ست کن.

اگر پورت اشغال باشد:

```text
Error: listen EADDRINUSE: address already in use :::7000
```

راه‌حل:

```bash
PORT=7001 npm run dev
```

#### حالت Cloudflare Workers (Edge)

```bash
npx wrangler dev
```

```text
⛅️ wrangler is running at http://localhost:8787
Manifest: http://localhost:8787/subtitles/manifest.json
```

> در حالت Worker همه مسیرها زیر prefix `/subtitles` هستند؛ باز کردن ریشه (`http://localhost:8787/`) پاسخ `404` می‌دهد و `http://localhost:8787/subtitles` پاسخ وضعیت JSON برمی‌گرداند.

### ۵. نصب در Stremio

**Node:**

```text
stremio://localhost:7000/manifest.json
```

**Workers (لوکال):**

```text
stremio://localhost:8787/subtitles/manifest.json
```

یا ابتدا manifest را در مرورگر باز کن و روی **Install** کلیک کن:

```text
http://localhost:7000/manifest.json
http://localhost:8787/subtitles/manifest.json
```

---

## ☁️ استقرار (Deployment)

### گزینه A: Node.js hosting (VPS, Railway, Render, Fly.io, Heroku)

1. Node.js نسخه `20.18.1+` (پیشنهادی: `22`) روی محیط اجرا فعال باشد.
2. وابستگی‌ها را نصب کن: `npm ci`
3. دستور اجرا را روی `npm start` بگذار (یعنی `node server.js`)؛ `main` در `package.json` همین است. برای تک‌پروسه: `node addon.js`.
4. `API_KEY` و **`SERVER_IP`** را روی دامنه عمومی ست کن (بدون `SERVER_IP` درست، Stremio نمی‌تواند فایل زیرنویس را دانلود کند).
5. کد خودش `PORT` را از env با پیش‌فرض `7000` می‌خواند؛ حواست باشد `SERVER_IP` و `PORT` **مستقیم در URL هر زیرنویس نوشته می‌شوند**، پس همان‌ها را روی آدرس عمومی تنظیم کن.
6. در پروداکشن `CLUSTER_ENABLED=true` را فعال کن.
7. آدرس نصب بعد از استقرار:

   ```text
   stremio://YOUR_DOMAIN/manifest.json
   ```

> مسیرهای ضروری: `/manifest.json`, `/subtitles/...`, `/download/{id}`, `/health`

⚠️ توجه مهم: در نسخه Node، لینک هر زیرنویس به‌صورت `http://${SERVER_IP}:${PORT}/download/...` ساخته می‌شود؛ یعنی **scheme همیشه `http`** است و `PORT` هم حتماً در URL می‌آید. برای سرو روی `443` پشت TLS proxy، مسیر `/download/...` را در پراکسی به پورت واقعی داخل سرور/container پاس کن و `SERVER_IP` را فقط روی نام دامنه تنظیم کن. راه‌حل تمیزتر: ساخت URL از `x-forwarded-proto` + `Host` است که به‌عنوان بدهی فنی در بخش «مسائل شناخته‌شده» [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) توضیح داده شده.

#### نمونه Docker (خودت بساز — در مخزن `Dockerfile` وجود ندارد)

```dockerfile
FROM node:22-alpine
WORKDIR /app   # نکته: مقدار name در package.json فعلاً «Persian Subtitles» است؛ npm این نام را برای publish نمی‌پذیرد (اجرای محلی مشکلی ندارد)
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=7000
EXPOSE 7000
CMD ["node", "server.js"]
```

```bash
docker build -t persian-subtitles-addon .
docker run -d -p 7000:7000 --env-file .env persian-subtitles-addon
```

#### پشت Load Balancer

```nginx
upstream stremio_subtitles {
    server 10.0.0.1:7000;
    server 10.0.0.2:7000;
}

server {
    listen 443 ssl;
    server_name subs.example.com;

    location / {
        proxy_pass http://stremio_subtitles;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /health {
        proxy_pass http://stremio_subtitles/health;
    }
}
```

### گزینه B: Cloudflare Workers (پیشنهادی برای Edge, رایگان)

1. `wrangler.jsonc` لازم نیست تغییری کند؛ `API_KEY` **نباید** در آن نوشته شود (فایل commit شده است) و باید به‌صورت secret تنظیم شود.
2. `npm install`
3. دیپلوی دستی:

   ```bash
   npx wrangler secret put API_KEY
   npx wrangler deploy
   ```

   یا خودکار via GitHub Actions — trigger در `deploy-worker.yml` فقط روی تغییر این فایل‌هاست: `worker.js`, `manifest.js`, `wrangler.jsonc`, `package.json`, `package-lock.json`, `assets/icons/**`, خود workflow (و `workflow_dispatch` دستی).

4. آدرس نصب بعد از استقرار:

   ```text
   stremio://<worker>.workers.dev/subtitles/manifest.json
   ```

> مسیرهای ضروری Worker: `/subtitles/manifest.json`, `/subtitles/movie/...`, `/subtitles/series/...`, `/subtitles/download/{id}`, `/subtitles/logo.png`
> همه پاسخ‌های JSON هدر `access-control-allow-origin: *` و `cache-control: no-store` دارند (فقط `manifest.json` با `max-age=300` و فایل زیرنویس با `private, max-age=300` کش می‌شود).

### Secrets مورد نیاز در GitHub Actions

| Secret | کاربرد |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | احراز هویت Wrangler |
| `CLOUDFLARE_ACCOUNT_ID` | تعیین account مقصد |
| `SUBSOURCE_API_KEY` | در step «Configure SubSource API secret» با `wrangler secret put API_KEY` روی Worker ست می‌شود |

### نکات HTTPS و Proxy

- **Node:** `app.set('trust proxy', true)` از قبل فعال است تا IP واقعی پشت load balancer درست تشخیص داده شود؛ اما URL زیرنویس‌ها همچنان از `SERVER_IP`/`PORT` ساخته می‌شود، پس آن‌ها را خودت درست ست کن.
- **Workers:** `url.origin` همیشه scheme و host درست را دارد و لینک `/subtitles/download/{id}` خودش ساخته می‌شود؛ نیازی به تنظیم اضافه نیست.

---

## 🎯 نحوه استفاده

بعد از نصب افزونه در Stremio:

1. یک فیلم یا سریال دارای شناسه IMDb را باز کنید.
2. Stremio درخواست subtitles را به افزونه می‌فرستد (`/subtitles/{type}/{id}.json`).
3. افزونه با نام سریال (برای سریال) یا IMDb (برای فیلم و fallback) در SubSource جستجو می‌کند.
4. برای فیلم‌ها، همه زیرنویس‌های فارسی همان `movieId` (مرتب‌شده بر اساس rating، حداکثر ۱۰۰ مورد) برگردانده می‌شوند.
5. برای سریال‌ها، فهرست روی شماره فصل و قسمت فیلتر می‌شود و در صورت نبود تک‌قسمتی، **season pack** کامل انتخاب می‌شود.
6. با انتخاب یک زیرنویس، Stremio فایل را از `/subtitles/download/{subtitleId}` می‌گیرد که SRT خالص و UTF-8 شده را تحویل می‌دهد.
7. در انتهای (یا ابتدای) فیلم، متن حمایت زردرنگ نمایش داده می‌شود که با `SUBTITLE_PROMO_*` قابل تغییر یا حذف است.

نمونه پاسخ manifest (Node):

```json
{
  "id": "org.alirostami.subtitles.persian",
  "version": "1.0.0",
  "name": "Persian Subtitles",
  "author": "Ali Rostami",
  "contactEmail": "rostami.ali@gmail.com",
  "resources": ["subtitles"],
  "types": ["movie", "series"],
  "idPrefixes": ["tt"],
  "catalogs": []
}
```

نمونه آیتم زیرنویس در پاسخ:

```json
{
  "id": "1234567",
  "url": "http://127.0.0.1:7000/download/1234567",
  "lang": "fas",
  "title": "WEB-DL 1080p S01E05"
}
```

---

## 🔌 مسیرها و API

### Node.js (`addon.js` / `server.js`)

| مسیر | توضیح |
|------|-------|
| `GET /manifest.json` | manifest افزونه، تولیدشده توسط `getRouter` از SDK رسمی |
| `GET /subtitles/movie/{imdbId}.json` | زیرنویس فیلم؛ مثال: `/subtitles/movie/tt1234567.json` |
| `GET /subtitles/series/{imdbId}:{season}:{episode}.json` | زیرنویس یک قسمت؛ مثال: `/subtitles/series/tt1234567:1:3.json` |
| `GET /download/{subtitleId}` | دانلود SRT (استخراج از ZIP + تبدیل encoding + متن Promo) |
| `GET /health` | وضعیت سرویس: `status`, `timestamp`, `uptime`, `memory`, `cpuLoad` |

### Cloudflare Workers (`worker.js`)

| مسیر | توضیح |
|------|-------|
| `GET /subtitles` یا `/subtitles/` | پاسخ JSON: `{ status:'ok', service:'subsource-stremio-addon', runtime:'cloudflare-workers' }` |
| `GET /subtitles/health` | همان پاسخ سالم (بدون uptime/memory) |
| `GET /subtitles/manifest.json` | manifest + `logo` مطلق `https://<origin>/subtitles/logo.png` + `behaviorHints.configurable: false` |
| `GET /subtitles/logo.png` | لوگوی افزونه (از `env.ASSETS` — پوشه `assets/icons`) |
| `GET /subtitles/movie/{imdbId}.json` | زیرنویس فیلم در Worker |
| `GET /subtitles/series/{imdbId}:{season}:{episode}.json` | زیرنویس سریال در Worker |
| `GET /subtitles/download/{subtitleId}` | دانلود SRT در Worker |

> هر درخواست غیر `GET` در Worker پاسخ `405 Method Not Allowed` و هر `OPTIONS` پاسخ `204` با هدرهای CORS می‌گیرد. در Node نیز ریشه (`GET /`) تعریف نشده و `404` برمی‌گردد؛ برای بررسی سلامت از `/health` استفاده کن.

### Endpoints خارجی که افزونه مصرف می‌کند

| سرویس | endpoint |
|-------|----------|
| SubSource | `GET /api/v1/movies/search?searchType=text&q={name}&season={n}` |
| SubSource | `GET /api/v1/movies/search?searchType=imdb&imdb={imdbId}` |
| SubSource | `GET /api/v1/subtitles?movieId={id}&language=farsi_persian&sort=rating&limit=100` |
| SubSource | `GET /api/v1/subtitles/{subtitleId}/download` (ZIP) |
| Stremio Cinemeta | `GET https://v3-cinemeta.strem.io/meta/series/{imdbId}.json` |

بررسی سریع با curl:

```bash
# Node
curl http://localhost:7000/manifest.json
curl http://localhost:7000/health
curl http://localhost:7000/subtitles/movie/tt1234567.json
curl http://localhost:7000/subtitles/series/tt1234567:1:3.json
curl http://localhost:7000/download/1234567 | head

# Workers
curl http://localhost:8787/subtitles/manifest.json
curl http://localhost:8787/subtitles/health
curl http://localhost:8787/subtitles/movie/tt1234567.json
curl http://localhost:8787/subtitles/series/tt1234567:1:3.json
```

---

## ⚙️ خلاصه عملکرد فنی

### معماری ماژولار

```text
                    manifest.js (منبع حقیقت: id, version, resources)
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
   addon.js (Node/Express)               worker.js (Cloudflare Edge)
   SDK رسمی + getRouter                  پارس مسیر + fetch + ZIP parser
        │                                     │
        ├── subtitlesHandler.js               ├── منطق معادل داخل worker.js
        ├── downloadProxy.js                  ├── downloadProxy داخل worker.js
        └── apiClient.js ──► config.js        └── env (API_KEY, SUBTITLE_PROMO_*)
        │
server.js (cluster supervisor → addon.js)
```

### جریان هسته (Node)

```text
Stremio request → /subtitles/{type}/{id}.json
   ↓
getRouter(addonBuilder(manifest).getInterface())   ← از stremio-addon-sdk
   ↓
subtitlesHandler({ type, id })
   ├─ !process.env.API_KEY      → { subtitles: [] } + لاگ خطا
   ├─ parse id                  → series: tt:season:episode / movie: tt
   ├─ getMovieId (سریال)        ← Cinemeta → SubSource search (text + season)
   ├─ fallback                  ← GET /movies/search?searchType=imdb&imdb=...
   ├─ GET /subtitles?movieId=…&language=farsi_persian&sort=rating&limit=100
   ├─ filterSeriesSubtitles(...) ← الگوهای S01E05 / S1E5 / 1x05 / SEASON PACK
   └─ map → { id, url: http://SERVER_IP:PORT/download/{id}, lang:'fas', title }
   ↓
GET /download/:token  (downloadProxy)
   ├─ apiRequest → ZIP (arraybuffer)
   ├─ adm-zip → اولین entry با پسوند .srt
   ├─ iconv-lite → UTF-8، در صورت \uFFFD → Windows-1256
   ├─ addPromoTextToSubtitle(...)  ← بلوک زرد ASS-style، start/end
   └─ 200 + Content-Type: application/x-subrip; charset=utf-8
```

جزئیات مهم:

- تطبیق محتوا فقط از طریق SubSource انجام می‌شود؛ جستجوی متنی آزاد یا fallback به slug وجود ندارد.
- افزونه catalog، meta یا stream ارائه نمی‌کند؛ فقط resource نوع `subtitles` دارد (`catalogs: []`).
- SubSource باید `success: true` و آرایه `data` با فیلدهای `movieId` / `subtitleId` / `releaseInfo` برگرداند.
- نام فایل‌های ZIP فرقی نمی‌کند؛ **اولین** فایل `.srt` داخل آرشیو انتخاب می‌شود.
- متن Promo با تگ `{\\c&H00FFFF00&}` نوشته می‌شود؛ پلیرهایی که تگ ASS را نمی‌فهمند آن را خام نشان می‌دهند (یا به‌عنوان متن). برای حذف کامل، `SUBTITLE_PROMO_TEXT` را خالی بگذار.
- در صورت هر خطا یا پیدا نشدن نتیجه، پاسخ `{ "subtitles": [] }` است؛ یعنی Stremio فقط لیست زیرنویس خالی نشان می‌دهد و پخش فیلم نمی‌شکند.
- retry فقط برای خطاهای شبکه‌ای و `429`/`5xx` انجام می‌شود؛ `4xx`های دیگر بلافاصله fail می‌شوند.
- `stremio-addon-sdk` و `express` فقط در runtime Node مصرف می‌شوند و در Worker باندل نمی‌شوند (ورودی Worker `worker.js` است که تنها به `manifest.js` وابسته است).
- `wrangler.jsonc` با `assets.directory: ./assets/icons` فایل `logo.png` را در `env.ASSETS` می‌گذارد تا `/subtitles/logo.png` سرو شود.

### وابستگی‌ها

| پکیج | نقش |
|------|-----|
| `stremio-addon-sdk` | `addonBuilder` + `getRouter` برای manifest و route افزونه |
| `express`، `cors`، `dotenv` | وب‌سرور، CORS و بارگذاری `.env` |
| `axios` | HTTP client در `apiClient.js` |
| `adm-zip` | استخراج `.srt` از آرشیو ZIP (فقط Node) |
| `iconv-lite` | تبدیل `Windows-1256` → `UTF-8` |
| `cheerio` | پارس HTML (در حال حاضر در مسیر اصلی استفاده نمی‌شود) |
| `https-proxy-agent`، `axios-https-proxy-fix` | پشتیبانی proxy برای شبکه‌های محدود |

---

## 🐛 عیب‌یابی

### لیست زیرنویس در Stremio خالی است

- `API_KEY` تنظیم نشده؛ در لاگ Node این خط را می‌بینی: `API Key is missing from .env file.` و در لاگ Worker: `Subtitle handler error: API_KEY is not configured`.
- SubSource برای آن `imdbId` نتیجه‌ای ندارد (`Both attempts failed to find a movieId.`).
- زیرنویس `farsi_persian` برای آن `movieId` وجود ندارد (`No Persian subtitles found for movieId: ...`).
- برای سریال‌ها فیلتر فصل/قسمت همه نتایج را حذف کرده است؛ با لاگ `Applying detailed filter for patterns: [...]` می‌توانی الگوها را بررسی کنی.

### فایل زیرنویس دانلود نمی‌شود (خطای 404/500 در Player)

- `SERVER_IP` هنوز روی `127.0.0.1` است، پس URL داخل پاسخ به آدرس لوکال اشاره می‌کند. آن را روی دامنه عمومی ست کن و افزونه را دوباره نصب/رفرش کن.
- `PORT` داخل URL همان پورتی است که سرور روی آن listen کرده؛ اگر از بیرون با پورت دیگری به سرویس می‌رسی (مثلاً `443` یا `8080`)، باید همان مسیر را در پراکسی map کنی.
- پاسخ `Server configuration error` یعنی کلید API روی سرور وجود ندارد (در Worker: secret ست نشده است).

### در لاگ `read ECONNRESET` یا `timeout` می‌بینم

`apiClient.js` خودش ۳ بار با backoff تلاش مجدد می‌کند (لاگ: `Request failed (ECONNRESET) ... Retrying in 780ms (attempt 1/3)`). اگر خطا ادامه داشت:

- `LONG_TIMEOUT` را افزایش بده (مثلاً `120000`).
- `MAX_SOCKETS` را کم کن تا تعداد اتصال‌های همزمان پایین بیاید (پیش‌فرض آن در `config.js` مقدار `50` است).
- خروجی شبکه/فایروال را بررسی کن؛ گاهی کلاینت‌های proxy شرکتی اتصال keep-alive را قطع می‌کنند.

### زیرنویس فارسی به‌هم‌ریخته یا `Ø¶` نمایش داده می‌شود

یعنی فایل `Windows-1256` بوده. کد خودش `\uFFFD` را تشخیص می‌دهد و re-encode می‌کند (لاگ: `Re-encoded subtitle from Windows-1256 to UTF-8 for: ...`). اگر باز هم خراب بود، احتمالاً فایل `UTF-8` با BOM یا `cp1256` نبوده و باید الگوریتم تشخیص encoding در `downloadProxy.js` گسترش پیدا کند.

### متن Promo نمایش داده نمی‌شود

- `SUBTITLE_PROMO_TEXT` خالی گذاشته شده است.
- `SUBTITLE_PROMO_POSITION=end` است و زیرنویس فقط یک بلوک کوتاه دارد؛ برای دیدن سریع، `start` را امتحان کن.
- پلیر تگ `{\c...}` را پشتیبانی نمی‌کند؛ متن نمایش داده می‌شود ولی بدون رنگ.

### لوگو در Stremio نمایش داده نمی‌شود

- **Node:** `manifest.js` هیچ فیلد `logo` ندارد؛ استرمیو از آیکن پیش‌فرض استفاده می‌کند. برای افزودن لوگو، فیلد `logo` را به `manifest.js` اضافه کن (URL مطلق لازم است).
- **Workers:** لوگو از `https://<origin>/subtitles/logo.png` سرو می‌شود؛ مطمئن شو assetها با deploy آپلود شده‌اند (`wrangler deploy` پوشه `assets/icons` را می‌فرستد). اگر `404` گرفتی، binding `ASSETS` و `assets.directory` را در `wrangler.jsonc` چک کن.

### خطای `Worker died` یا بالا نیامدن cluster

- `npm start` با `CLUSTER_ENABLED=true` به تعداد هسته‌ها worker می‌سازد؛ اگر رم کم است، `WORKER_COUNT=2` را ست کن.
- master پس از مرگ worker، ۱ ثانیه صبر می‌کند و دوباره fork می‌کند (`🔄 New worker ... started`); برای دیدن علت اصلی، لاگ همان worker را ببین.
- برای توسعه از `npm run dev` (تک‌پروسه) استفاده کن تا stack trace کامل و بدون noise داشته باشی.

### `wrangler deploy` در GitHub Actions شکست می‌خورد

- `CLOUDFLARE_API_TOKEN`، `CLOUDFLARE_ACCOUNT_ID` و `SUBSOURCE_API_KEY` در repository secrets ست شده‌اند؟ (step دوم با `test -n "$SUBSOURCE_API_KEY"` صریحاً fail می‌کند.)
- تغییراتت فایل‌های trigger شده را لمس نکرده باشد، workflow اجرا نمی‌شود؛ از **Run workflow** (workflow_dispatch) دستی استفاده کن.
- نسخه Wrangler در workflow پین شده `4.128.0` است؛ لاگ Action را چک کن.

---

## 🤝 مشارکت

Pull Requestها و Issueها برای بهبود تطبیق فصل/قسمت، سازگاری با تغییرات API سابسورس، افزودن تست و بهبود مستندات خوشحال‌کننده است.

قبل از تغییر منطق استخراج، بخش‌های «نقشه ماژول‌ها» و «مسائل شناخته‌شده و بدهی فنی» در [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) را مطالعه کنید؛ چند مورد کوچک و آماده برای شروع مشارکت آنجا فهرست شده‌اند.

---

## 📄 مجوز

مقدار `license` در [`package.json`](package.json) برابر **Apache License 2.0** است.

> فایل `LICENSE` با متن کامل هنوز در ریشه مخزن وجود ندارد؛ برای استناد رسمی می‌توانی همین فایل را با متن استاندارد Apache-2.0 اضافه کنی.

---

<p align="center">
  ساخته شده با ❤️ برای جامعه فارسی‌زبان Stremio<br />
  حمایت از ادامه مسیر: <a href="https://alirostami.com/support">alirostami.com/support</a>
</p>
