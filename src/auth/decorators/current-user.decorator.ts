import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDocument } from '../../user/user.schema';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserDocument => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);