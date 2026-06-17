import { NextResponse } from 'next/server';
import { runShotstackPython } from '@/utils/shotstack-python';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const statusTimeoutMs = Number(process.env.SHOTSTACK_STATUS_TIMEOUT_MS || 90000);

function serializeError(error) {
  return {
    message: error?.message || 'Export status check failed.',
    status: error?.status || 500,
  };
}

export async function GET(_req, context) {
  try {
    const { renderId } = await context.params;
    const result = await runShotstackPython('status', { renderId }, statusTimeoutMs);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const serialized = serializeError(error);
    console.error('Shotstack Status API Error:', serialized);
    return NextResponse.json(
      { error: serialized.message, status: serialized.status },
      { status: serialized.status >= 400 && serialized.status < 600 ? serialized.status : 500 }
    );
  }
}
