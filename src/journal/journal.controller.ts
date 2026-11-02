import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { JournalService } from './journal.service';
import { AddMomentDto, SaveJournalPageDto } from './journal.dto';

@Controller('journal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  /** GET /journal/admin/progress — pages done and moments per murabbi (never the text). */
  @Get('admin/progress')
  @Roles(UserRole.ADMIN)
  progress() { return this.journal.progress(); }

  /** GET /journal — my journal: every page (open once its lesson is heard) and my moments of light. */
  @Get()
  @Roles(UserRole.MURABBI)
  mine(@CurrentUser() user: UserDocument) { return this.journal.journal(user._id.toString()); }

  @Put('pages/:key')
  @Roles(UserRole.MURABBI)
  save(@CurrentUser() user: UserDocument, @Param('key') key: string, @Body() dto: SaveJournalPageDto) {
    return this.journal.save(user._id.toString(), key, dto.answers);
  }

  @Post('moments')
  @Roles(UserRole.MURABBI)
  addMoment(@CurrentUser() user: UserDocument, @Body() dto: AddMomentDto) { return this.journal.addMoment(user._id.toString(), dto); }

  @Delete('moments/:id')
  @Roles(UserRole.MURABBI)
  deleteMoment(@CurrentUser() user: UserDocument, @Param('id') id: string) { return this.journal.deleteMoment(user._id.toString(), id); }
}
