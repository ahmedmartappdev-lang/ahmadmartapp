import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

const AdminAuditLog: React.FC = () => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [days, setDays] = useState<string>('30');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['admin-audit-log', days],
    queryFn: async () => {
      const since = new Date(Date.now() - Number(days) * 86400 * 1000).toISOString();
      const { data, error } = await (supabase.from('admin_audit_log') as any)
        .select('id, admin_user_id, action, entity_type, entity_id, changes, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        console.warn('audit log fetch failed', error);
        return [];
      }
      return data || [];
    },
  });

  const { data: admins = [] } = useQuery({
    queryKey: ['audit-log-admins'],
    queryFn: async () => {
      const { data } = await supabase.from('admins').select('user_id, full_name, email');
      return data || [];
    },
  });

  const adminByUserId = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of admins as any[]) if (a.user_id) m.set(a.user_id, a);
    return m;
  }, [admins]);

  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs as any[]) set.add(l.action);
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    let arr = logs as any[];
    if (actionFilter !== 'all') arr = arr.filter(l => l.action === actionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(l =>
        l.action.toLowerCase().includes(q) ||
        l.entity_type.toLowerCase().includes(q) ||
        (l.entity_id || '').toLowerCase().includes(q) ||
        JSON.stringify(l.changes || {}).toLowerCase().includes(q)
      );
    }
    return arr;
  }, [logs, actionFilter, search]);

  return (
    <DashboardLayout title="Audit Log" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search action / entity / changes" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {uniqueActions.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground ml-auto">{filtered.length} entries</p>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No audit entries.</p>
              <p className="text-xs mt-1">If the migration hasn't deployed yet, this stays empty.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Changes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l: any) => {
                    const admin = adminByUserId.get(l.admin_user_id);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(l.created_at), 'dd MMM, hh:mm a')}
                        </TableCell>
                        <TableCell className="text-sm">{admin?.full_name || admin?.email || l.admin_user_id?.slice(0, 8)}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{l.action}</Badge></TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{l.entity_type}</div>
                          {l.entity_id && <div className="text-muted-foreground">{l.entity_id.slice(0, 8)}</div>}
                        </TableCell>
                        <TableCell className="text-xs max-w-md">
                          <pre className="bg-muted/50 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all">
                            {l.changes ? JSON.stringify(l.changes) : '—'}
                          </pre>
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

export default AdminAuditLog;
