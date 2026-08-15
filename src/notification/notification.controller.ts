import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { NotificationService } from './notification.service';
import { NotificationType } from './notification.schema';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { safeTrim } from '../common/utils/transform.util';

class RequestMaterialDto {
  @IsOptional() @IsString() @Transform(safeTrim)
  note?: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notifService: NotificationService) {}

  /** GET /notifications */
  @Get()
  getAll(@CurrentUser() user: UserDocument) {
    return this.notifService.getForUser(user._id.toString());
  }

  /** GET /notifications/unread-count */
  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: UserDocument) {
    return this.notifService.getUnreadCount(user._id.toString());
  }

  /** PATCH /notifications/read-all */
  @Patch('read-all')
  markAllRead(@CurrentUser() user: UserDocument) {
    return this.notifService.markAllRead(user._id.toString());
  }

  /** PATCH /notifications/:id/read */
  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.notifService.markRead(id, user._id.toString());
  }

  /** PATCH /notifications/:id/accept — admin only */
  @Patch(':id/accept')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  accept(@Param('id') id: string) {
    return this.notifService.acceptRequest(id);
  }

  /** PATCH /notifications/:id/reject — admin only */
  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  reject(@Param('id') id: string) {
    return this.notifService.rejectRequest(id);
  }

  /** POST /notifications/request-material — murabbi requests lesson material from admin */
  @Post('request-material')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MURABBI)
  async requestMaterial(
    @CurrentUser() user: UserDocument,
    @Body() dto: RequestMaterialDto,
  ) {
    const murabbiName = user.fullName || 'A murabbi';
    const note = dto.note?.trim();
    await this.notifService.createForAdmins({
      sender : user._id.toString(),
      type   : NotificationType.MATERIAL_REQUEST,
      title  : 'Lesson Material Request',
      message: note
        ? `${murabbiName} requested custom materials: "${note}"`
        : `${murabbiName} has requested custom lesson materials.`,
      payload: { murabbiName, note: note || '' },
    });
    return { message: 'Request sent to admin.' };
  }
}
