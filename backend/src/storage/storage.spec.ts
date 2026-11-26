import { S3Client } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { EnvConfig } from '../config/configuration';
import { SmtpMailer } from '../notifications/mailer.service';
import { MemoryStorage, S3Storage } from './storage.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({}) })),
}));

const values: Record<string, unknown> = {
  S3_BUCKET: 'b',
  S3_REGION: 'us-east-1',
  S3_ENDPOINT: 'http://minio:9000',
  S3_FORCE_PATH_STYLE: true,
  S3_ACCESS_KEY: 'k',
  S3_SECRET_KEY: 's',
  SMTP_HOST: 'mail',
  SMTP_PORT: 1025,
  SMTP_USER: 'u',
  SMTP_PASS: 'p',
  MAIL_FROM: 'from@x',
};
const config = { get: (k: string) => values[k] } as unknown as ConfigService<EnvConfig, true>;

describe('S3Storage', () => {
  let send: jest.SpyInstance;
  beforeEach(() => {
    send = jest.spyOn(S3Client.prototype, 'send');
  });
  afterEach(() => send.mockRestore());

  it('creates the bucket when missing and round-trips objects', async () => {
    send.mockRejectedValueOnce(new Error('NotFound')).mockResolvedValueOnce({});
    const s = new S3Storage(config);
    await s.onModuleInit();
    expect(send.mock.calls[1][0].constructor.name).toBe('CreateBucketCommand');

    send.mockResolvedValueOnce({});
    await s.put('k', Buffer.from('hi'), 'text/plain');
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([104, 105])) },
    });
    expect((await s.get('k')).toString()).toBe('hi');
    send.mockResolvedValueOnce({});
    await expect(s.get('k')).rejects.toThrow(/no body/);
    send.mockResolvedValueOnce({});
    await s.delete('k');
    send.mockResolvedValueOnce({});
    expect(await s.healthy()).toBe(true);
    send.mockRejectedValueOnce(new Error('down'));
    expect(await s.healthy()).toBe(false);
  });

  it('logs but does not crash when storage is unreachable at startup', async () => {
    send.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(new S3Storage(config).onModuleInit()).resolves.toBeUndefined();
  });
});

describe('MemoryStorage', () => {
  it('stores and deletes', async () => {
    const m = new MemoryStorage();
    await m.put('a', Buffer.from('x'), 'text/plain');
    expect((await m.get('a')).toString()).toBe('x');
    await m.delete('a');
    await expect(m.get('a')).rejects.toThrow();
    expect(await m.healthy()).toBe(true);
  });
});

describe('SmtpMailer', () => {
  it('sends through nodemailer with auth', async () => {
    const mailer = new SmtpMailer(config);
    await mailer.send('to@x', { subject: 's', text: 't', html: '<p>t</p>' });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'mail', port: 1025, auth: { user: 'u', pass: 'p' } }),
    );
    const transport = (createTransport as jest.Mock).mock.results[0].value as { sendMail: jest.Mock };
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'from@x', to: 'to@x', subject: 's' }),
    );
  });
});
