import { describe, it, expect } from 'vitest';
import {
  PLAYER_PHOTO_BUCKET,
  MAX_PHOTO_FILE_SIZE,
  ALLOWED_PHOTO_MIME_TYPES,
  uploadPlayerPhoto,
} from '@/lib/storage';

describe('ACC Auction Portal — Supabase Storage Architecture', () => {
  it('defines correct storage bucket and file size boundaries per spec §5', () => {
    expect(PLAYER_PHOTO_BUCKET).toBe('player-photos');
    expect(MAX_PHOTO_FILE_SIZE).toBe(5 * 1024 * 1024); // 5 MB
    expect(ALLOWED_PHOTO_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_PHOTO_MIME_TYPES).toContain('image/png');
    expect(ALLOWED_PHOTO_MIME_TYPES).toContain('image/webp');
  });

  it('rejects disallowed file formats with clear validation error', async () => {
    const invalidBuffer = Buffer.from('not an image');
    const result = await uploadPlayerPhoto('test-player-id', invalidBuffer, 'application/pdf');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid image format');
  });

  it('rejects files exceeding the 5 MB limit', async () => {
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024); // 5 MB + 1 KB
    const result = await uploadPlayerPhoto('test-player-id', oversizedBuffer, 'image/jpeg');
    expect(result.success).toBe(false);
    expect(result.error).toContain('5 MB limit');
  });
});
