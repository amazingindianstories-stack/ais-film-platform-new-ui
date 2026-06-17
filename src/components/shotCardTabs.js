// The four faces of a shot card, surfaced as the bottom tab strip. Each shot
// owns this set. `actions` are the contextual icon buttons shown on the active
// tab's bar (see ShotCard); their ids are handled by the card.
export const SHOT_TABS = [
  {
    id: 'story',
    label: 'Story',
    hint: 'Colour, lighting & storyboard',
    actions: [
      { id: 'upload', icon: 'image', title: 'Upload storyboard frame' },
      { id: 'generate', icon: 'generate', title: 'Generate palette' },
    ],
  },
  {
    id: 'technicals',
    label: 'Technicals',
    hint: 'Camera, lens, framing & script',
    leadActions: [{ id: 'script', icon: 'pencil', title: 'Edit script' }],
    actions: [],
  },
  {
    id: 'images',
    label: 'Images',
    hint: 'Generated frames',
    actions: [{ id: 'generate', icon: 'generate', title: 'Generate images' }],
  },
  { id: 'videos', label: 'Videos', hint: 'Rendered clips', actions: [] },
];

export const DEFAULT_SHOT_TAB = SHOT_TABS[0].id;

export const shotTab = (id) => SHOT_TABS.find((tab) => tab.id === id) || SHOT_TABS[0];
