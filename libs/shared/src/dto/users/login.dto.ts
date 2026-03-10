import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'tar@gmail.com' })
  @IsNotEmpty({ message: 'username or email required' })
  usernameOrEmail: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsNotEmpty({ message: 'password required' })
  @MinLength(6, { message: 'password must be at least 6 characters' })
  password: string;
}
