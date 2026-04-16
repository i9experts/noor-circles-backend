/* eslint-disable prettier/prettier */
// uploads/multer.config.ts
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { configureCloudinary } from './cloudinary.config';
import { ConfigService } from '@nestjs/config';
import * as path from 'path'; // ✅ Correct import


export const createMulterOptions = (configService: ConfigService) => {
  configureCloudinary(configService);
  

  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const originalNameWithoutExt = path.parse(file.originalname).name; // e.g. "photo"
      return {
        folder: 'uploads',
        allowed_formats: ['jpg', 'jpeg', 'png'],
        public_id: originalNameWithoutExt, // ✅ Keep original name (no duplicate extension)
      };
    },
  });

  return {
    storage, // ✅ return just the options
  };
};
