import { createClient } from '@supabase/supabase-js'

// Note: This uses the service role key to bypass RLS.
// It should ONLY be used in secure server environments like webhooks.
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("Missing SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
