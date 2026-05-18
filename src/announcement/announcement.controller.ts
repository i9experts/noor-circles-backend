import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AnnouncementService, CreateAnnouncementDto } from './announcement.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';

@Controller('announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  /** GET /announcements — all authenticated users */
  @Get()
  getAll() {
    return this.announcementService.getAll();
  }

  /** POST /announcements — admin only */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@CurrentUser() user: UserDocument, @Body() dto: CreateAnnouncementDto) {
    return this.announcementService.create(dto, user._id.toString());
  }

  /** DELETE /announcements/:id — admin only */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.announcementService.remove(id);
  }
}
