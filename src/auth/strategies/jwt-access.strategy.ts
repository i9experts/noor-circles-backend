import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../user/user.service';
import { JwtPayload } from '../interface/auth.interface';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException(
        'Account not found. Please sign in again.',
      );
    }
    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please verify your email.',
      );
    }
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Contact admin.',
      );
    }

    return user; // → attached to req.user
  }
}
