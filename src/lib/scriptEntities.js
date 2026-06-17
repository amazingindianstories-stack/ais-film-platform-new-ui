export function entityName(entity) {
  if (typeof entity === 'string') return entity.trim();
  return String(entity?.name || entity?.title || entity?.label || '').trim();
}

function uniqueNames(items) {
  const seen = new Set();
  return items
    .map(entityName)
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function scriptEntityNames(studio, type) {
  const scriptObj = studio?.script || {};
  const stateItems = Array.isArray(studio?.[type]) ? studio[type] : [];
  const detected = scriptObj.file_detected_entities?.[type];
  const scriptItems = Array.isArray(scriptObj[type]) ? scriptObj[type] : [];

  return uniqueNames([
    ...stateItems,
    ...(Array.isArray(detected) ? detected : []),
    ...scriptItems,
  ]);
}
