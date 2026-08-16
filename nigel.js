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
  var ENDPOINT = window.NIGEL_ENDPOINT || 'https://nigelchat-XXXXX-uc.a.run.app';

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
  var hero = document.querySelector('[data-hero], .page-hero, .hero');

  var open = false, pastHero = false, greeted = false, busy = false, spent = false;

  function updateFab() { fab.classList.toggle('show', pastHero && !open); }

  function openPanel() {
    if (open) return;
    open = true;
    panel.classList.add('open');
    updateFab();
    greetOnce();
    /* Don't steal focus on touch — it pops the keyboard over the page. */
    if (!window.matchMedia('(max-width: 860px)').matches) setTimeout(function () { input.focus(); }, 260);
  }

  function closePanel() { open = false; panel.classList.remove('open'); updateFab(); }

  [].forEach.call(document.querySelectorAll('[data-nigel-open]'), function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); openPanel(); });
  });
  fab.addEventListener('click', function () { open ? closePanel() : openPanel(); });
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) closePanel(); });

  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { pastHero = !e.isIntersecting; updateFab(); });
    }, { threshold: 0 }).observe(hero);
  } else { pastHero = true; updateFab(); }

  function scrollDown() { body.scrollTop = body.scrollHeight; }

  function bubble(text, who) {
    var m = document.createElement('div');
    m.className = who === 'you' ? 'msg you' : 'msg';
    m.textContent = text;
    body.appendChild(m);
    scrollDown();
    return m;
  }

  function typing() {
    var t = document.createElement('div');
    t.className = 'typing';
    t.innerHTML = '<i></i><i></i><i></i>';
    body.appendChild(t);
    scrollDown();
    return t;
  }

  function greetOnce() {
    if (greeted) return;
    greeted = true;
    var t = typing();
    setTimeout(function () {
      t.remove();
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
      })
      .catch(function () {
        t.remove();
        bubble('I cannot reach my own brain at the moment. Terribly sorry. Do try again.');
      })
      .then(function () {
        setBusy(false);
        if (!spent && !window.matchMedia('(max-width: 860px)').matches) input.focus();
      });
  });
})();
