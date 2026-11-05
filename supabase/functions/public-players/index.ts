import { serviceClient, corsHeaders, json } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const db = serviceClient();

    const { data, error } = await db
      .from('players')
      .select('registration_number,first_name,last_name,player_type,photo_path')
      .eq('status', 'approved')
      .order('registration_number');

    if (error) throw error;

    const rows = await Promise.all((data || []).map(async (p) => {
      const { data: signed, error: photoError } = await db.storage
        .from('Player photo')
        .createSignedUrl(p.photo_path, 60 * 30);

      return {
        ...p,
        photo_url: photoError ? null : signed?.signedUrl || null
      };
    }));

    return json({ players: rows, count: rows.length });

  } catch (e) {
    return json({ error: e.message || 'Could not load players.' }, 400);
  }
});
