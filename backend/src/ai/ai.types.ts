/**
 * TypeScript mirror of the AI service contract (see docs/ai-service.openapi.json).
 * Keep in sync with ml/app/schemas.py.
 */
export interface ExperienceItem {
  title: string;
  company: string;
  start: string | null;
  end: string | null;
  duration_months: number;
  highlights: string[];
}

export interface EducationItem {
  institution: string;
  degree: string;
  field: string;
  year: string | null;
}

export interface ProjectItem {
  name: string;
  description: string;
  technologies: string[];
}

export interface ResumeProfile {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string;
  skills: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  years_of_experience: number;
}

export interface ParseResumeResponse {
  profile: ResumeProfile;
  text: string;
  redacted_text: string;
  redacted_profile: ResumeProfile;
  entities: { text: string; label: string }[];
  meta: { llm_provider: string; source: 'llm' | 'heuristic'; ner_provider: string; char_count: number };
}

export interface JobAnalysis {
  required_skills: string[];
  nice_to_have_skills: string[];
  min_years_experience: number;
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'lead';
  keywords: string[];
}

export interface AnalyzeJobResponse {
  analysis: JobAnalysis;
  llm_provider: string;
  source: 'llm' | 'heuristic';
}

export interface ScoreBreakdown {
  semantic_similarity: number;
  skill_overlap: number;
  experience_fit: number;
  weights: Record<string, number>;
  matched_required: string[];
  missing_required: string[];
  matched_nice_to_have: string[];
  missing_nice_to_have: string[];
  candidate_years: number;
  required_years: number;
  explanation: string[];
}

export interface MatchResult {
  resume_id: string;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface MatchRequest {
  job: {
    id: string;
    text?: string;
    required_skills: string[];
    nice_to_have_skills: string[];
    min_years_experience: number;
  };
  candidates: { resume_id: string; text?: string; skills: string[]; years_of_experience: number }[];
}

export interface FeedbackJob {
  title: string;
  description: string;
  required_skills: string[];
  nice_to_have_skills: string[];
}

export interface ResumeFeedback {
  ats_score: number;
  checks: { id: string; label: string; passed: boolean; weight: number; tip: string }[];
  missing_keywords: string[];
  present_keywords: string[];
  bullet_rewrites: { original: string; suggestion: string; reason: string }[];
  strengths: string[];
  summary: string;
}

export interface FeedbackResponse {
  feedback: ResumeFeedback;
  llm_provider: string;
  source: 'llm' | 'heuristic';
}

export interface InterviewQuestion {
  question: string;
  category: 'technical' | 'behavioral' | 'experience' | 'gap' | 'culture';
  difficulty: 'easy' | 'medium' | 'hard';
  rationale: string;
}

export interface InterviewResponse {
  questions: InterviewQuestion[];
  llm_provider: string;
  source: 'llm' | 'heuristic';
}

export interface AiHealth {
  status: 'ok' | 'degraded';
  llm_provider: string;
  embedding_provider: string;
  ner_provider: string;
  vector_store: string;
  version: string;
}
