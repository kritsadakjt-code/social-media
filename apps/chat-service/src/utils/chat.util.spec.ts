import { generateConversationId } from './chat.util';

describe('generateConversationId', () => {
  // CASE 1: Happy Path — การทำงานปกติที่คาดหวัง
  it('should return the same id regardless of input order', () => {
    const userA = 'user_001';
    const userB = 'user_002';

    // เรียกสลับตําเเหน่งกัน
    const result1 = generateConversationId(userA, userB);
    const result2 = generateConversationId(userB, userA);

    // ต้องได้ผลเหมือนกัน ถ้าไม่ใช้จะเป็นการเเตกเป็น 2 ห้อง
    expect(result1).toBe(result2);
  });

  // CASE 2: Format ของผลลัพธ์ถูกต้องมั้ย
  it('should separate two userIds with underscore', () => {
    const userA = 'aaa';
    const userB = 'bbb';

    const result = generateConversationId(userA, userB);

    // ต้องมี _ คั่นกลาง
    expect(result).toBe('aaa_bbb');
  });

  // CASE 3: Sorting ถูกต้องมั้ย
  it('should sort ids alphabetically so smaller id comes first', () => {
    const result = generateConversationId('zzz', 'aaa');
    // aaa ต้องมาก่อนเสมอ ไม่ใช่ตามลำดับที่ส่งมา
    expect(result).toBe('aaa_zzz');
  });

  // CASE 4: Edge Case — userId เหมือนกันทั้งคู่
  it('should handle same userId for both users', () => {
    const result = generateConversationId('user_001', 'user_001');

    // ไม่ควร crash ต้องทำงานต่อได้
    expect(result).toBe('user_001_user_001');
  });

  // CASE 5: ผลลัพธ์ต้องมี underscore แค่ 1 ตัวคั่นระหว่าง id
  it('should contain exactly one underscore separator between ids', () => {
    const result = generateConversationId('userA', 'userB');

    const parts = result.split('_');

    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('userA');
    expect(parts[1]).toBe('userB');
  });
});
