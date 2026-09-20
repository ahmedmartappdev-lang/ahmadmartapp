import React, { useState } from 'react';
import { sanitizePhone } from '@/lib/phone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Eye, MoreVertical, Shield, Ban, Phone, Mail, Calendar, UserPlus, Wallet } from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ALL_ROLES = ['customer', 'vendor', 'delivery_partner', 'admin'] as const;

const AdminUsers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [manageRolesUser, setManageRolesUser] = useState<any | null>(null);
  const [roleToAdd, setRoleToAdd] = useState('');
  const [blockConfirmUser, setBlockConfirmUser] = useState<any | null>(null);
  const [newUser, setNewUser] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
    role: 'customer' as string,
  });

  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch roles for each user
      const usersWithRoles = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id);
          return { ...profile, user_roles: roles || [] };
        })
      );

      return usersWithRoles;
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async () => {
      // 1. Sign up the user via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: { full_name: newUser.full_name },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      const userId = authData.user.id;

      // 2. Upsert profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: userId,
          full_name: newUser.full_name,
          phone: newUser.phone || null,
        }, { onConflict: 'user_id' });

      if (profileError) throw profileError;

      // 3. Insert user role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: newUser.role as any,
        });

      if (roleError) throw roleError;

      return authData.user;
    },
    onSuccess: () => {
      toast.success('User created successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setAddUserOpen(false);
      setNewUser({ full_name: '', phone: '', email: '', password: '', role: 'customer' });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create user');
    },
  });

  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: role as any });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Role added');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add role');
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Role removed');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove role');
    },
  });

  const blockUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'blocked' })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('User blocked');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setBlockConfirmUser(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to block user');
    },
  });

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.full_name || !newUser.email || !newUser.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    addUserMutation.mutate();
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'text-emerald-700',
      inactive: 'text-slate-500',
      suspended: 'text-amber-700',
      blocked: 'text-red-700',
    };
    return colors[status] || 'text-slate-600';
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'text-red-700',
      vendor: 'text-violet-700',
      delivery_partner: 'text-blue-700',
      customer: 'text-emerald-700',
    };
    return colors[role] || 'text-slate-600';
  };

  const filteredUsers = users?.filter(user =>
    user.full_name.toLowerCase().includes(search.toLowerCase()) ||
    user.phone?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout
      title="Users Management"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50/90">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CardTitle className="text-slate-900">All Users</CardTitle>
              <Button size="sm" className="rounded-md" onClick={() => setAddUserOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </div>
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full rounded-md border-slate-300 sm:w-[250px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredUsers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No users found</div>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {filteredUsers?.map((user) => (
                  <div key={user.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={user.profile_image_url || undefined} />
                          <AvatarFallback>{user.full_name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-slate-900">{user.full_name}</p>
                          <p className="text-xs text-slate-500">{user.user_id.slice(0, 8)}...</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-md text-slate-600 hover:bg-white hover:text-slate-900">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setManageRolesUser(user); setRoleToAdd(''); }}>
                            <Shield className="w-4 h-4 mr-2" />
                            Manage Roles
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setBlockConfirmUser(user)}
                            disabled={user.status === 'blocked'}
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            {user.status === 'blocked' ? 'Blocked' : 'Block User'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Phone</span>
                        <span className="text-slate-700">{user.phone || '-'}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">Roles</span>
                        <div className="flex max-w-[65%] flex-wrap justify-end gap-1">
                          {user.user_roles?.map((r: any, i: number) => (
                            <span key={i} className={`text-sm font-semibold ${getRoleColor(r.role)}`}>
                              {(r.role ?? '').replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Credit</span>
                        <span className="font-medium text-slate-900">
                          {user.credit_balance != null ? `Rs. ${Number(user.credit_balance).toFixed(2)}` : 'Rs. 0.00'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Status</span>
                        <span className={`text-sm font-semibold capitalize ${getStatusColor(user.status)}`}>{user.status}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Joined</span>
                        <span className="text-slate-700">{new Date(user.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                <TableHeader className="bg-slate-100">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">User</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Phone</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Roles</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Credit Balance</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Status</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Joined</TableHead>
                    <TableHead className="h-14 px-5 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers?.map((user) => (
                    <TableRow key={user.id} className="border-slate-200 hover:bg-white">
                      <TableCell className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={user.profile_image_url || undefined} />
                            <AvatarFallback>
                              {user.full_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-slate-900">{user.full_name}</p>
                            <p className="text-xs text-slate-500">{user.user_id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-5 text-sm text-slate-700">{user.phone || '-'}</TableCell>
                      <TableCell className="px-5 py-5">
                        <div className="flex flex-wrap gap-1">
                          {user.user_roles?.map((r: any, i: number) => (
                            <span key={i} className={`text-sm font-semibold ${getRoleColor(r.role)}`}>
                              {(r.role ?? '').replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-5">
                        <div className="flex items-center gap-1">
                          <Wallet className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-slate-900">
                            {user.credit_balance != null
                              ? `Rs. ${Number(user.credit_balance).toFixed(2)}`
                              : 'Rs. 0.00'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-5">
                        <span className={`text-sm font-semibold capitalize ${getStatusColor(user.status)}`}>
                          {user.status}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-5 text-sm text-slate-700">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="px-5 py-5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-md text-slate-600 hover:bg-white hover:text-slate-900">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setManageRolesUser(user); setRoleToAdd(''); }}>
                              <Shield className="w-4 h-4 mr-2" />
                              Manage Roles
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setBlockConfirmUser(user)}
                              disabled={user.status === 'blocked'}
                            >
                              <Ban className="w-4 h-4 mr-2" />
                              {user.status === 'blocked' ? 'Blocked' : 'Block User'}
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

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>User Profile</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={selectedUser.profile_image_url} />
                  <AvatarFallback className="text-lg">{selectedUser.full_name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">{selectedUser.full_name}</h3>
                  <Badge className={getStatusColor(selectedUser.status)} variant="secondary">
                    {selectedUser.status}
                  </Badge>
                </div>
              </div>
              <div className="space-y-3 bg-muted/50 rounded-lg p-4">
                {selectedUser.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedUser.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>Joined {new Date(selectedUser.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Wallet className="w-4 h-4 text-muted-foreground" />
                  <span>
                    Credit Balance:{' '}
                    <span className="font-semibold">
                      {selectedUser.credit_balance != null
                        ? `Rs. ${Number(selectedUser.credit_balance).toFixed(2)}`
                        : 'Rs. 0.00'}
                    </span>
                  </span>
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Roles</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.user_roles?.map((r: any, i: number) => (
                    <Badge key={i} className={getRoleColor(r.role)} variant="secondary">
                      {(r.role ?? '').replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                placeholder="Enter full name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="Enter phone number"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: sanitizePhone(e.target.value) })}
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter email address"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser({ ...newUser, role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="delivery_partner">Delivery Partner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddUserOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addUserMutation.isPending}>
                {addUserMutation.isPending ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Manage Roles Dialog */}
      <Dialog open={!!manageRolesUser} onOpenChange={() => setManageRolesUser(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Roles</DialogTitle>
            <DialogDescription>
              Add or remove roles for {manageRolesUser?.full_name}
            </DialogDescription>
          </DialogHeader>
          {manageRolesUser && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Current Roles</h4>
                <div className="flex flex-wrap gap-2">
                  {manageRolesUser.user_roles?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No roles assigned</p>
                  )}
                  {manageRolesUser.user_roles?.map((r: any, i: number) => (
                    <Badge key={i} className={getRoleColor(r.role)} variant="secondary">
                      {(r.role ?? '').replace(/_/g, ' ')}
                      <button
                        className="ml-1.5 hover:text-destructive"
                        onClick={() => {
                          removeRoleMutation.mutate(
                            { userId: manageRolesUser.user_id, role: r.role },
                            {
                              onSuccess: () => {
                                setManageRolesUser((prev: any) =>
                                  prev ? { ...prev, user_roles: prev.user_roles.filter((_: any, idx: number) => idx !== i) } : null
                                );
                              },
                            }
                          );
                        }}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Add Role</h4>
                <div className="flex gap-2">
                  <Select value={roleToAdd} onValueChange={setRoleToAdd}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.filter(
                        role => !manageRolesUser.user_roles?.some((r: any) => r.role === role)
                      ).map(role => (
                        <SelectItem key={role} value={role}>
                          {(role ?? '').replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={!roleToAdd || addRoleMutation.isPending}
                    onClick={() => {
                      if (!roleToAdd) return;
                      addRoleMutation.mutate(
                        { userId: manageRolesUser.user_id, role: roleToAdd },
                        {
                          onSuccess: () => {
                            setManageRolesUser((prev: any) =>
                              prev ? { ...prev, user_roles: [...prev.user_roles, { role: roleToAdd }] } : null
                            );
                            setRoleToAdd('');
                          },
                        }
                      );
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Block User Confirmation */}
      <AlertDialog open={!!blockConfirmUser} onOpenChange={() => setBlockConfirmUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to block {blockConfirmUser?.full_name}? They will not be able to access the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (blockConfirmUser) {
                  blockUserMutation.mutate(blockConfirmUser.user_id);
                }
              }}
              disabled={blockUserMutation.isPending}
            >
              {blockUserMutation.isPending ? 'Blocking...' : 'Block User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminUsers;
