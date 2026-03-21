create extension if not exists pgcrypto
with
  schema extensions;

create or replace function public.lexora_request_user_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'user_id', ''),
    nullif(auth.jwt() ->> 'sub', '')
  );
$$;

create table if not exists public.user_mock_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null references public.lexora_users(id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) > 0),
  total_score numeric(8, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_mock_sessions_user_created_idx
  on public.user_mock_sessions (user_id, created_at desc);

create index if not exists user_mock_sessions_user_topic_idx
  on public.user_mock_sessions (user_id, topic);

create table if not exists public.user_question_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.user_mock_sessions(id) on delete cascade,
  question_id text not null check (char_length(btrim(question_id)) > 0),
  user_answer text,
  correct_answer text not null check (char_length(btrim(correct_answer)) > 0),
  time_taken_ms integer not null default 0 check (time_taken_ms >= 0),
  is_correct boolean not null,
  subject_tag text not null check (char_length(btrim(subject_tag)) > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_question_logs_session_idx
  on public.user_question_logs (session_id, created_at asc);

create index if not exists user_question_logs_subject_idx
  on public.user_question_logs (subject_tag, created_at desc);

create index if not exists user_question_logs_question_idx
  on public.user_question_logs (question_id);

create unique index if not exists user_question_logs_session_question_uidx
  on public.user_question_logs (session_id, question_id);

alter table public.user_mock_sessions enable row level security;
alter table public.user_mock_sessions force row level security;

alter table public.user_question_logs enable row level security;
alter table public.user_question_logs force row level security;

drop policy if exists "Users can read their own mock sessions" on public.user_mock_sessions;
create policy "Users can read their own mock sessions"
on public.user_mock_sessions
for select
using (public.lexora_request_user_id() = user_id);

drop policy if exists "Users can insert their own mock sessions" on public.user_mock_sessions;
create policy "Users can insert their own mock sessions"
on public.user_mock_sessions
for insert
with check (public.lexora_request_user_id() = user_id);

drop policy if exists "Users can update their own mock sessions" on public.user_mock_sessions;
create policy "Users can update their own mock sessions"
on public.user_mock_sessions
for update
using (public.lexora_request_user_id() = user_id)
with check (public.lexora_request_user_id() = user_id);

drop policy if exists "Users can delete their own mock sessions" on public.user_mock_sessions;
create policy "Users can delete their own mock sessions"
on public.user_mock_sessions
for delete
using (public.lexora_request_user_id() = user_id);

drop policy if exists "Users can read their own question logs" on public.user_question_logs;
create policy "Users can read their own question logs"
on public.user_question_logs
for select
using (
  exists (
    select 1
    from public.user_mock_sessions as session
    where session.id = user_question_logs.session_id
      and session.user_id = public.lexora_request_user_id()
  )
);

drop policy if exists "Users can insert their own question logs" on public.user_question_logs;
create policy "Users can insert their own question logs"
on public.user_question_logs
for insert
with check (
  exists (
    select 1
    from public.user_mock_sessions as session
    where session.id = user_question_logs.session_id
      and session.user_id = public.lexora_request_user_id()
  )
);

drop policy if exists "Users can update their own question logs" on public.user_question_logs;
create policy "Users can update their own question logs"
on public.user_question_logs
for update
using (
  exists (
    select 1
    from public.user_mock_sessions as session
    where session.id = user_question_logs.session_id
      and session.user_id = public.lexora_request_user_id()
  )
)
with check (
  exists (
    select 1
    from public.user_mock_sessions as session
    where session.id = user_question_logs.session_id
      and session.user_id = public.lexora_request_user_id()
  )
);

drop policy if exists "Users can delete their own question logs" on public.user_question_logs;
create policy "Users can delete their own question logs"
on public.user_question_logs
for delete
using (
  exists (
    select 1
    from public.user_mock_sessions as session
    where session.id = user_question_logs.session_id
      and session.user_id = public.lexora_request_user_id()
  )
);

grant select, insert, update, delete on public.user_mock_sessions to authenticated;
grant select, insert, update, delete on public.user_question_logs to authenticated;
