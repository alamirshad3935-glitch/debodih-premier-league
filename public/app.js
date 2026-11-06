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

// PLAYER REGISTRATION FORM
$('#regForm').addEventListener('submit', e => {
  e.preventDefault();

  const f = e.currentTarget;
  if (!f.reportValidity()) return;

  const photo = $('#playerPhoto').files[0];
  const mobile = f.elements.namedItem('mobile_number').value.trim();

  if (!/^[0-9]{10}$/.test(mobile)) {
    return toast('कृपया सही 10 अंकों का मोबाइल नंबर डालें।');
  }

  if (!fileOk(photo)) {
    return toast('Player photo must be JPG, PNG or WEBP under 5 MB.');
  }

  draft = {
    first_name: f.elements.namedItem('first_name').value.trim(),
    last_name: f.elements.namedItem('last_name').value.trim(),
    mobile_number: mobile,
    player_type: f.elements.namedItem('player_type').value,
    photo
  };

  $('#paymentMessage').innerHTML = '';
  $('#paymentForm').reset();
  $('#paymentName').textContent = 'Choose screenshot';
  show('paymentModal');
});

// PAYMENT AND REGISTRATION SUBMISSION
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
  let paymentPath = null;

  try {
    photoPath = await upload('Player photo', draft.photo);
    paymentPath = await upload('Payment screenshot', payment);

    const { data, error } = await dplClient.functions.invoke(
      'submit-registration',
      {
        body: {
          first_name: draft.first_name,
          last_name: draft.last_name,
          mobile_number: draft.mobile_number,
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
        <b>Registration submitted successfully!</b>
        <p>Your application status is now: <b>PENDING</b></p>
        <p>आप अपने रजिस्टर्ड मोबाइल नंबर से कभी भी Registration Status चेक कर सकते हैं।</p>
        <p>DPL Registration Number केवल ₹199 का भुगतान सत्यापित होने के बाद जारी होगा।</p>
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

    if (paymentPath) {
      await dplClient.storage.from('Payment screenshot').remove([paymentPath]);
    }

    $('#paymentMessage').innerHTML =
      `<p class="error">${esc(err.message || 'Could not submit. Please try again.')}</p>`;

  } finally {
    btn.disabled = false;
    btn.textContent = 'SUBMIT REGISTRATION';
  }
});

// LOAD PUBLIC APPROVED PLAYERS
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

// CHECK REGISTRATION STATUS USING MOBILE NUMBER
$('#statusForm').addEventListener('submit', async e => {
  e.preventDefault();

  const form = e.currentTarget;
  const mobile = form.elements.namedItem('mobile_number').value.trim();
  const box = $('#statusResult');
  const button = form.querySelector('button');

  if (!/^[0-9]{10}$/.test(mobile)) {
    box.textContent = 'कृपया सही 10 अंकों का मोबाइल नंबर डालें।';
    return;
  }

  box.textContent = 'Checking registration status…';
  button.disabled = true;

  try {
    const { data, error } = await dplClient.functions.invoke(
      'registration-status',
      {
        body: { mobile_number: mobile }
      }
    );

    if (error) throw error;
    if (data?.error) throw Error(data.error);

    const results = Array.isArray(data?.registrations)
      ? data.registrations
      : data?.registration
        ? [data.registration]
        : data?.status
          ? [data]
          : [];

    if (!results.length) {
      box.innerHTML = `
        <div class="error">
          इस मोबाइल नंबर से कोई रजिस्ट्रेशन नहीं मिला।
          कृपया वही नंबर डालें जो रजिस्ट्रेशन फॉर्म में दिया था।
        </div>
      `;
      return;
    }

    box.innerHTML = '';

    results.forEach(p => {
      const status = String(p.status || '').toLowerCase();
      const card = document.createElement('div');

      card.style.cssText = `
        background:#f5f7fa;
        border:1px solid #ddd;
        border-radius:10px;
        padding:14px;
        margin-top:12px;
        color:#071a31;
      `;

      let statusText = 'PENDING';
      let statusColor = '#b7791f';

      if (status === 'approved') {
        statusText = 'APPROVED';
        statusColor = '#16803c';
      } else if (status === 'rejected') {
        statusText = 'REJECTED';
        statusColor = '#c53030';
      }

      card.innerHTML = `
        <b>${esc(p.first_name)} ${esc(p.last_name)}</b>
        <br>
        <span>${esc(p.player_type || '')}</span>
        <br>
        Status:
        <b style="color:${statusColor}">${statusText}</b>
        ${
          p.registration_number
            ? `<br>Registration No: <b>${esc(p.registration_number)}</b>`
            : ''
        }
        ${
          status === 'pending'
            ? '<p>आपका भुगतान और रजिस्ट्रेशन अभी जाँच के अधीन है।</p>'
            : ''
        }
        ${
          status === 'rejected'
            ? '<p>आपका रजिस्ट्रेशन स्वीकार नहीं हुआ। अधिक जानकारी के लिए DPL Admin से संपर्क करें।</p>'
            : ''
        }
      `;

      if (status === 'approved' && p.registration_number && p.photo_url) {
        const btn = document.createElement('button');
        btn.className = 'btn gold';
        btn.style.marginTop = '10px';
        btn.textContent = 'VIEW PLAYER CARD';

        btn.onclick = () => openCard(p);

        card.appendChild(document.createElement('br'));
        card.appendChild(btn);
      }

      box.appendChild(card);
    });

  } catch (err) {
    console.error('Status check error:', err);
    box.textContent = err.message || 'Status check नहीं हो पाया। कृपया दोबारा कोशिश करें।';

  } finally {
    button.disabled = false;
  }
});

// PLAYER CARD
function openCard(p) {
  if (!p || !p.registration_number) {
    toast('Player card अभी उपलब्ध नहीं है।');
    return;
  }

  $('#playerCard').innerHTML = `
    <img class="card-logo" src="assets/dpl-logo.png" alt="DPL">
    <h3>DEBODIH PREMIER LEAGUE</h3>
    <img class="card-photo" src="${esc(p.photo_url || '')}" alt="Player photo">
    <div class="card-name">${esc(p.first_name)} ${esc(p.last_name)}</div>
    <div class="card-type">${esc(p.player_type)}</div>
    <div class="card-reg">${esc(p.registration_number)}</div>
    <span class="confirmed">CONFIRMED PLAYER</span>
  `;

  show('cardModal');
}

// DOWNLOAD PLAYER CARD
$('#downloadCard').addEventListener('click', async () => {
  const card = $('#playerCard');
  const photo = card.querySelector('.card-photo');
  const logo = card.querySelector('.card-logo');

  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 1100;

  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 900, 1100);

  g.addColorStop(0, '#071a31');
  g.addColorStop(1, '#17466b');

  x.fillStyle = g;
  x.fillRect(0, 0, 900, 1100);
  x.strokeStyle = '#e8b94f';
  x.lineWidth = 12;
  x.strokeRect(22, 22, 856, 1056);

  try {
    if (!photo.complete || !photo.naturalWidth) {
      await new Promise((resolve, reject) => {
        photo.onload = resolve;
        photo.onerror = reject;
      });
    }

    if (!logo.complete || !logo.naturalWidth) {
      await new Promise((resolve, reject) => {
        logo.onload = resolve;
        logo.onerror = reject;
      });
    }

    x.drawImage(logo, 380, 55, 140, 140);
    x.drawImage(photo, 345, 270, 210, 230);

  } catch {
    return toast('Player photo या DPL logo load नहीं हुआ। दोबारा कोशिश करें।');
  }

  x.textAlign = 'center';
  x.fillStyle = '#e8b94f';
  x.font = 'bold 42px Arial';
  x.fillText('DEBODIH PREMIER LEAGUE', 450, 245);

  x.fillStyle = '#fff';
  x.font = 'bold 52px Arial';

  let n = card.querySelector('.card-name').textContent;
  if (n.length > 24) n = n.slice(0, 24);

  x.fillText(n, 450, 590);

  x.fillStyle = '#d4dfec';
  x.font = '32px Arial';
  x.fillText(card.querySelector('.card-type').textContent, 450, 655);

  x.fillStyle = '#e8b94f';
  x.font = 'bold 58px Arial';
  x.fillText(card.querySelector('.card-reg').textContent, 450, 770);

  x.fillRect(275, 835, 350, 70);
  x.fillStyle = '#071a31';
  x.font = 'bold 29px Arial';
  x.fillText('CONFIRMED PLAYER', 450, 880);

  try {
    const a = document.createElement('a');
    a.download = 'DPL-Player-Card.png';
    a.href = c.toDataURL('image/png');
    a.click();
  } catch (err) {
    toast('Card download नहीं हो पाया। फोटो URL की अनुमति जाँचनी होगी।');
  }
});

// ADMIN MODAL
$('#adminOpen').onclick = $('#footerAdmin').onclick = () => {
  show('adminModal');
};

// ADMIN LOGIN
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();

  const f = e.currentTarget;
  const btn = f.querySelector('button');
  btn.disabled = true;

  try {
    const { error } = await dplClient.auth.signInWithPassword({
      email: f.elements.namedItem('email').value,
      password: f.elements.namedItem('password').value
    });

    if (error) throw error;

    $('#adminLogin').hidden = true;
    $('#adminDashboard').hidden = false;
    await loadAdmin();

  } catch (err) {
    toast(err.message || 'Login failed.');

  } finally {
    btn.disabled = false;
  }
});

// LOAD ADMIN DASHBOARD
async function loadAdmin() {
  const box = $('#adminList');
  box.textContent = 'Loading registrations…';

  try {
    const { data, error } = await dplClient.functions.invoke(
      'admin-list', { body: {} }
    );

    if (error) throw error;
    if (data.error) throw Error(data.error);

    $('#adminTotal').textContent = data.approved;
    $('#adminPending').textContent = data.pending;
    $('#adminCollection').textContent = '₹' + data.collected;

    box.innerHTML = '';

    if (!data.registrations.length) {
      box.textContent = 'No registrations yet.';
      return;
    }

    data.registrations.forEach(r => {
      const row = document.createElement('div');
      row.className = 'admin-row';

      row.innerHTML = `
        <div>
          <b>${esc(r.first_name)} ${esc(r.last_name)}</b><br>
          <small>${esc(r.player_type)} • ${new Date(r.created_at).toLocaleString()}</small>
          <div class="proofs">
            <a href="${esc(r.photo_url || '#')}" target="_blank" rel="noopener">
              <img src="${esc(r.photo_url || '')}" alt="Player photo">
            </a>
            <a href="${esc(r.payment_url || '#')}" target="_blank" rel="noopener">
              <img src="${esc(r.payment_url || '')}" alt="Payment proof">
            </a>
          </div>
          <small>Status: <b>${esc(r.status.toUpperCase())}</b> ${r.registration_number ? '• ' + esc(r.registration_number) : ''}</small>
        </div>
        <div class="actions">
          ${r.status === 'pending'
            ? `<button class="btn approve" data-approve="${esc(r.id)}">APPROVE</button>
               <button class="btn reject" data-reject="${esc(r.id)}">REJECT</button>`
            : ''}
        </div>
      `;

      box.appendChild(row);
    });

    box.querySelectorAll('[data-approve]').forEach(b =>
      b.onclick = () => review(b.dataset.approve, 'approve')
    );

    box.querySelectorAll('[data-reject]').forEach(b =>
      b.onclick = () => review(b.dataset.reject, 'reject')
    );

  } catch (err) {
    box.textContent = err.message || 'Admin list could not load.';
  }
}

// APPROVE / REJECT
async function review(id, action) {
  const msg = action === 'approve'
    ? 'Have you personally confirmed receipt of exactly ₹199 in your PhonePe/UPI account? Only approve after checking the actual transaction.'
    : 'Reject this pending registration?';

  if (!confirm(msg)) return;

  try {
    const { data, error } = await dplClient.functions.invoke(
      'admin-review', { body: { player_id: id, action } }
    );

    if (error) throw error;
    if (data.error) throw Error(data.error);

    toast(action === 'approve'
      ? 'Approved: ' + data.registration_number
      : 'Registration rejected');

    await loadAdmin();
    await loadPlayers();

  } catch (err) {
    toast(err.message || 'Review failed');
  }
}

// ADMIN LOGOUT
$('#logoutBtn').onclick = async () => {
  await dplClient.auth.signOut();
  $('#adminLogin').hidden = false;
  $('#adminDashboard').hidden = true;
  $('#loginForm').reset();
};

// EXPORT CSV
$('#exportBtn').onclick = async () => {
  try {
    const { data, error } = await dplClient.functions.invoke(
      'admin-list', { body: {} }
    );

    if (error) throw error;

    const cols = [
      'id', 'first_name', 'last_name', 'player_type',
      'status', 'registration_number', 'created_at'
    ];

    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';

    const csv = [
      cols.join(','),
      ...(data.registrations || []).map(r =>
        cols.map(k => q(r[k])).join(',')
      )
    ].join('\n');

    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv' })
    );

    const a = document.createElement('a');
    a.href = url;
    a.download = 'DPL-registrations.csv';
    a.click();
    URL.revokeObjectURL(url);

  } catch (e) {
    toast(e.message);
  }
};

// INITIAL LOAD
(async () => {
  const { data } = await dplClient.auth.getSession();

  if (data.session) {
    $('#adminLogin').hidden = true;
    $('#adminDashboard').hidden = false;
    loadAdmin();
  }

  loadPlayers();
})();
