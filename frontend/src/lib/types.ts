export type Role = 'CANDIDATE' | 'RECRUITER' | 'ADMIN';
export type Stage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  company: string | null;
  createdAt: string;
  isActive?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExperienceItem {
  title: string;
  company: string;
  start: string | null;
  end: string | null;
  duration_months: number;
  highlights: string[];
}

export interface ResumeProfile {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string;
  skills: string[];
  experience: ExperienceItem[];
  education: { institution: string; degree: string; field: string; year: string | null }[];
  projects: { name: string; description: string; technologies: string[] }[];
  years_of_experience: number;
}

export interface Resume {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'PENDING' | 'PROCESSING' | 'PARSED' | 'FAILED';
  error: string | null;
  parsed: { profile?: ResumeProfile; meta?: { llm_provider: string; source: string } } | null;
  skills: string[];
  yearsExperience: number | null;
  location: string | null;
  headline: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface Job {
  id: string;
  recruiterId: string;
  title: string;
  description: string;
  company: string;
  location: string;
  remote: boolean;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';
  salaryMin: number | null;
  salaryMax: number | null;
  minYearsExperience: number;
  seniority: string | null;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  blindScreening: boolean;
  createdAt: string;
  applicantCount?: number;
  avgMatchScore?: number | null;
  myApplicationId?: string | null;
}

export interface JobAnalysis {
  required_skills: string[];
  nice_to_have_skills: string[];
  min_years_experience: number;
  seniority: string;
  keywords: string[];
  source: string;
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

export interface Applicant {
  id: string;
  jobId: string;
  stage: Stage;
  position: number;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown | null;
  createdAt: string;
  updatedAt: string;
  blind: boolean;
  candidate: { id: string | null; name: string; email: string | null };
  resume: {
    id: string;
    skills: string[];
    yearsExperience: number | null;
    location: string | null;
    headline: string | null;
    profile: ResumeProfile | null;
  };
}

export interface InterviewQuestion {
  question: string;
  category: 'technical' | 'behavioral' | 'experience' | 'gap' | 'culture';
  difficulty: 'easy' | 'medium' | 'hard';
  rationale: string;
}

export interface ApplicantDetail extends Applicant {
  coverLetter: string | null;
  recruiterNotes: string | null;
  interviewQuestions: InterviewQuestion[] | null;
  resumeText: string | null;
  events: { id: string; fromStage: Stage | null; toStage: Stage; createdAt: string }[];
  job: { id: string; title: string; company: string; blindScreening: boolean };
}

export interface MyApplication {
  id: string;
  stage: Stage;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown | null;
  createdAt: string;
  updatedAt: string;
  resumeId: string;
  job: { id: string; title: string; company: string; location: string; remote: boolean; status: string };
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

export interface FeedbackRecord {
  id: string;
  resumeId: string;
  jobId: string | null;
  jobTitle: string | null;
  atsScore: number;
  result: ResumeFeedback;
  source: string;
  createdAt: string;
}

export interface RecruiterAnalytics {
  totals: {
    jobs: number;
    openJobs: number;
    applicants: number;
    avgMatchScore: number | null;
    offers: number;
    avgTimeToHireDays: number | null;
  };
  applicantsPerJob: { jobId: string; title: string; applicants: number; avgScore: number | null; status: string }[];
  stageFunnel: { stage: Stage; count: number }[];
  scoreDistribution: { bucket: string; count: number }[];
  applicationsOverTime: { date: string; count: number }[];
  timeToHireByJob: { jobId: string; title: string; days: number; offers: number }[];
  topSkills: { skill: string; count: number }[];
}
