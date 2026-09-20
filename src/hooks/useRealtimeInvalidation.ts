import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeInvalidationOptions {
  table: string;
  filter?: string;
  queryKeys: string[][];
  enabled?: boolean;
}

export function useRealtimeInvalidation({
  table,
  filter,
  queryKeys,
  enabled = true,
}: UseRealtimeInvalidationOptions) {
  const queryClient = useQueryClient();
  const queryKeysRef = useRef(queryKeys);
  queryKeysRef.current = queryKeys;

  useEffect(() => {
    if (!enabled) return;

    const channelName = filter ? `${table}:${filter}` : table;

    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        () => {
          queryKeysRef.current.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, enabled, queryClient]);
}
