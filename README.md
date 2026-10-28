# splitItto

splitItto turns a restaurant receipt into an item-by-item split. People can claim their own items, move shared dishes into Common, and see an exact reconciliation in integer paise before saving a split.

## Architecture

### Application structure

```text
src/
  app/
    api/                 Next.js route handlers (DTO validation at the edge)
    layout.tsx           Global metadata and styles
    page.tsx             Guided capture → verify → assign → summary flow
  features/
    assignment/          Assignment state, allocation view, drag/drop board
    ocr/                 Provider interface, Google Vision adapter, parser
    receipt/              Receipt state and persistence
    ui/                   UI preferences
  components/
    ui/                   Source-owned shadcn-compatible UI primitives
  lib/
    env.ts                Server environment validation
    http.ts               Request security and error response helpers
    money.ts              Integer-paise allocation and formatting
    prisma.ts             Reused Prisma client
    rate-limit.ts         Upstash production limiter / local development limiter
    receipt.ts            Receipt validation and GST/quantity expansion
prisma/
  schema.prisma
  migrations/
```

### Database design

PostgreSQL stores `User`, `Bill`, `RawReceipt`, `BillItem`, `GeneratedItem`, `Person`, and `Assignment`. All stored amounts use integer paise. Bill-owned rows have soft-delete timestamps; foreign keys and indexes support bill lookups and cleanup. An assignment has one unique generated-item reference and either a person reference or the `isCommon` flag.

### State management

`useReceiptStore` persists receipt details and processed unit items in local storage. `useAssignmentStore` persists people and one target per generated item; targets are a person ID, `common`, or unassigned. `useUiStore` owns the light/dark preference. The server validates the complete assignment before a bill is saved.

### API design

| Route | Responsibility |
|---|---|
| `POST /api/upload` | Validate image MIME, size (4 MB), and file signature; store as a private Cloudinary asset and issue a 15-minute signed OCR URL |
| `POST /api/ocr` | Restrict OCR input to signed private receipt assets; call Google Vision and parse a receipt DTO |
| `POST /api/process-bill` | Validate bill math, distribute GST over unit items, cap expanded receipts at 50 |
| `POST /api/validate-bill` | Check known targets, unique assignment, completeness, and exact totals |
| `POST /api/save-bill` | Re-validate and atomically persist receipt, items, people, and assignments |
| `GET /api/bill/[id]` | Return a saved bill without raw OCR text |

OCR parsing is intentionally an editable estimate: receipt layouts vary, so the review screen requires the user to confirm extracted names, quantities, tax, and totals before processing. In development without Cloudinary credentials, images are kept in a restricted local temporary directory and read with Tesseract.js using its bundled English model; no external model download is needed. When no development database is configured, completed splits are stored as restricted local JSON records in a temporary directory. Production uploads, OCR, and persistence use private Cloudinary, Google Vision, and PostgreSQL.

### UI architecture

The App Router shell contains five guided states: landing, capture, receipt review, assignment, and final summary. The assignment state has exactly three board sections (Items, Common, People); Dnd Kit sensors support pointer, touch, and keyboard interaction, with a native assignment control as a keyboard-friendly alternative. The responsive interface uses source-owned shadcn-compatible components, Tailwind configuration, Framer Motion transitions, and Lucide icons.

## Financial behavior

- Every amount is an integer number of paise; conversion to rupees is limited to display and input boundaries.
- GST is allocated proportionally across each expanded unit using largest-remainder allocation. Ties are resolved by receipt order, so results are stable.
- Unit base amounts and GST shares are independently reconciled; generated item totals equal the receipt grand total exactly.
- Common expenses are shared evenly, with leftover paise assigned in people-row order.
- More than 50 expanded items is rejected before item expansion.

## Requirements

- Node.js 22+
- npm
- PostgreSQL 16+
- A Cloudinary account
- A Google Cloud project with the Vision API enabled and an API key
- Upstash Redis REST credentials for production rate limiting

## Local setup

1. Copy `.env.example` to `.env.local`. Set `DATABASE_URL`, the Cloudinary credentials, and `GOOGLE_VISION_API_KEY` to use the production-equivalent integrations; these are optional for the local development fallbacks.
2. Install dependencies and generate Prisma's client:

   ```sh
   npm install
   npx prisma generate
   ```

3. If using PostgreSQL, start it and apply migrations:

   ```sh
   docker compose up -d db
   npm run db:deploy
   ```

4. Start the app:

   ```sh
   npm run dev
   ```

   Visit `http://localhost:3000`. When Cloudinary credentials are absent in development, image upload and English OCR use local temporary storage. When `DATABASE_URL` is absent, completed splits use local temporary storage instead; both fallbacks are disabled in production.

## Environment variables

| Variable | Required | Notes |
|---|---:|---|
| `DATABASE_URL` | Production | PostgreSQL connection string; development uses temporary local persistence when unset |
| `CLOUDINARY_CLOUD_NAME` | For image scans | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | For image scans | Server-only API key |
| `CLOUDINARY_API_SECRET` | For image scans | Server-only secret |
| `GOOGLE_VISION_API_KEY` | For OCR | Server-only Vision API key |
| `UPSTASH_REDIS_REST_URL` | Production | Distributed rate-limit store |
| `UPSTASH_REDIS_REST_TOKEN` | Production | Upstash REST token |
| `RATE_LIMIT_MAX_REQUESTS` | No | Default 20 requests per window and client IP |
| `RATE_LIMIT_WINDOW_MS` | No | Default 60,000 milliseconds |

In development the rate limiter is process-local. Production API writes and uploads intentionally fail closed with HTTP 503 unless Upstash is configured.

## Run and validate

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Playwright starts the development server and covers a complete manually entered split. The test stubs only the final persistence endpoints; unit and route tests exercise real paise calculations and receipt processing.

## Docker deployment

Set Cloudinary, Vision, and Upstash variables in the deployment environment, then run:

```sh
docker compose up --build
```

Compose starts PostgreSQL, waits for its health check, applies Prisma migrations, and then starts the standalone Next.js server. Replace the sample PostgreSQL credentials and configure durable backups, TLS, and secret management before exposing this Compose stack publicly.

## Vercel deployment

1. Provision hosted PostgreSQL, Cloudinary, Google Vision, and Upstash Redis.
2. Import the repository into Vercel and set all production environment variables.
3. Deploy. The build runs `prisma generate`; apply committed migrations to the production database with `npm run db:deploy` as a deployment step before directing traffic to a schema-incompatible release.
4. Confirm the application origin uses HTTPS and the Cloudinary upload folder has the expected access and retention policy.

The default Vercel region is Mumbai (`bom1`); change `vercel.json` if your database is hosted elsewhere.
