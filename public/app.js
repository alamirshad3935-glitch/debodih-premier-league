const cfg = window.DPL_CONFIG;
const dplClient = window.supabase.createClient(
  cfg.supabaseUrl,
  cfg.publishableKey
);

const $ = s => document.querySelector(s);
let draft = null, currentPlayers = [];

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const show = id => $('#' + id).classList.add('show');

document.querySelectorAll('[data-close]').forEach(b =>
  b.addEventListener('click', () => $('#' + b.dataset.close).classList.remove('show'))
);

document.querySelectorAll('.modal').forEach(m =>
  m.addEventListener('click', e => {
    if (e.target === m) m.classList.remove('show');
  })
);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// PASSWORD RESET WINDOW
function createResetModal() {
  if ($('#dplResetModal')) return;

  const modal = document.createElement('div');
  modal.id = 'dplResetModal';

  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.85);
    z-index:999999;display:none;align-items:center;
    justify-content:center;padding:20px;
  `;

  modal.innerHTML = `
    <div style="
      background:#fff;color:#111;width:100%;max-width:400px;
      padding:25px;border-radius:14px;
    ">
      <h2 style="margin-top:0">Set New Password</h2>
      <p>अपना नया Admin Password डालें।</p>

      <form id="dplResetForm">
        <label>New Password</label>
        <input id="dplNewPassword" type="password"
          minlength="8" required autocomplete="new-password"
          placeholder="कम से कम 8 अक्षर"
          style="width:100%;padding:12px;margin:8px 0 15px;box-sizing:border-box">

        <label>Confirm New Password</label>
        <input id="dplConfirmPassword" type="password"
          minlength="8" required autocomplete="new-password"
          placeholder="Password दोबारा डालें"
          style="width:100%;padding:12px;margin:8px 0 15px;box-sizing:border-box">

        <p id="dplResetMessage" style="overflow-wrap:anywhere"></p>

        <button id="dplResetButton" type="submit"
          style="width:100%;padding:13px;background:#071a31;color:white;
          border:0;border-radius:7px;font-weight:bold">
          UPDATE PASSWORD
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  $('#dplResetForm').addEventListener('submit', async e => {
    e.preventDefault();

    const password = $('#dplNewPassword').value;
    const confirmPassword = $('#dplConfirmPassword').value;
    const message = $('#dplResetMessage');
    const button = $('#dplResetButton');

    if (password.length < 8) {
      message.textContent = 'Password कम से कम 8 अक्षर का होना चाहिए।';
      return;
    }

    if (password !== confirmPassword) {
      message.textContent = 'दोनों Password एक जैसे नहीं हैं।';
      return;
    }

    button.disabled = true;
    button.textContent = 'UPDATING…';
    message.textContent = '';

    try {
      const { error } = await dplClient.auth.updateUser({
        password: password
      });

      if (error) throw error;

      message.textContent = 'Password सफलतापूर्वक बदल गया। अब नए Password से Login करें।';
      message.style.color = 'green';

      await dplClient.auth.signOut();

      setTimeout(() => {
        modal.style.display = 'none';
        history.replaceState(null, '', window.location.pathname);
        $('#adminLogin').hidden = false;
        $('#adminDashboard').hidden = true;
        $('#loginForm').reset();
        show('adminModal');
        toast('नया Password सेट हो गया। अब Login करें।');
      }, 1800);

    } catch (err) {
      message.textContent = err.message || 'Password बदल नहीं पाया। Reset link दोबारा खोलें।';
      message.style.color = 'red';
    } finally {
      button.disabled = false;
      button.textContent = 'UPDATE PASSWORD';
    }
  });
}

function openResetModal() {
  createResetModal();
  $('#dplResetModal').style.display = 'flex';
}

// PASSWORD RECOVERY EVENT
dplClient.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) {
    openResetModal();
  }
});

// FORGOT PASSWORD LINK
const passwordInput = $('#loginForm').elements.namedItem('password');

const forgotButton = document.createElement('button');
forgotButton.type = 'button';
forgotButton.textContent = 'Forgot Password?';

forgotButton.style.cssText = `
  display:block;margin:10px 0 15px auto;
  background:none;border:0;color:#17466b;
  text-decoration:underline;cursor:pointer;font-size:14px;
`;

passwordInput.insertAdjacentElement('afterend', forgotButton);

forgotButton.addEventListener('click', async () => {
  const email = $('#loginForm').elements.namedItem('email').value.trim();

  if (!email) {
    toast('पहले Email Address डालें।');
    $('#loginForm').elements.namedItem('email').focus();
    return;
  }

  forgotButton.disabled = true;
  forgotButton.textContent = 'SENDING…';

  try {
    const { error } = await dplClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/?reset-password=true'
    });

    if (error) throw error;

    toast('Password Reset Link आपके Email पर भेज दिया गया है। Email Inbox और Spam Folder चेक करें।');

  } catch (err) {
    toast(err.message || 'Reset Email नहीं भेजा जा सका।');
  } finally {
    forgotButton.disabled = false;
    forgotButton.textContent = 'Forgot Password?';
  }
});

function fileOk(file) {
  return file &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
    file.size <= 5 * 1024 * 1024;
}

function pathFor(file) {
  const ext = file.type === 'image/png' ? 'png' :
    file.type === 'image/webp' ? 'webp' : 'jpg';
  return `pending/${crypto.randomUUID()}.${ext}`;
}

async function upload(bucket, file) {
  if (!fileOk(file)) {
    throw Error('Please use JPG, PNG or WEBP image under 5 MB.');
  }

  const path = pathFor(file);
  const { error } = await dplClient.storage.from(bucket).upload(
    path, file, { contentType: file.type, upsert: false }
  );

  if (error) throw error;
  return path;
}

$('#playerPhoto').addEventListener('change', e => {
  $('#photoName').textContent = e.target.files[0]?.name || 'Choose photo';
});

$('#paymentFile').addEventListener('change', e => {
  $('#paymentName').textContent = e.target.files[0]?.name || 'Choose screenshot';
});

$('#regForm').addEventListener('submit', e => {
  e.preventDefault();

  const f = e.currentTarget;
  if (!f.reportValidity()) return;

  const photo = $('#playerPhoto').files[0];

  if (!fileOk(photo)) {
    return toast('Player photo must be JPG, PNG or WEBP under 5 MB.');
  }

  draft = {
    first_name: f.elements.namedItem('first_name').value.trim(),
    last_name: f.elements.namedItem('last_name').value.trim(),
    player_type: f.elements.namedItem('player_type').value,
    photo
  };

  $('#paymentMessage').innerHTML = '';
  $('#paymentForm').reset();
  $('#paymentName').textContent = 'Choose screenshot';
  show('paymentModal');
});

$('#paymentForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!draft) return;

  const payment = $('#paymentFile').files[0];

  if (!fileOk(payment)) {
    return toast('Payment screenshot must be JPG, PNG or WEBP under 5 MB.');
  }

  const btn = e.currentTarget.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'UPLOADING…';

  let photoPath = null;

  try {
    photoPath = await upload('Player photo', draft.photo);
    const paymentPath = await upload('Payment screenshot', payment);

    const { data, error } = await dplClient.functions.invoke(
      'submit-registration',
      {
        body: {
          first_name: draft.first_name,
          last_name: draft.last_name,
          player_type: draft.player_type,
          photo_path: photoPath,
          payment_screenshot_path: paymentPath
        }
      }
    );

    if (error) throw error;
    if (data?.error) throw Error(data.error);

    $('#paymentMessage').innerHTML = `
      <div class="success">
        <b>Registration submitted!</b>
        <p>Your private request code:</p>
        <p style="overflow-wrap:anywhere"><b>${esc(data.request_id)}</b></p>
        <p>Status: PENDING. Save this code. Your DPL registration number will be issued only after the admin verifies the ₹199 payment in PhonePe.</p>
      </div>
    `;

    $('#regForm').reset();
    $('#photoName').textContent = 'Choose photo';
    draft = null;
    toast('Registration submitted successfully.');

  } catch (err) {
    if (photoPath) {
      await dplClient.storage.from('Player photo').remove([photoPath]);
    }

    $('#paymentMessage').innerHTML =
      `<p class="error">${esc(err.message || 'Could not submit. Please try again.')}</p>`;

  } finally {
    btn.disabled = false;
    btn.textContent = 'SUBMIT REGISTRATION';
  }
});

async function loadPlayers() {
  const box = $('#playersGrid');

  try {
    const { data, error } = await dplClient.functions.invoke(
      'public-players', { body: {} }
    );

    if (error) throw error;

    currentPlayers = data.players || [];
    $('#playerCount').textContent = data.count ?? currentPlayers.length;
    $('#rosterCount').textContent = data.count ?? currentPlayers.length;

    box.innerHTML = '';

    if (!currentPlayers.length) {
      box.innerHTML = '<div class="empty-state">No confirmed players yet. Approved players will appear here.</div>';
      return;
    }

    currentPlayers.forEach(p => {
      const b = document.createElement('button');
      b.className = 'player-tile';

      b.innerHTML = `
        <img src="${esc(p.photo_url || 'assets/dpl-logo.png')}" alt="">
        <span>
          <strong>${esc(p.first_name)} ${esc(p.last_name)}</strong>
          <small>${esc(p.registration_number)} • ${esc(p.player_type)}</small>
        </span>
      `;

      b.addEventListener('click', () => openCard(p));
      box.appendChild(b);
    });

  } catch (e) {
    box.innerHTML = '<div class="empty-state">Confirmed player list is temporarily unavailable.</div>';
    console.error(e);
  }
}

$('#statusForm').addEventListener('submit', async e => {
  e.preventDefault();

  const id = e.currentTarget.elements.namedItem('request_id').value.trim();
  const box = $('#statusResult');
  box.textContent = 'Checking…';

  try {
    const { data, error } = await d
