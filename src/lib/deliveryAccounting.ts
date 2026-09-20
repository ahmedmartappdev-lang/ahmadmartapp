import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DeliveryPartnerNetToTransfer {
  cashCollected: number;
  approvedBills: number;
  verifiedCollections: number;
  approvedCashReturns: number;
  recordedSettlements: number;
  netToTransfer: number;
}

const EMPTY: DeliveryPartnerNetToTransfer = {
  cashCollected: 0,
  approvedBills: 0,
  verifiedCollections: 0,
  approvedCashReturns: 0,
  recordedSettlements: 0,
  netToTransfer: 0,
};

const sumNumeric = (rows: any[] | null | undefined, key = 'amount'): number =>
  (rows || []).reduce((acc, r) => acc + Number(r?.[key] || 0), 0);

/**
 * Compute the "net to transfer" for a single delivery partner.
 *
 *   netToTransfer =
 *       cashCollected (delivered COD orders)
 *     − approvedBills (delivery_bills.status = 'approved')
 *     + verifiedCollections (credit_cash_collections.status = 'verified')
 *     − approvedCashReturns (cash_returns.status = 'approved')
 *     − recordedSettlements (cash_settlements rows for this partner)
 *
 * Matches the per-partner aggregation done in AdminCashFlow.tsx (lines
 * ~145-173). Each sub-query degrades to [] if the corresponding table is
 * missing, so a single bad migration never breaks the detail panel.
 */
export function useDeliveryPartnerNetToTransfer(partnerId: string | null) {
  return useQuery<DeliveryPartnerNetToTransfer>({
    queryKey: ['delivery-partner-net-to-transfer', partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      if (!partnerId) return EMPTY;

      const [ordersRes, billsRes, collectionsRes, returnsRes, settlementsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('total_amount')
          .eq('delivery_partner_id', partnerId)
          .eq('payment_method', 'cash')
          .eq('status', 'delivered' as any),
        supabase
          .from('delivery_bills')
          .select('amount, status')
          .eq('delivery_partner_id', partnerId)
          .eq('status', 'approved'),
        (supabase.from('credit_cash_collections') as any)
          .select('amount, status')
          .eq('delivery_partner_id', partnerId)
          .eq('status', 'verified'),
        (supabase.from('cash_returns') as any)
          .select('amount, status')
          .eq('delivery_partner_id', partnerId)
          .eq('status', 'approved'),
        (supabase.from('cash_settlements') as any)
          .select('amount')
          .eq('delivery_partner_id', partnerId),
      ]);

      if (ordersRes.error) console.warn('[net-to-transfer] orders fetch failed', ordersRes.error);
      if (billsRes.error) console.warn('[net-to-transfer] bills fetch failed', billsRes.error);
      if (collectionsRes.error) console.warn('[net-to-transfer] collections fetch failed', collectionsRes.error);
      if (returnsRes.error) console.warn('[net-to-transfer] returns fetch failed', returnsRes.error);
      if (settlementsRes.error) console.warn('[net-to-transfer] settlements fetch failed', settlementsRes.error);

      const cashCollected = sumNumeric(ordersRes.data as any[], 'total_amount');
      const approvedBills = sumNumeric(billsRes.data as any[]);
      const verifiedCollections = sumNumeric(collectionsRes.data as any[]);
      const approvedCashReturns = sumNumeric(returnsRes.data as any[]);
      const recordedSettlements = sumNumeric(settlementsRes.data as any[]);

      const netToTransfer =
        cashCollected - approvedBills + verifiedCollections - approvedCashReturns - recordedSettlements;

      return {
        cashCollected,
        approvedBills,
        verifiedCollections,
        approvedCashReturns,
        recordedSettlements,
        netToTransfer,
      };
    },
  });
}
