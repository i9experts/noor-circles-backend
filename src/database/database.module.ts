/**
 * This module is kept for reference only.
 * MongoDB connection is configured in AppModule via MongooseModule.forRootAsync.
 * Individual feature modules import MongooseModule.forFeature directly.
 */
import { Module } from '@nestjs/common';

@Module({})
export class DatabaseModule {}
