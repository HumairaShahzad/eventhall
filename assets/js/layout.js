/* Shared header, footer, theme switch and photo loading for the new pages. */
(function () {
  'use strict';

  var VENUE = {
    name: 'EventHall',
    tagline: 'Beautiful occasions. Effortless bookings.',
    address: 'Your street address, City, Postcode',
    phone: '+00 000 000 0000',
    email: 'hello@eventhall.example',
    hours: 'Monday to Saturday, 10:00 to 18:00. Sunday by appointment.'
  };

   var NAV = [
    { href: 'index.html', label: 'Home', id: 'home' },
    { href: 'spaces.html', label: 'Spaces', id: 'spaces' },
    { href: 'gallery.html', label: 'Gallery', id: 'gallery' },
    { href: 'packages.html', label: 'Packages', id: 'packages' },
    { href: 'contact.html', label: 'Contact', id: 'contact' },
    { href: 'faqs.html', label: 'FAQs', id: 'faqs' },
    { href: 'login.html', label: 'Sign in', id: 'login' }
  ];

  var MOON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var SUN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  var page = document.body.getAttribute('data-page') || '';
  var THEME_KEY = 'eh-theme';

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* storage blocked: keep it for this visit only */ }
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var toLight = theme === 'dark';
    var label = toLight ? 'Switch to light mode' : 'Switch to dark mode';
    btn.innerHTML = toLight ? SUN : MOON;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  function renderHeader(el) {
    if (!el) return;
    var links = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.id === page ? ' aria-current="page"' : '') + '>' + n.label + '</a>';
    }).join('');
    el.innerHTML =
      '<div class="container nav-row">' +
        '<a class="brand" href="index.html"><span class="brand-name">' + VENUE.name + '</span>' +
        '<span class="brand-tag">Beautiful occasions.</span></a>' +
        '<nav class="nav" id="nav" aria-label="Main">' + links + '</nav>' +
        '<div class="nav-actions">' +
          '<button class="icon-btn" id="theme-toggle" type="button"></button>' +
          '<a class="btn btn-solid btn-sm btn-cta" href="inquiry.html">Check your date</a>' +
          '<button class="menu-btn" id="menu-btn" type="button" aria-expanded="false" aria-controls="nav">' +
            '<span class="sr-only">Open menu</span><span class="menu-lines" aria-hidden="true"></span></button>' +
        '</div>' +
      '</div>';

    document.getElementById('theme-toggle').addEventListener('click', function () {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });

    var menu = document.getElementById('menu-btn');
    var nav = document.getElementById('nav');
    menu.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
      menu.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Open menu';
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        menu.setAttribute('aria-expanded', 'false');
        menu.focus();
      }
    });
  }

  function renderFooter(el) {
    if (!el) return;
    var tel = VENUE.phone.replace(/[^+\d]/g, '');
    el.innerHTML =
      '<div class="container foot-grid">' +
        '<div><p class="foot-brand">' + VENUE.name + '</p><p>' + VENUE.tagline + '</p></div>' +
        '<div><h3>Visit</h3><p>' + VENUE.address + '</p><p>' + VENUE.hours + '</p></div>' +
        '<div><h3>Explore</h3><p><a href="spaces.html">Spaces</a><br><a href="gallery.html">Gallery</a><br>' +
          '<a href="packages.html">Packages</a><br><a href="faqs.html">FAQs</a></p></div>' +
        '<div><h3>Contact</h3><p><a href="tel:' + tel + '">' + VENUE.phone + '</a><br>' +
          '<a href="mailto:' + VENUE.email + '">' + VENUE.email + '</a></p>' +
          '<p><a href="inquiry.html">Check your date</a><br><a href="contact.html">Book a tour</a></p></div>' +
      '</div>' +
      '<div class="container foot-bottom"><span>&copy; ' + new Date().getFullYear() + ' ' + VENUE.name + '. All rights reserved.</span>' +
        '<span><a href="policies.html">Booking terms</a> &middot; <a href="policies.html#privacy">Privacy</a> &middot; ' +
        '<a href="policies.html#accessibility">Accessibility</a></span></div>';
  }

  /* Load photos from images.js into any element with data-img="key".
     Only a photo that loads successfully replaces the colour block. */
  function loadPhotos() {
    var map = window.EH_IMAGES || {};
    document.querySelectorAll('[data-img]').forEach(function (el) {
      var src = map[el.getAttribute('data-img')];
      if (!src) return;
      var probe = new Image();
      probe.onload = function () {
        el.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
      };
      probe.src = src;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderHeader(document.getElementById('site-header'));
    renderFooter(document.getElementById('site-footer'));
    setTheme(currentTheme());
    loadPhotos();
  });
})();