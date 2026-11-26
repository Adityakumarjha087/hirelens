import { ApplicationStage } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { ResumeProfile } from '../ai/ai.types';

const BLIND_STAGES: ApplicationStage[] = [ApplicationStage.APPLIED, ApplicationStage.SCREENING];

export function isBlind(job: { blindScreening: boolean }, stage: ApplicationStage): boolean {
  return job.blindScreening && BLIND_STAGES.includes(stage);
}

/** Stable, non-reversible alias so recruiters can still refer to "Candidate 4F2A". */
export function candidateAlias(applicationId: string): string {
  return `Candidate ${createHash('sha256').update(applicationId).digest('hex').slice(0, 4).toUpperCase()}`;
}

export interface ParsedResumeJson {
  profile?: ResumeProfile;
  redactedProfile?: ResumeProfile;
}

export function profileFor(parsed: unknown, blind: boolean): ResumeProfile | null {
  const p = (parsed ?? {}) as ParsedResumeJson;
  if (blind)
    return p.redactedProfile ?? (p.profile ? { ...p.profile, name: '', email: null, phone: null } : null);
  return p.profile ?? null;
}
