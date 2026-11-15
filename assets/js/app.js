/* EventHall portal and admin screens. Requires store.js to load first. */
(function () {
  'use strict';
  var EH = window.EH;
  var body = document.body;
  var page = body.getAttribute('data-page') || '';
  var base = body.getAttribute('data-base') || '';
  var guard = body.getAttribute('data-guard') || '';
  var roles = (body.getAttribute('data-roles') || '').split(',').filter(Boolean);
  var main = document.getElementById('app-main');
  var head = document.getElementById('app-head');

  if (!EH) { if (main) main.innerHTML = '<p class="notice">The data script did not load.</p>'; return; }

  var ROLE_LABEL = { customer: 'Customer', coordinator: 'Coordinator', manager: 'Manager', admin: 'Administrator' };
  var STATUS = {
    new: 'New request', reviewing: 'Under review', quoted: 'Quote sent', converted: 'Converted', closed: 'Closed',
    held: 'Date on hold', awaiting_payment: 'Awaiting deposit', awaiting_approval: 'Awaiting staff confirmation',
    confirmed: 'Confirmed', expired: 'Hold expired', canceled: 'Canceled', completed: 'Completed'
  };
  var QSTATUS = { sent: 'Sent', accepted: 'Accepted', expired: 'Expired', superseded: 'Superseded' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function qs(k) { return new URLSearchParams(location.search).get(k) || ''; }
  function fDate(ms) { return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  function fWhen(ms) { return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function statusOf(inq, res) { var k = res ? res.status : inq.status; return STATUS[k] || k; }
  function table(heads, rows) {
    return '<div class="table-wrap"><table><thead><tr>' +
      heads.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function flash(msg, kind) {
    var el = document.getElementById('flash');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'flash ' + (kind || 'ok');
    el.hidden = !msg;
  }
  function notFound(text) {
    return '<div class="empty">' + (text || 'We could not find that booking, or it is not on your account.') +
      '</div><p><a href="' + base + (guard === 'customer' ? 'portal/index.html' : 'admin/index.html') + '">Go back</a></p>';
  }

  /* ---------- guards ---------- */
  var session = EH.session();
  if (page !== 'login') {
    if (!session) {
      location.replace(base + 'login.html?next=' + encodeURIComponent(location.pathname + location.search));
      return;
    }
    if (guard === 'customer' && session.role !== 'customer') { location.replace(base + 'admin/index.html'); return; }
    if (guard === 'staff' && session.role === 'customer') { location.replace(base + 'portal/index.html'); return; }
  }

  /* ---------- shell ---------- */
  function renderShell() {
    if (!head || !session) return;
    var isCustomer = guard === 'customer';
            var staffLinks = [
      ['Dashboard', base + 'admin/index.html'],
      ['Reservations', base + 'admin/reservations.html'],
      ['Calendar', base + 'admin/calendar.html']
    ];
    if (session.role === 'manager' || session.role === 'admin') {
      staffLinks.push(['Finance', base + 'admin/finance.html']);
    }
    var links = isCustomer
      ? [
          ['My bookings', base + 'portal/index.html'],
          ['Messages', base + 'portal/messages.html'],
          ['Profile', base + 'portal/profile.html'],
          ['Check a date', base + 'inquiry.html']
        ]
      : staffLinks;
    head.innerHTML = '<div class="app-top">' +
      '<a class="app-brand" href="' + base + (isCustomer ? 'portal/index.html' : 'admin/index.html') + '">EventHall</a>' +
      '<nav class="app-nav" aria-label="Main">' +
        links.map(function (l) { return '<a href="' + l[1] + '">' + l[0] + '</a>'; }).join('') +
        '<a href="' + base + 'index.html">Public site</a></nav>' +
      '<div class="app-user"><span class="role-pill">' + ROLE_LABEL[session.role] + '</span> ' +
        '<span>' + esc(session.name) + '</span> ' +
        '<button class="btn btn-ghost btn-sm" type="button" id="logout">Sign out</button></div></div>';
    document.getElementById('logout').addEventListener('click', function () {
      EH.logout();
      location.href = base + 'login.html';
    });
  }

  /* ---------- login ---------- */
  function renderLogin() {
    main.innerHTML = '<div class="login-card">' +
      '<span class="eyebrow">Sign in</span><h1>Welcome back.</h1>' +
      '<p class="hint">Customers go to My bookings. Staff go to the admin dashboard.</p>' +
      '<form id="login-form" class="form" novalidate>' +
        '<p class="form-summary" id="login-err" role="alert"></p>' +
        '<div class="field"><label for="l-email">Email</label>' +
          '<input id="l-email" name="email" type="email" autocomplete="username" required></div>' +
        '<div class="field"><label for="l-pass">Password</label>' +
          '<input id="l-pass" name="password" type="password" autocomplete="current-password" required></div>' +
        '<button class="btn btn-solid" type="submit">Sign in</button>' +
      '</form>' +
      '<div class="notice" style="margin-top:1.5rem"><p><strong>Demo accounts</strong> (prototype only, not secure):</p>' +
        '<ul class="demo-list"><li>customer@demo.test: customer portal</li>' +
        '<li>coordinator@demo.test: coordinator</li><li>manager@demo.test: manager</li>' +
        '<li>admin@demo.test: administrator</li></ul>' +
        '<p>Password for all accounts: <code>demo</code></p></div></div>';
  }
  function doLogin(f) {
    var err = document.getElementById('login-err');
    try {
      var s = EH.login(f.email.value.trim(), f.password.value);
      var next = qs('next');
      var safe = next && next.charAt(0) === '/' && next.charAt(1) !== '/' ? next : '';
      location.href = safe || (s.role === 'customer' ? base + 'portal/index.html' : base + 'admin/index.html');
    } catch (ex) {
      err.textContent = ex.message;
      f.password.value = '';
      f.password.focus();
    }
  }

  /* ---------- customer: bookings list ---------- */
  function renderPortalList() {
    var rows = EH.listFor(session);
    var html = '<div class="page-head"><div><span class="eyebrow">My bookings</span>' +
      '<h1>Your events</h1><p class="lead">Follow each request from quote to confirmation.</p></div>' +
      '<a class="btn btn-solid" href="' + base + 'inquiry.html">Check another date</a></div>' +
      '<p id="flash" class="flash" hidden></p>';
    if (!rows.length) {
      html += '<div class="empty">No requests yet. <a href="' + base + 'inquiry.html">Check your date</a> to get started.</div>';
    } else {
      html += table(['Reference', 'Event', 'Date', 'Guests', 'Status', ''], rows.map(function (r) {
        var i = r.inquiry;
        return '<tr><th scope="row">' + esc(i.ref) + '</th><td>' + esc(EH.eventLabel(i.event)) + '</td>' +
          '<td>' + fDate(i.startMs) + '</td><td>' + i.guests + '</td><td>' + esc(statusOf(i, r.reservation)) + '</td>' +
          '<td><a class="btn btn-line btn-sm" href="' + base + 'portal/booking.html?id=' + i.id + '">View</a></td></tr>';
      }));
    }
    main.innerHTML = html;
  }

  /* ---------- customer: booking detail ---------- */
  function renderPortalBooking() {
    var data = EH.getFor(session, qs('id'));
    if (!data) { main.innerHTML = notFound(); return; }
    var inq = data.inquiry, res = data.reservation, room = data.room;
    var html = '<a href="' + base + 'portal/index.html">&larr; All bookings</a>' +
      '<div class="page-head"><div><span class="eyebrow">Booking ' + esc(inq.ref) + '</span>' +
      '<h1>' + esc(EH.eventLabel(inq.event)) + ', ' + fDate(inq.startMs) + '</h1>' +
      '<p class="lead">Status: <strong>' + esc(statusOf(inq, res)) + '</strong></p></div></div>' +
      '<p id="flash" class="flash" hidden></p>' +
      '<div class="two"><section class="card"><h2>Event details</h2><dl class="dl">' +
        '<dt>Date</dt><dd>' + fDate(inq.startMs) + '</dd>' +
        '<dt>Time</dt><dd>' + inq.start + ' to ' + inq.end + '</dd>' +
        '<dt>Room</dt><dd>' + esc(room.name) + '</dd>' +
        '<dt>Guests</dt><dd>' + inq.guests + '</dd></dl></section>' +
      '<section class="card"><h2>Next step</h2><p>' + nextNote(inq, res, data.quotes) + '</p>';
    if (res && res.status === 'awaiting_payment') {
      var q = data.quotes.filter(function (x) { return x.status === 'accepted'; })[0];
      html += '<p>Deposit due: <strong>' + EH.money(q.depositDue) + '</strong>. Payment counts only once the payment provider confirms it.</p>' +
        '<button class="btn btn-solid" type="button" data-action="pay" data-id="' + res.id + '">Pay deposit</button>' +
        '<p class="hint">Demo only: this button stands in for the provider confirmation.</p>';
    }
    html += '</section></div>' + quotesHtml(data.quotes, true);
    main.innerHTML = html;
  }

  function nextNote(inq, res, quotes) {
    if (res && res.status === 'confirmed') return 'Your booking is confirmed. Reference <strong>' + esc(inq.ref) + '</strong>.';
    if (res && res.status === 'awaiting_approval') return 'Thank you. Our team is confirming your date.';
    if (res && res.status === 'awaiting_payment') return 'Your quote is accepted. Pay the deposit to continue.';
    if (res && res.status === 'expired') return 'The hold on this date has expired. Our team can send a fresh quote.';
    if (res && res.status === 'held') return 'Your date is held while you review the quote below. Our team will confirm once you accept.';
    if (inq.status === 'quoted') return 'Review the quote below and accept it to continue. This does not confirm your date by itself.';
    return 'Our team is reviewing your request. This is not a reservation yet.';
  }

  function quotesHtml(quotes, canAccept) {
    if (!quotes.length) return '<section class="stack"><h2>Quotes</h2><p class="hint">No quote has been sent yet.</p></section>';
    return '<section class="stack"><h2>Quotes</h2>' + quotes.map(function (q) {
      var lines = table(['Item', 'Qty', 'Unit price', 'Amount'], q.lines.map(function (l) {
        return '<tr><th scope="row">' + esc(l.label) + '</th><td>' + l.qty + '</td><td>' + EH.money(l.unit) +
          '</td><td>' + EH.money(l.qty * l.unit) + '</td></tr>';
      }));
      var accept = canAccept && q.status === 'sent'
        ? '<p class="hint">Accepting this quote agrees to its terms and holds your date until the validity time shown.</p>' +
          '<button class="btn btn-solid" type="button" data-action="accept" data-id="' + q.id + '">Accept quote v' + q.version + '</button>'
        : '';
      return '<article class="card quote-card"><h3>Quote v' + q.version + ' <span class="tag">' + QSTATUS[q.status] + '</span></h3>' +
        lines +
        '<dl class="dl"><dt>Subtotal</dt><dd>' + EH.money(q.subtotal) + '</dd>' +
        '<dt>Tax</dt><dd>' + EH.money(q.tax) + '</dd>' +
        '<dt>Total</dt><dd><strong>' + EH.money(q.total) + '</strong></dd>' +
        '<dt>Deposit due</dt><dd>' + (q.depositDue ? EH.money(q.depositDue) : 'None') + '</dd>' +
        '<dt>Valid until</dt><dd>' + fWhen(q.expiresAt) + '</dd></dl>' + accept + '</article>';
    }).join('') + '</section>';
  }

  /* ---------- staff: dashboard ---------- */
  var statusFilter = 'all';
  function renderDashboard() {
    var sel = document.getElementById('status-filter');
    if (sel) statusFilter = sel.value;
    var rows = EH.listFor(session);
    var holds = EH.calendar(session, 365).filter(function (a) { return a.kind === 'hold'; });
    var soon = holds.filter(function (a) { return a.expiresAt - Date.now() < 24 * 3600000; }).length;
    var count = function (fn) { return rows.filter(fn).length; };
    var shown = rows.filter(function (r) {
      var k = r.reservation ? r.reservation.status : r.inquiry.status;
      return statusFilter === 'all' || k === statusFilter;
    });

    var html = '<div class="page-head"><div><span class="eyebrow">Dashboard</span><h1>Today at EventHall</h1>' +
      '<p class="lead">Signed in as ' + esc(ROLE_LABEL[session.role]) + '.</p></div>' +
      (session.role === 'admin' ? '<button class="btn btn-line btn-sm" type="button" data-action="reset">Reset demo data</button>' : '') +
      '</div><p id="flash" class="flash" hidden></p>' +
      '<div class="stats">' +
        stat(count(function (r) { return r.inquiry.status === 'new'; }), 'New requests') +
        stat(soon, 'Holds expiring within 24 hours') +
        stat(count(function (r) { return r.reservation && r.reservation.status === 'awaiting_payment'; }), 'Awaiting deposit') +
        stat(count(function (r) { return r.reservation && r.reservation.status === 'awaiting_approval'; }), 'Ready to confirm') +
        stat(count(function (r) { return r.reservation && r.reservation.status === 'confirmed'; }), 'Confirmed') +
      '</div>' +
      '<div class="filter-row"><label for="status-filter"><strong>Show</strong></label>' +
        '<select id="status-filter">' + option('all', 'All statuses') +
        Object.keys(STATUS).map(function (k) { return option(k, STATUS[k]); }).join('') +
        '</select></div>';

    if (!shown.length) {
      html += '<div class="empty">Nothing matches this filter.</div>';
    } else {
      html += table(['Reference', 'Customer', 'Event date', 'Guests', 'Room', 'Status', 'Next action', ''], shown.map(function (r) {
        var i = r.inquiry;
        var room = EH.rooms().filter(function (x) { return x.id === i.room; })[0];
        return '<tr><th scope="row">' + esc(i.ref) + '</th><td>' + esc(i.name) + '</td><td>' + fDate(i.startMs) + '</td>' +
          '<td>' + i.guests + '</td><td>' + esc(room ? room.name : '') + '</td><td>' + esc(statusOf(i, r.reservation)) + '</td>' +
          '<td>' + esc(i.nextAction) + '</td>' +
          '<td><a class="btn btn-line btn-sm" href="' + base + 'admin/inquiry.html?id=' + i.id + '">Open</a></td></tr>';
      }));
    }
    main.innerHTML = html;
    document.getElementById('status-filter').value = statusFilter;
  }
  function stat(n, label) { return '<div class="stat"><strong>' + n + '</strong><span>' + label + '</span></div>'; }
  function option(v, label) { return '<option value="' + v + '">' + esc(label) + '</option>'; }

  /* ---------- staff: inquiry, quote builder, confirm ---------- */
  function lineRow() {
    return '<div class="line-row">' +
      '<div class="field"><input name="label" aria-label="Item" placeholder="e.g. Grand Hall hire" required></div>' +
      '<div class="field"><input name="qty" aria-label="Quantity" type="number" min="1" value="1"></div>' +
      '<div class="field"><input name="unit" aria-label="Unit price" type="number" min="0" step="1" placeholder="0" required></div>' +
      '<button class="btn btn-line btn-sm" type="button" data-action="remove-line">Remove</button></div>';
  }

  function renderInquiry() {
    var data = EH.getFor(session, qs('id'));
    if (!data) { main.innerHTML = notFound('This inquiry could not be found.'); return; }
    var inq = data.inquiry, res = data.reservation, room = data.room, quotes = data.quotes;
    var locked = res && (res.status === 'awaiting_approval' || res.status === 'confirmed');
    var canQuote = EH.can(session, 'quote') && !locked && inq.status !== 'converted' && inq.status !== 'closed';
    var canConfirm = EH.can(session, 'confirm') && res && res.status === 'awaiting_approval';

    var html = '<a href="' + base + 'admin/index.html">&larr; Dashboard</a>' +
      '<div class="page-head"><div><span class="eyebrow">Inquiry ' + esc(inq.ref) + '</span>' +
      '<h1>' + esc(inq.name) + '</h1>' +
      '<p class="lead">' + esc(EH.eventLabel(inq.event)) + ', ' + fDate(inq.startMs) + ', ' + inq.guests + ' guests</p></div>' +
      '<span class="tag">' + esc(statusOf(inq, res)) + '</span></div>' +
      '<p id="flash" class="flash" hidden></p>' +
      '<div class="two"><section class="card"><h2>Customer and event</h2><dl class="dl">' +
        '<dt>Email</dt><dd>' + esc(inq.email) + '</dd>' +
        '<dt>Phone</dt><dd>' + esc(inq.phone || 'Not given') + '</dd>' +
        '<dt>Room</dt><dd>' + esc(room.name) + '</dd>' +
        '<dt>Time</dt><dd>' + inq.start + ' to ' + inq.end + ' (setup and cleanup buffers added)</dd>' +
        '<dt>Notes</dt><dd>' + esc(inq.notes || 'None') + '</dd></dl></section>' +
      '<section class="card"><h2>Next action</h2><p>' + esc(inq.nextAction) + '</p>';
    if (canConfirm) {
      html += '<button class="btn btn-solid" type="button" data-action="confirm" data-id="' + res.id + '">Confirm reservation</button>' +
        '<p class="hint">The slot and deposit are checked again before confirming.</p>';
    }
    html += '</section></div>';

    if (canQuote) {
      html += '<section class="card" style="margin-top:1.5rem"><h2>Quote builder</h2>' +
        '<form id="quote-form" novalidate><p class="form-summary" id="quote-err" role="alert"></p>' +
        '<div id="lines">' + lineRow() + '</div>' +
        '<div class="actions" style="margin-top:0"><button class="btn btn-line btn-sm" type="button" data-action="add-line">Add line</button></div>' +
        '<p class="hint" style="margin:1rem 0">Enter prices in whole ' + EH.config.currency + '. Tax, total and deposit are calculated by the system. ' +
        'Sending a quote places a hold for ' + (EH.config.holdMs / 3600000) + ' hours; the hold is not a confirmation.</p>' +
        '<button class="btn btn-solid" type="submit">Send quote</button></form></section>';
    }
    html += quotesHtml(quotes, false);
    if (data.payments.length) {
      html += '<section class="stack"><h2>Payments</h2>' + table(['Amount', 'Status', 'Provider', 'Recorded'],
        data.payments.map(function (p) {
          return '<tr><td>' + EH.money(p.amount) + '</td><td>' + esc(p.status) + '</td><td>' + esc(p.provider) +
            '</td><td>' + fWhen(new Date(p.createdAt).getTime()) + '</td></tr>';
        })) + '</section>';
    }
    main.innerHTML = html;
  }

  /* ---------- staff: calendar ---------- */
  function renderCalendar() {
    var items = EH.calendar(session, 30);
    var html = '<div class="page-head"><div><span class="eyebrow">Calendar</span><h1>Next 30 days</h1>' +
      '<p class="lead">Times include setup and cleanup buffers. Holds expire automatically.</p></div></div>';
    if (!items.length) {
      html += '<div class="empty">No bookings or holds in the next 30 days.</div>';
    } else {
      html += table(['Room', 'From', 'To', 'Type', 'Reference', 'Guests', 'Hold expires'], items.map(function (i) {
        var hold = i.kind === 'hold';
        return '<tr><th scope="row">' + esc(i.room) + '</th><td>' + fWhen(i.start) + '</td><td>' + fWhen(i.end) + '</td>' +
          '<td>' + (hold ? 'Hold (tentative)' : 'Confirmed reservation') + '</td><td>' + esc(i.ref) + '</td><td>' + i.guests +
          '</td><td>' + (hold ? fWhen(i.expiresAt) : 'Not applicable') + '</td></tr>';
      }));
    }
    main.innerHTML = html;
  }

  /* ---------- events ---------- */
  function sendQuoteFromForm() {
    var err = document.getElementById('quote-err');
    var rows = [].slice.call(document.querySelectorAll('#lines .line-row')).map(function (r) {
      return { label: r.querySelector('[name=label]').value, qty: r.querySelector('[name=qty]').value, unit: r.querySelector('[name=unit]').value };
    });
    try {
      var q = EH.sendQuote(session, qs('id'), rows);
      render();
      flash('Quote v' + q.version + ' sent. The date is on hold until ' + fWhen(q.expiresAt) + '.', 'ok');
    } catch (ex) {
      err.textContent = ex.message;
    }
  }

  function act(name, el) {
    var msg, kind = 'ok';
    if (name === 'add-line') { document.getElementById('lines').insertAdjacentHTML('beforeend', lineRow()); return; }
    if (name === 'remove-line') { el.closest('.line-row').remove(); return; }
    if (name === 'reset') {
      if (window.confirm('Reset all demo data? This cannot be undone.')) { EH.reset(); location.reload(); }
      return;
    }
    try {
      var id = el.getAttribute('data-id');
      if (name === 'accept') { EH.acceptQuote(session, id); msg = 'Quote accepted. Your date is held while the next step is completed.'; }
      if (name === 'pay') { EH.payDeposit(session, id); msg = 'Deposit recorded. Our team will now confirm your date.'; }
      if (name === 'confirm') { EH.confirmReservation(session, id); msg = 'Reservation confirmed.'; }
    } catch (ex) { msg = ex.message; kind = 'error'; }
    render();
    flash(msg, kind);
  }

  var views = {
    'login': renderLogin,
    'portal-bookings': renderPortalList,
    'portal-booking': renderPortalBooking,
    'admin-dashboard': renderDashboard,
    'admin-inquiry': renderInquiry,
    'admin-calendar': renderCalendar
  };
  function render() {
    if (!main) return;
    var fn = views[page];
    if (!fn) return;
    try { fn(); }
    catch (ex) { main.innerHTML = '<p class="flash error">' + esc(ex.message) + '</p>'; }
  }

  if (main) {
    main.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (b) act(b.getAttribute('data-action'), b);
    });
    main.addEventListener('submit', function (e) {
      e.preventDefault();
      if (e.target.id === 'login-form') doLogin(e.target);
      if (e.target.id === 'quote-form') sendQuoteFromForm();
    });
    main.addEventListener('change', function (e) {
      if (e.target.id === 'status-filter') renderDashboard();
    });
  }

  if (page !== 'login' && guard) renderShell();
  if (roles.length && session && roles.indexOf(session.role) < 0) {
    main.innerHTML = '<div class="empty">Your role does not have access to this page.</div>';
    return;
  }
  render();
})();