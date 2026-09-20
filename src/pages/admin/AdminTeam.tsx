import React, { useState } from 'react';
import { sanitizePhone, formatPhoneForStorage, displayPhone } from '@/lib/phone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, MoreVertical, CheckCircle, XCircle, Shield, ShieldCheck } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/integrations/supabase/types';

type UserStatus = Database['public']['Enums']['user_status'];

interface AdminFormData {
  email: string;
  full_name: string;
  phone: string;
  department: string;
  designation: string;
  is_super_admin: boolean;
}

const initialFormData: AdminFormData = {
  email: '',
  full_name: '',
  phone: '',
  department: '',
  designation: '',
  is_super_admin: false,
};

const AdminTeam: React.FC = () => {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<AdminFormData>(initialFormData);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: admins, isLoading } = useQuery({
    queryKey: ['admin-team'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async (data: AdminFormData) => {
      const payload = {
        email: data.email,
        full_name: data.full_name,
        phone: formatPhoneForStorage(data.phone),
        department: data.department,
        designation: data.designation,
        is_super_admin: data.is_super_admin,
      };
      const { data: rpcData, error } = await supabase.rpc('admin_create_admin' as any, { payload });
      if (error) throw error;
      if (!(rpcData as any)?.ok) throw new Error((rpcData as any)?.error || 'Failed to add admin');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-team'] });
      toast({ title: 'Admin added successfully' });
      setIsDialogOpen(false);
      setFormData(initialFormData);
    },
    onError: (error: any) => {
      const raw = String(error?.message || '').toLowerCase();
      const looksMissing = raw.includes('does not exist') || raw.includes('could not find') || raw.includes('404');
      toast({
        title: 'Failed to add admin',
        description: looksMissing
          ? "RPC 'admin_create_admin' not found — Supabase migrations aren't deployed. Run `supabase db push` against the live project."
          : (error?.message || 'Server error — check the audit log or try again'),
        variant: 'destructive',
      });
    },
  });

  const { user: currentUser } = useAuthStore();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ adminId, status, ownerUserId }: { adminId: string; status: UserStatus; ownerUserId?: string | null }) => {
      // Guard: don't let an admin disable / suspend their own row — one
      // click and they'd lock themselves out.
      if (ownerUserId && currentUser?.id && ownerUserId === currentUser.id && status !== 'active') {
        throw new Error("You can't change your own admin status");
      }
      const { error } = await supabase
        .from('admins')
        .update({ status })
        .eq('id', adminId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-team'] });
      toast({ title: 'Admin status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      suspended: 'bg-red-100 text-red-800',
      blocked: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredAdmins = admins?.filter(
    (admin) =>
      admin.full_name.toLowerCase().includes(search.toLowerCase()) ||
      admin.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.full_name) {
      toast({ title: 'Email and full name are required', variant: 'destructive' });
      return;
    }
    createAdminMutation.mutate(formData);
  };

  return (
    <DashboardLayout
      title="Admin Team"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Team Members</CardTitle>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search admins..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 sm:w-[200px]"
                />
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Admin
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Admin</DialogTitle>
                    <DialogDescription>
                      Pre-register an admin by email. They can sign up using this email.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full Name *</Label>
                      <Input
                        id="full_name"
                        placeholder="John Doe"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        placeholder="9876543210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: sanitizePhone(e.target.value) })}
                        maxLength={10}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="department">Department</Label>
                        <Input
                          id="department"
                          placeholder="Operations"
                          value={formData.department}
                          onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="designation">Designation</Label>
                        <Input
                          id="designation"
                          placeholder="Manager"
                          value={formData.designation}
                          onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_super_admin"
                        checked={formData.is_super_admin}
                        onChange={(e) => setFormData({ ...formData, is_super_admin: e.target.checked })}
                        className="rounded border-input"
                      />
                      <Label htmlFor="is_super_admin" className="text-sm">
                        Super Admin (can manage other admins)
                      </Label>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createAdminMutation.isPending}>
                        {createAdminMutation.isPending ? 'Adding...' : 'Add Admin'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredAdmins?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No admins found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Linked</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdmins?.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {admin.is_super_admin ? (
                            <ShieldCheck className="w-4 h-4 text-yellow-500" />
                          ) : (
                            <Shield className="w-4 h-4 text-muted-foreground" />
                          )}
                          <div>
                            <p className="font-medium">{admin.full_name}</p>
                            <p className="text-xs text-muted-foreground">{admin.designation || '-'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{admin.email}</TableCell>
                      <TableCell>{admin.department || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {admin.is_super_admin ? 'Super Admin' : 'Admin'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(admin.status)} variant="secondary">
                          {admin.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {admin.user_id ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                            Pending Signup
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {admin.status === 'active' ? (
                              <DropdownMenuItem
                                disabled={!!currentUser?.id && admin.user_id === currentUser.id}
                                onClick={() => updateStatusMutation.mutate({ adminId: admin.id, status: 'suspended', ownerUserId: admin.user_id })}
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Suspend
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => updateStatusMutation.mutate({ adminId: admin.id, status: 'active', ownerUserId: admin.user_id })}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Activate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AdminTeam;
