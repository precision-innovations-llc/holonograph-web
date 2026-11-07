window.HOLO_ANIM={ dur:620, ease:'cubic-bezier(.2,.8,.2,1)', stagger:150, draw:700, settle:200 };
(function(){
  var A=window.HOLO_ANIM, s=document.documentElement.style;
  s.setProperty('--anim-dur',(A.dur/1000)+'s'); s.setProperty('--anim-ease',A.ease);
  s.setProperty('--anim-stagger',(A.stagger/1000)+'s'); s.setProperty('--anim-draw',(A.draw/1000)+'s');
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function inAll(root){ [].forEach.call(root.querySelectorAll('[data-reveal],[data-anim]'), function(e){ e.classList.add('is-in'); e.dispatchEvent(new CustomEvent('reveal:in')); }); }
  if(reduce || !('IntersectionObserver' in window) || window.__NO_IO){
    window.addEventListener('view:shown', function(ev){ inAll(ev.detail); });
  } else {
    var io=new IntersectionObserver(function(ents){
      ents.forEach(function(en){
        var vis=en.isIntersecting;
        if(vis===en.target.__in) return;
        en.target.__in=vis;
        en.target.classList.toggle('is-in', vis);
        en.target.dispatchEvent(new CustomEvent(vis?'reveal:in':'reveal:out'));
      });
    }, {threshold:0.12, rootMargin:'0px 0px -8% 0px'});
    [].forEach.call(document.querySelectorAll('[data-reveal],[data-anim]'), function(e){ io.observe(e); });
  }
  var header=document.getElementById('siteHeader');
  function onScroll(){ if(header) header.classList.toggle('scrolled', window.scrollY>8); }
  onScroll(); window.addEventListener('scroll', onScroll, {passive:true});
})();


/* substrate viz: stacked isometric lattice planes (versions in depth); one copper
   thread tracks a single behavior/cohort across every version = longitudinal record. */
(function(){
  var svg=document.getElementById('substrate-viz'); if(!svg) return;
  var NS='http://www.w3.org/2000/svg';
  var u=[180,-20], v=[78,52], planes=4, gap=60, ox=70, oyb=252, div=3;
  var IRIS='#5f3ddc', COPPER='#e9552b';   /* sunrise thread (brand accent) */
  function el(parent,t,a){ var e=document.createElementNS(NS,t); for(var k in a) e.setAttribute(k,a[k]); parent.appendChild(e); return e; }
  function P(o,a,b){ return [o[0]+u[0]*a+v[0]*b, o[1]+u[1]*a+v[1]*b]; }
  function line(g,p1,p2,w,op){ el(g,'line',{x1:p1[0].toFixed(1),y1:p1[1].toFixed(1),x2:p2[0].toFixed(1),y2:p2[1].toFixed(1),stroke:IRIS,'stroke-width':w,opacity:op,'stroke-linecap':'round'}); }
  var labels=['v.1','v.2','v.3','now'];
  var nodeCells=[ [[0.2,0.72],[0.82,0.24]], [[0.34,0.3],[0.72,0.74]], [[0.16,0.42],[0.54,0.6],[0.9,0.5]], [[0.42,0.2],[0.24,0.86]] ];
  var thread=[];
  for(var k=0;k<planes;k++){
    var o=[ox, oyb-k*gap];
    var g=el(svg,'g',{'class':'plane'}); g.style.transitionDelay=(k*window.HOLO_ANIM.stagger)+'ms';
    var c0=P(o,0,0),c1=P(o,1,0),c2=P(o,1,1),c3=P(o,0,1);
    line(g,c0,c1,1,0.34); line(g,c1,c2,1,0.34); line(g,c2,c3,1,0.34); line(g,c3,c0,1,0.34);
    for(var i=1;i<div;i++){ var t=i/div; line(g,P(o,t,0),P(o,t,1),0.6,0.15); line(g,P(o,0,t),P(o,1,t),0.6,0.15); }
    var cells=nodeCells[k];
    for(var n=0;n<cells.length;n++){ var pn=P(o,cells[n][0],cells[n][1]); el(g,'circle',{cx:pn[0].toFixed(1),cy:pn[1].toFixed(1),r:2.2,fill:IRIS,opacity:0.5}); }
    thread.push(P(o,0.66,0.42));
    var lp=P(o,-0.06,0);
    var tx=el(g,'text',{x:lp[0].toFixed(1),y:(lp[1]+3).toFixed(1),fill:'#8a8796','font-size':'12','font-family':'ui-monospace,Menlo,monospace','letter-spacing':'0.1em','text-anchor':'end'}); tx.textContent=labels[k];
  }
  var tg=el(svg,'g',{'class':'thread'});
  var d='M'+thread[0][0].toFixed(1)+' '+thread[0][1].toFixed(1);
  for(var j=1;j<thread.length;j++) d+=' L'+thread[j][0].toFixed(1)+' '+thread[j][1].toFixed(1);
  var tpath=el(tg,'path',{d:d,fill:'none',stroke:COPPER,'stroke-width':1.7,opacity:0.9,'stroke-linecap':'round','stroke-linejoin':'round'});
  var threadDots=[];
  for(var m=0;m<thread.length;m++){ var dc=el(tg,'circle',{cx:thread[m][0].toFixed(1),cy:thread[m][1].toFixed(1),r:(m===thread.length-1?4:3),fill:COPPER}); dc.style.opacity='0'; dc.style.transition='opacity .22s ease'; threadDots.push(dc); }
  var len=0; try{ len=tpath.getTotalLength(); }catch(e){}
  if(!len) len=400;
  tpath.style.strokeDasharray=len; tpath.style.strokeDashoffset=len;
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var A=window.HOLO_ANIM, segs=thread.length-1;
  var STEP=A.draw, PAUSE=A.stagger;                                  // house tempo: draw a segment, pause, light the dot
  var planeSettle=A.dur+planes*A.stagger;                            // let the 4 planes finish rising first
  var timers=[];
  function popDot(i){ if(threadDots[i]) threadDots[i].style.opacity='1'; }
  function resetThread(){                                            // back to un-drawn, so a re-enter replays in sync with the planes
    for(var q=0;q<timers.length;q++) clearTimeout(timers[q]); timers=[];
    tpath.style.transition='none'; tpath.style.strokeDashoffset=len;
    for(var d=0;d<threadDots.length;d++) threadDots[d].style.opacity='0';
  }
  function drawThread(){
    popDot(0);                                                       // the v.1 anchor lights first
    tpath.style.transition='stroke-dashoffset '+STEP+'ms '+A.ease;
    for(var i=1;i<=segs;i++){ (function(i){
      var start=(i-1)*(STEP+PAUSE);
      timers.push(setTimeout(function(){ tpath.style.strokeDashoffset=(len*(1-i/segs)).toFixed(1); }, start));
      timers.push(setTimeout(function(){ popDot(i); }, start+STEP));
    })(i); }
  }
  function play(){
    if(reduce){ tpath.style.strokeDashoffset='0'; for(var q=0;q<threadDots.length;q++) threadDots[q].style.opacity='1'; return; }
    resetThread();
    timers.push(setTimeout(drawThread, planeSettle));               // planes rise (CSS .is-in), then the thread draws
  }
  // driven by the shared reveal observer: planes handled by CSS (.is-in), the thread draws/resets here
  svg.addEventListener('reveal:in', play);
  svg.addEventListener('reveal:out', resetThread);
  if(svg.classList.contains('is-in')) play();                       // already in view on load (reduced-motion path or refresh mid-section)
})();


/* readout: two named readings share one deck. Bars grow on scroll-in; the descriptive
   toggle crossfades/lifts the card + its annotations together and redraws the connector
   lines from the active card's right edge (at each anchored part) out to its explainer. */
(function(){
  var stage=document.querySelector('.readout-stage'); if(!stage) return;
  var svg=stage.querySelector('.anno-lines'), grid=stage.querySelector('.readout-grid');
  var cardDeck=stage.querySelector('.rcard-deck'), annoDeck=stage.querySelector('.anno-deck');
  var cards=[].slice.call(stage.querySelectorAll('.rcard'));
  var annoSets=[].slice.call(stage.querySelectorAll('.annos'));
  var segs=[].slice.call(document.querySelectorAll('.rc-seg'));
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var idx=0, animating=false;

  function activeCard(){ return cards[idx]; }
  function activeAnnos(){ return annoSets[idx]; }

  function sizeDeck(){                              // hold both decks at the active card's height
    if(window.matchMedia('(max-width: 860px)').matches){ cardDeck.style.minHeight=''; annoDeck.style.minHeight=''; return; }
    var h=activeCard().getBoundingClientRect().height;
    if(h>0){ cardDeck.style.minHeight=h+'px'; annoDeck.style.minHeight=h+'px'; }
  }

  function drawLines(){
    if(!svg||!grid) return;
    var card=activeCard(), annos=activeAnnos();
    if(window.matchMedia('(max-width: 860px)').matches){ svg.innerHTML=''; return; }
    var gr=grid.getBoundingClientRect(), cr=card.getBoundingClientRect();
    svg.setAttribute('viewBox','0 0 '+gr.width.toFixed(1)+' '+gr.height.toFixed(1));
    svg.setAttribute('preserveAspectRatio','none');
    var frag='';
    annos.querySelectorAll('.anno').forEach(function(anno){
      var t=card.querySelector('[data-anchor="'+anno.getAttribute('data-for')+'"]'); if(!t) return;
      var tr=t.getBoundingClientRect(), ar=anno.getBoundingClientRect();
      var sx=cr.right-gr.left, sy=tr.top-gr.top+tr.height/2;
      var ex=ar.left-gr.left, ey=ar.top-gr.top+ar.height/2;
      var mx=sx+(ex-sx)*0.5, hot=anno.classList.contains('hon');
      var line=hot?'#5f3ddc':'#cfc9e0', dot=hot?'#5f3ddc':'#e9552b';
      frag+='<path d="M'+sx.toFixed(1)+' '+sy.toFixed(1)+' C'+mx.toFixed(1)+' '+sy.toFixed(1)+' '+mx.toFixed(1)+' '+ey.toFixed(1)+' '+ex.toFixed(1)+' '+ey.toFixed(1)+'" fill="none" stroke="'+line+'" stroke-width="'+(hot?1.5:1.1)+'"/>';
      frag+='<circle cx="'+sx.toFixed(1)+'" cy="'+sy.toFixed(1)+'" r="3" fill="'+dot+'"/><circle cx="'+ex.toFixed(1)+'" cy="'+ey.toFixed(1)+'" r="2.5" fill="'+dot+'"/>';
    });
    svg.innerHTML=frag;
  }

  function select(next){
    if(animating || next===idx || !cards[next]) return;
    animating=true;
    svg.innerHTML='';                              // drop old connectors during the crossfade
    cards[idx].classList.remove('active'); annoSets[idx].classList.remove('active');
    idx=next;
    cards[idx].classList.add('active','in'); annoSets[idx].classList.add('active');
    segs.forEach(function(s,i){ s.classList.toggle('on', i===idx); s.setAttribute('aria-pressed', i===idx); });
    sizeDeck();                                    // animate deck height to the incoming card
    setTimeout(function(){ drawLines(); animating=false; }, 460);
  }

  // first paint: size the deck to card 0 and grow its bars when it scrolls in
  if(reduce){ activeCard().classList.add('in'); }
  else if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ activeCard().classList.add('in'); io.disconnect(); } }); }, {threshold:0.3});
    io.observe(cardDeck);
  } else { activeCard().classList.add('in'); }

  segs.forEach(function(s,i){ s.setAttribute('aria-pressed', i===idx); s.addEventListener('click', function(){ select(parseInt(s.getAttribute('data-card'),10)); }); });

  requestAnimationFrame(function(){ sizeDeck(); drawLines(); });
  setTimeout(function(){ sizeDeck(); drawLines(); }, 260);
  window.addEventListener('resize', function(){ requestAnimationFrame(function(){ sizeDeck(); drawLines(); }); });
})();


/* method: fan the four decomposition rays from the cube out to each source. Weight carries the
   (illustrative) share; the noise ray is dashed = the residual separated out. On scroll-in the
   cube spins once (reading the shift), THEN the rays draw in one by one at the house tempo. */
(function(){
  var section=document.querySelector('.method'); if(!section) return;
  var svg=section.querySelector('.split-lines'), grid=section.querySelector('.flow-grid');
  var lens=section.querySelector('.lens'), sources=[].slice.call(section.querySelectorAll('.source'));
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var A=window.HOLO_ANIM;
  var SPIN=A.draw, STEP=A.stagger, DRAW=A.draw, EASE=A.ease;       // cube spin ~ one draw, then rays draw at the house tempo
  var revealed=false, timers=[];
  function clearTimers(){ for(var i=0;i<timers.length;i++) clearTimeout(timers[i]); timers=[]; }

  function build(){
    if(!svg||!grid||!lens) return;
    if(window.matchMedia('(max-width: 860px)').matches){ svg.innerHTML=''; return; }
    var gr=grid.getBoundingClientRect(), lr=lens.getBoundingClientRect();
    svg.setAttribute('viewBox','0 0 '+gr.width.toFixed(1)+' '+gr.height.toFixed(1));
    svg.setAttribute('preserveAspectRatio','none');
    var sx=lr.right-gr.left-12, sy=lr.top-gr.top+lr.height/2;        // origin: cube right edge, centred
    var frag='<circle cx="'+sx.toFixed(1)+'" cy="'+sy.toFixed(1)+'" r="3" fill="#5f3ddc"/>';
    sources.forEach(function(src){
      var r=src.getBoundingClientRect();
      var nameEl=src.querySelector('.source-k'), nr=nameEl?nameEl.getBoundingClientRect():r;
      var ex=r.left-gr.left+4, ey=nr.top-gr.top+nr.height/2;         // dot sits in the source's left gutter
      var mx=sx+(ex-sx)*0.55, noise=src.classList.contains('noise');
      var w=parseFloat(src.getAttribute('data-weight'))||1.2;
      var col=noise?'#8a8796':'#e9552b';
      var extra=noise?' stroke-dasharray="3 5" opacity="0.72"':' opacity="0.92"';
      frag+='<path class="ray'+(noise?' noise':'')+'" d="M'+sx.toFixed(1)+' '+sy.toFixed(1)+' C'+mx.toFixed(1)+' '+sy.toFixed(1)+' '+mx.toFixed(1)+' '+ey.toFixed(1)+' '+ex.toFixed(1)+' '+ey.toFixed(1)+'" fill="none" stroke="'+col+'" stroke-width="'+w.toFixed(2)+'" stroke-linecap="round"'+extra+'/>';
      frag+='<circle class="rayend" cx="'+ex.toFixed(1)+'" cy="'+ey.toFixed(1)+'" r="'+(noise?2.8:3)+'" fill="'+col+'" opacity="'+(noise?0.72:1)+'"/>';
    });
    svg.innerHTML=frag;
    if(!revealed && !reduce) prime();          // keep hidden until the reveal plays
  }

  function prime(){                            // un-drawn state, ready to animate
    clearTimers();
    [].forEach.call(svg.querySelectorAll('.ray'), function(p){
      if(p.classList.contains('noise')){ p.style.opacity='0'; }
      else { var len=p.getTotalLength(); p.style.transition='none'; p.style.strokeDasharray=len; p.style.strokeDashoffset=len; }
    });
    [].forEach.call(svg.querySelectorAll('.rayend'), function(d){ d.style.opacity='0'; });
  }

  function play(){                             // cube spins first (CSS via .is-in), then rays draw in sequence
    revealed=true;
    if(reduce) return;
    [].forEach.call(svg.querySelectorAll('.ray'), function(p,i){
      var t=SPIN+i*STEP;
      if(p.classList.contains('noise')){
        timers.push(setTimeout(function(){ p.style.transition='opacity '+DRAW+'ms '+EASE; p.style.opacity=p.getAttribute('opacity'); }, t));
      } else {
        timers.push(setTimeout(function(){ p.style.transition='stroke-dashoffset '+DRAW+'ms '+EASE; p.style.strokeDashoffset='0'; }, t));
      }
    });
    [].forEach.call(svg.querySelectorAll('.rayend'), function(d,i){
      timers.push(setTimeout(function(){ d.style.transition='opacity '+Math.round(DRAW*0.6)+'ms '+EASE; d.style.opacity=d.getAttribute('opacity')||'1'; }, SPIN+i*STEP+DRAW*0.55));
    });
  }

  // driven by the shared reveal observer: cube spin + source rows handled by CSS (.is-in), rays here
  section.addEventListener('reveal:in', function(){ build(); play(); });
  section.addEventListener('reveal:out', function(){ revealed=false; build(); });   // re-arm: re-hide so it replays next enter
  window.addEventListener('resize', function(){ requestAnimationFrame(build); });

  build();                                     // initial geometry (hidden until reveal)
  if(section.classList.contains('is-in')) play();   // already in view on load / reduced-motion
})();


/* authority lifecycle: one illustrative surface, state-selectable, autoplays once on reveal */
(function(){
  var lc = document.getElementById('lc'); if(!lc) return;
  var sec = lc.closest('[data-reveal]');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var N = 52, tickWrap = lc.querySelector('.lc-ticks');
  for(var i=0;i<N;i++) tickWrap.appendChild(document.createElement('i'));
  var ticks = tickWrap.children;
  var nodes = lc.querySelectorAll('.lc-node');
  var fill = lc.querySelector('.lc-fill');
  var stateEl = lc.querySelector('.lc-state'), msg = lc.querySelector('.lc-msg');
  var whatEl = lc.querySelector('.lc-what'), whyEl = lc.querySelector('.lc-why'), nextEl = lc.querySelector('.lc-next em');
  var bIn = lc.querySelector('.lc-in'), bOut = lc.querySelector('.lc-out'), bReplay = lc.querySelector('.lc-replay');
  var deps = {}; [].forEach.call(lc.querySelectorAll('.lc-stack li'), function(li){ deps[li.getAttribute('data-dep')] = li; });
  var gates = lc.querySelectorAll('.lg');

  var SAT = [[1,'satisfied','ok'],[1,'satisfied','ok'],[1,'satisfied','ok']];
  var S = {
    mapped:{node:0, read:'mapped', deps:'off', rec:{o:6},
      gates:[[0,'not declared',''],[0,'not declared',''],[0,'not declared','']],
      what:'A decision is identified: a classification result routes a support ticket. No authority is asserted over it yet.',
      next:'Declare the contract: the certainty condition, the authority stack, and the abstention path.'},
    declared:{node:1, read:'declared', deps:'hold', rec:{o:10},
      gates:[[0,'pending',''],[0,'pending',''],[0,'pending','']],
      what:'Authority is asserted and the gate is live. No qualifying evidence is accruing yet.',
      next:'Live traffic has to exercise the surface.'},
    qualifying:{node:2, read:'qualifying', deps:'hold', rec:{o:10,q:12},
      gates:[[1,'holds','ok'],[.58,'accruing','run'],[.44,'accruing','run']],
      what:'Live traffic exercises the surface. Evidence accumulates toward the certainty condition.',
      next:'The condition established on live evidence, with every dependency holding.'},
    granted:{node:3, read:'granted', deps:'hold', rec:{o:10,q:20}, gates:SAT, chg:true,
      what:'The certainty condition is established on live evidence and every dependency holds. The reading is re-derived at every read.',
      next:'A stack member leaves its dependency condition. Pick a departure cause.'},
    resoak:{node:2, read:'qualifying', deps:'resoak', rec:{o:10,x:20,m:1,n:12},
      gates:[[1,'holds','ok'],[.55,'accruing','run'],[.4,'accruing','run']],
      why:'Departure: lens_version \u00b7 cause: system-update',
      what:'A deliberate lens update. The seam re-soaks on the new version and reads qualifying.',
      next:'Re-closes automatically once post-change evidence passes the floor.'},
    'regrant-u':{node:3, read:'granted', deps:'newlens', rec:{o:10,x:20,m:1,n:20}, gates:SAT, chg:true,
      what:'Re-soaked on the new version, with no acknowledgement required.',
      next:'The reading continues to be re-derived at every read.'},
    suspended:{node:4, read:'suspended', deps:'tear', rec:{o:10,x:20,m:1},
      gates:[[0,'departed','bad'],[0,'restarts','bad'],[0,'restarts','bad']],
      why:'Departure: served_model \u00b7 cause: unexpected-drift',
      what:'The served model changed out from under the grant. That is a tear, and the grant is withdrawn.',
      next:'A tear never self-clears. An operator acknowledgement releases it.'},
    requal:{node:2, read:'qualifying', deps:'newmodel', req:true, rec:{o:10,x:20,m:1,n:12},
      gates:[[1,'holds','ok'],[.55,'accruing','run'],[.4,'accruing','run']],
      what:'The tear is released and recorded. The soak window starts no earlier than the acknowledged tear.',
      next:'Every gate satisfied on the post-change record.'},
    regranted:{node:3, read:'granted', deps:'newmodel', req:true, rec:{o:10,x:20,m:1,n:20}, gates:SAT, chg:true,
      what:'Every gate is satisfied again, on the post-change record.',
      next:'The reading continues to be re-derived at every read.'}
  };
  var SEQ = ['mapped','declared','qualifying','granted','suspended','requal','regranted'];
  var DWELL = {mapped:3200, declared:3600, qualifying:4200, granted:4600, resoak:5400, 'regrant-u':4600, suspended:5400, requal:4600, regranted:4600};
  var DEP = {
    off:{impl:['off','0.20.0','not declared'], model:['off','model 4.1','not declared'], rubric:['off','model 3.0','not declared']},
    hold:{impl:['hold','0.20.0','holds'], model:['hold','model 4.1','holds'], rubric:['hold','model 3.0','holds']},
    resoak:{impl:['inside','0.20.0 \u2192 0.21.0','system update'], model:['hold','model 4.1','holds'], rubric:['hold','model 3.0','holds']},
    newlens:{impl:['hold','0.21.0','holds'], model:['hold','model 4.1','holds'], rubric:['hold','model 3.0','holds']},
    tear:{impl:['hold','0.20.0','holds'], model:['outside','model 4.1 \u2192 4.2','unexpected drift'], rubric:['hold','model 3.0','holds']},
    newmodel:{impl:['hold','0.20.0','holds'], model:['hold','model 4.2','holds'], rubric:['hold','model 3.0','holds']}
  };

  function recClasses(r){
    var out = [], k;
    for(k=0;k<(r.o||0);k++) out.push('o');
    for(k=0;k<(r.q||0);k++) out.push('q');
    for(k=0;k<(r.x||0);k++) out.push('x');
    if(r.m) out.push('m');
    for(k=0;k<(r.n||0);k++) out.push('n');
    while(out.length<N) out.push('');
    return out;
  }

  var cur = null, timer = null, playing = false;
  function go(name, fromPlay){
    var st = S[name]; if(!st) return;
    if(!fromPlay) stop();
    cur = name;
    lc.setAttribute('data-state', name);
    lc.setAttribute('data-read', st.read);
    lc.classList.toggle('req', !!st.req);
    [].forEach.call(nodes, function(n){
      var i = +n.getAttribute('data-n');
      n.classList.toggle('on', i===st.node);
      var done = i===4 ? !!st.req : (i<st.node || (st.node===4 && i<4));
      n.classList.toggle('done', i!==st.node && done);
    });
    fill.style.setProperty('--p', Math.min(st.node,3)/3);
    var d = DEP[st.deps];
    Object.keys(deps).forEach(function(k){
      var li = deps[k], v = d[k];
      li.setAttribute('data-st', v[0]);
      li.querySelector('.d-v').textContent = v[1];
      li.querySelector('.d-s').textContent = v[2];
    });
    [].forEach.call(gates, function(g, i){
      var v = st.gates[i];
      g.setAttribute('data-st', v[2]);
      g.querySelector('b').style.setProperty('--w', v[0]);
      g.querySelector('.lg-s').textContent = v[1];
    });
    var cls = recClasses(st.rec), lit = 0;
    for(var t=0;t<N;t++){
      var el = ticks[t], c = cls[t];
      if(el.className !== c){
        var grow = (c==='q'||c==='n'||c==='o') && !el.className;
        el.style.transitionDelay = grow ? (lit++ * 70)+'ms' : '0ms';
        el.className = c;
      }
    }
    msg.classList.add('swap');
    setTimeout(function(){
      stateEl.textContent = st.read;
      whatEl.textContent = st.what;
      whyEl.textContent = st.why || '';
      nextEl.textContent = st.next;
      msg.classList.remove('swap');
    }, reduce ? 0 : 220);
    bIn.disabled = bOut.disabled = !st.chg;
  }
  function stop(){ playing = false; clearTimeout(timer); }
  function play(list){
    stop(); playing = true;
    var i = 0;
    (function step(){
      if(!playing) return;
      go(list[i], true);
      var wait = DWELL[list[i]];
      i++;
      if(i < list.length) timer = setTimeout(step, wait); else playing = false;
    })();
  }

  [].forEach.call(lc.querySelectorAll('[data-go]'), function(b){
    b.addEventListener('click', function(){ go(b.getAttribute('data-go')); });
  });
  bIn.addEventListener('click', function(){ play(['resoak','regrant-u']); });
  bOut.addEventListener('click', function(){ play(['suspended','requal','regranted']); });
  bReplay.addEventListener('click', function(){ play(SEQ); });

  go('mapped', true);
  var started = false;
  function start(){
    if(started) return; started = true;
    if(reduce) go('granted', true); else play(SEQ);
  }
  if(sec) sec.addEventListener('reveal:in', start); else start();
})();



/* spine investigation: one illustrative alarm at a time, with slow tab progress until a tab is chosen */
(function(){
  var si = document.getElementById('si'); if(!si) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function q(s){ return si.querySelector(s); }
  var tabs = si.querySelectorAll('.si-tab');
  var rows = {}; [].forEach.call(si.querySelectorAll('.si-row'), function(r){ rows[r.getAttribute('data-ax')] = r; });
  var spark = q('.si-spark'), line = q('.si-spark .ln'), fixEl = q('.si-fix');
  var MAX = 5.5, DWELL = 12000, AT_ATTR = 900, AT_PT = 2800, AT_FIX = 3800;
  var KIND = {chance:'not chance', noise:'', floor:'', conf:'confounded axis'};
  var SC = [
    {src:'agent', to:'Your agent', metric:'tool_discipline', d:-3.8, pt:['agent'], note:{agent:'prompt v14 → v15'},
      ax:{agent:[3.1,'chance'], model:[0.2,'noise'], eval:[0.1,'noise'], noise:[0.4,'floor']},
      what:'The drop starts at prompt v15, which cut the tool-use rule.',
      fix:'Revert to prompt v14', then:'Restores the tool-use rule.'},
    {src:'model', to:'The model', metric:'analysis_quality_judged', d:-5.2, pt:['model'], note:{model:'model 4.1 → 4.2'},
      ax:{agent:[0.3,'noise'], model:[4.4,'chance'], eval:[0.2,'noise'], noise:[0.3,'floor']},
      what:'The vendor moved your alias from model 4.1 to 4.2. Your repo did not change.',
      fix:'Pin back to model 4.1', then:'Adjust the prompt for 4.2, test it on a cohort, then upgrade.'},
    {src:'eval', to:'Your eval', metric:'hypothesis_grounding', d:2.9, pt:['eval'], note:{eval:'rubric v4 → v5'},
      ax:{agent:[0.1,'noise'], model:[0.2,'noise'], eval:[2.6,'chance'], noise:[0.3,'floor']},
      what:'The score rose at rubric v5. The agent did not change.',
      fix:'Rebaseline on rubric v5', then:'The rise is a scoring change. The trend restarts at v5.'},
    {src:'vis', to:'Visibility', metric:'title_quality', d:-2.2, pt:['agent','model'], note:{agent:'prompt v8 → v9', model:'model 4.1 → 4.2'},
      ax:{agent:[1.6,'conf'], model:[1.6,'conf'], eval:[0.1,'noise'], noise:[0.5,'floor']},
      what:'Prompt v9 and model 4.2 shipped together. No substrate column separates them.',
      fix:'Hold a cohort on model 4.1', then:'Cohort tag it. The next runs separate the two axes.'}
  ];
  var W = [0,1.2,-.8,.6,-1.4,.9,-.3,1.1,-1,.4,-.6,1.3,-.9,.2,.8,-1.2,.5,-.7,1,-.4,.9,-1.1,.3,.7,-.5,1.2,-.8,.4];
  function sparkPath(d){
    var n = W.length, step = 17, amp = Math.abs(d) * 6.2, up = d > 0;
    var a = up ? 44 : 16, b = up ? a - amp : a + amp, out = [];
    for(var i=0;i<n;i++){
      var x = i * 280 / (n - 1), t = i < step ? 0 : Math.min(1, (i - step + 1) / 3);
      out.push((i ? 'L' : 'M') + x.toFixed(1) + ' ' + (a + (b - a) * t + W[i] * 1.6).toFixed(1));
    }
    return out.join('');
  }

  var cur = 0, stage = -1, elapsed = 0, shown = 0, auto = !reduce, hover = false, raf = 0, last = 0;
  function setStage(k){
    if(k === stage) return;
    stage = k;
    si.classList.toggle('s-attr', k >= 1);
    si.classList.toggle('s-pt', k >= 2);
    si.classList.toggle('s-fix', k >= 3);
  }
  function load(i){
    var s = SC[i]; cur = i; elapsed = 0; shown = 0;
    [].forEach.call(tabs, function(t, j){
      t.setAttribute('aria-selected', j === i ? 'true' : 'false');
      t.tabIndex = j === i ? 0 : -1;
      t.style.setProperty('--t', 0);
    });
    setStage(0);
    si.setAttribute('data-src', s.src);
    si.setAttribute('data-dir', s.d > 0 ? 'up' : 'down');
    q('.si-metric').textContent = s.metric;
    q('.si-delta span').textContent = (s.d > 0 ? '+' : '−') + Math.abs(s.d).toFixed(1);
    Object.keys(rows).forEach(function(k){
      var r = rows[k], v = s.ax[k];
      r.className = 'si-row k-' + v[1] + (s.pt.indexOf(k) > -1 ? ' pt' : '');
      r.querySelector('.si-bar i').style.setProperty('--w', Math.min(v[0] / MAX, 1));
      r.querySelector('.si-v').textContent = v[0].toFixed(1);
      r.querySelector('.si-t').textContent = KIND[v[1]];
      r.querySelector('small').textContent = s.note[k] || '';
    });
    spark.classList.remove('draw');
    line.setAttribute('d', sparkPath(s.d));
    line.style.setProperty('--len', line.getTotalLength ? Math.ceil(line.getTotalLength()) + 2 : 600);
    void spark.getBoundingClientRect();
    q('.si-src').textContent = s.to;
    q('.si-what').textContent = s.what;
    fixEl.textContent = '';
    var b = document.createElement('b'); b.textContent = s.fix; fixEl.appendChild(b);
    q('.si-then').textContent = s.then;
  }
  function inView(){
    var r = si.getBoundingClientRect(), h = window.innerHeight;
    return r.height > 0 && r.top < h * .7 && r.bottom > h * .3 && !document.hidden;
  }
  function tick(now){
    raf = 0;
    var dt = Math.min(now - last, 100); last = now;
    if(inView()){
      spark.classList.add('draw');
      elapsed += dt;
      setStage(elapsed >= AT_FIX ? 3 : elapsed >= AT_PT ? 2 : elapsed >= AT_ATTR ? 1 : 0);
      if(auto && !hover){
        shown += dt;
        tabs[cur].style.setProperty('--t', Math.min(shown / DWELL, 1));
        if(shown >= DWELL){
          if(cur < SC.length - 1) load(cur + 1);
          else { auto = false; tabs[cur].style.setProperty('--t', 0); }
        }
      }
    }
    if(auto || elapsed < AT_FIX) schedule();
  }
  function schedule(){ if(!raf) raf = requestAnimationFrame(tick); }
  function choose(i){
    auto = false; load(i);
    if(reduce){ spark.classList.add('draw'); setStage(3); }
    else { last = performance.now(); schedule(); }
  }

  [].forEach.call(tabs, function(t, i){
    t.addEventListener('click', function(){ choose(i); });
    t.addEventListener('keydown', function(e){
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if(!d) return;
      e.preventDefault();
      var n = (i + d + tabs.length) % tabs.length;
      choose(n); tabs[n].focus();
    });
  });
  si.addEventListener('pointerenter', function(e){ if(e.pointerType === 'mouse') hover = true; });
  si.addEventListener('pointerleave', function(){ hover = false; });

  load(0);
  if(reduce){ spark.classList.add('draw'); setStage(3); }
  else { last = performance.now(); schedule(); }
})();


/* seams: a thread through three planes, a taint mark through the code, a rail through the stages */
(function(){
  var view=document.querySelector('.view[data-route="seams"]'); if(!view) return;
  var svg=view.querySelector('.seam-viz'), walk=view.querySelector('.walk'), rail=view.querySelector('.seam-3');
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS='http://www.w3.org/2000/svg', IRIS='#5f3ddc', SUN='#e9552b', GOOD='#1f7d59';
  var u=[180,-20], v=[78,52], ox=150, oyb=262, gap=104;
  function el(p,t,a){ var e=document.createElementNS(NS,t); for(var k in a) e.setAttribute(k,a[k]); p.appendChild(e); return e; }
  function P(o,a,b){ return [o[0]+u[0]*a+v[0]*b, o[1]+u[1]*a+v[1]*b]; }
  function ln(g,a,b,w,op){ el(g,'line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:IRIS,'stroke-width':w,opacity:op,'stroke-linecap':'round'}); }
  var names=['Consequence','Decision point','Interpretive'], inert=[[[.2,.3],[.8,.72]],[[.2,.74],[.72,.8]],[[.22,.3],[.86,.7]]];
  for(var k=0;k<3;k++){
    var o=[ox,oyb-k*gap], g=el(svg,'g',{'class':'plane'}); g.style.transitionDelay=(k*150)+'ms';
    var c=[P(o,0,0),P(o,1,0),P(o,1,1),P(o,0,1)];
    for(var i=0;i<4;i++) ln(g,c[i],c[(i+1)%4],1,.34);
    for(var t=1;t<3;t++){ ln(g,P(o,t/3,0),P(o,t/3,1),.6,.15); ln(g,P(o,0,t/3),P(o,1,t/3),.6,.15); }
    inert[k].forEach(function(n){ var q=P(o,n[0],n[1]); el(g,'circle',{cx:q[0],cy:q[1],r:2.4,fill:IRIS,opacity:.5}); });
    var lp=P(o,-.05,0), tx=el(g,'text',{x:lp[0],y:lp[1]+5,'text-anchor':'end'}); tx.textContent=names[k];
  }
  var oI=[ox,oyb-2*gap], oD=[ox,oyb-gap], oC=[ox,oyb];
  var pI=P(oI,.62,.42), pD=P(oD,.44,.48), pC=P(oC,.6,.52), pA=P(oD,.92,.2);
  function path(a,b,col,dash){ var e=el(svg,'path',{d:'M'+a[0]+' '+a[1]+' L'+b[0]+' '+b[1],fill:'none',stroke:col,'stroke-width':1.9,'stroke-linecap':'round'}); var L=e.getTotalLength?e.getTotalLength():200; e.style.strokeDasharray=L; e.style.strokeDashoffset=L; e._L=L; return e; }
  function dot(p,r,col,cls){ var e=el(svg,'circle',{cx:p[0],cy:p[1],r:r,fill:col,'class':'pop'}); return e; }
  var seg=[path(pI,pD,SUN),path(pD,pC,SUN),path(pD,pA,GOOD)];
  var dots=[dot(pI,4,SUN),dot(pD,4.6,SUN),dot(pC,4.6,SUN),dot(pA,4.6,GOOD)];
  var at=el(svg,'text',{x:pA[0]-22,y:pA[1]-12,'text-anchor':'start','class':'pop',style:'fill:'+GOOD}); at.textContent='Abstention';
  var vizT=[], walkT=[];
  function clear(a){ while(a.length) clearTimeout(a.pop()); }
  function draw(e,ms){ e.style.transition='stroke-dashoffset '+ms+'ms cubic-bezier(.2,.8,.2,1)'; e.style.strokeDashoffset=0; }
  function vizFinal(){ svg.classList.add('go'); seg.forEach(function(e){ e.style.transition='none'; e.style.strokeDashoffset=0; }); dots.forEach(function(d){ d.classList.add('on'); }); at.classList.add('on'); }
  function vizPlay(){
    svg.classList.add('go');
    var T=[[900,function(){ dots[0].classList.add('on'); }],[1250,function(){ draw(seg[0],1200); }],[2450,function(){ dots[1].classList.add('on'); }],[2800,function(){ draw(seg[1],1200); }],[4000,function(){ dots[2].classList.add('on'); }],[4350,function(){ draw(seg[2],1000); }],[5350,function(){ dots[3].classList.add('on'); at.classList.add('on'); }]];
    T.forEach(function(x){ vizT.push(setTimeout(x[1],x[0])); });
  }
  function vizReset(){ clear(vizT); svg.classList.remove('go'); seg.forEach(function(e){ e.style.transition='none'; e.style.strokeDashoffset=e._L; }); dots.forEach(function(d){ d.classList.remove('on'); }); at.classList.remove('on'); }

  var steps=[1,2,3,4,5].map(function(n){ return [].slice.call(walk.querySelectorAll('[data-s="'+n+'"]')); });
  function mark(i){
    steps[i].forEach(function(l){ l.classList.add('on'); });
    var last=steps[i][steps[i].length-1];
    walk.style.setProperty('--p',((last.offsetTop+last.offsetHeight)/walk.offsetHeight).toFixed(3));
  }
  function walkPlay(){ steps.forEach(function(s,i){ walkT.push(setTimeout(function(){ mark(i); },500+i*1300)); }); }
  function walkFinal(){ steps.forEach(function(s,i){ mark(i); }); walk.style.setProperty('--p',1); }
  function walkReset(){ clear(walkT); walk.style.setProperty('--p',0); [].forEach.call(walk.querySelectorAll('.on'),function(l){ l.classList.remove('on'); }); }

  if(reduce){ vizFinal(); walkFinal(); rail.classList.add('go'); return; }
  var items=[
    {el:svg,play:vizPlay,reset:vizReset},
    {el:walk,play:walkPlay,reset:walkReset},
    {el:rail,play:function(){ rail.classList.add('go'); },reset:function(){ rail.classList.remove('go'); }}
  ];
  setInterval(function(){
    var h=window.innerHeight;
    items.forEach(function(it){
      var r=it.el.getBoundingClientRect(), shown=r.height>0;
      if(!it.on && shown && r.top<h*.72 && r.bottom>h*.28){ it.on=true; it.play(); }
      else if(it.on && (!shown || r.bottom<0 || r.top>h)){ it.on=false; it.reset(); }
    });
  },250);
})();

/* Home: open Nigel when the live demo arrives, so the chat and the lens are on screen together. */
(function(){
  var demo=document.querySelector('.demo'), played=false;
  if(!demo) return;
  demo.addEventListener('reveal:in', function(){
    if(played) return; played=true;
    var fab=document.getElementById('nigelFab');
    if(fab) fab.click();
  });
})();
