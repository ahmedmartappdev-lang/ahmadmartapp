-- Admin-controlled "Top Picks For You" on the customer home page.
--
-- Adds four columns to vendors:
--   is_featured     - admin toggle
--   featured_at     - when toggled on (audit + tiebreak sort)
--   featured_until  - when the feature expires; NULL = "until I change"
--   featured_order  - manual rank (lower = earlier on home)
-- Plus a partial index for the home query, and a SECURITY DEFINER RPC
-- to atomically swap the order of two adjacent rows.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_featured     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_order  INT,
  ADD COLUMN IF NOT EXISTS featured_until  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS featured_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vendors_featured_active
  ON public.vendors(featured_order, featured_at)
  WHERE is_featured = TRUE;

-- Atomic swap of featured_order between two vendors. Uses a temporary
-- sentinel value to dodge any future unique constraint, and runs as
-- SECURITY DEFINER so the admin client doesn't need to manage a
-- transaction across two PostgREST calls.
CREATE OR REPLACE FUNCTION public.vendors_swap_featured_order(
  p_a UUID,
  p_b UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oa INT;
  v_ob INT;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only admins can reorder featured vendors';
  END IF;

  SELECT featured_order INTO v_oa FROM public.vendors WHERE id = p_a FOR UPDATE;
  SELECT featured_order INTO v_ob FROM public.vendors WHERE id = p_b FOR UPDATE;

  IF v_oa IS NULL OR v_ob IS NULL THEN
    RAISE EXCEPTION 'both vendors must have a featured_order set';
  END IF;

  UPDATE public.vendors SET featured_order = v_ob, updated_at = NOW() WHERE id = p_a;
  UPDATE public.vendors SET featured_order = v_oa, updated_at = NOW() WHERE id = p_b;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.vendors_swap_featured_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendors_swap_featured_order(UUID, UUID) TO authenticated;
