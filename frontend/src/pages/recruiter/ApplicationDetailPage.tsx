import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, EyeOff, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ScoreBadge, ScoreBreakdownView, SkillChips, StageBadge } from '@/components/score';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Select, Textarea } from '@/components/ui/form';
import { Badge, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import type { ApplicantDetail, InterviewQuestion, Stage } from '@/lib/types';
import { formatDate, STAGE_LABEL, STAGES } from '@/lib/utils';

export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['application', id], queryFn: () => api.get<ApplicantDetail>(`/applications/${id}`) });
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(q.data?.recruiterNotes ?? ''), [q.data?.recruiterNotes]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['application', id] });

  const stage = useMutation({
    mutationFn: (s: Stage) => api.patch(`/applications/${id}/stage`, { stage: s }),
    onSuccess: () => {
      toast.success('Stage updated');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const questions = useMutation({
    mutationFn: (regenerate: boolean) => api.post<InterviewQuestion[]>(`/applications/${id}/interview-questions`, { regenerate, count: 8 }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const saveNotes = useMutation({
    mutationFn: () => api.patch(`/applications/${id}/notes`, { notes }),
    onSuccess: () => toast.success('Notes saved'),
    onError: (e: Error) => toast.error(e.message),
  });
  const download = async () => {
    try {
      const blob = await api.get<Blob>(`/resumes/${q.data!.resume.id}/file`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'resume';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data;
  const p = a.resume.profile;
  return (
    <div>
      <PageHeader
        title={a.candidate.name}
        description={`${a.job.title} · applied ${formatDate(a.createdAt)}`}
        actions={
          <>
            {!a.blind && (
              <Button variant="outline" onClick={() => void download()}>
                <Download className="h-4 w-4" aria-hidden /> Resume
              </Button>
            )}
            <Select aria-label="Pipeline stage" value={a.stage} onChange={(e) => stage.mutate(e.target.value as Stage)} className="w-40">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </Select>
          </>
        }
      />
      {a.blind && (
        <p className="mb-4 flex items-center gap-2 rounded-md bg-accent p-3 text-sm text-accent-foreground" role="note">
          <EyeOff className="h-4 w-4" aria-hidden /> Blind screening: identity, contact, gender and age signals are hidden until the interview stage.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Tabs defaultValue="match">
          <TabsList>
            <TabsTrigger value="match">Match</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="questions">Interview questions</TabsTrigger>
          </TabsList>
          <TabsContent value="match">
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <ScoreBadge score={a.matchScore} />
                  <div>
                    <p className="font-semibold">Overall match</p>
                    <StageBadge stage={a.stage} />
                  </div>
                </div>
                {a.scoreBreakdown ? <ScoreBreakdownView breakdown={a.scoreBreakdown} /> : <p className="text-sm text-muted-foreground">No breakdown available.</p>}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="profile">
            <Card>
              <CardContent className="space-y-5 p-5">
                {p?.summary && <p className="text-sm">{p.summary}</p>}
                <SkillChips skills={a.resume.skills} />
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Experience</h3>
                  <ul className="space-y-3">
                    {p?.experience.map((e, i) => (
                      <li key={i} className="text-sm">
                        <p className="font-medium">
                          {e.title} {e.company && <span className="text-muted-foreground">· {e.company}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {e.start} – {e.end}
                        </p>
                        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                          {e.highlights.map((h, j) => (
                            <li key={j}>{h}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
                {p && p.education.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Education</h3>
                    <ul className="text-sm">
                      {p.education.map((e, i) => (
                        <li key={i}>
                          {e.degree} {e.field} — {e.institution} {e.year && `(${e.year})`}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {a.coverLetter && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Cover letter</h3>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.coverLetter}</p>
                  </section>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="questions">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Tailored interview questions</CardTitle>
                {a.interviewQuestions?.length ? (
                  <Button size="sm" variant="outline" onClick={() => questions.mutate(true)} loading={questions.isPending}>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Regenerate
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {a.interviewQuestions?.length ? (
                  <ol className="space-y-3" data-testid="interview-questions">
                    {a.interviewQuestions.map((iq, i) => (
                      <li key={i} className="rounded-md border p-3 text-sm">
                        <div className="mb-1 flex gap-2">
                          <Badge variant="secondary">{iq.category}</Badge>
                          <Badge variant="outline">{iq.difficulty}</Badge>
                        </div>
                        <p className="font-medium">{iq.question}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{iq.rationale}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Button onClick={() => questions.mutate(false)} loading={questions.isPending}>
                    <Sparkles className="h-4 w-4" aria-hidden /> Generate questions
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="notes" className="sr-only">
                Recruiter notes
              </Label>
              <Textarea id="notes" value={notes} maxLength={10000} onChange={(e) => setNotes(e.target.value)} />
              <Button size="sm" onClick={() => saveNotes.mutate()} loading={saveNotes.isPending}>
                Save notes
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {a.events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span>{e.fromStage ? `${STAGE_LABEL[e.fromStage]} → ${STAGE_LABEL[e.toStage]}` : 'Applied'}</span>
                    <span className="text-muted-foreground">{formatDate(e.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
