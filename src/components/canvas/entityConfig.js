// Per-entity copy/behaviour for the shared canvas template + card components.
// Characters use a wardrobe strip; locations use an "angles" strip (spatial data).
export const ENTITY_CONFIG = {
  characters: {
    referenceLabel: 'Character Reference',
    bioLabel: 'Character Bio',
    secondaryLabel: 'Character Wardrobe',
    secondaryKind: 'wardrobe',
    secondaryField: 'wardrobe_images',
    namePlaceholder: 'CHARACTER NAME',
    bioPlaceholder: 'Character description…',
    referenceHint: 'Drop / browse character images',
    secondaryHint: 'Drop / browse wardrobe images',
    nameError: 'Name the character first',
    nextAlt: 'Show next character reference image',
    generateVerb: 'Generate Character',
    generatingVerb: 'Purifying character…',
    doneSub: 'Identity locked · in knowledge base',
    doneFallback: 'Character',
    cardAction: 'Character Card',
    agentActions: [
      { id: 'full-character', label: 'Generate full character' },
      { id: 'character', label: 'Generate character' },
      { id: 'wardrobe', label: 'Generate wardrobe' },
    ],
  },
  locations: {
    referenceLabel: 'Location Reference',
    bioLabel: 'Location Bio',
    secondaryLabel: 'Location Angles',
    secondaryKind: 'angle',
    secondaryField: 'angle_images',
    namePlaceholder: 'LOCATION NAME',
    bioPlaceholder: 'Location description…',
    referenceHint: 'Drop / browse location images',
    secondaryHint: 'Drop / browse angle images (different viewpoints)',
    nameError: 'Name the location first',
    nextAlt: 'Show next location reference image',
    generateVerb: 'Generate Location',
    generatingVerb: 'Mapping location…',
    doneSub: 'Spatial map locked · in knowledge base',
    doneFallback: 'Location',
    cardAction: 'Location Card',
    agentActions: [
      { id: 'full-location', label: 'Generate full location' },
      { id: 'location', label: 'Generate location' },
      { id: 'angles', label: 'Generate angles' },
    ],
  },
};

export const entityConfig = (entityType) => ENTITY_CONFIG[entityType] || ENTITY_CONFIG.characters;

export const stop = (event) => event.stopPropagation();
export const normalizeName = (value) => String(value || '').trim().toLowerCase();
export const referenceSlot = (index) => ['main', 'left', 'right', 'back-left', 'back-right'][index] || 'back-right';

export function mediaKey(items = []) {
  return items.map((item) => item?.path || item?.url || '').join('|');
}

export function rotateItems(items = [], offset = 0) {
  if (!items.length) return [];
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}
