import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './user.schema';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { LoginDto, RegisterDto } from '@app/shared';
import { RpcException } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UserServiceService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { username, email, password } = registerDto;

    const existUser = await this.userModel.findOne({
      $or: [{ username }, { email }],
    });

    if (existUser) {
      if (existUser.username === username) {
        throw new RpcException({
          status: 409,
          message: 'username นี้ถูกใช้งานเเล้ว',
        });
      }
      if (existUser.email === email) {
        throw new RpcException({
          status: 409,
          message: 'Email นี้ถูกใช้งานแล้ว',
        });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new this.userModel({
      username,
      email,
      passwordHash,
    });

    const saveUser = await newUser.save();

    const userObject = saveUser.toObject();
    const { passwordHash: _, ...userResponse } = userObject;

    return userResponse;
  }

  async Login(loginDto: LoginDto) {
    const { usernameOrEmail, password } = loginDto;

    const user = await this.userModel.findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });

    if (!user) {
      throw new RpcException({
        status: 404,
        message: 'not found username or email',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new RpcException({ status: 401, message: 'incorrect password' });
    }

    const payload = { sub: user._id, username: user.username, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        sub: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  async getUser(id: string) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new RpcException({ status: 404, message: 'User Not Found' });
    }

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      bio: user.profile?.bio || '',
      avatarUrl: user.profile?.avatarUrl || '',
    };
  }

  async updateUser(
    id: string,
    updateData: { bio?: string; avatarUrl?: string },
  ) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new RpcException({ status: 404, message: 'User not found' });
    }

    // อัปเดตเฉพาะฟิลด์ที่มีการส่งมา
    if (updateData.bio !== undefined) user.profile.bio = updateData.bio;
    if (updateData.avatarUrl !== undefined)
      user.profile.avatarUrl = updateData.avatarUrl;

    user.markModified('profile');
    await user.save();

    return this.getUser(id);
  }

  async deleteUser(id: string) {
    const result = await this.userModel.findByIdAndDelete(id);
    if (!result)
      throw new RpcException({ status: 404, message: 'User not found' });
    return { success: true };
  }
}
