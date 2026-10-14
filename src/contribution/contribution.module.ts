import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Contribution, ContributionSchema, Contributor, ContributorSchema, Counter, CounterSchema,
} from './contribution.schema';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { NotificationModule } from '../notification/notification.module';
import { ContributionService } from './contribution.service';
import { ContributionController } from './contribution.controller';
import { StripeService } from './stripe.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contributor.name,  schema: ContributorSchema  },
      { name: Contribution.name, schema: ContributionSchema },
      { name: Counter.name,      schema: CounterSchema      },
      { name: Parent.name,       schema: ParentSchema       },
    ]),
    NotificationModule,
  ],
  controllers: [ContributionController],
  providers  : [ContributionService, StripeService],
  exports    : [ContributionService, MongooseModule],
})
export class ContributionModule {}
