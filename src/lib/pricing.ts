export function getEffectivePrice(product: { admin_selling_price?: number | null; selling_price: number }): number {
  return product.admin_selling_price != null ? product.admin_selling_price : product.selling_price;
}
