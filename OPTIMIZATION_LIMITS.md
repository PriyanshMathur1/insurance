# Optimization Limits

This document outlines the specific areas of the Priyansh Insurance AI Agent repository that **cannot or should not be optimized further** (e.g., for speed or stochastic variability), in order to preserve correctness, safety, and regulatory compliance.

## 1. Deterministic Calculators (`src/lib/calculators.ts`)
The logic determining suggested coverage limits (e.g., `calculateHealthCover`, `calculateTermCover`) uses strict, predefined mathematical formulas and risk flag generation based on exact inputs (age, income, city tier, dependents).
- **Why it can't be optimized:** We cannot replace these straightforward, predictable calculations with a faster or more generalized LLM call. Financial advice must remain deterministic. A stochastic model might invent premiums or miscalculate coverage, which violates our core compliance guardrails.

## 2. External LLM and Embedding Calls
Files: `src/lib/openai.ts`, `src/lib/groq.ts`, `src/lib/advisor.ts`
The application relies heavily on third-party APIs (OpenAI and Groq) for text generation, embeddings, and RAG capabilities.
- **Why it can't be optimized:** The latency associated with network calls and external API processing times cannot be optimized at the codebase level. Any attempts to heavily cache or bypass these calls for dynamic queries could result in inaccurate, outdated, or hallucinated advice.

## 3. Strict Compliance and Safety Guardrails
Files: `src/lib/compliance.ts`, `src/lib/quality.ts`, `src/lib/classifier.ts`
The system implements strict checks on incoming user queries and outgoing AI responses. For example:
- Filtering out non-insurance queries (e.g. "Who is Vaibhav?", "mutual fund advice").
- Checking responses for "unsafe guarantee language" (e.g., "guaranteed claim approval").
- Ensuring responses mention a licensed advisor review.
- Ensuring references to necessary waiting periods or medical disclosures.
- **Why it can't be optimized:** These guardrails use regex matching, word lists, and explicit condition checks. While they might seem slightly redundant or rigid compared to a pure LLM evaluation, they represent hard constraints that cannot be relaxed for the sake of "performance." They must execute reliably on every turn to ensure user safety.

## 4. Prisma and Postgres Vector Search (`src/lib/rag.ts`)
The vector similarity search is performed via `pgvector` directly through raw SQL.
- **Why it can't be optimized (safely):** While indexing can be added, attempting to trade off vector search exactness (e.g., through severe dimensionality reduction or overly aggressive approximate nearest neighbors limits without testing) risks missing critical policy wording and condition details that are required for factual response generation.