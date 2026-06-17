import { NextResponse } from 'next/server';
import { runShotstackPython } from '@/utils/shotstack-python';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const renderTimeoutMs = Number(process.env.SHOTSTACK_RENDER_SUBMIT_TIMEOUT_MS || 90000);

function serializeError(error) {
  return {
    message: error?.message || 'Export failed.',
    status: error?.status || 500,
  };
}

export async function POST(req) {
  try {
    const payload = await req.json();
    const result = await runShotstackPython('render', payload, renderTimeoutMs);

    if (!result.renderId) {
      return NextResponse.json(
        { error: 'Export could not be started.', response: result.response || null },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      renderId: result.renderId,
      status: result.status || 'queued',
      message: result.message || 'Export queued.',
      response: result.response || null,
    });
  } catch (error) {
    const serialized = serializeError(error);
    console.error('Shotstack Render API Error:', serialized);
    return NextResponse.json(
      { error: serialized.message, status: serialized.status },
      { status: serialized.status >= 400 && serialized.status < 600 ? serialized.status : 500 }
    );
  }
}
