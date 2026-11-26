import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { EnvConfig } from '../config/configuration';
import type { RenderedEmail } from './templates';

export abstract class Mailer {
  abstract send(to: string, email: RenderedEmail): Promise<void>;
}

@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<EnvConfig, true>) {
    super();
    const user = config.get('SMTP_USER', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: false,
      auth: user ? { user, pass: config.get('SMTP_PASS', { infer: true }) } : undefined,
    });
  }

  async send(to: string, email: RenderedEmail): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  }
}
