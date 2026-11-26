import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { Badge, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paginated, Role, User } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const users = useQuery({
    queryKey: ['admin-users', q, role, page],
    queryFn: () => api.get<Paginated<User>>(`/admin/users${qs({ q, role, page, pageSize: 20 })}`),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<User, 'role' | 'isActive'>> }) => api.patch<User>(`/admin/users/${id}`, body),
    onSuccess: () => {
      toast.success('User updated');
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize)) : 1;
  return (
    <div>
      <PageHeader title="Users" description="Manage roles and access across the platform." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Search users" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select aria-label="Filter by role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="sm:w-48">
          <option value="">All roles</option>
          <option value="CANDIDATE">Candidates</option>
          <option value="RECRUITER">Recruiters</option>
          <option value="ADMIN">Admins</option>
        </Select>
      </div>
      {users.isLoading ? (
        <Skeleton className="h-64" />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Email</th>
                  <th className="p-3 font-medium">Role</th>
                  <th className="p-3 font-medium">Joined</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.items.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{u.fullName}</td>
                    <td className="p-3">{u.email}</td>
                    <td className="p-3">
                      <Select
                        aria-label={`Role for ${u.email}`}
                        value={u.role}
                        disabled={u.id === me?.id}
                        className="h-8 w-36"
                        onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })}
                      >
                        <option value="CANDIDATE">Candidate</option>
                        <option value="RECRUITER">Recruiter</option>
                        <option value="ADMIN">Admin</option>
                      </Select>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                    <td className="p-3">
                      {u.id === me?.id ? (
                        <Badge>You</Badge>
                      ) : (
                        <Button size="sm" variant={u.isActive ? 'outline' : 'secondary'} onClick={() => update.mutate({ id: u.id, body: { isActive: !u.isActive } })}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Pagination">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </nav>
    </div>
  );
}
