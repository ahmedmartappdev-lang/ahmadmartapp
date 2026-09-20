import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useDeliveryAssignmentMode } from '@/hooks/useAppSettings';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

function useAppSetting(key: string, fallback: string) {
  return useQuery({
    queryKey: ['app-settings', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings' as any)
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.value ?? fallback;
    },
    staleTime: 30000,
  });
}

function useUpsertSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      // Try update first, then insert if not found
      const { data: existing } = await supabase
        .from('app_settings' as any)
        .select('key')
        .eq('key', key)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('app_settings' as any)
          .update({ value, updated_at: new Date().toISOString() } as any)
          .eq('key', key);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('app_settings' as any)
          .insert({ key, value, updated_at: new Date().toISOString() } as any);
        if (error) throw error;
      }
    },
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: ['app-settings', key] });
    },
  });
}

const AdminSettings: React.FC = () => {
  const { isAutoMode, isLoading: isLoadingMode, updateMode, isUpdating } = useDeliveryAssignmentMode();
  const { toast } = useToast();
  const upsertSetting = useUpsertSetting();

  // Store settings state
  const [storeName, setStoreName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportPhone, setSupportPhone] = useState('');

  // Order settings state
  const [autoAccept, setAutoAccept] = useState(false);
  const [enableCOD, setEnableCOD] = useState(true);

  // Notification settings state
  const [newOrderAlerts, setNewOrderAlerts] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [dailySummary, setDailySummary] = useState(false);

  // Fetch all settings
  const { data: storeNameVal } = useAppSetting('store_name', 'Ahmed Mart');
  const { data: supportEmailVal } = useAppSetting('support_email', 'support@ahmedmart.com');
  const { data: supportPhoneVal } = useAppSetting('support_phone', '+91 9876543210');
  const { data: autoAcceptVal } = useAppSetting('auto_accept_orders', 'false');
  const { data: enableCODVal } = useAppSetting('enable_cod', 'true');

  // Initialize state from fetched values
  useEffect(() => { if (storeNameVal) setStoreName(storeNameVal); }, [storeNameVal]);
  useEffect(() => { if (supportEmailVal) setSupportEmail(supportEmailVal); }, [supportEmailVal]);
  useEffect(() => { if (supportPhoneVal) setSupportPhone(supportPhoneVal); }, [supportPhoneVal]);
  useEffect(() => { if (autoAcceptVal !== undefined) setAutoAccept(autoAcceptVal === 'true'); }, [autoAcceptVal]);
  useEffect(() => { if (enableCODVal !== undefined) setEnableCOD(enableCODVal === 'true'); }, [enableCODVal]);

  const saveStoreSettings = async () => {
    try {
      await Promise.all([
        upsertSetting.mutateAsync({ key: 'store_name', value: storeName }),
        upsertSetting.mutateAsync({ key: 'support_email', value: supportEmail }),
        upsertSetting.mutateAsync({ key: 'support_phone', value: supportPhone }),
      ]);
      toast({ title: 'Store settings saved' });
    } catch {
      toast({ title: 'Failed to save store settings', variant: 'destructive' });
    }
  };

  const saveOrderSettings = async () => {
    try {
      await Promise.all([
        upsertSetting.mutateAsync({ key: 'auto_accept_orders', value: String(autoAccept) }),
        upsertSetting.mutateAsync({ key: 'enable_cod', value: String(enableCOD) }),
      ]);
      toast({ title: 'Order settings saved' });
    } catch {
      toast({ title: 'Failed to save order settings', variant: 'destructive' });
    }
  };

  const handleNotificationToggle = (setting: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    toast({ title: `${setting} ${value ? 'enabled' : 'disabled'}` });
  };

  return (
    <DashboardLayout
      title="Settings"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <div className="space-y-6 max-w-2xl">
        {/* Store Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Store Settings</CardTitle>
            <CardDescription>Configure your store preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="storeName">Store Name</Label>
              <Input id="storeName" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input id="supportEmail" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportPhone">Support Phone</Label>
              <Input id="supportPhone" value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} />
            </div>
            <Button onClick={saveStoreSettings} disabled={upsertSetting.isPending}>
              {upsertSetting.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Order Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Order Settings</CardTitle>
            <CardDescription>Configure order-related preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto-accept Orders</p>
                <p className="text-sm text-muted-foreground">Automatically confirm incoming orders</p>
              </div>
              <Switch checked={autoAccept} onCheckedChange={setAutoAccept} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable COD</p>
                <p className="text-sm text-muted-foreground">Allow cash on delivery payments</p>
              </div>
              <Switch checked={enableCOD} onCheckedChange={setEnableCOD} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto Delivery Assignment</p>
                <p className="text-sm text-muted-foreground">
                  {isAutoMode
                    ? 'Delivery partners can self-assign available orders'
                    : 'Only admin can assign orders to delivery partners'}
                </p>
              </div>
              <Switch
                checked={isAutoMode}
                disabled={isLoadingMode || isUpdating}
                onCheckedChange={(checked) => {
                  updateMode(checked ? 'auto' : 'manual', {
                    onSuccess: () => {
                      toast({
                        title: checked
                          ? 'Auto assignment enabled'
                          : 'Manual assignment enabled',
                      });
                    },
                    onError: () => {
                      toast({
                        title: 'Failed to update setting',
                        variant: 'destructive',
                      });
                    },
                  });
                }}
              />
            </div>
            <Separator />
            <Button onClick={saveOrderSettings} disabled={upsertSetting.isPending}>
              {upsertSetting.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Manage notification preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">New Order Alerts</p>
                <p className="text-sm text-muted-foreground">Get notified for new orders</p>
              </div>
              <Switch
                checked={newOrderAlerts}
                onCheckedChange={(v) => handleNotificationToggle('New order alerts', v, setNewOrderAlerts)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Low Stock Alerts</p>
                <p className="text-sm text-muted-foreground">Alert when products are running low</p>
              </div>
              <Switch
                checked={lowStockAlerts}
                onCheckedChange={(v) => handleNotificationToggle('Low stock alerts', v, setLowStockAlerts)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Daily Summary Email</p>
                <p className="text-sm text-muted-foreground">Receive daily order summary</p>
              </div>
              <Switch
                checked={dailySummary}
                onCheckedChange={(v) => handleNotificationToggle('Daily summary', v, setDailySummary)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminSettings;
