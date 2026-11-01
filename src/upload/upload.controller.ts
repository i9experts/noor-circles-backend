import { BadRequestException, Controller, Get, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from './upload.service';

const apiBase = (req: Request) => `${req.protocol}://${req.get('host')}/api/v1`;

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /** POST /upload/image — any signed-in user (admin, murabbi, parent, supervisor). */
  @Post('image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits : { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
      if (/^image\/(jpeg|jpg|pjpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
      else cb(new BadRequestException('Only JPG, PNG, or WebP images are allowed.'), false);
    },
  }))
  uploadImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    return this.uploadService.uploadFile(file, apiBase(req));
  }

  /** GET /upload/images/:id — a photo kept in the database. Public, like an image on a CDN. */
  @Get('images/:id')
  @SkipThrottle()
  async image(@Param('id') id: string, @Res() res: Response) {
    const img = await this.uploadService.open(id);
    res.set({
      'Content-Type': img.contentType,
      'Content-Length': String(img.size),
      // Each upload gets a new id, so the bytes behind a URL never change.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // The portal is on another origin; helmet's default would block it.
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    img.stream.on('error', () => res.destroy());
    img.stream.pipe(res);
  }
}
