import { useQuery } from '@tanstack/react-query';
import { EyeOff, KanbanSquare, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ScoreBadge, ScoreBreakdownView, SkillChips, StageBadge } from '@/components/score';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { api, qs } from '@/lib/api';
import type { Applicant, Job } from '@/lib/types';
import { STAGE_LABEL, STAGES } from '@/lib/utils';

interface Filters {
  minScore: string;
  skills: string;
  location: string;
  minYears: string;
  maxYears: string;
  stage: string;
  sort: string;
}
const EMPTY: Filters = { minScore: '', skills: '', location: '', minYears: '', maxYears: '', stage: '', sort: 'score' };

export function CandidatesPage() {
  const { id = '' } = useParams();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [expanded, setExpanded] = useState<string | null>(null);
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.get<Job>(`/jobs/${id}`) });
  const apps = useQuery({
    queryKey: ['applicants', id, filters],
    queryFn: () => api.get<Applicant[]>(`/jobs/${id}/applications${qs({ ...filters })}`),
  });
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div>
      <PageHeader
        title={job.data?.title ?? 'Candidates'}
        description={job.data ? `${job.data.company} · ranked by AI match score` : undefined}
        actions={
          <>
            {job.data?.blindScreening && (
              <span className="flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
                <EyeOff className="h-3.5 w-3.5" aria-hidden /> Blind screening on
              </span>
            )}
            <Button asChild variant="outline">
              <Link to={`/recruiter/jobs/${id}/pipeline`}>
                <KanbanSquare className="h-4 w-4" aria-hidden /> Pipeline
              </Link>
            </Button>
          </>
        }
      />
      <Card className="mb-6">
        <CardContent className="p-5">
          <form
            className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters(draft);
            }}
            aria-label="Filter candidates"
          >
            <div className="space-y-1">
              <Label htmlFor="f-score">Min score</Label>
              <Input id="f-score" type="number" min={0} max={100} value={draft.minScore} onChange={set('minScore')} />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label htmlFor="f-skills">Skills (comma-separated)</Label>
              <Input id="f-skills" placeholder="Python, Kafka" value={draft.skills} onChange={set('skills')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="f-loc">Location</Label>
              <Input id="f-loc" value={draft.location} onChange={set('location')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="f-min">Min years</Label>
              <Input id="f-min" type="number" min={0} value={draft.minYears} onChange={set('minYears')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="f-stage">Stage</Label>
              <Select id="f-stage" value={draft.stage} onChange={set('stage')}>
                <option value="">All</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1">
                Apply
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(EMPTY);
                  setFilters(EMPTY);
                }}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {apps.isLoading ? (
        <Skeleton className="h-64" />
      ) : apps.isError ? (
        <ErrorState error={apps.error} onRetry={() => void apps.refetch()} />
      ) : !apps.data?.length ? (
        <EmptyState title="No candidates match" description="Adjust the filters or wait for more applications." />
      ) : (
        <ol className="space-y-3" aria-label="Ranked candidates">
          {apps.data.map((a, i) => (
            <li key={a.id}>
              <Card data-testid="candidate-row">
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <span className="w-6 text-sm font-semibold text-muted-foreground">#{i + 1}</span>
                    <ScoreBadge score={a.matchScore} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/recruiter/applications/${a.id}`} className="font-semibold hover:underline">
                          {a.candidate.name}
                        </Link>
                        <StageBadge stage={a.stage} />
                        {a.blind && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="Identity hidden" />}
                      </div>
                      <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {a.resume.headline && <span>{a.resume.headline}</span>}
                        <span>{a.resume.yearsExperience ?? 0} yrs</span>
                        {a.resume.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden />
                            {a.resume.location}
                          </span>
                        )}
                      </p>
                      <SkillChips skills={a.resume.skills} max={8} />
                    </div>
                    <Button variant="outline" size="sm" aria-expanded={expanded === a.id} onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                      {expanded === a.id ? 'Hide' : 'Why this score?'}
                    </Button>
                  </div>
                  {expanded === a.id && a.scoreBreakdown && <ScoreBreakdownView breakdown={a.scoreBreakdown} />}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
