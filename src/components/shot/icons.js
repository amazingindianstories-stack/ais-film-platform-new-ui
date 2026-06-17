// Small inline icons for the shot card. Stroke-based, inherit currentColor,
// sized by the surrounding font / explicit width in CSS.
const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const CameraIcon = () => (
  <svg {...base}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.2-1.8h7.6L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);

export const LensIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="3.6" />
    <path d="M12 3.8v2.4M12 17.8v2.4M3.8 12h2.4M17.8 12h2.4" />
  </svg>
);

export const ApertureIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 3.6 8.6 9.5M20 9 13.2 9M18.4 17 13 12.8M6 19l3.4-5.9M4 15l6.8 0M5.6 7 11 11.2" />
  </svg>
);

export const FocalIcon = () => (
  <svg {...base}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const UploadIcon = () => (
  <svg {...base}>
    <path d="M12 16V5M8 9l4-4 4 4" />
    <path d="M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16" />
  </svg>
);

export const ImageIcon = () => (
  <svg {...base}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="m4.5 17 4.5-4.5 3.5 3 3-2.5 4 4" />
  </svg>
);

export const GenerateIcon = () => (
  <svg {...base}>
    <path d="M12 4.5 13.4 9 18 10.4 13.4 11.8 12 16.3 10.6 11.8 6 10.4 10.6 9z" />
    <path d="M18 4v3M19.5 5.5h-3" />
  </svg>
);

export const FilmIcon = () => (
  <svg {...base}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M8 5v14M16 5v14M3.5 9.5h4.5M16 9.5h4.5M3.5 14.5h4.5M16 14.5h4.5" />
  </svg>
);

export const GearIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3.5 12h2M18.5 12h2M5.6 18.4 7 17M17 7l1.4-1.4" />
  </svg>
);

export const PencilIcon = () => (
  <svg {...base}>
    <path d="M14.5 5.5 18.5 9.5 8 20H4v-4z" />
    <path d="M13 7 17 11" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const ChevronIcon = () => (
  <svg {...base}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ICBy = {
  gear: GearIcon,
  image: ImageIcon,
  generate: GenerateIcon,
  film: FilmIcon,
  pencil: PencilIcon,
};

export const actionIcon = (name) => ICBy[name] || GearIcon;
