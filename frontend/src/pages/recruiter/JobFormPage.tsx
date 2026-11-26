import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/form';
import { Badge, ErrorState, PageHeader, Skeleton, Switch } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { Job, JobAnalysis } from '@/lib/types';

const optionalInt = z.preprocess((v) => (v === '' || v === null || Number.isNaN(v) ? undefined : Number(v)), z.number().int().min(0).optional());

export const jobSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required').max(200),
    description: z.string().trim().min(20, 'Describe the role in at least 20 characters').max(20000),
    company: z.string().trim().max(100).optional(),
    location: z.string().trim().min(2, 'Location is required').max(100),
    remote: z.boolean(),
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']),
    status: z.enum(['DRAFT', 'OPEN', 'CLOSED']),
    blindScreening: z.boolean(),
    salaryMin: optionalInt,
    salaryMax: optionalInt,
  })
  .refine((v) => !v.salaryMin || !v.salaryMax || v.salaryMin <= v.salaryMax, { message: 'Minimum must not exceed maximum', path: ['salaryMax'] });

type JobForm = z.infer<typeof jobSchema>;

function SkillEditor({ label, skills, onChange }: { label: string; skills: string[]; onChange: (s: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !skills.some((s) => s.toLowerCase() === v.toLowerCase())) onChange([...skills, v]);
    setDraft('');
  };
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <ul className="flex min-h-8 flex-wrap gap-1.5" aria-label={`${label} list`}>
        {skills.map((s) => (
          <li key={s}>
            <Badge className="gap-1">
              {s}
              <button type="button" onClick={() => onChange(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder="Add a skill and press Enter"
          maxLength={50}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function JobFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [required, setRequired] = useState<string[]>([]);
  const [nice, setNice] = useState<string[]>([]);
  const [minYears, setMinYears] = useState<number | undefined>();
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const existing = useQuery({ queryKey: ['job', id], queryFn: () => api.get<Job>(`/jobs/${id}`), enabled: editing });
  const form = useForm<JobForm>({
    resolver: zodResolver(jobSchema),
    defaultValues: { title: '', description: '', company: '', location: '', remote: false, employmentType: 'FULL_TIME', status: 'OPEN', blindScreening: true },
  });

  useEffect(() => {
    const j = existing.data;
    if (!j) return;
    form.reset({
      title: j.title,
      description: j.description,
      company: j.company,
      location: j.location,
      remote: j.remote,
      employmentType: j.employmentType,
      status: j.status,
      blindScreening: j.blindScreening,
      salaryMin: j.salaryMin ?? undefined,
      salaryMax: j.salaryMax ?? undefined,
    });
    setRequired(j.requiredSkills);
    setNice(j.niceToHaveSkills);
    setMinYears(j.minYearsExperience);
  }, [existing.data, form]);

  const analyze = useMutation({
    mutationFn: () => api.post<JobAnalysis>('/jobs/analyze', { title: form.getValues('title'), description: form.getValues('description') }),
    onSuccess: (a) => {
      setAnalysis(a);
      setRequired(a.required_skills);
      setNice(a.nice_to_have_skills);
      setMinYears(a.min_years_experience);
      toast.success(`Extracted ${a.required_skills.length} required and ${a.nice_to_have_skills.length} nice-to-have skills`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: (values: JobForm) => {
      const body = {
        ...values,
        company: values.company || undefined,
        ...(required.length || nice.length ? { requiredSkills: required, niceToHaveSkills: nice } : {}),
        ...(minYears !== undefined ? { minYearsExperience: minYears } : {}),
      };
      return editing ? api.patch<Job>(`/jobs/${id}`, body) : api.post<Job>('/jobs', body);
    },
    onSuccess: (job) => {
      toast.success(editing ? 'Job updated' : 'Job published');
      void qc.invalidateQueries({ queryKey: ['my-jobs'] });
      void qc.invalidateQueries({ queryKey: ['job', job.id] });
      navigate(`/recruiter/jobs/${job.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (editing && existing.isLoading) return <Skeleton className="h-96" />;
  if (editing && existing.isError) return <ErrorState error={existing.error} />;
  const { errors } = form.formState;
  const canAnalyze = form.watch('title').trim().length >= 2 && form.watch('description').trim().length >= 20;

  return (
    <div>
      <PageHeader title={editing ? 'Edit job' : 'Post a job'} description="HireLens extracts required and nice-to-have skills automatically." />
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-6 lg:grid-cols-[1fr_360px]" noValidate>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="title">Job title</Label>
              <Input id="title" aria-invalid={!!errors.title} {...form.register('title')} />
              <FieldError message={errors.title?.message} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input id="company" placeholder="Defaults to your company" {...form.register('company')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Location</Label>
                <Input id="location" aria-invalid={!!errors.location} {...form.register('location')} />
                <FieldError message={errors.location?.message} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={14} aria-invalid={!!errors.description} {...form.register('description')} />
              <FieldError message={errors.description?.message} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="employmentType">Type</Label>
                <Select id="employmentType" {...form.register('employmentType')}>
                  <option value="FULL_TIME">Full-time</option>
                  <option value="PART_TIME">Part-time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERNSHIP">Internship</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salaryMin">Salary min (USD)</Label>
                <Input id="salaryMin" type="number" min={0} {...form.register('salaryMin', { valueAsNumber: true })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salaryMax">Salary max (USD)</Label>
                <Input id="salaryMax" type="number" min={0} aria-invalid={!!errors.salaryMax} {...form.register('salaryMax', { valueAsNumber: true })} />
                <FieldError message={errors.salaryMax?.message} />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
              <CardDescription>{analysis ? `Extracted by AI (${analysis.source}) — edit freely` : 'Run extraction or add manually'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button type="button" variant="secondary" className="w-full" onClick={() => analyze.mutate()} disabled={!canAnalyze} loading={analyze.isPending}>
                <Sparkles className="h-4 w-4" aria-hidden /> Extract skills with AI
              </Button>
              <SkillEditor label="Required skills" skills={required} onChange={setRequired} />
              <SkillEditor label="Nice to have" skills={nice} onChange={setNice} />
              <div className="space-y-1.5">
                <Label htmlFor="minYears">Minimum years of experience</Label>
                <Input id="minYears" type="number" min={0} max={40} value={minYears ?? ''} onChange={(e) => setMinYears(e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="remote">Remote friendly</Label>
                <Controller control={form.control} name="remote" render={({ field }) => <Switch id="remote" checked={field.value} onCheckedChange={field.onChange} />} />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label htmlFor="blind">Blind screening</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Hide names, contact details, gender and age signals until the interview stage.</p>
                </div>
                <Controller control={form.control} name="blindScreening" render={({ field }) => <Switch id="blind" checked={field.value} onCheckedChange={field.onChange} />} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select id="status" {...form.register('status')}>
                  <option value="OPEN">Open — accepting applications</option>
                  <option value="DRAFT">Draft</option>
                  <option value="CLOSED">Closed</option>
                </Select>
              </div>
              <Button type="submit" className="w-full" loading={save.isPending}>
                {editing ? 'Save changes' : 'Publish job'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
