import { NextResponse } from 'next/server';
import stripe from 'stripe';
import { createAdminClient } from '@/utils/supabase-admin';

function createStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new stripe(process.env.STRIPE_SECRET_KEY);
}

export async function POST(req) {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;

  try {
    const stripeClient = createStripeClient();
    event = stripeClient.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  // Handle successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const creditAmount = parseInt(session.metadata.credits);

    const supabaseAdmin = createAdminClient();
    
    // 1. Update the user's credit balance in Supabase via RPC
    const { error } = await supabaseAdmin.rpc('add_credits', {
      p_user_id: userId,
      p_amount: creditAmount
    });

    if (error) {
      console.error('Failed to update credits:', error);
      return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
    }

    // 2. Log the transaction for audit trail
    await supabaseAdmin
      .from('credit_transactions')
      .insert([{
        user_id: userId,
        amount: creditAmount,
        action: 'purchase',
        reference_id: session.id
      }]);
  }

  return NextResponse.json({ received: true });
}
