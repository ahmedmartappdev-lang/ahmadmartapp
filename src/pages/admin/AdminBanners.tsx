import React, { useState, useEffect } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { useAllBanners, useCreateBanner, useUpdateBanner, useDeleteBanner, Banner } from '@/hooks/useBanners';
import { useAllCategories } from '@/hooks/useCategories';
import { ImageUpload } from '@/components/ui/image-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

type LinkMode = 'none' | 'category' | 'custom';

function deriveLinkMode(linkUrl: string | null | undefined): LinkMode {
  if (!linkUrl) return 'none';
  if (linkUrl.startsWith('/category/')) return 'category';
  return 'custom';
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return '/' + trimmed;
}

const AdminBanners: React.FC = () => {
  const { data: banners, isLoading } = useAllBanners();
  const createBanner = useCreateBanner();
  const updateBanner = useUpdateBanner();
  const deleteBanner = useDeleteBanner();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState({ title: '', image_url: '', link_url: '', display_order: 0, is_active: true });
  const [linkMode, setLinkMode] = useState<LinkMode>('none');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('');

  const { data: allCategories } = useAllCategories();
  const rootCategories = (allCategories || []).filter((c: any) => !c.parent_id);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', image_url: '', link_url: '', display_order: (banners?.length || 0), is_active: true });
    setLinkMode('none');
    setSelectedCategorySlug('');
    setDialogOpen(true);
  };

  const openEdit = (b: Banner) => {
    setEditing(b);
    setForm({ title: b.title || '', image_url: b.image_url, link_url: b.link_url || '', display_order: b.display_order, is_active: b.is_active });
    const mode = deriveLinkMode(b.link_url);
    setLinkMode(mode);
    setSelectedCategorySlug(mode === 'category' ? (b.link_url || '').replace('/category/', '') : '');
    setDialogOpen(true);
  };

  // Sync selectedCategorySlug into form.link_url
  useEffect(() => {
    if (linkMode === 'none') {
      setForm(f => (f.link_url ? { ...f, link_url: '' } : f));
    } else if (linkMode === 'category') {
      const next = selectedCategorySlug ? `/category/${selectedCategorySlug}` : '';
      setForm(f => (f.link_url === next ? f : { ...f, link_url: next }));
    }
  }, [linkMode, selectedCategorySlug]);

  const handleSubmit = async () => {
    if (!form.image_url) { toast.error('Please upload an image'); return; }
    const finalLinkUrl =
      linkMode === 'none' ? null :
      linkMode === 'category' ? (selectedCategorySlug ? `/category/${selectedCategorySlug}` : null) :
      normalizeUrl(form.link_url);
    try {
      if (editing) {
        await updateBanner.mutateAsync({
          id: editing.id,
          ...form,
          title: form.title || null,
          link_url: finalLinkUrl,
        });
        toast.success('Banner updated');
      } else {
        await createBanner.mutateAsync({
          ...form,
          title: form.title || undefined,
          link_url: finalLinkUrl || undefined,
        });
        toast.success('Banner created');
      }
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this banner?')) return;
    try {
      await deleteBanner.mutateAsync(id);
      toast.success('Banner deleted');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleActive = async (b: Banner) => {
    await updateBanner.mutateAsync({ id: b.id, is_active: !b.is_active });
  };

  return (
    <DashboardLayout title="Banners" navItems={adminNavItems} roleColor="bg-purple-100 text-purple-700" roleName="Admin Panel">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">Manage Banners</h2>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Banner</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading...</div>
      ) : !banners || banners.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No banners yet. Add one to show on the homepage.</div>
      ) : (
        <div className="grid gap-4">
          {banners.map((b) => (
            <Card key={b.id} className={!b.is_active ? 'opacity-50' : ''}>
              <CardContent className="flex items-center gap-4 p-4">
                <GripVertical className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <img src={b.image_url} alt={b.title || 'Banner'} className="w-32 h-20 object-cover rounded-lg border" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{b.title || 'Untitled Banner'}</p>
                  <p className="text-xs text-muted-foreground">Order: {b.display_order}</p>
                </div>
                <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} />
                <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(b.id)}><Trash2 className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Banner' : 'Add Banner'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Banner Image *</Label>
              <ImageUpload value={form.image_url} onChange={(url) => setForm(f => ({ ...f, image_url: url }))} bucket="banner-images" folder="banners" />
            </div>
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Tap-through link</Label>
              <Select value={linkMode} onValueChange={(v) => setLinkMode(v as LinkMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No link (banner just decorative)</SelectItem>
                  <SelectItem value="category">Open a category</SelectItem>
                  <SelectItem value="custom">Custom URL</SelectItem>
                </SelectContent>
              </Select>
              {linkMode === 'category' && (
                <Select value={selectedCategorySlug} onValueChange={setSelectedCategorySlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {rootCategories.map((c: any) => (
                      <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {linkMode === 'custom' && (
                <>
                  <Input
                    value={form.link_url}
                    onChange={(e) => setForm(f => ({ ...f, link_url: e.target.value }))}
                    placeholder="/category/fruits or https://..."
                  />
                  <p className="text-xs text-muted-foreground">Leading "/" added automatically if missing.</p>
                </>
              )}
            </div>
            <div>
              <Label>Display Order</Label>
              <Input type="number" value={form.display_order} onChange={(e) => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
              <Label>Active</Label>
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={createBanner.isPending || updateBanner.isPending}>
              {editing ? 'Update' : 'Create'} Banner
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminBanners;
