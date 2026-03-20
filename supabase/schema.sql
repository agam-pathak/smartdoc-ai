create table if not exists public.lexora_users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_login_at timestamptz,
  reset_token_hash text,
  reset_token_expires_at timestamptz
);

create index if not exists lexora_users_email_idx
  on public.lexora_users (email);

create table if not exists public.lexora_documents (
  id text primary key,
  user_id text not null,
  name text not null,
  file_name text not null,
  file_url text not null,
  size_bytes bigint not null,
  page_count integer not null,
  chunk_count integer not null,
  indexed_at timestamptz not null,
  embedding_model text not null,
  extraction_mode text,
  notes text,
  bookmarked_pages jsonb not null default '[]'::jsonb,
  last_opened_at timestamptz
);

create index if not exists lexora_documents_user_idx
  on public.lexora_documents (user_id, indexed_at desc);

create table if not exists public.lexora_conversations (
  id text primary key,
  user_id text not null,
  document_id text not null,
  title text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  pinned boolean not null default false
);

create index if not exists lexora_conversations_user_scope_idx
  on public.lexora_conversations (user_id, document_id, pinned desc, updated_at desc);

create table if not exists public.lexora_messages (
  id text primary key,
  conversation_id text not null references public.lexora_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  created_at timestamptz not null,
  sources jsonb
);

create index if not exists lexora_messages_conversation_idx
  on public.lexora_messages (conversation_id, created_at asc);
