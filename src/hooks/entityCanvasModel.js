const TEMPLATE_WIDTH = 51.5;
const TEMPLATE_HEIGHT = 29;
const CARD_WIDTH = 26;
const CARD_HEIGHT = 29;
const PAIR_GAP = 3.5;
const GRID_GAP_X = 3.5;
const GRID_GAP_Y = 2.5;
const CARD_STACK_GAP = 1.25;

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.2;
const DEFAULT_VIEWPORT = { x: 5, y: 8, scale: 0.82 };

export {
  CARD_HEIGHT,
  CARD_WIDTH,
  DEFAULT_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
};

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function rootRem() {
  if (typeof window === 'undefined') return 16;
  return Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
}

const cardTypeFor = (type) => (type === 'characters' ? 'character_card' : 'location_card');

export const isCardNode = (node) => node?.type === 'character_card' || node?.type === 'location_card';

export function makeNodePair(type, name, index) {
  const columns = 2;

  const basePath = type === 'characters' ? 'Character' : 'Location';
  const nodeName = name || `${basePath} ${index + 1}`;

  const templateId = `${type}-template-${name || 'template'}-${index}-${Date.now()}`;
  const cardId = `${type}-card-${name || 'card'}-${index}-${Date.now()}`;

  const x = (index % columns) * (TEMPLATE_WIDTH + PAIR_GAP + CARD_WIDTH + GRID_GAP_X);
  const y = Math.floor(index / columns) * (TEMPLATE_HEIGHT + GRID_GAP_Y);

  const templateNode = {
    id: templateId,
    type: 'template',
    entityType: type,
    name: nodeName,
    sourceName: name || '',
    x,
    y,
    referenceSlots: type === 'characters' ? 8 : 6,
    detailSlots: type === 'characters' ? 8 : 6,
    bio: '',
  };

  const cardNode = {
    id: cardId,
    type: cardTypeFor(type),
    entityType: type,
    name: `${nodeName} Output`,
    x: x + TEMPLATE_WIDTH + PAIR_GAP,
    y,
    status: 'empty',
  };

  return {
    edges: [{ id: `edge-${templateId}-${cardId}`, source: templateId, target: cardId }],
    nodes: [templateNode, cardNode],
  };
}

export function makeStandaloneCard(type, index, existingNodes) {
  const x = existingNodes.length ? Math.max(...existingNodes.map((node) => node.x)) + TEMPLATE_WIDTH + PAIR_GAP : 0;
  const y = existingNodes.length
    ? Math.max(...existingNodes.map((node) => node.y)) + Math.max(TEMPLATE_HEIGHT, CARD_HEIGHT) + GRID_GAP_Y
    : 0;
  const base = type === 'characters' ? 'Character' : 'Location';

  return {
    id: `${type}-card-standalone-${index}-${Date.now()}`,
    type: cardTypeFor(type),
    entityType: type,
    name: `${base} ${index + 1}`,
    x,
    y,
    status: 'empty',
  };
}

export function rearrangeCanvasNodes(nodes, edges) {
  const sourceToTargets = new Map();
  const pairedCards = new Set();
  edges.forEach((edge) => {
    const list = sourceToTargets.get(edge.source) || [];
    list.push(edge.target);
    sourceToTargets.set(edge.source, list);
    pairedCards.add(edge.target);
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const templates = nodes.filter((node) => node.type === 'template');
  const standaloneCards = nodes.filter((node) => isCardNode(node) && !pairedCards.has(node.id));
  const pairWidth = TEMPLATE_WIDTH + PAIR_GAP + CARD_WIDTH;
  const columns = templates.length >= 7 ? 3 : templates.length > 1 ? 2 : 1;

  const placed = new Map();
  templates.forEach((template, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * (pairWidth + GRID_GAP_X);
    const y = row * (TEMPLATE_HEIGHT + GRID_GAP_Y);
    placed.set(template.id, { x, y });
    (sourceToTargets.get(template.id) || []).forEach((cardId, cardIndex) => {
      const card = byId.get(cardId);
      if (card && isCardNode(card)) {
        placed.set(card.id, { x: x + TEMPLATE_WIDTH + PAIR_GAP, y: y + cardIndex * (CARD_HEIGHT + CARD_STACK_GAP) });
      }
    });
  });

  const cardStartRow = Math.ceil(templates.length / columns);
  const standaloneColumns = templates.length ? columns : Math.min(Math.max(standaloneCards.length, 1), 4);
  standaloneCards.forEach((card, index) => {
    const col = index % standaloneColumns;
    const row = cardStartRow + Math.floor(index / standaloneColumns);
    placed.set(card.id, {
      x: templates.length ? col * (pairWidth + GRID_GAP_X) + TEMPLATE_WIDTH + PAIR_GAP : col * (CARD_WIDTH + GRID_GAP_X),
      y: row * (CARD_HEIGHT + GRID_GAP_Y),
    });
  });

  return nodes.map((node) => (placed.has(node.id) ? { ...node, ...placed.get(node.id) } : node));
}

export function seededNodes(type, names) {
  const nodes = [];
  const edges = [];
  names.forEach((name, index) => {
    const pair = makeNodePair(type, name, index);
    nodes.push(...pair.nodes);
    edges.push(...pair.edges);
  });
  return { nodes, edges };
}

const normName = (value) => String(value || '').trim().toLowerCase();

export function sameNames(a = [], b = []) {
  return a.length === b.length && a.every((name, index) => normName(name) === normName(b[index]));
}

function pruneGraphToNames(nodes, edges, names) {
  const allowed = new Set((names || []).map(normName).filter(Boolean));
  if (!allowed.size) return { nodes, edges };
  const dropIds = new Set();
  nodes.forEach((node) => {
    if (node.type === 'template' && node.sourceName && !allowed.has(normName(node.sourceName))) dropIds.add(node.id);
    if (isCardNode(node) && node.entityName && !allowed.has(normName(node.entityName))) dropIds.add(node.id);
  });
  if (!dropIds.size) return { nodes, edges };
  edges.forEach((edge) => { if (dropIds.has(edge.source)) dropIds.add(edge.target); });
  return {
    nodes: nodes.filter((node) => !dropIds.has(node.id)),
    edges: edges.filter((edge) => !dropIds.has(edge.source) && !dropIds.has(edge.target)),
  };
}

export function mergeNames(existingNodes, existingEdges, type, names, options = {}) {
  const scoped = options.pruneToNames ? pruneGraphToNames(existingNodes, existingEdges, names) : {
    nodes: existingNodes,
    edges: existingEdges,
  };
  const have = new Set(
    scoped.nodes
      .filter((node) => node.type === 'template')
      .map((template) => normName(template.sourceName))
      .filter(Boolean),
  );
  const newNodes = [...scoped.nodes];
  const newEdges = [...scoped.edges];

  const additions = (names || []).filter((name) => name && !have.has(normName(name)));
  additions.forEach((name, i) => {
    const templateCount = newNodes.filter((node) => node.type === 'template').length;
    const pair = makeNodePair(type, name, templateCount + i);
    newNodes.push(...pair.nodes);
    newEdges.push(...pair.edges);
  });

  return { nodes: newNodes, edges: newEdges };
}

export function canvasStateFromStorage(type, names, key, options = {}) {
  const restored = loadCanvas(key);
  if (restored) {
    const merged = mergeNames(restored.nodes, restored.edges, type, names, options);
    return { ...merged, viewport: restored.viewport || { ...DEFAULT_VIEWPORT }, restored: true };
  }
  return { ...seededNodes(type, names || []), viewport: { ...DEFAULT_VIEWPORT }, restored: false };
}

export function loadCanvas(key) {
  if (!key || typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    let nodes = [];
    let edges = [];

    if (Array.isArray(parsed?.nodes)) {
      nodes = parsed.nodes;
      edges = Array.isArray(parsed.edges) ? parsed.edges : [];
    } else if (Array.isArray(parsed?.templates)) {
      nodes = parsed.templates.map((template) => ({ ...template, type: 'template' }));
    } else {
      return null;
    }

    if (!nodes.length) return null;
    return { nodes, edges, viewport: parsed.viewport || null };
  } catch {
    return null;
  }
}

export function getNodeBounds(nodes) {
  if (!nodes.length) {
    return {
      minX: -TEMPLATE_WIDTH / 2,
      minY: -TEMPLATE_HEIGHT / 2,
      maxX: TEMPLATE_WIDTH / 2,
      maxY: TEMPLATE_HEIGHT / 2,
    };
  }

  return nodes.reduce((bounds, node) => {
    const width = isCardNode(node) ? CARD_WIDTH : TEMPLATE_WIDTH;
    const height = isCardNode(node) ? CARD_HEIGHT : TEMPLATE_HEIGHT;
    return {
      minX: Math.min(bounds.minX, node.x),
      minY: Math.min(bounds.minY, node.y),
      maxX: Math.max(bounds.maxX, node.x + width),
      maxY: Math.max(bounds.maxY, node.y + height),
    };
  }, {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });
}

export function getNodeSize(node) {
  return {
    width: isCardNode(node) ? CARD_WIDTH : TEMPLATE_WIDTH,
    height: isCardNode(node) ? CARD_HEIGHT : TEMPLATE_HEIGHT,
  };
}

export function nodeIdsIntersectingBounds(nodes, bounds) {
  return nodes
    .filter((node) => {
      const { height, width } = getNodeSize(node);
      return (
        node.x < bounds.maxX
        && node.x + width > bounds.minX
        && node.y < bounds.maxY
        && node.y + height > bounds.minY
      );
    })
    .map((node) => node.id);
}
