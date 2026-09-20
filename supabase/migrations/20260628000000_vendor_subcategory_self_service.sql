-- Vendor-side subcategory self-service.
--
-- Vendors can create a new subcategory under their assigned root category
-- (vendors.category_id). The new category row is global — visible to every
-- other vendor in the same root and to admins.
--
-- All writes go through a SECURITY DEFINER RPC; the existing admin-only
-- RLS on `categories` is left untouched. Same pattern as admin_create_vendor.

-- ---------------------------------------------------------------------------
-- 1. Partial unique index: two siblings under the same parent can't share a
-- slug. Existing global UNIQUE(slug) stays; the RPC auto-suffixes on global
-- collisions across different parents.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS categories_parent_slug_uniq
  ON public.categories(parent_id, slug)
  WHERE parent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. RPC: vendor_create_subcategory(p_name)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_create_subcategory(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id   UUID;
  v_root        UUID;
  v_name        TEXT;
  v_base_slug   TEXT;
  v_slug        TEXT;
  v_existing_id UUID;
  v_new_id      UUID;
  v_attempt     INT := 1;
BEGIN
  -- (a) Resolve the caller's vendor row.
  SELECT id, category_id INTO v_vendor_id, v_root
    FROM public.vendors
   WHERE user_id = auth.uid();

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'vendor_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_root IS NULL THEN
    RAISE EXCEPTION 'vendor_no_root_category' USING ERRCODE = 'P0001';
  END IF;

  -- (b) Validate the name.
  v_name := btrim(COALESCE(p_name, ''));
  v_name := regexp_replace(v_name, '\s+', ' ', 'g');
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required' USING ERRCODE = 'P0001';
  END IF;
  IF length(v_name) > 64 THEN
    RAISE EXCEPTION 'name_too_long' USING ERRCODE = 'P0001';
  END IF;

  -- (c) Generate the base slug from the name.
  v_base_slug := lower(v_name);
  v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
  v_base_slug := regexp_replace(v_base_slug, '^-+|-+$', '', 'g');
  IF length(v_base_slug) = 0 THEN
    RAISE EXCEPTION 'name_invalid' USING ERRCODE = 'P0001';
  END IF;

  -- (d) Idempotency — same (parent, slug) already exists: attach + return.
  SELECT id INTO v_existing_id
    FROM public.categories
   WHERE parent_id = v_root AND slug = v_base_slug
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.vendors
       SET subcategory_ids = (
         SELECT array_agg(DISTINCT x ORDER BY x)
           FROM unnest(subcategory_ids || v_existing_id) AS x
          WHERE x IS NOT NULL
       )
     WHERE id = v_vendor_id;

    RETURN jsonb_build_object(
      'id',        v_existing_id,
      'name',      v_name,
      'slug',      v_base_slug,
      'parent_id', v_root,
      'created',   FALSE
    );
  END IF;

  -- (e) Global slug collision (different parent): suffix until unique.
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.categories WHERE slug = v_slug) LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 50 THEN
      RAISE EXCEPTION 'slug_collision' USING ERRCODE = 'P0001';
    END IF;
    v_slug := v_base_slug || '-' || v_attempt::text;
  END LOOP;

  -- (f) Insert the new subcategory.
  INSERT INTO public.categories (name, slug, parent_id, is_active, display_order)
    VALUES (v_name, v_slug, v_root, TRUE, 0)
    RETURNING id INTO v_new_id;

  -- (g) Auto-attach to the calling vendor's store.
  UPDATE public.vendors
     SET subcategory_ids = (
       SELECT array_agg(DISTINCT x ORDER BY x)
         FROM unnest(subcategory_ids || v_new_id) AS x
        WHERE x IS NOT NULL
     )
   WHERE id = v_vendor_id;

  RETURN jsonb_build_object(
    'id',        v_new_id,
    'name',      v_name,
    'slug',      v_slug,
    'parent_id', v_root,
    'created',   TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_create_subcategory(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_create_subcategory(TEXT) TO authenticated;
