import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Post {
  @Prop({ required: true })
  // ใส่ ! ไว้เพราะ TS เตือนว่าตั้งใส่ค่าเริ่มต้น เเต่ส่วนนี้ mongoose จะใส่ค่าให้ตอนที่รัน
  userId!: string;

  @Prop({ required: true })
  username!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ default: 0 })
  likes!: number;

  // สร้างไว้เพื่อไม่ให้เเจ้ง unsafe เพราะ ts ไม่รู้จักชื่อนี้ถ้าไม่ประกาศ
  createdAt!: Date;
  updatedAt!: Date;
}
export type PostDocument = HydratedDocument<Post>;
export const PostSchema = SchemaFactory.createForClass(Post);
