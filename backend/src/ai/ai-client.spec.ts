import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/configuration';
import { AiServiceError, HttpAiClient } from './ai-client';

const config = {
  get: (k: keyof EnvConfig) =>
    ({ AI_SERVICE_URL: 'http://ai.test/', AI_SERVICE_TOKEN: 'tok', AI_TIMEOUT_MS: 1000 })[k as string],
} as unknown as ConfigService<EnvConfig, true>;

const json = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('HttpAiClient', () => {
  let fetchMock: jest.SpyInstance;
  const client = new HttpAiClient(config);

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('sends the service token and JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { analysis: { required_skills: ['Go'] }, source: 'heuristic' }),
    );
    const res = await client.analyzeJob('Backend', 'Needs Go and more words here');
    expect(res.analysis.required_skills).toEqual(['Go']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ai.test/v1/jobs/analyze');
    expect((init.headers as Record<string, string>)['X-Service-Token']).toBe('tok');
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Backend',
      description: 'Needs Go and more words here',
    });
  });

  it('uploads multipart for resume parsing', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { profile: {} }));
    await client.parseResume(Buffer.from('hello'), 'cv.txt', 'text/plain');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('retries 5xx and network errors then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(json(503, { message: 'busy' }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(200, { results: [{ resume_id: 'r', score: 50 }] }));
    const res = await client.match({
      job: { id: 'j', required_skills: [], nice_to_have_skills: [], min_years_experience: 0 },
      candidates: [],
    });
    expect(res[0].score).toBe(50);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('maps exhausted retries to 503 and 422 to UnprocessableEntity', async () => {
    fetchMock.mockResolvedValue(json(500, 'not json'));
    await expect(client.indexJob('j', 'text')).rejects.toBeInstanceOf(ServiceUnavailableException);
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json(422, { message: 'scanned pdf' }));
    await expect(client.parseResume(Buffer.from('x'), 'a.pdf', 'application/pdf')).rejects.toThrow(
      UnprocessableEntityException,
    );
    fetchMock.mockResolvedValueOnce(json(401, { message: 'bad token' }));
    await expect(client.deleteJob('j')).rejects.toBeInstanceOf(AiServiceError);
  });

  it('covers the remaining endpoints', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, { ok: true, questions: [], feedback: {} })));
    await client.indexResume('r', 't');
    await client.deleteResume('r/1');
    await client.feedback('text', null, null);
    await client.interviewQuestions({} as never, {} as never);
    await client.health();
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls).toEqual([
      'http://ai.test/v1/resumes/index',
      'http://ai.test/v1/resumes/r%2F1',
      'http://ai.test/v1/feedback',
      'http://ai.test/v1/interview-questions',
      'http://ai.test/health',
    ]);
  });
});
