import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { SkillChips } from '@/components/score';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { Resume } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export const MAX_UPLOAD = 5 * 1024 * 1024;
const ACCEPT = '.pdf,.docx,.txt';

export function validateResumeFile(file: File): string | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (!['pdf', 'docx', 'txt'].includes(ext)) return 'Upload a PDF, DOCX or TXT file';
  if (file.size === 0) return 'The file is empty';
  if (file.size > MAX_UPLOAD) return 'File must be 5 MB or smaller';
  return null;
}

function StatusBadge({ status }: { status: Resume['status'] }) {
  if (status === 'PARSED') return <Badge variant="success">Parsed</Badge>;
  if (status === 'FAILED') return <Badge variant="destructive">Failed</Badge>;
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Processing
    </Badge>
  );
}

function ResumeCard({ resume }: { resume: Resume }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['resumes'] });
  const primary = useMutation({ mutationFn: () => api.patch(`/resumes/${resume.id}/primary`, {}), onSuccess: invalidate });
  const reprocess = useMutation({ mutationFn: () => api.post(`/resumes/${resume.id}/reprocess`), onSuccess: invalidate });
  const remove = useMutation({
    mutationFn: () => api.delete(`/resumes/${resume.id}`),
    onSuccess: () => {
      toast.success('Resume deleted');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const p = resume.parsed?.profile;
  return (
    <Card data-testid="resume-card">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 truncate">
            {resume.fileName}
            {resume.isPrimary && <Badge>Primary</Badge>}
          </CardTitle>
          <CardDescription>
            Uploaded {formatDate(resume.createdAt)} · {(resume.sizeBytes / 1024).toFixed(0)} KB
          </CardDescription>
        </div>
        <StatusBadge status={resume.status} />
      </CardHeader>
      <CardContent className="space-y-4">
        {resume.status === 'FAILED' && <p className="text-sm text-destructive">{resume.error ?? 'Parsing failed'}</p>}
        {p && (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{p.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Experience</dt>
                <dd className="font-medium">{p.years_of_experience} yrs</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Location</dt>
                <dd className="font-medium">{p.location ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Roles</dt>
                <dd className="font-medium">{p.experience.length}</dd>
              </div>
            </dl>
            <SkillChips skills={p.skills} max={18} />
            {p.experience.length > 0 && (
              <ul className="space-y-1 text-sm">
                {p.experience.slice(0, 3).map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{e.title}</span>
                    {e.company && <span className="text-muted-foreground"> · {e.company}</span>}
                    {e.start && (
                      <span className="text-muted-foreground">
                        {' '}
                        ({e.start} – {e.end})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {!resume.isPrimary && resume.status === 'PARSED' && (
            <Button size="sm" variant="outline" onClick={() => primary.mutate()} loading={primary.isPending}>
              <Star className="h-3.5 w-3.5" aria-hidden /> Make primary
            </Button>
          )}
          {resume.status === 'FAILED' && (
            <Button size="sm" variant="outline" onClick={() => reprocess.mutate()} loading={reprocess.isPending}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => remove.mutate()} loading={remove.isPending} aria-label={`Delete ${resume.fileName}`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ResumesPage() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const resumes = useQuery({
    queryKey: ['resumes'],
    queryFn: () => api.get<Resume[]>('/resumes'),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'PENDING' || r.status === 'PROCESSING') ? 1500 : false),
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post<Resume>('/resumes', fd);
    },
    onSuccess: () => {
      toast.success('Resume uploaded — AI parsing started');
      void qc.invalidateQueries({ queryKey: ['resumes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const handle = (file?: File) => {
    if (!file) return;
    const err = validateResumeFile(file);
    if (err) return void toast.error(err);
    upload.mutate(file);
  };

  return (
    <div>
      <PageHeader title="My resumes" description="Upload your resume and HireLens extracts your skills, experience and education." />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={`mb-6 flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${dragging ? 'border-primary bg-accent' : ''}`}
      >
        <FileUp className="h-8 w-8 text-primary" aria-hidden />
        <p className="font-medium">Drag & drop a resume, or browse</p>
        <p className="text-xs text-muted-foreground">PDF, DOCX or TXT · up to 5 MB</p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Upload resume"
          data-testid="resume-input"
          onChange={(e) => {
            handle(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button onClick={() => input.current?.click()} loading={upload.isPending}>
          Choose file
        </Button>
      </div>
      {resumes.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : resumes.isError ? (
        <ErrorState error={resumes.error} onRetry={() => void resumes.refetch()} />
      ) : resumes.data?.length ? (
        <div className="space-y-4">
          {resumes.data.map((r) => (
            <ResumeCard key={r.id} resume={r} />
          ))}
        </div>
      ) : (
        <EmptyState title="No resumes yet" description="Upload your first resume to start applying and get AI feedback." />
      )}
    </div>
  );
}
