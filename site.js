/* Holonograph — shared site chrome behaviour (new build).
   Injects header + footer + Nigel into #siteHeader / #siteFooter mounts, marks the
   active nav from <body data-nav="...">, runs the shared reveal observer and Nigel. */
(function(){
  window.HOLO_ANIM = window.HOLO_ANIM || { dur:420, ease:'cubic-bezier(.2,.8,.2,1)' };
  var A = window.HOLO_ANIM, rs = document.documentElement.style;
  rs.setProperty('--anim-dur', (A.dur/1000)+'s'); rs.setProperty('--anim-ease', A.ease);

  var NAV = [
    { key:'product', label:'Product', href:'home.html' },
    { key:'value',   label:'Value',   href:'value.html' },
    { key:'pricing', label:'Pricing', href:'pricing.html' },
    { key:'docs',    label:'Docs',    href:'docs.html' }
  ];
  var active = document.body.getAttribute('data-nav') || '';

  var header =
    '<div class="wrap"><nav>' +
      '<span class="brand"><a class="mark" href="home.html"><b>H</b>OLONOGRAPH</a>' +
      '<span class="pp">patent&nbsp;pending</span></span>' +
      '<span class="nav-links">' +
        NAV.map(function(n){ return '<a href="'+n.href+'"'+(n.key===active?' class="on"':'')+'>'+n.label+'</a>'; }).join('') +
      '</span>' +
      '<a class="pill" href="pricing.html">Get started</a>' +
    '</nav></div>';

  var footer =
    '<div class="wrap">' +
      '<div class="footer-grid">' +
        '<div class="f-brand"><span class="mark"><b>H</b>OLONOGRAPH</span>' +
          '<p class="f-tag">The calibrated instrument for agentic behavioral attribution.</p>' +
          '<p class="f-pp">Patent pending</p></div>' +
        '<div class="f-col"><h4>Product</h4><a href="value.html">Value</a><a href="pricing.html">Pricing</a><a href="docs.html">Docs</a><a href="changelog.html">Changelog</a></div>' +
        '<div class="f-col"><h4>Resources</h4><a href="docs.html">Guide</a><a href="glossary.html">Glossary</a><a href="#">Papers</a></div>' +
        '<div class="f-col"><h4>Company</h4><a href="about.html">About</a><a href="contact.html">Contact</a></div>' +
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
    var io = new IntersectionObserver(function(en){ en.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('is-in'); io.unobserve(e.target); } }); }, {threshold:.15, rootMargin:'0px 0px -8% 0px'});
    els.forEach(function(e){ io.observe(e); });
  }

  // Nigel lives in nigel.js — one copy, loaded by every page. He used to be
  // duplicated here, in home.html, and in value.html; all three were scripted mocks.
})();
