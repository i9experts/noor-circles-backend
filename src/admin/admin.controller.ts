import {
  Body, Controller, Delete, Get,
  HttpCode, HttpStatus, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateMurabbiDto } from './admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { UserRole }     from '../user/user.schema';

/**
 * ALL routes here require:
 *   1. Valid JWT access token  (JwtAuthGuard)
 *   2. Role = admin            (RolesGuard + @Roles)
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /admin/stats
   * → { totalMurabbis, activeMurabbis, inactiveMurabbis }
   */
  @Get('stats')
  getStats() {
    return this.adminService.getDashboardStats();
  }

  /**
   * GET /admin/users
   * → All verified users (all roles)
   */
  @Get('users')
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  /**
   * GET /admin/murabbis
   * → All murabbis list
   */
  @Get('murabbis')
  getAllMurabbis() {
    return this.adminService.getAllMurabbis();
  }

  /**
   * POST /admin/murabbis
   * Body: { fullName, email, password }
   * → Creates a Murabbi account directly (no OTP)
   */
  @Post('murabbis')
  @HttpCode(HttpStatus.CREATED)
  createMurabbi(@Body() dto: CreateMurabbiDto) {
    return this.adminService.createMurabbi(dto);
  }

  /**
   * PATCH /admin/murabbis/:id/deactivate
   * → Deactivates murabbi (revokes sessions too)
   */
  @Patch('murabbis/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string) {
    return this.adminService.deactivateMurabbi(id);
  }

  /**
   * PATCH /admin/murabbis/:id/activate
   * → Re-activates a deactivated murabbi
   */
  @Patch('murabbis/:id/activate')
  @HttpCode(HttpStatus.OK)
  activate(@Param('id') id: string) {
    return this.adminService.activateMurabbi(id);
  }

  /**
   * DELETE /admin/murabbis/:id
   * → Permanently deletes a murabbi account
   */
  @Delete('murabbis/:id')
  @HttpCode(HttpStatus.OK)
  delete(@Param('id') id: string) {
    return this.adminService.deleteMurabbi(id);
  }
}