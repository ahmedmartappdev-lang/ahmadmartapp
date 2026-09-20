-- Products slug auto-suffix.
--
-- products.slug has a GLOBAL UNIQUE constraint. ProductForm derives the slug
-- purely from name on the client, so two vendors picking the same product
-- name (e.g. both "Bananas") collide and the second INSERT fails with
-- "duplicate key value violates unique constraint products_slug_key".
--
-- We cannot drop the global UNIQUE — the customer route `/product/:slug`
-- looks products up via `.maybeSingle()` which assumes one row per slug.
--
-- Instead: a BEFORE INSERT OR UPDATE OF slug trigger that auto-suffixes
-- (`-2`, `-3`, …) until the slug is globally unique. Fires for every write
-- path (ProductForm, AdminBulkUpload, any future RPC).

CREATE OR REPLACE FUNCTION public.products_ensure_unique_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base    TEXT := NEW.slug;
  v_attempt INT  := 1;
BEGIN
  IF v_base IS NULL OR length(btrim(v_base)) = 0 THEN
    RAISE EXCEPTION 'product slug cannot be empty';
  END IF;

  WHILE EXISTS (
    SELECT 1 FROM public.products
     WHERE slug = NEW.slug
       AND id IS DISTINCT FROM NEW.id
  ) LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 200 THEN
      RAISE EXCEPTION 'could not find unique slug for "%" (gave up after % attempts)', v_base, v_attempt;
    END IF;
    NEW.slug := v_base || '-' || v_attempt::text;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_ensure_unique_slug_trg ON public.products;
CREATE TRIGGER products_ensure_unique_slug_trg
  BEFORE INSERT OR UPDATE OF slug ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_ensure_unique_slug();
