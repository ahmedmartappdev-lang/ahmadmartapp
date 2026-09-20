import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { User } from 'lucide-react';

const PLACEHOLDER_NAME = 'User';

function isMissing(name: string | null | undefined) {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (trimmed.toLowerCase() === PLACEHOLDER_NAME.toLowerCase()) return true;
  return false;
}

export const RequireNameGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile-name-gate', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 0,
  });

  const saveName = useMutation({
    mutationFn: async (newName: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: newName, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-name-gate', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id] });
      toast.success('Welcome to Ahmad Mart!');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save name'),
  });

  // Only gate when user is authed + profile loaded + name actually missing.
  const needsName = !!user && !isLoading && isMissing(profile?.full_name);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error('Please enter your full name');
      return;
    }
    saveName.mutate(trimmed);
  };

  return (
    <>
      {children}
      <Dialog open={needsName}>
        {/* No onOpenChange => non-dismissible */}
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <User className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle>What should we call you?</DialogTitle>
            <DialogDescription>
              Your name helps our delivery partners and store owners address you correctly.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              maxLength={60}
              disabled={saveName.isPending}
            />
            <Button
              type="submit"
              className="w-full h-12 rounded-2xl text-base font-semibold shadow-sm"
              disabled={saveName.isPending || name.trim().length < 2}
            >
              {saveName.isPending ? 'Saving…' : 'Continue'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
