import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { RegisterService } from './register.service';
import { AddFollowUpNoteDto, UpdateFollowUpDto } from './register.dto';

/** Registers of murabbis, parents and hosts, with the team's follow-ups. Admins only. */
@Controller('register')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class RegisterController {
  constructor(private readonly register: RegisterService) {}

  /** GET /register/due — follow-ups due today or overdue (dashboard card). */
  @Get('due')
  due() { return this.register.due(); }

  @Get('murabbis')
  murabbis() { return this.register.murabbis(); }

  @Get('parents')
  parents() { return this.register.parents(); }

  @Get('hosts')
  hosts() { return this.register.hosts(); }

  /** GET /register/:type/:id/follow-up — the full follow-up with every note. */
  @Get(':type/:id/follow-up')
  followUp(@Param('type') type: string, @Param('id') id: string) { return this.register.followUp(type, id); }

  @Patch(':type/:id/follow-up')
  update(@Param('type') type: string, @Param('id') id: string, @Body() dto: UpdateFollowUpDto) {
    return this.register.updateFollowUp(type, id, dto);
  }

  @Post(':type/:id/notes')
  addNote(@Param('type') type: string, @Param('id') id: string, @Body() dto: AddFollowUpNoteDto, @CurrentUser() user: UserDocument) {
    return this.register.addNote(type, id, dto, user);
  }
}
