import React, { useState } from 'react';
import { useServiceAreas } from '@/hooks/useServiceAreas';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Home, Briefcase, MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MapPicker, type MapPickerResult } from '@/components/ui/map-picker';
import type { Address, AddressInput } from '@/hooks/useAddresses';

const addressSchema = z.object({
  address_type: z.string().min(1, 'Select address type'),
  address_line1: z.string().min(5, 'Enter complete address'),
  address_line2: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().min(2, 'Enter city'),
  state: z.string().min(2, 'Enter state'),
  pincode: z.string().regex(/^\d{6}$/, 'Enter valid 6-digit pincode'),
  is_default: z.boolean(),
});

type FormValues = z.infer<typeof addressSchema>;

interface AddressFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AddressInput) => void;
  initialData?: Address | null;
  isLoading?: boolean;
}

const addressTypes = [
  { value: 'home', label: 'Home', icon: Home },
  { value: 'work', label: 'Work', icon: Briefcase },
  { value: 'other', label: 'Other', icon: MapPin },
];

export const AddressForm: React.FC<AddressFormProps> = ({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isLoading = false,
}) => {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialData?.latitude && initialData?.longitude
      ? { lat: initialData.latitude, lng: initialData.longitude }
      : null
  );
  const [isServiceable, setIsServiceable] = useState(true);
  const { isLocationServiceable } = useServiceAreas();

  const form = useForm<FormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      address_type: initialData?.address_type || 'home',
      address_line1: initialData?.address_line1 || '',
      address_line2: initialData?.address_line2 || '',
      landmark: initialData?.landmark || '',
      city: initialData?.city || '',
      state: initialData?.state || '',
      pincode: initialData?.pincode || '',
      is_default: initialData?.is_default || false,
    },
  });

  React.useEffect(() => {
    if (open && initialData) {
      form.reset({
        address_type: initialData.address_type,
        address_line1: initialData.address_line1,
        address_line2: initialData.address_line2 || '',
        landmark: initialData.landmark || '',
        city: initialData.city,
        state: initialData.state,
        pincode: initialData.pincode,
        is_default: initialData.is_default,
      });
      setCoords(
        initialData.latitude && initialData.longitude
          ? { lat: initialData.latitude, lng: initialData.longitude }
          : null
      );
    } else if (open && !initialData) {
      form.reset({
        address_type: 'home',
        address_line1: '',
        address_line2: '',
        landmark: '',
        city: '',
        state: '',
        pincode: '',
        is_default: false,
      });
      setCoords(null);
    }
  }, [open, initialData, form]);

  const handleLocationSelect = (result: MapPickerResult) => {
    setCoords({ lat: result.latitude, lng: result.longitude });
    if (result.address_line1) form.setValue('address_line1', result.address_line1);
    if (result.address_line2) form.setValue('address_line2', result.address_line2);
    if (result.city) form.setValue('city', result.city);
    if (result.state) form.setValue('state', result.state);
    if (result.pincode) form.setValue('pincode', result.pincode);
  };

  const handleSubmit = (values: FormValues) => {
    if (!coords) {
      toast.error('Please pick the address on the map first.');
      return;
    }
    if (!isServiceable) {
      toast.error('This location is outside our delivery zone.');
      return;
    }
    onSubmit({
      address_type: values.address_type,
      address_line1: values.address_line1,
      address_line2: values.address_line2 || null,
      landmark: values.landmark || null,
      city: values.city,
      state: values.state,
      pincode: values.pincode,
      latitude: coords.lat,
      longitude: coords.lng,
      is_default: values.is_default,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-md">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base font-bold">
            {initialData ? 'Edit Address' : 'Add New Address'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-0">
            {/* Map */}
            <div className="px-5 pt-3">
              <MapPicker
                onLocationSelect={handleLocationSelect}
                onServiceabilityChange={(ok) => setIsServiceable(ok)}
                checkServiceability={isLocationServiceable}
                initialLat={coords?.lat}
                initialLng={coords?.lng}
                height="180px"
              />
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Address Type */}
              <FormField
                control={form.control}
                name="address_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Save as</FormLabel>
                    <div className="flex gap-2">
                      {addressTypes.map((type) => {
                        const isActive = field.value === type.value;
                        return (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => field.onChange(type.value)}
                            className={`flex items-center gap-1.5 px-4 h-10 rounded-full text-xs font-semibold border transition-all ${
                              isActive
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/30'
                            }`}
                          >
                            <type.icon className="w-3.5 h-3.5" />
                            {type.label}
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Address Fields */}
              <FormField
                control={form.control}
                name="address_line1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Flat / House No. / Building <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Flat 204, Tower B" className="h-10 text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address_line2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Street / Area / Colony</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. MG Road, Koramangala" className="h-10 text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="landmark"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Landmark</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Near City Mall" className="h-10 text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">City <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="City" className="h-10 text-sm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">State <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="State" className="h-10 text-sm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="pincode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Pincode <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="6-digit pincode" maxLength={6} className="h-10 text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Default */}
              <FormField
                control={form.control}
                name="is_default"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2.5 space-y-0 py-1">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="text-xs font-medium cursor-pointer text-foreground">
                      Set as default delivery address
                    </FormLabel>
                  </FormItem>
                )}
              />
            </div>

            {/* Submit */}
            <div className="px-5 pb-5">
              <Button type="submit" className="w-full h-12 text-sm font-semibold rounded-2xl shadow-sm" disabled={isLoading || !isServiceable}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {!isServiceable ? 'Area Not Serviceable' : initialData ? 'Update Address' : 'Save Address'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
