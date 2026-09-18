/* Holonograph — shared mobile nav. Builds a hamburger + slide-down menu from the page's
   existing header nav (works with both inline and site.js-injected headers). Load AFTER site.js. */
(function(){
  function init(){
    var nav = document.querySelector('.site-header nav') || document.querySelector('header nav') || document.querySelector('nav');
    if(!nav || nav.querySelector('.nav-toggle')) return;
    var header = nav.closest('header') || nav.parentElement;
    var linksWrap = nav.querySelector('.nav-links');
    var links = linksWrap ? [].slice.call(linksWrap.querySelectorAll('a')) : [];
    var pill = nav.querySelector('.pill');

    var btn = document.createElement('button');
    btn.className = 'nav-toggle'; btn.type = 'button';
    btn.setAttribute('aria-label','Menu'); btn.setAttribute('aria-expanded','false');
    btn.setAttribute('aria-controls','mobile-menu');
    btn.innerHTML = '<span></span><span></span><span></span>';
    nav.appendChild(btn);

    var menu = document.createElement('div'); menu.className = 'mobile-menu'; menu.id = 'mobile-menu';
    links.forEach(function(a){ var l=document.createElement('a'); l.href=a.getAttribute('href')||'#'; l.textContent=a.textContent; menu.appendChild(l); });
    if(pill){ var c=document.createElement('a'); c.href=pill.getAttribute('href')||'#'; c.textContent=pill.textContent; c.className='cta'; menu.appendChild(c); }
    document.body.appendChild(menu);

    function place(){ menu.style.top = (header ? Math.round(header.getBoundingClientRect().height) : 70) + 'px'; }
    function close(){ menu.classList.remove('open'); btn.classList.remove('open'); btn.setAttribute('aria-expanded','false'); }
    place();
    btn.addEventListener('click', function(e){ e.stopPropagation(); place(); var o=menu.classList.toggle('open'); btn.classList.toggle('open',o); btn.setAttribute('aria-expanded', o?'true':'false'); });
    menu.addEventListener('click', function(e){ if(e.target.tagName==='A') close(); });
    document.addEventListener('click', function(e){ if(menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)) close(); });
    window.addEventListener('resize', function(){ place(); if(window.innerWidth>860) close(); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && menu.classList.contains('open')){ close(); btn.focus(); } });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
