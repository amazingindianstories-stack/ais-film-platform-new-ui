'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaKey, normalizeName, referenceSlot, rotateItems, stop } from './entityConfig';
import WardrobeOutfitStrip from './WardrobeOutfitStrip';
import { resolveAssetUrl } from '@/utils/mediaFallback';

/* Functional template shared by Characters and Locations:
   ┌──────────────────────┬───────────────────┐
   │  <reference> images   │   name + bio      │
   ├──────────────────────┴───────────────────┤
   │   <secondary> strip (wardrobe | angles)    │
   └────────────────────────────────────────────┘
   `config` supplies the labels + the secondary strip's kind/field, so locations
   reuse the exact character logic with "angles" instead of "wardrobe". */
export default function EntityTemplate({
  template, entity, projectId, config,
  onSave, onRename, onPointerDown, onDelete, onFocus, onWireDrag,
  selected, showToolbar = selected, showPort, pushY = 0, viewportScale = 1,
  wardrobe = [], onSaveWardrobe,
}) {
  const secondaryField = config.secondaryField;
  const secondaryKind = config.secondaryKind;

  const savedName = entity?.name || template.sourceName || template.name || '';
  const savedBio = entity?.description || '';
  const savedImages = useMemo(() => (Array.isArray(entity?.images) ? entity.images : []), [entity?.images]);
  const savedSecondary = useMemo(() => (
    Array.isArray(entity?.[secondaryField]) ? entity[secondaryField] : []
  ), [entity, secondaryField]);
  const savedImageKey = mediaKey(savedImages);
  const savedSecondaryKey = mediaKey(savedSecondary);
  const lastSyncedRef = useRef({ bio: savedBio, imageKey: savedImageKey, name: savedName, secondaryKey: savedSecondaryKey });
  const [name, setName] = useState(savedName);
  const [bio, setBio] = useState(savedBio);
  const [images, setImages] = useState(savedImages);
  const [secondary, setSecondary] = useState(savedSecondary);
  const [referenceOffset, setReferenceOffset] = useState(0);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');

  const canSave = Boolean(projectId && name.trim());
  const queuedImages = useMemo(() => rotateItems(images, referenceOffset), [images, referenceOffset]);

  useEffect(() => {
    const previous = lastSyncedRef.current;
    lastSyncedRef.current = { bio: savedBio, imageKey: savedImageKey, name: savedName, secondaryKey: savedSecondaryKey };
    setImages(savedImages);
    setSecondary(savedSecondary);
    setName((current) => (normalizeName(current) === normalizeName(previous.name) ? savedName : current));
    setBio((current) => (current === previous.bio ? savedBio : current));
  }, [savedBio, savedImageKey, savedImages, savedName, savedSecondary, savedSecondaryKey]);

  useEffect(() => {
    setReferenceOffset((current) => (images.length ? current % images.length : 0));
  }, [images.length]);

  const persist = async (payload) => {
    if (!canSave) {
      setStatus(projectId ? config.nameError : 'Open a saved project first');
      return null;
    }
    const res = await onSave({ name: name.trim(), ...payload });
    const saved = res?.entity || res?.character || res?.location;
    if (saved) {
      setImages(saved.images || []);
      setSecondary(saved[secondaryField] || []);
      // Keep the canvas node's name in sync so a wired card knows what it feeds.
      onRename?.(name.trim());
    }
    return res;
  };

  const handleFiles = async (fileList, kind) => {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length) return;
    setStatus('');
    setBusy(kind);
    try {
      for (let i = 0; i < files.length; i++) {
        if (files.length > 1) setStatus(`Uploading ${i + 1} of ${files.length}…`);
        await persist({ kind, files: [files[i]] });
      }
      setStatus('Saved');
    } catch (error) {
      setStatus(error.message || 'Upload failed');
    } finally {
      setBusy('');
    }
  };

  const handleDragOver = (event) => { event.preventDefault(); event.stopPropagation(); };
  const handleDrop = (event, kind) => { event.preventDefault(); event.stopPropagation(); handleFiles(event.dataTransfer?.files, kind); };

  const cycleReferenceStack = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (images.length < 2) return;
    setReferenceOffset((current) => (current + 1) % images.length);
  };

  const removeImage = async (img, kind) => {
    if (!img?.path) return;
    setStatus('');
    setBusy(kind);
    try {
      await persist({ removePath: img.path });
      setStatus('Removed');
    } catch (error) {
      setStatus(error.message || 'Remove failed');
    } finally {
      setBusy('');
    }
  };

  const saveText = async () => {
    const unchangedBio = bio === (entity?.description || '');
    const unchangedName = normalizeName(name) === normalizeName(savedName);
    if (busy || (unchangedBio && unchangedName)) return;
    if (!canSave) {
      setStatus(projectId ? config.nameError : 'Open a saved project first');
      return;
    }
    setBusy('text');
    try {
      await persist({ bio });
      setStatus('Saved');
    } catch (error) {
      setStatus(error.message || 'Save failed');
    } finally {
      setBusy('');
    }
  };

  const handleStripWheel = (event) => {
    event.stopPropagation();
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.currentTarget.scrollLeft += event.deltaY;
    }
  };

  return (
    <article
      className={`entity-template entity-template--character${selected ? ' entity-template--selected' : ''}`}
      data-template-card
      onPointerDown={(event) => onPointerDown(event, template)}
      style={{ '--template-x': template.x, '--template-y': template.y, marginTop: `${pushY}rem` }}
    >
      {showToolbar && (
        <div className="entity-template__toolbar" onPointerDown={stop}
          style={{ transform: `scale(${1 / Math.max(viewportScale, 0.01)})`, transformOrigin: 'bottom right' }}>
          <button type="button" className="entity-template__tool" title="Fit to window" aria-label="Fit to window" onClick={onFocus}>⤢</button>
          <button type="button" className="entity-template__tool entity-template__tool--danger" title="Delete template" aria-label="Delete template" onClick={onDelete}>×</button>
        </div>
      )}

      {showPort && (
        <button className="entity-port entity-port--output" title="Drag to a card to connect"
          onPointerDown={(e) => onWireDrag(e, template.id, true)}
          style={{ transform: `scale(${1 / Math.max(viewportScale, 0.01)})` }}>
          +
        </button>
      )}

      <div className="entity-template__top">
        <section className="entity-template__panel entity-template__panel--refs">
          <h2>{config.referenceLabel}</h2>
          <label
            className={`entity-drop entity-drop--reference${images.length ? ' entity-drop--has-media' : ''}`}
            onDragOver={handleDragOver}
            onDrop={(event) => handleDrop(event, 'reference')}
            onPointerDown={stop}
          >
            <input
              type="file" accept="image/*" multiple className="entity-drop__input"
              disabled={busy === 'reference'}
              onChange={(event) => { handleFiles(event.target.files, 'reference'); event.target.value = ''; }}
            />
            {images.length ? (
              <span className="entity-reference-stage">
                <span className="entity-reference-hero">
                  {queuedImages.slice(0, 5).map((img, i) => {
                    const isFront = i === 0 && images.length > 1;
                    const CardTag = isFront ? 'button' : 'span';
                    return (
                      <CardTag
                        type={isFront ? 'button' : undefined}
                        className={`entity-reference-card entity-reference-card--${referenceSlot(i)}`}
                        key={img.path || img.url || i}
                        aria-label={isFront && images.length > 1 ? config.nextAlt : undefined}
                        onClick={isFront ? cycleReferenceStack : undefined}
                        onPointerDown={isFront ? stop : undefined}
                      >
                        <img src={resolveAssetUrl(img.url, 'image', i)} alt="" className="entity-reference-image" loading="eager" decoding="async" />
                        {images.length === 1 && (
                          <button type="button" className="entity-thumb-del entity-thumb-del--reference"
                            aria-label="Remove image" disabled={busy === 'reference'} onPointerDown={stop}
                            onClick={(event) => { event.preventDefault(); event.stopPropagation(); removeImage(img, 'reference'); }}>×</button>
                        )}
                      </CardTag>
                    );
                  })}
                </span>
                {images.length > 1 && (
                  <span className="entity-reference-strip" onWheel={handleStripWheel}>
                    {queuedImages.slice(0, 12).map((img, i) => (
                      <span
                        className={`entity-reference-mini${i === 0 ? ' entity-reference-mini--active' : ''}`}
                        key={img.path || img.url || i}
                        role="button" tabIndex={0}
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setReferenceOffset((current) => (current + i) % images.length); }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault(); event.stopPropagation();
                          setReferenceOffset((current) => (current + i) % images.length);
                        }}
                        onPointerDown={stop}
                      >
                        <img src={resolveAssetUrl(img.url, 'image', i)} alt="" className="entity-reference-mini-img" loading="eager" decoding="async" />
                        <button type="button" className="entity-thumb-del entity-thumb-del--mini"
                          aria-label="Remove image" disabled={busy === 'reference'} onPointerDown={stop}
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); removeImage(img, 'reference'); }}>×</button>
                      </span>
                    ))}
                  </span>
                )}
              </span>
            ) : (
              <span className="entity-drop__hint">{busy === 'reference' ? 'Uploading…' : config.referenceHint}</span>
            )}
          </label>
        </section>

        <section className="entity-template__panel entity-template__panel--bio">
          <h2>{config.bioLabel}</h2>
          <div className="entity-bio-wrap">
            <input className="entity-name-input" value={name} placeholder={config.namePlaceholder}
              onPointerDown={stop} onChange={(event) => setName(event.target.value)} onBlur={saveText} />
            <textarea className="entity-bio-input" value={bio} placeholder={config.bioPlaceholder}
              onPointerDown={stop} onWheel={stop} onChange={(event) => setBio(event.target.value)} onBlur={saveText} />
          </div>
        </section>
      </div>

      <section className="entity-template__panel entity-template__panel--wardrobe">
        <h2>{secondaryKind === 'wardrobe' && onSaveWardrobe ? 'Wardrobe' : config.secondaryLabel}</h2>
        {secondaryKind === 'wardrobe' && onSaveWardrobe ? (
          <WardrobeOutfitStrip
            characterId={entity?.id}
            characterName={name.trim()}
            wardrobe={wardrobe}
            onSaveWardrobe={onSaveWardrobe}
          />
        ) : (
          <label
            className={`entity-drop entity-drop--strip${secondary.length ? ' entity-drop--has-media' : ''}`}
            onDragOver={handleDragOver}
            onDrop={(event) => handleDrop(event, secondaryKind)}
            onPointerDown={stop}
          >
            <input
              type="file" accept="image/*" multiple className="entity-drop__input"
              disabled={busy === secondaryKind}
              onChange={(event) => { handleFiles(event.target.files, secondaryKind); event.target.value = ''; }}
            />
            {secondary.length ? (
              <span className="entity-thumbs entity-thumbs--strip" onWheel={handleStripWheel}>
                {secondary.slice(0, 8).map((img, i) => (
                  <span className="entity-thumb-wrap entity-thumb-wrap--wide" key={img.path || img.url || i}>
                    <img src={resolveAssetUrl(img.url, 'image', i)} alt="" className="entity-thumb entity-thumb--wide" />
                    <button type="button" className="entity-thumb-del" aria-label="Remove image"
                      disabled={busy === secondaryKind} onPointerDown={stop}
                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); removeImage(img, secondaryKind); }}>×</button>
                  </span>
                ))}
              </span>
            ) : (
              <span className="entity-drop__hint">{busy === secondaryKind ? 'Uploading…' : config.secondaryHint}</span>
            )}
          </label>
        )}
      </section>

      {status && (
        <div className="entity-template__footer" onPointerDown={stop}>
          <span className="entity-template__status">{status}</span>
        </div>
      )}
    </article>
  );
}
