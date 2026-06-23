import { CINEMATIC_PALETTES } from '@/components/shot/shotCardOptions';

const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');

// Pull a small dominant-colour palette out of an image entirely client-side:
// downscale to a tiny canvas, quantize to 4 bits/channel, count buckets, take
// the most common. Returns hex strings; resolves to [] if the image can't load.
export function extractPalette(src, count = 5) {
  return new Promise((resolve) => {
    if (!src || typeof document === 'undefined') return resolve([]);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const r = data[i] >> 4;
          const g = data[i + 1] >> 4;
          const b = data[i + 2] >> 4;
          const key = (r << 8) | (g << 4) | b;
          const cur = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
          cur.count += 1;
          cur.r += data[i];
          cur.g += data[i + 1];
          cur.b += data[i + 2];
          buckets.set(key, cur);
        }
        const colors = [...buckets.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, count)
          .map((c) => `#${toHex(Math.round(c.r / c.count))}${toHex(Math.round(c.g / c.count))}${toHex(Math.round(c.b / c.count))}`);
        resolve(colors);
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}

export function randomCinematicPalette() {
  const pick = CINEMATIC_PALETTES[Math.floor(Math.random() * CINEMATIC_PALETTES.length)];
  return [...pick];
}

// A placeholder "generated" frame: a diagonal gradient built from the palette,
// rendered as an inline SVG data URL. Clearly abstract — stands in until real
// frame generation is wired.
export function svgGradientDataUrl(colors = []) {
  const list = colors.length ? colors : ['#2A2533', '#6E6585'];
  const stops = list
    .map((c, i) => `<stop offset='${Math.round((i / Math.max(list.length - 1, 1)) * 100)}%' stop-color='${c}'/>`)
    .join('');
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='130'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>${stops}</linearGradient></defs>` +
    `<rect width='200' height='130' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// A distinct portrait "generated" placeholder per seed: a rotated palette
// gradient with a couple of soft shapes. Stands in for real image/video
// generation in the Images/Videos tabs.
export function placeholderArt(colors = [], seed = 0) {
  const list = colors.length ? colors : ['#2A2533', '#6E6585', '#9A8FB0'];
  const rotated = list.map((_, i) => list[(i + seed) % list.length]);
  const angle = (seed * 47) % 360;
  const stops = rotated
    .map((c, i) => `<stop offset='${Math.round((i / Math.max(rotated.length - 1, 1)) * 100)}%' stop-color='${c}'/>`)
    .join('');
  const cx = 30 + ((seed * 37) % 140);
  const cy = 40 + ((seed * 53) % 90);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='260'>` +
    `<defs><linearGradient id='g' gradientTransform='rotate(${angle} 0.5 0.5)'>${stops}</linearGradient></defs>` +
    `<rect width='200' height='260' fill='url(#g)'/>` +
    `<circle cx='${cx}' cy='${cy}' r='48' fill='rgba(255,255,255,0.10)'/>` +
    `<circle cx='${200 - cx}' cy='${260 - cy}' r='32' fill='rgba(0,0,0,0.14)'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const fileToUrl = (file) => (file ? URL.createObjectURL(file) : null);

