import React, { useState } from 'react';
import { sanitizePhone, formatPhoneForStorage } from '@/lib/phone';
import {
  formatDigits, formatUpper,
  isValidPhone, isValidEmail, isValidAadhar, isValidPAN, isValidGST,
  isValidFSSAI, isValidIFSC, isValidBankAccount, isValidPincode,
  isValidDrivingLicense, collectErrors, isPresent,
} from '@/lib/validators';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Eye, MoreVertical, CheckCircle, XCircle, Ban, Pencil } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type VendorStatus = Database['public']['Enums']['vendor_status'];

interface VendorFormData {
  email: string;
  business_name: string;
  owner_name: string;
  phone: string;
  alternate_phone: string;
  store_address: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  gst_number: string;
  pan_number: string;
  owner_aadhar_number: string;
  fssai_number: string;
  business_license: string;
  bank_account_number: string;
  ifsc_code: string;
  // Vendor-first catalog: ONE root category + multi subcategory selection.
  // Drives the customer browse: tap category → see this vendor; tap
  // subcategory pill on this vendor's store → filter their products.
  category_id: string;
  subcategory_ids: string[];
}

const initialFormData: VendorFormData = {
  email: '',
  business_name: '',
  owner_name: '',
  phone: '',
  alternate_phone: '',
  store_address: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pincode: '',
  gst_number: '',
  pan_number: '',
  owner_aadhar_number: '',
  fssai_number: '',
  business_license: '',
  bank_account_number: '',
  ifsc_code: '',
  category_id: '',
  subcategory_ids: [],
};

const AdminVendors: React.FC = () => {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<VendorFormData>(initialFormData);
  // editingVendorId === null → Add mode. Non-null → Edit mode for that id.
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    vendorId: string;
    action: 'approve' | 'reject' | 'suspend';
    vendorName: string;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['admin-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // All categories — used for the Category + Subcategories selects on the
  // Add/Edit Vendor dialog. Roots = parent_id IS NULL.
  const { data: allCategories } = useQuery({
    queryKey: ['admin-vendor-categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });
      return (data || []) as Array<{ id: string; name: string; slug: string; parent_id: string | null; is_active: boolean }>;
    },
  });
  const rootCategories = (allCategories || []).filter(c => !c.parent_id);

  // Helper: resolve a category name by id (used in the View Details modal).
  const categoryNameById = (id?: string | null) =>
    id ? (allCategories || []).find(c => c.id === id)?.name : null;

  const createVendorMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      const payload = {
        email: data.email,
        business_name: data.business_name,
        owner_name: data.owner_name,
        phone: formatPhoneForStorage(data.phone),
        alternate_phone: formatPhoneForStorage(data.alternate_phone),
        store_address: data.store_address,
        address_line1: data.address_line1,
        address_line2: data.address_line2,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        gst_number: data.gst_number,
        pan_number: data.pan_number,
        owner_aadhar_number: data.owner_aadhar_number,
        fssai_number: data.fssai_number,
        business_license: data.business_license,
        bank_account_number: data.bank_account_number,
        ifsc_code: data.ifsc_code,
        // Vendor-first catalog: category & subcategory selections.
        category_id: data.category_id || null,
        subcategory_ids: data.subcategory_ids,
      };
      const { data: rpcData, error } = await supabase.rpc('admin_create_vendor' as any, { payload });
      if (error) throw error;
      if (!(rpcData as any)?.ok) throw new Error((rpcData as any)?.error || 'Failed to add vendor');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
      toast({ title: 'Vendor added successfully' });
      setIsDialogOpen(false);
      setFormData(initialFormData);
      setEditingVendorId(null);
      setErrors({});
    },
    onError: (error: any) => {
      const raw = String(error?.message || '').toLowerCase();
      const looksMissing = raw.includes('does not exist') || raw.includes('could not find') || raw.includes('404');
      toast({
        title: 'Failed to add vendor',
        description: looksMissing
          ? "RPC 'admin_create_vendor' not found — Supabase migrations aren't deployed. Run `supabase db push` against the live project."
          : (error?.message || 'Server error — check the audit log or try again'),
        variant: 'destructive',
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ vendorId, status }: { vendorId: string; status: VendorStatus }) => {
      const { error } = await supabase
        .from('vendors')
        .update({ status })
        .eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
      toast({ title: `Vendor ${status === 'active' ? 'approved' : status} successfully` });
    },
    onError: () => {
      toast({ title: 'Failed to update vendor status', variant: 'destructive' });
    },
  });

  // Edit existing vendor — direct UPDATE (no RPC). Matches the pattern
  // updateStatusMutation already uses. Only updates fields that the form
  // surfaces; intentionally avoids touching credit / payout / status.
  const updateVendorMutation = useMutation({
    mutationFn: async ({ vendorId, data }: { vendorId: string; data: VendorFormData }) => {
      const patch: any = {
        business_name: data.business_name,
        owner_name: data.owner_name || null,
        phone: formatPhoneForStorage(data.phone),
        alternate_phone: formatPhoneForStorage(data.alternate_phone),
        store_address: data.store_address || null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        gst_number: data.gst_number || null,
        pan_number: data.pan_number || null,
        owner_aadhar_number: data.owner_aadhar_number || null,
        fssai_number: data.fssai_number || null,
        business_license: data.business_license || null,
        bank_account_number: data.bank_account_number || null,
        ifsc_code: data.ifsc_code || null,
        // Vendor-first catalog
        category_id: data.category_id || null,
        subcategory_ids: data.subcategory_ids,
        // Email intentionally not in the patch — changing primary key would
        // break the auth-linkage gate downstream. Edit emails via a
        // separate flow if ever needed.
      };
      const { error } = await supabase.from('vendors').update(patch).eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
      toast({ title: 'Vendor updated successfully' });
      setIsDialogOpen(false);
      setFormData(initialFormData);
      setEditingVendorId(null);
      setErrors({});
    },
    onError: (err: any) => {
      toast({ title: err?.message || 'Failed to update vendor', variant: 'destructive' });
    },
  });

  // Open the dialog in Edit mode, pre-fill with the vendor's current values.
  const handleStartEdit = (vendor: any) => {
    setEditingVendorId(vendor.id);
    setFormData({
      email: vendor.email || '',
      business_name: vendor.business_name || '',
      owner_name: vendor.owner_name || '',
      // Strip the leading +91 we store with for display; reformat on save.
      phone: (vendor.phone || '').replace(/^\+91/, ''),
      alternate_phone: (vendor.alternate_phone || '').replace(/^\+91/, ''),
      store_address: vendor.store_address || '',
      address_line1: vendor.address_line1 || '',
      address_line2: vendor.address_line2 || '',
      city: vendor.city || '',
      state: vendor.state || '',
      pincode: vendor.pincode || '',
      gst_number: vendor.gst_number || '',
      pan_number: vendor.pan_number || '',
      owner_aadhar_number: vendor.owner_aadhar_number || '',
      fssai_number: vendor.fssai_number || '',
      business_license: vendor.business_license || '',
      bank_account_number: vendor.bank_account_number || '',
      ifsc_code: vendor.ifsc_code || '',
      category_id: vendor.category_id || '',
      subcategory_ids: Array.isArray(vendor.subcategory_ids) ? vendor.subcategory_ids : [],
    });
    setErrors({});
    setIsDialogOpen(true);
  };

  const handleAction = (vendorId: string, action: 'approve' | 'reject' | 'suspend', vendorName: string) => {
    setConfirmDialog({ open: true, vendorId, action, vendorName });
  };

  const confirmAction = () => {
    if (!confirmDialog) return;
    const statusMap: Record<string, VendorStatus> = {
      approve: 'active',
      reject: 'inactive',
      suspend: 'suspended',
    };
    updateStatusMutation.mutate({
      vendorId: confirmDialog.vendorId,
      status: statusMap[confirmDialog.action],
    });
    setConfirmDialog(null);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'text-emerald-700',
      pending: 'text-amber-700',
      inactive: 'text-slate-500',
      suspended: 'text-red-700',
    };
    return colors[status] || 'text-slate-600';
  };

  const filteredVendors = vendors?.filter(
    (vendor) =>
      vendor.business_name.toLowerCase().includes(search.toLowerCase()) ||
      vendor.email?.toLowerCase().includes(search.toLowerCase()) ||
      vendor.owner_name?.toLowerCase().includes(search.toLowerCase())
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
    const errs = collectErrors({
      email: isPresent(formData.email).ok ? isValidEmail(formData.email) : { ok: false, error: 'Email required' },
      business_name: isPresent(formData.business_name),
      phone: isValidPhone(formData.phone),
      alternate_phone: isValidPhone(formData.alternate_phone),
      pincode: isValidPincode(formData.pincode),
      gst_number: isValidGST(formData.gst_number),
      pan_number: isValidPAN(formData.pan_number),
      owner_aadhar_number: isValidAadhar(formData.owner_aadhar_number),
      fssai_number: isValidFSSAI(formData.fssai_number),
      business_license: isValidDrivingLicense(formData.business_license),
      bank_account_number: isValidBankAccount(formData.bank_account_number),
      ifsc_code: isValidIFSC(formData.ifsc_code),
    });
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast({ title: 'Fix highlighted fields', variant: 'destructive' });
      return;
    }
    setErrors({});
    if (editingVendorId) {
      updateVendorMutation.mutate({ vendorId: editingVendorId, data: formData });
    } else {
      createVendorMutation.mutate(formData);
    }
  };

  return (
    <DashboardLayout
      title="Vendors Management"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50/90">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="text-slate-900">All Vendors</CardTitle>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full rounded-md border-slate-300 sm:w-[200px]"
                />
              </div>
              <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  if (!open) {
                    setEditingVendorId(null);
                    setFormData(initialFormData);
                    setErrors({});
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button className="rounded-md" onClick={() => { setEditingVendorId(null); setFormData(initialFormData); setErrors({}); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Vendor
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingVendorId ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
                    <DialogDescription>
                      {editingVendorId
                        ? 'Update vendor details, category and subcategories. Email is locked.'
                        : 'Pre-register a vendor by email. They can sign up using this email.'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="vendor@example.com"
                          value={formData.email}
                          onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setErr('email', undefined); }}
                          onBlur={() => setErr('email', isValidEmail(formData.email).error)}
                          className={errCls('email')}
                          required
                          // Editing: email is the auth-link key; lock it so
                          // accidental changes don't orphan the auth.users row.
                          disabled={!!editingVendorId}
                        />
                        {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="business_name">Business Name *</Label>
                        <Input
                          id="business_name"
                          placeholder="Store Name"
                          value={formData.business_name}
                          onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="owner_name">Owner Name</Label>
                        <Input
                          id="owner_name"
                          placeholder="John Doe"
                          value={formData.owner_name}
                          onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                        />
                      </div>
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
                        />
                        {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Store Address</Label>
                      <Input
                        placeholder="Store address"
                        value={formData.store_address}
                        onChange={(e) => setFormData({ ...formData, store_address: e.target.value })}
                        className="mb-2"
                      />
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

                    {/* Catalog — drives the new customer browse */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="category_id">Catalog category</Label>
                        <Select
                          value={formData.category_id || 'none'}
                          onValueChange={(val) =>
                            setFormData({
                              ...formData,
                              category_id: val === 'none' ? '' : val,
                              // changing root → reset subcat selection
                              subcategory_ids: [],
                            })
                          }
                        >
                          <SelectTrigger id="category_id">
                            <SelectValue placeholder="Pick the category this store belongs to" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Not set —</SelectItem>
                            {rootCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Customer "View All Categories" shows this store under the picked category.
                        </p>
                      </div>

                      {/* Subcategory checkboxes removed: products can be filed
                          under ANY subcategory of the picked category. Manage
                          the subcategory list itself at /admin/subcategories. */}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="gst_number">GST Number</Label>
                        <Input
                          id="gst_number"
                          placeholder="22ABCDE1234F1Z5"
                          value={formData.gst_number}
                          onChange={(e) => { setFormData({ ...formData, gst_number: formatUpper(e.target.value, 15) }); setErr('gst_number', undefined); }}
                          onBlur={() => setErr('gst_number', isValidGST(formData.gst_number).error)}
                          className={errCls('gst_number')}
                        />
                        {errors.gst_number && <p className="text-xs text-red-600 mt-1">{errors.gst_number}</p>}
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
                        <Label htmlFor="owner_aadhar_number">Owner Aadhar Number</Label>
                        <Input
                          id="owner_aadhar_number"
                          placeholder="12 digits"
                          value={formData.owner_aadhar_number}
                          onChange={(e) => { setFormData({ ...formData, owner_aadhar_number: formatDigits(e.target.value, 12) }); setErr('owner_aadhar_number', undefined); }}
                          onBlur={() => setErr('owner_aadhar_number', isValidAadhar(formData.owner_aadhar_number).error)}
                          inputMode="numeric"
                          className={errCls('owner_aadhar_number')}
                        />
                        {errors.owner_aadhar_number && <p className="text-xs text-red-600 mt-1">{errors.owner_aadhar_number}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fssai_number">FSSAI Number</Label>
                        <Input
                          id="fssai_number"
                          placeholder="14 digits"
                          value={formData.fssai_number}
                          onChange={(e) => { setFormData({ ...formData, fssai_number: formatDigits(e.target.value, 14) }); setErr('fssai_number', undefined); }}
                          onBlur={() => setErr('fssai_number', isValidFSSAI(formData.fssai_number).error)}
                          inputMode="numeric"
                          className={errCls('fssai_number')}
                        />
                        {errors.fssai_number && <p className="text-xs text-red-600 mt-1">{errors.fssai_number}</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="business_license">Business License</Label>
                      <Input
                        id="business_license"
                        placeholder="License number"
                        value={formData.business_license}
                        onChange={(e) => { setFormData({ ...formData, business_license: formatUpper(e.target.value, 16) }); setErr('business_license', undefined); }}
                        onBlur={() => setErr('business_license', isValidDrivingLicense(formData.business_license).error)}
                        className={errCls('business_license')}
                      />
                      {errors.business_license && <p className="text-xs text-red-600 mt-1">{errors.business_license}</p>}
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

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createVendorMutation.isPending || updateVendorMutation.isPending}
                      >
                        {editingVendorId
                          ? (updateVendorMutation.isPending ? 'Saving...' : 'Save Changes')
                          : (createVendorMutation.isPending ? 'Adding...' : 'Add Vendor')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredVendors?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No vendors found</div>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {filteredVendors?.map((vendor) => (
                  <div key={vendor.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{vendor.business_name}</p>
                        <p className="text-xs text-slate-500">{vendor.email}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit vendor"
                          aria-label="Edit vendor"
                          className="rounded-md text-slate-600 hover:bg-white hover:text-slate-900"
                          onClick={() => handleStartEdit(vendor)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-md text-slate-600 hover:bg-white hover:text-slate-900">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedVendor(vendor)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStartEdit(vendor)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit Vendor
                          </DropdownMenuItem>
                          {vendor.status !== 'active' && (
                            <DropdownMenuItem onClick={() => handleAction(vendor.id, 'approve', vendor.business_name)}>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Approve
                            </DropdownMenuItem>
                          )}
                          {vendor.status === 'pending' && (
                            <DropdownMenuItem onClick={() => handleAction(vendor.id, 'reject', vendor.business_name)}>
                              <XCircle className="w-4 h-4 mr-2" />
                              Reject
                            </DropdownMenuItem>
                          )}
                          {vendor.status === 'active' && (
                            <DropdownMenuItem className="text-destructive" onClick={() => handleAction(vendor.id, 'suspend', vendor.business_name)}>
                              <Ban className="w-4 h-4 mr-2" />
                              Suspend
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Owner</span>
                        <span className="text-slate-700">{vendor.owner_name || '-'}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Contact</span>
                        <div className="text-right">
                          <p className="text-slate-700">{vendor.phone || '-'}</p>
                          {vendor.store_address && <p className="text-xs text-slate-500">{vendor.store_address}</p>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Rating</span>
                        <span className="font-medium text-slate-900">â˜… {vendor.rating?.toFixed(1) || '0.0'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Orders</span>
                        <span className="font-medium text-slate-900">{vendor.total_orders || 0}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Linked</span>
                        {vendor.user_id ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                            <CheckCircle className="h-4 w-4" />
                            Linked
                          </span>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-700">
                            Pending Signup
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Status</span>
                        <span className={`text-sm font-semibold capitalize ${getStatusColor(vendor.status)}`}>
                          {vendor.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                <TableHeader className="bg-slate-100">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Business Name</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Owner</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Contact</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Address</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Rating</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Orders</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Linked</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Status</TableHead>
                    <TableHead className="h-14 px-5 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors?.map((vendor) => (
                    <TableRow key={vendor.id} className="border-slate-200 hover:bg-white">
                      <TableCell className="px-5 py-5">
                        <div>
                          <p className="font-medium text-slate-900">{vendor.business_name}</p>
                          <p className="text-xs text-slate-500">{vendor.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-5 text-sm text-slate-700">{vendor.owner_name || '-'}</TableCell>
                      <TableCell className="px-5 py-5">
                        <p className="text-sm text-slate-700">{vendor.phone || vendor.alternate_phone || '-'}</p>
                      </TableCell>
                      <TableCell className="px-5 py-5">
                        {(() => {
                          const composed = (vendor as any).store_address
                            || [(vendor as any).address_line1, (vendor as any).address_line2, (vendor as any).city, (vendor as any).pincode]
                                .filter(Boolean).join(', ');
                          if (!composed) return <span className="text-sm text-slate-400">-</span>;
                          return (
                            <p className="text-sm text-slate-700 line-clamp-2 max-w-[260px]" title={composed}>{composed}</p>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="px-5 py-5">
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-500">★</span>
                          <span>{vendor.rating?.toFixed(1) || '0.0'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-5 text-sm font-medium text-slate-900">{vendor.total_orders || 0}</TableCell>
                      <TableCell className="px-5 py-5">
                        {vendor.user_id ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-700">
                            Pending Signup
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-5">
                        <span className={`text-sm font-semibold capitalize ${getStatusColor(vendor.status)}`}>
                          {vendor.status}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-5 text-right">
                        <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit vendor"
                          aria-label="Edit vendor"
                          className="rounded-md text-slate-600 hover:bg-white hover:text-slate-900"
                          onClick={() => handleStartEdit(vendor)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-md text-slate-600 hover:bg-white hover:text-slate-900">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedVendor(vendor)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStartEdit(vendor)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit Vendor
                            </DropdownMenuItem>
                            {vendor.status !== 'active' && (
                              <DropdownMenuItem onClick={() => handleAction(vendor.id, 'approve', vendor.business_name)}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Approve
                              </DropdownMenuItem>
                            )}
                            {vendor.status === 'pending' && (
                              <DropdownMenuItem onClick={() => handleAction(vendor.id, 'reject', vendor.business_name)}>
                                <XCircle className="w-4 h-4 mr-2" />
                                Reject
                              </DropdownMenuItem>
                            )}
                            {vendor.status === 'active' && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleAction(vendor.id, 'suspend', vendor.business_name)}
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Vendor Details Dialog */}
      <Dialog open={!!selectedVendor} onOpenChange={() => setSelectedVendor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vendor Details</DialogTitle>
          </DialogHeader>
          {selectedVendor && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{selectedVendor.business_name}</h3>
                <Badge className={getStatusColor(selectedVendor.status)} variant="secondary">
                  {selectedVendor.status}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Owner:</span> {selectedVendor.owner_name || '-'}</div>
                <div><span className="text-muted-foreground">Phone:</span> {selectedVendor.phone || '-'}</div>
                <div><span className="text-muted-foreground">Alternate Phone:</span> {(selectedVendor as any).alternate_phone || '-'}</div>
                <div><span className="text-muted-foreground">Email:</span> {selectedVendor.email || '-'}</div>
                <div><span className="text-muted-foreground">Rating:</span> ★ {selectedVendor.rating?.toFixed(1) || '0.0'}</div>
                <div><span className="text-muted-foreground">Orders:</span> {selectedVendor.total_orders || 0}</div>
                <div><span className="text-muted-foreground">Commission:</span> {selectedVendor.commission_rate || 0}%</div>
                <div>
                  <span className="text-muted-foreground">Catalog category:</span>{' '}
                  {categoryNameById((selectedVendor as any).category_id) || <em className="text-amber-700">Not set</em>}
                </div>
                <div>
                  <span className="text-muted-foreground">Subcategories:</span>{' '}
                  {Array.isArray((selectedVendor as any).subcategory_ids) && (selectedVendor as any).subcategory_ids.length > 0
                    ? (selectedVendor as any).subcategory_ids
                        .map((id: string) => categoryNameById(id))
                        .filter(Boolean)
                        .join(', ')
                    : '—'}
                </div>
              </div>
              {(() => {
                const parts = [
                  selectedVendor.store_address,
                  (selectedVendor as any).address_line1,
                  (selectedVendor as any).address_line2,
                  selectedVendor.city,
                  selectedVendor.state,
                  selectedVendor.pincode,
                ].filter(Boolean);
                if (parts.length === 0) return null;
                return (
                  <div className="bg-muted/50 rounded-lg p-4 text-sm">
                    <span className="text-muted-foreground">Address:</span> {parts.join(', ')}
                  </div>
                );
              })()}
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">GST:</span> {selectedVendor.gst_number || '-'}</div>
                <div><span className="text-muted-foreground">FSSAI:</span> {selectedVendor.fssai_number || '-'}</div>
                <div><span className="text-muted-foreground">PAN:</span> {selectedVendor.pan_number || '-'}</div>
                <div><span className="text-muted-foreground">Owner Aadhar:</span> {(selectedVendor as any).owner_aadhar_number || '-'}</div>
                <div><span className="text-muted-foreground">License:</span> {selectedVendor.business_license || '-'}</div>
              </div>

              {/* Bank details */}
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <p className="font-medium mb-2">Bank Details</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Bank:</span> {(selectedVendor as any).bank_name || '-'}</div>
                  <div><span className="text-muted-foreground">Account Holder:</span> {(selectedVendor as any).account_holder_name || '-'}</div>
                  <div><span className="text-muted-foreground">Account No:</span> {(selectedVendor as any).bank_account_number || '-'}</div>
                  <div><span className="text-muted-foreground">IFSC:</span> {(selectedVendor as any).ifsc_code || '-'}</div>
                </div>
              </div>

              {/* Photos / documents */}
              {((selectedVendor as any).owner_photo_url || (selectedVendor as any).store_photo_url || (selectedVendor as any).fssai_certificate_url) && (
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <p className="font-medium mb-2">Photos & Documents</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Owner Photo', url: (selectedVendor as any).owner_photo_url },
                      { label: 'Store Photo', url: (selectedVendor as any).store_photo_url },
                      { label: 'FSSAI Certificate', url: (selectedVendor as any).fssai_certificate_url },
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

      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.action === 'approve' && 'Approve Vendor'}
              {confirmDialog?.action === 'reject' && 'Reject Vendor'}
              {confirmDialog?.action === 'suspend' && 'Suspend Vendor'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.action === 'approve' && 
                `Are you sure you want to approve "${confirmDialog.vendorName}"? They will be able to list products.`}
              {confirmDialog?.action === 'reject' && 
                `Are you sure you want to reject "${confirmDialog?.vendorName}"? Their application will be marked as inactive.`}
              {confirmDialog?.action === 'suspend' && 
                `Are you sure you want to suspend "${confirmDialog?.vendorName}"? They will not be able to receive new orders.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmAction}
              className={confirmDialog?.action === 'suspend' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {confirmDialog?.action === 'approve' && 'Approve'}
              {confirmDialog?.action === 'reject' && 'Reject'}
              {confirmDialog?.action === 'suspend' && 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardLayout>
  );
};

export default AdminVendors;
