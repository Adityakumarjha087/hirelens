import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, MapPin, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ScoreBadge, ScoreBreakdownView, SkillChips, StageBadge } from '@/components/score';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/form';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { api, qs } from '@/lib/api';
import type { Job, MyApplication, Paginated, Resume, ScoreBreakdown } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export function salary(job: Pick<Job, 'salaryMin' | 'salaryMax'>): string | null {
  if (!job.salaryMin && !job.salaryMax) return null;
  const f = (n: number) => `$${Math.round(n / 1000)}k`;
  if (job.salaryMin && job.salaryMax) return `${f(job.salaryMin)} – ${f(job.salaryMax)}`;
  return f((job.salaryMin ?? job.salaryMax)!);
}

export function JobsPage() {
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: '', location: '', remote: '' });
  const jobs = useQuery({
    queryKey: ['jobs', filters, page],
    queryFn: () => api.get<Paginated<Job>>(`/jobs${qs({ ...filters, page, pageSize: 10 })}`),
  });
  const pages = jobs.data ? Math.max(1, Math.ceil(jobs.data.total / jobs.data.pageSize)) : 1;
  return (
    <div>
      <PageHeader title="Find jobs" description="Apply with one click — every application gets an explainable AI match score." />
      <form
        className="mb-6 grid gap-3 sm:grid-cols-[1fr_200px_160px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setFilters({ q: q.trim(), location: location.trim(), remote });
        }}
        role="search"
      >
        <Input aria-label="Search jobs" placeholder="Title, company or keyword" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input aria-label="Location" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
        <Select aria-label="Remote" value={remote} onChange={(e) => setRemote(e.target.value)}>
          <option value="">Any workplace</option>
          <option value="true">Remote</option>
          <option value="false">On-site</option>
        </Select>
        <Button type="submit">
          <Search className="h-4 w-4" aria-hidden /> Search
        </Button>
      </form>
      {jobs.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : jobs.isError ? (
        <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
      ) : !jobs.data?.items.length ? (
        <EmptyState title="No jobs match your search" description="Try different keywords or clear the filters." />
      ) : (
        <>
          <ul className="space-y-3">
            {jobs.data.items.map((j) => (
              <li key={j.id}>
                <Link to={`/jobs/${j.id}`} className="block rounded-lg focus-visible:ring-2">
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1.5">
                        <h2 className="font-semibold">{j.title}</h2>
                        <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" aria-hidden /> {j.company}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden /> {j.location}
                          </span>
                          {j.remote && <Badge variant="secondary">Remote</Badge>}
                          {salary(j) && <span>{salary(j)}</span>}
                        </p>
                        <SkillChips skills={j.requiredSkills} max={6} />
                      </div>
                      <span className="text-xs text-muted-foreground">Posted {formatDate(j.createdAt)}</span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
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
        </>
      )}
    </div>
  );
}

export function JobDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [coverLetter, setCoverLetter] = useState('');
  const [resumeId, setResumeId] = useState('');
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.get<Job>(`/jobs/${id}`) });
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: () => api.get<Resume[]>('/resumes') });
  const parsed = resumes.data?.filter((r) => r.status === 'PARSED') ?? [];
  const apply = useMutation({
    mutationFn: () =>
      api.post<{ id: string; matchScore: number; scoreBreakdown: ScoreBreakdown }>(`/jobs/${id}/applications`, {
        resumeId: resumeId || undefined,
        coverLetter: coverLetter.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(`Application sent — match score ${Math.round(res.matchScore)}/100`);
      void qc.invalidateQueries({ queryKey: ['job', id] });
      void qc.invalidateQueries({ queryKey: ['my-applications'] });
      navigate('/candidate/applications');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (job.isLoading) return <Skeleton className="h-96" />;
  if (job.isError || !job.data) return <ErrorState error={job.error} onRetry={() => void job.refetch()} />;
  const j = job.data;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <article>
        <PageHeader title={j.title} description={`${j.company} · ${j.location}${j.remote ? ' · Remote' : ''}`} />
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Required skills</h2>
              <SkillChips skills={j.requiredSkills} variant="default" />
            </div>
            {j.niceToHaveSkills.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">Nice to have</h2>
                <SkillChips skills={j.niceToHaveSkills} />
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {j.minYearsExperience > 0 ? `${j.minYearsExperience}+ years experience` : 'No minimum experience'}
              {salary(j) && ` · ${salary(j)}`}
            </p>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{j.description}</div>
          </CardContent>
        </Card>
      </article>
      <aside>
        <Card className="lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>{j.myApplicationId ? 'You applied' : 'Apply now'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {j.myApplicationId ? (
              <Button asChild variant="outline" className="w-full">
                <Link to="/candidate/applications">View my application</Link>
              </Button>
            ) : parsed.length === 0 ? (
              <EmptyState
                title="Upload a resume first"
                description="Your parsed resume is used to compute your match score."
                action={
                  <Button asChild size="sm">
                    <Link to="/candidate">Upload resume</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="resume-select">Resume</Label>
                  <Select id="resume-select" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                    <option value="">Primary resume</option>
                    {parsed.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fileName}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cover">Cover letter (optional)</Label>
                  <Textarea id="cover" maxLength={5000} value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} />
                </div>
                <Button className="w-full" onClick={() => apply.mutate()} loading={apply.isPending}>
                  Submit application
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export function MyApplicationsPage() {
  const apps = useQuery({
    queryKey: ['my-applications'],
    queryFn: () => api.get<MyApplication[]>('/applications/mine'),
  });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="My applications" description="Track your pipeline status and see why you matched." />
      {apps.isLoading ? (
        <Skeleton className="h-48" />
      ) : apps.isError ? (
        <ErrorState error={apps.error} onRetry={() => void apps.refetch()} />
      ) : !apps.data?.length ? (
        <EmptyState
          title="No applications yet"
          action={
            <Button asChild size="sm">
              <Link to="/jobs">Browse jobs</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {apps.data.map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center gap-4">
                    <ScoreBadge score={a.matchScore} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/jobs/${a.job.id}`} className="font-semibold hover:underline">
                        {a.job.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {a.job.company} · applied {formatDate(a.createdAt)}
                      </p>
                    </div>
                    <StageBadge stage={a.stage} />
                  </div>
                  {a.scoreBreakdown && (
                    <>
                      <Button variant="link" className="h-auto p-0" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                        {open === a.id ? 'Hide' : 'Show'} score breakdown
                      </Button>
                      {open === a.id && <ScoreBreakdownView breakdown={a.scoreBreakdown} />}
                    </>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

