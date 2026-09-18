/* Holonograph — guide chapter sub-nav + version stamping.
   - Builds a compact sticky second row (chapter select + version codes) from the sidebar TOC,
     shown only <=900px (where the sidebar is hidden). CSS lives in guide.css.
   - Fills every [data-guide-version] on the page (article subhead, footer, sub-nav) with the
     CURRENT Lens + SDK versions derived from changelog.json, so the docs track releases. */
(function(){
  function cmp(a, b){ var x=a.split('.').map(Number), y=b.split('.').map(Number); for(var i=0;i<3;i++){ if((x[i]||0)!==(y[i]||0)) return (x[i]||0)-(y[i]||0); } return 0; }
  function fmt(cur){ var l=cur.lens, s=cur.sdk; return (l?'Lens '+l:'') + ((l&&s)?' · ':'') + (s?'SDK '+s:''); }

  function buildSubnav(){
    var sidebar = document.querySelector('.guide-sidebar');
    if(!sidebar || document.querySelector('.guide-subnav')) return;
    var items = [].slice.call(sidebar.querySelectorAll('ol li'));
    if(!items.length) return;
    var header = document.querySelector('.site-header');

    var nav = document.createElement('nav');
    nav.className = 'guide-subnav'; nav.setAttribute('aria-label', 'Guide chapters');

    var sel = document.createElement('select');
    sel.className = 'gs-select'; sel.setAttribute('aria-label', 'Jump to chapter');
    items.forEach(function(li){
      var a = li.querySelector('a'); if(!a) return;
      var href = a.getAttribute('href') || '';
      if(href && !/\.[a-z0-9]+([?#]|$)/i.test(href) && !/\/$/.test(href)) href += '.html'; // clean URL -> .html (works locally and on deploy)
      var num = (li.querySelector('.s-num') || {}).textContent || '';
      var ttl = (li.querySelector('.s-ttl') || a).textContent || '';
      var opt = document.createElement('option');
      opt.value = href;
      opt.textContent = (num ? num.trim() + '  ' : '') + ttl.trim();
      if(li.classList.contains('current')) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function(){ if(sel.value) window.location.href = sel.value; });
    nav.appendChild(sel);

    var ver = document.createElement('span');
    ver.className = 'gs-ver'; ver.setAttribute('data-guide-version', '');
    nav.appendChild(ver);

    if(header && header.parentNode){ header.parentNode.insertBefore(nav, header.nextSibling); }
    else { document.body.insertBefore(nav, document.body.firstChild); }
  }

  function init(){
    buildSubnav();
    fetch('../changelog.json').then(function(r){ return r.json(); }).then(function(data){
      var cur = {};
      (data.releases || []).forEach(function(r){ if(!cur[r.track] || cmp(r.version, cur[r.track]) > 0) cur[r.track] = r.version; });
      var text = fmt(cur);
      if(!text) return;
      [].forEach.call(document.querySelectorAll('[data-guide-version]'), function(el){ el.textContent = text; });
    }).catch(function(){});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
