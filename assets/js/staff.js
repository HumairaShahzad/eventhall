/* Staff reservation screens: list and booking detail.
   Loads after store.js and app.js. Messages are saved in this browser (prototype). */
(function () {
  'use strict';
  var EH = window.EH;
  var body = document.body;
  var page = body.getAttribute('data-page') || '';
  var base = body.getAttribute('data-base') || '';
  var main = document.getElementById('app-main');
  if (!EH || !main) return;
  var session = EH.session();
  if (!session || session.role === 'customer') return;

  var MSG_KEY = 'eh_proto_messages';
  var STATUS = {
    held: 'Date on hold', awaiting_payment: 'Awaiting deposit', awaiting_approval: 'Awaiting confirmation',
    confirmed: 'Confirmed', expired: 'Hold expired', canceled: 'Canceled', completed: 'Completed'
  };
  var RES_STATUSES = ['held', 'awaiting_payment', 'awaiting_approval', 'confirmed', 'expired', 'canceled', 'completed'];
  var QSTATUS = { sent: 'Sent', accepted: 'Accepted', expired: 'Expired', superseded: 'Superseded' };
  var notice = null;
  var filter = 'all';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function qs(k) { return new URLSearchParams(location.search).get(k) || ''; }
  function fDate(ms) { return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  function fWhen(ms) { return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
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
  function notFound(text) {
    return '<div class="empty">' + (text || 'This reservation could not be found.') + '</div>' +
      '<p><a href="' + base + 'admin/reservations.html">Back to reservations</a></p>';
  }
  function setNotice(msg, kind) { notice = { msg: msg, kind: kind || 'ok' }; }
  function noticeHtml() {
    if (!notice) return '';
    var h = '<p class="flash ' + notice.kind + '">' + esc(notice.msg) + '</p>';
    notice = null;
    return h;
  }
  function roomName(id) {
    var r = EH.rooms().filter(function (x) { return x.id === id; })[0];
    return r ? r.name : '';
  }
  function payLabel(res) {
    if (res.depositPaid) return 'Deposit received';
    if (res.status === 'awaiting_payment') return 'Deposit due';
    if (res.status === 'held') return 'Not yet due';
    if (res.status === 'confirmed') return 'No deposit required';
    return 'Not paid';
  }

  /* ---------- reservations list ---------- */
  function renderReservations() {
    var sel = document.getElementById('res-filter');
    if (sel) filter = sel.value;
    var rows = EH.listFor(session).filter(function (r) { return r.reservation; });
    rows.sort(function (a, b) { return a.inquiry.startMs - b.inquiry.startMs; });
    var shown = rows.filter(function (r) { return filter === 'all' || r.reservation.status === filter; });
    var options = '<option value="all">All statuses</option>' + RES_STATUSES.map(function (s) {
      return '<option value="' + s + '">' + esc(STATUS[s]) + '</option>';
    }).join('');

    var html = head('Reservations', 'Reservations',
      'Every booking with its status and payment position. Open a row for the full history, messages and actions.') +
      noticeHtml() +
      '<div class="filter-row"><label for="res-filter"><strong>Show</strong></label>' +
      '<select id="res-filter">' + options + '</select></div>';

    if (!shown.length) {
      html += '<div class="empty">No reservations match this filter.</div>';
    } else {
      html += table(['Reference', 'Customer', 'Event', 'Room', 'Guests', 'Booking status', 'Payment', ''], shown.map(function (r) {
        var i = r.inquiry, res = r.reservation;
        return '<tr><th scope="row">' + esc(i.ref) + '</th><td>' + esc(i.name) + '</td>' +
          '<td>' + fDate(i.startMs) + '<br><span class="hint">' + i.start + ' to ' + i.end + '</span></td>' +
          '<td>' + esc(roomName(i.room)) + '</td><td>' + i.guests + '</td>' +
          '<td>' + esc(STATUS[res.status] || res.status) + '</td><td>' + payLabel(res) + '</td>' +
          '<td><a class="btn btn-line btn-sm" href="' + base + 'admin/reservation.html?id=' + i.id + '">Open</a></td></tr>';
      }));
    }
    main.innerHTML = html;
    document.getElementById('res-filter').value = filter;
  }

  /* ---------- booking detail ---------- */
  function timelineEvents(data) {
    var ev = [{ at: new Date(data.inquiry.createdAt).getTime(), text: 'Request received' }];
    data.quotes.slice().sort(function (a, b) { return a.version - b.version; }).forEach(function (q) {
      ev.push({ at: new Date(q.createdAt).getTime(), text: 'Quote v' + q.version + ' sent (total ' + EH.money(q.total) + ')' });
      if (q.acceptedAt) ev.push({ at: new Date(q.acceptedAt).getTime(), text: 'Quote v' + q.version + ' accepted by the customer' });
    });
    data.payments.forEach(function (p) {
      ev.push({ at: new Date(p.createdAt).getTime(), text: 'Deposit of ' + EH.money(p.amount) + ' received (' + p.provider + ')' });
    });
    if (data.reservation.confirmedAt) {
      ev.push({ at: new Date(data.reservation.confirmedAt).getTime(), text: 'Reservation confirmed by ' + data.reservation.confirmedBy });
    }
    ev.sort(function (a, b) { return a.at - b.at; });
    return ev;
  }

  function actionNote(res) {
    if (res.status === 'held') return 'Waiting for the customer to accept the quote. The date is on hold until the quote expires.';
    if (res.status === 'awaiting_payment') return 'The quote is accepted. Waiting for the customer to pay the deposit.';
    if (res.status === 'awaiting_approval') return 'The deposit condition is met. Confirm the reservation to finish the booking.';
    if (res.status === 'confirmed') return 'Confirmed by ' + esc(res.confirmedBy) + ' on ' + fWhen(new Date(res.confirmedAt).getTime()) + '.';
    if (res.status === 'expired') return 'The hold expired. Send a new quote from the inquiry to hold the date again.';
    return '';
  }

  function threadHtml(msgs) {
    if (!msgs.length) return '<p class="hint">No messages yet. Replies you send appear in the customer\'s Messages page.</p>';
    return msgs.map(function (m) {
      var mine = m.from === 'staff';
      return '<div class="bubble ' + (mine ? 'mine' : 'theirs') + '"><p class="bubble-meta">' +
        (mine ? 'You (staff)' : 'Customer') + ' &middot; ' + fWhen(m.at) + '</p><p>' + esc(m.text) + '</p></div>';
    }).join('');
  }

  function renderDetail() {
    var data = EH.getFor(session, qs('id'));
    if (!data) { main.innerHTML = notFound(); return; }
    var inq = data.inquiry, res = data.reservation;
    if (!res) {
      main.innerHTML = '<a href="' + base + 'admin/reservations.html">&larr; All reservations</a>' +
        head('Inquiry ' + inq.ref, inq.name, 'No reservation yet. Send a quote to place a hold on this date.') +
        '<p><a class="btn btn-solid" href="' + base + 'admin/inquiry.html?id=' + inq.id + '">Open the inquiry</a></p>';
      return;
    }
    var canConfirm = EH.can(session, 'confirm') && res.status === 'awaiting_approval';
    var msgs = (readJSON(MSG_KEY, {})[inq.id]) || [];
    var quotes = data.quotes;

    var quotesTable = quotes.length
      ? table(['Version', 'Status', 'Total', 'Deposit', 'Valid until'], quotes.map(function (q) {
          return '<tr><th scope="row">v' + q.version + '</th><td>' + QSTATUS[q.status] + '</td><td>' + EH.money(q.total) +
            '</td><td>' + (q.depositDue ? EH.money(q.depositDue) : 'None') + '</td><td>' + fWhen(q.expiresAt) + '</td></tr>';
        }))
      : '<p class="hint">No quote has been sent.</p>';

    var paymentsTable = data.payments.length
      ? table(['Amount', 'Status', 'Provider', 'Recorded'], data.payments.map(function (p) {
          return '<tr><td>' + EH.money(p.amount) + '</td><td>' + esc(p.status) + '</td><td>' + esc(p.provider) +
            '</td><td>' + fWhen(new Date(p.createdAt).getTime()) + '</td></tr>';
        }))
      : '<p class="hint">No payments recorded.</p>';

    var timeline = timelineEvents(data).map(function (e) {
      return '<li><time>' + fWhen(e.at) + '</time><p>' + esc(e.text) + '</p></li>';
    }).join('');

    var html = '<a href="' + base + 'admin/reservations.html">&larr; All reservations</a>' +
      head('Reservation ' + inq.ref, inq.name, EH.eventLabel(inq.event) + ', ' + fDate(inq.startMs) + ', ' + inq.start + ' to ' + inq.end) +
      '<p><span class="tag">' + esc(STATUS[res.status] || res.status) + '</span> <span class="tag">' + payLabel(res) + '</span></p>' +
      noticeHtml() +
      '<div class="detail-grid">' +
        '<div class="detail-main">' +
          '<section class="card"><h2 class="card-title">Booking details</h2><dl class="dl">' +
            '<dt>Date</dt><dd>' + fDate(inq.startMs) + '</dd>' +
            '<dt>Time</dt><dd>' + inq.start + ' to ' + inq.end + ' (buffers included)</dd>' +
            '<dt>Room</dt><dd>' + esc(roomName(inq.room)) + '</dd>' +
            '<dt>Guests</dt><dd>' + inq.guests + '</dd>' +
            '<dt>Customer</dt><dd>' + esc(inq.name) + '</dd>' +
            '<dt>Email</dt><dd>' + esc(inq.email) + '</dd>' +
            '<dt>Phone</dt><dd>' + esc(inq.phone || 'Not given') + '</dd>' +
          '</dl></section>' +
          '<section class="card"><h2 class="card-title">Quotes</h2>' + quotesTable + '</section>' +
          '<section class="card"><h2 class="card-title">Payments</h2>' + paymentsTable + '</section>' +
          '<section class="card"><h2 class="card-title">Messages with the customer</h2>' +
            '<div class="thread-box" aria-live="polite">' + threadHtml(msgs) + '</div>' +
            '<form id="reply-form" class="form reply-form" novalidate>' +
              '<input type="hidden" name="id" value="' + esc(inq.id) + '">' +
              '<div class="field"><label for="reply-text">Reply to customer</label>' +
              '<textarea id="reply-text" name="text" maxlength="1000" required></textarea></div>' +
              '<div><button class="btn btn-solid" type="submit">Send reply</button></div>' +
            '</form>' +
          '</section>' +
        '</div>' +
        '<div class="side">' +
          '<section class="card"><h2 class="card-title">Actions</h2>' +
            '<p>' + actionNote(res) + '</p>' +
            (canConfirm
              ? '<button class="btn btn-solid" type="button" data-do="confirm" data-id="' + res.id + '">Confirm reservation</button>' +
                '<p class="hint" style="margin-top:.8rem">The slot and deposit are checked again before confirming.</p>'
              : (res.status === 'awaiting_approval' && !EH.can(session, 'confirm')
                  ? '<p class="hint">Only a manager or administrator can confirm this reservation.</p>' : '')) +
            '<p style="margin-top:1rem"><a href="' + base + 'admin/inquiry.html?id=' + inq.id + '">Open inquiry and quote builder</a></p>' +
          '</section>' +
          '<section class="card"><h2 class="card-title">History</h2>' +
            (timeline ? '<ol class="timeline">' + timeline + '</ol>' : '<p class="hint">No history yet.</p>') +
          '</section>' +
        '</div>' +
      '</div>';
    main.innerHTML = html;
  }

  /* ---------- wiring ---------- */
  var views = {
    'staff-reservations': renderReservations,
    'staff-reservation': renderDetail
  };

  function render() {
    var fn = views[page];
    if (!fn) return;
    try { fn(); }
    catch (ex) { main.innerHTML = '<p class="flash error">' + esc(ex.message) + '</p>'; }
  }

  main.addEventListener('click', function (e) {
    var b = e.target.closest('[data-do="confirm"]');
    if (!b) return;
    try {
      EH.confirmReservation(session, b.getAttribute('data-id'));
      setNotice('Reservation confirmed. The customer can see this in My bookings.', 'ok');
    } catch (ex) {
      setNotice(ex.message, 'error');
    }
    render();
  });

  main.addEventListener('submit', function (e) {
    if (e.target.id !== 'reply-form') return;
    e.preventDefault();
    var f = e.target;
    var text = f.elements['text'].value.trim();
    if (!text) { setNotice('Please write a reply first.', 'error'); render(); return; }
    var id = f.elements['id'].value;
    var all = readJSON(MSG_KEY, {});
    all[id] = all[id] || [];
    all[id].push({ from: 'staff', by: session.email, text: text, at: Date.now() });
    writeJSON(MSG_KEY, all);
    setNotice('Reply sent. The customer will see it in Messages.', 'ok');
    render();
  });

  main.addEventListener('change', function (e) {
    if (e.target.id === 'res-filter') renderReservations();
  });

  render();
})();