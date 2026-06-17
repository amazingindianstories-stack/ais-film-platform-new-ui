'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CARD_HEIGHT, CARD_WIDTH, MAX_SCALE, MIN_SCALE, TEMPLATE_HEIGHT, TEMPLATE_WIDTH,
  canvasStateFromStorage, clamp, getNodeBounds, isCardNode, makeNodePair,
  makeStandaloneCard, mergeNames, nodeIdsIntersectingBounds, rearrangeCanvasNodes,
  rootRem, sameNames,
} from './entityCanvasModel';
import {
  BOX_SELECT_DELAY_MS, makePanGesture, panGestureMovedPastThreshold, screenToStagePoint,
  screenToWorldPoint, selectionBoxFromPoints, shouldDeleteCanvasSelection,
  stageBoxToWorldBounds, updatePanVelocity, viewportForPanGesture,
} from './entityCanvasSelection';

export function useInfiniteEntityCanvas({ entityType, names, projectId, route }) {
  const storageKey = projectId ? `aisStudio:canvas:${projectId}:${entityType}` : '';
  const [initialCanvas] = useState(() => canvasStateFromStorage(entityType, names, storageKey, {
    pruneToNames: Array.isArray(names) && names.length > 0,
  }));

  const stageRef = useRef(null);
  const namesRef = useRef(Array.isArray(names) ? names : []);
  const didInitialFitRef = useRef(Boolean(initialCanvas.restored));
  const hydratedKeyRef = useRef(initialCanvas.restored ? storageKey : '');
  const pendingHydrationKeyRef = useRef('');
  const needsProjectScopeRef = useRef(Boolean(storageKey && initialCanvas.restored && !namesRef.current.length));

  const dragRef = useRef(null);
  const panRef = useRef(null);
  const persistRef = useRef(null);
  const momentumRef = useRef(null);
  const selectionTimerRef = useRef(null);

  const [nodes, setNodes] = useState(initialCanvas.nodes);
  const [edges, setEdges] = useState(initialCanvas.edges);

  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showMinimap, setShowMinimap] = useState(false);
  const [viewport, setViewport] = useState(initialCanvas.viewport);
  const [draftEdge, setDraftEdge] = useState(null);
  const [selectionBox, setSelectionBox] = useState(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(viewport);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    viewportRef.current = viewport;
    selectedIdsRef.current = selectedIds;
  });

  useEffect(() => {
    if (!storageKey || hydratedKeyRef.current === storageKey) return;
    const nextNames = Array.isArray(names) ? names : [];
    const pruneToNames = nextNames.length > 0;
    const nextCanvas = canvasStateFromStorage(entityType, nextNames, storageKey, { pruneToNames });
    namesRef.current = nextNames;
    hydratedKeyRef.current = storageKey;
    pendingHydrationKeyRef.current = storageKey;
    needsProjectScopeRef.current = nextCanvas.restored && !pruneToNames;
    didInitialFitRef.current = nextCanvas.restored;
    dragRef.current = null; panRef.current = null;
    setPast([]); setFuture([]);
    setSelectedId(null); setSelectedIds([]);
    setDraftEdge(null); setSelectionBox(null);
    setNodes(nextCanvas.nodes);
    setEdges(nextCanvas.edges);
    setViewport(nextCanvas.viewport);
  }, [storageKey, entityType, names]);

  useEffect(() => {
    const nextNames = Array.isArray(names) ? names : [];
    const pruneToNames = needsProjectScopeRef.current && nextNames.length > 0;
    if (!pruneToNames && sameNames(namesRef.current, nextNames)) return;
    namesRef.current = nextNames;
    if (pruneToNames) needsProjectScopeRef.current = false;

    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const merged = mergeNames(currentNodes, currentEdges, entityType, nextNames, { pruneToNames });
    if (!pruneToNames && merged.nodes.length === currentNodes.length && merged.edges.length === currentEdges.length) return;
    setNodes(merged.nodes);
    setEdges(merged.edges);
  }, [entityType, names]);

  useEffect(() => {
    if (!storageKey || hydratedKeyRef.current !== storageKey) return undefined;
    if (pendingHydrationKeyRef.current === storageKey) {
      pendingHydrationKeyRef.current = '';
      return undefined;
    }
    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ nodes, edges, viewport }));
      } catch { }
    }, 400);
    return () => { if (persistRef.current) clearTimeout(persistRef.current); };
  }, [nodes, edges, viewport, storageKey]);

  const commitGraph = useCallback((nextNodes, nextEdges) => {
    setPast((items) => [...items, { nodes, edges }]);
    setFuture([]);
    setNodes(nextNodes);
    if (nextEdges) setEdges(nextEdges);
  }, [nodes, edges]);

  const cancelMomentum = useCallback(() => {
    if (momentumRef.current != null) {
      cancelAnimationFrame(momentumRef.current);
      momentumRef.current = null;
    }
  }, []);

  const startMomentum = useCallback((vx, vy) => {
    cancelMomentum();
    let velX = vx;
    let velY = vy;
    let lastFrame = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(now - lastFrame, 40);
      lastFrame = now;
      setViewport((current) => ({
        ...current,
        x: current.x + velX * dt,
        y: current.y + velY * dt,
      }));
      const decay = Math.pow(0.92, dt / 16);
      velX *= decay;
      velY *= decay;
      if (Math.hypot(velX, velY) > 0.002) {
        momentumRef.current = requestAnimationFrame(step);
      } else {
        momentumRef.current = null;
      }
    };
    momentumRef.current = requestAnimationFrame(step);
  }, [cancelMomentum]);

  useEffect(() => cancelMomentum, [cancelMomentum]);

  useEffect(() => () => {
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
  }, []);

  const fitView = useCallback(() => {
    cancelMomentum();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rem = rootRem();
    const stageWidth = rect.width / rem;
    const stageHeight = rect.height / rem;
    const bounds = getNodeBounds(nodes);
    const sidePad = 6;
    const topPad = 4.5;
    const bottomPad = 7.5;
    const contentWidth = Math.max(bounds.maxX - bounds.minX, TEMPLATE_WIDTH);
    const contentHeight = Math.max(bounds.maxY - bounds.minY, TEMPLATE_HEIGHT);
    const nextScale = clamp(
      Math.min((stageWidth - sidePad * 2) / contentWidth, (stageHeight - topPad - bottomPad) / contentHeight),
      MIN_SCALE,
      1.15,
    );
    const availableHeight = stageHeight - topPad - bottomPad;
    setViewport({
      x: (stageWidth - contentWidth * nextScale) / 2 - bounds.minX * nextScale,
      y: topPad + (availableHeight - contentHeight * nextScale) / 2 - bounds.minY * nextScale,
      scale: nextScale,
    });
  }, [nodes, cancelMomentum]);

  useEffect(() => {
    if (!nodes.length || didInitialFitRef.current) return;
    didInitialFitRef.current = true;
    requestAnimationFrame(fitView);
  }, [fitView, nodes.length]);

  const addTemplate = useCallback(() => {
    const pair = makeNodePair(entityType, '', nodes.filter(n => n.type === 'template').length);
    commitGraph([...nodes, ...pair.nodes], [...edges, ...pair.edges]);
  }, [commitGraph, entityType, nodes, edges]);

  const addCard = useCallback(() => {
    const newCard = makeStandaloneCard(entityType, nodes.filter(isCardNode).length, nodes);
    commitGraph([...nodes, newCard], edges);
  }, [commitGraph, entityType, nodes, edges]);

  const removeNode = useCallback((id) => {
    const nextNodes = nodes.filter((n) => n.id !== id);
    const nextEdges = edges.filter((e) => e.source !== id && e.target !== id);
    commitGraph(nextNodes, nextEdges);
  }, [commitGraph, nodes, edges]);

  const removeEdge = useCallback((id) => {
    commitGraph(nodesRef.current, edgesRef.current.filter((e) => e.id !== id));
  }, [commitGraph]);

  const patchNode = useCallback((id, patch) => {
    setNodes((current) => current.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const removeSelected = useCallback(() => {
    const selected = new Set(selectedIdsRef.current);
    if (!selected.size) return false;
    commitGraph(
      nodesRef.current.filter((node) => !selected.has(node.id)),
      edgesRef.current.filter((edge) => !selected.has(edge.source) && !selected.has(edge.target)),
    );
    setSelectedId(null);
    setSelectedIds([]);
    return true;
  }, [commitGraph]);

  const focusNode = useCallback((node) => {
    cancelMomentum();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !node) return;
    const rem = rootRem();
    const stageWidth = rect.width / rem;
    const stageHeight = rect.height / rem;
    const sidePad = 4;
    const topPad = 3.4;
    const bottomPad = 6.8;
    const w = isCardNode(node) ? CARD_WIDTH : TEMPLATE_WIDTH;
    const h = isCardNode(node) ? CARD_HEIGHT : TEMPLATE_HEIGHT;
    const nextScale = clamp(
      Math.min((stageWidth - sidePad * 2) / w, (stageHeight - topPad - bottomPad) / h),
      MIN_SCALE,
      MAX_SCALE,
    );
    const availableHeight = stageHeight - topPad - bottomPad;
    setViewport({
      x: (stageWidth - w * nextScale) / 2 - node.x * nextScale,
      y: topPad + (availableHeight - h * nextScale) / 2 - node.y * nextScale,
      scale: nextScale,
    });
  }, [cancelMomentum]);

  const undo = useCallback(() => {
    setPast((items) => {
      if (!items.length) return items;
      const previous = items[items.length - 1];
      setFuture((next) => [{ nodes, edges }, ...next]);
      setNodes(previous.nodes);
      setEdges(previous.edges);
      return items.slice(0, -1);
    });
  }, [nodes, edges]);

  const redo = useCallback(() => {
    setFuture((items) => {
      if (!items.length) return items;
      const [nextState, ...rest] = items;
      setPast((history) => [...history, { nodes, edges }]);
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      return rest;
    });
  }, [nodes, edges]);

  const zoomAt = useCallback((clientX, clientY, factor) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rem = rootRem();
    const localX = (clientX - rect.left) / rem;
    const localY = (clientY - rect.top) / rem;
    setViewport((current) => {
      const nextScale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      const worldX = (localX - current.x) / current.scale;
      const worldY = (localY - current.y) / current.scale;
      return {
        x: localX - worldX * nextScale,
        y: localY - worldY * nextScale,
        scale: nextScale,
      };
    });
  }, []);

  const zoomBy = useCallback((factor) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }, [zoomAt]);

  useEffect(() => {
    const onTool = (event) => {
      if (document.body.dataset.route !== route) return;
      const tool = event.detail?.tool;
      if (tool === 'undo') undo();
      if (tool === 'redo') redo();
      if (tool === 'fit') fitView();
      if (tool === 'minimap') setShowMinimap((value) => !value);
      if (tool === 'rearrange') {
        cancelMomentum();
        commitGraph(rearrangeCanvasNodes(nodesRef.current, edgesRef.current), edgesRef.current);
        setSelectedId(null); setSelectedIds([]);
        setViewport({ x: 5, y: 8, scale: 0.82 });
      }
      if (tool === 'zoom-in') zoomBy(1.16);
      if (tool === 'zoom-out') zoomBy(0.86);
    };
    window.addEventListener('entity-canvas:tool', onTool);
    return () => window.removeEventListener('entity-canvas:tool', onTool);
  }, [cancelMomentum, commitGraph, fitView, redo, route, undo, zoomBy]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (document.body.dataset.route !== route || !shouldDeleteCanvasSelection(event)) return;
      if (removeSelected()) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [removeSelected, route]);

  const screenToWorld = useCallback((clientX, clientY) => {
    return screenToWorldPoint(stageRef.current, viewportRef.current, clientX, clientY);
  }, []);

  const clearSelectionHold = useCallback(() => {
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
      selectionTimerRef.current = null;
    }
  }, []);

  const updateSelectionBox = useCallback((pan, clientX, clientY) => {
    const origin = { x: pan.originX, y: pan.originY };
    const current = screenToStagePoint(stageRef.current, clientX, clientY);
    const nextBox = selectionBoxFromPoints(origin, current);
    pan.selectionBox = nextBox;
    setSelectionBox(nextBox);
  }, []);

  const startBoxSelection = useCallback((pan, clientX, clientY) => {
    clearSelectionHold();
    pan.mode = 'selecting';
    pan.selectionBox = null;
    setSelectionBox({ x: pan.originX, y: pan.originY, width: 0, height: 0 });
    updateSelectionBox(pan, clientX, clientY);
  }, [clearSelectionHold, updateSelectionBox]);

  const onWheel = useCallback((event) => {
    event.preventDefault();
    cancelMomentum();
    const rem = rootRem();
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      zoomAt(event.clientX, event.clientY, factor);
      return;
    }
    setViewport((current) => ({
      ...current,
      x: current.x - event.deltaX / rem,
      y: current.y - event.deltaY / rem,
    }));
  }, [zoomAt, cancelMomentum]);

  const onStagePointerDown = useCallback((event) => {
    if (
      event.button !== 0
      || event.target.closest?.('[data-template-card], [data-character-card], [data-canvas-ui], button')
    ) return;
    cancelMomentum();
    setSelectedId(null);
    setSelectedIds([]);
    setSelectionBox(null);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { }
    const forceBoxSelect = event.shiftKey || event.altKey;
    panRef.current = makePanGesture(event, stageRef.current, viewportRef.current, forceBoxSelect);
    if (forceBoxSelect) {
      startBoxSelection(panRef.current, event.clientX, event.clientY);
      return;
    }
    selectionTimerRef.current = setTimeout(() => {
      const pan = panRef.current;
      if (pan?.pointerId === event.pointerId && pan.mode === 'pending') {
        startBoxSelection(pan, pan.lastX, pan.lastY);
      }
    }, BOX_SELECT_DELAY_MS);
  }, [cancelMomentum, startBoxSelection]);

  const onStagePointerMove = useCallback((event) => {
    const rem = rootRem();
    const pan = panRef.current;
    if (pan?.pointerId === event.pointerId) {
      if (pan.mode === 'pending' && panGestureMovedPastThreshold(pan, event)) {
        clearSelectionHold();
        pan.mode = 'panning';
      }

      if (pan.mode === 'selecting') {
        updateSelectionBox(pan, event.clientX, event.clientY);
        return;
      }

      if (pan.mode === 'pending') return;

      setViewport(viewportForPanGesture(pan, event, updatePanVelocity(pan, event)));
      return;
    }
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;

    if (drag.type === 'wire') {
      const world = screenToWorld(event.clientX, event.clientY);
      setDraftEdge((current) => (current ? { ...current, targetX: world.x, targetY: world.y } : current));
      return;
    }

    const scale = viewportRef.current.scale;
    const dx = (event.clientX - drag.clientX) / rem / scale;
    const dy = (event.clientY - drag.clientY) / rem / scale;
    if (Math.hypot(dx, dy) > 0.08) drag.moved = true;
    const dragIds = new Set(drag.ids || [drag.id]);
    setNodes((current) => current.map((node) => (
      dragIds.has(node.id)
        ? { ...node, x: (drag.startById[node.id]?.x ?? node.x) + dx, y: (drag.startById[node.id]?.y ?? node.y) + dy }
        : node
    )));
  }, [clearSelectionHold, screenToWorld, updateSelectionBox]);

  const finishPointer = useCallback((event) => {
    const pan = panRef.current;
    if (pan?.pointerId === event.pointerId) {
      clearSelectionHold();
      if (pan.mode === 'selecting') {
        const box = pan.selectionBox || selectionBox;
        const hits = box && Math.max(box.width, box.height) > 0.15
          ? nodeIdsIntersectingBounds(nodesRef.current, stageBoxToWorldBounds(box, viewportRef.current))
          : [];
        setSelectedIds(hits);
        setSelectedId(hits[0] || null);
        setSelectionBox(null);
        panRef.current = null;
        return;
      }
      const idleMs = performance.now() - pan.lastT;
      const speed = Math.hypot(pan.vx, pan.vy);
      panRef.current = null;
      if (idleMs < 70 && speed > 0.004) startMomentum(pan.vx, pan.vy);
      return;
    }
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;

    if (drag.type === 'wire') {
      setDraftEdge(null);
      const world = screenToWorld(event.clientX, event.clientY);
      const liveNodes = nodesRef.current;
      const liveEdges = edgesRef.current;

      const targetNode = liveNodes.find((n) => {
        if (n.id === drag.sourceId) return false;
        const w = isCardNode(n) ? CARD_WIDTH : TEMPLATE_WIDTH;
        const h = isCardNode(n) ? CARD_HEIGHT : TEMPLATE_HEIGHT;
        return world.x >= n.x && world.x <= n.x + w && world.y >= n.y && world.y <= n.y + h;
      });

      if (targetNode) {
        const sourceNode = liveNodes.find((n) => n.id === drag.sourceId);
        if (sourceNode) {
          const isSourceTemplate = sourceNode.type === 'template';
          const isTargetTemplate = targetNode.type === 'template';
          if (isSourceTemplate !== isTargetTemplate) {
            const actualSource = isSourceTemplate ? sourceNode.id : targetNode.id;
            const actualTarget = isSourceTemplate ? targetNode.id : sourceNode.id;
            const exists = liveEdges.some((e) => e.source === actualSource && e.target === actualTarget);
            if (!exists) {
              const withoutCardInput = liveEdges.filter((e) => e.target !== actualTarget);
              commitGraph(liveNodes, [
                ...withoutCardInput,
                { id: `edge-${actualSource}-${actualTarget}-${Date.now()}`, source: actualSource, target: actualTarget },
              ]);
            }
          }
        }
      }
      return;
    }

    if (!drag.moved) {
      if (drag.wasGroupDrag) {
        setSelectedId(drag.id);
        setSelectedIds([drag.id]);
      }
      return;
    }

    setPast((items) => [...items, drag.before]);
    setFuture([]);
  }, [clearSelectionHold, commitGraph, screenToWorld, selectionBox, startMomentum]);

  const startNodeDrag = useCallback((event, node) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    cancelMomentum();
    setSelectionBox(null);
    const currentSelection = selectedIdsRef.current;
    const wasGroupDrag = currentSelection.length > 1 && currentSelection.includes(node.id);
    const dragIds = wasGroupDrag ? currentSelection : [node.id];
    if (!wasGroupDrag) {
      setSelectedIds([node.id]);
    }
    setSelectedId(node.id);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { }
    const startById = Object.fromEntries(
      nodesRef.current
        .filter((item) => dragIds.includes(item.id))
        .map((item) => [item.id, { x: item.x, y: item.y }]),
    );
    dragRef.current = {
      id: node.id,
      ids: dragIds,
      type: 'node',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      startById,
      wasGroupDrag,
      before: { nodes: nodesRef.current, edges: edgesRef.current },
    };
  }, [cancelMomentum]);

  const startWireDrag = useCallback((event, sourceNodeId, isOutput) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    cancelMomentum();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { }

    const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;

    dragRef.current = {
      type: 'wire',
      pointerId: event.pointerId,
      sourceId: sourceNodeId,
      isOutput,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    const world = screenToWorld(event.clientX, event.clientY);
    setDraftEdge({ source: sourceNodeId, isOutput, targetX: world.x, targetY: world.y });
  }, [cancelMomentum, screenToWorld]);

  const minimap = useMemo(() => {
    const bounds = getNodeBounds(nodes);
    const width = Math.max(bounds.maxX - bounds.minX, TEMPLATE_WIDTH);
    const height = Math.max(bounds.maxY - bounds.minY, TEMPLATE_HEIGHT);
    return { bounds, width, height };
  }, [nodes]);

  return {
    addTemplate,
    addCard,
    removeNode,
    removeEdge,
    patchNode,
    focusNode,
    selectedId,
    selectedIds,
    selectionBox,
    fitView,
    minimap,
    onStagePointerDown,
    onStagePointerMove,
    onWheel,
    showMinimap,
    stageRef,
    startNodeDrag,
    startWireDrag,
    nodes,
    edges,
    draftEdge,
    viewport,
    finishPointer,
  };
}
