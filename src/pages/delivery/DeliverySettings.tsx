import React, { useState, useEffect } from 'react';
import { sanitizePhone, formatPhoneForStorage } from '@/lib/phone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout, deliveryNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bike, Car, Truck, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import {
  formatDigits, formatUpper,
  isValidPhone, isValidAadhar, isValidPAN, isValidIFSC,
  isValidBankAccount, isValidPincode, isValidVehicleNumber, isValidDrivingLicense,
  collectErrors,
} from '@/lib/validators';

const DeliverySettings: React.FC = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state for all editable fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [vehicleType, setVehicleType] = useState('bike');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('');

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

  const { data: partner, isLoading } = useQuery({
    queryKey: ['delivery-partner-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('delivery_partners')
        .select('*')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Populate form fields when partner data loads
  useEffect(() => {
    if (partner) {
      setFullName(partner.full_name || '');
      setPhone(sanitizePhone(partner.phone || ''));
      setAlternatePhone(sanitizePhone(partner.alternate_phone || ''));
      setDateOfBirth(partner.date_of_birth || '');
      setAddressLine1(partner.address_line1 || '');
      setAddressLine2(partner.address_line2 || '');
      setCity(partner.city || '');
      setState(partner.state || '');
      setPincode(partner.pincode || '');
      setVehicleType(partner.vehicle_type || 'bike');
      setVehicleNumber(partner.vehicle_number || '');
      setLicenseNumber(partner.license_number || '');
      setAadharNumber(partner.aadhar_number || '');
      setPanNumber(partner.pan_number || '');
      setBankAccountNumber((partner as any).bank_account_number || '');
      setIfscCode((partner as any).ifsc_code || '');
      setBankName((partner as any).bank_name || '');
      setAccountHolderName((partner as any).account_holder_name || '');
      setEmergencyContactName(partner.emergency_contact_name || '');
      setEmergencyContactPhone(sanitizePhone(partner.emergency_contact_phone || ''));
      setEmergencyContactRelation((partner as any).emergency_contact_relation || '');
    }
  }, [partner]);

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (!partner?.id) return;
      const { error } = await supabase
        .from('delivery_partners')
        .update({ status: status as any })
        .eq('id', partner.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-partner-profile'] });
      toast({ title: 'Status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!partner?.id) throw new Error('No partner profile found');
      const errs = collectErrors({
        alternate_phone: isValidPhone(alternatePhone),
        pincode: isValidPincode(pincode),
        vehicle_number: isValidVehicleNumber(vehicleNumber),
        license_number: isValidDrivingLicense(licenseNumber),
        aadhar_number: isValidAadhar(aadharNumber),
        pan_number: isValidPAN(panNumber),
        emergency_contact_phone: isValidPhone(emergencyContactPhone),
        bank_account_number: isValidBankAccount(bankAccountNumber),
        ifsc_code: isValidIFSC(ifscCode),
      });
      if (Object.keys(errs).length > 0) {
        setErrors(prev => ({ ...prev, ...errs }));
        throw new Error('Fix highlighted fields');
      }
      const { error } = await supabase
        .from('delivery_partners')
        .update({
          full_name: fullName,
          alternate_phone: formatPhoneForStorage(alternatePhone),
          date_of_birth: dateOfBirth || null,
          address_line1: addressLine1 || null,
          address_line2: addressLine2 || null,
          city: city || null,
          state: state || null,
          pincode: pincode || null,
          vehicle_type: vehicleType as any,
          vehicle_number: vehicleNumber || null,
          license_number: licenseNumber || null,
          aadhar_number: aadharNumber || null,
          pan_number: panNumber || null,
          emergency_contact_name: emergencyContactName || null,
          emergency_contact_phone: formatPhoneForStorage(emergencyContactPhone),
          emergency_contact_relation: emergencyContactRelation || null,
          bank_account_number: bankAccountNumber || null,
          ifsc_code: ifscCode || null,
          bank_name: bankName || null,
          account_holder_name: accountHolderName || null,
        } as any) // Casted to any to accept new columns easily
        .eq('id', partner.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-partner-profile'] });
      toast({ title: 'Profile saved', description: 'Your settings have been updated successfully.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save profile',
        description: error?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'bicycle': return <Bike className="w-8 h-8" />;
      case 'bike': case 'scooter': return <Bike className="w-8 h-8" />;
      case 'car': return <Car className="w-8 h-8" />;
      default: return <Truck className="w-8 h-8" />;
    }
  };

  const handleSave = () => {
    saveProfileMutation.mutate();
  };

  if (isLoading) {
    return (
      <DashboardLayout
        title="Settings"
        navItems={deliveryNavItems}
        roleColor="bg-blue-500 text-white"
        roleName="Delivery Partner"
      >
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Settings"
      navItems={deliveryNavItems}
      roleColor="bg-blue-500 text-white"
      roleName="Delivery Partner"
    >
      <div className="space-y-6 max-w-2xl">
        {/* Personal Details */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Details</CardTitle>
            <CardDescription>Your basic profile information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone ? `+91 ${phone}` : ''}
                  readOnly
                  disabled
                  className="bg-muted/30 border-border h-11 opacity-80"
                />
                <p className="text-xs text-muted-foreground ml-1">Phone number from your registration. Cannot be changed.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="alternatePhone">Alternate Phone</Label>
                <Input
                  id="alternatePhone"
                  value={alternatePhone}
                  onChange={(e) => { setAlternatePhone(formatDigits(e.target.value, 10)); setErr('alternate_phone', undefined); }}
                  onBlur={() => setErr('alternate_phone', isValidPhone(alternatePhone).error)}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  className={errCls('alternate_phone')}
                />
                {errors.alternate_phone && <p className="text-xs text-red-600 mt-1">{errors.alternate_phone}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
            <CardDescription>Your residential address</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addressLine1">Address Line 1</Label>
              <Input
                id="addressLine1"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="House/flat number, street name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressLine2">Address Line 2</Label>
              <Input
                id="addressLine2"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Area, landmark (optional)"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pincode">Pincode</Label>
                <Input
                  id="pincode"
                  value={pincode}
                  onChange={(e) => { setPincode(formatDigits(e.target.value, 6)); setErr('pincode', undefined); }}
                  onBlur={() => setErr('pincode', isValidPincode(pincode).error)}
                  inputMode="numeric"
                  placeholder="6-digit pincode"
                  className={errCls('pincode')}
                />
                {errors.pincode && <p className="text-xs text-red-600 mt-1">{errors.pincode}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Info */}
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Information</CardTitle>
            <CardDescription>Your registered vehicle details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <span className="text-muted-foreground">{getVehicleIcon(vehicleType)}</span>
              <div>
                <p className="font-medium capitalize">{vehicleType || 'Not set'}</p>
                <p className="text-sm text-muted-foreground">{vehicleNumber || 'No vehicle number'}</p>
              </div>
              {partner?.is_verified && (
                <Badge className="ml-auto bg-green-100 text-green-800">Verified</Badge>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicleType">Vehicle Type</Label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bicycle">Bicycle</SelectItem>
                  <SelectItem value="bike">Bike</SelectItem>
                  <SelectItem value="scooter">Scooter</SelectItem>
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="truck">Truck</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicleNumber">Vehicle Number</Label>
              <Input
                id="vehicleNumber"
                value={vehicleNumber}
                onChange={(e) => { setVehicleNumber(formatUpper(e.target.value, 12)); setErr('vehicle_number', undefined); }}
                onBlur={() => setErr('vehicle_number', isValidVehicleNumber(vehicleNumber).error)}
                placeholder="e.g., KA01AB1234"
                className={errCls('vehicle_number')}
              />
              {errors.vehicle_number && <p className="text-xs text-red-600 mt-1">{errors.vehicle_number}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input
                id="licenseNumber"
                value={licenseNumber}
                onChange={(e) => { setLicenseNumber(formatUpper(e.target.value, 16)); setErr('license_number', undefined); }}
                onBlur={() => setErr('license_number', isValidDrivingLicense(licenseNumber).error)}
                placeholder="Driving license number"
                className={errCls('license_number')}
              />
              {errors.license_number && <p className="text-xs text-red-600 mt-1">{errors.license_number}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Identity Documents */}
        <Card>
          <CardHeader>
            <CardTitle>Identity Documents</CardTitle>
            <CardDescription>Your identification details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aadharNumber">Aadhar Number</Label>
              <Input
                id="aadharNumber"
                value={aadharNumber}
                onChange={(e) => { setAadharNumber(formatDigits(e.target.value, 12)); setErr('aadhar_number', undefined); }}
                onBlur={() => setErr('aadhar_number', isValidAadhar(aadharNumber).error)}
                inputMode="numeric"
                placeholder="12-digit Aadhar number"
                className={errCls('aadhar_number')}
              />
              {errors.aadhar_number && <p className="text-xs text-red-600 mt-1">{errors.aadhar_number}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="panNumber">PAN Number</Label>
              <Input
                id="panNumber"
                value={panNumber}
                onChange={(e) => { setPanNumber(formatUpper(e.target.value, 10)); setErr('pan_number', undefined); }}
                onBlur={() => setErr('pan_number', isValidPAN(panNumber).error)}
                placeholder="e.g., ABCDE1234F"
                className={errCls('pan_number')}
              />
              {errors.pan_number && <p className="text-xs text-red-600 mt-1">{errors.pan_number}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Emergency Contact</CardTitle>
            <CardDescription>Person to contact in case of emergencies</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emergencyContactName">Contact Name</Label>
              <Input
                id="emergencyContactName"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                placeholder="Emergency contact full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergencyContactRelation">Relation</Label>
              <Input
                id="emergencyContactRelation"
                value={emergencyContactRelation}
                onChange={(e) => setEmergencyContactRelation(e.target.value)}
                placeholder="e.g., Brother, Father, Wife"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergencyContactPhone">Contact Phone</Label>
              <Input
                id="emergencyContactPhone"
                value={emergencyContactPhone}
                onChange={(e) => { setEmergencyContactPhone(formatDigits(e.target.value, 10)); setErr('emergency_contact_phone', undefined); }}
                onBlur={() => setErr('emergency_contact_phone', isValidPhone(emergencyContactPhone).error)}
                inputMode="numeric"
                placeholder="10-digit mobile"
                className={errCls('emergency_contact_phone')}
              />
              {errors.emergency_contact_phone && <p className="text-xs text-red-600 mt-1">{errors.emergency_contact_phone}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Bank Details */}
        <Card>
          <CardHeader>
            <CardTitle>Bank Details</CardTitle>
            <CardDescription>Your bank account for payouts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank Name</Label>
              <Input
                id="bankName"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g., HDFC Bank"
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
              <Label htmlFor="bankAccountNumber">Bank Account Number</Label>
              <Input
                id="bankAccountNumber"
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
              <Label htmlFor="ifscCode">IFSC Code</Label>
              <Input
                id="ifscCode"
                value={ifscCode}
                onChange={(e) => { setIfscCode(formatUpper(e.target.value, 11)); setErr('ifsc_code', undefined); }}
                onBlur={() => setErr('ifsc_code', isValidIFSC(ifscCode).error)}
                placeholder="e.g., SBIN0001234"
                className={errCls('ifsc_code')}
              />
              {errors.ifsc_code && <p className="text-xs text-red-600 mt-1">{errors.ifsc_code}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Availability */}
        <Card>
          <CardHeader>
            <CardTitle>Availability</CardTitle>
            <CardDescription>Set your current status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Current Status</Label>
              <Select
                value={partner?.status || 'offline'}
                onValueChange={(value) => updateStatusMutation.mutate(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="on_break">On Break</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end pb-6">
          <Button
            onClick={handleSave}
            disabled={saveProfileMutation.isPending}
            size="lg"
          >
            {saveProfileMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save All Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DeliverySettings;
