import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { ParentJournalService } from './parent-journal.service';
import { AddParentMomentDto, SaveParentJournalPageDto } from './parent-journal.dto';

/** The Parent Journal: private to each parent; the team sees counts only. */
@Controller('parent-journal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParentJournalController {
  constructor(private readonly journal: ParentJournalService) {}

  /** GET /parent-journal/admin/progress — pages written and moments per parent (no content). */
  @Get('admin/progress')
  @Roles(UserRole.ADMIN)
  progress() { return this.journal.progress(); }

  /** GET /parent-journal — my journal: every page (open once its lesson is heard) and my moments at home. */
  @Get()
  @Roles(UserRole.PARENT)
  mine(@CurrentUser() user: UserDocument) { return this.journal.journal(user._id.toString()); }

  @Put('pages/:key')
  @Roles(UserRole.PARENT)
  save(@CurrentUser() user: UserDocument, @Param('key') key: string, @Body() dto: SaveParentJournalPageDto) {
    return this.journal.save(user._id.toString(), key, dto.answers);
  }

  @Post('moments')
  @Roles(UserRole.PARENT)
  addMoment(@CurrentUser() user: UserDocument, @Body() dto: AddParentMomentDto) {
    return this.journal.addMoment(user._id.toString(), dto);
  }

  @Delete('moments/:id')
  @Roles(UserRole.PARENT)
  deleteMoment(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.journal.deleteMoment(user._id.toString(), id);
  }
}
