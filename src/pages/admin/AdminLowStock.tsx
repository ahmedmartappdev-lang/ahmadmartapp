import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Search, Package, Save } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const DEFAULT_THRESHOLD = 10;

const AdminLowStock: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [globalThreshold, setGlobalThreshold] = useState<string>(String(DEFAULT_THRESHOLD));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState<string>('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['low-stock-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, stock_quantity, status, primary_image_url, vendor:vendors(business_name), category:categories(name)')
        .in('status', ['active', 'out_of_stock'])
        .order('stock_quantity', { ascending: true })
        .limit(500);
      if (error) {
        console.error(error);
        return [];
      }
      return data || [];
    },
  });

  const threshold = Number(globalThreshold) || DEFAULT_THRESHOLD;
  const lowStock = useMemo(() => {
    let arr = (products as any[]).filter(p => Number(p.stock_quantity || 0) <= threshold);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.vendor?.business_name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q)
      );
    }
    return arr;
  }, [products, threshold, search]);

  const outOfStockCount = (products as any[]).filter(p => Number(p.stock_quantity || 0) <= 0).length;
  const criticalCount = (products as any[]).filter(p => {
    const s = Number(p.stock_quantity || 0);
    return s > 0 && s <= Math.max(3, Math.floor(threshold / 3));
  }).length;
  const lowCount = lowStock.length;

  const saveStockMutation = useMutation({
    mutationFn: async ({ productId, stock }: { productId: string; stock: number }) => {
      const update: any = { stock_quantity: stock };
      if (stock > 0) update.status = 'active';
      const { error } = await supabase.from('products').update(update).eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['low-stock-products'] });
      toast({ title: 'Stock updated' });
      setEditingId(null);
      setEditStock('');
    },
    onError: (err: any) => toast({ title: 'Update failed', description: err.message, variant: 'destructive' }),
  });

  return (
    <DashboardLayout title="Low Stock" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatsCard title="Out of stock" value={outOfStockCount} icon={Package} iconColor="bg-red-100 text-red-600" />
        <StatsCard title="Critical (≤ 3)" value={criticalCount} icon={AlertTriangle} iconColor="bg-orange-100 text-orange-600" />
        <StatsCard title={`Below threshold (≤ ${threshold})`} value={lowCount} icon={AlertTriangle} iconColor="bg-yellow-100 text-yellow-600" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search product / vendor" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Alert threshold</span>
              <Select value={globalThreshold} onValueChange={setGlobalThreshold}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">≤ 3</SelectItem>
                  <SelectItem value="5">≤ 5</SelectItem>
                  <SelectItem value="10">≤ 10</SelectItem>
                  <SelectItem value="20">≤ 20</SelectItem>
                  <SelectItem value="50">≤ 50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : lowStock.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>All products are above threshold. 🎉</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Quick refill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.map((p: any) => {
                    const stock = Number(p.stock_quantity || 0);
                    const out = stock <= 0;
                    const critical = stock > 0 && stock <= Math.max(3, Math.floor(threshold / 3));
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {p.primary_image_url && (
                              <img src={p.primary_image_url} alt="" className="w-10 h-10 rounded object-cover" />
                            )}
                            <div>
                              <div className="font-medium">{p.name}</div>
                              {p.sku && <div className="text-xs text-muted-foreground">{p.sku}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{(p.vendor as any)?.business_name || '—'}</TableCell>
                        <TableCell className="text-sm">{(p.category as any)?.name || '—'}</TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            'inline-block px-2 py-0.5 rounded text-xs font-bold',
                            out ? 'bg-red-100 text-red-800' :
                            critical ? 'bg-orange-100 text-orange-800' :
                            'bg-yellow-100 text-yellow-800'
                          )}>
                            {out ? 'OUT' : `${stock}`}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {editingId === p.id ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="number"
                                value={editStock}
                                onChange={(e) => setEditStock(e.target.value)}
                                className="w-20 h-8 text-sm"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                disabled={!editStock || saveStockMutation.isPending}
                                onClick={() => saveStockMutation.mutate({ productId: p.id, stock: Number(editStock) })}
                              >
                                <Save className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditStock(''); }}>×</Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setEditingId(p.id); setEditStock(String(Math.max(threshold * 5, 50))); }}
                            >
                              Refill
                            </Button>
                          )}
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

export default AdminLowStock;
