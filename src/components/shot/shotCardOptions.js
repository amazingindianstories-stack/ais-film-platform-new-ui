// Preset catalogues for the Technicals tab pickers. Modelled loosely on the
// kind of camera/lens/exposure controls a generation tool (e.g. Higgsfield)
// exposes, plus the framing language used on a shoot.
export const CAMERAS = [
  { name: 'Modular 8K Digital', kind: 'Digital' },
  { name: 'ARRI Alexa 35', kind: 'Digital' },
  { name: 'RED V-Raptor', kind: 'Digital' },
  { name: 'Sony Venice 2', kind: 'Digital' },
  { name: 'Kodak 35mm Film', kind: 'Film' },
  { name: 'IMAX 70mm', kind: 'Film' },
];

export const LENSES = [
  { name: 'Creative Tilt Lens', kind: 'Spherical' },
  { name: 'Anamorphic 50mm', kind: 'Anamorphic' },
  { name: 'Spherical Prime 35mm', kind: 'Spherical' },
  { name: 'Macro 100mm', kind: 'Macro' },
  { name: 'Wide 16mm', kind: 'Spherical' },
  { name: 'Telephoto 135mm', kind: 'Spherical' },
];

export const FOCAL_LENGTHS = [8, 14, 24, 35, 50, 85, 135];

export const APERTURES = ['f/1.4', 'f/2', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/11'];

export const SHOT_TYPES = [
  'Wide Shot',
  'Medium Shot',
  'Close-Up',
  'Extreme Close-Up',
  'Over-the-Shoulder',
  'Two Shot',
  'POV',
  'Establishing',
];

export const ANGLES = [
  'Eye Level',
  'Low Angle',
  'High Angle',
  'Dutch Tilt',
  "Bird's-Eye",
  "Worm's-Eye",
  'Overhead',
];

export const DEFAULT_TECHNICALS = {
  camera: 'Modular 8K Digital',
  cameraKind: 'Digital',
  lens: 'Creative Tilt Lens',
  lensKind: 'Spherical',
  focalLength: 8,
  aperture: 'f/1.4',
  shotType: '',
  angle: '',
};

// A neutral starter palette so the swatch stack reads before generation.
export const SEED_PALETTE = ['#40394E', '#6E6585', '#9A8FB0', '#C9B6C2', '#2A2533'];

// Curated cinematic palettes used when "Generate" runs without a reference image.
export const CINEMATIC_PALETTES = [
  ['#1B1F3B', '#3A4A8C', '#6C7BC0', '#C9A26B', '#EFE4CF'],
  ['#2A1A12', '#7E3519', '#C85F2E', '#EF7B41', '#F8B58D'],
  ['#10211E', '#234E45', '#3E8174', '#A7C4A0', '#E8E1C8'],
  ['#2B1B2E', '#5E3A5C', '#A85E84', '#E0A3A1', '#F4D9C2'],
  ['#0E1726', '#1F3A52', '#4E6E81', '#C3B299', '#EADBC8'],
];

export const DEFAULT_STORYBOARD = [null, null, null];
