import type { EmailTemplate } from './queues';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escape = (v: string | number) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const STAGE_COPY: Record<string, string> = {
  SCREENING: 'Your application is now being screened by the hiring team.',
  INTERVIEW: 'Great news — the team would like to interview you. Expect a scheduling email soon.',
  OFFER: 'Congratulations! The team is preparing an offer for you.',
  REJECTED: 'Thank you for your interest. The team has decided not to move forward at this time.',
  APPLIED: 'Your application has been received.',
};

function layout(title: string, body: string, appUrl: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f7fb;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb">
<h2 style="margin-top:0;color:#4f46e5">HireLens</h2><h3>${escape(title)}</h3>${body}
<p style="margin-top:24px"><a href="${escape(appUrl)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open HireLens</a></p>
</div></body></html>`;
}

export function renderEmail(template: EmailTemplate, vars: Record<string, string | number>): RenderedEmail {
  const appUrl = String(vars.appUrl ?? 'http://localhost:20200');
  const name = String(vars.name ?? 'there');
  switch (template) {
    case 'welcome': {
      const text = `Hi ${name},\n\nWelcome to HireLens! Your ${String(vars.role).toLowerCase()} account is ready.`;
      return {
        subject: 'Welcome to HireLens',
        text,
        html: layout('Welcome aboard', `<p>${escape(text)}</p>`, appUrl),
      };
    }
    case 'application_received': {
      const text = `Hi ${name},\n\nWe received your application for ${vars.jobTitle} at ${vars.company}. Your AI match score is ${vars.score}/100.`;
      return {
        subject: `Application received: ${vars.jobTitle}`,
        text,
        html: layout('Application received', `<p>${escape(text)}</p>`, appUrl),
      };
    }
    case 'new_applicant': {
      const text = `Hi ${name},\n\nA new candidate applied to ${vars.jobTitle} with a match score of ${vars.score}/100.`;
      return {
        subject: `New applicant for ${vars.jobTitle}`,
        text,
        html: layout('New applicant', `<p>${escape(text)}</p>`, appUrl),
      };
    }
    case 'stage_changed': {
      const copy = STAGE_COPY[String(vars.stage)] ?? `Your application moved to ${vars.stage}.`;
      const text = `Hi ${name},\n\nUpdate on your application for ${vars.jobTitle}: ${copy}`;
      return {
        subject: `Application update: ${vars.jobTitle}`,
        text,
        html: layout('Application update', `<p>${escape(text)}</p>`, appUrl),
      };
    }
  }
}
