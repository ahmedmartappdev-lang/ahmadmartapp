import React, { useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { useServiceAreas, type ServiceArea, type ServiceAreaInput } from '@/hooks/useServiceAreas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPicker, type MapPickerResult } from '@/components/ui/map-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, MapPin, Trash2, Edit2, Navigation } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const AdminServiceAreas: React.FC = () => {
  const { serviceAreas, isLoading, addServiceArea, updateServiceArea, deleteServiceArea } = useServiceAreas();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<ServiceArea | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState(5);
  const [isActive, setIsActive] = useState(true);

  const openCreate = () => {
    setEditingArea(null);
    setName('');
    setLat(null);
    setLng(null);
    setRadius(5);
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (area: ServiceArea) => {
    setEditingArea(area);
    setName(area.name);
    setLat(area.center_latitude);
    setLng(area.center_longitude);
    setRadius(area.radius_km);
    setIsActive(area.is_active);
    setDialogOpen(true);
  };

  const handleLocationSelect = (result: MapPickerResult) => {
    setLat(result.latitude);
    setLng(result.longitude);
    // Auto-fill name from city if name is empty
    if (!name && result.city) {
      setName(result.city);
    }
  };

  const handleSave = () => {
    if (!name.trim() || lat === null || lng === null) return;
    const input: ServiceAreaInput = {
      name: name.trim(),
      center_latitude: lat,
      center_longitude: lng,
      radius_km: radius,
      is_active: isActive,
    };
    if (editingArea) {
      updateServiceArea.mutate({ ...input, id: editingArea.id }, {
        onSuccess: () => setDialogOpen(false),
      });
    } else {
      addServiceArea.mutate(input, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteServiceArea.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  };

  const handleToggleActive = (area: ServiceArea) => {
    updateServiceArea.mutate({
      id: area.id,
      name: area.name,
      center_latitude: area.center_latitude,
      center_longitude: area.center_longitude,
      radius_km: area.radius_km,
      is_active: !area.is_active,
    });
  };

  return (
    <DashboardLayout
      title="Service Areas"
      navItems={adminNavItems}
      roleColor="bg-red-100 text-red-800"
      roleName="Admin Panel"
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Delivery Zones</h2>
            <p className="text-sm text-muted-foreground">
              Define areas where your delivery service is available. Customers outside these zones won't be able to place orders.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Zone
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : serviceAreas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <MapPin className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">No Service Areas Defined</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                All locations are currently serviceable. Add a zone to restrict delivery to specific areas.
              </p>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Zone
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {serviceAreas.map((area) => (
              <Card key={area.id} className="relative overflow-hidden">
                {/* Static map preview */}
                <div className="h-32 bg-muted relative">
                  <img
                    src={`https://maps.googleapis.com/maps/api/staticmap?center=${area.center_latitude},${area.center_longitude}&zoom=13&size=400x200&scale=2&markers=color:red%7C${area.center_latitude},${area.center_longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`}
                    alt={area.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <Badge
                    variant={area.is_active ? 'default' : 'secondary'}
                    className="absolute top-2 right-2"
                  >
                    {area.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{area.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {area.radius_km} km radius
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(area)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(area.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {Number(area.center_latitude).toFixed(4)}, {Number(area.center_longitude).toFixed(4)}
                    </span>
                    <Switch
                      checked={area.is_active}
                      onCheckedChange={() => handleToggleActive(area)}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingArea ? 'Edit Service Area' : 'Add Service Area'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <MapPicker
              onLocationSelect={handleLocationSelect}
              initialLat={lat}
              initialLng={lng}
              height="220px"
            />

            <div className="space-y-1">
              <Label>Zone Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greater Noida, Sector 1" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Latitude</Label>
                <Input value={lat?.toFixed(6) || ''} readOnly className="bg-muted" />
              </div>
              <div className="space-y-1">
                <Label>Longitude</Label>
                <Input value={lng?.toFixed(6) || ''} readOnly className="bg-muted" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Radius (km) *</Label>
              <Input
                type="number"
                min={0.5}
                max={50}
                step={0.5}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Delivery will be available within {radius} km of the center point.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || lat === null || lng === null || addServiceArea.isPending || updateServiceArea.isPending}
            >
              {addServiceArea.isPending || updateServiceArea.isPending ? 'Saving...' : editingArea ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service Area?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this delivery zone. Customers in this area may no longer be served.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminServiceAreas;
