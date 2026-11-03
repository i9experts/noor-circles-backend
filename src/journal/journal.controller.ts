import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { JournalService } from './journal.service';
import { AddMomentDto, FeatureMomentDto, JournalReminderDto, SaveJournalPageDto, UpdateMomentDto } from './journal.dto';

@Controller('journal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  /** GET /journal/admin/progress — pages done and moments per murabbi (the Journal column). */
  @Get('admin/progress')
  @Roles(UserRole.ADMIN)
  progress() { return this.journal.progress(); }

  /** GET /journal/admin/insights — summary, page-by-page completion, every murabbi, moments over time. */
  @Get('admin/insights')
  @Roles(UserRole.ADMIN)
  insights() { return this.journal.insights(); }

  /** GET /journal/admin/murabbis/:id — read one murabbi's whole journal. */
  @Get('admin/murabbis/:id')
  @Roles(UserRole.ADMIN)
  murabbi(@Param('id') id: string) { return this.journal.murabbiJournal(id); }

  /** POST /journal/admin/remind — email a reminder to the chosen murabbis. */
  @Post('admin/remind')
  @Roles(UserRole.ADMIN)
  remind(@Body() dto: JournalReminderDto) { return this.journal.remind(dto); }

  /** GET /journal/admin/moments?featured=true — every moment of light (or the featured ones). */
  @Get('admin/moments')
  @Roles(UserRole.ADMIN)
  moments(@Query('featured') featured?: string) { return this.journal.allMoments(featured === 'true'); }

  /** PATCH /journal/admin/moments/:id — feature a moment (or not). */
  @Patch('admin/moments/:id')
  @Roles(UserRole.ADMIN)
  feature(@Param('id') id: string, @Body() dto: FeatureMomentDto) { return this.journal.feature(id, dto.featured); }

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

  /** PATCH /journal/moments/:id — the murabbi's choice to show their name if it's featured. */
  @Patch('moments/:id')
  @Roles(UserRole.MURABBI)
  updateMoment(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: UpdateMomentDto) {
    return this.journal.updateMoment(user._id.toString(), id, dto.shareName);
  }

  @Delete('moments/:id')
  @Roles(UserRole.MURABBI)
  deleteMoment(@CurrentUser() user: UserDocument, @Param('id') id: string) { return this.journal.deleteMoment(user._id.toString(), id); }
}
