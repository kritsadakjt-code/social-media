import { LoginDto, RegisterDto, UserGrpcService } from '@app/shared';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';

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
