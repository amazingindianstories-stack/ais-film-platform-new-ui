import { placeholderArt } from '@/components/shot/shotCardUtils';
import { SEED_PALETTE } from '@/components/shot/shotCardOptions';

export const SUSPENDED_HOST = 'uhlxzmfaepdfoxrinjtq.supabase.co';

export function isSuspendedUrl(url) {
  if (!url) return false;
  return url.includes(SUSPENDED_HOST);
}

export function resolveAssetUrl(url, type = 'image', index = 0) {
  if (!url) return null;

  if (isSuspendedUrl(url)) {
    if (type === 'video') {
      return 'https://www.w3schools.com/html/movie.mp4';
    } else {
      // Return local placeholder SVG for images
      return placeholderArt(SEED_PALETTE, index);
    }
  }

  return url;
}
