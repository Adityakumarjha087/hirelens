import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/configuration';
import type {
  AiHealth,
  AnalyzeJobResponse,
  FeedbackJob,
  FeedbackResponse,
  InterviewResponse,
  MatchRequest,
  MatchResult,
  ParseResumeResponse,
  ResumeProfile,
} from './ai.types';

/** Port for the Python AI service; swapped for an in-memory fake in tests. */
export abstract class AiClient {
  abstract parseResume(file: Buffer, fileName: string, mimeType: string): Promise<ParseResumeResponse>;
  abstract analyzeJob(title: string, description: string): Promise<AnalyzeJobResponse>;
  abstract indexResume(id: string, text: string, metadata?: Record<string, unknown>): Promise<void>;
  abstract indexJob(id: string, text: string, metadata?: Record<string, unknown>): Promise<void>;
  abstract deleteJob(id: string): Promise<void>;
  abstract deleteResume(id: string): Promise<void>;
  abstract match(req: MatchRequest): Promise<MatchResult[]>;
  abstract feedback(
    resumeText: string,
    profile: ResumeProfile | null,
    job: FeedbackJob | null,
  ): Promise<FeedbackResponse>;
  abstract interviewQuestions(
    profile: ResumeProfile,
    job: FeedbackJob,
    count?: number,
  ): Promise<InterviewResponse>;
  abstract health(): Promise<AiHealth>;
}

export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class HttpAiClient extends AiClient {
  private readonly logger = new Logger(HttpAiClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<EnvConfig, true>) {
    super();
    this.baseUrl = config.get('AI_SERVICE_URL', { infer: true }).replace(/\/$/, '');
    this.token = config.get('AI_SERVICE_TOKEN', { infer: true });
    this.timeoutMs = config.get('AI_TIMEOUT_MS', { infer: true });
  }

  /** JSON/multipart request with timeout and bounded retries on network errors and 5xx. */
  private async request<T>(method: string, path: string, body?: unknown, retries = 2): Promise<T> {
    const isForm = body instanceof FormData;
    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            'X-Service-Token': this.token,
            Accept: 'application/json',
            ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (res.ok) {
          this.logger.debug({ path, ms: Date.now() - started }, 'ai_call');
          return (await res.json()) as T;
        }
        const text = await res.text();
        let message = text;
        try {
          message = (JSON.parse(text) as { message?: string }).message ?? text;
        } catch {
          /* non-JSON error body */
        }
        if (res.status < 500 || attempt >= retries) throw new AiServiceError(message, res.status);
      } catch (err) {
        if (err instanceof AiServiceError && (err.status ?? 500) < 500) {
          if (err.status === 422 || err.status === 413) throw new UnprocessableEntityException(err.message);
          throw err;
        }
        if (attempt >= retries) {
          this.logger.error({ path, err: (err as Error).message }, 'ai_call_failed');
          throw new ServiceUnavailableException('AI service unavailable');
        }
      }
      await sleep(200 * 2 ** attempt);
    }
  }

  parseResume(file: Buffer, fileName: string, mimeType: string): Promise<ParseResumeResponse> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file)], { type: mimeType }), fileName);
    return this.request('POST', '/v1/resumes/parse', form, 1);
  }

  analyzeJob(title: string, description: string): Promise<AnalyzeJobResponse> {
    return this.request('POST', '/v1/jobs/analyze', { title, description });
  }

  async indexResume(id: string, text: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.request('POST', '/v1/resumes/index', { id, text, metadata });
  }

  async indexJob(id: string, text: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.request('POST', '/v1/jobs/index', { id, text, metadata });
  }

  async deleteJob(id: string): Promise<void> {
    await this.request('DELETE', `/v1/jobs/${encodeURIComponent(id)}`);
  }

  async deleteResume(id: string): Promise<void> {
    await this.request('DELETE', `/v1/resumes/${encodeURIComponent(id)}`);
  }

  async match(req: MatchRequest): Promise<MatchResult[]> {
    const res = await this.request<{ results: MatchResult[] }>('POST', '/v1/match', req);
    return res.results;
  }

  feedback(
    resumeText: string,
    profile: ResumeProfile | null,
    job: FeedbackJob | null,
  ): Promise<FeedbackResponse> {
    return this.request('POST', '/v1/feedback', { resume_text: resumeText, profile, job });
  }

  interviewQuestions(profile: ResumeProfile, job: FeedbackJob, count = 8): Promise<InterviewResponse> {
    return this.request('POST', '/v1/interview-questions', { profile, job, count });
  }

  health(): Promise<AiHealth> {
    return this.request('GET', '/health', undefined, 0);
  }
}
