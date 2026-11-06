import {
  serviceClient,
  corsHeaders,
  json
} from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();

    const mobile_number =
      typeof body.mobile_number === 'string'
        ? body.mobile_number.trim()
        : '';

    if (!/^[0-9]{10}$/.test(mobile_number)) {
      return json({
        error: 'Please enter a valid 10-digit mobile number.'
      }, 400);
    }

    const admin = serviceClient();

    const { data, error } = await admin
      .from('players')
      .select(`
        first_name,
        last_name,
        status,
        registration_number,
        player_type,
        photo_path
      `)
      .eq('mobile_number', mobile_number)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return json({
        registrations: []
      });
    }

    const registrations = await Promise.all(
      data.map(async (player) => {
        let photo_url = null;

        // Only approved players receive a card photo URL
        if (
          player.status === 'approved' &&
          player.photo_path
        ) {
          const { data: signedPhoto, error: photoError } =
            await admin.storage
              .from('Player photo')
              .createSignedUrl(player.photo_path, 3600);

          if (photoError) {
            console.error(
              'Player photo URL error:',
              photoError
            );
          } else {
            photo_url = signedPhoto?.signedUrl || null;
          }
        }

        return {
          first_name: player.first_name,
          last_name: player.last_name,
          status: player.status,
          registration_number: player.registration_number,
          player_type: player.player_type,
          photo_url
        };
      })
    );

    return json({
      registrations
    });

  } catch (e) {
    console.error('Registration status error:', e);

    return json({
      error: e instanceof Error
        ? e.message
        : 'Could not check status.'
    }, 400);
  }
});
