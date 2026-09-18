/* Holonograph — shared site chrome behaviour (new build).
   Injects header + footer + Nigel into #siteHeader / #siteFooter mounts, marks the
   active nav from <body data-nav="...">, runs the shared reveal observer and Nigel. */
(function(){
  window.HOLO_ANIM = window.HOLO_ANIM || { dur:420, ease:'cubic-bezier(.2,.8,.2,1)' };
  var A = window.HOLO_ANIM, rs = document.documentElement.style;
  rs.setProperty('--anim-dur', (A.dur/1000)+'s'); rs.setProperty('--anim-ease', A.ease);

  // Google Analytics (GA4) — inject once. home.html/value.html carry their own
  // inline snippet (they don't load site.js); this covers the 6 chromed pages.
  if(!window.gtag && !document.getElementById('ga4-lib')){
    var ga=document.createElement('script'); ga.async=true; ga.id='ga4-lib';
    ga.src='https://www.googletagmanager.com/gtag/js?id=G-MX42B47LTP';
    document.head.appendChild(ga);
    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){ dataLayer.push(arguments); };
    gtag('js', new Date()); gtag('config','G-MX42B47LTP', { client_storage: 'none' });
  }

  // Structured data — Organization + WebSite entity graph on every chromed page
  // (home.html carries its own richer graph incl. SoftwareApplication).
  if(!document.querySelector('script[type="application/ld+json"]')){
    var ld=document.createElement('script'); ld.type='application/ld+json';
    ld.textContent=JSON.stringify({"@context":"https://schema.org","@graph":[
      {"@type":"Organization","@id":"https://holonograph.ai/#org","name":"Precision Innovations LLC","url":"https://precision-innovations.us","brand":"Holonograph","logo":"https://holonograph.ai/holonograph.webp","sameAs":["https://x.com/holonograph","https://www.reddit.com/user/holonograph","https://www.instagram.com/holonograph","https://github.com/holonograph","https://www.npmjs.com/org/holonograph","https://crates.io/users/holonograph"]},
      {"@type":"WebSite","@id":"https://holonograph.ai/#website","url":"https://holonograph.ai/","name":"Holonograph","publisher":{"@id":"https://holonograph.ai/#org"}}
    ]});
    document.head.appendChild(ld);
  }

  var NAV = [
    { key:'product', label:'Product', href:'/' },
    { key:'value',   label:'Value',   href:'value.html' },
    { key:'pricing', label:'Pricing', href:'pricing.html' },
    { key:'docs',    label:'Docs',    href:'docs.html' }
  ];
  var active = document.body.getAttribute('data-nav') || '';

  var header =
    '<div class="wrap"><nav aria-label="Primary">' +
      '<span class="brand"><a class="mark" href="/"><b>H</b>OLONOGRAPH<sup class="tm">&trade;</sup></a>' +
      '<span class="pp">patent&nbsp;pending</span></span>' +
      '<span class="nav-links">' +
        NAV.map(function(n){ return '<a href="'+n.href+'"'+(n.key===active?' class="on"':'')+'>'+n.label+'</a>'; }).join('') +
      '</span>' +
      '<a class="pill" href="contact.html">Request a demo</a>' +
    '</nav></div>';

  var footer =
    '<div class="wrap">' +
      '<div class="footer-grid">' +
        '<div class="f-brand"><span class="mark"><b>H</b>OLONOGRAPH<sup class="tm">&trade;</sup></span>' +
          '<p class="f-tag">The calibrated instrument for agentic behavioral attribution.</p>' +
          '<p class="f-pp">Patent pending</p></div>' +
        '<div class="f-col"><h4>Product</h4><a href="value.html">Value</a><a href="lens-facets.html">Lens facets</a><a href="pricing.html">Pricing</a><a href="docs.html">Docs</a><a href="changelog.html">Changelog</a></div>' +
        '<div class="f-col"><h4>Resources</h4><a href="docs.html">Guide</a><a href="glossary.html">Glossary</a><a href="#">Papers</a></div>' +
        '<div class="f-col"><h4>Company</h4><a href="about.html">About</a><a href="contact.html">Contact</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a></div>' +
      '</div>' +
      '<div class="footer-bar">' +
        '<span>&copy; 2026 Precision Innovations LLC</span><span class="sep">&middot;</span><span>Runs in your infrastructure</span>' +
        '<span class="right"><a href="#" data-nigel-open>Chat with Nigel</a><a href="#">GitHub</a></span>' +
      '</div>' +
    '</div>';

  var h = document.getElementById('siteHeader'); if(h){ h.className='site-header'; h.innerHTML=header; }
  var f = document.getElementById('siteFooter'); if(f){ f.className='site-footer'; f.innerHTML=footer; }

  // reveal observer
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = [].slice.call(document.querySelectorAll('[data-reveal]'));
  if(reduce || !('IntersectionObserver' in window)){ els.forEach(function(e){ e.classList.add('is-in'); }); }
  else {
    // Two observers, because a ratio threshold cannot fire for an element taller than
    // viewport / threshold: at most viewport/height of it is ever on screen. The legal
    // pages (5,000px+) sat at opacity 0 forever on any window under ~800px tall. Tall
    // elements reveal on their first visible pixel; everything else keeps the 15%.
    var mk = function(t){ return new IntersectionObserver(function(en, obs){ en.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('is-in'); obs.unobserve(e.target); } }); }, {threshold:t, rootMargin:'0px 0px -8% 0px'}); };
    var io = mk(.15), ioTall = mk(0), vh = window.innerHeight || 800;
    els.forEach(function(e){ (e.offsetHeight > vh * .8 ? ioTall : io).observe(e); });
  }

  // Nigel lives in nigel.js — one copy, loaded by every page. He used to be
  // duplicated here, in home.html, and in value.html; all three were scripted mocks.
})();
