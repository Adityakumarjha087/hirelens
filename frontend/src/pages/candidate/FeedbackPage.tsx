import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SkillChips } from '@/components/score';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, PageHeader, Progress, Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { FeedbackRecord, Job, Paginated, Resume } from '@/lib/types';
import { cn, scoreTone } from '@/lib/utils';

export function FeedbackResult({ record }: { record: FeedbackRecord }) {
  const f = record.result;
  const tone = scoreTone(f.ats_score);
  return (
    <div className="space-y-4" data-testid="feedback-result">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div
            className={cn(
              'grid h-24 w-24 shrink-0 place-items-center rounded-full text-3xl font-extrabold ring-4',
              tone === 'success' ? 'text-success ring-success/40' : tone === 'warning' ? 'ring-warning/50' : 'text-destructive ring-destructive/40',
            )}
            aria-label={`ATS score ${f.ats_score} out of 100`}
          >
            {f.ats_score}
          </div>
          <div>
            <p className="font-semibold">ATS-friendliness score{record.jobTitle && ` for ${record.jobTitle}`}</p>
            <p className="mt-1 text-sm text-muted-foreground">{f.summary}</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ATS checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {f.checks.map((c) => (
                <li key={c.id} className="flex gap-2 text-sm">
                  {c.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Passed" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Failed" />
                  )}
                  <span>
                    <span className="font-medium">{c.label}</span>
                    {!c.passed && <span className="block text-muted-foreground">{c.tip}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Keywords</CardTitle>
            <CardDescription>{record.jobTitle ? 'Compared with the target job' : 'Pick a target job for a keyword gap analysis'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Missing keywords</p>
              {f.missing_keywords.length ? <SkillChips skills={f.missing_keywords} variant="destructive" /> : <p className="text-sm text-muted-foreground">None 🎉</p>}
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Present</p>
              <SkillChips skills={f.present_keywords} variant="success" max={20} />
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Suggested bullet rewrites</CardTitle>
          <CardDescription>Lead with action verbs and quantify impact. Replace [placeholders] with your real numbers.</CardDescription>
        </CardHeader>
        <CardContent>
          {f.bullet_rewrites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your bullet points already look strong.</p>
          ) : (
            <ul className="space-y-3">
              {f.bullet_rewrites.map((b, i) => (
                <li key={i} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <p className="text-muted-foreground line-through decoration-destructive/50">{b.original}</p>
                  <ArrowRight className="hidden h-4 w-4 text-primary md:block" aria-hidden />
                  <p className="font-medium">{b.suggestion}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function FeedbackPage() {
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: () => api.get<Resume[]>('/resumes') });
  const jobs = useQuery({ queryKey: ['jobs', 'all-open'], queryFn: () => api.get<Paginated<Job>>('/jobs?pageSize=100') });
  const history = useQuery({ queryKey: ['feedback'], queryFn: () => api.get<FeedbackRecord[]>('/feedback') });
  const [resumeId, setResumeId] = useState('');
  const [jobId, setJobId] = useState('');
  const [result, setResult] = useState<FeedbackRecord | null>(null);
  const parsed = resumes.data?.filter((r) => r.status === 'PARSED') ?? [];
  const run = useMutation({
    mutationFn: () => api.post<FeedbackRecord>('/feedback', { resumeId: resumeId || parsed[0]?.id, jobId: jobId || undefined }),
    onSuccess: (r) => {
      setResult(r);
      void history.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const shown = result ?? history.data?.[0] ?? null;

  return (
    <div>
      <PageHeader title="AI resume feedback" description="ATS score, missing keywords for a target job and rewritten bullet points." />
      {resumes.isLoading ? (
        <Skeleton className="h-32" />
      ) : resumes.isError ? (
        <ErrorState error={resumes.error} />
      ) : parsed.length === 0 ? (
        <EmptyState title="No parsed resume yet" description="Upload a resume on the My resumes page first." />
      ) : (
        <Card className="mb-6">
          <CardContent className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="fb-resume">Resume</Label>
              <Select id="fb-resume" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                {parsed.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fileName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-job">Target job (optional)</Label>
              <Select id="fb-job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">General review</option>
                {jobs.data?.items.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} — {j.company}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={() => run.mutate()} loading={run.isPending}>
              <Sparkles className="h-4 w-4" aria-hidden /> Analyze
            </Button>
          </CardContent>
        </Card>
      )}
      {run.isPending && <Progress value={60} label="Analyzing resume" className="mb-4" />}
      {shown && <FeedbackResult record={shown} />}
    </div>
  );
}
