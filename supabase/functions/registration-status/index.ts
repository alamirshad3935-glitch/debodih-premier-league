import { serviceClient, corsHeaders, json } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { request_id } = await req.json();

    if (!request_id) {
      return json({ error: 'Request code is required.' }, 400);
    }

    const admin = serviceClient();

    const { data, error } = await admin
      .from('players')
      .select('first_name,last_name,status,registration_number,player_type')
      .eq('id', request_id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return json({ error: 'Registration not found.' }, 404);
    }

    return json({
      first_name: data.first_name,
      last_name: data.last_name,
      status: data.status,
      registration_number: data.registration_number,
      player_type: data.player_type
    });

  } catch (e) {
    return json({ error: e.message || 'Could not check status.' }, 400);
  }
});
