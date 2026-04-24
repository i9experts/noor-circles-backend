import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
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
      auth: {
        user: this.config.getOrThrow('MAIL_USER'),
        pass: this.config.getOrThrow('MAIL_PASS'),
      },
    });
  }

  async sendOtp(toEmail: string, otp: string, type: 'signup' | 'reset'): Promise<void> {
    const isSignup = type === 'signup';

    const subject = isSignup
      ? 'Noor Circle — Verify Your Email'
      : 'Noor Circle — Password Reset OTP';

    const heading = isSignup ? 'Email Verification' : 'Password Reset';

    const description = isSignup
      ? 'Use the code below to verify your email and complete registration:'
      : 'Use the code below to reset your password:';

    try {
      await this.transporter.sendMail({
        from: this.config.getOrThrow('MAIL_FROM'),
        to: toEmail,
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;
                      border:1px solid #eee;border-radius:8px;margin:auto">
            <h2 style="margin-top:0;color:#1a1a1a">${heading}</h2>
            <p style="color:#444">${description}</p>
            <div style="font-size:38px;font-weight:bold;letter-spacing:12px;
                        padding:20px;background:#f5f5f5;border-radius:8px;
                        text-align:center;margin:24px 0;color:#1a1a1a">
              ${otp}
            </div>
            <p style="color:#555">
              This code expires in <strong>2 minutes</strong>.
            </p>
            <p style="color:#999;font-size:12px;margin-bottom:0">
              If you did not request this, please ignore this email.
            </p>
          </div>
        `,
      });

      this.logger.log(`OTP [${type}] sent to: ${toEmail}`);
    } catch (err) {
      this.logger.error(`Failed to send OTP to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send email. Please try again.');
    }
  }
}