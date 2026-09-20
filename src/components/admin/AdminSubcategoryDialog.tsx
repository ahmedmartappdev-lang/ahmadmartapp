import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

interface EditCategoryShape {
  id: string;
  name: string;
  slug?: string | null;
  parent_id: string | null;
  is_active?: boolean | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * - UUID: parent is locked to that root category (used when adding under a known parent).
   * - 'pick': admin picks the parent from a dropdown of roots (used by the global +Add Subcategory header button).
   * - undefined: ignored when editing.
   */
  forceParentId?: string;
  /** When set, dialog is in Edit mode for an existing subcategory. */
  editCategory?: EditCategoryShape | null;
}

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const AdminSubcategoryDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  forceParentId,
  editCategory,
}) => {
  const isEditing = !!editCategory;
  const pickMode = !isEditing && forceParentId === 'pick';
  const lockedParent = !isEditing && forceParentId && forceParentId !== 'pick' ? forceParentId : null;

  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      if (isEditing && editCategory) {
        setName(editCategory.name);
        setParentId(editCategory.parent_id || '');
        setIsActive(editCategory.is_active ?? true);
      } else {
        setName('');
        setIsActive(true);
        setParentId(lockedParent || '');
      }
    }
  }, [open, isEditing, editCategory, lockedParent]);

  // Roots for the picker. Only queried when in pick mode.
  const { data: roots = [] } = useQuery({
    queryKey: ['admin-subcategory-dialog-roots'],
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name')
        .is('parent_id', null)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });
      return (data || []) as Array<{ id: string; name: string }>;
    },
    enabled: pickMode,
  });

  const trimmedName = name.trim();
  const slugPreview = slugify(trimmedName);
  const effectiveParent = isEditing ? editCategory!.parent_id : (lockedParent || parentId);

  const canSubmit =
    trimmedName.length > 0 &&
    trimmedName.length <= 64 &&
    slugPreview.length > 0 &&
    !!effectiveParent;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!effectiveParent) throw new Error('Parent category required');

      if (isEditing && editCategory) {
        const patch = {
          name: trimmedName,
          slug: editCategory.slug && editCategory.slug.length > 0 ? editCategory.slug : slugPreview,
          is_active: isActive,
        };
        const { error } = await supabase
          .from('categories')
          .update(patch)
          .eq('id', editCategory.id);
        if (error) throw new Error(error.message);
        return { created: false };
      }

      // INSERT. Idempotency: if a sibling already exists with the same slug,
      // re-activate it instead of erroring on the partial unique index.
      const { data: existing } = await supabase
        .from('categories')
        .select('id, is_active')
        .eq('parent_id', effectiveParent)
        .eq('slug', slugPreview)
        .maybeSingle();

      if (existing) {
        if (!existing.is_active) {
          const { error } = await supabase
            .from('categories')
            .update({ is_active: true, name: trimmedName })
            .eq('id', existing.id);
          if (error) throw new Error(error.message);
        }
        return { created: false };
      }

      const { error } = await supabase.from('categories').insert({
        name: trimmedName,
        slug: slugPreview,
        parent_id: effectiveParent,
        is_active: isActive,
        display_order: 0,
      });
      if (error) throw new Error(error.message);
      return { created: true };
    },
    onSuccess: ({ created }) => {
      toast({
        title: isEditing
          ? 'Subcategory updated'
          : created
            ? 'Subcategory created'
            : 'Subcategory already existed — reactivated',
      });
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['admin-vendor-categories'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-subcats'] });
      queryClient.invalidateQueries({ queryKey: ['categories-for-products'] });
    },
    onError: (err: any) => {
      toast({
        title: isEditing ? 'Could not update subcategory' : 'Could not create subcategory',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!mutation.isPending) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit subcategory' : 'Add subcategory'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Rename or activate/deactivate this subcategory.'
              : 'Subcategories are scoped to a parent root category. They share the global catalog — vendors and admin all see them.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {pickMode && (
            <div className="space-y-2">
              <Label htmlFor="sub-parent">Parent category</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="sub-parent">
                  <SelectValue placeholder="Pick the parent category" />
                </SelectTrigger>
                <SelectContent>
                  {roots.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sub-name">Name</Label>
            <Input
              id="sub-name"
              autoFocus
              placeholder="e.g. Spices"
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit && !mutation.isPending) {
                  e.preventDefault();
                  mutation.mutate();
                }
              }}
            />
            {slugPreview && (
              <p className="text-[11px] text-muted-foreground">
                slug: <span className="font-mono">{slugPreview}</span>
              </p>
            )}
          </div>

          {isEditing && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/40 px-3 py-2">
              <div>
                <Label htmlFor="sub-active" className="text-sm">Active</Label>
                <p className="text-[11px] text-muted-foreground">
                  When off, the subcategory is hidden from vendors and customers.
                </p>
              </div>
              <Switch
                id="sub-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
