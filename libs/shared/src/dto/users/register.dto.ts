import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'john' })
  @IsNotEmpty({ message: 'username is required' })
  username: string;

  @ApiProperty({ example: 'john@gmail.com' })
  @IsEmail({}, { message: 'invalid email format' })
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @MinLength(6, { message: 'password must be a least 6 characters' })
  password: string;
}
