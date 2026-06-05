import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
// import { Schema as MongooseSchema } from 'mongoose';
export type OutboxDocument = HydratedDocument<OutboxEvent>;
export type OutboxStatus = 'pending' | 'published' | 'failed';

@Schema({ timestamps: true })
export class OutboxEvent {
  @Prop({ required: true, unique: true })
  eventId: string;

  @Prop({ required: true })
  topic: string;

  @Prop({ required: true })
  key: string;

  // เเเยก type object สําหรับไป DLQ, Buffer สําหรับไป business event
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  value: Buffer | Record<string, unknown>;

  // ระบุ type ของ payload เพื่อให้ worker จัดการเเต่ละ type ได้ง่าย
  @Prop({ required: true, enum: ['avro', 'json'] })
  payloadEncodingType: 'avro' | 'json';

  @Prop({ required: true, type: Object })
  headers: Record<string, string>;

  @Prop({
    type: String,
    enum: ['pending', 'published', 'failed'],
    default: 'pending',
  })
  status: OutboxStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({ type: Date, default: null })
  nextRetryAt: Date | null;

  @Prop({ type: Date, default: null })
  failedAt: Date | null;
}

export const OutboxSchema = SchemaFactory.createForClass(OutboxEvent);
// เลือก status เพราะ เพื่อให้ woker filter status ได้เร็วขึ้น
OutboxSchema.index({ status: 1, createdAt: 1 });

// TTL ลบ auto เหมาะกับ outbox ที่ข้อมูลไม่มี side effect เช่น ก่อนลบ user ต้องไปลบข้อมูลส่วนอื่นที่เกี่ยวข้องด้วย
// OutboxSchema.index(
//   { publishedAt: 1 },
//   {
//     expireAfterSeconds: 7 * 24 * 60 * 60,
//     partialFilterExpression: { status: 'published' },
//   },
// );
