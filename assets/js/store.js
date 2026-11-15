/* EventHall prototype data layer (browser only, localStorage).
   Demonstrates the booking rules: buffers, half-open overlap, hold expiry,
   versioned quotes, deposit gating and staff confirmation.
   NOT SECURE. The real system must enforce every rule on the server. */
(function () {
  'use strict';

  var KEY = 'eh_proto_v1';
  var SESSION_KEY = 'eh_proto_session';
  var HOUR = 3600000, DAY = 86400000;

  var CONFIG = {
    currency: 'PKR',
    bufferMs: HOUR,        // setup and cleanup, added each side of an event
    holdMs: 48 * HOUR,     // hold length when a quote is sent or accepted
    depositBps: 3000,      // 30% deposit (0 = no deposit)
    taxBps: 0              // tax rate in basis points (1800 = 18%)
  };

  var ROLE_PERMS = {
    customer: [],
    coordinator: ['inquiry', 'quote', 'calendar'],
    manager: ['inquiry', 'quote', 'calendar', 'confirm', 'audit', 'finance', 'refund'],
    admin: ['inquiry', 'quote', 'calendar', 'confirm', 'audit', 'users', 'finance', 'refund']
  };

  // DEMO accounts only. Plain-text passwords. Replace with real identity.
  var USERS = [
    { email: 'customer@demo.test', name: 'Amara Khan', role: 'customer', password: 'demo' },
    { email: 'coordinator@demo.test', name: 'Sana Ali', role: 'coordinator', password: 'demo' },
    { email: 'manager@demo.test', name: 'Omar Sheikh', role: 'manager', password: 'demo' },
    { email: 'admin@demo.test', name: 'Hina Raza', role: 'admin', password: 'demo' }
  ];

  var ROOMS = [
    { id: 'grand', name: 'The Grand Hall', seated: 250, standing: 350 },
    { id: 'garden', name: 'The Garden Room', seated: 120, standing: 160 },
    { id: 'ivory', name: 'The Ivory Suite', seated: 50, standing: 80 }
  ];

  var EVENT_LABEL = {
    wedding: 'Wedding', birthday: 'Birthday or milestone', corporate: 'Corporate event',
    private: 'Private party', other: 'Something else'
  };

  /* ---------- helpers ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fail(code, msg) { var e = new Error(msg); e.code = code; throw e; }
  function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }
  function ref() { return 'EH-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
  function now() { return Date.now(); }
  function iso(ms) { return new Date(ms).toISOString(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function find(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function roomOf(d, id) { return find(d.rooms, id); }
  function resFor(d, inqId) { return d.reservations.filter(function (r) { return r.inquiryId === inqId; }).slice(-1)[0] || null; }
  function toMs(date, time) {
    var p = date.split('-').map(Number), t = time.split(':').map(Number);
    return new Date(p[0], p[1] - 1, p[2], t[0], t[1]).getTime();
  }
  function audit(d, actor, action, detail) {
    d.audit.unshift({ at: iso(now()), actor: actor ? actor.email : 'public', action: action, detail: detail || '' });
    if (d.audit.length > 500) d.audit.length = 500;
  }

  /* ---------- inquiry validation ---------- */
  function conflicts(d, roomId, start, end, ignoreResId) {
    return d.allocations.some(function (a) {
      return a.active && a.room === roomId && a.reservationId !== ignoreResId && a.start < end && start < a.end;
    });
  }

  function buildInquiry(d, input) {
    var first = (input.first || '').trim(), last = (input.last || '').trim();
    var email = (input.email || '').trim().toLowerCase();
    var guests = parseInt(input.guests, 10);
    if (!first || !last) fail(422, 'Please enter your first and last name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(422, 'Enter a valid email address.');
    if (!(guests >= 1)) fail(422, 'Enter at least 1 guest.');
    if (!input.date || !input.start || !input.end) fail(422, 'Choose a date and start and end times.');
    var start = toMs(input.date, input.start), end = toMs(input.date, input.end);
    if (isNaN(start) || isNaN(end)) fail(422, 'Enter a valid date and time.');
    if (end <= start) end += DAY; // overnight event
    if (start < now()) fail(422, 'Choose today or a future date.');

    var chosen = null;
    var bStart = start - CONFIG.bufferMs, bEnd = end + CONFIG.bufferMs;
    if (input.room !== 'any') {
      var r = roomOf(d, input.room);
      if (!r) fail(422, 'Choose a room.');
      if (guests > r.standing) fail(422, r.name + ' holds up to ' + r.standing + ' guests. Choose a larger room or a smaller group.');
      if (conflicts(d, r.id, bStart, bEnd, null)) fail(409, 'Sorry, ' + r.name + ' is not available at that time. Try another time or room.');
      chosen = r;
    } else {
      chosen = d.rooms.filter(function (rm) {
        return guests <= rm.standing && !conflicts(d, rm.id, bStart, bEnd, null);
      })[0];
      if (!chosen) fail(409, 'No room is available at that time. Try another date or time.');
    }
    return {
      id: uid('inq'), ref: ref(), status: 'new',
      first: first, last: last, name: first + ' ' + last, email: email,
      phone: (input.phone || '').trim(), event: input.eventType || 'other',
      date: input.date, start: input.start, end: input.end,
      startMs: start, endMs: end, guests: guests,
      room: chosen.id, roomRequest: input.room, notes: (input.notes || '').trim(),
      createdAt: iso(now()), nextAction: 'Review request and prepare a quote'
    };
  }

  function seed() {
    var d = { rooms: clone(ROOMS), inquiries: [], quotes: [], reservations: [], allocations: [], payments: [], audit: [] };
    var when = new Date(now() + 30 * DAY);
    var date = [when.getFullYear(), pad(when.getMonth() + 1), pad(when.getDate())].join('-');
    d.inquiries.push(buildInquiry(d, {
      first: 'Amara', last: 'Khan', email: 'customer@demo.test', phone: '+92 300 0000000',
      eventType: 'wedding', date: date, start: '17:00', end: '23:00', guests: 200, room: 'grand',
      notes: 'Sample request for the demo.'
    }));
    return d;
  }

  /* ---------- storage and expiry ---------- */
  function read() {
    try { var raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return seed();
  }
  function write(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { fail(500, 'Browser storage is unavailable.'); }
  }
  function sweep(d) {
    var t = now();
    d.quotes.forEach(function (q) { if (q.status === 'sent' && q.expiresAt <= t) q.status = 'expired'; });
    d.allocations.forEach(function (a) { if (a.active && a.kind === 'hold' && a.expiresAt <= t) a.active = false; });
    d.reservations.forEach(function (r) {
      if (r.status === 'held' || r.status === 'awaiting_payment') {
        var al = find(d.allocations, r.allocationId);
        if (!al || !al.active) r.status = 'expired';
      }
    });
  }
  function load() { var d = read(); sweep(d); write(d); return d; }

  /* ---------- session and permissions ---------- */
  function session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
  function login(email, password) {
    var u = USERS.filter(function (x) { return x.email === String(email).toLowerCase(); })[0];
    if (!u || u.password !== password) fail(401, 'Email or password is not correct.');
    var s = { email: u.email, name: u.name, role: u.role };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return s;
  }
  function logout() { localStorage.removeItem(SESSION_KEY); }
  function can(actor, perm) { return !!actor && (ROLE_PERMS[actor.role] || []).indexOf(perm) >= 0; }
  function requirePerm(actor, perm) { if (!can(actor, perm)) fail(403, 'Your role does not allow this action.'); }

  /* ---------- public: inquiry ---------- */
  function createInquiry(input) {
    var d = load();
    var inq = buildInquiry(d, input);
    d.inquiries.unshift(inq);
    audit(d, null, 'inquiry.created', inq.ref);
    write(d);
    return clone(inq);
  }

  /* ---------- staff: quotes ---------- */
  function sendQuote(actor, inquiryId, lines) {
    requirePerm(actor, 'quote');
    var d = load();
    var inq = find(d.inquiries, inquiryId);
    if (!inq) fail(404, 'Inquiry not found.');
    if (inq.status === 'converted' || inq.status === 'closed') fail(409, 'This inquiry is closed.');
    var blocking = d.reservations.filter(function (r) {
      return r.inquiryId === inq.id && (r.status === 'awaiting_approval' || r.status === 'confirmed');
    })[0];
    if (blocking) fail(409, 'This booking is already ' + blocking.status.replace('_', ' ') + '. Use a change request to alter it.');

    var clean = (lines || []).filter(function (l) { return (l.label || '').trim(); }).map(function (l) {
      var qty = Math.max(1, parseInt(l.qty, 10) || 1);
      var unit = Math.round((Number(l.unit) || 0) * 100);
      if (unit < 0) fail(422, 'Prices cannot be negative.');
      return { label: l.label.trim(), qty: qty, unit: unit };
    });
    if (!clean.length) fail(422, 'Add at least one line item with a label.');

    var subtotal = clean.reduce(function (s, l) { return s + l.qty * l.unit; }, 0);
    var tax = Math.round(subtotal * CONFIG.taxBps / 10000);
    var total = subtotal + tax;
    var depositDue = Math.round(total * CONFIG.depositBps / 10000);
    var expiresAt = now() + CONFIG.holdMs;

    var res = resFor(d, inq.id);
    if (res && res.status !== 'held' && res.status !== 'awaiting_payment' && res.status !== 'expired') res = null;
    if (!res) {
      res = { id: uid('res'), inquiryId: inq.id, room: inq.room, status: 'held', allocationId: null, depositPaid: false };
      d.reservations.push(res);
    }
    if (res.allocationId) { var old = find(d.allocations, res.allocationId); if (old) old.active = false; }

    var bStart = inq.startMs - CONFIG.bufferMs, bEnd = inq.endMs + CONFIG.bufferMs;
    if (conflicts(d, inq.room, bStart, bEnd, res.id)) {
      fail(409, 'This slot now overlaps another booking. Choose another date or room before sending a quote.');
    }
    var alloc = { id: uid('al'), room: inq.room, start: bStart, end: bEnd, kind: 'hold',
      reservationId: res.id, active: true, expiresAt: expiresAt };
    d.allocations.push(alloc);
    res.allocationId = alloc.id;
    res.status = 'held';

    d.quotes.forEach(function (q) {
      if (q.inquiryId === inq.id && (q.status === 'sent' || q.status === 'accepted')) q.status = 'superseded';
    });
    var version = d.quotes.filter(function (q) { return q.inquiryId === inq.id; }).length + 1;
    var quote = { id: uid('q'), inquiryId: inq.id, reservationId: res.id, version: version, lines: clean,
      subtotal: subtotal, tax: tax, total: total, depositDue: depositDue, status: 'sent',
      createdAt: iso(now()), expiresAt: expiresAt, sentBy: actor.email };
    d.quotes.push(quote);
    inq.status = 'quoted';
    inq.nextAction = 'Waiting for customer to accept quote v' + version;
    audit(d, actor, 'quote.sent', 'v' + version + ' for ' + inq.ref);
    write(d);
    return clone(quote);
  }

  /* ---------- customer: accept and pay ---------- */
  function acceptQuote(actor, quoteId) {
    if (!actor || actor.role !== 'customer') fail(403, 'Only customers can accept quotes.');
    var d = load();
    var q = find(d.quotes, quoteId);
    if (!q) fail(404, 'Quote not found.');
    var inq = find(d.inquiries, q.inquiryId);
    if (inq.email !== actor.email) fail(403, 'This quote is not on your account.');
    if (q.status !== 'sent') fail(409, 'This quote is ' + q.status + '. Ask our team for a new quote.');
    var res = find(d.reservations, q.reservationId);
    var al = find(d.allocations, res.allocationId);
    if (!al || !al.active) fail(409, 'The hold on this date has expired. Ask our team for a new quote.');

    q.status = 'accepted';
    q.acceptedAt = iso(now());
    q.acceptedBy = actor.email;
    al.expiresAt = now() + CONFIG.holdMs; // hold stays while the deposit is paid
    res.status = q.depositDue > 0 ? 'awaiting_payment' : 'awaiting_approval';
    inq.nextAction = q.depositDue > 0 ? 'Waiting for deposit' : 'Staff to confirm';
    audit(d, actor, 'quote.accepted', 'v' + q.version + ' for ' + inq.ref);
    write(d);
    return clone(q);
  }

  // DEMO ONLY: stands in for a verified payment provider webhook.
  function payDeposit(actor, reservationId) {
    if (!actor || actor.role !== 'customer') fail(403, 'Only customers can pay a deposit here.');
    var d = load();
    var res = find(d.reservations, reservationId);
    if (!res) fail(404, 'Booking not found.');
    var inq = find(d.inquiries, res.inquiryId);
    if (inq.email !== actor.email) fail(403, 'This booking is not on your account.');
    if (res.status !== 'awaiting_payment') fail(409, 'No deposit is due for this booking.');
    var q = d.quotes.filter(function (x) { return x.reservationId === res.id && x.status === 'accepted'; })[0];
    d.payments.push({ id: uid('pay'), reservationId: res.id, amount: q.depositDue, status: 'succeeded',
      provider: 'demo', createdAt: iso(now()) });
    res.status = 'awaiting_approval';
    res.depositPaid = true;
    inq.nextAction = 'Staff to confirm';
    audit(d, actor, 'payment.succeeded', 'demo provider confirmation for ' + inq.ref);
    write(d);
    return clone(res);
  }

  /* ---------- staff: confirm ---------- */
  function confirmReservation(actor, reservationId) {
    requirePerm(actor, 'confirm');
    var d = load();
    var res = find(d.reservations, reservationId);
    if (!res) fail(404, 'Reservation not found.');
    if (res.status !== 'awaiting_approval') fail(409, 'This reservation is ' + res.status.replace('_', ' ') + ' and cannot be confirmed yet.');
    var q = d.quotes.filter(function (x) { return x.reservationId === res.id && x.status === 'accepted'; })[0];
    if (!q) fail(409, 'No accepted quote on this reservation.');
    if (q.depositDue > 0 && !res.depositPaid) fail(409, 'The deposit has not been received.');
    var al = find(d.allocations, res.allocationId);
    if (!al || !al.active) fail(409, 'The hold has expired. The slot must be quoted again.');
    if (conflicts(d, res.room, al.start, al.end, res.id)) {
      fail(409, 'The slot now conflicts with another booking. Do not confirm; offer alternatives.');
    }
    al.kind = 'reservation';
    al.expiresAt = null;
    res.status = 'confirmed';
    res.confirmedBy = actor.email;
    res.confirmedAt = iso(now());
    var inq = find(d.inquiries, res.inquiryId);
    inq.status = 'converted';
    inq.nextAction = 'Confirmed';
    audit(d, actor, 'reservation.confirmed', inq.ref);
    write(d);
    return clone(res);
  }

  /* ---------- reads ---------- */
  function listFor(actor) {
    var d = load();
    return d.inquiries.filter(function (inq) {
      return actor.role !== 'customer' || inq.email === actor.email;
    }).map(function (inq) {
      var res = resFor(d, inq.id);
      return { inquiry: clone(inq), reservation: res ? clone(res) : null };
    });
  }

  function getFor(actor, inquiryId) {
    var d = load();
    var inq = find(d.inquiries, inquiryId);
    if (!inq) return null;
    if (actor.role === 'customer' && inq.email !== actor.email) return null;
    if (actor.role !== 'customer' && !can(actor, 'inquiry')) return null;
    var res = resFor(d, inq.id);
    return {
      inquiry: clone(inq),
      reservation: res ? clone(res) : null,
      room: clone(roomOf(d, inq.room)),
      quotes: clone(d.quotes.filter(function (q) { return q.inquiryId === inq.id; })
        .sort(function (a, b) { return b.version - a.version; })),
      payments: res ? clone(d.payments.filter(function (p) { return p.reservationId === res.id; })) : []
    };
  }

  function calendar(actor, days) {
    requirePerm(actor, 'calendar');
    var d = load(), t = now(), end = t + days * DAY;
    return d.allocations
      .filter(function (a) { return a.active && a.end > t && a.start < end; })
      .sort(function (a, b) { return a.start - b.start; })
      .map(function (a) {
        var res = find(d.reservations, a.reservationId);
        var inq = res ? find(d.inquiries, res.inquiryId) : null;
        return { room: (roomOf(d, a.room) || {}).name, start: a.start, end: a.end, kind: a.kind,
          expiresAt: a.expiresAt, ref: inq ? inq.ref : '', guests: inq ? inq.guests : '' };
      });
  }

  function auditLog(actor) {
    requirePerm(actor, 'audit');
    return clone(load().audit.slice(0, 200));
  }

  function money(minor) {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: CONFIG.currency,
      minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(minor / 100);
  }

  function reset() { localStorage.removeItem(KEY); }
    /* ---------- finance ---------- */
  function paidTotal(d, resId) {
    return d.payments
      .filter(function (p) { return p.reservationId === resId && (p.kind || 'payment') === 'payment' && p.status === 'succeeded'; })
      .reduce(function (s, p) { return s + p.amount; }, 0);
  }

  function refundedTotal(d, resId) {
    return d.payments
      .filter(function (p) { return p.reservationId === resId && p.kind === 'refund'; })
      .reduce(function (s, p) { return s + p.amount; }, 0);
  }

  function financeRows(actor) {
    requirePerm(actor, 'finance');
    var d = load();
    return d.reservations.map(function (res) {
      var inq = find(d.inquiries, res.inquiryId);
      var accepted = d.quotes.filter(function (x) { return x.reservationId === res.id && x.status === 'accepted'; })[0] || null;
      var paid = paidTotal(d, res.id);
      var refunded = refundedTotal(d, res.id);
      var total = accepted ? accepted.total : 0;
      return {
        reservationId: res.id, ref: inq.ref, name: inq.name, status: res.status,
        eventMs: inq.startMs, total: total, depositDue: accepted ? accepted.depositDue : 0,
        paid: paid, refunded: refunded,
        balance: Math.max(0, total - (paid - refunded))
      };
    }).filter(function (r) { return r.total > 0 || r.paid > 0; });
  }

  // Records a refund against a booking. amountWhole is in whole currency units.
  function recordRefund(actor, reservationId, amountWhole) {
    requirePerm(actor, 'refund');
    var d = load();
    var res = find(d.reservations, reservationId);
    if (!res) fail(404, 'Reservation not found.');
    var amount = Math.round((Number(amountWhole) || 0) * 100);
    if (!(amount > 0)) fail(422, 'Enter a refund amount greater than zero.');
    var available = paidTotal(d, res.id) - refundedTotal(d, res.id);
    if (amount > available) fail(422, 'The refund is more than the amount available to refund (' + money(available) + ').');
    var inq = find(d.inquiries, res.inquiryId);
    d.payments.push({ id: uid('ref'), kind: 'refund', reservationId: res.id, amount: amount,
      status: 'succeeded', provider: 'demo', createdAt: iso(now()) });
    audit(d, actor, 'refund.recorded', money(amount) + ' for ' + inq.ref);
    write(d);
    return clone(res);
  }

  window.EH = {
    config: CONFIG,
    financeRows: financeRows, recordRefund: recordRefund,
    login: login, logout: logout, session: session, can: can,
    createInquiry: createInquiry, sendQuote: sendQuote, acceptQuote: acceptQuote,
    payDeposit: payDeposit, confirmReservation: confirmReservation,
    listFor: listFor, getFor: getFor, calendar: calendar, auditLog: auditLog,
    rooms: function () { return load().rooms; },
    eventLabel: function (k) { return EVENT_LABEL[k] || k; },
    money: money, reset: reset
  };
})();