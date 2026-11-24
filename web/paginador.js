/* Paginador unico. FoliumPaginar(fuente, config) vuelve a paginar sin recargar la pagina:
   fuente es el HTML del contenido (opcional: si falta, usa el que ya esta en #src). */
(function(){
async function paginar(fuenteHtml, config){
  if(config) window.FOLIUM=config;
  const CFG=window.FOLIUM;
  window.__done=null;
  try{ await document.fonts.ready; }catch(e){}
  const MM = 96/25.4, CH = 247*MM, DOC=CFG.pie;
  const srcEl=document.getElementById('src');
  if(fuenteHtml!==undefined) srcEl.innerHTML=fuenteHtml;
  document.getElementById('pages').textContent='';
  const src = [...document.querySelectorAll('#src > *')];
  const meas = document.getElementById('measure');

  /* numeracion de titulos (en Word la hace la lista multinivel de Titulo 1 y Titulo 2) */
  let n1=0,n2=0; const tocItems=[];
  src.forEach(el=>{
    if(el.tagName==='H1'){ n2=0; if(el.hasAttribute('data-anexo')){ el._num=''; } else { n1++; el._num=n1+'.'; } }
    else if(el.tagName==='H2'){ n2++; el._num=String.fromCharCode(96+n2)+')'; }
    if(el.dataset.id) el.id=el.dataset.id;   /* identificador estable: los enlaces internos no dependen del numero */
    if(el._num){ const s=document.createElement('span'); s.className='num'; s.textContent=el._num; el.prepend(s); }
  });

  document.querySelectorAll('#src .fq').forEach(e=>{ e.innerHTML=e.textContent.replace(/\./g,'.<wbr>'); });

  /* anchos de columna */
  src.filter(e=>e.tagName==='TABLE').forEach(t=>{
    const w=t.dataset.w.split(',').map(Number), sum=w.reduce((a,b)=>a+b,0);
    if(Math.abs(sum-150)>0.01) console.warn('Suma de columnas =',sum,'mm (debe ser 150):',t.tHead.textContent.trim());
    const cg=document.createElement('colgroup');
    w.forEach(x=>{const c=document.createElement('col'); c.style.width=x+'mm'; cg.appendChild(c);});
    t.prepend(cg);
  });

  /* medicion */
  function measure(el){
    meas.innerHTML=''; const c=el.cloneNode(true); meas.appendChild(c);
    const cs=getComputedStyle(c), r=c.getBoundingClientRect();
    const o={el, h:r.height, mt:parseFloat(cs.marginTop), mb:parseFloat(cs.marginBottom),
             kwn: el.matches('h1,h2,h3,[data-kwn]'), table: el.tagName==='TABLE'};
    if(o.table){
      o.hh=c.tHead.getBoundingClientRect().height;
      o.rows=[...c.tBodies[0].rows].map((tr,i)=>({el:el.tBodies[0].rows[i], h:tr.getBoundingClientRect().height}));
      o.total=o.hh+o.rows.reduce((a,r)=>a+r.h,0)+2;
      o.keep=o.rows.length<=6 && o.total<CH*0.6;   /* tabla corta: no se parte entre hojas */
    }
    return o;
  }
  const blocks=src.map(measure);

  /* paginacion */
  const pages=[]; let used=0;
  const newPage=()=>{ pages.push({items:[]}); used=0; };
  newPage();
  const cur=()=>pages[pages.length-1];

  function place(b){
    if(!b.table){
      const first=used===0, top=first?0:b.mt;
      cur().items.push({b, first});
      used+=top+b.h+b.mb;
      if(b.el.tagName==='H1'||b.el.tagName==='H2') tocItems.push({el:b.el, page:pages.length-1});
      return;
    }
    let idx=0;
    while(idx<b.rows.length){
      const first=used===0, top=first?0:b.mt;
      const avail=CH-used-top-b.hh-2;
      if(b.keep && idx===0 && used>0 && top+b.total>CH-used){ newPage(); continue; }
      let take=0,sum=0;
      while(idx+take<b.rows.length && sum+b.rows[idx+take].h<=avail){ sum+=b.rows[idx+take].h; take++; }
      if(take===0){ if(used===0) take=1, sum=b.rows[idx].h; else { newPage(); continue; } }
      const last=idx+take>=b.rows.length;
      cur().items.push({b, from:idx, to:idx+take, first, last});
      used+=top+b.hh+sum+2+(last?b.mb:0);
      idx+=take;
      if(!last) newPage();
    }
  }

  for(let i=0;i<blocks.length;i++){
    let req=0, j=i, u=used;
    for(;;){
      const b=blocks[j], top=(u===0&&req===0)?0:b.mt;
      if(b.table){ req+=top+(b.keep?b.total:b.hh+b.rows[0].h+2); break; }
      req+=top+b.h+b.mb;
      if(!b.kwn || j===blocks.length-1) break;
      j++;
    }
    if(used>0 && used+req>CH) newPage();
    for(let k=i;k<=j;k++) place(blocks[k]);
    i=j;
  }

  /* render */
  const root=document.getElementById('pages');

  /* indice: se mide primero para saber cuantas hojas ocupa (puede ser mas de una) */
  function tocEntry(t, pageNum){
    const l2=t.el.tagName==='H2';
    const txt=t.el._num ? t.el.textContent.replace(/^(\d+\.|[a-z]\))/,'') : t.el.textContent;
    const d=document.createElement('div'); d.className='te'+(l2?' l2':'');
    d.innerHTML='<span class="n">'+t.el._num+'</span><span class="x"></span><span class="d"></span><span class="p">'+pageNum+'</span>';
    const a=document.createElement('a'); a.href='#'+t.el.id; a.textContent=txt; d.querySelector('.x').appendChild(a);
    return d;
  }
  const tocPages=[[]]; let tocUsed=0;
  { meas.innerHTML=''; const tt=document.createElement('p'); tt.className='toc-t'; tt.textContent='Índice'; meas.appendChild(tt);
    const cs=getComputedStyle(tt); tocUsed=tt.getBoundingClientRect().height+parseFloat(cs.marginBottom);
    tocItems.forEach(t=>{
      meas.innerHTML=''; const d=tocEntry(t,'99'); meas.appendChild(d);
      const h=d.getBoundingClientRect().height+parseFloat(getComputedStyle(d).marginBottom);
      if(tocUsed+h>CH){ tocPages.push([]); tocUsed=0; }
      tocPages[tocPages.length-1].push(t); tocUsed+=h;
    }); }
  const nToc=tocPages.length;
  const total=1+nToc+pages.length;
  function mkPage(cls){
    const p=document.createElement('section'); p.className='page '+(cls||'');
    const c=document.createElement('div'); c.className='content'; p.appendChild(c); root.appendChild(p); return {p,c};
  }
  function foot(p,n){
    const f=document.createElement('div'); f.className='foot';
    f.innerHTML='<span>'+DOC+'</span><span>Página '+n+' de '+total+'</span>'; p.appendChild(f);
  }

  /* portada (hoja 1) */
  const cv=mkPage('cover');
  cv.p.insertAdjacentHTML('afterbegin','<div class="banner"></div>');
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  cv.c.innerHTML =
    '<p class="c25">&nbsp;</p>'+
    '<p class="org">'+esc(CFG.organizacion)+'</p>'+
    '<p class="t36">'+esc(CFG.titulo_pagina)+'</p>'+
    '<div class="sp12"></div><div class="sp12"></div><div class="sp12"></div>'+
    CFG.portada.map(f=>'<p class="fld"><b>'+esc(f.etiqueta)+':</b> '+esc(f.valor)+'</p>').join('');

  /* indice (hojas 2 en adelante) */
  tocPages.forEach((items,k)=>{
    const tp=mkPage(); foot(tp.p,2+k);
    if(k===0) tp.c.innerHTML='<p class="toc-t">Índice</p>';
    items.forEach(t=>tp.c.appendChild(tocEntry(t, t.page+2+nToc)));
  });

  /* contenido */
  pages.forEach((pg,i)=>{
    const P=mkPage(); foot(P.p,i+2+nToc);
    pg.items.forEach(it=>{
      let node;
      if(!it.b.table){ node=it.b.el.cloneNode(true); }
      else{
        const t=it.b.el; node=t.cloneNode(false);
        node.appendChild(t.querySelector('colgroup').cloneNode(true));
        node.appendChild(t.tHead.cloneNode(true));
        const tb=document.createElement('tbody');
        for(let k=it.from;k<it.to;k++) tb.appendChild(it.b.rows[k].el.cloneNode(true));
        node.appendChild(tb);
        if(!it.last) node.style.marginBottom='0';
      }
      if(it.first) node.style.marginTop='0';
      P.c.appendChild(node);
    });
  });

  /* ids duplicados por la medicion: se vacian el contenido fuente y la zona de medicion */
  srcEl.textContent=''; meas.textContent='';
  window.__done={pages:total};
}

/* controles (una sola vez) */
const g=document.getElementById('g'), z=document.getElementById('z');
if(g) g.addEventListener('change',e=>document.body.classList.toggle('guides',e.target.checked));
if(z) z.addEventListener('change',e=>{document.getElementById('pages').style.zoom=e.target.value;});

window.FoliumPaginar=paginar;
if(window.FOLIUM) paginar();
})();
