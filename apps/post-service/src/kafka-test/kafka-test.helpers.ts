import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createSpyConsumer(
  kafka: Kafka,
  topic: string,
  groupId: string,
): Promise<{
  consumer: Consumer;
  messages: EachMessagePayload[];
  stop: () => Promise<void>;
}> {
  const messages: EachMessagePayload[] = [];

  // สร้าง consumer
  const consumer = kafka.consumer({ groupId });
  // ต่อ consumer เข้า kafka broker
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true }); // เริ่มอ่านตั้งเเต่ message , ถ้า false อ่าน message หลัง subscribe

  // ฟัง message ที่ kafka ส่งมาเเละเก็บลง array
  void consumer.run({
    eachMessage: (payload) => {
      messages.push(payload);
      return Promise.resolve();
    },
  });

  return {
    consumer,
    messages,
    stop: async () => {
      await consumer.disconnect();
    },
  };
}

// รอ consumer ได้รับ message หรือยัง
export async function waitForCondition(
  check: () => Promise<boolean>, // รับ callback
  timeoutMs = 15_000,
  intervalMs = 300,
): Promise<void> {
  const start = Date.now(); // เวลาสําหรับลบกับ เวลาที่ถูก(Date.now()) + ขึ้นเรื่อยๆ

  while (Date.now() - start < timeoutMs) {
    if (await check()) return; // เรียก callback เพื่อเช็คว่าเป็น true/false
    await sleep(intervalMs); // บวกเวลาไป 0.3 วิ
  }

  // ถ้า 15 วิเเล้วยังไม่ได้ message throw เลย
  throw new Error(`waitForCondition: timeout after ${timeoutMs}ms`);
}

// ─────────────────────────────────────────────────────────────
//
//  Kafka Test Helpers
//  ใช้ซ้ำได้ทุก integration test ที่เกี่ยวกับ Kafka
//
// ─────────────────────────────────────────────────────────────

// import { Kafka, Consumer, Producer, EachMessagePayload } from 'kafkajs';

// // รอจนกว่า condition จะเป็น true หรือ timeout
// // ใช้สำหรับรอ Consumer รับ message แบบ async

// export function sleep(ms: number): Promise<void> {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// // สร้าง Spy Consumer สำหรับดักฟัง message ที่ถูกส่งเข้า Kafka
// // ใช้ใน Producer test เพื่อตรวจว่า message ถูกส่งถูกต้องมั้ย
// export async function createSpyConsumer(
//   kafka: Kafka,
//   topic: string,
//   groupId: string,
// ): Promise<{
//   consumer: Consumer;
//   messages: EachMessagePayload[];
//   stop: () => Promise<void>;
// }> {
//   const messages: EachMessagePayload[] = [];

//   const consumer = kafka.consumer({ groupId });
//   await consumer.connect();
//   await consumer.subscribe({ topic, fromBeginning: true });

//   // รัน consumer ใน background
//   void consumer.run({
//     eachMessage: async (payload) => {
//       messages.push(payload);
//     },
//   });

//   return {
//     consumer,
//     messages,
//     stop: async () => {
//       await consumer.disconnect();
//     },
//   };
// }

// // สร้าง Test Producer สำหรับส่ง message จำลองเข้า Kafka
// // ใช้ใน Consumer test เพื่อ simulate event จาก service อื่น
// export async function createTestProducer(kafka: Kafka): Promise<{
//   producer: Producer;
//   send: (topic: string, value: Buffer, headers: Record<string, string>) => Promise<void>;
//   stop: () => Promise<void>;
// }> {
//   const producer = kafka.producer();
//   await producer.connect();

//   return {
//     producer,
//     send: async (topic, value, headers) => {
//       await producer.send({
//         topic,
//         messages: [{
//           value,
//           headers,
//         }],
//       });
//     },
//     stop: async () => {
//       await producer.disconnect();
//     },
//   };
// }
