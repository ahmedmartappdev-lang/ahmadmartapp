import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Edit, Trash2, MoreVertical, Package, Check, X } from 'lucide-react';
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
import { ProductForm } from '@/components/admin/ProductForm';
import type { Database } from '@/integrations/supabase/types';
import { getEffectivePrice } from '@/lib/pricing';

type ProductRow = Database['public']['Tables']['products']['Row'] & {
  categories: { name: string } | null;
};

const AdminProducts: React.FC = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductRow | null>(null);
  const [search, setSearch] = useState('');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({ title: 'Product deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete product', variant: 'destructive' });
    },
  });

  const updateAdminPrice = useMutation({
    mutationFn: async ({ productId, price }: { productId: string; price: number | null }) => {
      const { error } = await supabase
        .from('products')
        .update({ admin_selling_price: price } as any)
        .eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({ title: 'Admin price updated' });
      setEditingPriceId(null);
    },
    onError: () => {
      toast({ title: 'Failed to update price', variant: 'destructive' });
    },
  });

  const updatePriceStatus = useMutation({
    mutationFn: async ({ productId, status }: { productId: string; status: string }) => {
      const { error } = await supabase
        .from('products')
        .update({ price_status: status } as any)
        .eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({ title: 'Price status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      out_of_stock: 'bg-red-100 text-red-800',
      discontinued: 'bg-yellow-100 text-yellow-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredProducts = products?.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase()) ||
    product.sku.toLowerCase().includes(search.toLowerCase())
  );

  const getPriceStatusColor = (status: string) => {
    if (status === 'pending') return 'bg-yellow-100 text-yellow-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-green-100 text-green-800';
  };

  return (
    <DashboardLayout
      title="Products Management"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>All Products</CardTitle>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 sm:w-[200px]"
                />
              </div>
              <Button onClick={() => { setEditProduct(null); setFormOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </div>
          </div>
        </CardHeader>
        <ProductForm
          open={formOpen}
          onOpenChange={setFormOpen}
          editProduct={editProduct as any}
        />
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredProducts?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No products found</div>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {filteredProducts?.map((product) => (
                  <div key={product.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-10 w-10 overflow-hidden rounded-lg bg-muted">
                          {product.primary_image_url ? (
                            <img src={product.primary_image_url} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <Package className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{product.name}</p>
                          <p className="truncate text-xs text-slate-500">{product.brand || product.categories?.name || product.sku}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditProduct(product); setFormOpen(true); }}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(product.id)}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">SKU</span>
                        <span className="font-mono text-slate-700">{product.sku}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Category</span>
                        <span className="text-slate-700">{product.categories?.name || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Variants</span>
                        <span className="text-slate-700">{(product as any).variants?.length || 0}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Price</span>
                        <div className="text-right">
                          <p className="font-medium text-slate-900">₹{product.selling_price}</p>
                          {product.discount_percentage > 0 && <p className="text-xs text-muted-foreground line-through">₹{product.mrp}</p>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Admin Price</span>
                        {editingPriceId === product.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              className="h-8 w-24 text-sm"
                              value={editingPriceValue}
                              onChange={(e) => setEditingPriceValue(e.target.value)}
                              autoFocus
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                              const val = editingPriceValue ? Number(editingPriceValue) : null;
                              updateAdminPrice.mutate({ productId: product.id, price: val });
                            }}>
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingPriceId(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="text-sm font-medium hover:underline"
                            onClick={() => {
                              setEditingPriceId(product.id);
                              setEditingPriceValue((product as any).admin_selling_price?.toString() || '');
                            }}
                          >
                            {(product as any).admin_selling_price != null ? `₹${(product as any).admin_selling_price}` : '-'}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Price Status</span>
                        <Badge
                          className={`${getPriceStatusColor((product as any).price_status || 'approved')} cursor-pointer`}
                          variant="secondary"
                          onClick={() => {
                            const current = (product as any).price_status || 'approved';
                            const next = current === 'pending' ? 'approved' : current === 'approved' ? 'rejected' : 'approved';
                            updatePriceStatus.mutate({ productId: product.id, status: next });
                          }}
                        >
                          {((product as any).price_status || 'approved')}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Status</span>
                        <Badge className={getStatusColor(product.status)} variant="secondary">
                          {(product.status ?? '').replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Variants</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Admin Price</TableHead>
                    <TableHead>Price Status</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts?.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden">
                            {product.primary_image_url ? (
                              <img 
                                src={product.primary_image_url} 
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                <Package className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.brand}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                      <TableCell>{product.categories?.name || '-'}</TableCell>
                      <TableCell>
                        {(product as any).variants?.length > 0 ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            {(product as any).variants.length} variant{(product as any).variants.length > 1 ? 's' : ''}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">₹{product.selling_price}</p>
                          {product.discount_percentage > 0 && (
                            <p className="text-xs text-muted-foreground line-through">₹{product.mrp}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {editingPriceId === product.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              className="w-20 h-7 text-sm"
                              value={editingPriceValue}
                              onChange={(e) => setEditingPriceValue(e.target.value)}
                              autoFocus
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                              const val = editingPriceValue ? Number(editingPriceValue) : null;
                              updateAdminPrice.mutate({ productId: product.id, price: val });
                            }}>
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingPriceId(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="text-sm hover:underline"
                            onClick={() => {
                              setEditingPriceId(product.id);
                              setEditingPriceValue((product as any).admin_selling_price?.toString() || '');
                            }}
                          >
                            {(product as any).admin_selling_price != null ? `₹${(product as any).admin_selling_price}` : '-'}
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${getPriceStatusColor((product as any).price_status || 'approved')} cursor-pointer`}
                          variant="secondary"
                          onClick={() => {
                            const current = (product as any).price_status || 'approved';
                            const next = current === 'pending' ? 'approved' : current === 'approved' ? 'rejected' : 'approved';
                            updatePriceStatus.mutate({ productId: product.id, status: next });
                          }}
                        >
                          {((product as any).price_status || 'approved')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(product.status)} variant="secondary">
                          {(product.status ?? '').replace(/_/g, ' ')}
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
                            <DropdownMenuItem onClick={() => { setEditProduct(product); setFormOpen(true); }}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(product.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
    </DashboardLayout>
  );
};

export default AdminProducts;
