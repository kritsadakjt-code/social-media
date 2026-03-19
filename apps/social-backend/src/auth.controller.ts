import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  OnModuleInit,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClientGrpc } from '@nestjs/microservices';
import { LoginDto, RegisterDto } from '@app/shared';
import { Observable } from 'rxjs';

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  role: string;
  bio: string;
  avatarUrl: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UserResponse;
}
interface UserGrpcService {
  register(data: RegisterDto): Observable<UserResponse>;
  login(data: LoginDto): Observable<LoginResponse>;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController implements OnModuleInit {
  private userGrpcService: UserGrpcService;

  constructor(@Inject('USER_SERVICE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.userGrpcService =
      this.client.getService<UserGrpcService>('UserService');
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  registerUser(@Body() registerDto: RegisterDto) {
    return this.userGrpcService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  loginUser(@Body() loginDto: LoginDto) {
    return this.userGrpcService.login(loginDto);
  }
}
