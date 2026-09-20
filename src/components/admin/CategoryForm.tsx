import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
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

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  slug: z.string().min(1, 'Slug is required').max(100),
  description: z.string().max(500).optional(),
  // Free-text offer chip on the new customer vertical category list.
  // Examples: "23% OFF", "FREE DELIVERY", "NEW". Empty / null = no chip.
  offer_text: z.string().max(30).optional(),
  image_url: z.string().optional().or(z.literal('')),
  banner_url: z.string().optional().or(z.literal('')),
  display_order: z.coerce.number().min(0).default(0),
  is_active: z.boolean().default(true),
  parent_id: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCategory?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    offer_text?: string | null;
    image_url: string | null;
    banner_url?: string | null;
    display_order: number | null;
    is_active: boolean | null;
    parent_id: string | null;
  } | null;
  /** UUID = locked to that parent, 'pick' = admin must choose a parent, undefined = normal mode */
  forceParentId?: string;
}

const generateSlug = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

export const CategoryForm: React.FC<CategoryFormProps> = ({
  open,
  onOpenChange,
  editCategory,
  forceParentId,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!editCategory;
  const isSubcategoryMode = !!forceParentId;
  const isParentLocked = isSubcategoryMode && forceParentId !== 'pick';

  const { data: categories } = useQuery({
    queryKey: ['categories-for-parent'],
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name')
        .is('parent_id', null)
        .order('name');
      return data || [];
    },
  });

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      offer_text: '',
      image_url: '',
      banner_url: '',
      display_order: 0,
      is_active: true,
      parent_id: 'none',
    },
  });

  useEffect(() => {
    if (editCategory) {
      form.reset({
        name: editCategory.name,
        slug: editCategory.slug,
        description: editCategory.description || '',
        offer_text: editCategory.offer_text || '',
        image_url: editCategory.image_url || '',
        banner_url: editCategory.banner_url || '',
        display_order: editCategory.display_order || 0,
        is_active: editCategory.is_active ?? true,
        parent_id: editCategory.parent_id || 'none',
      });
    } else {
      form.reset({
        name: '',
        slug: '',
        description: '',
        offer_text: '',
        image_url: '',
        banner_url: '',
        display_order: 0,
        is_active: true,
        parent_id: isParentLocked ? forceParentId : 'none',
      });
    }
  }, [editCategory, form, forceParentId, isParentLocked]);

  const nameValue = form.watch('name');
  useEffect(() => {
    if (!isEditing && nameValue) {
      form.setValue('slug', generateSlug(nameValue));
    }
  }, [nameValue, isEditing, form]);

  const mutation = useMutation({
    mutationFn: async (values: CategoryFormValues) => {
      const payload: any = {
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        offer_text: values.offer_text?.trim() || null,
        image_url: values.image_url || null,
        banner_url: values.banner_url || null,
        display_order: values.display_order,
        is_active: values.is_active,
        parent_id: values.parent_id === 'none' ? null : values.parent_id || null,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', editCategory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories-for-products'] });
      queryClient.invalidateQueries({ queryKey: ['categories-for-parent'] });
      const label = isSubcategoryMode ? 'Subcategory' : 'Category';
      toast({ title: `${label} ${isEditing ? 'updated' : 'created'} successfully` });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: `Failed to ${isEditing ? 'update' : 'create'} category`,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (values: CategoryFormValues) => {
    if (isSubcategoryMode && (!values.parent_id || values.parent_id === 'none')) {
      toast({ title: 'Please select a parent category', variant: 'destructive' });
      return;
    }
    mutation.mutate(values);
  };

  const parentCategories = categories?.filter(c => c.id !== editCategory?.id) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Category' : isSubcategoryMode ? 'Add Subcategory' : 'Add Category'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Category name" {...field} />
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
                    <Input placeholder="category-slug" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="offer_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Offer tag (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 23% OFF, FREE DELIVERY, NEW" maxLength={30} {...field} />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Shown as a chip on the customer vertical "All Categories" list. Leave blank for none.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon/Image</FormLabel>
                  <FormControl>
                    <ImageUpload
                      value={field.value}
                      onChange={field.onChange}
                      bucket="category-images"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="banner_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Banner Image (Optional)</FormLabel>
                  <FormControl>
                    <ImageUpload
                      value={field.value}
                      onChange={field.onChange}
                      bucket="category-images"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="display_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="parent_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Category</FormLabel>
                    <Select
                      value={field.value || 'none'}
                      onValueChange={field.onChange}
                      disabled={isParentLocked}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isSubcategoryMode ? 'Select parent' : 'None (Top level)'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {!isSubcategoryMode && (
                          <SelectItem value="none">None (Top level)</SelectItem>
                        )}
                        {parentCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Active</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Category will be visible to customers
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

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
