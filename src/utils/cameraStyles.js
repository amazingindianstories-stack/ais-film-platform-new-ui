// Curated camera scene examples used to ground shot prompt generation.
// These teach the model what "good" looks like: lens grammar, depth layers,
// subject action, environmental texture, and emotional restraint.

export const CAMERA_STYLE_EXAMPLES = `
## Shot Style Reference Library

### Medium-Wide Two-Shot (Walking/Moving)
Medium-wide two-shot at eye level, natural handheld documentary realism. Camera gently walks backward as both characters move through a crowded Indian street market. Fruit stalls pass through the foreground, sugarcane cart and tea steam visible in the midground, auto-rickshaws and soft crowd movement in the background. Warm cinematic golden-hour light, subtle shallow depth of field, realistic market ambience, intimate romantic tension, understated acting, believable micro-expressions. The woman glances up at the man with a teasing half-smile while they walk side by side.

### Close-Up on Character (Reactive / Internal)
Close-up on the man from his left side, 50mm lens feel, shallow depth of field. The market background is softly blurred with moving vendors, rickshaws, fruit colors, and dusty golden haze. He looks ahead first, then briefly glances toward the woman, trying not to smile. Natural handheld camera, warm side light, realistic skin texture, quiet emotional restraint, subtle facial reaction.

### Over-the-Shoulder Coverage Shot
Over-the-shoulder shot from behind the lead character toward the other. Keep the near shoulder softly out of focus in the foreground while the far character remains sharp. She slows half a step, her teasing expression shifting into curiosity. Fruit stalls, passing shoppers, and warm market haze create layered depth behind her. Natural handheld realism, soft ambient movement, intimate dialogue coverage, believable reaction timing.

### Tight Close-Up with Environmental Foreground Detail
Tight close-up on the man as he stops beside the sugarcane cart. His fingers hover near an empty glass on a wooden table in the lower foreground. Tea steam drifts softly across the frame, briefly veiling his face. He looks at the surrounding market crowd, then back toward the woman with restrained emotion. Warm golden rim light, shallow depth of field, realistic handheld stillness, intimate memory-driven reaction.

### Close-Up with Rim Light (Emotional Pause)
Close-up on the woman with warm golden rim light shaping her face. The busy market behind her is softly blurred, with hints of fruit stalls, people crossing, and rickshaw movement. Her expression shifts naturally from surprise to a shy smile. She looks down for a small beat, then lifts her eyes back toward the man. Cinematic realism, soft shadows, believable micro-expression, romantic emotional pause.

### Static Wide Two-Shot (Scene Closure / Breathing Room)
Static medium two-shot from the fruit-stall side. Both characters are framed together as they begin walking again into the golden market haze. A vendor briefly crosses the foreground with a basket, creating a natural market wipe without becoming the focus. Keep the couple's screen direction consistent, wardrobe unchanged, and background crowd movement realistic. Warm cinematic light, layered foreground-midground-background depth, quiet smiles, natural ending energy.

### Insert / Detail Shot (Props / Texture)
Insert shot of an empty glass on a wooden table near the sugarcane cart. A vendor's hands arrange fruit in the foreground while tea steam drifts across the frame. The conversation continues off-screen. Shallow depth of field, tactile realism, warm golden highlights, market texture, intimate atmospheric detail.

### Clean Single — No Shoulder (Contemplative)
Clean single close-up on the man with no shoulder visible in the foreground. He holds eye contact slightly longer than before, his face calm but emotionally open. The market noise feels present but softened by the intimate framing. Warm side light, realistic skin detail, subtle smile forming, restrained romantic tension.

### Clean Single — Reaction (Shy / Vulnerable)
Clean single close-up on the woman. She tries to hide a smile, glancing down briefly before looking back up. The background remains alive with soft movement but never distracts from her face. Warm rim light, natural handheld micro-motion, understated acting, realistic romantic vulnerability.

### Wide Environmental / Closure Frame
Wide frame of both characters continuing down an Indian street market lane. They move deeper into the warm golden haze between fruit stalls, sugarcane cart, rickshaws, and passing shoppers. Camera holds steady as the crowd flows naturally around them. Photorealistic cinematic realism, soft ambient market sound, gentle romantic closure, no subtitles, no text overlays.

---
Camera grammar rules inferred from these examples:
- Always specify lens feel (35mm, 50mm, 85mm), shot size, camera height, and depth of field.
- Foreground / midground / background layers must all be described — give each depth a role.
- State whether the camera moves and how: static, locked-off, gentle handheld drift, walks backward.
- Environmental atmosphere is a character: steam, dust, light quality, crowd density, color temperature.
- Emotional tone lives in micro-actions: eye direction, a half-step pause, fingers hovering, a suppressed smile.
- Never describe transitions, cuts, or editing instructions inside a shot prompt.
`.trim();
