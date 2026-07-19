const state={comics:[],view:'dashboard',previousView:'collection',search:'',status:'all',publisher:'all',sort:'title'};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const formatDate=v=>v?(String(v).endsWith('-01-01')?String(v).slice(0,4):new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(v))): '–';
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function init(){
  const response=await fetch('data/comics.json');state.comics=await response.json();
  state.comics=state.comics.map((c,i)=>({...c,year:Number(c.publicationDate?.slice(0,4)),addedDate:c.addedDate||`2026-07-${19-i}`,genre:c.genre||['Graphic Novel'],favorite:Boolean(c.favorite),read:Boolean(c.read)}));
  bindNavigation();populatePublishers();renderDashboard();renderCollection();renderSeries();
}

function bindNavigation(){
  $$('[data-view-link]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.viewLink)));
  $('#mobileMenu').addEventListener('click',()=>$('.main-nav').classList.toggle('open'));
  $('#searchInput').addEventListener('input',e=>{state.search=e.target.value;renderCollection()});
  $('#statusFilter').addEventListener('change',e=>{state.status=e.target.value;renderCollection()});
  $('#publisherFilter').addEventListener('change',e=>{state.publisher=e.target.value;renderCollection()});
  $('#sortSelect').addEventListener('change',e=>{state.sort=e.target.value;renderCollection()});
  $('#backButton').addEventListener('click',()=>showView(state.previousView));
}

function showView(name){
  if(name!=='detail')state.previousView=name;
  state.view=name;$$('.view').forEach(v=>v.classList.toggle('active',v.id===`${name}View`));
  $$('.main-nav button').forEach(b=>b.classList.toggle('active',b.dataset.viewLink===name));$('.main-nav').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});
  if(name==='wishlist')renderWishlist();
}

function renderDashboard(){
  const owned=state.comics.filter(c=>c.status==='owned');const unread=owned.filter(c=>!c.read);const wished=state.comics.filter(c=>c.status==='wishlist');
  $('#stats').innerHTML=[['Comics im Bestand',owned.length],['Reihen',new Set(owned.map(c=>c.seriesId).filter(Boolean)).size],['Ungelesen',unread.length],['Wunschliste',wished.length]].map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('#wishCount').textContent=wished.length;
  $('#recentGrid').innerHTML=owned.slice().sort((a,b)=>b.addedDate.localeCompare(a.addedDate)).slice(0,2).map(recentCard).join('');
  $$('#recentGrid [data-open]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.open)));
}

function recentCard(c){return `<button class="recent-card" data-open="${c.id}"><img src="${c.cover}" alt="Cover von ${esc(c.title)}"><div class="recent-info"><small>${c.publisher} · ${c.year}</small><h3>${esc(c.title)}</h3><p>${esc((c.authors||[]).join(' · '))}</p></div></button>`}

function populatePublishers(){const values=[...new Set(state.comics.map(c=>c.publisher))].sort();$('#publisherFilter').insertAdjacentHTML('beforeend',values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''))}

function filteredComics(){
  const q=state.search.trim().toLowerCase();let list=[...state.comics].filter(c=>{
    const hay=[c.title,c.subtitle,c.publisher,c.isbn13,...(c.authors||[])].join(' ').toLowerCase();
    const status=state.status==='all'||(state.status==='owned'&&c.status==='owned')||(state.status==='unread'&&c.status==='owned'&&!c.read)||(state.status==='favorite'&&c.favorite);
    return (!q||hay.includes(q))&&status&&(state.publisher==='all'||c.publisher===state.publisher);
  });
  list.sort((a,b)=>state.sort==='year-desc'?b.year-a.year:state.sort==='added-desc'?b.addedDate.localeCompare(a.addedDate):a.title.localeCompare(b.title,'de'));return list;
}

function renderCollection(){
  const list=filteredComics();$('#resultCount').textContent=`${list.length} ${list.length===1?'Comic':'Comics'}`;
  $('#comicGrid').innerHTML=list.map(comicCard).join('');$('#emptyState').hidden=list.length!==0;
  const labels=[];if(state.search)labels.push(`Suche: „${esc(state.search)}“`);if(state.status!=='all')labels.push($('#statusFilter').selectedOptions[0].textContent);if(state.publisher!=='all')labels.push(state.publisher);$('#activeFilters').innerHTML=labels.length?`Aktiv: ${labels.join(' · ')}`:'Alle Comics werden angezeigt';
  $$('#comicGrid [data-open]').forEach(b=>b.addEventListener('click',()=>{b.blur();openDetail(b.dataset.open)}));
}

function comicCard(c){
  const visual=`<img src="${c.cover}" loading="lazy" alt="Cover von ${esc(c.title)}">`;
  return `<button class="comic-card" data-open="${c.id}"><div class="cover-frame">${visual}${c.read?'<span class="card-badge">Gelesen</span>':''}</div><h3>${esc(c.title)}</h3><p>${esc(c.publisher)} · ${c.year}${c.volume?` · Band ${esc(c.volume)}`:''}</p></button>`;
}

function renderSeries(){
  const grouped=new Map();state.comics.filter(c=>c.seriesId).forEach(c=>{const g=grouped.get(c.seriesId)||{title:c.series||c.seriesId,comics:[]};g.comics.push(c);grouped.set(c.seriesId,g)});
  const groups=[...grouped.values()].sort((a,b)=>a.title.localeCompare(b.title,'de'));
  const standalone=state.comics.filter(c=>!c.seriesId).length;
  $('#seriesGrid').innerHTML=groups.map(g=>`<article class="series-card"><div><p class="kicker">Reihe</p><h2>${esc(g.title)}</h2><p>${g.comics.slice().sort((a,b)=>String(a.volume||'').localeCompare(String(b.volume||''),'de',{numeric:true})).map(c=>c.volume?`Band ${esc(c.volume)}`:esc(c.title)).join(' · ')}</p></div><div><strong>${g.comics.length} ${g.comics.length===1?'Comic':'Comics'}</strong><div class="progress"><span style="width:100%"></span></div></div></article>`).join('')+`<article class="series-card"><div><p class="kicker">Sammlungsstruktur</p><h2>Einzelbände</h2><p>Comics ohne übergeordnete Reihe.</p></div><div><strong>${standalone} Comics</strong><div class="progress"><span style="width:100%"></span></div></div></article>`;
}

function renderWishlist(){
  const wished=state.comics.filter(c=>c.status==='wishlist');if(!wished.length){$('#wishlistContent').innerHTML='<div class="empty-icon">♡</div><h2>Die Wunschliste ist noch leer.</h2><p>Auf der Detailseite kannst du einen Comic vom Bestand auf die Wunschliste setzen.</p><button class="primary-action" data-go-collection>Sammlung öffnen <span>→</span></button>';$('#wishlistContent [data-go-collection]').addEventListener('click',()=>showView('collection'));return}
  $('#wishlistContent').innerHTML=`<div class="comic-grid">${wished.map(comicCard).join('')}</div>`;
}

function openDetail(id){const c=state.comics.find(x=>x.id===id);if(!c)return;state.previousView=state.view==='dashboard'?'dashboard':'collection';$('#detailContent').innerHTML=detailTemplate(c);showView('detail');bindDetail(c)}

function rows(items){return items.map(([k,v])=>`<div class="data-row"><span>${k}</span><strong>${esc(v||'–')}</strong></div>`).join('')}
function detailTemplate(c){
  const creators=(c.authors||[]).join(' · ');const bibliographic=[['Reihe',c.series],['Band',c.volume],['Verlag',c.publisher],['Erscheinungsdatum',formatDate(c.publicationDate)],['Auflage',c.edition],['Einband',c.binding],['Seiten',c.pages?`${c.pages} Seiten`:'–'],['Sprache',c.language],['ISBN',c.isbn13],['Genre',(c.genre||[]).join(', ')]];
  const personal=[['Status',c.status==='owned'?'Im Bestand':'Wunschliste'],['Gelesen',c.read?'Ja':'Nein'],['Zustand',c.condition],['Regal / Karton',c.shelf],['Kaufpreis',c.purchasePrice],['Kaufdatum',c.purchaseDate],['Kaufort',c.purchasePlace],['Bewertung',c.rating?`${c.rating} / 5`:'–']];
  return `<article><div class="detail-hero"><div class="detail-visual"><img src="${c.cover}" alt="Cover von ${esc(c.title)}"></div><div class="detail-main"><p class="kicker">${esc((c.genre||['Comic']).join(' · '))}</p><h1>${esc(c.title)}</h1><p class="detail-byline">${esc(creators)}</p><div class="status-actions"><button class="active" data-detail-state="owned">✓ Im Bestand</button><button class="${c.read?'active':''}" data-detail-state="read">${c.read?'✓ Gelesen':'Ungelesen'}</button><button data-detail-state="wish">♡ Wunschliste</button><button class="${c.favorite?'active':''}" data-detail-state="favorite">★ Favorit</button></div></div></div><div class="detail-sections"><section class="info-section"><p class="kicker">Ausgabe</p><h2>Bibliografische Daten</h2><div class="data-list">${rows(bibliographic)}</div></section><section class="info-section private-block"><p class="kicker">Nur für dich</p><h2>Meine Sammlung</h2><div class="data-list">${rows(personal)}</div><p class="privacy-note">Diese Angaben werden im späteren geschützten Bereich verwaltet und nicht öffentlich ausgegeben.</p></section></div></article>`;
}

function bindDetail(c){
  $$('[data-detail-state]').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.detailState==='read'){c.read=!c.read;b.classList.toggle('active',c.read);b.textContent=c.read?'✓ Gelesen':'Ungelesen'}
    if(b.dataset.detailState==='favorite'){c.favorite=!c.favorite;b.classList.toggle('active',c.favorite)}
    if(b.dataset.detailState==='wish'){c.status=c.status==='wishlist'?'owned':'wishlist';b.classList.toggle('active',c.status==='wishlist');$$('[data-detail-state="owned"]')[0].classList.toggle('active',c.status==='owned')}
    renderDashboard();renderCollection();
  }));
}

init().catch(error=>{$('#app').innerHTML=`<div class="empty-state"><h2>Der Katalog konnte nicht geladen werden.</h2><p>${esc(error.message)}</p></div>`;console.error(error)});
