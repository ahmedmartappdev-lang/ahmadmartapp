import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type DeliveryAssignmentMode = 'auto' | 'manual';

export function useDeliveryAssignmentMode() {
  const queryClient = useQueryClient();

  const { data: mode, isLoading, isError } = useQuery({
    queryKey: ['app-settings', 'delivery_assignment_mode'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings' as any)
        .select('value')
        .eq('key', 'delivery_assignment_mode')
        .single();

      if (error) {
        console.error('Failed to fetch delivery assignment mode:', error);
        // Throw so React Query retries — do NOT silently default to 'auto'
        throw error;
      }

      return ((data as any)?.value as DeliveryAssignmentMode) || 'manual';
    },
    staleTime: 30000,
    retry: 3,
  });

  const updateModeMutation = useMutation({
    mutationFn: async (newMode: DeliveryAssignmentMode) => {
      const { error } = await supabase
        .from('app_settings' as any)
        .update({
          value: newMode,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('key', 'delivery_assignment_mode');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings', 'delivery_assignment_mode'] });
    },
  });

  // Ready only when we have a successful response — errors and loading are NOT ready
  const resolved = !isLoading && !isError && mode !== undefined;

  return {
    mode: mode ?? null,
    isAutoMode: resolved ? mode === 'auto' : false,
    // If we can't determine the mode, default to manual (safer — blocks self-assign)
    isManualMode: resolved ? mode === 'manual' : !isLoading,
    isLoading,
    isError,
    isReady: resolved,
    updateMode: updateModeMutation.mutate,
    isUpdating: updateModeMutation.isPending,
  };
}
