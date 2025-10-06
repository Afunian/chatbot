create extension if not exists vector;
create extension if not exists pgcrypto;

-- sources
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  url text unique not null,
  domain text not null,
  title text,
  publisher text,
  published_at timestamptz,
  last_reviewed_at timestamptz,
  content_hash text,
  raw_text text,
  content_type text check (content_type in ('html','pdf','doc','other')) default 'html',
  lang text default 'en-CA',
  robots_ok boolean default true,
  tos_ok boolean default true,
  last_crawled_at timestamptz,
  ingest_version int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_sources_domain_url on public.sources(domain, url);

-- chunks
create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete cascade,
  seq int not null,
  text text not null,
  char_start int,
  char_end int,
  embedding vector(1536),
  quality_flags jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_chunks_source_seq on public.chunks(source_id, seq);
create index if not exists idx_chunks_embed on public.chunks using ivfflat (embedding vector_cosine_ops) with (lists = 400);

-- source events
create table if not exists public.source_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete cascade,
  event text check (event in ('crawled','updated','unchanged','removed','blocked')),
  meta jsonb,
  at timestamptz default now()
);

-- helper view (optional): newest per domain
create or replace view public.v_sources_latest as
select s.*
from public.sources s
where s.updated_at = (
  select max(updated_at) from public.sources x where x.url = s.url
);
