// =============================================================================
// ACC Auction Portal — Supabase Storage Helpers
// =============================================================================
// Handles player photo uploads to the Supabase Storage bucket 'player-photos'.
// Strict fail-safe design: enforces 5 MB limit, valid MIME types, and returns
// clean CDN public URLs for high-definition projector and ultra-fast list loading.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/admin';

export const PLAYER_PHOTO_BUCKET = 'player-photos';
export const MAX_PHOTO_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per spec §5
export const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

let bucketEnsured = false;

/**
 * Ensures the public storage bucket exists.
 * Fails safely if the bucket already exists or permissions allow.
 */
export async function ensurePlayerPhotoBucket(): Promise<boolean> {
  if (bucketEnsured) return true;
  try {
    const admin = createAdminClient();
    const { data: buckets } = await admin.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === PLAYER_PHOTO_BUCKET);
    if (!exists) {
      const { error } = await admin.storage.createBucket(PLAYER_PHOTO_BUCKET, {
        public: true,
        fileSizeLimit: MAX_PHOTO_FILE_SIZE,
        allowedMimeTypes: ALLOWED_PHOTO_MIME_TYPES,
      });
      if (error && !error.message?.includes('already exists')) {
        console.warn('Notice: Could not automatically create bucket:', error.message);
        return false;
      }
    }
    bucketEnsured = true;
    return true;
  } catch (err) {
    console.warn('ensurePlayerPhotoBucket caught error:', err);
    return false;
  }
}

/**
 * Uploads a player photograph to Supabase Storage and returns its public URL.
 * Server-only; enforces MIME type and size boundaries.
 */
export async function uploadPlayerPhoto(
  playerId: string,
  buffer: Buffer | Uint8Array,
  mimeType: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!ALLOWED_PHOTO_MIME_TYPES.includes(mimeType)) {
      return { success: false, error: 'Invalid image format. Allowed formats: JPG, PNG, WebP.' };
    }
    if (buffer.length > MAX_PHOTO_FILE_SIZE) {
      return { success: false, error: 'Photo file size exceeds maximum 5 MB limit.' };
    }

    await ensurePlayerPhotoBucket();
    const admin = createAdminClient();

    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `players/${playerId}-${Date.now()}.${extension}`;

    const { error: uploadError } = await admin.storage
      .from(PLAYER_PHOTO_BUCKET)
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    const { data } = admin.storage.from(PLAYER_PHOTO_BUCKET).getPublicUrl(filePath);
    return { success: true, url: data.publicUrl };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to upload photo to storage.' };
  }
}
