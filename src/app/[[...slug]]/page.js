import CanvasAppClient from '@/components/CanvasAppClient';

/* Optional catch-all: every non-/api path (`/`, `/dashboard`, `/<projectId>`,
   `/<projectId>/audio`, …) renders the canvas. Seamless screen changes happen
   client-side via history.pushState in canvasRouter; this route exists so a
   reload / deep-link resolves instead of 404-ing. */
export default function Page() {
  return <CanvasAppClient />;
}
