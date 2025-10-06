-- 003_indexes.sql
BEGIN;

-- Speed lookups by FK on chunks.source_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chunks' AND column_name='source_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_chunks_source_id ON public.chunks(source_id);
  ELSE
    RAISE NOTICE 'Skipping idx_chunks_source_id (column missing)';
  END IF;
END$$;

-- If chunks has created_at, index it (for recency queries)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chunks' AND column_name='created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON public.chunks(created_at);
  END IF;
END$$;

-- If chunks has content (text), add a trigram index (requires pg_trgm)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chunks' AND column_name='content'
      AND data_type IN ('text','character varying')
  ) THEN
    -- Enable pg_trgm in Supabase (extensions schema)
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
    CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
      ON public.chunks
      USING GIN (content gin_trgm_ops);
  END IF;
END$$;

-- Source events: index by source_id and created_at if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='source_events' AND column_name='source_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_source_events_source_id ON public.source_events(source_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='source_events' AND column_name='created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_source_events_created_at ON public.source_events(created_at);
  END IF;
END$$;

-- If sources has a natural key column, index it (checks common names)
DO $$
DECLARE
  candidate text;
BEGIN
  FOR candidate IN SELECT unnest(ARRAY['external_id','uri','url','path','checksum','name'])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sources' AND column_name=candidate
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_sources_%I ON public.sources(%I);', candidate, candidate);
    END IF;
  END LOOP;
END$$;

COMMIT;
