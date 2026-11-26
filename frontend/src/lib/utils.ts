import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function scoreTone(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'destructive';
}

export const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED'] as const;
export const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
};
