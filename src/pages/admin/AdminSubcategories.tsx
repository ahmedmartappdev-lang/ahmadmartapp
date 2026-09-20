import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Plus, Pencil, MoreVertical, Trash2, EyeOff, Eye, Copy,
} from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AdminSubcategoryDialog } from '@/components/admin/AdminSubcategoryDialog';

interface SubcategoryRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean | null;
  parent_id: string;
  parent_name: string | null;
}

const AdminSubcategories: React.FC = () => {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<SubcategoryRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<SubcategoryRow | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ['admin-subcategories'],
    queryFn: async () => {
      // Categories where parent_id IS NOT NULL — i.e. subs.
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, is_active, parent_id')
        .not('parent_id', 'is', null)
        .order('name', { ascending: true });
      if (error) throw error;

      // Pull root names in a second query to keep the typing simple.
      const parentIds = Array.from(new Set((data || []).map((r: any) => r.parent_id))).filter(Boolean) as string[];
      let parentMap = new Map<string, string>();
      if (parentIds.length > 0) {
        const { data: parents } = await supabase
          .from('categories')
          .select('id, name')
          .in('id', parentIds);
        for (const p of (parents || []) as Array<{ id: string; name: string }>) {
          parentMap.set(p.id, p.name);
        }
      }

      return (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        is_active: r.is_active,
        parent_id: r.parent_id,
        parent_name: parentMap.get(r.parent_id) || null,
      })) as SubcategoryRow[];
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await supabase
        .from('categories')
        .update({ is_active: next })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-subcategories'] });
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-subcats'] });
      queryClient.invalidateQueries({ queryKey: ['categories-for-products'] });
      toast({ title: 'Subcategory updated' });
    },
    onError: (err: any) => {
      toast({
        title: 'Could not update subcategory',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-subcategories'] });
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-subcats'] });
      queryClient.invalidateQueries({ queryKey: ['categories-for-products'] });
      toast({ title: 'Subcategory deleted' });
      setDeleteRow(null);
    },
    onError: (err: any) => {
      toast({
        title: 'Could not delete subcategory',
        description: err?.message || 'A product may still reference it. Try deactivating instead.',
        variant: 'destructive',
      });
    },
  });

  const filtered = (rows || []).filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.slug.toLowerCase().includes(q) ||
      (r.parent_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout
      title="Subcategories"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>All Subcategories</CardTitle>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search subcategories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 sm:w-[220px]"
                />
              </div>
              <Button onClick={() => { setEditRow(null); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Subcategory
              </Button>
            </div>
          </div>
        </CardHeader>

        <AdminSubcategoryDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditRow(null);
          }}
          editCategory={editRow ? {
            id: editRow.id,
            name: editRow.name,
            slug: editRow.slug,
            parent_id: editRow.parent_id,
            is_active: editRow.is_active,
          } : null}
          forceParentId={editRow ? undefined : 'pick'}
        />

        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? 'No subcategories match your search.' : 'No subcategories yet — click +Add Subcategory above.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Parent category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.name}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          title="Click to copy — paste into bulk-upload subcategory_slug"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(sub.slug);
                              toast({ title: 'Slug copied', description: sub.slug });
                            } catch {
                              toast({ title: 'Copy failed', description: 'Select the slug and copy manually.', variant: 'destructive' });
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        >
                          <span>{sub.slug}</span>
                          <Copy className="w-3 h-3 text-slate-400" />
                        </button>
                      </TableCell>
                      <TableCell>
                        {sub.parent_name
                          ? <Badge variant="secondary">{sub.parent_name}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {sub.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit"
                            aria-label="Edit subcategory"
                            onClick={() => { setEditRow(sub); setDialogOpen(true); }}
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
                              <DropdownMenuItem
                                onClick={() => toggleActiveMutation.mutate({ id: sub.id, next: !sub.is_active })}
                              >
                                {sub.is_active ? (
                                  <>
                                    <EyeOff className="w-4 h-4 mr-2" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-4 h-4 mr-2" />
                                    Activate
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteRow(sub)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
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

      <AlertDialog open={!!deleteRow} onOpenChange={(open) => !open && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subcategory?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteRow?.name}" will be removed. Any products currently filed under it
              will have their subcategory cleared (they'll appear unfiltered on the store page).
              If you just want to hide it without losing the link, deactivate instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRow && deleteMutation.mutate(deleteRow.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminSubcategories;
