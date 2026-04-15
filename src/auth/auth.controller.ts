import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SignupDto } from "./dto/signup.dto";
import { SigninDto } from "./dto/signin.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard.js";

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post("signup")
    signup(@Body() dto: SignupDto) {
        return this.authService.signup(dto);
    }

    @Post("signin")
    signin(@Body() dto: SigninDto) {
        return this.authService.signin(dto);
    }

    @UseGuards(JwtRefreshGuard)
    @Post("refresh")
    refresh(@Req() req: any) {
        return this.authService.refresh(req.user.sub, req.user.refreshToken);
    }

    @UseGuards(JwtRefreshGuard)
    @Post("logout")
    logout(@Req() req: any) {
        return this.authService.logout(req.user.sub);
    }

    @Post("forgot-password")
    forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto);
    }

    @Post("verify-otp")
    verifyOtp(@Body() dto: VerifyOtpDto) {
        return this.authService.verifyOtp(dto);
    }

    @Post("reset-password")
    resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto);
    }
}