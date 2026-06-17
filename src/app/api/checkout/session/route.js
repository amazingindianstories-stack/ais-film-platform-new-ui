import { NextResponse } from 'next/server';
import stripe from 'stripe';
import { createClient } from '@/utils/supabase-server';

function createStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new stripe(process.env.STRIPE_SECRET_KEY);
}

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { priceId, credits } = await req.json();
    const stripeClient = createStripeClient();

    // Create Stripe Checkout Session
    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId, // Stripe Price ID (e.g. price_123...)
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: {
        userId: user.id,
        credits: credits,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe Error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
