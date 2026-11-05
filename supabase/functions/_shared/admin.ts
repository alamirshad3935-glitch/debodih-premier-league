import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function serviceClient() {
  const secretKeys = JSON.parse(
    Deno.env.get('SUPABASE_SECRET_KEYS')!
  );

  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    secretKeys['default'],
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization') || '';

  if (!auth.startsWith('Bearer ')) {
    throw new Error('Admin login required');
  }

  const token = auth.slice(7);
  const admin = serviceClient();

  const { data: userData, error: userError } =
    await admin.auth.getUser(token);

  if (userError || !userData.user) {
    throw new Error('Please sign in again');
  }

  const { data, error } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error || !data) {
    throw new Error('This account is not a DPL admin');
  }

  return { admin, user: userData.user };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
