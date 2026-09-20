import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export function useCustomerCredits() {
  const { user } = useAuthStore();

  const { data: creditData, isLoading: balanceLoading } = useQuery({
    queryKey: ['customer-credit-balance', user?.id],
    queryFn: async () => {
      if (!user?.id) return { creditLimit: 0, dueAmount: 0 };
      const { data } = await supabase
        .from('profiles')
        .select('credit_balance, credit_limit')
        .eq('user_id', user.id)
        .single();
      const dueAmount = Number((data as any)?.credit_balance || 0);
      const creditLimit = Number((data as any)?.credit_limit || 0);
      return { creditLimit, dueAmount };
    },
    enabled: !!user?.id,
  });

  const creditLimit = creditData?.creditLimit ?? 0;
  const dueAmount = creditData?.dueAmount ?? 0;
  const availableCredit = Math.max(0, creditLimit - dueAmount);
  // Keep backward compat: creditBalance = availableCredit
  const creditBalance = availableCredit;

  const { data: creditHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['customer-credit-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await (supabase
        .from('customer_credit_transactions') as any)
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  return {
    creditBalance,
    creditLimit,
    dueAmount,
    availableCredit,
    creditHistory,
    isLoading: balanceLoading || historyLoading,
  };
}
