import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RewardAllocation, RewardAllocationSchema, RewardPool, RewardPoolSchema } from './rewards.schema';
import { Incentive, IncentiveSchema } from '../incentive/incentive.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { User, UserSchema } from '../user/user.schema';
import { ContributionModule } from '../contribution/contribution.module';
import { EngagementModule } from '../engagement/engagement.module';
import { ParentRatingModule } from '../parent-rating/parent-rating.module';
import { NotificationModule } from '../notification/notification.module';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RewardPool.name,       schema: RewardPoolSchema       },
      { name: RewardAllocation.name, schema: RewardAllocationSchema },
      { name: Incentive.name,        schema: IncentiveSchema        },
      { name: Student.name,          schema: StudentSchema          },
      { name: User.name,             schema: UserSchema             },
    ]),
    ContributionModule,
    EngagementModule,
    ParentRatingModule,
    NotificationModule,
  ],
  controllers: [RewardsController],
  providers  : [RewardsService],
})
export class RewardsModule {}
