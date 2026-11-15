/* Customer pages: payment return, messages and profile.
   Loads after store.js and app.js. Messages and privacy requests are saved in
   this browser only (prototype). The real system stores them on the server. */
(function () {
  'use strict';
  var EH = window.EH;
  var body = document.body;
  var page = body.getAttribute('data-page') || '';
  var base = body.getAttribute('data-base') || '';
  var main = document.getElementById('app-main');
  if (!EH || !main) return;
  var session = EH.session();
  if (!session) return;

  var MSG_KEY = 'eh_proto_messages';
  var PREF_KEY = 'eh_proto_prefs';
  var REQ_KEY = 'eh_proto_privacy';
  var timer = null;
  var notice = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function qs(k) { return new URLSearchParams(location.search).get(k) || ''; }
  function fWhen(ms) { return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function readJSON(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function table(heads, rows) {
    return '<div class="table-wrap"><table><thead><tr>' +
      heads.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function head(eyebrow, title, lead) {
    return '<div class="page-head"><div><span class="eyebrow">' + esc(eyebrow) + '</span><h1>' + esc(title) +
      '</h1><p class="lead">' + esc(lead) + '</p></div></div>';
  }
  function notFound() {
    return '<div class="empty">We could not find that booking, or it is not on your account.</div>' +
      '<p><a href="' + base + 'portal/index.html">Back to my bookings</a></p>';
  }
  function setNotice(msg, kind) { notice = { msg: msg, kind: kind || 'ok' }; }
  function noticeHtml() {
    if (!notice) return '';
    var h = '<p class="flash ' + notice.kind + '">' + esc(notice.msg) + '</p>';
    notice = null;
    return h;
  }

  /* ---------- payment return ---------- */
  // The return page never shows success from the link alone. It reads the
  // booking status and only reports a deposit once the status confirms it.
  function renderPaymentReturn() {
    var data = EH.getFor(session, qs('id'));
    if (!data) { main.innerHTML = notFound(); return; }
    var inq = data.inquiry, res = data.reservation;
    var done = !!res && (res.status === 'awaiting_approval' || res.status === 'confirmed');
    var expired = !!res && res.status === 'expired';
    var title = done ? 'Deposit received' : expired ? 'Hold expired' : 'Payment processing';
    var text = done
      ? 'Your deposit is recorded. Our team will confirm your date shortly.'
      : expired
        ? 'The hold on this date expired before payment was confirmed. Please do not pay again until our team has contacted you.'
        : 'We are waiting for the payment provider to confirm your payment. This page updates automatically. Please do not pay again.';
    var demo = res && res.status === 'awaiting_payment'
      ? '<div class="notice"><p><strong>Demo only:</strong> the real payment provider sends this confirmation automatically. Press the button to simulate it.</p>' +
        '<button class="btn btn-solid" type="button" data-do="demo-pay" data-id="' + res.id + '">Simulate provider confirmation</button></div>'
      : '';
    main.innerHTML = head('Payment for ' + inq.ref, title, text) + noticeHtml() + demo +
      '<p class="hint">Last checked ' + new Date().toLocaleTimeString('en-GB') + '</p>' +
      '<div class="actions"><a class="btn btn-line" href="' + base + 'portal/booking.html?id=' + inq.id + '">Back to booking</a></div>';
    if (!done && !expired) timer = setTimeout(render, 5000);
  }

  /* ---------- messages ---------- */
  function renderMessages() {
    var rows = EH.listFor(session);
    var id = qs('id') || (rows[0] ? rows[0].inquiry.id : '');
    if (!id) {
      main.innerHTML = head('Messages', 'Messages', 'Send us a message about your booking.') +
        '<div class="empty">You have no bookings yet, so there is nothing to message about.</div>';
      return;
    }
    var data = EH.getFor(session, id);
    if (!data) { main.innerHTML = notFound(); return; }

    var links = '<nav class="toc" aria-label="Your bookings">' + rows.map(function (r) {
      var on = r.inquiry.id === id ? ' aria-current="true"' : '';
      return '<a href="messages.html?id=' + r.inquiry.id + '"' + on + '>' + esc(r.inquiry.ref) + '</a>';
    }).join('') + '</nav>';

    var thread = (readJSON(MSG_KEY, {})[id]) || [];
    var bubbles = thread.length
      ? thread.map(function (m) {
          var mine = m.from === 'customer';
          return '<div class="bubble ' + (mine ? 'mine' : 'theirs') + '"><p class="bubble-meta">' +
            (mine ? 'You' : 'EventHall') + ' &middot; ' + fWhen(m.at) + '</p><p>' + esc(m.text) + '</p></div>';
        }).join('')
      : '<p class="hint">No messages yet. Write to us below and our team will reply here.</p>';

    main.innerHTML = head('Messages', data.inquiry.ref, 'Messages about this booking are shared with our team.') +
      links + noticeHtml() +
      '<section class="card thread" aria-live="polite">' + bubbles + '</section>' +
      '<form id="msg-form" class="form note-block" novalidate>' +
        '<input type="hidden" name="id" value="' + esc(id) + '">' +
        '<div class="field"><label for="msg-text">Your message</label>' +
        '<textarea id="msg-text" name="text" maxlength="1000" required></textarea></div>' +
        '<div><button class="btn btn-solid" type="submit">Send message</button></div>' +
      '</form>';
  }

  function sendMessage(form) {
    var id = form.elements['id'].value;
    var text = form.elements['text'].value.trim();
    if (!text) { setNotice('Please write a message first.', 'error'); render(); return; }
    var all = readJSON(MSG_KEY, {});
    all[id] = all[id] || [];
    all[id].push({ from: 'customer', text: text, at: Date.now() });
    writeJSON(MSG_KEY, all);
    setNotice('Message sent. Our team will reply here.', 'ok');
    render();
  }

  /* ---------- profile ---------- */
  function renderProfile() {
    var rows = EH.listFor(session);
    var latest = rows[0] ? rows[0].inquiry : null;
    var prefs = readJSON(PREF_KEY, { marketing: false });
    var reqs = readJSON(REQ_KEY, []).filter(function (r) { return r.email === session.email; });

    var html = head('Profile', 'Your details', 'Your contact details, preferences and privacy requests.') + noticeHtml() +
      '<div class="two">' +
        '<section class="card"><h2>Contact details</h2><dl class="dl">' +
          '<dt>Name</dt><dd>' + esc(session.name) + '</dd>' +
          '<dt>Email</dt><dd>' + esc(session.email) + '</dd>' +
          '<dt>Phone</dt><dd>' + esc(latest && latest.phone ? latest.phone : 'Not given') + '</dd>' +
        '</dl><p class="hint" style="margin-top:1rem">To change details on an existing booking, send us a message from that booking so our team can update it.</p></section>' +
        '<section class="card"><h2>Contact preferences</h2>' +
          '<label class="check" for="pref-marketing"><input type="checkbox" id="pref-marketing"' + (prefs.marketing ? ' checked' : '') + '>' +
          '<span>Send me occasional news and offers.</span></label>' +
          '<p class="hint" style="margin-top:1rem">You can change this at any time. Messages about your bookings are always sent.</p>' +
        '</section>' +
      '</div>' +
      '<section class="stack"><h2>Privacy requests</h2>' +
        '<p class="hint">Requests are logged for our team to process under our privacy notice.</p>' +
        '<div class="actions" style="margin-top:0">' +
          '<button class="btn btn-line" type="button" data-do="req" data-req="export">Request a copy of my data</button>' +
          '<button class="btn btn-line" type="button" data-do="req" data-req="delete">Request deletion of my data</button>' +
        '</div>' +
        (reqs.length
          ? table(['Request', 'Received', 'Status'], reqs.map(function (r) {
              return '<tr><th scope="row">' + (r.type === 'export' ? 'Copy of data' : 'Deletion') + '</th><td>' +
                fWhen(r.at) + '</td><td>' + esc(r.status) + '</td></tr>';
            }))
          : '<p class="hint">No privacy requests yet.</p>') +
      '</section>';
    main.innerHTML = html;
  }

  function privacyRequest(type) {
    if (type === 'delete' && !window.confirm('Deletion removes personal details we do not need to keep. Records needed for bookings, payments and legal reasons are kept as the law requires. Continue?')) {
      return;
    }
    var all = readJSON(REQ_KEY, []);
    all.push({ email: session.email, type: type, at: Date.now(), status: 'Received' });
    writeJSON(REQ_KEY, all);
    setNotice(type === 'export' ? 'Your request for a copy of your data has been logged.' : 'Your deletion request has been logged.', 'ok');
  }

  /* ---------- wiring ---------- */
  var views = {
    'portal-payment': renderPaymentReturn,
    'portal-messages': renderMessages,
    'portal-profile': renderProfile
  };

  function render() {
    if (timer) { clearTimeout(timer); timer = null; }
    var fn = views[page];
    if (!fn) return;
    try { fn(); }
    catch (ex) { main.innerHTML = '<p class="flash error">' + esc(ex.message) + '</p>'; }
  }

  main.addEventListener('click', function (e) {
    var b = e.target.closest('[data-do]');
    if (!b) return;
    var action = b.getAttribute('data-do');
    try {
      if (action === 'demo-pay') {
        EH.payDeposit(session, b.getAttribute('data-id'));
        setNotice('Deposit recorded. Our team will confirm your date.', 'ok');
      }
      if (action === 'req') privacyRequest(b.getAttribute('data-req'));
    } catch (ex) {
      setNotice(ex.message, 'error');
    }
    render();
  });

  main.addEventListener('submit', function (e) {
    if (e.target.id !== 'msg-form') return;
    e.preventDefault();
    sendMessage(e.target);
  });

  main.addEventListener('change', function (e) {
    if (e.target.id !== 'pref-marketing') return;
    writeJSON(PREF_KEY, { marketing: e.target.checked });
    setNotice('Preferences saved.', 'ok');
    render();
  });

  render();
})();