import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow('MAIL_HOST'),
      port: Number(this.config.getOrThrow('MAIL_PORT')),
      secure: this.config.get('MAIL_SECURE') === 'true',
      // Force IPv4: Railway (and many container platforms) advertise a route
      // to smtp.gmail.com's AAAA (IPv6) record that isn't actually reachable,
      // causing ENETUNREACH. Pinning family to 4 avoids the bad IPv6 attempt.
      family: 4,
      auth: {
        user: this.config.getOrThrow('MAIL_USER'),
        pass: this.config.getOrThrow('MAIL_PASS'),
      },
    });
  }

  async sendOtp(
    toEmail: string,
    otp: string,
    type: 'signup' | 'reset',
  ): Promise<void> {
    const isSignup = type === 'signup';
    const subject = isSignup
      ? 'Noor Circle — Verify Your Email'
      : 'Noor Circle — Password Reset OTP';
    const heading = isSignup ? 'Email Verification' : 'Password Reset';
    const bodyText = isSignup
      ? 'Use the code below to verify your email and complete your registration.'
      : 'Use the code below to reset your password.';

    try {
      await this.transporter.sendMail({
        from: this.config.getOrThrow('MAIL_FROM'),
        to: toEmail,
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;
                      border:1px solid #e5e7eb;border-radius:12px;margin:auto">
            <h2 style="margin-top:0;color:#111827;font-size:22px">${heading}</h2>
            <p style="color:#4b5563;font-size:14px">${bodyText}</p>

            <div style="font-size:40px;font-weight:700;letter-spacing:14px;
                        padding:20px 24px;background:#f9fafb;border:1px solid #e5e7eb;
                        border-radius:10px;text-align:center;margin:24px 0;
                        color:#111827;font-family:monospace">
              ${otp}
            </div>

            <p style="color:#6b7280;font-size:13px">
              This code will expire in <strong>2 minutes</strong>.
            </p>
            <p style="color:#9ca3af;font-size:12px;margin-bottom:0">
              If you did not request this, you can safely ignore this email.
            </p>
          </div>`,
      });
      this.logger.log(`OTP [${type}] → ${toEmail}`);
    } catch (err) {
      this.logger.error(`Failed to send OTP to ${toEmail}`, err);
      throw new InternalServerErrorException(
        'Failed to send verification email. Please try again.',
      );
    }
  }
}
