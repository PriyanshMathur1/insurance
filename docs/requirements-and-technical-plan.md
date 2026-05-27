# Priyansh Insurance: Requirements and Technical Plan

## Goal
Build a production-ready, chat-first AI insurance advisor for Indian health insurance and term life insurance, with authenticated users, saved conversations, RAG over scraped data, deterministic calculators, compliance guardrails, human handoff, and an internal advisor dashboard.

## Scope
- Email/password authentication for MVP.
- Root redirects to `/login` or `/chat`.
- Chat dashboard with saved chats, searchable sidebar, markdown answers, citations, profile summary, next questions, and handoff status.
- Advisor logic only for health insurance and term life insurance.
- PostgreSQL with Prisma and pgvector for structured records, documents, chunks, embeddings, conversations, recommendations, compliance checks, and handoffs.
- Ingestion pipeline for Markdown, TXT, CSV, and JSON under `/data/raw`.
- Admin dashboard for chats, handoffs, products, source documents, compliance checks, and ingestion logs.

## Explicit Non-Goals
- No landing page, marketing site, blog, checkout, payment, motor insurance, travel insurance, ULIPs, investment advice, or generic finance advice.

## Architecture
- Next.js App Router provides UI and API routes.
- Prisma owns relational models.
- pgvector stores document chunk embeddings.
- OpenAI is used for embeddings and answer drafting when an API key is present.
- Deterministic TypeScript modules classify queries, calculate cover ranges, extract lightweight profile fields, find products, check compliance, and decide handoff.
- The chat route persists user messages, retrieves RAG context, generates or falls back to a deterministic advisor answer, validates compliance, persists assistant messages, stores recommendations, and opens handoffs where required.

## Verification
- `npm run lint`
- `npm test`
- `npm run build`
- Local run path: `npm install`, configure `.env`, `npx prisma migrate dev`, `npm run db:seed`, `npm run ingest`, `npm run dev`.
