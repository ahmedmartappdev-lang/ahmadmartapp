import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout, vendorNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { ImageUpload } from '@/components/ui/image-upload';
import {
  formatDigits, formatUpper,
  isValidPhone, isValidEmail, isValidAadhar, isValidPAN, isValidGST,
  isValidFSSAI, isValidIFSC, isValidBankAccount, isValidDrivingLicense,
  collectErrors,
} from '@/lib/validators';
import { CatalogCategorySection } from '@/components/vendor/CatalogCategorySection';

const VendorSettings: React.FC = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [businessName, setBusinessName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeLatitude, setStoreLatitude] = useState('');
  const [storeLongitude, setStoreLongitude] = useState('');

  // Identity / contact
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');

  // Business identifiers
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [ownerAadharNumber, setOwnerAadharNumber] = useState('');
  const [fssaiNumber, setFssaiNumber] = useState('');
  const [businessLicense, setBusinessLicense] = useState('');

  // Bank fields
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');

  const [storePhotoUrl, setStorePhotoUrl] = useState('');

  // Per-field error map. Keys match the input ids.
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: vendor } = useQuery({
    queryKey: ['vendor-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (vendor) {
      setBusinessName(vendor.business_name || '');
      setStoreAddress(vendor.store_address || '');
      setStoreLatitude(vendor.store_latitude != null ? String(vendor.store_latitude) : '');
      setStoreLongitude(vendor.store_longitude != null ? String(vendor.store_longitude) : '');
      setOwnerName((vendor as any).owner_name || '');
      setEmail((vendor as any).email || '');
      // Stored as +91xxxxxxxxxx; strip prefix for editing
      const altRaw = (vendor as any).alternate_phone || '';
      setAlternatePhone(altRaw.replace(/^\+91/, ''));
      setGstNumber((vendor as any).gst_number || '');
      setPanNumber((vendor as any).pan_number || '');
      setOwnerAadharNumber((vendor as any).owner_aadhar_number || '');
      setFssaiNumber((vendor as any).fssai_number || '');
      setBusinessLicense((vendor as any).business_license || '');
      setBankAccountNumber(vendor.bank_account_number || '');
      setIfscCode(vendor.ifsc_code || '');
      setBankName((vendor as any).bank_name || '');
      setAccountHolderName((vendor as any).account_holder_name || '');
      setStorePhotoUrl(vendor.store_photo_url || '');
    }
  }, [vendor]);

  const setErr = (key: string, msg: string | undefined) =>
    setErrors(prev => {
      const next = { ...prev };
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });

  const errCls = (key: string) =>
    errors[key] ? 'border-red-300 focus-visible:ring-red-300' : '';

  const toggleOrdersMutation = useMutation({
    mutationFn: async (accepting: boolean) => {
      if (!vendor?.id) return;
      const { error } = await supabase
        .from('vendors')
        .update({ is_accepting_orders: accepting })
        .eq('id', vendor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
      toast({ title: 'Settings updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update settings', variant: 'destructive' });
    },
  });

  const storeSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!vendor?.id) return;
      const { error } = await supabase
        .from('vendors')
        .update({ business_name: businessName, store_address: storeAddress, store_photo_url: storePhotoUrl || null })
        .eq('id', vendor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
      toast({ title: 'Store settings saved' });
    },
    onError: () => {
      toast({ title: 'Failed to save store settings', variant: 'destructive' });
    },
  });

  const storeLocationMutation = useMutation({
    mutationFn: async () => {
      if (!vendor?.id) return;
      const { error } = await supabase
        .from('vendors')
        .update({
          store_latitude: storeLatitude ? parseFloat(storeLatitude) : null,
          store_longitude: storeLongitude ? parseFloat(storeLongitude) : null,
        })
        .eq('id', vendor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
      toast({ title: 'Store location saved' });
    },
    onError: () => {
      toast({ title: 'Failed to save store location', variant: 'destructive' });
    },
  });

  const businessProfileMutation = useMutation({
    mutationFn: async () => {
      if (!vendor?.id) return;
      const errs = collectErrors({
        email: isValidEmail(email),
        alternate_phone: isValidPhone(alternatePhone),
        gst_number: isValidGST(gstNumber),
        pan_number: isValidPAN(panNumber),
        owner_aadhar_number: isValidAadhar(ownerAadharNumber),
        fssai_number: isValidFSSAI(fssaiNumber),
        business_license: isValidDrivingLicense(businessLicense),
      });
      if (Object.keys(errs).length > 0) {
        setErrors(prev => ({ ...prev, ...errs }));
        throw new Error('Fix highlighted fields');
      }
      const { error } = await supabase
        .from('vendors')
        .update({
          owner_name: ownerName || null,
          email: email || null,
          alternate_phone: alternatePhone ? `+91${alternatePhone}` : null,
          gst_number: gstNumber || null,
          pan_number: panNumber || null,
          owner_aadhar_number: ownerAadharNumber || null,
          fssai_number: fssaiNumber || null,
          business_license: businessLicense || null,
        } as any)
        .eq('id', vendor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
      toast({ title: 'Business profile saved' });
    },
    onError: (e: any) => {
      toast({ title: e?.message || 'Failed to save business profile', variant: 'destructive' });
    },
  });

  const bankDetailsMutation = useMutation({
    mutationFn: async () => {
      if (!vendor?.id) return;
      const errs = collectErrors({
        bank_account_number: isValidBankAccount(bankAccountNumber),
        ifsc_code: isValidIFSC(ifscCode),
      });
      if (Object.keys(errs).length > 0) {
        setErrors(prev => ({ ...prev, ...errs }));
        throw new Error('Fix highlighted fields');
      }
      const { error } = await supabase
        .from('vendors')
        .update({
          bank_account_number: bankAccountNumber,
          ifsc_code: ifscCode,
          bank_name: bankName,
          account_holder_name: accountHolderName
        })
        .eq('id', vendor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
      toast({ title: 'Bank details updated' });
    },
    onError: (e: any) => {
      toast({ title: e?.message || 'Failed to update bank details', variant: 'destructive' });
    },
  });

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Geolocation is not supported by your browser', variant: 'destructive' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStoreLatitude(String(position.coords.latitude));
        setStoreLongitude(String(position.coords.longitude));
        toast({ title: 'Location detected successfully' });
      },
      (error) => {
        toast({ title: 'Failed to get current location', description: error.message, variant: 'destructive' });
      }
    );
  };

  // Vendor's primary phone is the auth phone — read-only here, mirrors DeliverySettings.
  const primaryPhone = (vendor as any)?.phone || '';

  return (
    <DashboardLayout
      title="Settings"
      navItems={vendorNavItems}
      roleColor="bg-purple-500 text-white"
      roleName="Vendor Panel"
    >
      <div className="space-y-6 max-w-2xl">
        {/* Store Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Store Settings</CardTitle>
            <CardDescription>Manage your store preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Store Photo</Label>
              <ImageUpload
                value={storePhotoUrl}
                onChange={setStorePhotoUrl}
                bucket="product-images"
                folder="store-photos"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeAddress">Store Address</Label>
              <Input
                id="storeAddress"
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
              />
            </div>
            <Button
              onClick={() => storeSettingsMutation.mutate()}
              disabled={storeSettingsMutation.isPending}
            >
              {storeSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Business Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Business Profile</CardTitle>
            <CardDescription>Owner contact + business identifiers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Catalog category — admin sets the root. Vendor manages
                their subcategory list + can create new subs (RPC). */}
            <CatalogCategorySection vendor={vendor as any} />
            <div className="space-y-2">
              <Label htmlFor="ownerName">Owner Name</Label>
              <Input
                id="ownerName"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErr('email', undefined); }}
                onBlur={() => setErr('email', isValidEmail(email).error)}
                placeholder="owner@example.com"
                className={errCls('email')}
              />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={primaryPhone} readOnly className="bg-muted/40" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="alternatePhone">Alternate Phone</Label>
                <Input
                  id="alternatePhone"
                  value={alternatePhone}
                  onChange={(e) => { setAlternatePhone(formatDigits(e.target.value, 10)); setErr('alternate_phone', undefined); }}
                  onBlur={() => setErr('alternate_phone', isValidPhone(alternatePhone).error)}
                  inputMode="numeric"
                  placeholder="10-digit mobile"
                  className={errCls('alternate_phone')}
                />
                {errors.alternate_phone && <p className="text-xs text-red-600 mt-1">{errors.alternate_phone}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gstNumber">GST Number</Label>
              <Input
                id="gstNumber"
                value={gstNumber}
                onChange={(e) => { setGstNumber(formatUpper(e.target.value, 15)); setErr('gst_number', undefined); }}
                onBlur={() => setErr('gst_number', isValidGST(gstNumber).error)}
                placeholder="22ABCDE1234F1Z5"
                className={errCls('gst_number')}
              />
              {errors.gst_number && <p className="text-xs text-red-600 mt-1">{errors.gst_number}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="panNumber">PAN Number</Label>
              <Input
                id="panNumber"
                value={panNumber}
                onChange={(e) => { setPanNumber(formatUpper(e.target.value, 10)); setErr('pan_number', undefined); }}
                onBlur={() => setErr('pan_number', isValidPAN(panNumber).error)}
                placeholder="ABCDE1234F"
                className={errCls('pan_number')}
              />
              {errors.pan_number && <p className="text-xs text-red-600 mt-1">{errors.pan_number}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerAadhar">Owner Aadhar Number</Label>
              <Input
                id="ownerAadhar"
                value={ownerAadharNumber}
                onChange={(e) => { setOwnerAadharNumber(formatDigits(e.target.value, 12)); setErr('owner_aadhar_number', undefined); }}
                onBlur={() => setErr('owner_aadhar_number', isValidAadhar(ownerAadharNumber).error)}
                inputMode="numeric"
                placeholder="12 digit Aadhar"
                className={errCls('owner_aadhar_number')}
              />
              {errors.owner_aadhar_number && <p className="text-xs text-red-600 mt-1">{errors.owner_aadhar_number}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fssaiNumber">FSSAI Number</Label>
              <Input
                id="fssaiNumber"
                value={fssaiNumber}
                onChange={(e) => { setFssaiNumber(formatDigits(e.target.value, 14)); setErr('fssai_number', undefined); }}
                onBlur={() => setErr('fssai_number', isValidFSSAI(fssaiNumber).error)}
                inputMode="numeric"
                placeholder="14 digit FSSAI license"
                className={errCls('fssai_number')}
              />
              {errors.fssai_number && <p className="text-xs text-red-600 mt-1">{errors.fssai_number}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessLicense">Business License</Label>
              <Input
                id="businessLicense"
                value={businessLicense}
                onChange={(e) => { setBusinessLicense(formatUpper(e.target.value, 16)); setErr('business_license', undefined); }}
                onBlur={() => setErr('business_license', isValidDrivingLicense(businessLicense).error)}
                placeholder="License number"
                className={errCls('business_license')}
              />
              {errors.business_license && <p className="text-xs text-red-600 mt-1">{errors.business_license}</p>}
            </div>
            <Button
              onClick={() => businessProfileMutation.mutate()}
              disabled={businessProfileMutation.isPending}
            >
              {businessProfileMutation.isPending ? 'Saving...' : 'Save Business Profile'}
            </Button>
          </CardContent>
        </Card>

        {/* Store Location */}
        <Card>
          <CardHeader>
            <CardTitle>Store Location</CardTitle>
            <CardDescription>Set your store coordinates for delivery routing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="storeLatitude">Latitude</Label>
              <Input
                id="storeLatitude"
                type="number"
                step="any"
                value={storeLatitude}
                onChange={(e) => setStoreLatitude(e.target.value)}
                placeholder="e.g. 28.6139"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeLongitude">Longitude</Label>
              <Input
                id="storeLongitude"
                type="number"
                step="any"
                value={storeLongitude}
                onChange={(e) => setStoreLongitude(e.target.value)}
                placeholder="e.g. 77.2090"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleUseCurrentLocation}>
                Use Current Location
              </Button>
              <Button
                onClick={() => storeLocationMutation.mutate()}
                disabled={storeLocationMutation.isPending}
              >
                {storeLocationMutation.isPending ? 'Saving...' : 'Save Location'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Order Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Order Settings</CardTitle>
            <CardDescription>Configure order preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Accepting Orders</p>
                <p className="text-sm text-muted-foreground">Toggle to stop receiving new orders</p>
              </div>
              <Switch
                checked={vendor?.is_accepting_orders || false}
                onCheckedChange={(checked) => toggleOrdersMutation.mutate(checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Bank Details */}
        <Card>
          <CardHeader>
            <CardTitle>Bank Details</CardTitle>
            <CardDescription>For receiving payouts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank Name</Label>
              <Input
                id="bankName"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. State Bank of India"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountHolderName">Account Holder Name</Label>
              <Input
                id="accountHolderName"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="Name as registered in bank"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                value={bankAccountNumber}
                onChange={(e) => { setBankAccountNumber(formatDigits(e.target.value, 18)); setErr('bank_account_number', undefined); }}
                onBlur={() => setErr('bank_account_number', isValidBankAccount(bankAccountNumber).error)}
                inputMode="numeric"
                placeholder="9-18 digits"
                className={errCls('bank_account_number')}
              />
              {errors.bank_account_number && <p className="text-xs text-red-600 mt-1">{errors.bank_account_number}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ifsc">IFSC Code</Label>
              <Input
                id="ifsc"
                value={ifscCode}
                onChange={(e) => { setIfscCode(formatUpper(e.target.value, 11)); setErr('ifsc_code', undefined); }}
                onBlur={() => setErr('ifsc_code', isValidIFSC(ifscCode).error)}
                placeholder="HDFC0001234"
                className={errCls('ifsc_code')}
              />
              {errors.ifsc_code && <p className="text-xs text-red-600 mt-1">{errors.ifsc_code}</p>}
            </div>
            <Button
              onClick={() => bankDetailsMutation.mutate()}
              disabled={bankDetailsMutation.isPending}
            >
              {bankDetailsMutation.isPending ? 'Updating...' : 'Update Bank Details'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default VendorSettings;
