export function generateConversationId(
  userId1: string,
  userId2: string,
): string {
  const ids = [userId1, userId2].sort();
  return `${ids[0]}_${ids[1]}`;
}
