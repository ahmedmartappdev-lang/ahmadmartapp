import React, { useState } from 'react';
import { ArrowLeft, CreditCard, CheckCircle, Clock, XCircle, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';

const RULES = [
  {
    step: 1,
    title: 'Eligibility Check',
    desc: 'To apply for a credit limit, you must be a registered customer. Please note, not everyone will be eligible. Only eligible customers will be contacted.',
  },
  {
    step: 2,
    title: 'Submit Your Details',
    desc: 'WhatsApp your full name to +91 98941 44233 for verification. This will help us validate your identity and initiate the process.',
  },
  {
    step: 3,
    title: 'Verification Process',
    desc: 'After submitting your name, our team will review your details. If you qualify, you will receive a confirmation or further instructions within 24 hours. Only eligible applicants will be contacted.',
  },
  {
    step: 4,
    title: 'Credit Limit Approval',
    desc: 'Once verified, we will assess your eligibility based on your transaction history and payment behaviour. If approved, the credit limit will be communicated to you directly.',
  },
  {
    step: 5,
    title: 'Terms & Conditions',
    desc: 'By availing the credit limit, you agree to adhere to our terms and conditions, including timely repayment and late fee policies.',
  },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive'; icon: React.ElementType }> = {
  pending: { label: 'Pending Review', variant: 'secondary', icon: Clock },
  approved: { label: 'Approved', variant: 'default', icon: CheckCircle },
  rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
};

const CreditApplyPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch profile for auto-fill
  const { data: profile } = useQuery({
    queryKey: ['profile-for-credit', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch existing applications
  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['credit-applications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await (supabase
        .from('credit_applications') as any)
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const latestApplication = applications[0];
  const canApply = !latestApplication || latestApplication.status === 'rejected';

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !profile) throw new Error('Profile not found');
      const { error } = await (supabase.from('credit_applications') as any).insert({
        customer_id: user.id,
        full_name: profile.full_name || 'User',
        phone: profile.phone || '',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-applications'] });
      toast({ title: 'Application submitted!', description: 'Our team will review and contact you within 24 hours.' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to submit', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <CustomerLayout>
      <div className="max-w-[800px] mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Apply for Credit Limit</h1>
        </div>

        {/* Rules */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Rules to Avail Credit Limit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {RULES.map((rule) => (
              <div key={rule.step} className="flex gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {rule.step}
                </div>
                <div>
                  <p className="font-semibold text-sm">{rule.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{rule.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* WhatsApp CTA */}
        <Card className="mb-6 border-green-200 bg-green-50/50">
          <CardContent className="py-4 flex items-center gap-3">
            <MessageCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">WhatsApp your name for verification</p>
              <p className="text-xs text-muted-foreground">+91 98941 44233</p>
            </div>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                const name = profile?.full_name || '';
                window.open(`https://wa.me/919894144233?text=${encodeURIComponent(`Hi, I would like to apply for credit limit. My name is ${name}`)}`, '_blank');
              }}
            >
              WhatsApp
            </Button>
          </CardContent>
        </Card>

        {/* Apply / Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Your Application</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-6 text-muted-foreground">Loading...</div>
            ) : latestApplication ? (
              <div className="space-y-3">
                {applications.map((app: any) => {
                  const config = statusConfig[app.status] || statusConfig.pending;
                  const Icon = config.icon;
                  return (
                    <div key={app.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{app.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(app.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </p>
                        {app.admin_notes && (
                          <p className="text-xs text-muted-foreground mt-1">Note: {app.admin_notes}</p>
                        )}
                      </div>
                      <Badge variant={config.variant} className="flex items-center gap-1">
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </Badge>
                    </div>
                  );
                })}
                {canApply && (
                  <Button className="w-full mt-3" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                    {applyMutation.isPending ? 'Submitting...' : 'Apply Again'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">You haven't applied for a credit limit yet.</p>
                <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending || !profile}>
                  {applyMutation.isPending ? 'Submitting...' : 'Apply for Credit Limit'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
};

export default CreditApplyPage;
