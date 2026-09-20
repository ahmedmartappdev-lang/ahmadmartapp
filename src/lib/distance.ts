/**
 * Calculate the distance between two points using the Haversine formula.
 * @returns Distance in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate tiered delivery fee based on distance.
 * @deprecated Use computeDeliveryFee from useDeliveryFeeConfig instead for dynamic config.
 * This is kept as a fallback only.
 */
export function calculateDeliveryFee(
  distanceKm: number,
  subtotal: number
): number {
  if (subtotal >= 199) return 0;
  if (distanceKm <= 2) return 19;
  if (distanceKm <= 5) return 29;
  if (distanceKm <= 10) return 49;
  return 69;
}
