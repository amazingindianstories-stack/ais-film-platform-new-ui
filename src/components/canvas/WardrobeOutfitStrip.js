'use client';

import { useEffect, useMemo, useState } from 'react';
import { normalizeName, stop } from './entityConfig';
import { resolveAssetUrl } from '@/utils/mediaFallback';

function imageList(outfit) {
  const images = Array.isArray(outfit?.images) ? outfit.images : [];
  const primary = outfit?.image_url || outfit?.imageUrl || outfit?.url;
  if (!primary || images.some((img) => img?.url === primary || img?.path === outfit?.image_path)) return images;
  return [{ url: primary, path: outfit?.image_path || '' }, ...images];
}

function outfitKey(outfit, prefix, index) {
  return outfit?.outfit_id || outfit?.id || outfit?.image_path || `${prefix}-${normalizeName(outfit?.outfit_name || outfit?.name)}-${index}`;
}

function matchesCharacter(outfit, characterName, characterId) {
  const name = normalizeName(characterName);
  const id = normalizeName(characterId);
  return (
    (id && normalizeName(outfit?.character_id || outfit?.id) === id)
    || (name && normalizeName(outfit?.character_name || outfit?.name) === name)
  );
}

function collectOutfits(wardrobe, characterName, characterId) {
  const rows = Array.isArray(wardrobe) ? wardrobe : [];
  const out = [];
  const seen = new Set();

  rows.forEach((row, rowIndex) => {
    const rowIsCharacter = row?.scope === 'character' || matchesCharacter(row, characterName, characterId);
    const source = rowIsCharacter ? '' : (row?.location_name || row?.name || '');
    (Array.isArray(row?.outfits) ? row.outfits : []).forEach((outfit, outfitIndex) => {
      if (!rowIsCharacter && !matchesCharacter(outfit, characterName, characterId)) return;
      const key = rowIsCharacter
        ? outfitKey(outfit, 'outfit', outfitIndex)
        : `legacy-${normalizeName(source)}-${outfitKey(outfit, 'outfit', outfitIndex)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        key,
        outfitId: rowIsCharacter ? (outfit?.outfit_id || outfit?.id || '') : '',
        outfitName: outfit?.outfit_name || outfit?.name || '',
        description: outfit?.description || outfit?.outfit_description || outfit?.prompt || '',
        images: imageList(outfit),
        source,
      });
    });
  });

  return out;
}

export default function WardrobeOutfitStrip({
  characterId,
  characterName,
  wardrobe = [],
  onSaveWardrobe,
}) {
  const [drafts, setDrafts] = useState({});
  const [localSlots, setLocalSlots] = useState([]);
  const [busyKey, setBusyKey] = useState('');
  const [status, setStatus] = useState('');

  const savedOutfits = useMemo(
    () => collectOutfits(wardrobe, characterName, characterId),
    [characterId, characterName, wardrobe],
  );
  const slots = useMemo(() => [...savedOutfits, ...localSlots], [savedOutfits, localSlots]);
  const signature = savedOutfits.map((slot) => [
    slot.key,
    slot.outfitName,
    slot.description,
    slot.images.map((img) => img?.path || img?.url || '').join(','),
  ].join(':')).join('|');

  useEffect(() => {
    setDrafts((prev) => {
      const next = {};
      savedOutfits.forEach((slot) => {
        next[slot.key] = {
          outfitName: prev[slot.key]?.outfitName ?? slot.outfitName,
          description: prev[slot.key]?.description ?? slot.description,
        };
      });
      localSlots.forEach((slot) => {
        next[slot.key] = prev[slot.key] || {
          outfitName: slot.outfitName,
          description: slot.description,
        };
      });
      return next;
    });
  }, [signature, localSlots, savedOutfits]);

  const addSlot = () => {
    const index = slots.length + 1;
    const key = `new-${Date.now()}-${index}`;
    setLocalSlots((items) => [...items, { key, outfitName: `Outfit ${index}`, description: '', images: [], isLocal: true }]);
    setStatus('');
  };

  const updateDraft = (key, patch) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
  };

  const saveSlot = async (slot, extra = {}) => {
    if (!characterName || !onSaveWardrobe) return;
    const draft = drafts[slot.key] || {};
    const outfitName = (draft.outfitName || slot.outfitName || `Outfit ${slots.indexOf(slot) + 1}`).trim();
    setBusyKey(slot.key);
    setStatus('');
    try {
      await onSaveWardrobe({
        characterId,
        characterName,
        outfitId: slot.outfitId,
        outfitName,
        description: draft.description || '',
        ...extra,
      });
      if (slot.isLocal) setLocalSlots((items) => items.filter((item) => item.key !== slot.key));
      setStatus('Wardrobe saved');
    } catch (error) {
      setStatus(error.message || 'Wardrobe save failed');
    } finally {
      setBusyKey('');
    }
  };

  const handleWheel = (event) => {
    event.stopPropagation();
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY;
  };

  return (
    <div className="wardrobe-outfits" onPointerDown={stop}>
      <div className="wardrobe-outfits__strip" onWheel={handleWheel}>
        {slots.map((slot, index) => {
          const draft = drafts[slot.key] || {};
          const busy = busyKey === slot.key;
          const images = Array.isArray(slot.images) ? slot.images : [];
          const primary = images[0];
          return (
            <section className={`wardrobe-outfit${busy ? ' is-busy' : ''}`} key={slot.key}>
              <label className={`wardrobe-outfit__frame${primary ? ' has-image' : ''}`}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={busy}
                  onChange={(event) => { saveSlot(slot, { files: [...(event.target.files || [])] }); event.target.value = ''; }}
                />
                {primary ? (
                  <>
                    <img src={resolveAssetUrl(primary.url, 'image', index)} alt="" />
                    {images.length > 1 && <span className="wardrobe-outfit__count">+{images.length - 1}</span>}
                    {primary.path && (
                      <button
                        aria-label="Remove wardrobe image"
                        disabled={busy}
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); saveSlot(slot, { removePath: primary.path }); }}
                        type="button"
                      >
                        x
                      </button>
                    )}
                  </>
                ) : (
                  <span>{busy ? 'Saving...' : 'Drop / browse'}</span>
                )}
              </label>
              <input
                className="wardrobe-outfit__name"
                value={draft.outfitName || ''}
                placeholder={`Outfit ${index + 1}`}
                onChange={(event) => updateDraft(slot.key, { outfitName: event.target.value })}
                onBlur={() => saveSlot(slot)}
              />
              <textarea
                className="wardrobe-outfit__notes"
                value={draft.description || ''}
                placeholder="Outfit notes"
                onChange={(event) => updateDraft(slot.key, { description: event.target.value })}
                onBlur={() => saveSlot(slot)}
              />
            </section>
          );
        })}
        <button className="wardrobe-outfit wardrobe-outfit--add" onClick={addSlot} type="button">
          <span>+</span>
          <strong>Outfit</strong>
        </button>
      </div>
      {status && <div className="wardrobe-outfits__status">{status}</div>}
    </div>
  );
}
