import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DeliveryFeeConfig {
  // Base fee structure
  baseFee: number;           // Base delivery fee (₹)
  freeDeliveryThreshold: number; // Free delivery above this subtotal (₹)
  platformFee: number;       // Platform/handling fee (₹)

  // Surge pricing
  surgeEnabled: boolean;
  surgeMultiplier: number;   // e.g. 1.5 = 50% extra
  surgeLabel: string;        // e.g. "High demand" or "Rain surge"

  // Rain/weather surge
  rainSurgeEnabled: boolean;
  rainSurgeMultiplier: number;

  // Peak hours surge
  peakHoursEnabled: boolean;
  peakHoursMultiplier: number;
  peakHoursStart: string;    // "11:00"
  peakHoursEnd: string;      // "14:00"

  // Small order fee
  smallOrderFeeEnabled: boolean;
  smallOrderThreshold: number;
  smallOrderFee: number;

  // GST on service charges (Zepto/Blinkit model — applies to delivery +
  // platform + small order fee, NOT to product subtotal). Default 18.
  gstPercent: number;
}

const DEFAULT_CONFIG: DeliveryFeeConfig = {
  baseFee: 29,
  freeDeliveryThreshold: 199,
  platformFee: 5,
  surgeEnabled: false,
  surgeMultiplier: 1.5,
  surgeLabel: 'High demand',
  rainSurgeEnabled: false,
  rainSurgeMultiplier: 1.3,
  peakHoursEnabled: false,
  peakHoursMultiplier: 1.2,
  peakHoursStart: '12:00',
  peakHoursEnd: '14:00',
  smallOrderFeeEnabled: false,
  smallOrderThreshold: 99,
  smallOrderFee: 10,
  gstPercent: 18,
};

export function useDeliveryFeeConfig() {
  return useQuery({
    queryKey: ['app-settings', 'delivery_fee_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings' as any)
        .select('value')
        .eq('key', 'delivery_fee_config')
        .maybeSingle();

      if (error) throw error;

      if ((data as any)?.value) {
        try {
          const parsed = JSON.parse((data as any).value);
          return { ...DEFAULT_CONFIG, ...parsed } as DeliveryFeeConfig;
        } catch {
          return DEFAULT_CONFIG;
        }
      }
      return DEFAULT_CONFIG;
    },
    staleTime: 60000,
  });
}

/**
 * Calculate delivery fee using the config from DB.
 * Can be called with or without distance.
 */
export function computeDeliveryFee(
  config: DeliveryFeeConfig,
  subtotal: number,
): { deliveryFee: number; platformFee: number; surgeApplied: boolean; surgeLabel: string; smallOrderFee: number } {
  // Free delivery check
  if (subtotal >= config.freeDeliveryThreshold) {
    return {
      deliveryFee: 0,
      platformFee: config.platformFee,
      surgeApplied: false,
      surgeLabel: '',
      smallOrderFee: 0,
    };
  }

  let fee = config.baseFee;

  // Surge multiplier
  let surgeApplied = false;
  let surgeLabel = '';
  let surgeMultiplier = 1;

  if (config.surgeEnabled) {
    surgeMultiplier = config.surgeMultiplier;
    surgeApplied = true;
    surgeLabel = config.surgeLabel;
  }

  if (config.rainSurgeEnabled) {
    surgeMultiplier = Math.max(surgeMultiplier, config.rainSurgeMultiplier);
    surgeApplied = true;
    surgeLabel = surgeLabel || 'Weather surge';
  }

  if (config.peakHoursEnabled) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = config.peakHoursStart.split(':').map(Number);
    const [endH, endM] = config.peakHoursEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      surgeMultiplier = Math.max(surgeMultiplier, config.peakHoursMultiplier);
      surgeApplied = true;
      surgeLabel = surgeLabel || 'Peak hours';
    }
  }

  if (surgeApplied) {
    fee = Math.round(fee * surgeMultiplier);
  }

  // Small order fee
  let smallOrderFee = 0;
  if (config.smallOrderFeeEnabled && subtotal < config.smallOrderThreshold) {
    smallOrderFee = config.smallOrderFee;
  }

  return {
    deliveryFee: fee,
    platformFee: config.platformFee,
    surgeApplied,
    surgeLabel,
    smallOrderFee,
  };
}
