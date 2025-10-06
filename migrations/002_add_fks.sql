-- 002_add_fks.sql
BEGIN;

-- FK: chunks.source_id → sources.id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chunks' AND column_name='source_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sources' AND column_name='id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid='public.chunks'::regclass
        AND confrelid='public.sources'::regclass
        AND contype='f'
    ) THEN
      ALTER TABLE public.chunks
        ADD CONSTRAINT chunks_source_id_fkey
        FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;
    END IF;
  ELSE
    RAISE NOTICE 'Skipping FK chunks.source_id → sources.id (missing table/column)';
  END IF;
END$$;

-- FK: source_events.source_id → sources.id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='source_events' AND column_name='source_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sources' AND column_name='id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid='public.source_events'::regclass
        AND confrelid='public.sources'::regclass
        AND contype='f'
    ) THEN
      ALTER TABLE public.source_events
        ADD CONSTRAINT source_events_source_id_fkey
        FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;
    END IF;
  ELSE
    RAISE NOTICE 'Skipping FK source_events.source_id → sources.id (missing table/column)';
  END IF;
END$$;

COMMIT;