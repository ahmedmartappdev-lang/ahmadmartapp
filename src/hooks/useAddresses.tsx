import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

export interface Address {
  id: string;
  user_id: string;
  address_type: string;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
}

export type AddressInput = Omit<Address, 'id' | 'user_id'>;

export function useAddresses() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: addresses = [], isLoading, error } = useQuery({
    queryKey: ['addresses', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('user_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Address[];
    },
    enabled: !!user?.id,
  });

  const addAddress = useMutation({
    mutationFn: async (address: AddressInput) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      // If this is the first address or marked as default, unset other defaults
      if (address.is_default) {
        await supabase
          .from('user_addresses')
          .update({ is_default: false })
          .eq('user_id', user.id);
      }
      
      const { data, error } = await supabase
        .from('user_addresses')
        .insert({
          ...address,
          user_id: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] });
      toast.success('Address added successfully');
    },
    onError: (error) => {
      toast.error('Failed to add address');
      console.error('Add address error:', error);
    },
  });

  const updateAddress = useMutation({
    mutationFn: async ({ id, ...address }: Partial<Address> & { id: string }) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      // If setting as default, unset other defaults
      if (address.is_default) {
        await supabase
          .from('user_addresses')
          .update({ is_default: false })
          .eq('user_id', user.id);
      }
      
      const { data, error } = await supabase
        .from('user_addresses')
        .update(address)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] });
      toast.success('Address updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update address');
      console.error('Update address error:', error);
    },
  });

  const deleteAddress = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('user_addresses')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] });
      toast.success('Address deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete address');
      console.error('Delete address error:', error);
    },
  });

  const setDefaultAddress = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      // Unset all defaults first
      await supabase
        .from('user_addresses')
        .update({ is_default: false })
        .eq('user_id', user.id);
      
      // Set new default
      const { error } = await supabase
        .from('user_addresses')
        .update({ is_default: true })
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] });
      toast.success('Default address updated');
    },
  });

  const defaultAddress = addresses.find(a => a.is_default) || addresses[0];

  return {
    addresses,
    defaultAddress,
    isLoading,
    error,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
  };
}
