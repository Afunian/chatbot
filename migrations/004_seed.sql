-- 004_seed.sql
BEGIN;

-- Seed sources with just a "name" if available, else skip
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sources' AND column_name='name'
  ) THEN
    INSERT INTO public.sources (name)
    VALUES ('demo-source-a'), ('demo-source-b')
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'Skipping seed for sources (no "name" column).';
  END IF;
END$$;

-- If chunks(source_id, content) exist, seed a couple of rows linked to some source
DO $$
DECLARE
  sid bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chunks' AND column_name='source_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chunks' AND column_name='content'
  ) THEN
    SELECT id INTO sid FROM public.sources ORDER BY id LIMIT 1;
    IF sid IS NOT NULL THEN
      INSERT INTO public.chunks (source_id, content)
      VALUES (sid, 'hello world'), (sid, 'lorem ipsum')
      ON CONFLICT DO NOTHING;
    ELSE
      RAISE NOTICE 'Skipping chunk seed: no sources found.';
    END IF;
  ELSE
    RAISE NOTICE 'Skipping chunk seed: required columns missing.';
  END IF;
END$$;

COMMIT;