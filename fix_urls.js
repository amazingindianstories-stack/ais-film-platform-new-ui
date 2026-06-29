const fs = require('fs/promises');
const path = require('path');

const targetFiles = [
  "src/app/api/process-wardrobe-brain-dump/route.js",
  "src/app/api/generate-style-bible/route.js",
  "src/app/api/generate-shot-image/promptBuilder.js",
  "src/app/api/generate-shot-image/route.js",
  "src/app/api/generate-shot-image/referenceImages.js",
  "src/app/api/generate-character-anchor/route.js",
  "src/app/api/generate-shot-video/videoRouteHelpers.js"
];

async function fixUrlRegexes() {
  for (const file of targetFiles) {
    const filePath = path.join(process.cwd(), file);
    try {
      let content = await fs.readFile(filePath, 'utf-8');
      const original = content;
      
      // Fix /^https?:\/\//i.test(VARIABLE)
      content = content.replace(/\/\^https\?:\\\/\\\/\/i\.test\(([^)]+)\)/g, (match, p1) => {
        // Prevent double replacement if already fixed
        if (p1.includes('startsWith')) return match;
        return `(/^https?:\\/\\//i.test(${p1}) || String(${p1}).startsWith('/uploads/'))`;
      });
      
      // Fix fetchImage functions
      // We will look for: async function fetchImage(url) { ... }
      // This is a bit complex for regex, so we'll do it manually if needed.
      
      if (content !== original) {
        await fs.writeFile(filePath, content);
        console.log('Fixed regex in:', file);
      }
    } catch (e) {
      console.error('Error processing', file, e.message);
    }
  }
}

fixUrlRegexes();
