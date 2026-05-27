# Priyansh Insurance

Production-ready MVP for a chat-first AI insurance advisor focused only on Indian health insurance and term life insurance.

## Features
- Email/password signup and login.
- Root route redirects to `/login` or `/chat`.
- ChatGPT-style dashboard with saved chats, search, rename-ready title API, delete, markdown answers, source citation chips, profile summary, and handoff status.
- Health and term advisor logic with deterministic calculators.
- RAG ingestion/search over local Markdown, JSON, CSV, and TXT files.
- Structured health and term product database via Prisma.
- Compliance checker before final advice responses.
- Human handoff records for purchase intent, final selection, PED, senior citizen cover, claims disputes, incomplete product data, or low confidence.
- Protected admin/advisor dashboard for chats, handoffs, products, source documents, and ingestion logs.

## Stack
- Next.js App Router with TypeScript
- Tailwind CSS
- Next.js API routes
- PostgreSQL
- Prisma
- pgvector
- OpenAI chat and embeddings

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Create env:
   ```bash
   cp .env.example .env
   ```

3. Start PostgreSQL with pgvector and set `DATABASE_URL`.

4. Run database setup:
   ```bash
   npx prisma migrate dev
   npm run db:seed
   ```

5. Ingest scraped data:
   ```bash
   npm run ingest
   ```

   By default the app reads `/data/raw`. Override with:
   ```bash
   DATA_ROOT=/absolute/path/to/data/raw npm run ingest
   ```

   The importer also detects the processed Scrapegraph bundle directly:
   ```bash
   DATA_ROOT=/Users/priyansh/Desktop/Code/Scrapegraph-ai/data/processed npm run ingest
   ```

   Expected processed files:
   - `source_documents.json`
   - `document_chunks.json`
   - `insurers.json`
   - `health_products.json`
   - `term_products.json`
   - `cleaning_report.json`

   Large processed chunks are stored without embeddings by default to avoid accidental OpenAI usage. To generate pgvector embeddings during ingestion:
   ```bash
   EMBED_ON_INGEST=true DATA_ROOT=/Users/priyansh/Desktop/Code/Scrapegraph-ai/data/processed npm run ingest
   ```

6. Run locally:
   ```bash
   npm run dev
   ```

## Demo Accounts
- User: `demo@priyanshinsurance.local` / `password123`
- Admin: `advisor@priyanshinsurance.local` / `admin12345`

## Data Layout
The ingestion script expects:
```text
/data/raw/
  health/
  term/
  regulator/
  structured/
    health_products.json
    term_products.json
    insurers.json
```

If real scraped files are unavailable, `npm run db:seed` creates clearly labeled mock products, documents, and sample chats. Production answers rely on ingested documents and structured products when present.

## Verification
```bash
npm run db:generate
npm run lint
npm test
npm run build
```
