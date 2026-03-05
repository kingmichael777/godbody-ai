# NOOR AI — Backend

HeyGen-powered AI video generation hub with a built-in credit system.

---

## STACK

- Node.js + Express
- HeyGen API (talking photo, avatar video, lipsync, translation)
- In-memory credit system (swap for Supabase/Postgres in production)
- Async job polling (swap for BullMQ + Redis in production)
- Stripe for credit purchases
- AWS S3 / Cloudflare R2 for file storage (local disk in dev)

---

## SETUP

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Open `.env` and fill in your keys:
- `HEYGEN_API_KEY` — https://app.heygen.com/settings/api
- `STRIPE_SECRET_KEY` — https://dashboard.stripe.com/apikeys
- `STRIPE_WEBHOOK_SECRET` — from `stripe listen` output
- `STRIPE_PRICE_*` — Price IDs from your Stripe Product Catalog

### 3. Start the server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3001`

---

## FILE STRUCTURE

```
noor-ai/
├── server.js                     # Entry point
├── .env.example                  # Environment template
├── server/
│   ├── routes/
│   │   ├── generate.js           # All HeyGen generation endpoints
│   │   ├── jobs.js               # Job status + credit endpoints
│   │   ├── upload.js             # File upload endpoints
│   │   └── stripe.js             # Stripe payment endpoints
│   └── services/
│       ├── heygen.js             # HeyGen API wrapper
│       ├── credits.js            # Credit system
│       ├── jobs.js               # Job tracking + polling
│       ├── storage.js            # File storage (local / S3)
│       └── stripe.js             # Stripe integration
└── client/
    ├── index.html                # Main AI hub
    ├── upload-ui.html            # Upload UI (Talking Photo tool)
    ├── credits.html              # Credits / pricing page
    └── noor-api.js               # Frontend API client
```

---

## API REFERENCE

All generation endpoints require `x-user-id` header.  
They return a `jobId` immediately. Poll `/api/jobs/:jobId` for status.

### Generation

| Endpoint | Body |
|---|---|
| `POST /api/generate/talking-photo` | `{ photoUrl, audioUrl }` |
| `POST /api/generate/avatar-video` | `{ avatarId, voiceId, script }` |
| `POST /api/generate/lipsync` | `{ videoUrl, audioUrl }` |
| `POST /api/generate/video-translate` | `{ videoUrl, outputLanguage }` |
| `GET /api/generate/avatars` | — |
| `GET /api/generate/voices?language=en` | — |

### Jobs

| Endpoint | Description |
|---|---|
| `GET /api/jobs/:jobId` | Poll job status |
| `GET /api/jobs` | All user jobs |
| `GET /api/jobs/credits/balance` | Credit balance |
| `GET /api/jobs/credits/history` | Transaction history |

### Upload

| Endpoint | Description |
|---|---|
| `POST /api/upload/file` | Single file upload |
| `POST /api/upload/pair` | Photo + audio pair |
| `POST /api/upload/to-heygen` | Upload to HeyGen asset storage |
| `GET /api/upload/presign` | Presigned S3 URL |

### Stripe

| Endpoint | Description |
|---|---|
| `GET /api/stripe/packages` | Available credit packages |
| `POST /api/stripe/checkout` | Create checkout session |
| `POST /api/stripe/webhook` | Stripe webhook receiver |
| `GET /api/stripe/success` | Verify successful payment |

---

## CREDIT COSTS

| Tool | Credits |
|---|---|
| Talking Photo | 6 |
| Avatar Video | 10 |
| Lipsync | 8 |
| Video Translate | 12 |
| Face Swap | 4 |
| AI Headshots | 8 |
| Text to Image | 2 |
| Background Remove | 1 |
| Voice Clone | 5 |
| Text to Speech | 3 |
| AI Animation | 10 |
| Image Upscaler | 3 |
| Style Transfer | 4 |
| Video to Video | 12 |

---

## STRIPE SETUP (Local Testing)

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

Copy the `whsec_...` signing secret into `.env` as `STRIPE_WEBHOOK_SECRET`.

Test card: `4242 4242 4242 4242` — any future expiry, any CVC.

---

## DEPLOYMENT (Railway)

1. Push to GitHub
2. Connect repo on railway.app
3. Add all `.env` variables in the Railway dashboard
4. Update Stripe webhook endpoint to your Railway URL
5. Set `FRONTEND_URL` to your deployed domain

---

## PRODUCTION CHECKLIST

- [ ] Replace in-memory `userStore` with Supabase or Postgres
- [ ] Replace in-memory `jobStore` with Redis + BullMQ
- [ ] Add JWT authentication middleware
- [ ] Add S3/Cloudflare R2 (set `AWS_*` env vars — storage.js auto-switches)
- [ ] Swap Stripe test keys for live keys
- [ ] Update Stripe webhook endpoint to production URL
- [ ] Set `FRONTEND_URL` env var to deployed domain
