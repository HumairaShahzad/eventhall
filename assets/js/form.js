/* Validation and submission for the Check your date and Contact forms. */
(function () {
  'use strict';

  function todayISO() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function setError(el, msg) {
    var wrap = el.closest('.field') || el.parentNode;
    var id = el.id + '-error';
    var err = document.getElementById(id);
    if (!err) {
      err = document.createElement('p');
      err.id = id;
      err.className = 'error';
      wrap.appendChild(err);
    }
    err.textContent = msg || '';
    err.hidden = !msg;
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) el.setAttribute('aria-describedby', id); else el.removeAttribute('aria-describedby');
    return !msg;
  }

  function message(form, el) {
    if (el.type === 'checkbox') {
      return el.required && !el.checked ? (el.getAttribute('data-msg') || 'Please tick this box to continue.') : '';
    }
    var v = el.value.trim();
    if (el.required && !v) return 'Please complete this field.';
    if (!v) return '';
    switch (el.name) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter an email address such as name@example.com.';
      case 'phone':
        return /^\+?[\d\s()-]{7,20}$/.test(v) ? '' : 'Enter a phone number with at least 7 digits.';
      case 'date':
        return v < todayISO() ? 'Choose today or a future date.' : '';
      case 'end':
        var s = form.elements['start'];
        return s && s.value && v <= s.value ? 'The end time must be after the start time.' : '';
      case 'guests':
        var n = parseInt(v, 10);
        if (!(n >= 1)) return 'Enter at least 1 guest.';
        var room = form.elements['room'];
        var opt = room && room.selectedOptions[0];
        var max = opt ? parseInt(opt.getAttribute('data-max'), 10) : NaN;
        if (!isNaN(max) && n > max) {
          return 'That room holds up to ' + max + ' guests for this layout. Try another room or a smaller group.';
        }
        return '';
    }
    return '';
  }

  function ref() {
    return 'EH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function submit(form) {
    var type = form.getAttribute('data-form');
    var summary = form.querySelector('.form-summary');
    var f = form.elements;

    if (type === 'inquiry' && window.EH) {
      try {
        var inq = window.EH.createInquiry({
          first: f['first'].value, last: f['last'].value, email: f['email'].value,
          phone: f['phone'].value, eventType: f['event'].value, date: f['date'].value,
          start: f['start'].value, end: f['end'].value, guests: f['guests'].value,
          room: f['room'].value, notes: f['description'].value
        });
        location.href = 'request-received.html?type=inquiry&ref=' + encodeURIComponent(inq.ref);
      } catch (err) {
        if (summary) summary.textContent = err.message;
      }
      return;
    }

    // Contact and tour requests (saved by the backend once it exists).
    var kind = f['topic'] && f['topic'].value === 'tour' ? 'tour' : 'message';
    location.href = 'request-received.html?type=' + kind + '&ref=' + ref();
  }

  function bind(form) {
    var fields = [].slice.call(form.querySelectorAll('input[name],select[name],textarea[name]'));
    var summary = form.querySelector('.form-summary');

    function check(el) { return setError(el, message(form, el)); }

    fields.forEach(function (el) {
      el.addEventListener('blur', function () { el.dataset.touched = '1'; check(el); });
      el.addEventListener('change', function () {
        if (el.dataset.touched) check(el);
        if (el.name === 'room' && form.elements['guests'] && form.elements['guests'].dataset.touched) {
          check(form.elements['guests']);
        }
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var first = null;
      fields.forEach(function (el) {
        el.dataset.touched = '1';
        if (!check(el) && !first) first = el;
      });
      if (first) {
        if (summary) summary.textContent = 'Please correct the highlighted fields to continue.';
        first.focus();
        return;
      }
      if (summary) summary.textContent = '';
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      submit(form);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('input[type="date"]').forEach(function (d) { d.min = todayISO(); });
    document.querySelectorAll('form[data-form]').forEach(bind);
  });
})();