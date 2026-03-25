import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class GetChatHistoryDto {
  @IsString({ message: 'userId1 ต้องเป็นข้อความ' })
  @IsNotEmpty({ message: 'ห้ามเว้นว่าง userId1' })
  userId1: string;

  @IsString({ message: 'userId2 ต้องเป็นข้อความ' })
  @IsNotEmpty({ message: 'ห้ามเว้นว่าง userId2' })
  userId2: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'limit ต้องเป็นตัวเลข' })
  @Min(1)
  limit: number = 20;

  @IsOptional()
  @IsString()
  cursor?: string;
}
