'use client';

import UploadSlot from '@/components/shot/UploadSlot';
import ColourPalette from '@/components/shot/ColourPalette';
import Storyboard from '@/components/shot/Storyboard';

// Story (mood) tab: colour palette + reference, lighting reference, and the
// storyboard strip. Composition is intentionally omitted per spec.
export default function StoryTab({ data }) {
  const { palette, media, paletteBusy } = data;

  return (
    <div className="story-tab">
      <div className="story-tab__top">
        <section className="story-col story-col--palette">
          <header className="story-col__head">Colour Palette</header>
          <UploadSlot
            className="story-col__ref"
            image={media.paletteImage}
            onSelect={(file) => data.setImage('paletteImage', file)}
            onClear={() => data.clearImage('paletteImage')}
            hint="Reference"
          />
          <ColourPalette colors={palette} onGenerate={data.generatePalette} busy={paletteBusy} />
        </section>

        <section className="story-col story-col--lighting">
          <header className="story-col__head">Lighting</header>
          <UploadSlot
            className="story-col__fill"
            image={media.lightingImage}
            onSelect={(file) => data.setImage('lightingImage', file)}
            onClear={() => data.clearImage('lightingImage')}
            label="Lighting"
            hint="Drop / browse"
          />
        </section>
      </div>

      <Storyboard
        frames={media.storyboard}
        onUpload={data.uploadFrame}
        onClear={data.clearFrame}
        onGenerate={data.generateFrame}
        onAdd={data.addFrame}
      />
    </div>
  );
}
