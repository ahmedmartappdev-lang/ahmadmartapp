import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Edit, Trash2, MoreVertical, ChevronRight, FolderPlus } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CategoryForm } from '@/components/admin/CategoryForm';
import { AdminSubcategoryDialog } from '@/components/admin/AdminSubcategoryDialog';

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  offer_text?: string | null;
  image_url: string | null;
  display_order: number | null;
  is_active: boolean | null;
  parent_id: string | null;
};

const AdminCategories: React.FC = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryRow | null>(null);
  const [forceParentId, setForceParentId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allCategories, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });
      return (data || []) as CategoryRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Category deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete category', variant: 'destructive' });
    },
  });

  // Build tree: parents first, then their children underneath
  const parentCategories = allCategories?.filter(c => !c.parent_id) || [];
  const getChildren = (parentId: string) =>
    allCategories?.filter(c => c.parent_id === parentId) || [];

  const orderedCategories: (CategoryRow & { isChild: boolean })[] = [];
  parentCategories.forEach(parent => {
    orderedCategories.push({ ...parent, isChild: false });
    getChildren(parent.id).forEach(child => {
      orderedCategories.push({ ...child, isChild: true });
    });
  });
  // Also add orphans (categories whose parent doesn't exist in the list)
  const allIds = new Set(allCategories?.map(c => c.id) || []);
  allCategories?.forEach(c => {
    if (c.parent_id && !allIds.has(c.parent_id)) {
      if (!orderedCategories.find(o => o.id === c.id)) {
        orderedCategories.push({ ...c, isChild: true });
      }
    }
  });

  const getParentName = (parentId: string | null) => {
    if (!parentId) return null;
    return allCategories?.find(c => c.id === parentId)?.name || null;
  };

  const filteredCategories = orderedCategories.filter(cat =>
    cat.name.toLowerCase().includes(search.toLowerCase()) ||
    (getParentName(cat.parent_id) || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout
      title="Categories Management"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>All Categories</CardTitle>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search categories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 sm:w-[200px]"
                />
              </div>
              <Button variant="outline" onClick={() => { setEditCategory(null); setForceParentId('pick'); setFormOpen(true); }}>
                <FolderPlus className="w-4 h-4 mr-2" />
                Add Subcategory
              </Button>
              <Button onClick={() => { setEditCategory(null); setForceParentId(undefined); setFormOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Category
              </Button>
            </div>
          </div>
        </CardHeader>
        {/* Subcategory add/edit uses the minimal dialog — name + slug only,
            no offer_tag/image/banner since those are root-category concerns.
            Roots still use the full CategoryForm below. */}
        {(() => {
          const isSubOperation =
            (editCategory && editCategory.parent_id) ||
            (!editCategory && forceParentId !== undefined);
          if (isSubOperation) {
            return (
              <AdminSubcategoryDialog
                open={formOpen}
                onOpenChange={(open) => {
                  setFormOpen(open);
                  if (!open) { setEditCategory(null); setForceParentId(undefined); }
                }}
                editCategory={editCategory ? {
                  id: editCategory.id,
                  name: editCategory.name,
                  slug: editCategory.slug,
                  parent_id: editCategory.parent_id,
                  is_active: editCategory.is_active,
                } : null}
                forceParentId={forceParentId}
              />
            );
          }
          return (
            <CategoryForm
              open={formOpen}
              onOpenChange={(open) => {
                setFormOpen(open);
                if (!open) { setEditCategory(null); setForceParentId(undefined); }
              }}
              editCategory={editCategory}
              forceParentId={forceParentId}
            />
          );
        })()}
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No categories found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCategories.map((category) => {
                    const childCount = getChildren(category.id).length;
                    const parentName = getParentName(category.parent_id);

                    return (
                      <TableRow key={category.id} className={category.isChild ? 'bg-muted/20' : ''}>
                        <TableCell>
                          <div className={`flex items-center gap-3 ${category.isChild ? 'pl-6' : ''}`}>
                            {category.isChild && (
                              <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                            )}
                            <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0">
                              {category.image_url ? (
                                <img
                                  src={category.image_url}
                                  alt={category.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-lg">
                                  📁
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{category.name}</p>
                              {category.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">{category.description}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {category.isChild ? (
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-xs">
                              Sub of {parentName}
                            </Badge>
                          ) : childCount > 0 ? (
                            <Badge variant="secondary" className="bg-purple-50 text-purple-700 text-xs">
                              Parent ({childCount} sub)
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Standalone</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{category.slug}</TableCell>
                        <TableCell>{category.display_order}</TableCell>
                        <TableCell>
                          <Badge variant={category.is_active ? 'default' : 'secondary'}>
                            {category.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditCategory(category); setForceParentId(undefined); setFormOpen(true); }}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              {!category.isChild && (
                                <DropdownMenuItem onClick={() => { setEditCategory(null); setForceParentId(category.id); setFormOpen(true); }}>
                                  <FolderPlus className="w-4 h-4 mr-2" />
                                  Add Subcategory
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteMutation.mutate(category.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AdminCategories;
