import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { UpdateUserDto } from '@app/shared';
import { Observable } from 'rxjs';
import { UserResponse } from './auth.service';

interface UserGrpcService {
  getUser(data: { id: string }): Observable<UserResponse>;
  updateUser(data: {
    id: string;
    bio?: string;
    avatarUrl?: string;
  }): Observable<UserResponse>;
  deleteUser(data: { id: string }): Observable<{ success: boolean }>;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private userGrpcService: UserGrpcService;

  constructor(@Inject('USER_SERVICE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.userGrpcService =
      this.client.getService<UserGrpcService>('UserService');
  }

  getProfile(userId: string) {
    return this.userGrpcService.getUser({ id: userId });
  }

  updateProfile(userId: string, updateDto: UpdateUserDto) {
    return this.userGrpcService.updateUser({ id: userId, ...updateDto });
  }

  deleteAccount(userId: string) {
    return this.userGrpcService.deleteUser({ id: userId });
  }
}
