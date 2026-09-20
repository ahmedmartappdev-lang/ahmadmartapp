-- Reviews: add vendor_id column + auto-aggregation trigger.
--
-- Why: customers can now leave a review for the vendor (store) AND the
-- delivery partner, but the reviews table had no vendor_id column (only
-- product_id + delivery_partner_id), so vendor reviews had nowhere to
-- attach. Also, nothing was recomputing vendors.rating /
-- delivery_partners.rating from the reviews table — partner ratings
-- stayed at 0.0 even when reviews existed.
--
-- After this migration:
--   * `reviews.vendor_id` exists and references vendors(id).
--   * INSERT/UPDATE/DELETE on reviews triggers a recompute of the
--     affected vendor's and/or delivery partner's average rating.
--   * Existing review rows are backfilled into the rating columns.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_vendor_id ON public.reviews(vendor_id);

CREATE OR REPLACE FUNCTION public.recompute_entity_ratings_from_reviews()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id UUID;
  v_partner_id UUID;
BEGIN
  -- Pick up affected ids from both NEW (insert/update) and OLD (update/delete).
  v_vendor_id := COALESCE(NEW.vendor_id, OLD.vendor_id);
  v_partner_id := COALESCE(NEW.delivery_partner_id, OLD.delivery_partner_id);

  IF v_vendor_id IS NOT NULL THEN
    UPDATE public.vendors
       SET rating = COALESCE(
             (SELECT ROUND(AVG(rating)::numeric, 2)
                FROM public.reviews
               WHERE vendor_id = v_vendor_id),
             0)
     WHERE id = v_vendor_id;
  END IF;

  IF v_partner_id IS NOT NULL THEN
    UPDATE public.delivery_partners
       SET rating = COALESCE(
             (SELECT ROUND(AVG(rating)::numeric, 2)
                FROM public.reviews
               WHERE delivery_partner_id = v_partner_id),
             0)
     WHERE id = v_partner_id;
  END IF;

  -- If vendor_id was changed on an UPDATE, also recompute the OLD vendor.
  IF TG_OP = 'UPDATE' AND OLD.vendor_id IS DISTINCT FROM NEW.vendor_id AND OLD.vendor_id IS NOT NULL THEN
    UPDATE public.vendors
       SET rating = COALESCE(
             (SELECT ROUND(AVG(rating)::numeric, 2)
                FROM public.reviews
               WHERE vendor_id = OLD.vendor_id),
             0)
     WHERE id = OLD.vendor_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.delivery_partner_id IS DISTINCT FROM NEW.delivery_partner_id AND OLD.delivery_partner_id IS NOT NULL THEN
    UPDATE public.delivery_partners
       SET rating = COALESCE(
             (SELECT ROUND(AVG(rating)::numeric, 2)
                FROM public.reviews
               WHERE delivery_partner_id = OLD.delivery_partner_id),
             0)
     WHERE id = OLD.delivery_partner_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_recompute_ratings ON public.reviews;
CREATE TRIGGER trg_reviews_recompute_ratings
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.recompute_entity_ratings_from_reviews();

-- Backfill: recompute ratings for every entity currently referenced in reviews.
UPDATE public.vendors v
   SET rating = COALESCE(
         (SELECT ROUND(AVG(r.rating)::numeric, 2)
            FROM public.reviews r
           WHERE r.vendor_id = v.id),
         v.rating)
 WHERE v.id IN (SELECT DISTINCT vendor_id FROM public.reviews WHERE vendor_id IS NOT NULL);

UPDATE public.delivery_partners dp
   SET rating = COALESCE(
         (SELECT ROUND(AVG(r.rating)::numeric, 2)
            FROM public.reviews r
           WHERE r.delivery_partner_id = dp.id),
         dp.rating)
 WHERE dp.id IN (SELECT DISTINCT delivery_partner_id FROM public.reviews WHERE delivery_partner_id IS NOT NULL);
