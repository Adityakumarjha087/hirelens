import { useQuery } from '@tanstack/react-query';
import { EyeOff, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SkillChips } from '@/components/score';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { Job, Paginated } from '@/lib/types';

export function JobsListPage() {
  const q = useQuery({ queryKey: ['my-jobs'], queryFn: () => api.get<Paginated<Job>>('/jobs?mine=true&pageSize=100') });
  return (
    <div>
      <PageHeader
        title="Your jobs"
        description="Manage postings and review AI-ranked candidates."
        actions={
          <Button asChild>
            <Link to="/recruiter/jobs/new">
              <Plus className="h-4 w-4" aria-hidden /> New job
            </Link>
          </Button>
        }
      />
      {q.isLoading ? (
        <Skeleton className="h-48" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState title="No jobs yet" description="Post your first job — skills are extracted automatically." />
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((j) => (
            <li key={j.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/recruiter/jobs/${j.id}`} className="font-semibold hover:underline">
                        {j.title}
                      </Link>
                      <Badge variant={j.status === 'OPEN' ? 'success' : 'secondary'}>{j.status.toLowerCase()}</Badge>
                      {j.blindScreening && (
                        <Badge variant="outline" className="gap-1">
                          <EyeOff className="h-3 w-3" aria-hidden /> Blind screening
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {j.location} · {j.applicantCount ?? 0} applicants
                      {j.avgMatchScore != null && ` · avg score ${j.avgMatchScore.toFixed(0)}`}
                    </p>
                    <SkillChips skills={j.requiredSkills} max={6} />
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/recruiter/jobs/${j.id}`}>Candidates</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/recruiter/jobs/${j.id}/pipeline`}>Pipeline</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/recruiter/jobs/${j.id}/edit`}>Edit</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
