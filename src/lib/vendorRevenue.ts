// Shared vendor-earning formula. Mirrors the server-side
// accrue_vendor_earnings RPC: vendor earns the full
// vendor_selling_price × quantity (NO commission applied).
//
// Falls back to unit_price for legacy order_items rows that pre-date the
// vendor_selling_price snapshot field.

export type OrderItemLike = {
  product_snapshot?: { vendor_selling_price?: number | string | null } | null;
  unit_price?: number | string | null;
  quantity?: number | string | null;
};

/**
 * Earning for a single order (sum of its items).
 * Accepts either an `order` object (with `order_items`) or a raw items
 * array — both shapes show up across the vendor pages.
 */
export function vendorEarning(input: { order_items?: OrderItemLike[] } | OrderItemLike[] | null | undefined): number {
  if (!input) return 0;
  const items: OrderItemLike[] = Array.isArray(input) ? input : (input.order_items || []);
  return items.reduce((sum, it) => {
    const snap = it?.product_snapshot || {};
    const vp = Number(snap.vendor_selling_price);
    const eff = Number.isFinite(vp) && vp > 0 ? vp : Number(it?.unit_price) || 0;
    return sum + eff * Number(it?.quantity || 0);
  }, 0);
}
