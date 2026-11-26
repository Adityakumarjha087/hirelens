import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ScoreBadge } from '@/components/score';
import { Select } from '@/components/ui/form';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { Applicant, Job, Stage } from '@/lib/types';
import { cn, STAGE_LABEL, STAGES } from '@/lib/utils';

export function groupByStage(apps: Applicant[]): Record<Stage, Applicant[]> {
  const out = Object.fromEntries(STAGES.map((s) => [s, [] as Applicant[]])) as Record<Stage, Applicant[]>;
  for (const a of apps) out[a.stage].push(a);
  for (const s of STAGES) out[s].sort((a, b) => a.position - b.position || b.matchScore - a.matchScore);
  return out;
}

function KanbanCard({ app, onMove }: { app: Applicant; onMove: (stage: Stage) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id, data: { stage: app.stage } });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn('rounded-md border bg-card p-3 shadow-sm', isDragging && 'z-10 opacity-80 shadow-lg')}
      data-testid="kanban-card"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-1 cursor-grab text-muted-foreground active:cursor-grabbing"
          aria-label={`Drag ${app.candidate.name}`}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Link to={`/recruiter/applications/${app.id}`} className="block truncate text-sm font-medium hover:underline">
            {app.candidate.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{app.resume.headline ?? `${app.resume.yearsExperience ?? 0} yrs`}</p>
        </div>
        <ScoreBadge score={app.matchScore} className="h-8 w-8 text-xs" />
      </div>
      <Select
        aria-label={`Move ${app.candidate.name} to stage`}
        className="mt-2 h-8 text-xs"
        value={app.stage}
        onChange={(e) => onMove(e.target.value as Stage)}
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </Select>
    </li>
  );
}

function Column({ stage, apps, onMove }: { stage: Stage; apps: Applicant[]; onMove: (id: string, s: Stage) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STAGE_LABEL[stage]} column`}
      data-testid={`column-${stage}`}
      className={cn('flex min-h-64 w-72 shrink-0 flex-col rounded-lg border bg-muted/50 p-3 md:w-auto', isOver && 'border-primary bg-accent')}
    >
      <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
        {STAGE_LABEL[stage]}
        <span className="rounded-full bg-card px-2 text-xs tabular-nums">{apps.length}</span>
      </h2>
      <ul className="flex flex-1 flex-col gap-2">
        {apps.map((a) => (
          <KanbanCard key={a.id} app={a} onMove={(s) => onMove(a.id, s)} />
        ))}
      </ul>
    </section>
  );
}

export function PipelinePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const key = ['applicants', id, 'pipeline'];
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.get<Job>(`/jobs/${id}`) });
  const apps = useQuery({ queryKey: key, queryFn: () => api.get<Applicant[]>(`/jobs/${id}/applications`) });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  const move = useMutation({
    mutationFn: ({ appId, stage }: { appId: string; stage: Stage }) => api.patch<Applicant>(`/applications/${appId}/stage`, { stage }),
    onMutate: async ({ appId, stage }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Applicant[]>(key);
      qc.setQueryData<Applicant[]>(key, (old) => old?.map((a) => (a.id === appId ? { ...a, stage } : a)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (updated) => {
      qc.setQueryData<Applicant[]>(key, (old) => old?.map((a) => (a.id === updated.id ? updated : a)));
      toast.success(`${updated.candidate.name} moved to ${STAGE_LABEL[updated.stage]}`);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['applicants', id] }),
  });

  const onMove = (appId: string, stage: Stage) => {
    const current = apps.data?.find((a) => a.id === appId);
    if (current && current.stage !== stage) move.mutate({ appId, stage });
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over) onMove(String(e.active.id), e.over.id as Stage);
  };

  if (apps.isLoading) return <Skeleton className="h-96" />;
  if (apps.isError) return <ErrorState error={apps.error} onRetry={() => void apps.refetch()} />;
  const grouped = groupByStage(apps.data ?? []);
  return (
    <div>
      <PageHeader title={`${job.data?.title ?? 'Job'} — pipeline`} description="Drag cards between columns (or use the stage menu). Candidates are emailed on every move." />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 md:grid md:grid-cols-5 md:overflow-visible">
          {STAGES.map((s) => (
            <Column key={s} stage={s} apps={grouped[s]} onMove={onMove} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
