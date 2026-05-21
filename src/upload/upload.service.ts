import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  async uploadFile(file: any): Promise<{ url: string }> {
    const uploadedUrl = file?.path || file?.['secure_url'] || '';
    if (!uploadedUrl) {
      this.logger.error('Cloudinary did not return a URL', JSON.stringify(file));
      throw new Error('Upload failed: URL not returned by Cloudinary');
    }
    return { url: uploadedUrl };
  }
}