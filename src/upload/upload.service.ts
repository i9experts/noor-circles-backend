import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key   : this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadFile(file: Express.Multer.File): Promise<{ url: string }> {
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