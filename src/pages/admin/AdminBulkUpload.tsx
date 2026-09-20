import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Vendor-first catalog: category is now the vendor's responsibility (set
// in Admin → Vendors). Products inherit it. Subcategory is OPTIONAL and
// must be one of the vendor's subcategory_ids; if blank, product just
// inherits the vendor's root.
const TEMPLATE_COLUMNS = [
  'name', 'description', 'subcategory_slug', 'unit_value', 'unit_type',
  'mrp', 'vendor_selling_price', 'admin_selling_price', 'max_order_quantity',
  'vendor_business_name', 'primary_image_url', 'status',
];

const TEMPLATE_EXAMPLE = {
  name: 'Aashirvaad Atta 5kg',
  description: 'Premium whole-wheat flour from selected grains',
  subcategory_slug: '',
  unit_value: 5,
  unit_type: 'kg',
  mrp: 350,
  vendor_selling_price: 250,
  admin_selling_price: 295,
  max_order_quantity: 5,
  vendor_business_name: 'Ambur Farms',
  primary_image_url: 'https://example.com/image.jpg',
  status: 'active',
};

// Source of truth for column documentation — used both in the downloaded
// .xlsx "ReadMe" sheet and in the on-page "Required columns" help card so
// the two can't drift apart.
const COLUMN_DOCS: Array<{ field: string; required: 'YES' | 'no'; notes: string }> = [
  { field: 'name', required: 'YES', notes: 'Product display name.' },
  { field: 'description', required: 'no', notes: 'Free text.' },
  { field: 'subcategory_slug', required: 'no', notes: "Optional. Any subcategory under the vendor's category. Examples: 'breakfast', 'lunch', 'dinner'. Copy the exact slug from /admin/subcategories. Blank = product files under the vendor's root (no filter pill on the store page)." },
  { field: 'unit_value', required: 'no', notes: 'Number, e.g. 5' },
  { field: 'unit_type', required: 'no', notes: 'kg, g, l, ml, piece, pack, dozen' },
  { field: 'mrp', required: 'YES', notes: 'Maximum retail price (₹)' },
  { field: 'vendor_selling_price', required: 'YES', notes: "The vendor's own price (₹). This is what the vendor gets paid on. Must be <= MRP." },
  { field: 'admin_selling_price', required: 'YES', notes: 'Customer-facing price (₹). What the customer pays. Leave empty and product stays hidden until admin sets later.' },
  { field: 'max_order_quantity', required: 'no', notes: 'Default 10' },
  { field: 'vendor_business_name', required: 'YES', notes: 'Must match an existing active vendor exactly. Vendor MUST have a catalog category assigned.' },
  { field: 'primary_image_url', required: 'no', notes: 'Public URL' },
  { field: 'status', required: 'no', notes: 'active / inactive (default active)' },
];

interface ParsedRow {
  rowIndex: number;
  raw: Record<string, any>;
  errors: string[];
  ready: any | null;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

const AdminBulkUpload: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');

  const { data: vendors = [] } = useQuery({
    queryKey: ['bulk-upload-vendors'],
    queryFn: async () => {
      // Pull category + subcategory_ids so we can validate subcategory_slug
      // belongs to the vendor's catalog and gate "vendor has no category".
      const { data } = await supabase
        .from('vendors')
        .select('id, business_name, category_id, subcategory_ids')
        .eq('status', 'active' as any);
      return (data || []) as Array<{ id: string; business_name: string; category_id: string | null; subcategory_ids: string[] | null }>;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['bulk-upload-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, slug, name, parent_id');
      return data || [];
    },
  });

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([TEMPLATE_EXAMPLE], { header: TEMPLATE_COLUMNS });

    // Column widths
    ws['!cols'] = TEMPLATE_COLUMNS.map(() => ({ wch: 22 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    // Add a "ReadMe" sheet with field descriptions
    const readme: any[] = [
      ['Field', 'Required', 'Notes'],
      ...COLUMN_DOCS.map(d => [d.field, d.required, d.notes]),
    ];
    const wsReadMe = XLSX.utils.aoa_to_sheet(readme);
    wsReadMe['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsReadMe, 'ReadMe');

    XLSX.writeFile(wb, 'product_upload_template.xlsx');
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

    const vendorByName = new Map(vendors.map((v) => [String(v.business_name).trim().toLowerCase(), v]));
    const categoryBySlug = new Map(categories.map((c: any) => [String(c.slug).trim().toLowerCase(), c]));

    const out: ParsedRow[] = rows.map((raw, idx) => {
      const errors: string[] = [];
      const name = String(raw.name || '').trim();
      const mrp = Number(raw.mrp);
      const adminPrice = raw.admin_selling_price === '' || raw.admin_selling_price === null ? null : Number(raw.admin_selling_price);
      const vendorPriceRaw = raw.vendor_selling_price;
      const vendorPrice = vendorPriceRaw === '' || vendorPriceRaw === null || vendorPriceRaw === undefined ? null : Number(vendorPriceRaw);
      const vendorName = String(raw.vendor_business_name || '').trim().toLowerCase();
      const subSlugRaw = String(raw.subcategory_slug || '').trim().toLowerCase();

      if (!name) errors.push('name required');
      if (!mrp || isNaN(mrp) || mrp <= 0) errors.push('mrp must be positive number');
      if (!vendorName) errors.push('vendor_business_name required');
      else if (!vendorByName.has(vendorName)) errors.push(`unknown vendor "${raw.vendor_business_name}"`);
      if (vendorPrice === null || isNaN(vendorPrice) || vendorPrice <= 0) errors.push('vendor_selling_price must be a positive number');
      else if (mrp && vendorPrice > mrp) errors.push('vendor_selling_price cannot exceed MRP');
      if (adminPrice !== null && (isNaN(adminPrice) || adminPrice <= 0)) errors.push('admin_selling_price must be positive number');

      const vendor = vendorByName.get(vendorName);

      // Vendor-first catalog gates:
      //   1. vendor must have a category_id (else can't insert any product).
      //   2. if subcategory_slug is supplied, it must resolve to one of
      //      the vendor's subcategory_ids.
      //   3. if empty, fall back to vendor.category_id (inherit root).
      let resolvedCategoryId: string | null = null;
      if (vendor && !vendor.category_id) {
        errors.push(`vendor "${vendor.business_name}" has no catalog category set — assign one in Admin → Vendors first`);
      } else if (vendor) {
        if (subSlugRaw) {
          const subCat = categoryBySlug.get(subSlugRaw) as any;
          if (!subCat) errors.push(`unknown subcategory_slug "${raw.subcategory_slug}"`);
          else if (subCat.parent_id !== vendor.category_id) {
            errors.push(`subcategory_slug "${raw.subcategory_slug}" is not under this vendor's category`);
          } else {
            resolvedCategoryId = subCat.id;
          }
        } else {
          resolvedCategoryId = vendor.category_id;
        }
      }

      const ready = errors.length === 0 ? {
        name,
        description: String(raw.description || '').trim() || null,
        category_id: resolvedCategoryId,
        unit_value: raw.unit_value ? Number(raw.unit_value) : null,
        unit_type: raw.unit_type ? String(raw.unit_type).trim() : null,
        mrp,
        admin_selling_price: adminPrice,
        selling_price: vendorPrice ?? mrp,
        stock_quantity: 999999, // stock is no longer a customer-visible concept; admin uses status='out_of_stock' to mark unavailable
        max_order_quantity: raw.max_order_quantity ? Number(raw.max_order_quantity) : 10,
        vendor_id: vendor?.id,
        primary_image_url: String(raw.primary_image_url || '').trim() || null,
        status: (String(raw.status || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active'),
        sku: `${slugify(name)}-${Date.now().toString(36)}-${idx}`,
        slug: `${slugify(name)}-${Date.now().toString(36)}-${idx}`,
      } : null;

      return { rowIndex: idx + 2, raw, errors, ready };
    });

    setParsed(out);
  };

  const validRows = parsed.filter(r => r.errors.length === 0);
  const invalidRows = parsed.filter(r => r.errors.length > 0);

  const commitMutation = useMutation({
    mutationFn: async () => {
      const payload = validRows.map(r => r.ready).filter(Boolean);
      if (payload.length === 0) throw new Error('No valid rows to insert');
      const { error } = await supabase.from('products').insert(payload as any);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({ title: `Inserted ${count} products` });
      setParsed([]);
      setFileName('');
    },
    onError: (err: any) => {
      toast({ title: 'Insert failed', description: err.message || 'See console', variant: 'destructive' });
      console.error(err);
    },
  });

  return (
    <DashboardLayout title="Bulk Product Upload" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Upload products from Excel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm space-y-2">
            <div className="font-semibold">Step 1: Download the template</div>
            <p className="text-muted-foreground">
              The template has the exact columns required and a ReadMe sheet explaining each field.
            </p>
            <Button onClick={downloadTemplate} variant="outline" className="gap-2">
              <Download className="w-4 h-4" /> Download .xlsx template
            </Button>
          </div>

          <details open className="bg-slate-50 border border-slate-200 rounded p-4 text-sm">
            <summary className="font-semibold cursor-pointer select-none">
              Columns reference ({COLUMN_DOCS.length}) — click to collapse
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Same data as the template's ReadMe sheet. Pay attention to{' '}
              <code className="px-1 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[11px]">subcategory_slug</code>{' '}
              — that's how each product gets filed under a menu section (Breakfast / Lunch / Dinner)
              so customers can filter on the store page.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="text-left py-1.5 pr-3 font-medium">Column</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Required</th>
                    <th className="text-left py-1.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMN_DOCS.map((c) => {
                    const isSubSlug = c.field === 'subcategory_slug';
                    return (
                      <tr key={c.field} className={`border-b border-slate-100 ${isSubSlug ? 'bg-amber-50/60' : ''}`}>
                        <td className="py-1.5 pr-3 font-mono align-top">{c.field}</td>
                        <td className="py-1.5 pr-3 align-top">
                          {c.required === 'YES'
                            ? <span className="text-rose-700 font-medium">YES</span>
                            : <span className="text-slate-500">no</span>}
                        </td>
                        <td className="py-1.5 align-top text-slate-700">{c.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>

          <div className="bg-green-50 border border-green-200 rounded p-4 text-sm space-y-2">
            <div className="font-semibold">Step 2: Upload your filled file</div>
            <p className="text-muted-foreground">Drop or click. We'll preview every row before inserting.</p>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <span className="bg-white border rounded px-4 py-2 text-sm font-medium hover:bg-gray-50 inline-flex items-center gap-2">
                <Upload className="w-4 h-4" /> Choose .xlsx file
              </span>
              {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
            </label>
          </div>
        </CardContent>
      </Card>

      {parsed.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>Preview · {parsed.length} rows</CardTitle>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800" variant="secondary">
                  <CheckCircle className="w-3 h-3 mr-1" /> {validRows.length} valid
                </Badge>
                {invalidRows.length > 0 && (
                  <Badge className="bg-red-100 text-red-800" variant="secondary">
                    <AlertTriangle className="w-3 h-3 mr-1" /> {invalidRows.length} with errors
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={() => { setParsed([]); setFileName(''); }}>
                  <X className="w-4 h-4 mr-1" /> Clear
                </Button>
                <Button
                  disabled={validRows.length === 0 || commitMutation.isPending}
                  onClick={() => commitMutation.mutate()}
                >
                  {commitMutation.isPending ? 'Inserting…' : `Insert ${validRows.length} products`}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Vendor ₹</TableHead>
                    <TableHead className="text-right">Admin ₹</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((r) => (
                    <TableRow key={r.rowIndex} className={cn(r.errors.length > 0 && 'bg-red-50')}>
                      <TableCell className="text-xs">{r.rowIndex}</TableCell>
                      <TableCell>
                        {r.errors.length === 0 ? (
                          <Badge className="bg-green-100 text-green-800" variant="secondary">OK</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800" variant="secondary">Error</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.raw.name || '-'}</TableCell>
                      <TableCell>{r.raw.vendor_business_name || '-'}</TableCell>
                      <TableCell className="text-xs">{r.raw.subcategory_slug || <span className="text-muted-foreground italic">(root)</span>}</TableCell>
                      <TableCell className="text-right">{r.raw.mrp || '-'}</TableCell>
                      <TableCell className="text-right">{r.raw.vendor_selling_price || '-'}</TableCell>
                      <TableCell className="text-right">{r.raw.admin_selling_price || '-'}</TableCell>
                      <TableCell className="text-xs text-red-700">
                        {r.errors.join('; ') || ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
};

export default AdminBulkUpload;
