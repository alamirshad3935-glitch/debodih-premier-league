import { requireAdmin, corsHeaders, json } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { admin } = await requireAdmin(req);
    const { player_id, action } = await req.json();

    if (!player_id || !['approve', 'reject'].includes(action)) {
      return json({ error: 'Invalid review request.' }, 400);
    }

    if (action === 'approve') {
      // Admin must first verify the actual ₹199 payment in PhonePe.
      const { data, error } = await admin.rpc('dpl_approve_player', {
        p_player_id: player_id
      });

      if (error) throw error;

      return json({ ok: true, registration_number: data });
    }

    const { data, error } = await admin
      .from('players')
      .update({ status: 'rejected' })
      .eq('id', player_id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return json({ error: 'Pending registration not found.' }, 404);
    }

    return json({ ok: true });

  } catch (e) {
    return json({ error: e.message || 'Review failed.' }, 400);
  }
});
