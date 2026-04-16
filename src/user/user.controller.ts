/* eslint-disable prettier/prettier */
import { Controller, Get, Param, Put, Delete, Body, Req, Patch } from '@nestjs/common';
import { UsersService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './schema/user.schema';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 🔍 GET /users → Get all users

@Get('getProfile')
@UseGuards(AuthGuard('jwt'))
async getProfile(@Req() req) {
  const userId = req.user.userId;
  return this.usersService.getProfile(userId);
}

@Patch('update-user')
@UseGuards(AuthGuard('jwt'))
async updateUser(@Req() req, @Body() updateUserDto: UpdateUserDto) {
  const userId = req.user.userId;
  return this.usersService.updateUserData(userId, updateUserDto);
}
  // 🔍 GET /users/:id → Get user by ID



  // ✏️ PUT /users/:id → Update user
 

  // 🗑️ DELETE /users/:id → Delete user
 }
