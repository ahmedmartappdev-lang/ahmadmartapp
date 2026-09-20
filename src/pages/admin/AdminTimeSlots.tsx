import React, { useState } from 'react';
import { Clock, Plus, Pencil, Trash2 } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useTimeSlots, useCreateTimeSlot, useUpdateTimeSlot, useDeleteTimeSlot, TimeSlot } from '@/hooks/useTimeSlots';

const AdminTimeSlots: React.FC = () => {
  const { toast } = useToast();
  const { data: timeSlots, isLoading } = useTimeSlots();
  const createMutation = useCreateTimeSlot();
  const updateMutation = useUpdateTimeSlot();
  const deleteMutation = useDeleteTimeSlot();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<TimeSlot | null>(null);
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('11:00');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const openCreate = () => {
    setEditSlot(null);
    setName('');
    setStartTime('08:00');
    setEndTime('11:00');
    setDisplayOrder((timeSlots?.length || 0) + 1);
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (slot: TimeSlot) => {
    setEditSlot(slot);
    setName(slot.name);
    setStartTime(slot.start_time.substring(0, 5));
    setEndTime(slot.end_time.substring(0, 5));
    setDisplayOrder(slot.display_order);
    setIsActive(slot.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    try {
      if (editSlot) {
        await updateMutation.mutateAsync({ id: editSlot.id, name, start_time: startTime, end_time: endTime, display_order: displayOrder, is_active: isActive });
        toast({ title: 'Time slot updated' });
      } else {
        await createMutation.mutateAsync({ name, start_time: startTime, end_time: endTime, display_order: displayOrder, is_active: isActive });
        toast({ title: 'Time slot created' });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: err.message || 'Failed', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this time slot?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: 'Time slot deleted' });
    } catch (err: any) {
      toast({ title: err.message || 'Failed', variant: 'destructive' });
    }
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <DashboardLayout title="Time Slots" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Time Slots
            </CardTitle>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Add Slot
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !timeSlots || timeSlots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No time slots created yet. Add slots like Breakfast, Lunch, Dinner.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeSlots.map((slot) => (
                  <TableRow key={slot.id}>
                    <TableCell>{slot.display_order}</TableCell>
                    <TableCell className="font-medium">{slot.name}</TableCell>
                    <TableCell>{formatTime(slot.start_time)}</TableCell>
                    <TableCell>{formatTime(slot.end_time)}</TableCell>
                    <TableCell>
                      <Badge variant={slot.is_active ? 'default' : 'secondary'}>
                        {slot.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={() => openEdit(slot)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(slot.id)} className="text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editSlot ? 'Edit Time Slot' : 'Create Time Slot'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Name</label>
              <Input placeholder="e.g. Breakfast, Lunch, Dinner" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Start Time</label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">End Time</label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Display Order</label>
              <Input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(Number(e.target.value))} min={0} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <label className="text-sm font-medium">Active</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editSlot ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminTimeSlots;
