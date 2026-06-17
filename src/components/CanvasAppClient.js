'use client';

import dynamic from 'next/dynamic';

const CanvasApp = dynamic(() => import('@/components/CanvasApp'), {
  ssr: false,
});

export default function CanvasAppClient() {
  return <CanvasApp />;
}
