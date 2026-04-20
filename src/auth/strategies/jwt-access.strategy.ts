import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../user/user.schema';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      // Request ke Authorization header se token nikalo
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
    });
  }

  // Token valid hone ke baad yeh function chalta hai
  // Jo bhi return karo woh req.user mein aa jata hai
  async validate(payload: { sub: string; email: string }) {
    const user = await this.userModel.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User nahi mila');
    return user;
  }
}