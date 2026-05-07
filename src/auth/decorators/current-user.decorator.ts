import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDocument } from '../../user/user.schema';

export const CurrentUser = createParamDecorator(
  (field: keyof UserDocument | undefined, ctx: ExecutionContext) => {
    const user: UserDocument = ctx.switchToHttp().getRequest().user;
    return field ? user?.[field] : user;
  },
);
