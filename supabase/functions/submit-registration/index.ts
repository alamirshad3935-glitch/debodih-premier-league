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
    // 1. Read request body
    const body = await req.json();

    const first_name =
      typeof body.first_name === 'string'
        ? body.first_name.trim()
        : '';

    const last_name =
      typeof body.last_name === 'string'
        ? body.last_name.trim()
        : '';

    const mobile_number =
      typeof body.mobile_number === 'string'
        ? body.mobile_number.trim()
        : '';

    const player_type = body.player_type;
    const photo_path = body.photo_path;
    const payment_screenshot_path =
      body.payment_screenshot_path;

    // 2. Validate player details
    const allowed = [
      'Batsman',
      'Bowler',
      'All-Rounder',
      'Wicket Keeper'
    ];

    if (
      !first_name ||
      !last_name ||
      typeof player_type !== 'string' ||
      !allowed.includes(player_type)
    ) {
      return json({
        error: 'Player details validation failed.'
      }, 400);
    }

    if (first_name.length > 60 || last_name.length > 60) {
      return json({
        error: 'Name must not exceed 60 characters.'
      }, 400);
    }

    // 3. Validate mobile number
    if (!/^[0-9]{10}$/.test(mobile_number)) {
      return json({
        error: 'Please enter a valid 10-digit mobile number.'
      }, 400);
    }

    // 4. Validate upload paths
    if (
      typeof photo_path !== 'string' ||
      typeof payment_screenshot_path !== 'string' ||
      !photo_path.startsWith('pending/') ||
      !payment_screenshot_path.startsWith('pending/')
    ) {
      return json({
        error: 'Invalid upload paths.'
      }, 400);
    }

    // 5. Create secure server client
    const admin = serviceClient();

    // 6. Check payment screenshot
    const {
      data: payment,
      error: downloadError
    } = await admin.storage
      .from('Payment screenshot')
      .download(payment_screenshot_path);

    if (downloadError || !payment) {
      console.error(
        'Payment screenshot download failed:',
        downloadError
      );

      return json({
        error: 'Payment screenshot could not be checked. Upload again.'
      }, 400);
    }

    // 7. Check file size
    if (payment.size > 5 * 1024 * 1024) {
      return json({
        error: 'Payment screenshot must be 5 MB or smaller.'
      }, 400);
    }

    // 8. Calculate SHA-256 hash
    const bytes = new Uint8Array(
      await payment.arrayBuffer()
    );

    const digest = await crypto.subtle.digest(
      'SHA-256',
      bytes
    );

    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // 9. Check duplicate payment screenshot
    const {
      data: duplicate,
      error: duplicateError
    } = await admin
      .from('players')
      .select('id,status')
      .eq('payment_screenshot_sha256', hash)
      .maybeSingle();

    if (duplicateError) {
      console.error(
        'Duplicate check failed:',
        duplicateError
      );

      throw duplicateError;
    }

    if (duplicate) {
      return json({
        error: 'This exact payment screenshot has already been submitted.'
      }, 409);
    }

    // 10. Insert registration including mobile number
    const {
      data,
      error: insertError
    } = await admin
      .from('players')
      .insert({
        first_name,
        last_name,
        mobile_number,
        player_type,
        photo_path,
        payment_screenshot_path,
        payment_screenshot_sha256: hash,
        status: 'pending',
        registration_number: null,
        approved_at: null
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(
        'Player registration insert failed:',
        insertError
      );

      throw insertError;
    }

    // 11. Success response
    return json({
      ok: true,
      request_id: data.id,
      status: 'pending'
    }, 201);

  } catch (e) {
    console.error(
      'Submit registration error:',
      e
    );

    return json({
      error: e instanceof Error
        ? e.message
        : 'Registration could not be submitted.'
    }, 400);
  }
});
