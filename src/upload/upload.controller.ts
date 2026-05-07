import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { createMulterOptions } from './multer.config';
import { ConfigService } from '@nestjs/config';

// Create a factory function that returns the interceptor
const createFileInterceptor = (configService: ConfigService) => {
  return FileInterceptor('file', createMulterOptions(configService));
};

@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly configService: ConfigService,
  ) {}

  @Post('image')
  @UseInterceptors(createFileInterceptor(new ConfigService()))
  async uploadImage(@UploadedFile() file: any) {
    return this.uploadService.uploadFile(file);
  }
}
