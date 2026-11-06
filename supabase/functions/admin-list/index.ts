import { requireAdmin, corsHeaders, json } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { admin } = await requireAdmin(req);

    const { data, error } = await admin
      .from('players')
      .select(
        'id,first_name,last_name,player_type,photo_path,payment_screenshot_path,status,registration_number,created_at'
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = await Promise.all(
      (data || []).map(async (p) => {
        const [photo, payment] = await Promise.all([
          admin.storage
            .from('Player photo')
            .createSignedUrl(p.photo_path, 60 * 10),

          admin.storage
            .from('Payment screenshot')
            .createSignedUrl(p.payment_screenshot_path, 60 * 10),
        ]);

        return {
          ...p,
          photo_url: photo.data?.signedUrl || null,
          payment_url: payment.data?.signedUrl || null,
        };
      })
    );

    const approved = rows.filter((x) => x.status === 'approved').length;

    return json({
      registrations: rows,
      approved,
      pending: rows.filter((x) => x.status === 'pending').length,
      collected: approved * 199,
    });

  } catch (e) {
    console.error('Admin list error:', e);

    return json({
      error: e instanceof Error ? e.message : 'Admin access failed.',
    }, 401);
  }
});
