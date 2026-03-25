import { LoginDto, RegisterDto } from '@app/shared';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
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

@Injectable()
export class AuthService implements OnModuleInit {
  private userGrpcService: UserGrpcService;

  constructor(@Inject('USER_SERVICE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.userGrpcService =
      this.client.getService<UserGrpcService>('UserService');
  }

  registerUser(registerDto: RegisterDto) {
    return this.userGrpcService.register(registerDto);
  }

  loginUser(loginDto: LoginDto) {
    return this.userGrpcService.login(loginDto);
  }
}
