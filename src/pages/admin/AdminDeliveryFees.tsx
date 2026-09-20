import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Truck, Zap, CloudRain, Clock, ShoppingCart, IndianRupee } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useDeliveryFeeConfig, computeDeliveryFee } from '@/hooks/useDeliveryFeeConfig';
import type { DeliveryFeeConfig } from '@/hooks/useDeliveryFeeConfig';

const AdminDeliveryFees: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useDeliveryFeeConfig();

  const [form, setForm] = useState<DeliveryFeeConfig | null>(null);

  useEffect(() => {
    if (config && !form) {
      setForm(config);
    }
  }, [config, form]);

  const saveMutation = useMutation({
    mutationFn: async (newConfig: DeliveryFeeConfig) => {
      const value = JSON.stringify(newConfig);

      const { data: existing } = await supabase
        .from('app_settings' as any)
        .select('key')
        .eq('key', 'delivery_fee_config')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('app_settings' as any)
          .update({ value, updated_at: new Date().toISOString() } as any)
          .eq('key', 'delivery_fee_config');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('app_settings' as any)
          .insert({ key: 'delivery_fee_config', value, updated_at: new Date().toISOString() } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings', 'delivery_fee_config'] });
      toast({ title: 'Delivery fee settings saved' });
    },
    onError: () => {
      toast({ title: 'Failed to save settings', variant: 'destructive' });
    },
  });

  const handleSave = () => {
    if (form) saveMutation.mutate(form);
  };

  if (isLoading || !form) {
    return (
      <DashboardLayout title="Delivery Fees" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  // Live preview
  const preview100 = computeDeliveryFee(form, 100);
  const preview300 = computeDeliveryFee(form, 300);

  return (
    <DashboardLayout title="Delivery Fees" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Base Fee Structure */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" />
                <CardTitle>Base Delivery Fee</CardTitle>
              </div>
              <CardDescription>Set the base delivery charges and free delivery threshold</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Base Fee</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      className="pl-9"
                      value={form.baseFee}
                      onChange={(e) => setForm({ ...form, baseFee: Number(e.target.value) })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Flat fee when no distance data</p>
                </div>
                <div className="space-y-2">
                  <Label>Free Delivery Above</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      className="pl-9"
                      value={form.freeDeliveryThreshold}
                      onChange={(e) => setForm({ ...form, freeDeliveryThreshold: Number(e.target.value) })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Orders above this get free delivery</p>
                </div>
                <div className="space-y-2">
                  <Label>Platform Fee</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      className="pl-9"
                      value={form.platformFee}
                      onChange={(e) => setForm({ ...form, platformFee: Number(e.target.value) })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Handling/platform charge</p>
                </div>
              </div>

              {/* GST */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>GST on charges (%)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={28}
                      step={0.5}
                      value={form.gstPercent ?? 18}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isNaN(v)) return;
                        setForm({ ...form, gstPercent: Math.max(0, Math.min(28, v)) });
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Applies to delivery + platform + small-order fee. Goods (MRP) are tax-inclusive.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Surge Pricing */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-orange-500" />
                <CardTitle>Surge Pricing</CardTitle>
              </div>
              <CardDescription>Manually enable surge pricing during high demand</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Surge</p>
                  <p className="text-sm text-muted-foreground">Multiply delivery fee during high demand</p>
                </div>
                <Switch
                  checked={form.surgeEnabled}
                  onCheckedChange={(v) => setForm({ ...form, surgeEnabled: v })}
                />
              </div>
              {form.surgeEnabled && (
                <div className="grid grid-cols-1 gap-4 rounded-lg bg-orange-50 p-4 dark:bg-orange-900/20 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Surge Extra (%)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={Math.round((form.surgeMultiplier - 1) * 100)}
                        onChange={(e) => setForm({ ...form, surgeMultiplier: 1 + (Number(e.target.value) || 0) / 100 })}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Extra charge added on top of base fee</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Surge Label</Label>
                    <Input
                      value={form.surgeLabel}
                      onChange={(e) => setForm({ ...form, surgeLabel: e.target.value })}
                      placeholder="High demand"
                    />
                    <p className="text-xs text-muted-foreground">Shown to customers</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rain Surge */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CloudRain className="w-5 h-5 text-blue-500" />
                <CardTitle>Weather Surge</CardTitle>
              </div>
              <CardDescription>Extra charge during bad weather conditions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Rain/Weather Surge</p>
                  <p className="text-sm text-muted-foreground">Toggle on during rain or extreme weather</p>
                </div>
                <Switch
                  checked={form.rainSurgeEnabled}
                  onCheckedChange={(v) => setForm({ ...form, rainSurgeEnabled: v })}
                />
              </div>
              {form.rainSurgeEnabled && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="w-full space-y-2 sm:w-48">
                    <Label>Weather Extra (%)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={Math.round((form.rainSurgeMultiplier - 1) * 100)}
                        onChange={(e) => setForm({ ...form, rainSurgeMultiplier: 1 + (Number(e.target.value) || 0) / 100 })}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Extra charge during bad weather</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Peak Hours */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-500" />
                <CardTitle>Peak Hours Surge</CardTitle>
              </div>
              <CardDescription>Automatic surge during lunch/dinner rush hours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Peak Hours Surge</p>
                  <p className="text-sm text-muted-foreground">Auto-applies during configured time window</p>
                </div>
                <Switch
                  checked={form.peakHoursEnabled}
                  onCheckedChange={(v) => setForm({ ...form, peakHoursEnabled: v })}
                />
              </div>
              {form.peakHoursEnabled && (
                <div className="grid grid-cols-1 gap-4 rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={form.peakHoursStart}
                      onChange={(e) => setForm({ ...form, peakHoursStart: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={form.peakHoursEnd}
                      onChange={(e) => setForm({ ...form, peakHoursEnd: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Peak Extra (%)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={Math.round((form.peakHoursMultiplier - 1) * 100)}
                        onChange={(e) => setForm({ ...form, peakHoursMultiplier: 1 + (Number(e.target.value) || 0) / 100 })}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Extra during peak hours</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Small Order Fee */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-red-500" />
                <CardTitle>Small Order Fee</CardTitle>
              </div>
              <CardDescription>Extra charge for very small orders to cover costs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Small Order Fee</p>
                  <p className="text-sm text-muted-foreground">Charge extra for orders below a minimum</p>
                </div>
                <Switch
                  checked={form.smallOrderFeeEnabled}
                  onCheckedChange={(v) => setForm({ ...form, smallOrderFeeEnabled: v })}
                />
              </div>
              {form.smallOrderFeeEnabled && (
                <div className="grid grid-cols-1 gap-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Below Order Value</Label>
                    <div className="relative">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="number"
                        className="pl-9"
                        value={form.smallOrderThreshold}
                        onChange={(e) => setForm({ ...form, smallOrderThreshold: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Extra Fee</Label>
                    <div className="relative">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="number"
                        className="pl-9"
                        value={form.smallOrderFee}
                        onChange={(e) => setForm({ ...form, smallOrderFee: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saveMutation.isPending} size="lg" className="w-full">
            {saveMutation.isPending ? 'Saving...' : 'Save All Delivery Fee Settings'}
          </Button>
        </div>

        {/* Live Preview Sidebar */}
        <div className="space-y-4">
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle className="text-lg">Live Preview</CardTitle>
              <CardDescription>See how fees will look for customers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Scenario 1 */}
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Order: ₹100 (no distance)</p>
                <div className="flex justify-between text-sm">
                  <span>Delivery Fee</span>
                  <span className="font-medium">₹{preview100.deliveryFee}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Platform Fee</span>
                  <span className="font-medium">₹{preview100.platformFee}</span>
                </div>
                {preview100.smallOrderFee > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Small Order Fee</span>
                    <span className="font-medium">₹{preview100.smallOrderFee}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span>GST on charges ({form.gstPercent ?? 18}%)</span>
                  <span className="font-medium">
                    ₹{(((preview100.deliveryFee + preview100.platformFee + preview100.smallOrderFee) * (form.gstPercent ?? 18) / 100)).toFixed(2)}
                  </span>
                </div>
                {preview100.surgeApplied && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800 text-xs">
                    {preview100.surgeLabel}
                  </Badge>
                )}
              </div>

              {/* Scenario 2 */}
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Order: ₹{form.freeDeliveryThreshold}+ (free delivery)</p>
                <div className="flex justify-between text-sm">
                  <span>Delivery Fee</span>
                  <span className="font-medium text-green-600">FREE</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Platform Fee</span>
                  <span className="font-medium">₹{preview300.platformFee}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>GST on charges ({form.gstPercent ?? 18}%)</span>
                  <span className="font-medium">
                    ₹{((preview300.platformFee * (form.gstPercent ?? 18) / 100)).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Active Surges */}
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Active Surges</p>
                {!form.surgeEnabled && !form.rainSurgeEnabled && !form.peakHoursEnabled && (
                  <p className="text-sm text-muted-foreground">No surges active</p>
                )}
                {form.surgeEnabled && (
                  <Badge className="bg-orange-100 text-orange-800">{form.surgeLabel} (+{Math.round((form.surgeMultiplier - 1) * 100)}%)</Badge>
                )}
                {form.rainSurgeEnabled && (
                  <Badge className="bg-blue-100 text-blue-800 ml-1">Weather (+{Math.round((form.rainSurgeMultiplier - 1) * 100)}%)</Badge>
                )}
                {form.peakHoursEnabled && (
                  <Badge className="bg-purple-100 text-purple-800 ml-1">
                    Peak {form.peakHoursStart}-{form.peakHoursEnd} (+{Math.round((form.peakHoursMultiplier - 1) * 100)}%)
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminDeliveryFees;
