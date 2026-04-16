/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';

@Injectable()
export class UploadService {
  async uploadFile(file: Express.Multer.File): Promise<{ url: string }> {
    // Now CloudinaryStorage uploads it, and returns secure_url inside file
    const uploadedUrl = file?.path || file?.['secure_url'] || '';
    if (!uploadedUrl) {
      console.error('Cloudinary did not return a URL:', file);
      throw new Error('Upload failed: URL not returned by Cloudinary');
    }
    return { url: uploadedUrl };
  }
}