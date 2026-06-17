'use client';

import { useRef } from 'react';
import { stop } from '@/components/canvas/entityConfig';
import SettingCell from '@/components/shot/SettingCell';
import { CameraIcon, LensIcon, ApertureIcon, FocalIcon } from '@/components/shot/icons';
import {
  CAMERAS, LENSES, FOCAL_LENGTHS, APERTURES, SHOT_TYPES, ANGLES,
} from '@/components/shot/shotCardOptions';

const cameraOpts = CAMERAS.map((c) => ({ value: c.name, label: c.name, sub: c.kind }));
const lensOpts = LENSES.map((l) => ({ value: l.name, label: l.name, sub: l.kind }));
const focalOpts = FOCAL_LENGTHS.map((f) => ({ value: f, label: `${f}mm` }));
const apertureOpts = APERTURES.map((a) => ({ value: a, label: a }));

// Technicals tab: camera/lens/exposure cells, framing (shot type + angle), and
// the shot script.
export default function TechnicalsTab({ data, scriptRef }) {
  const { technicals, script } = data;
  const localRef = useRef(null);
  const ref = scriptRef || localRef;

  return (
    <div className="tech-tab">
      <div className="tech-tab__cams">
        <SettingCell
          label="Camera"
          icon={<CameraIcon />}
          value={technicals.camera}
          sub={technicals.cameraKind}
          options={cameraOpts}
          onChange={(opt) => data.setTechnical({ camera: opt.value, cameraKind: opt.sub })}
        />
        <SettingCell
          label="Lens"
          icon={<LensIcon />}
          value={technicals.lens}
          sub={technicals.lensKind}
          options={lensOpts}
          onChange={(opt) => data.setTechnical({ lens: opt.value, lensKind: opt.sub })}
        />
        <SettingCell
          label="Focal Length"
          icon={<FocalIcon />}
          value={technicals.focalLength}
          sub="mm"
          options={focalOpts}
          onChange={(opt) => data.setTechnical({ focalLength: opt.value })}
        />
        <SettingCell
          label="Aperture"
          icon={<ApertureIcon />}
          value={technicals.aperture}
          options={apertureOpts}
          menuAlign="right"
          onChange={(opt) => data.setTechnical({ aperture: opt.value })}
        />
      </div>

      <div className="tech-tab__frame">
        <SettingCell
          variant="large"
          label="Shot Type"
          value={technicals.shotType}
          placeholder="Shot Type"
          options={SHOT_TYPES}
          onChange={(opt) => data.setTechnical({ shotType: opt })}
        />
        <SettingCell
          variant="large"
          label="Angle"
          value={technicals.angle}
          placeholder="Angle"
          options={ANGLES}
          menuAlign="right"
          onChange={(opt) => data.setTechnical({ angle: opt })}
        />
      </div>

      <label className="tech-tab__script" onPointerDown={stop}>
        <span>Script</span>
        <textarea
          ref={ref}
          value={script}
          placeholder="What happens in this shot — action, dialogue, direction…"
          onChange={(event) => data.setScript(event.target.value)}
        />
      </label>
    </div>
  );
}
