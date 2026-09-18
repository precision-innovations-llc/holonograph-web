/* Nigel — the site guide. Real agent, real backend, watched by his own lens.
 *
 * Replaces the scripted mock that used to live in three places (inline in home.html,
 * inline in value.html, and injected by site.js). One copy now, loaded by every page.
 *
 * Vanilla on purpose. The site is static on Cloudflare Pages with no build step, and
 * a plain fetch beats shipping the Firebase SDK to every visitor for one POST.
 *
 * The endpoint owns every limit. This file never enforces a cap, never counts runs,
 * and never decides what Nigel may say — it renders what the server sends. Client-side
 * limits on a public LLM endpoint are decoration; see NigelPR/docs/ABUSE-CONTROL.md.
 */
(function () {
  /* Endpoint. Set window.NIGEL_ENDPOINT before this script to override.
     On localhost we default to the local Nigel server (NigelPR: npm run serve:local)
     so the widget can be driven for real while the lens is still being cut.
     Everywhere else it is same-origin: /api/nigel is a Pages Function relaying to
     Cloud Run, so Nigel's session cookie is first-party. Called on *.run.app it was
     third-party, and Safari and Firefox dropped it between messages. */
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var ENDPOINT =
    window.NIGEL_ENDPOINT ||
    (LOCAL
      ? 'http://localhost:8787'
      : '/api/nigel');

  var MARKUP =
    '<button class="nigel-fab" id="nigelFab" type="button" aria-label="Chat with Nigel" title="Chat with Nigel">N</button>' +
    '<div class="nigel" id="nigel" role="dialog" aria-label="Nigel" aria-modal="false">' +
      '<div class="nigel-head">' +
        '<span class="nigel-av">N</span>' +
        '<span class="nigel-id"><b>Nigel</b><span>Holonograph guide</span></span>' +
        '<span class="nigel-status" id="nigelStatus"><i></i>online</span>' +
        '<button class="nigel-x" id="nigelClose" type="button" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="nigel-body" id="nigelBody" role="log" aria-live="polite"></div>' +
      '<p class="nigel-note">Messages may appear in the public lens. <a href="/terms.html">Terms</a> &middot; <a href="/privacy.html">Privacy</a></p>' +
      '<form class="nigel-foot" id="nigelForm">' +
        '<input class="nigel-input" id="nigelInput" type="text" autocomplete="off" ' +
          'maxlength="1200" placeholder="Ask Nigel anything…" aria-label="Message Nigel">' +
        '<button class="nigel-send" id="nigelSend" type="submit" aria-label="Send">&rarr;</button>' +
      '</form>' +
    '</div>';

  /* Idempotent: site.js injects on the secondary pages, home/value load this directly. */
  if (document.getElementById('nigel')) return;

  var mount = document.createElement('div');
  mount.innerHTML = MARKUP;
  while (mount.firstChild) document.body.appendChild(mount.firstChild);

  var fab = document.getElementById('nigelFab');
  var panel = document.getElementById('nigel');
  var closeBtn = document.getElementById('nigelClose');
  var body = document.getElementById('nigelBody');
  var form = document.getElementById('nigelForm');
  var input = document.getElementById('nigelInput');
  var send = document.getElementById('nigelSend');
  var status = document.getElementById('nigelStatus');

  var open = false, greeted = false, busy = false, spent = false, restored = false, userClosed = false;
  panel.inert = true;   // closed on load: keep its controls out of the tab order + a11y tree

  /* Panel state lives in sessionStorage so the widget survives a page change.
     Nigel can navigate the visitor, and a chat that vanished the moment he did
     would make the navigation feel like being shown the door. */
  var OPEN_KEY = 'nigel.open';
  function rememberOpen(v) { try { sessionStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch (e) {} }
  function wasOpen() { try { return sessionStorage.getItem(OPEN_KEY) === '1'; } catch (e) { return false; } }

  /* The N is always there. It used to fade in once the hero scrolled away, which
     meant the one thing on the page inviting you to talk to him was missing at the
     exact moment you landed. It hides only while the panel itself is open. */
  function updateFab() { fab.classList.toggle('show', !open); }

  function openPanel() {
    if (open) return;
    open = true;
    panel.classList.add('open');
    panel.inert = false;
    rememberOpen(true);
    updateFab();
    greetOnce();
    /* Don't steal focus on touch — it pops the keyboard over the page. */
    /* preventScroll: focusing the composer must never move the page. It fought the
       cross-page scroll and won, which looked like the scroll simply not working. */
    if (!window.matchMedia('(max-width: 860px)').matches) {
      setTimeout(function () {
        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
      }, 260);
    }
  }

  function closePanel() { open = false; userClosed = true; panel.classList.remove('open'); panel.inert = true; rememberOpen(false); updateFab(); if (fab && panel.contains(document.activeElement)) fab.focus(); }

  [].forEach.call(document.querySelectorAll('[data-nigel-open]'), function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); openPanel(); });
  });
  fab.addEventListener('click', function () { open ? closePanel() : openPanel(); });
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) closePanel(); });

  updateFab();

  /* Auto-open once when a [data-nigel-autoopen] section (the live lens on the homepage) is scrolled
     into view. Respects a manual close: once the visitor closes Nigel, scrolling back in will not
     reopen him. */
  var autoTarget = document.querySelector('[data-nigel-autoopen]');
  if (autoTarget) {
    var autoDone = false;
    var maybeAutoOpen = function () {
      if (autoDone || open || userClosed) return;
      var r = autoTarget.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;   // target not rendered (the lens iframe is hidden < 860px)
      var vh = window.innerHeight || document.documentElement.clientHeight || 800;
      if (r.top <= vh * 0.85) {   // the TOP of the iframe has entered the viewport — fires even on short windows that can't scroll it fully up
        autoDone = true;
        window.removeEventListener('scroll', maybeAutoOpen);
        window.removeEventListener('resize', maybeAutoOpen);
        openPanel();
      }
    };
    window.addEventListener('scroll', maybeAutoOpen, { passive: true });
    window.addEventListener('resize', maybeAutoOpen, { passive: true });
    maybeAutoOpen();
  }

  /* Restore the conversation on every page load. The transcript is server-side and
     keyed on the session cookie, so this is a read of what the visitor already said
     rather than anything the page has to carry across. Costs no run. */
  fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'history' })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var msgs = (data && data.messages) || [];
      if (!msgs.length) return;
      restored = true;
      greeted = true;                       /* do not greet over an existing conversation */
      /* If the greeting won the race and is already on screen, take it back out.
         A restored transcript is the real conversation; the greeting is furniture. */
      body.innerHTML = '';
      msgs.forEach(function (m) {
        bubble(m.content, m.role === 'user' ? 'you' : 'them');
      });
      renderRunsLeft(data.runsLeft);
      if (wasOpen()) openPanel();
    })
    .catch(function () { /* no server, no restore; the widget still works */ })
    .then(runPendingScroll);

  function scrollDown() { body.scrollTop = body.scrollHeight; }

  /* A turn is a labelled bubble. The label matters as much as the colour: a
     transcript has to stay readable in a screenshot, in a narrow column, and to
     someone who cannot tell iris from white. */
  function bubble(text, who) {
    var turn = document.createElement('div');
    turn.className = 'turn ' + (who === 'you' ? 'you' : 'them');

    var label = document.createElement('span');
    label.className = 'turn-who';
    label.textContent = who === 'you' ? 'You' : 'Nigel';

    var m = document.createElement('div');
    m.className = 'msg';
    m.textContent = text;

    turn.appendChild(label);
    turn.appendChild(m);
    body.appendChild(turn);
    scrollDown();
    return turn;
  }

  function typing() {
    var t = document.createElement('div');
    t.className = 'typing';
    t.innerHTML = '<i></i><i></i><i></i>';
    body.appendChild(t);
    scrollDown();
    return t;
  }

  /* The greeting is deferred, which means it can land AFTER a restore that arrives
     while it was waiting — producing "Hello, I look after this site" underneath a
     conversation already in progress. Setting `greeted` at schedule time is not
     enough; the queued callback has to re-check on the way out, because the thing
     that invalidates it happens during the wait. */
  function greetOnce() {
    if (greeted || restored) return;
    greeted = true;
    var t = typing();
    setTimeout(function () {
      t.remove();
      if (restored || body.querySelector('.turn')) return;   // a real turn arrived first
      bubble('Hello. I look after this site. What would you like to know about Holonograph?');
    }, 700);
  }

  function setBusy(on) {
    busy = on;
    input.disabled = on || spent;
    send.disabled = on || spent;
    panel.classList.toggle('is-busy', on);
  }

  /* The run counter is the server's number, not ours. We only render it. */
  function renderRunsLeft(left) {
    if (left === null || left === undefined) return;
    if (left > 3) { status.innerHTML = '<i></i>online'; return; }
    if (left > 0) {
      status.innerHTML = '<i></i>' + left + ' left';
      return;
    }
    spent = true;
    status.innerHTML = '<i class="out"></i>rested';
    input.disabled = true;
    send.disabled = true;
    input.placeholder = 'Nigel is done for now';
  }

  /* Carry out a navigation. The server has already validated the target against the
     site map, so anything arriving here names a real page or a real selector; the
     client's job is only to move.

     The pause is deliberate. Navigating the instant the reply paints means the
     visitor never reads it, and the page change reads as a glitch rather than as
     Nigel taking them somewhere. */
  function act(nav) {
    if (nav.path) {
      rememberOpen(true);                   /* reopen on the far side */
      if (nav.selector) {
        try { sessionStorage.setItem('nigel.scrollTo', nav.selector); } catch (e) {}
      }
      /* No fragment. An invented anchor like #nigel-target does nothing except make
         the URL look broken, and a REAL one would race the selector scroll. */
      setTimeout(function () { location.href = nav.path; }, 1100);
      return;
    }
    if (nav.selector) setTimeout(function () { scrollTo_(nav.selector, true); }, 700);
  }

  /* `smooth` is right for a scroll on a page the visitor is already looking at, and
     wrong immediately after a page load: the [data-reveal] entrance animations shift
     layout underneath it and the browser abandons the scroll partway. On arrival we
     jump, then let the reveals play. */
  function scrollTo_(selector, smooth) {
    var el;
    try { el = document.querySelector(selector); } catch (e) { return; }
    if (!el) return;
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  }

  /* Settle the page BEFORE measuring where to scroll.
     The site fades sections in on scroll, and a section that has not revealed yet
     still shifts layout when it does. Scrolling first and revealing after meant
     measuring against a page that then moved under us, which is how the target
     ended up 900px off. Arriving by an instant jump makes the entrance
     choreography moot anyway, so reveal the lot, then scroll on the next frame. */
  function settlePage() {
    [].forEach.call(document.querySelectorAll('[data-reveal]'), function (e) {
      e.classList.add('is-in');
    });
  }

  /* A scroll requested on the previous page, carried across the navigation.
     Read here, applied only once the restore has settled: reopening the panel
     focuses the composer, and a focus landing after the scroll undoes it. */
  var pendingScroll = null;
  try {
    pendingScroll = sessionStorage.getItem('nigel.scrollTo');
    if (pendingScroll) {
      sessionStorage.removeItem('nigel.scrollTo');
      /* Stop the browser reinstating whatever scroll position it remembers for this
         URL. It was landing a thousand pixels past the target. */
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    }
  } catch (e) {}

  /* Land on the section, once, after everything that could move it has finished.
     Three things fight a cross-page scroll and all of them had to be handled:
       - the browser restoring its own previous scroll position for this URL
       - the [data-reveal] entrance animations changing layout under the scroll
       - the composer taking focus when the panel reopens
     So: disable scroll restoration, wait for load, then one instant jump. */
  function runPendingScroll() {
    if (!pendingScroll) return;
    var sel = pendingScroll;
    pendingScroll = null;

    function land() {
      settlePage();
      /* two frames: one for the class to apply, one for layout to settle */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { scrollTo_(sel, false); });
      });
    }

    if (document.readyState === 'complete') setTimeout(land, 300);
    else window.addEventListener('load', function () { setTimeout(land, 300); }, { once: true });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var message = input.value.trim();
    if (!message || busy || spent) return;

    input.value = '';
    bubble(message, 'you');
    setBusy(true);
    var t = typing();

    fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',          /* the session cookie is HttpOnly + server-minted */
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        t.remove();
        bubble(data.reply || 'I seem to have lost my train of thought. Terribly sorry.');
        renderRunsLeft(data.runsLeft);
        if (data.nav) act(data.nav);
      })
      .catch(function () {
        t.remove();
        bubble('I cannot reach my own brain at the moment. Terribly sorry. Do try again.');
      })
      .then(function () {
        setBusy(false);
        if (!spent && !window.matchMedia('(max-width: 860px)').matches) {
          try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
        }
      });
  });
})();
