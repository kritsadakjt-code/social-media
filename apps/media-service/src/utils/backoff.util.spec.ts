import { calculateBackoff } from './backoff.util';

describe('calculateBackoff', () => {
  const FAKE_NOW = 1_000_000; // ms สมมติว่าตอนนี้คือเวลานี้
  // run ก่อน test
  beforeEach(() => {
    // Mock Date.now() ให้ return FAKE_NOW
    jest.spyOn(Date, 'now').mockReturnValue(FAKE_NOW);
    // Mock Math.random() ให้ return 0
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  // คืนค่าจริงหลัง test เสร็จ
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // EDGE CASE: attempts = 0 ทํางานครั้งเเรกหลัง error ยังไม่ attemps + 1
  it('should return 1 second delay on first attempt (attempts = 0)', () => {
    const attempts = 0;

    const result = calculateBackoff(attempts);

    // Then: delay = 1000 * 2^0 = 1000ms = 1 วินาที
    const expectedTime = FAKE_NOW + 1000;

    expect(result.getTime()).toBe(expectedTime);
  });

  // EDGE CASE: ตรวจสอบ exponential growth (2^n)
  it('should double the delay on each attempt', () => {
    const result1 = calculateBackoff(1); // 1000 * 2^1 = 2000ms
    const result2 = calculateBackoff(2); // 1000 * 2^2 = 4000ms

    const delay1 = result1.getTime() - FAKE_NOW; // 2000
    const delay2 = result2.getTime() - FAKE_NOW; // 4000

    // Then: delay ต้องเพิ่มเป็น 2 เท่าทุกครั้ง
    expect(delay2).toBe(delay1 * 2);
  });

  // ERROR CASE: delay ต้องไม่เกิน 5 นาที
  it('should cap delay at 5 minutes regardless of attempts', () => {
    const MAX_DELAY_MS = 5 * 60 * 1000; // 300,000 ms

    const result = calculateBackoff(100); // 1000 * 2^100 = 300,000 ถูกจํากัดไว้

    const actualDelay = result.getTime() - FAKE_NOW;

    // Then: delay ต้องไม่เกิน 5 นาที
    expect(actualDelay).toBeLessThanOrEqual(MAX_DELAY_MS);
  });

  it('should reach max delay at attempts = 9 (1000 * 2^9 = 512000 > 300000)', () => {
    const MAX_DELAY_MS = 5 * 60 * 1000; // 300,000 ms

    // Given: attempts = 9 → 1000 * 2^9 = 512,000 เกิน cap แล้ว
    const result = calculateBackoff(9);

    const actualDelay = result.getTime() - FAKE_NOW;

    // Then: หลังจาก 9 ครั้งเป็นต้นไปถูก cap ไว้ที่ 300,000
    expect(actualDelay).toBe(MAX_DELAY_MS);
  });

  // MOCK: ทดสอบว่า jitter ถูกนำมาใช้จริง
  it('should add jitter on top of base delay', () => {
    // Given: mock random = 0.5 (แทนที่ที่ตั้งไว้ใน beforeEach)
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    // When: attempts = 0 → baseDelay = 1000ms
    const result = calculateBackoff(0);

    const actualDelay = result.getTime() - FAKE_NOW;

    // Then: jitter = 0.5 * 0.3 * 1000 = 150ms
    // totalDelay = 1000 + 150 = 1150ms
    expect(actualDelay).toBe(1150);
  });

  it('should return a Date object not a number', () => {
    const result = calculateBackoff(0);

    // Then: ต้องเป็น Date ไม่ใช่ตัวเลขหรือ string
    expect(result).toBeInstanceOf(Date);
  });

  it('should return a future date not a past date', () => {
    const result = calculateBackoff(0);

    // Then: ต้องเป็นเวลาในอนาคตเสมอ
    expect(result.getTime()).toBeGreaterThan(FAKE_NOW);
  });

  // // EDGE CASE: attempts = 8 ก่อนถึง cap เช็คให้ชัวว่าไม่คํานวณผิดก่อนถึง attemps ที่ต้อง cap จริง
  it('should not be capped at attempts = 8 (256s < 300s)', () => {
    const result = calculateBackoff(8);

    const actualDelay = result.getTime() - FAKE_NOW;

    // Then: 256,000ms ยังไม่เกิน cap
    expect(actualDelay).toBe(256_000);
  });
});
