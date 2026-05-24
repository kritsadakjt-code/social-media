import { Injectable } from '@nestjs/common';

@Injectable()
export class SnowflakeIdService {
  // set ให้เริ่มนับตั้งเเต่ 2026
  // 41 bit
  private readonly epoch = BigInt(
    new Date('2026-01-01T00:00:00.000Z').getTime(),
  );

  // ป้องกันกรณีที่ต้องเเยกหลาย server เเล้วสร้าง key เดียวกันเป้ะๆ เช่น ทั้ง 2 server ผู้ใช้อัปรูปในเวลาเดียวกันเป้ะๆ key จะซํ้ากัน
  // 5 bit
  private readonly workerId = BigInt(process.env.SNOWFLAKE_WORKER_ID ?? 1);

  // รู้ว่า key นี้มาจาก region ไหนจะได้เเก้ error ได้ง่าย
  // ระบุ region
  // 5 bit
  private readonly datacenterId = BigInt(
    process.env.SNOWFLAKE_DATACENTER_ID ?? 1,
  );

  // ป้องกันกรณีที่ ใน 1 ms user request เข้ามาหลายคนเเล้ว timestamp workerId DatacenterId ตรงกันทั้งเป้ะๆ ทั้งหมด sequence จะเรียง queue เพื่อไม่ให้ key ซํ้า
  // 12 bit
  private sequence = BigInt(0);

  // เช็คการเดินของเวลา
  // (เป็นลบ -1 = ยังไม่เคยมี) กัน egde case เพราะ ถ้า request เข้ามาตอนรันระบบครั้งเเรก (วินาทีแรกของปี 2026) timestamp = 0
  private lastTimestamp = BigInt(-1);

  next(): string {
    let timestamp = this.currentTimestamp();

    // เวลาถอยหลัง เช่น ปรับเวลา server เอง
    if (timestamp < this.lastTimestamp) {
      throw new Error('Clock moved backwards');
    }

    // request เข้าในมาพร้อมกันในระดับ ms
    if (timestamp === this.lastTimestamp) {
      // ไม่ใช้ if เพราะออกเเบบให้สร้าง ID หลายล้าน/วินาที ถ้าใช้ if จะเสีย cpu cycles ไปเปล่าๆ อย่างมหาศาล
      // cpu จะไม่อ่านโค้ดทีละบรรทัด เเต่จะดึงโค้ดบรรทัดล่วงหน้ามารอด้วย เรียกว่า pipeline ถ้าเจอ if มันจะชะงัก เเละมันจะใช้เทคนิค branch prediction
      // ถ้า cpu เดาถูก ก็ทํางานต่อไปเร็ว, ถ้า cpu เดาผิด จะล้าง pipeline ที่เตรียมไว้ เเละดึงโค้ดล่วงหน้ามาใหม่ ซึงจะทําให้เสีย cycle ไป
      // ทํา bitmask ด้วย bitwise เพื่อ reset bit เป็น 0 ใหม่
      // ถ้า sequence เกิน 4096 ซึ่งเป็น 13 bit เเล้ว sequence จะถูกครอบด้วย 4095 bit
      // ทํา bitwise & เทียบค่า 4096(1 0000 0000 0000), 4095(0 1111 1111 1111) = (0 0000 0000 0000)
      this.sequence = (this.sequence + BigInt(1)) & BigInt(4095);

      // bit เต็มใน 1 ms
      if (this.sequence === BigInt(0)) {
        // หยุดเเละรอรับ ms ใหม่
        timestamp = this.waitNextMillis(timestamp);
      }
    } else {
      // เปลี่ยน ms เเล้ว
      this.sequence = BigInt(0);
    }

    // เก็บ time ล่าสุดของ request ที่เข้ามา
    this.lastTimestamp = timestamp;

    // รวมเป็น key
    const id =
      ((timestamp - this.epoch) << BigInt(22)) |
      (this.datacenterId << BigInt(17)) |
      (this.workerId << BigInt(12)) |
      this.sequence;

    return id.toString();
  }

  private currentTimestamp(): bigint {
    return BigInt(Date.now());
  }

  private waitNextMillis(timestamp: bigint): bigint {
    let next = this.currentTimestamp();
    while (next <= timestamp) {
      // update time
      next = this.currentTimestamp();
    }

    return next;
  }
}
