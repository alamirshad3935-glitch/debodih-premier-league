import { serviceClient, corsHeaders, json } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { first_name, last_name, player_type, photo_path, payment_screenshot_path } = await req.json();

    const allowed = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket Keeper'];

    if (!first_name?.trim() || !last_name?.trim() || !allowed.includes(player_type)) {
      return json({ error: 'Please complete all player details.' }, 400);
    }

    if (!photo_path || !payment_screenshot_path ||
        !photo_path.startsWith('pending/') ||
        !payment_screenshot_path.startsWith('pending/')) {
      return json({ error: 'Invalid upload paths.' }, 400);
    }

    const admin = serviceClient();

    const { data: payment, error: downloadError } =
      await admin.storage.from('Payment screenshot').download(payment_screenshot_path);

    if (downloadError || !payment) {
      return json({ error: 'Payment screenshot could not be checked. Upload again.' }, 400);
    }

    if (payment.size > 5 * 1024 * 1024) {
      return json({ error: 'Payment screenshot must be 5 MB or smaller.' }, 400);
    }

    const bytes = new Uint8Array(await payment.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0')).join('');

    const { data: duplicate } = await admin.from('players')
      .select('id,status')
      .eq('payment_screenshot_sha256', hash)
      .maybeSingle();

    if (duplicate) {
      return json({ error: 'This exact payment screenshot has already been submitted.' }, 409);
    }

    const { data, error } = await admin.from('players').insert({
      first_name: first_name.trim().slice(0, 60),
      last_name: last_name.trim().slice(0, 60),
      player_type,
      photo_path,
      payment_screenshot_path,
      payment_screenshot_sha256: hash,
      status: 'pending',
      registration_number: null,
      approved_at: null,
    }).select('id').single();

    if (error) throw error;

    return json({ ok: true, request_id: data.id, status: 'pending' }, 201);

  } catch (e) {
    return json({ error: e.message || 'Registration could not be submitted.' }, 400);
  }
});
