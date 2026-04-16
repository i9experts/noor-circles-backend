/* eslint-disable prettier/prettier */
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

export const configureCloudinary = (configService: ConfigService) => {
  // ✅ Console logs for debugging
  console.log('🌩️ Cloudinary Config Check:');
  console.log('Cloud Name:', configService.get<string>('CLOUDINARY_CLOUD_NAME'));
  console.log('API Key:', configService.get<string>('CLOUDINARY_API_KEY'));
  console.log('API Secret:', configService.get<string>('CLOUDINARY_API_SECRET'));

  cloudinary.config({
    cloud_name: configService.get<string>('CLOUDINARY_CLOUD_NAME'),
    api_key: configService.get<string>('CLOUDINARY_API_KEY'),
    api_secret: configService.get<string>('CLOUDINARY_API_SECRET'),
  });

  return cloudinary;
};
