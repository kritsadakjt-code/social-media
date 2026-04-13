import { IsString, IsNotEmpty } from 'class-validator';

export class PostCreatedEventDto {
  @IsString()
  @IsNotEmpty()
  postId: string;

  @IsString()
  @IsNotEmpty()
  authorId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  timestamp: string;
}

export class UnfollowedEventDto {
  @IsString()
  @IsNotEmpty()
  followerId: string;

  @IsString()
  @IsNotEmpty()
  followingId: string;
}
