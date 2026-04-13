import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoginDto, RegisterDto } from '@app/shared';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // สมัครได้ 3 ครั้งใน 1 นาที
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  registerUser(@Body() registerDto: RegisterDto) {
    return this.authService.registerUser(registerDto);
  }

  // login ได้ 5 ครั้งใน 1 นาที
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  loginUser(@Body() loginDto: LoginDto) {
    return this.authService.loginUser(loginDto);
  }
}
