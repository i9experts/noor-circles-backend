import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { UserRole }     from '../user/user.schema';
import { InterestService } from './interest.service';
import { CreateInterestDto, UpdateInterestDto } from './interest.dto';

@Controller('interest')
export class InterestController {
  constructor(private readonly interestService: InterestService) {}

  /** POST /interest — public form on the landing page. 5 per minute per visitor. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body() dto: CreateInterestDto) {
    return this.interestService.create(dto);
  }

  /** GET /interest?status=&role= — admin */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Query('status') status?: string, @Query('role') role?: string) {
    return this.interestService.findAll({ status, role });
  }

  /** PATCH /interest/:id — admin updates status / notes */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateInterestDto) {
    return this.interestService.update(id, dto);
  }

  /** DELETE /interest/:id — admin */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.interestService.remove(id);
  }
}
