import { Body, Controller } from '@nestjs/common';
import { UserServiceService } from './user-service.service';
import { LoginDto, RegisterDto } from '@app/shared';
import { GrpcMethod } from '@nestjs/microservices';

@Controller('users')
export class UserServiceController {
  constructor(private readonly userServiceService: UserServiceService) {}

  @GrpcMethod('UserService', 'Register')
  async register(registerDto: RegisterDto) {
    // grpc รับ id เเต่ mongo เป็น _id
    const result = await this.userServiceService.register(registerDto);
    return {
      id: result._id.toString(),
      username: result.username,
      email: result.email,
      role: result.role,
    };
  }

  @GrpcMethod('UserService', 'Login')
  async login(loginDto: LoginDto) {
    return this.userServiceService.Login(loginDto);
  }

  @GrpcMethod('UserService', 'GetUser')
  async getUser(data: { id: string }) {
    return this.userServiceService.getUser(data.id);
  }

  @GrpcMethod('UserService', 'UpdateUser')
  async updateUser(data: { id: string; bio?: string; avatarUrl?: string }) {
    return this.userServiceService.updateUser(data.id, data);
  }

  @GrpcMethod('UserService', 'DeleteUser')
  async deleteUser(data: { id: string }) {
    return this.userServiceService.deleteUser(data.id);
  }
}
