'use client';

import { useEffect, useRef, useState } from 'react';
import { useInfiniteEntityCanvas } from '@/hooks/useInfiniteEntityCanvas';
import EntityTemplate from '@/components/canvas/EntityTemplate';
import EntityCard from '@/components/canvas/EntityCard';
import { entityConfig, normalizeName, stop } from '@/components/canvas/entityConfig';
import AgentCatIcon from '@/components/canvas/AgentCatIcon';

function Minimap({ canvas }) {
  const { bounds, height, width } = canvas.minimap;
  const scale = 8.5 / Math.max(width, height, 1);

  return (
    <div className="entity-minimap" data-canvas-ui aria-hidden="true">
      <div
        className="entity-minimap__world"
        style={{
          '--mini-width': width * scale,
          '--mini-height': height * scale,
        }}
      >
        {canvas.nodes.map((node) => (
          <span
            className="entity-minimap__item"
            key={node.id}
            style={{
              '--mini-x': (node.x - bounds.minX) * scale,
              '--mini-y': (node.y - bounds.minY) * scale,
              '--mini-w': (node.type !== 'template' ? 26 : 51.5) * scale,
              '--mini-h': 29 * scale,
              backgroundColor: node.type !== 'template' ? '#b45b2b' : undefined,
              borderColor: node.type !== 'template' ? '#ff8347' : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function EntityAgentBubble({ template, config, viewportScale = 1 }) {
  const name = template.sourceName || template.name || 'selected template';
  const scale = Math.max(viewportScale || 1, 0.01);

  return (
    <aside
      aria-label={`Generation actions for ${name}`}
      className="entity-agent"
      data-canvas-ui
      onPointerDown={stop}
      role="dialog"
      style={{
        '--agent-x': template.x + (0.35 / scale),
        '--agent-y': template.y - (3.5 / scale),
        '--agent-ui-scale': 1 / scale,
      }}
    >
      <div className="entity-agent__body">
        <AgentCatIcon />
        <div className="entity-agent__dialog" role="group" aria-label="Generation options">
          {config.agentActions.map((action) => (
            <button
              className="entity-agent__option"
              data-agent-action={action.id}
              key={action.id}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerDown={stop}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default function EntityCanvasScreen({
  emptyLabel,
  entities = [],
  entityType,
  names,
  onBack,
  onSaveEntity,
  onGenerateEntity,
  onSaveWardrobe,
  credits,
  canvasProjectId,
  generateCost = 0,
  locations = [],
  projectId,
  route,
  title,
  wardrobe = [],
}) {
  const canvas = useInfiniteEntityCanvas({ entityType, names, projectId: canvasProjectId || projectId, route });
  const config = entityConfig(entityType);
  const entityByName = new Map((entities || []).map((entity) => [normalizeName(entity?.name), entity]));
  const isDemo = !projectId || String(projectId).startsWith('demo-');
  const hasCredits = !Number.isFinite(credits) || credits >= generateCost;

  // The entity (by name) feeding a given card via its incoming link, if any.
  const linkedNameFor = (cardId) => {
    const edge = canvas.edges.find((e) => e.target === cardId);
    if (!edge) return '';
    const src = canvas.nodes.find((n) => n.id === edge.source && n.type === 'template');
    return src ? (src.sourceName || src.name || '') : '';
  };

  // Orchestrate a card generation: flip status, call the backend, settle status.
  const generateForCard = async (card, entityName) => {
    if (!onGenerateEntity || !entityName) return;
    canvas.patchNode(card.id, { status: 'generating', error: '' });
    try {
      await onGenerateEntity(entityName);
      canvas.patchNode(card.id, { status: 'generated', entityName, error: '' });
    } catch (err) {
      canvas.patchNode(card.id, { status: 'empty', error: err.message || 'Generation failed' });
    }
  };

  // While a wire is being dragged, reveal the matching ports on every compatible
  // node so the user can see (and aim at) the drop targets.
  const wiring = canvas.draftEdge;
  const singleSelection = canvas.selectedIds.length === 1;
  const selectedIdSet = new Set(canvas.selectedIds);
  const showTemplatePort = (id) => singleSelection && canvas.selectedId === id
    || Boolean(wiring && !wiring.isOutput && wiring.source !== id);
  const showCardPort = (id) => singleSelection && canvas.selectedId === id
    || Boolean(wiring && wiring.isOutput && wiring.source !== id);
  const selectedNode = singleSelection
    ? canvas.nodes.find((node) => node.id === canvas.selectedId) || null
    : null;

  const agentScale = canvas.viewport.scale || 1;
  const agentHeight = 5 / agentScale;
  const agentWidth = 22 / agentScale;

  // Target push for a node given a selected template: nodes above it that overlap
  // the agent bubble's column get pushed up to make room.
  const pushFor = (node, sel) => {
    if (!sel || sel.type !== 'template' || node.id === sel.id) return 0;
    const catLeft = sel.x;
    const catRight = sel.x + agentWidth;
    const tLeft = node.x;
    const tRight = node.x + (node.type !== 'template' ? 26 : 51.5);
    if (catLeft < tRight && catRight > tLeft && node.y < sel.y) return -agentHeight;
    return 0;
  };

  // Animate the push with the same easing the cards use and drive BOTH the cards
  // and their edges from it, so links track the cards smoothly (no snapping).
  const selId = canvas.selectedId;
  const [pushP, setPushP] = useState(1);
  const [fromSel, setFromSel] = useState(null); // selection we're animating away from
  const lastToRef = useRef(selectedNode);       // selection at the previous render
  const prevIdRef = useRef(selId);
  const rafRef = useRef(0);

  useEffect(() => {
    if (prevIdRef.current === selId) return;
    prevIdRef.current = selId;
    setFromSel(lastToRef.current);
    cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3); // ~cubic-bezier(0.16,1,0.3,1)
    setPushP(0);
    const step = (now) => {
      const t = Math.min((now - start) / 400, 1);
      setPushP(ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [selId]);

  useEffect(() => { lastToRef.current = selectedNode; });
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const getPushOffset = (node) => {
    const to = pushFor(node, selectedNode);
    const from = pushFor(node, fromSel);
    return from + (to - from) * pushP;
  };

  return (
    <div className={`screen screen-entity-canvas screen-${entityType}`} data-route={route}>
      <section
        className="entity-canvas-screen"
        onPointerCancel={canvas.finishPointer}
        onPointerDown={canvas.onStagePointerDown}
        onPointerMove={canvas.onStagePointerMove}
        onPointerUp={canvas.finishPointer}
        onWheel={canvas.onWheel}
        ref={canvas.stageRef}
        style={{
          '--canvas-x': canvas.viewport.x,
          '--canvas-y': canvas.viewport.y,
          '--canvas-scale': canvas.viewport.scale,
        }}
      >
        <h1 className="entity-canvas-title" data-anim>{title}</h1>

        {canvas.selectionBox && (
          <div
            className="entity-selection-box"
            aria-hidden="true"
            style={{
              '--select-x': canvas.selectionBox.x,
              '--select-y': canvas.selectionBox.y,
              '--select-w': canvas.selectionBox.width,
              '--select-h': canvas.selectionBox.height,
            }}
          />
        )}

        {Number.isFinite(credits) && (
          <div className="entity-credits" data-canvas-ui data-anim title="Generation credits (placeholder)">
            <span className="entity-credits__gem" aria-hidden="true">◈</span>
            <span className="entity-credits__value">{credits}</span>
            <span className="entity-credits__label">credits</span>
          </div>
        )}

        <div className="entity-canvas-world">
          {/* viewBox makes 1 SVG unit = 1rem (matching node world coords); the box is
              sized/offset to cover the canvas so edge hit-areas are hit-testable. */}
          <svg
            className="entity-canvas-edges"
            viewBox="-2000 -2000 4000 4000"
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', left: '-2000rem', top: '-2000rem', width: '4000rem', height: '4000rem', overflow: 'visible', pointerEvents: 'none' }}
          >
            {canvas.edges.map(edge => {
              const sourceNode = canvas.nodes.find(n => n.id === edge.source);
              const targetNode = canvas.nodes.find(n => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const x1 = sourceNode.x + 51.5;
              // Endpoints must follow the same vertical push applied to the cards
              // when the agent bubble makes room, or the link visually detaches.
              const y1 = sourceNode.y + getPushOffset(sourceNode) + (29 / 2);
              const x2 = targetNode.x;
              const y2 = targetNode.y + getPushOffset(targetNode) + (29 / 2);

              const cx1 = x1 + Math.max(8, (x2 - x1) / 2);
              const cx2 = x2 - Math.max(8, (x2 - x1) / 2);
              const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;

              return (
                <g className="entity-edge" key={edge.id}>
                  <path className="entity-edge__line" d={d} fill="none" stroke="rgba(243, 239, 236, 0.4)" strokeWidth="0.15" />
                  {/* Wide invisible hit area so the thin link is easy to right-click → delete. */}
                  <path
                    className="entity-edge__hit"
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="0.9"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); canvas.removeEdge(edge.id); }}
                  >
                    <title>Right-click to delete link</title>
                  </path>
                </g>
              );
            })}

            {canvas.draftEdge && (() => {
              const { source, isOutput, targetX, targetY } = canvas.draftEdge;
              const sourceNode = canvas.nodes.find(n => n.id === source);
              if (!sourceNode) return null;

              let x1, y1, x2, y2, cx1, cx2;

              const sourcePush = getPushOffset(sourceNode);
              if (isOutput) {
                x1 = sourceNode.x + (sourceNode.type !== 'template' ? 26 : 51.5);
                y1 = sourceNode.y + sourcePush + (29 / 2);
                x2 = targetX;
                y2 = targetY;
              } else {
                x1 = targetX;
                y1 = targetY;
                x2 = sourceNode.x;
                y2 = sourceNode.y + sourcePush + (29 / 2);
              }

              cx1 = x1 + Math.max(8, (x2 - x1) / 2);
              cx2 = x2 - Math.max(8, (x2 - x1) / 2);

              return (
                <path
                  d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--jaffa-400)"
                  strokeWidth="0.25"
                  strokeDasharray="0.5 0.5"
                />
              );
            })()}
          </svg>
          {canvas.nodes.map((node) => {
            if (node.type !== 'template') {
              const linkedName = linkedNameFor(node.id);
              return (
                <EntityCard
                  key={node.id}
                  card={node}
                  config={config}
                  selected={selectedIdSet.has(node.id)}
                  showToolbar={singleSelection && canvas.selectedId === node.id}
                  showPort={showCardPort(node.id)}
                  pushY={getPushOffset(node)}
                  viewportScale={canvas.viewport.scale}
                  linkedName={linkedName}
                  cost={generateCost}
                  canGenerate={Boolean(linkedName) && !isDemo && hasCredits && node.status !== 'generating'}
                  onGenerate={() => generateForCard(node, linkedName)}
                  onPointerDown={canvas.startNodeDrag}
                  onDelete={() => canvas.removeNode(node.id)}
                  onFocus={() => canvas.focusNode(node)}
                  onWireDrag={canvas.startWireDrag}
                />
              );
            }
            return (
              <EntityTemplate
                key={node.id}
                template={node}
                entity={entityByName.get(normalizeName(node.sourceName || node.name))}
                projectId={projectId}
                config={config}
                selected={selectedIdSet.has(node.id)}
                showToolbar={singleSelection && canvas.selectedId === node.id}
                showPort={showTemplatePort(node.id)}
                pushY={getPushOffset(node)}
                viewportScale={canvas.viewport.scale}
                locations={locations}
                wardrobe={wardrobe}
                onSaveWardrobe={onSaveWardrobe}
                onSave={onSaveEntity}
                onRename={(name) => canvas.patchNode(node.id, { sourceName: name })}
                onPointerDown={canvas.startNodeDrag}
                onDelete={() => canvas.removeNode(node.id)}
                onFocus={() => canvas.focusNode(node)}
                onWireDrag={canvas.startWireDrag}
              />
            );
          })}
          {selectedNode && selectedNode.type === 'template' && (
            <EntityAgentBubble
              template={selectedNode}
              config={config}
              viewportScale={canvas.viewport.scale}
            />
          )}
        </div>

        {!canvas.nodes.length && <div className="entity-canvas-empty">{emptyLabel}</div>}

        <div className="entity-canvas-actions" data-canvas-ui data-anim>
          <button className="entity-canvas-action" onClick={canvas.addTemplate} type="button">
            <span aria-hidden="true">+</span>
            <span>Template</span>
          </button>
          <button className="entity-canvas-action" onClick={canvas.addCard} type="button">
            <span aria-hidden="true">+</span>
            <span>{config.cardAction}</span>
          </button>
          <button className="entity-canvas-action" onClick={onBack} type="button">
            <span aria-hidden="true">⌂</span>
            <span>Brain</span>
          </button>
        </div>

        {canvas.showMinimap && <Minimap canvas={canvas} />}
      </section>
    </div>
  );
}
