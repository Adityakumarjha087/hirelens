export const EMAIL_QUEUE = 'email';
export const RESUME_QUEUE = 'resume-processing';

export type EmailTemplate = 'welcome' | 'application_received' | 'new_applicant' | 'stage_changed';

export interface EmailJobData {
  emailLogId: string;
  to: string;
  template: EmailTemplate;
  vars: Record<string, string | number>;
}

export interface ResumeJobData {
  resumeId: string;
}
