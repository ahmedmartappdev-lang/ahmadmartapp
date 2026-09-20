import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
import type { ProductVariant } from '@/types/database';
import { useTimeSlots, useSaveProductTimeSlots, useProductTimeSlots } from '@/hooks/useTimeSlots';

type ProductStatus = Database['public']['Enums']['product_status'];
type UnitType = Database['public']['Enums']['unit_type'];

const productSchemaBase = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  slug: z.string().min(1, 'Slug is required').max(200),
  description: z.string().max(2000).optional(),
  brand: z.string().max(100).optional(),
  sku: z.string().min(1, 'SKU is required').max(50),
  mrp: z.coerce.number().positive('MRP must be positive'),
  selling_price: z.coerce.number().positive('Selling price must be positive'),
  admin_selling_price: z.coerce.number().min(0).optional(),
  stock_quantity: z.coerce.number().min(0).default(999999),
  min_order_quantity: z.coerce.number().min(1).nullable().default(1),
  max_order_quantity: z.coerce.number().min(1).nullable().default(10),
  unit_type: z.enum(['kg', 'g', 'l', 'ml', 'piece', 'pack', 'dozen']).optional(),
  unit_value: z.coerce.number().positive().optional(),
  category_id: z.string().optional(),
  primary_image_url: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'out_of_stock', 'discontinued']).default('active'),
  is_featured: z.boolean().default(false),
  is_trending: z.boolean().default(false),
});

const productSchema = productSchemaBase
  .refine((data) => data.selling_price <= data.mrp, {
    message: "Vendor's Selling price cannot exceed MRP",
    path: ['selling_price'],
  })
  .refine((data) => !data.admin_selling_price || data.admin_selling_price <= data.mrp, {
    message: 'Admin selling price cannot exceed MRP',
    path: ['admin_selling_price'],
  });

type ProductFormValues = z.infer<typeof productSchemaBase>;

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId?: string;
  editProduct?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    brand: string | null;
    sku: string;
    mrp: number;
    selling_price: number;
    admin_selling_price?: number | null;
    stock_quantity: number;
    min_order_quantity: number | null;
    max_order_quantity: number | null;
    unit_type: UnitType | null;
    unit_value: number | null;
    category_id: string | null;
    primary_image_url: string | null;
    status: ProductStatus;
    is_featured: boolean | null;
    is_trending: boolean | null;
    vendor_id: string;
    variants?: ProductVariant[] | null;
  } | null;
}

const generateSlug = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

const generateSKU = () => {
  return `SKU-${Date.now().toString(36).toUpperCase()}`;
};

export const ProductForm: React.FC<ProductFormProps> = ({
  open,
  onOpenChange,
  vendorId,
  editProduct,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!editProduct;

  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedTimeSlotIds, setSelectedTimeSlotIds] = useState<string[]>([]);
  const [noMinLimit, setNoMinLimit] = useState(false);
  const [noMaxLimit, setNoMaxLimit] = useState(false);
  const { data: allTimeSlots } = useTimeSlots();
  const { data: existingProductTimeSlots } = useProductTimeSlots(editProduct?.id);
  const saveProductTimeSlots = useSaveProductTimeSlots();

  const addVariant = () => {
    setVariants(prev => [...prev, {
      id: crypto.randomUUID(),
      label: '',
      unit_value: 1,
      unit_type: 'piece' as any,
      mrp: 0,
      selling_price: 0,
      stock_quantity: 999999,
    }]);
  };

  const updateVariant = (id: string, field: keyof ProductVariant, value: any) => {
    setVariants(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const removeVariant = (id: string) => {
    setVariants(prev => prev.filter(v => v.id !== id));
  };

  // All active categories — needed to resolve subcategory names against
  // a vendor's subcategory_ids array.
  const { data: categories } = useQuery({
    queryKey: ['categories-for-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name, parent_id')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      return data || [];
    },
  });

  // Vendors-for-products: now also pulls category_id + subcategory_ids
  // so the form can scope the Section dropdown to the picked vendor.
  const { data: vendors } = useQuery({
    queryKey: ['vendors-for-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors')
        .select('id, business_name, category_id, subcategory_ids')
        .eq('status', 'active')
        .order('business_name');
      return (data || []) as Array<{ id: string; business_name: string; category_id: string | null; subcategory_ids: string[] | null }>;
    },
    enabled: !vendorId,
  });

  // When the form runs inside the VENDOR self-edit context (vendorId prop
  // is set), we still need the vendor's own catalog — fetch it.
  const { data: vendorSelf } = useQuery({
    queryKey: ['vendor-self-catalog', vendorId],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors')
        .select('id, business_name, category_id, subcategory_ids')
        .eq('id', vendorId!)
        .single();
      return data as { id: string; business_name: string; category_id: string | null; subcategory_ids: string[] | null } | null;
    },
    enabled: !!vendorId,
  });

  const form = useForm<ProductFormValues & { vendor_id?: string }>({
    resolver: zodResolver(
      vendorId
        ? productSchema
        : productSchemaBase.extend({
            vendor_id: z.string().uuid('Vendor is required'),
          }).refine((data) => data.selling_price <= data.mrp, {
            message: "Vendor's Selling price cannot exceed MRP",
            path: ['selling_price'],
          })
    ),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      brand: '',
      sku: generateSKU(),
      mrp: 0,
      selling_price: 0,
      admin_selling_price: 0,
      stock_quantity: 999999,
      min_order_quantity: 1,
      max_order_quantity: 10,
      unit_type: 'piece',
      unit_value: 1,
      category_id: 'none',
      primary_image_url: '',
      status: 'active',
      is_featured: false,
      is_trending: false,
      vendor_id: vendorId || '',
    },
  });

  // Refetch the catalog every time the dialog opens. The form stays mounted
  // between opens, so without this a subcategory created after page load
  // (e.g. via /admin/subcategories in the same session) never appears in
  // the Section dropdown until a full page reload.
  useEffect(() => {
    if (open) {
      queryClient.invalidateQueries({ queryKey: ['categories-for-products'] });
      queryClient.invalidateQueries({ queryKey: ['vendors-for-products'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-self-catalog'] });
    }
  }, [open, queryClient]);

  useEffect(() => {
    if (editProduct) {
      form.reset({
        name: editProduct.name,
        slug: editProduct.slug,
        description: editProduct.description || '',
        brand: editProduct.brand || '',
        sku: editProduct.sku,
        mrp: editProduct.mrp,
        selling_price: editProduct.selling_price,
        admin_selling_price: editProduct.admin_selling_price || 0,
        stock_quantity: editProduct.stock_quantity || 999999,
        min_order_quantity: editProduct.min_order_quantity ?? 1,
        max_order_quantity: editProduct.max_order_quantity ?? 10,
        unit_type: editProduct.unit_type || 'piece',
        unit_value: editProduct.unit_value || 1,
        category_id: editProduct.category_id || 'none',
        primary_image_url: editProduct.primary_image_url || '',
        status: editProduct.status,
        is_featured: editProduct.is_featured || false,
        is_trending: editProduct.is_trending || false,
        vendor_id: editProduct.vendor_id,
      });
      setVariants(editProduct.variants || []);
      setSelectedTimeSlotIds(existingProductTimeSlots || []);
      setNoMinLimit(editProduct.min_order_quantity == null);
      setNoMaxLimit(editProduct.max_order_quantity == null);
    } else {
      form.reset({
        name: '',
        slug: '',
        description: '',
        brand: '',
        sku: generateSKU(),
        mrp: 0,
        selling_price: 0,
        admin_selling_price: 0,
        stock_quantity: 999999,
        min_order_quantity: 1,
        max_order_quantity: 10,
        unit_type: 'piece',
        unit_value: 1,
        category_id: 'none',
        primary_image_url: '',
        status: 'active',
        is_featured: false,
        is_trending: false,
        vendor_id: vendorId || '',
      });
      setVariants([]);
      setSelectedTimeSlotIds([]);
      setNoMinLimit(false);
      setNoMaxLimit(false);
    }
  }, [editProduct, form, vendorId, existingProductTimeSlots]);

  // (No parent-category sync needed anymore — the vendor-first refactor
  // derives category_id from the picked vendor at submit time.)

  const nameValue = form.watch('name');
  useEffect(() => {
    if (!isEditing && nameValue) {
      form.setValue('slug', generateSlug(nameValue));
    }
  }, [nameValue, isEditing, form]);

  const mrpValue = form.watch('mrp') || 0;
  const sellingPriceValue = form.watch('selling_price') || 0;
  const adminSellingPriceValue = form.watch('admin_selling_price') || 0;
  
  // Calculate discount based on what the customer will actually pay
  const effectivePrice = adminSellingPriceValue > 0 ? adminSellingPriceValue : sellingPriceValue;
  const discountPercentage = mrpValue > 0 && effectivePrice > 0
      ? Math.round(((mrpValue - effectivePrice) / mrpValue) * 100)
      : 0;

  const mutation = useMutation({
    mutationFn: async (values: ProductFormValues & { vendor_id?: string }) => {
      const effectiveVendorId = vendorId || values.vendor_id!;
      const vendorRow = vendorId
        ? vendorSelf
        : (vendors || []).find(v => v.id === effectiveVendorId) || null;

      // Vendor-first catalog: enforce that vendor has a catalog category
      // and, if it has subcategories, the form picked one.
      if (!vendorRow?.category_id) {
        throw new Error('This vendor has no catalog category. Set it in Admin → Vendors first.');
      }
      const subsUnderRoot = (categories || []).filter(c => c.parent_id === vendorRow.category_id);
      let resolvedCategoryId: string = vendorRow.category_id;
      if (subsUnderRoot.length > 0) {
        const picked = values.category_id && values.category_id !== 'none' ? values.category_id : '';
        if (!picked || !subsUnderRoot.some(c => c.id === picked)) {
          throw new Error('Pick a section/subcategory for this product (required for this vendor).');
        }
        resolvedCategoryId = picked;
      }

      const payload: any = {
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        brand: values.brand || null,
        sku: values.sku,
        mrp: values.mrp,
        selling_price: values.selling_price,
        discount_percentage: discountPercentage,
        stock_quantity: values.stock_quantity,
        min_order_quantity: noMinLimit ? null : values.min_order_quantity,
        max_order_quantity: noMaxLimit ? null : values.max_order_quantity,
        unit_type: values.unit_type || null,
        unit_value: values.unit_value || null,
        // category_id is server-authoritative — derived from the vendor.
        category_id: resolvedCategoryId,
        primary_image_url: values.primary_image_url || null,
        status: values.status as ProductStatus,
        // Featured/Trending are admin-only; vendor payloads always send false
        is_featured: vendorId ? false : values.is_featured,
        is_trending: vendorId ? false : values.is_trending,
        vendor_id: effectiveVendorId,
        variants: variants.length > 0 ? variants : null,
      };

      // Only admin can set admin_selling_price
      if (!vendorId) {
        payload.admin_selling_price = values.admin_selling_price || null;
      }

      if (isEditing) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editProduct.id);
        if (error) throw error;
        // Save time slots for existing product
        await saveProductTimeSlots.mutateAsync({ productId: editProduct.id, timeSlotIds: selectedTimeSlotIds });
      } else {
        const { data: newProduct, error } = await supabase.from('products').insert(payload).select('id').single();
        if (error) throw error;
        // Save time slots for new product
        if (newProduct && selectedTimeSlotIds.length > 0) {
          await saveProductTimeSlots.mutateAsync({ productId: newProduct.id, timeSlotIds: selectedTimeSlotIds });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: `Product ${isEditing ? 'updated' : 'created'} successfully` });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: `Failed to ${isEditing ? 'update' : 'create'} product`,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (values: ProductFormValues & { vendor_id?: string }) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Product' : 'Add Product'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Product name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input placeholder="product-slug" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Product description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand</FormLabel>
                    <FormControl>
                      <Input placeholder="Brand name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input placeholder="SKU-XXXXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="mrp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MRP (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor's Selling Price (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col justify-end">
                <p className="text-sm text-muted-foreground mb-1">Customer Discount</p>
                <p className="text-lg font-semibold text-green-600">
                  {discountPercentage > 0 ? `${discountPercentage}% OFF` : '-'}
                </p>
              </div>
            </div>

            {!vendorId && (
              <FormField
                control={form.control}
                name="admin_selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Admin Selling Price (₹) — Price shown to customers</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" placeholder="Leave 0 to use vendor's price" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="min_order_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        disabled={noMinLimit}
                        placeholder={noMinLimit ? 'No minimum' : ''}
                        value={noMinLimit ? '' : (field.value ?? '')}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={noMinLimit}
                        onChange={(e) => setNoMinLimit(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      No minimum
                    </label>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="max_order_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        disabled={noMaxLimit}
                        placeholder={noMaxLimit ? 'No limit' : ''}
                        value={noMaxLimit ? '' : (field.value ?? '')}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={noMaxLimit}
                        onChange={(e) => setNoMaxLimit(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      No max limit
                    </label>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="unit_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Type</FormLabel>
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="piece">Piece</SelectItem>
                        <SelectItem value="pack">Pack</SelectItem>
                        <SelectItem value="dozen">Dozen</SelectItem>
                        <SelectItem value="kg">Kilogram (kg)</SelectItem>
                        <SelectItem value="g">Gram (g)</SelectItem>
                        <SelectItem value="l">Liter (l)</SelectItem>
                        <SelectItem value="ml">Milliliter (ml)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unit_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Value</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Section / Subcategory — vendor-derived. The vendor's
                catalog category (set in Admin → Vendors) determines what
                shows here. Admins/vendors no longer pick a root category;
                products inherit it. If the vendor has subcategories, pick
                one. If not, the product just inherits the root. */}
            {(() => {
              const currentVendorId = vendorId || form.watch('vendor_id');
              const vendorRow = vendorId
                ? vendorSelf
                : (vendors || []).find(v => v.id === currentVendorId) || null;
              const vendorCategoryName = vendorRow?.category_id
                ? (categories || []).find(c => c.id === vendorRow.category_id)?.name
                : null;
              // All subcategories under the vendor's root category are
              // assignable — the vendor's declared subcategory_ids list only
              // controls store discovery on the category page, not products.
              const subOptions = vendorRow?.category_id
                ? (categories || []).filter(c => c.parent_id === vendorRow.category_id)
                : [];

              if (!currentVendorId) {
                return (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-3 py-2.5 text-xs text-muted-foreground">
                    Pick a vendor below — the product's catalog category comes from them.
                  </div>
                );
              }
              if (!vendorRow?.category_id) {
                return (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                    This vendor has no catalog category set. Open Admin → Vendors → Edit Vendor first.
                  </div>
                );
              }
              return (
                <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Catalog category: <span className="font-medium text-foreground">{vendorCategoryName}</span>
                    {' '}(inherited from vendor)
                  </p>
                  {subOptions.length > 0 ? (
                    <FormField
                      control={form.control}
                      name="category_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Section / Subcategory <span className="text-red-500">*</span></FormLabel>
                          <Select
                            value={field.value && field.value !== 'none' ? field.value : ''}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pick which section in this store" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {subOptions.map((sub) => (
                                <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Filters this product under the matching pill on the store page.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1.5">
                      <p className="font-medium">
                        Section / Subcategory — this vendor has no menu sections yet.
                      </p>
                      <p className="text-[11px] text-amber-900/80">
                        Subcategories are the menu sections customers filter by on the store page
                        (e.g. <em>Breakfast</em>, <em>Lunch</em>, <em>Dinner</em>).
                        {vendorId ? (
                          <> Add one in <Link to="/vendor/subcategories" className="font-medium underline" target="_blank" rel="noreferrer">Subcategories</Link>, then come back and pick it.</>
                        ) : (
                          <> Add one in <Link to="/admin/subcategories" className="font-medium underline" target="_blank" rel="noreferrer">Subcategories</Link> under "{vendorCategoryName}", then come back and pick it.</>
                        )}
                      </p>
                      <p className="text-[11px] text-amber-900/70">
                        If you skip this, the product still gets created under the "{vendorCategoryName}" root and will appear on the store page without a filter pill.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                      <SelectItem value="discontinued">Discontinued</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!vendorId && (
              <FormField
                control={form.control}
                name="vendor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor</FormLabel>
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vendors?.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.business_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Time Slots Section */}
            {allTimeSlots && allTimeSlots.length > 0 && (
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm">Availability Time Slots</h4>
                <p className="text-xs text-muted-foreground">Select when this product is available. Leave empty for always available.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {allTimeSlots.filter(s => s.is_active).map((slot) => {
                    const checked = selectedTimeSlotIds.includes(slot.id);
                    const startFormatted = (() => { const [h,m] = slot.start_time.split(':').map(Number); return `${h%12||12}:${m.toString().padStart(2,'0')} ${h>=12?'PM':'AM'}`; })();
                    const endFormatted = (() => { const [h,m] = slot.end_time.split(':').map(Number); return `${h%12||12}:${m.toString().padStart(2,'0')} ${h>=12?'PM':'AM'}`; })();
                    return (
                      <label key={slot.id} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-muted/50">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedTimeSlotIds(prev =>
                              v ? [...prev, slot.id] : prev.filter(id => id !== slot.id)
                            );
                          }}
                        />
                        <div>
                          <span className="text-sm font-medium">{slot.name}</span>
                          <span className="text-xs text-muted-foreground ml-1">({startFormatted} - {endFormatted})</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Variants Section */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Product Variants</h4>
                <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                  <Plus className="w-3 h-3 mr-1" /> Add Variant
                </Button>
              </div>
              {variants.length === 0 && (
                <p className="text-xs text-muted-foreground">No variants added. The base product price will be used.</p>
              )}
              {variants.map((variant, idx) => (
                <div key={variant.id} className="border rounded-md p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Variant {idx + 1}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeVariant(variant.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Label</label>
                      <Input
                        placeholder="e.g. 250g, 500ml"
                        value={variant.label}
                        onChange={(e) => updateVariant(variant.id, 'label', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Unit Value</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={variant.unit_value}
                        onChange={(e) => updateVariant(variant.id, 'unit_value', Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Unit Type</label>
                      <select
                        value={variant.unit_type}
                        onChange={(e) => updateVariant(variant.id, 'unit_type', e.target.value)}
                        className="w-full h-8 text-sm border rounded-md px-2 bg-background"
                      >
                        <option value="piece">Piece</option>
                        <option value="pack">Pack</option>
                        <option value="dozen">Dozen</option>
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="l">l</option>
                        <option value="ml">ml</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div>
                      <label className="text-xs text-muted-foreground">MRP (₹)</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={variant.mrp}
                        onChange={(e) => updateVariant(variant.id, 'mrp', Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Vendor's Selling Price (₹)</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={variant.selling_price}
                        onChange={(e) => updateVariant(variant.id, 'selling_price', Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Admin Price (₹)</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        max={variant.mrp || undefined}
                        placeholder="Inherit"
                        value={variant.admin_selling_price ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateVariant(variant.id, 'admin_selling_price', v === '' ? null : Number(v));
                        }}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <FormField
              control={form.control}
              name="primary_image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Image</FormLabel>
                  <FormControl>
                    <ImageUpload
                      value={field.value}
                      onChange={field.onChange}
                      bucket="product-images"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Featured / Trending are admin-only controls — hide on vendor side */}
            {!vendorId && (
              <div className="flex gap-6">
                <FormField
                  control={form.control}
                  name="is_featured"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">Featured</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_trending"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">Trending</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
