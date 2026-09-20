import React, { useState } from 'react';
import { sanitizePhone, formatPhoneForStorage } from '@/lib/phone';
import {
  formatDigits, formatUpper,
  isValidPhone, isValidEmail, isValidAadhar, isValidPAN, isValidIFSC,
  isValidBankAccount, isValidPincode, isValidVehicleNumber,
  isValidDrivingLicense, collectErrors, isPresent,
} from '@/lib/validators';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Eye, MoreVertical, CheckCircle, XCircle, Bike, Car, Truck, Ban, RotateCcw, Pencil } from 'lucide-react';
import { useDeliveryPartnerNetToTransfer } from '@/lib/deliveryAccounting';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ImageUpload } from '@/components/ui/image-upload';
import type { Database } from '@/integrations/supabase/types';

type DeliveryStatus = Database['public']['Enums']['delivery_status'];
type VehicleType = Database['public']['Enums']['vehicle_type'];

interface DeliveryPartnerFormData {
  email: string;
  full_name: string;
  phone: string;
  alternate_phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  vehicle_type: VehicleType;
  vehicle_number: string;
  license_number: string;
  aadhar_number: string;
  pan_number: string;
  bank_account_number: string;
  ifsc_code: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  aadhar_front_url: string;
  aadhar_back_url: string;
  license_front_url: string;
  license_back_url: string;
  profile_image_url: string;
}

const initialFormData: DeliveryPartnerFormData = {
  email: '',
  full_name: '',
  phone: '',
  alternate_phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pincode: '',
  vehicle_type: 'bike',
  vehicle_number: '',
  license_number: '',
  aadhar_number: '',
  pan_number: '',
  bank_account_number: '',
  ifsc_code: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  aadhar_front_url: '',
  aadhar_back_url: '',
  license_front_url: '',
  license_back_url: '',
  profile_image_url: '',
};

/**
 * Net-to-transfer block in the partner detail dialog.
 * Extracted so the hook lives at component top-level.
 */
const PartnerNetToTransferBlock: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const { data, isLoading } = useDeliveryPartnerNetToTransfer(partnerId);
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 text-sm text-muted-foreground">
        Calculating net to transfer…
      </div>
    );
  }

  const fmt = (n: number) => `₹${Number(n).toLocaleString()}`;
  const positive = data.netToTransfer > 0;
  const negative = data.netToTransfer < 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Net to transfer</p>
          <p
            className={`text-lg font-semibold ${
              positive ? 'text-emerald-700' : negative ? 'text-amber-700' : 'text-slate-700'
            }`}
          >
            {fmt(data.netToTransfer)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {positive
              ? 'Owed by partner to admin.'
              : negative
                ? 'Owed by admin to partner.'
                : 'Settled.'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowBreakdown((v) => !v)}
        >
          {showBreakdown ? 'Hide breakdown' : 'Breakdown'}
        </Button>
      </div>
      {showBreakdown && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-200 pt-2 text-xs">
          <span className="text-muted-foreground">Cash collected</span>
          <span className="text-right">{fmt(data.cashCollected)}</span>
          <span className="text-muted-foreground">− Approved bills</span>
          <span className="text-right">{fmt(data.approvedBills)}</span>
          <span className="text-muted-foreground">+ Verified collections</span>
          <span className="text-right">{fmt(data.verifiedCollections)}</span>
          <span className="text-muted-foreground">− Approved cash returns</span>
          <span className="text-right">{fmt(data.approvedCashReturns)}</span>
          <span className="text-muted-foreground">− Recorded settlements</span>
          <span className="text-right">{fmt(data.recordedSettlements)}</span>
        </div>
      )}
    </div>
  );
};

const AdminDelivery: React.FC = () => {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<any | null>(null);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [formData, setFormData] = useState<DeliveryPartnerFormData>(initialFormData);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: partners, isLoading } = useQuery({
    queryKey: ['admin-delivery-partners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_partners')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createPartnerMutation = useMutation({
    mutationFn: async (data: DeliveryPartnerFormData) => {
      const payload = {
        email: data.email,
        full_name: data.full_name,
        phone: formatPhoneForStorage(data.phone),
        alternate_phone: formatPhoneForStorage(data.alternate_phone),
        address_line1: data.address_line1,
        address_line2: data.address_line2,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        vehicle_type: data.vehicle_type,
        vehicle_number: data.vehicle_number,
        license_number: data.license_number,
        aadhar_number: data.aadhar_number,
        pan_number: data.pan_number,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: formatPhoneForStorage(data.emergency_contact_phone),
        aadhar_front_url: data.aadhar_front_url,
        aadhar_back_url: data.aadhar_back_url,
        license_front_url: data.license_front_url,
        license_back_url: data.license_back_url,
        profile_image_url: data.profile_image_url,
        bank_account_number: (data as any).bank_account_number,
        ifsc_code: (data as any).ifsc_code,
      };
      const { data: rpcData, error } = await supabase.rpc('admin_create_delivery_partner' as any, { payload });
      if (error) throw error;
      if (!(rpcData as any)?.ok) throw new Error((rpcData as any)?.error || 'Failed to add delivery partner');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-delivery-partners'] });
      toast({ title: 'Delivery partner added successfully' });
      setIsDialogOpen(false);
      setFormData(initialFormData);
    },
    onError: (error: any) => {
      const raw = String(error?.message || '').toLowerCase();
      const looksMissing = raw.includes('does not exist') || raw.includes('could not find') || raw.includes('404');
      toast({
        title: 'Failed to add delivery partner',
        description: looksMissing
          ? "RPC 'admin_create_delivery_partner' not found — Supabase migrations aren't deployed. Run `supabase db push` against the live project."
          : (error?.message || 'Server error — check the audit log or try again'),
        variant: 'destructive',
      });
    },
  });

  const updatePartnerMutation = useMutation({
    mutationFn: async ({ partnerId, data }: { partnerId: string; data: DeliveryPartnerFormData }) => {
      const patch: any = {
        full_name: data.full_name,
        phone: formatPhoneForStorage(data.phone),
        alternate_phone: data.alternate_phone ? formatPhoneForStorage(data.alternate_phone) : null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        vehicle_type: data.vehicle_type,
        vehicle_number: data.vehicle_number || null,
        license_number: data.license_number || null,
        aadhar_number: data.aadhar_number || null,
        pan_number: data.pan_number || null,
        bank_account_number: data.bank_account_number || null,
        ifsc_code: data.ifsc_code || null,
        emergency_contact_name: data.emergency_contact_name || null,
        emergency_contact_phone: data.emergency_contact_phone ? formatPhoneForStorage(data.emergency_contact_phone) : null,
        aadhar_front_url: data.aadhar_front_url || null,
        aadhar_back_url: data.aadhar_back_url || null,
        license_front_url: data.license_front_url || null,
        license_back_url: data.license_back_url || null,
        profile_image_url: data.profile_image_url || null,
      };
      const { error } = await supabase.from('delivery_partners').update(patch).eq('id', partnerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-delivery-partners'] });
      toast({ title: 'Delivery partner updated' });
      setIsDialogOpen(false);
      setEditingPartnerId(null);
      setFormData(initialFormData);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update delivery partner',
        description: error?.message || 'Try again.',
        variant: 'destructive',
      });
    },
  });

  // Open the dialog in Edit mode, pre-filled with the partner's current values.
  // Email stays disabled in the JSX — it's the auth login. Phone is contact
  // data and only the admin may change it (it's read-only on the agent side).
  const handleStartEditPartner = (partner: any) => {
    setEditingPartnerId(partner.id);
    setFormData({
      email: partner.email || '',
      full_name: partner.full_name || '',
      phone: partner.phone || '',
      alternate_phone: partner.alternate_phone || '',
      address_line1: partner.address_line1 || '',
      address_line2: partner.address_line2 || '',
      city: partner.city || '',
      state: partner.state || '',
      pincode: partner.pincode || '',
      vehicle_type: (partner.vehicle_type as VehicleType) || 'bike',
      vehicle_number: partner.vehicle_number || '',
      license_number: partner.license_number || '',
      aadhar_number: partner.aadhar_number || '',
      pan_number: partner.pan_number || '',
      bank_account_number: partner.bank_account_number || '',
      ifsc_code: partner.ifsc_code || '',
      emergency_contact_name: partner.emergency_contact_name || '',
      emergency_contact_phone: partner.emergency_contact_phone || '',
      aadhar_front_url: partner.aadhar_front_url || '',
      aadhar_back_url: partner.aadhar_back_url || '',
      license_front_url: partner.license_front_url || '',
      license_back_url: partner.license_back_url || '',
      profile_image_url: partner.profile_image_url || '',
    });
    setErrors({});
    setIsDialogOpen(true);
  };

  const verifyPartnerMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase
        .from('delivery_partners')
        .update({ is_verified: true, document_verified_at: new Date().toISOString() })
        .eq('id', partnerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-delivery-partners'] });
      toast({ title: 'Partner verified successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to verify partner', variant: 'destructive' });
    },
  });

  const [suspendDialog, setSuspendDialog] = useState<{ id: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  const suspendMutation = useMutation({
    mutationFn: async ({ partnerId, reason }: { partnerId: string; reason: string }) => {
      const { error } = await (supabase as any).rpc('set_delivery_partner_account_status', {
        p_partner_id: partnerId,
        p_status: 'suspended',
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-delivery-partners'] });
      toast({ title: 'Partner suspended' });
      setSuspendDialog(null);
      setSuspendReason('');
    },
    onError: (e: any) => {
      toast({ title: e?.message || 'Failed to suspend', variant: 'destructive' });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await (supabase as any).rpc('set_delivery_partner_account_status', {
        p_partner_id: partnerId,
        p_status: 'active',
        p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-delivery-partners'] });
      toast({ title: 'Partner reactivated' });
    },
    onError: (e: any) => {
      toast({ title: e?.message || 'Failed to reactivate', variant: 'destructive' });
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      available: 'bg-green-100 text-green-800',
      busy: 'bg-yellow-100 text-yellow-800',
      offline: 'bg-gray-100 text-gray-800',
      on_break: 'bg-blue-100 text-blue-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'bicycle': return <Bike className="w-5 h-5" />;
      case 'bike': case 'scooter': return <Bike className="w-5 h-5" />;
      case 'car': return <Car className="w-5 h-5" />;
      default: return <Truck className="w-5 h-5" />;
    }
  };

  const filteredPartners = partners?.filter(
    (partner) =>
      partner.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      partner.email?.toLowerCase().includes(search.toLowerCase()) ||
      partner.phone?.includes(search)
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const setErr = (key: string, msg: string | undefined) =>
    setErrors(prev => {
      const next = { ...prev };
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });
  const errCls = (key: string) =>
    errors[key] ? 'border-red-300 focus-visible:ring-red-300' : '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Email is excluded from validation when editing — it's frozen in the UI
    // because changing it would break auth linkage downstream.
    const checks: Record<string, { ok: boolean; error?: string }> = {
      full_name: isPresent(formData.full_name),
      phone: isValidPhone(formData.phone),
      alternate_phone: isValidPhone(formData.alternate_phone),
      pincode: isValidPincode(formData.pincode),
      vehicle_number: isValidVehicleNumber(formData.vehicle_number),
      license_number: isValidDrivingLicense(formData.license_number),
      aadhar_number: isValidAadhar(formData.aadhar_number),
      pan_number: isValidPAN(formData.pan_number),
      bank_account_number: isValidBankAccount(formData.bank_account_number),
      ifsc_code: isValidIFSC(formData.ifsc_code),
      emergency_contact_phone: isValidPhone(formData.emergency_contact_phone),
    };
    if (!editingPartnerId) {
      checks.email = isPresent(formData.email).ok ? isValidEmail(formData.email) : { ok: false, error: 'Email required' };
    }
    const errs = collectErrors(checks);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast({ title: 'Fix highlighted fields', variant: 'destructive' });
      return;
    }
    setErrors({});
    if (editingPartnerId) {
      updatePartnerMutation.mutate({ partnerId: editingPartnerId, data: formData });
    } else {
      createPartnerMutation.mutate(formData);
    }
  };

  return (
    <DashboardLayout
      title="Delivery Partners"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>All Delivery Partners</CardTitle>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search partners..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full sm:w-[200px]"
                />
              </div>
              <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  if (!open) {
                    setEditingPartnerId(null);
                    setFormData(initialFormData);
                    setErrors({});
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Partner
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingPartnerId ? 'Edit Delivery Partner' : 'Add Delivery Partner'}</DialogTitle>
                    <DialogDescription>
                      {editingPartnerId
                        ? 'Email and phone are locked because they bind to the auth account. Everything else is editable.'
                        : 'Pre-register a delivery partner by email. They can sign up using this email.'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email {editingPartnerId ? '(locked)' : '*'}</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="partner@example.com"
                          value={formData.email}
                          onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setErr('email', undefined); }}
                          onBlur={() => setErr('email', isValidEmail(formData.email).error)}
                          className={errCls('email')}
                          required={!editingPartnerId}
                          disabled={!!editingPartnerId}
                        />
                        {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Full Name *</Label>
                        <Input
                          id="full_name"
                          placeholder="John Doe"
                          value={formData.full_name}
                          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone *</Label>
                        <Input
                          id="phone"
                          placeholder="9876543210"
                          value={formData.phone}
                          onChange={(e) => { setFormData({ ...formData, phone: formatDigits(e.target.value, 10) }); setErr('phone', undefined); }}
                          onBlur={() => setErr('phone', isValidPhone(formData.phone).error)}
                          inputMode="numeric"
                          className={errCls('phone')}
                          required
                        />
                        {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="alternate_phone">Alternate Phone</Label>
                        <Input
                          id="alternate_phone"
                          placeholder="9876543210"
                          value={formData.alternate_phone}
                          onChange={(e) => { setFormData({ ...formData, alternate_phone: formatDigits(e.target.value, 10) }); setErr('alternate_phone', undefined); }}
                          onBlur={() => setErr('alternate_phone', isValidPhone(formData.alternate_phone).error)}
                          inputMode="numeric"
                          className={errCls('alternate_phone')}
                        />
                        {errors.alternate_phone && <p className="text-xs text-red-600 mt-1">{errors.alternate_phone}</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input
                        placeholder="Address Line 1"
                        value={formData.address_line1}
                        onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                        className="mb-2"
                      />
                      <Input
                        placeholder="Address Line 2"
                        value={formData.address_line2}
                        onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          placeholder="Mumbai"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          placeholder="Maharashtra"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pincode">Pincode</Label>
                        <Input
                          id="pincode"
                          placeholder="400001"
                          value={formData.pincode}
                          onChange={(e) => { setFormData({ ...formData, pincode: formatDigits(e.target.value, 6) }); setErr('pincode', undefined); }}
                          onBlur={() => setErr('pincode', isValidPincode(formData.pincode).error)}
                          inputMode="numeric"
                          className={errCls('pincode')}
                        />
                        {errors.pincode && <p className="text-xs text-red-600 mt-1">{errors.pincode}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="vehicle_type">Vehicle Type</Label>
                        <Select
                          value={formData.vehicle_type}
                          onValueChange={(value: VehicleType) => setFormData({ ...formData, vehicle_type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bicycle">Bicycle</SelectItem>
                            <SelectItem value="bike">Bike</SelectItem>
                            <SelectItem value="scooter">Scooter</SelectItem>
                            <SelectItem value="car">Car</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vehicle_number">Vehicle Number</Label>
                        <Input
                          id="vehicle_number"
                          placeholder="MH01AB1234"
                          value={formData.vehicle_number}
                          onChange={(e) => { setFormData({ ...formData, vehicle_number: formatUpper(e.target.value, 12) }); setErr('vehicle_number', undefined); }}
                          onBlur={() => setErr('vehicle_number', isValidVehicleNumber(formData.vehicle_number).error)}
                          className={errCls('vehicle_number')}
                        />
                        {errors.vehicle_number && <p className="text-xs text-red-600 mt-1">{errors.vehicle_number}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="license_number">License Number</Label>
                        <Input
                          id="license_number"
                          placeholder="DL1234567890"
                          value={formData.license_number}
                          onChange={(e) => { setFormData({ ...formData, license_number: formatUpper(e.target.value, 16) }); setErr('license_number', undefined); }}
                          onBlur={() => setErr('license_number', isValidDrivingLicense(formData.license_number).error)}
                          className={errCls('license_number')}
                        />
                        {errors.license_number && <p className="text-xs text-red-600 mt-1">{errors.license_number}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="aadhar_number">Aadhar Number</Label>
                        <Input
                          id="aadhar_number"
                          placeholder="12 digits"
                          value={formData.aadhar_number}
                          onChange={(e) => { setFormData({ ...formData, aadhar_number: formatDigits(e.target.value, 12) }); setErr('aadhar_number', undefined); }}
                          onBlur={() => setErr('aadhar_number', isValidAadhar(formData.aadhar_number).error)}
                          inputMode="numeric"
                          className={errCls('aadhar_number')}
                        />
                        {errors.aadhar_number && <p className="text-xs text-red-600 mt-1">{errors.aadhar_number}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pan_number">PAN Number</Label>
                        <Input
                          id="pan_number"
                          placeholder="ABCDE1234F"
                          value={formData.pan_number}
                          onChange={(e) => { setFormData({ ...formData, pan_number: formatUpper(e.target.value, 10) }); setErr('pan_number', undefined); }}
                          onBlur={() => setErr('pan_number', isValidPAN(formData.pan_number).error)}
                          className={errCls('pan_number')}
                        />
                        {errors.pan_number && <p className="text-xs text-red-600 mt-1">{errors.pan_number}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="bank_account_number">Bank Account Number</Label>
                        <Input
                          id="bank_account_number"
                          placeholder="9-18 digits"
                          value={formData.bank_account_number}
                          onChange={(e) => { setFormData({ ...formData, bank_account_number: formatDigits(e.target.value, 18) }); setErr('bank_account_number', undefined); }}
                          onBlur={() => setErr('bank_account_number', isValidBankAccount(formData.bank_account_number).error)}
                          inputMode="numeric"
                          className={errCls('bank_account_number')}
                        />
                        {errors.bank_account_number && <p className="text-xs text-red-600 mt-1">{errors.bank_account_number}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ifsc_code">IFSC Code</Label>
                        <Input
                          id="ifsc_code"
                          placeholder="SBIN0001234"
                          value={formData.ifsc_code}
                          onChange={(e) => { setFormData({ ...formData, ifsc_code: formatUpper(e.target.value, 11) }); setErr('ifsc_code', undefined); }}
                          onBlur={() => setErr('ifsc_code', isValidIFSC(formData.ifsc_code).error)}
                          className={errCls('ifsc_code')}
                        />
                        {errors.ifsc_code && <p className="text-xs text-red-600 mt-1">{errors.ifsc_code}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="emergency_contact_name">Emergency Contact Name</Label>
                        <Input
                          id="emergency_contact_name"
                          placeholder="Contact person name"
                          value={formData.emergency_contact_name}
                          onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emergency_contact_phone">Emergency Contact Phone</Label>
                        <Input
                          id="emergency_contact_phone"
                          placeholder="9876543210"
                          value={formData.emergency_contact_phone}
                          onChange={(e) => { setFormData({ ...formData, emergency_contact_phone: formatDigits(e.target.value, 10) }); setErr('emergency_contact_phone', undefined); }}
                          onBlur={() => setErr('emergency_contact_phone', isValidPhone(formData.emergency_contact_phone).error)}
                          inputMode="numeric"
                          className={errCls('emergency_contact_phone')}
                        />
                        {errors.emergency_contact_phone && <p className="text-xs text-red-600 mt-1">{errors.emergency_contact_phone}</p>}
                      </div>
                    </div>

                    {/* Profile Photo */}
                    <div className="space-y-2">
                      <Label>Profile Photo</Label>
                      <ImageUpload
                        value={formData.profile_image_url}
                        onChange={(url) => setFormData({ ...formData, profile_image_url: url })}
                        bucket="delivery-documents"
                        folder="profile"
                      />
                    </div>

                    {/* ID Proof Documents */}
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Proof of Identification</Label>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Aadhaar Card (Front)</Label>
                          <ImageUpload
                            value={formData.aadhar_front_url}
                            onChange={(url) => setFormData({ ...formData, aadhar_front_url: url })}
                            bucket="delivery-documents"
                            folder="aadhaar"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Aadhaar Card (Back)</Label>
                          <ImageUpload
                            value={formData.aadhar_back_url}
                            onChange={(url) => setFormData({ ...formData, aadhar_back_url: url })}
                            bucket="delivery-documents"
                            folder="aadhaar"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Driving License (Front)</Label>
                          <ImageUpload
                            value={formData.license_front_url}
                            onChange={(url) => setFormData({ ...formData, license_front_url: url })}
                            bucket="delivery-documents"
                            folder="license"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Driving License (Back)</Label>
                          <ImageUpload
                            value={formData.license_back_url}
                            onChange={(url) => setFormData({ ...formData, license_back_url: url })}
                            bucket="delivery-documents"
                            folder="license"
                          />
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createPartnerMutation.isPending || updatePartnerMutation.isPending}
                      >
                        {editingPartnerId
                          ? (updatePartnerMutation.isPending ? 'Saving...' : 'Save changes')
                          : (createPartnerMutation.isPending ? 'Adding...' : 'Add Partner')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredPartners?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No delivery partners found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Deliveries</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Linked</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPartners?.map((partner) => (
                    <TableRow key={partner.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{partner.full_name || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{partner.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{partner.phone || '-'}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{getVehicleIcon(partner.vehicle_type)}</span>
                          <div>
                            <p className="font-medium capitalize">{partner.vehicle_type}</p>
                            <p className="text-xs text-muted-foreground">{partner.vehicle_number || '-'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-500">★</span>
                          <span>{partner.rating?.toFixed(1) || '0.0'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{partner.total_deliveries || 0}</TableCell>
                      <TableCell>
                        {/* Treat verified if either flag is set — verifyPartnerMutation
                            writes both, but old rows / manual edits may leave one out. */}
                        {(partner.is_verified || (partner as any).document_verified_at) ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        {partner.user_id ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                            Pending Signup
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {partner.account_status === 'suspended' ? (
                          <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200">
                            Suspended
                          </Badge>
                        ) : (
                          <Badge className={getStatusColor(partner.status)} variant="secondary">
                            {(partner.status ?? '').replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit partner"
                            aria-label="Edit partner"
                            onClick={() => handleStartEditPartner(partner)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedPartner(partner)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStartEditPartner(partner)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit Partner
                            </DropdownMenuItem>
                            {!partner.is_verified && (
                              <DropdownMenuItem onClick={() => verifyPartnerMutation.mutate(partner.id)}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Verify
                              </DropdownMenuItem>
                            )}
                            {partner.account_status === 'suspended' ? (
                              <DropdownMenuItem onClick={() => reactivateMutation.mutate(partner.id)}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Reactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setSuspendDialog({ id: partner.id, name: partner.full_name || 'this partner' })}
                              >
                                <Ban className="w-4 h-4 mr-2" />
                                Suspend
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Partner Details Dialog */}
      <Dialog open={!!selectedPartner} onOpenChange={() => setSelectedPartner(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delivery Partner Details</DialogTitle>
          </DialogHeader>
          {selectedPartner && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {selectedPartner.profile_image_url && (
                    <img src={selectedPartner.profile_image_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">{selectedPartner.full_name || 'N/A'}</h3>
                    <Badge className={getStatusColor(selectedPartner.status)} variant="secondary">
                      {(selectedPartner.status ?? '').replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const p = selectedPartner;
                    setSelectedPartner(null);
                    handleStartEditPartner(p);
                  }}
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              </div>

              <PartnerNetToTransferBlock partnerId={selectedPartner.id} />

              <div className="grid grid-cols-1 gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Phone:</span> {selectedPartner.phone || '-'}</div>
                <div><span className="text-muted-foreground">Alternate Phone:</span> {selectedPartner.alternate_phone || '-'}</div>
                <div><span className="text-muted-foreground">Email:</span> {selectedPartner.email || '-'}</div>
                <div><span className="text-muted-foreground">Vehicle:</span> {selectedPartner.vehicle_type} - {selectedPartner.vehicle_number || '-'}</div>
                <div><span className="text-muted-foreground">Rating:</span> ★ {selectedPartner.rating?.toFixed(1) || '0.0'}</div>
                <div><span className="text-muted-foreground">Deliveries:</span> {selectedPartner.total_deliveries || 0}</div>
                <div><span className="text-muted-foreground">Credit Balance:</span> ₹{Number(selectedPartner.credit_balance || 0).toLocaleString()}</div>
                <div className="flex items-center gap-1"><span className="text-muted-foreground">Verified:</span> {selectedPartner.is_verified ? <><CheckCircle className="w-4 h-4 text-green-500 inline" /> Yes</> : <><XCircle className="w-4 h-4 text-red-500 inline" /> No</>}</div>
                <div><span className="text-muted-foreground">DOB:</span> {selectedPartner.date_of_birth || '-'}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-1">
                <p className="font-medium mb-2">Address</p>
                <p>{selectedPartner.address_line1 || '-'}</p>
                {selectedPartner.address_line2 && <p>{selectedPartner.address_line2}</p>}
                <p>{selectedPartner.city && `${selectedPartner.city}, `}{selectedPartner.state && `${selectedPartner.state} `}{selectedPartner.pincode && `- ${selectedPartner.pincode}`}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">License:</span> {selectedPartner.license_number || '-'}</div>
                <div><span className="text-muted-foreground">Aadhar:</span> {selectedPartner.aadhar_number || '-'}</div>
                <div><span className="text-muted-foreground">PAN:</span> {selectedPartner.pan_number || '-'}</div>
                <div><span className="text-muted-foreground">Emergency:</span> {selectedPartner.emergency_contact_name || '-'}{selectedPartner.emergency_contact_relation ? ` (${selectedPartner.emergency_contact_relation})` : ''} - {selectedPartner.emergency_contact_phone || '-'}</div>
              </div>

              {/* Bank details */}
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <p className="font-medium mb-2">Bank Details</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Bank:</span> {selectedPartner.bank_name || '-'}</div>
                  <div><span className="text-muted-foreground">Account Holder:</span> {selectedPartner.account_holder_name || '-'}</div>
                  <div><span className="text-muted-foreground">Account No:</span> {(selectedPartner as any).bank_account_number || '-'}</div>
                  <div><span className="text-muted-foreground">IFSC:</span> {(selectedPartner as any).ifsc_code || '-'}</div>
                </div>
              </div>

              {/* Documents */}
              {(selectedPartner.aadhar_front_url || selectedPartner.aadhar_back_url || selectedPartner.license_front_url || selectedPartner.license_back_url) && (
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <p className="font-medium mb-2">Documents</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Aadhar Front', url: selectedPartner.aadhar_front_url },
                      { label: 'Aadhar Back', url: selectedPartner.aadhar_back_url },
                      { label: 'License Front', url: selectedPartner.license_front_url },
                      { label: 'License Back', url: selectedPartner.license_back_url },
                    ].filter(d => d.url).map(d => (
                      <a key={d.label} href={d.url} target="_blank" rel="noreferrer" className="block">
                        <img src={d.url} alt={d.label} className="w-full h-20 object-cover rounded-md border" />
                        <span className="text-[11px] text-muted-foreground mt-1 block">{d.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Suspend Confirmation Dialog */}
      <Dialog open={!!suspendDialog} onOpenChange={(open) => { if (!open) { setSuspendDialog(null); setSuspendReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Delivery Partner</DialogTitle>
            <DialogDescription>
              {suspendDialog && (
                <>Are you sure you want to suspend <span className="font-semibold text-foreground">{suspendDialog.name}</span>? They will not be able to log in or accept new orders. In-flight orders are unaffected.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="suspend-reason">Reason for suspension <span className="text-destructive">*</span></Label>
            <Textarea
              id="suspend-reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Explain why this partner is being suspended..."
              rows={3}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Stored on the partner record for audit / dispute history.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSuspendDialog(null); setSuspendReason(''); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={suspendMutation.isPending || suspendReason.trim().length < 3}
              onClick={() => suspendDialog && suspendMutation.mutate({ partnerId: suspendDialog.id, reason: suspendReason.trim() })}
            >
              {suspendMutation.isPending ? 'Suspending...' : 'Suspend Partner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminDelivery;
