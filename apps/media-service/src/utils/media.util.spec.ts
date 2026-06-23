import { getShardKey } from './media.util';

describe('Media Utilities', () => {
  describe('getShardKey', () => {
    it('ควรคืนค่า string ความยาว 2 ตัวอักษร เมื่อได้รับ mediaId ที่ถูกต้อง', () => {
      const mockMediaId = '123e4567-e89b-12d3-a456-426614174000';
      const result = getShardKey(mockMediaId);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toHaveLength(2);
    });

    it('ควรคืนค่าเดิมเสมอเมื่อใส่ mediaId เดิมกัน', () => {
      const mockMediaId = 'test-id-123';
      const result1 = getShardKey(mockMediaId);
      const result2 = getShardKey(mockMediaId);

      expect(result1).toBe(result2);
    });

    it('ควรคืนค่า hex (0-9, a-f) เท่านั้น', () => {
      const mockMediaId = 'any-random-id';
      const result = getShardKey(mockMediaId);

      // Regex ตรวจว่าเป็นตัวเลข 0-9 หรือ a-f เท่านั้น
      expect(result).toMatch(/^[0-9a-f]{2}$/);
    });

    it('ควรโยน Error เมื่อไม่ส่ง mediaId เข้ามา', () => {
      expect(() => getShardKey('')).toThrow('Media ID is required');
      expect(() => getShardKey(null as any)).toThrow('Media ID is required');
    });

    it('ควรให้ค่า Shard ที่แตกต่างกันสำหรับ mediaId ที่ต่างกัน', () => {
      const id1 = 'user-A';
      const id2 = 'user-B';

      const shard1 = getShardKey(id1);
      const shard2 = getShardKey(id2);

      expect(shard1).toBeDefined();
      expect(shard2).toBeDefined();
    });
  });
});
