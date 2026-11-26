import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge, Progress } from '@/components/ui/misc';
import type { ScoreBreakdown, Stage } from '@/lib/types';
import { cn, scoreTone, STAGE_LABEL } from '@/lib/utils';

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone = scoreTone(score);
  return (
    <span
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-2',
        tone === 'success' && 'bg-success/10 text-success ring-success/40',
        tone === 'warning' && 'bg-warning/15 text-foreground ring-warning/50',
        tone === 'destructive' && 'bg-destructive/10 text-destructive ring-destructive/40',
        className,
      )}
      aria-label={`Match score ${Math.round(score)} out of 100`}
    >
      {Math.round(score)}
    </span>
  );
}

const STAGE_VARIANT: Record<Stage, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  APPLIED: 'secondary',
  SCREENING: 'default',
  INTERVIEW: 'warning',
  OFFER: 'success',
  REJECTED: 'destructive',
};

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge variant={STAGE_VARIANT[stage]}>{STAGE_LABEL[stage]}</Badge>;
}

export function SkillChips({ skills, variant = 'secondary', max }: { skills: string[]; variant?: 'secondary' | 'success' | 'destructive' | 'default' | 'outline'; max?: number }) {
  const shown = max ? skills.slice(0, max) : skills;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
      {shown.map((s) => (
        <li key={s}>
          <Badge variant={variant}>{s}</Badge>
        </li>
      ))}
      {max && skills.length > max && (
        <li>
          <Badge variant="outline">+{skills.length - max}</Badge>
        </li>
      )}
    </ul>
  );
}

function Bar({ label, value, weight }: { label: string; value: number; weight?: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">
          {label}
          {weight !== undefined && <span className="text-muted-foreground"> · weight {Math.round(weight * 100)}%</span>}
        </span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <Progress value={value * 100} label={label} />
    </div>
  );
}

export function ScoreBreakdownView({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <div className="space-y-4" data-testid="score-breakdown">
      <div className="grid gap-3 sm:grid-cols-3">
        <Bar label="Semantic similarity" value={breakdown.semantic_similarity} weight={breakdown.weights.semantic} />
        <Bar label="Skill overlap" value={breakdown.skill_overlap} weight={breakdown.weights.skills} />
        <Bar label="Experience fit" value={breakdown.experience_fit} weight={breakdown.weights.experience} />
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1.5 flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Matched skills
          </p>
          {breakdown.matched_required.length + breakdown.matched_nice_to_have.length ? (
            <SkillChips skills={[...breakdown.matched_required, ...breakdown.matched_nice_to_have]} variant="success" />
          ) : (
            <p className="text-muted-foreground">None</p>
          )}
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1 font-medium">
            <XCircle className="h-4 w-4 text-destructive" aria-hidden /> Missing required
          </p>
          {breakdown.missing_required.length ? (
            <SkillChips skills={breakdown.missing_required} variant="destructive" />
          ) : (
            <p className="text-muted-foreground">None — all requirements met</p>
          )}
        </div>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {breakdown.explanation.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}
