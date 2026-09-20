import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TimeSlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function useTimeSlots() {
  return useQuery({
    queryKey: ['time-slots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_slots' as any)
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TimeSlot[];
    },
  });
}

export function useProductTimeSlots(productId?: string) {
  return useQuery({
    queryKey: ['product-time-slots', productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from('product_time_slots' as any)
        .select('time_slot_id')
        .eq('product_id', productId);
      if (error) throw error;
      return ((data || []) as any[]).map((d: any) => d.time_slot_id as string);
    },
    enabled: !!productId,
  });
}

export function useCreateTimeSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slot: { name: string; start_time: string; end_time: string; display_order?: number; is_active?: boolean }) => {
      const { data, error } = await (supabase.from('time_slots' as any) as any).insert(slot).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time-slots'] }),
  });
}

export function useUpdateTimeSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TimeSlot> & { id: string }) => {
      const { data, error } = await (supabase.from('time_slots' as any) as any).update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time-slots'] }),
  });
}

export function useDeleteTimeSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('time_slots' as any) as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time-slots'] }),
  });
}

export function useSaveProductTimeSlots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, timeSlotIds }: { productId: string; timeSlotIds: string[] }) => {
      // Delete existing
      await (supabase.from('product_time_slots' as any) as any).delete().eq('product_id', productId);
      // Insert new
      if (timeSlotIds.length > 0) {
        const rows = timeSlotIds.map(tsId => ({ product_id: productId, time_slot_id: tsId }));
        const { error } = await (supabase.from('product_time_slots' as any) as any).insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-time-slots'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/** Check if current time (IST) falls within any of the given time slots */
export function isWithinTimeSlots(timeSlots: TimeSlot[], assignedSlotIds: string[]): boolean {
  if (!assignedSlotIds || assignedSlotIds.length === 0) return true; // No slots = always available
  
  const now = new Date();
  // Convert to IST
  const istOffset = 5.5 * 60; // IST is UTC+5:30
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = (utcMinutes + istOffset) % (24 * 60);
  
  const activeSlots = timeSlots.filter(s => s.is_active && assignedSlotIds.includes(s.id));
  
  return activeSlots.some(slot => {
    const [startH, startM] = slot.start_time.split(':').map(Number);
    const [endH, endM] = slot.end_time.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;
    
    if (endMin > startMin) {
      return istMinutes >= startMin && istMinutes < endMin;
    } else {
      // Crosses midnight
      return istMinutes >= startMin || istMinutes < endMin;
    }
  });
}

/** Get display text for assigned time slots */
export function getTimeSlotDisplayText(timeSlots: TimeSlot[], assignedSlotIds: string[]): string {
  if (!assignedSlotIds || assignedSlotIds.length === 0) return '';
  const names = timeSlots
    .filter(s => assignedSlotIds.includes(s.id) && s.is_active)
    .map(s => {
      const startFormatted = formatTime(s.start_time);
      const endFormatted = formatTime(s.end_time);
      return `${s.name} (${startFormatted} - ${endFormatted})`;
    });
  return names.join(', ');
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}
