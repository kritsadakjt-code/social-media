// ใช้ jitter กระจายเวลาเพื่อไม่ให้ event เวลาใกล้กันเกินไปจะทําให้ server overload
export function calculateBackoff(attempts: number): Date {
  const maxDelayMs = 5 * 60 * 1000; // 5m = 300000ms
  // 1s 2s 4s 8s 16s ... 5m
  const baseDelayMs = Math.min(1000 * 2 ** attempts, maxDelayMs);
  // กระจาย 30% ของเวลาที่ delay
  const jitterMs = Math.random() * 0.3 * baseDelayMs;
  return new Date(Date.now() + baseDelayMs + jitterMs);
}
