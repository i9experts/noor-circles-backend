import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const cloud_name = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const api_key    = this.configService.get<string>('CLOUDINARY_API_KEY');
    const api_secret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    this.isConfigured = !!(cloud_name && api_key && api_secret);
    if (!this.isConfigured) {
      this.logger.warn('Cloudinary credentials are not set — image uploads will be rejected with a clear error instead of crashing.');
    }
    cloudinary.config({ cloud_name, api_key, api_secret });
  }

  async uploadFile(file: Express.Multer.File): Promise<{ url: string }> {
    if (!this.isConfigured) {
      throw new InternalServerErrorException(
        'Image uploads are not available yet — this feature has not been configured. Please contact your administrator.',
      );
    }
    if (!file?.buffer) {
      throw new Error('No file buffer received.');
    }
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'uploads', allowed_formats: ['jpg', 'jpeg', 'png'] },
        (error, result) => {
          if (error || !result?.secure_url) {
            this.logger.error('Cloudinary upload failed', error?.message ?? 'no URL returned');
            return reject(new Error('Upload failed: Cloudinary did not return a URL'));
          }
          resolve({ url: result.secure_url });
        },
      );
      stream.end(file.buffer);
    });
  }
}