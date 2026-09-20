import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { haversineDistance } from '@/lib/distance';

export interface ServiceArea {
  id: string;
  name: string;
  center_latitude: number;
  center_longitude: number;
  radius_km: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceAreaInput {
  name: string;
  center_latitude: number;
  center_longitude: number;
  radius_km: number;
  is_active?: boolean;
}

export function useServiceAreas() {
  const queryClient = useQueryClient();

  const { data: serviceAreas = [], isLoading } = useQuery({
    queryKey: ['service-areas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_areas')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as ServiceArea[];
    },
  });

  const addServiceArea = useMutation({
    mutationFn: async (input: ServiceAreaInput) => {
      const { data, error } = await supabase
        .from('service_areas')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-areas'] });
      toast.success('Service area added');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to add service area'),
  });

  const updateServiceArea = useMutation({
    mutationFn: async ({ id, ...input }: ServiceAreaInput & { id: string }) => {
      const { data, error } = await supabase
        .from('service_areas')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-areas'] });
      toast.success('Service area updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update'),
  });

  const deleteServiceArea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_areas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-areas'] });
      toast.success('Service area deleted');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to delete'),
  });

  const isLocationServiceable = (lat: number, lng: number): boolean => {
    const activeAreas = serviceAreas.filter((a) => a.is_active);
    if (activeAreas.length === 0) return true; // No areas defined = serve everywhere
    return activeAreas.some((area) => {
      const dist = haversineDistance(area.center_latitude, area.center_longitude, lat, lng);
      return dist <= area.radius_km;
    });
  };

  return {
    serviceAreas,
    isLoading,
    addServiceArea,
    updateServiceArea,
    deleteServiceArea,
    isLocationServiceable,
  };
}
