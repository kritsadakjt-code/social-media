import { createHash } from 'crypto';

export function getShardKey(mediaId: string): string {
  if (!mediaId) {
    throw new Error('Media ID is required');
  }
  return createHash('sha256').update(mediaId).digest('hex').slice(0, 2);
}
