import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter; // nodemailer ka sender object
  private logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {
    // Ek baar transporter banao — Gmail SMTP se connect karo
    this.transporter = nodemailer.createTransport({
      host: this.config.get('MAIL_HOST'),       // smtp.gmail.com
      port: this.config.get('MAIL_PORT'),        // 587
      secure: false,                             // TLS use karega
      auth: {
        user: this.config.get('MAIL_USER'),
        pass: this.config.get('MAIL_PASS'),
      },
    });
  }

  async sendOtp(toEmail: string, otp: string): Promise<void> {
    const expiresIn = this.config.get('OTP_EXPIRES_MINUTES') || 10;

    try {
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM'),
        to: toEmail,
        subject: 'Noor Circle — Password Reset OTP',
        // Simple HTML email
        html: `
          <div style="font-family: Arial; padding: 24px; max-width: 480px;">
            <h2>Password Reset OTP</h2>
            <p>Yeh code use karo apna password reset karne ke liye:</p>
            <div style="font-size: 36px; font-weight: bold; 
                        letter-spacing: 8px; padding: 16px;
                        background: #f4f4f4; border-radius: 8px;
                        text-align: center;">
              ${otp}
            </div>
            <p style="color: #666; margin-top: 16px;">
              Yeh code <strong>${expiresIn} minutes</strong> mein expire ho jayega.
            </p>
            <p style="color: #999; font-size: 12px;">
              Agar tumne yeh request nahi ki to ignore karo.
            </p>
          </div>
        `,
      });

      this.logger.log(`OTP email bheja gaya: ${toEmail}`);
    } catch (error) {
      this.logger.error(`Email bhejne mein error: ${toEmail}`, error);
      throw error;
    }
  }
}