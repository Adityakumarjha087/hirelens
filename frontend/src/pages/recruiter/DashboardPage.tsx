import { useQuery } from '@tanstack/react-query';
import { Briefcase, Clock, Gauge, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { RecruiterAnalytics } from '@/lib/types';
import { STAGE_LABEL } from '@/lib/utils';

const STAGE_COLORS = ['#94a3b8', '#6366f1', '#f59e0b', '#10b981', '#ef4444'];

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums" data-testid={`stat-${label}`}>
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="h-64">{children}</CardContent>
    </Card>
  );
}

const axis = { fontSize: 11, fill: 'currentColor' };

export function DashboardPage() {
  const q = useQuery({ queryKey: ['analytics'], queryFn: () => api.get<RecruiterAnalytics>('/analytics/recruiter?days=30') });
  if (q.isLoading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Hiring dashboard"
        description="Last 30 days across your jobs"
        actions={
          <Button asChild>
            <Link to="/recruiter/jobs/new">Post a job</Link>
          </Button>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key metrics">
        <Stat icon={Briefcase} label="Open jobs" value={String(d.totals.openJobs)} hint={`${d.totals.jobs} total`} />
        <Stat icon={Users} label="Applicants" value={String(d.totals.applicants)} />
        <Stat icon={Gauge} label="Avg match score" value={d.totals.avgMatchScore?.toFixed(1) ?? '—'} />
        <Stat icon={Clock} label="Avg time to hire" value={d.totals.avgTimeToHireDays !== null ? `${d.totals.avgTimeToHireDays}d` : '—'} hint={`${d.totals.offers} offers`} />
      </section>
      {d.totals.applicants === 0 ? (
        <EmptyState title="No applicants yet" description="Once candidates apply, charts appear here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Applicants per job" description="Bar = applicants">
            <ResponsiveContainer>
              <BarChart data={d.applicantsPerJob} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="title" tick={axis} interval={0} tickFormatter={(t: string) => (t.length > 14 ? `${t.slice(0, 13)}…` : t)} />
                <YAxis allowDecimals={false} tick={axis} />
                <Tooltip />
                <Bar dataKey="applicants" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Pipeline funnel">
            <ResponsiveContainer>
              <BarChart data={d.stageFunnel.map((s) => ({ ...s, label: STAGE_LABEL[s.stage] }))} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" allowDecimals={false} tick={axis} />
                <YAxis type="category" dataKey="label" tick={axis} width={80} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {d.stageFunnel.map((_, i) => (
                    <Cell key={i} fill={STAGE_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Applications over time">
            <ResponsiveContainer>
              <LineChart data={d.applicationsOverTime} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={axis} tickFormatter={(t: string) => t.slice(5)} />
                <YAxis allowDecimals={false} tick={axis} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Match score distribution">
            <ResponsiveContainer>
              <BarChart data={d.scoreDistribution} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="bucket" tick={axis} />
                <YAxis allowDecimals={false} tick={axis} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4" aria-hidden /> Time to hire by job
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.timeToHireByJob.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offers yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Job</th>
                    <th className="pb-2 font-medium">Offers</th>
                    <th className="pb-2 font-medium">Avg days</th>
                  </tr>
                </thead>
                <tbody>
                  {d.timeToHireByJob.map((t) => (
                    <tr key={t.jobId} className="border-t">
                      <td className="py-2">{t.title}</td>
                      <td>{t.offers}</td>
                      <td className="tabular-nums">{t.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top applicant skills</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {d.topSkills.map((s) => (
                <li key={s.skill} className="flex justify-between">
                  <span>{s.skill}</span>
                  <span className="tabular-nums text-muted-foreground">{s.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
