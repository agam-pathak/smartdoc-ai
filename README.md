# Lexora AI

Lexora AI is a Next.js 16 document intelligence workspace built around a retrieval-augmented generation pipeline for PDFs.

## Stack

- Next.js 16 App Router
- React 19 + TypeScript
- Tailwind CSS
- `react-pdf` for document viewing
- `pdf-parse` for PDF text extraction
- Groq embeddings when available, with local hashed embedding fallback
- Groq chat completions with `llama-3.1-8b-instant`
- Supabase-backed users, document metadata, and conversations when configured
- Local filesystem vector index stored under `.lexora/`
- Signed httpOnly sessions, with user persistence optionally backed by Supabase
- Per-user document and conversation workspaces

## Architecture

1. Upload a PDF through `/api/upload`
2. Save the file to the user's private workspace under `.lexora/users/<userId>/uploads/`
3. Parse PDF text
4. Split the text into 1000-character chunks with 200-character overlap
5. Generate embeddings for each chunk
6. Persist chunk vectors in a local index and document metadata in Supabase when configured
7. Embed user questions
8. Retrieve the top matching chunks
9. Build grounded context for the LLM
10. Return the Groq answer to the chat UI

## Environment

Create `.env.local` from `.env.example` and set:

```bash
GROQ_API_KEY=your_groq_api_key
GROQ_CHAT_MODEL=llama-3.1-8b-instant
GROQ_EMBEDDING_MODEL=nomic-embed-text-v1_5
LEXORA_EMBEDDINGS_PROVIDER=auto
LEXORA_AUTH_SECRET=change-this-to-a-long-random-secret
NEXT_PUBLIC_SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

If you want Supabase persistence, run the SQL in `supabase/schema.sql` in your Supabase project first.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Routes

- `/upload` uploads and indexes new PDFs
- `/chat` opens the two-panel document viewer and chat workspace
- `/auth` handles sign in, sign up, forgot password, and reset
- `/api/upload` handles secure PDF upload and indexing
- `/api/files` returns indexed documents
- `/api/files/serve` streams protected PDFs from private storage
- `/api/index` rebuilds the vector index
- `/api/chat` performs retrieval-augmented question answering
- `/api/auth/*` handles password auth, session, and reset flows

## Notes

- Uploaded PDFs are validated for type and size.
- Indexed vectors and saved threads are stored per user under `.lexora/users/<userId>/`.
- When Supabase is configured, users, document manifests, notes/bookmarks, and conversations are stored in Postgres.
- Uploaded PDFs are stored outside the public web root and served through an authenticated route.
- If your Groq account does not expose embeddings, Lexora AI automatically falls back to `local-hash-v1` for indexing and retrieval.
- The chat prompt is grounded strictly to retrieved document context.
- Localhost password reset returns a preview recovery link because no mail provider is configured in this project.
- This migration stage does not move PDF binaries or chunk vectors to Supabase yet; those still live under `.lexora/`.
