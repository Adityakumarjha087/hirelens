import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ScoreBreakdown } from '@/lib/types';
import { ScoreBadge, ScoreBreakdownView, SkillChips, StageBadge } from './score';

const breakdown: ScoreBreakdown = {
  semantic_similarity: 0.8,
  skill_overlap: 0.5,
  experience_fit: 1,
  weights: { semantic: 0.45, skills: 0.4, experience: 0.15 },
  matched_required: ['Python'],
  missing_required: ['Kafka'],
  matched_nice_to_have: ['Go'],
  missing_nice_to_have: [],
  candidate_years: 6,
  required_years: 5,
  explanation: ['Matches 1/2 required skills.', '<img src=x onerror=alert(1)>'],
};

describe('score components', () => {
  it('renders an accessible score badge with rounding', () => {
    render(<ScoreBadge score={84.6} />);
    expect(screen.getByLabelText('Match score 85 out of 100')).toHaveTextContent('85');
  });

  it('renders the explainable breakdown and escapes untrusted text', () => {
    const { container } = render(<ScoreBreakdownView breakdown={breakdown} />);
    expect(screen.getByRole('progressbar', { name: 'Semantic similarity' })).toHaveAttribute('aria-valuenow', '80');
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('Go')).toBeInTheDocument();
    expect(screen.getByText('Kafka')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/weight 45%/)).toBeInTheDocument();
  });

  it('truncates skill chips and labels stages', () => {
    render(
      <>
        <SkillChips skills={['A', 'B', 'C', 'D']} max={2} />
        <StageBadge stage="INTERVIEW" />
      </>,
    );
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('C')).not.toBeInTheDocument();
    expect(screen.getByText('Interview')).toBeInTheDocument();
  });

  it('shows "none" states', () => {
    render(<ScoreBreakdownView breakdown={{ ...breakdown, matched_required: [], matched_nice_to_have: [], missing_required: [] }} />);
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText(/all requirements met/)).toBeInTheDocument();
  });
});
