/* Finance screen for managers and administrators.
   Loads after store.js and app.js. Refunds are recorded through EH.recordRefund. */
(function () {
  'use strict';
  var EH = window.EH;
  var body = document.body;
  var page = body.getAttribute('data-page') || '';
  var base = body.getAttribute('data-base') || '';
  var main = document.getElementById('app-main');
  if (!EH || !main || page !== 'staff-finance') return;
  var session = EH.session();
  if (!session || (session.role !== 'manager' && session.role !== 'admin')) return;

  var STATUS = {
    held: 'Date on hold', awaiting_payment: 'Awaiting deposit', awaiting_approval: 'Awaiting confirmation',
    confirmed: 'Confirmed', expired: 'Hold expired', canceled: 'Canceled', completed: 'Completed'
  };
  var ACTIVE = ['awaiting_payment', 'awaiting_approval', 'confirmed'];
  var FILTERS = [
    ['all', 'All bookings'],
    ['outstanding', 'Balance outstanding'],
    ['paid', 'Paid in full'],
    ['refunded', 'Refunds issued']
  ];
  var filter = 'all';
  var notice = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fDate(ms) { return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function table(heads, rows) {
    return '<div class="table-wrap"><table><thead><tr>' +
      heads.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function stat(value, label) { return '<div class="stat"><strong>' + esc(value) + '</strong><span>' + label + '</span></div>'; }
  function setNotice(msg, kind) { notice = { msg: msg, kind: kind || 'ok' }; }
  function noticeHtml() {
    if (!notice) return '';
    var h = '<p class="flash ' + notice.kind + '">' + esc(notice.msg) + '</p>';
    notice = null;
    return h;
  }

  /* ---------- CSV export ---------- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function units(minor) { return (minor / 100).toFixed(0); }
  function exportCsv(rows) {
    var heads = ['Reference', 'Customer', 'Event date', 'Booking status', 'Total', 'Paid', 'Refunded', 'Balance'];
    var lines = [heads.join(',')].concat(rows.map(function (r) {
      return [r.ref, r.name, fDate(r.eventMs), STATUS[r.status] || r.status,
        units(r.total), units(r.paid), units(r.refunded), units(r.balance)].map(csvCell).join(',');
    }));
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'eventhall-finance-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- screen ---------- */
  function render() {
    var sel = document.getElementById('fin-filter');
    if (sel) filter = sel.value;

    var rows = EH.financeRows(session);
    var sum = function (fn) { return rows.reduce(function (s, r) { return s + fn(r); }, 0); };
    var active = function (r) { return ACTIVE.indexOf(r.status) >= 0; };

    var shown = rows.filter(function (r) {
      if (filter === 'outstanding') return active(r) && r.balance > 0;
      if (filter === 'paid') return r.total > 0 && r.balance === 0;
      if (filter === 'refunded') return r.refunded > 0;
      return true;
    });
    var refundable = rows.filter(function (r) { return r.paid - r.refunded > 0; });

    var html = '<div class="page-head"><div><span class="eyebrow">Finance</span>' +
      '<h1>Payments and balances</h1>' +
      '<p class="lead">Deposits, balances and refunds for every booking. Amounts are in ' + esc(EH.config.currency) + '.</p></div></div>' +
      noticeHtml() +
      '<div class="stats">' +
        stat(EH.money(sum(function (r) { return r.total; })), 'Total invoiced') +
        stat(EH.money(sum(function (r) { return r.paid; })), 'Received') +
        stat(EH.money(sum(function (r) { return r.refunded; })), 'Refunded') +
        stat(EH.money(sum(function (r) { return active(r) ? r.balance : 0; })), 'Balance outstanding') +
      '</div>' +
      '<div class="filter-row"><label for="fin-filter"><strong>Show</strong></label>' +
        '<select id="fin-filter">' + FILTERS.map(function (f) {
          return '<option value="' + f[0] + '">' + esc(f[1]) + '</option>';
        }).join('') + '</select>' +
        '<button class="btn btn-line btn-sm" type="button" data-do="export">Export CSV</button></div>';

    if (!shown.length) {
      html += '<div class="empty">No bookings match this filter.</div>';
    } else {
      html += table(['Reference', 'Customer', 'Event date', 'Booking status', 'Total', 'Paid', 'Refunded', 'Balance'],
        shown.map(function (r) {
          return '<tr><th scope="row">' + esc(r.ref) + '</th><td>' + esc(r.name) + '</td>' +
            '<td>' + fDate(r.eventMs) + '</td><td>' + esc(STATUS[r.status] || r.status) + '</td>' +
            '<td>' + EH.money(r.total) + '</td><td>' + EH.money(r.paid) + '</td>' +
            '<td>' + EH.money(r.refunded) + '</td><td>' + EH.money(r.balance) + '</td></tr>';
        }));
    }

    html += '<section class="stack"><h2>Record a refund</h2>' +
      '<p class="hint">Record a refund only after the cancellation has been approved. In the live system the payment provider sends the money back.</p>';
    if (!refundable.length) {
      html += '<p class="hint">No payments are available to refund.</p>';
    } else {
      html += '<form id="refund-form" class="form" novalidate>' +
        '<p class="form-summary" id="refund-err" role="alert"></p>' +
        '<div class="grid-fields">' +
          '<div class="field"><label for="ref-res">Booking</label><select id="ref-res" name="res">' +
            refundable.map(function (r) {
              return '<option value="' + r.reservationId + '">' +
                esc(r.ref + ', ' + r.name + ' (up to ' + EH.money(r.paid - r.refunded) + ')') + '</option>';
            }).join('') +
          '</select></div>' +
          '<div class="field"><label for="ref-amt">Refund amount (' + esc(EH.config.currency) + ')</label>' +
            '<input id="ref-amt" name="amount" type="number" min="1" step="1" required></div>' +
        '</div>' +
        '<div style="margin-top:1rem"><button class="btn btn-solid" type="submit">Record refund</button></div>' +
      '</form>';
    }
    html += '</section>';
    main.innerHTML = html;
    document.getElementById('fin-filter').value = filter;
  }

  main.addEventListener('click', function (e) {
    var b = e.target.closest('[data-do="export"]');
    if (b) exportCsv(EH.financeRows(session));
  });

  main.addEventListener('submit', function (e) {
    if (e.target.id !== 'refund-form') return;
    e.preventDefault();
    var f = e.target;
    var res = f.elements['res'].value;
    var amount = f.elements['amount'].value;
    if (!amount || Number(amount) <= 0) {
      document.getElementById('refund-err').textContent = 'Enter a refund amount greater than zero.';
      return;
    }
    if (!window.confirm('Record a refund of ' + amount + ' ' + EH.config.currency + '?')) return;
    try {
      EH.recordRefund(session, res, amount);
      setNotice('Refund recorded.', 'ok');
    } catch (ex) {
      setNotice(ex.message, 'error');
    }
    render();
  });

  main.addEventListener('change', function (e) {
    if (e.target.id === 'fin-filter') render();
  });

  render();
})();