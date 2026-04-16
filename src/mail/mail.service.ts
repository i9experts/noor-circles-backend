import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST'),
      port: this.config.get<number>('MAIL_PORT'),
      secure: this.config.get<string>('MAIL_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASS'),
      },
    });
  }

  async sendOtp(to: string, otp: string): Promise<void> {
    const from = this.config.get<string>('MAIL_FROM');
    const expiresMinutes = this.config.get<number>('OTP_EXPIRES_MINUTES') || 10;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:8px;">
        <h2 style="color:#1a202c;margin-bottom:8px;">Password Reset OTP</h2>
        <p style="color:#4a5568;font-size:15px;">
          Use the code below to reset your <strong>Noor Circle</strong> password.
          It expires in <strong>${expiresMinutes} minutes</strong>.
        </p>
        <div style="margin:24px 0;text-align:center;">
          <span style="display:inline-block;letter-spacing:8px;font-size:32px;font-weight:700;color:#2d3748;background:#f7fafc;padding:16px 24px;border-radius:8px;border:1px solid #e2e8f0;">
            ${otp}
          </span>
        </div>
        <p style="color:#718096;font-size:13px;">
          If you did not request this, please ignore this email.
          Your account remains secure.
        </p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Your Noor Circle Password Reset OTP',
        html,
      });
      this.logger.log(`OTP email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${to}`, err);
      throw err;
    }
  }
}