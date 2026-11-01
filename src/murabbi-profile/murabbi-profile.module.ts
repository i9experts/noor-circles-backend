import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/user.schema';
import { MurabbiProfile, MurabbiProfileSchema } from './murabbi-profile.schema';
import { MurabbiProfileService } from './murabbi-profile.service';
import { MurabbiProfileController } from './murabbi-profile.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MurabbiProfile.name, schema: MurabbiProfileSchema },
      { name: User.name,           schema: UserSchema           },
    ]),
  ],
  controllers: [MurabbiProfileController],
  providers  : [MurabbiProfileService],
})
export class MurabbiProfileModule {}
