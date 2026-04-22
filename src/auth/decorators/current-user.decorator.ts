import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDocument } from '../../user/user.schema';

export const CurrentUser = createParamDecorator(
  (field: keyof UserDocument | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: UserDocument = request.user;
    return field ? user?.[field] : user;
  },
);