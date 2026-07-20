const state = {
  comics: [], series: [], view: "dashboard", query: "", seriesQuery: "",
  status: "all", publisher: "all", seriesFilter: "all", year: "all",
  sort: "title", wishlist: new Set(), lastView: "collection"
};

const $ = (id) => document.getElementById(id);
const esc = (value="") => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const formatDate = value => value ? new Intl.DateTimeFormat("de-DE",{year:"numeric",month:"long",day:"numeric"}).format(new Date(value)) : "Nicht angegeben";
const formatMoney = value => value == null ? "Nicht angegeben" : new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(value);
const yearOf = comic => comic.publicationDate ? String(comic.publicationDate).slice(0,4) : "";
const volumeNumber = value => { const match=String(value??"").match(/\d+/); const n=match?Number.parseInt(match[0],10):null; return Number.isFinite(n) ? n : null; };
const byId = id => state.comics.find(comic => comic.id === id);

async function init(){
  try {
    const [comicsResponse, seriesResponse] = await Promise.all([fetch("data/comics.json"),fetch("data/series.json")]);
    if(!comicsResponse.ok || !seriesResponse.ok) throw new Error("Daten konnten nicht geladen werden");
    state.comics = await comicsResponse.json();
    state.series = await seriesResponse.json();
    populateFilters();
    bindEvents();
    renderAll();
  } catch(error) {
    $("app").innerHTML = '<section class="load-error"><h1>Der Katalog konnte nicht geladen werden.</h1><p>Bitte die Seite neu laden.</p></section>';
    console.error(error);
  }
}

function populateFilters(){
  const publishers=[...new Set(state.comics.map(c=>c.publisher).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"de"));
  $("publisherFilter").insertAdjacentHTML("beforeend",publishers.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join(""));
  $("seriesFilter").insertAdjacentHTML("beforeend",state.series.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+'</option>').join(""));
  const years=[...new Set(state.comics.map(yearOf).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  $("yearFilter").insertAdjacentHTML("beforeend",years.map(v=>'<option value="'+v+'">'+v+'</option>').join(""));
}

function bindEvents(){
  document.addEventListener("click",event=>{
    const nav=event.target.closest("[data-view-link]");
    if(nav){ showView(nav.dataset.viewLink); return; }
    const card=event.target.closest("[data-comic-id]");
    if(card){ openDetail(card.dataset.comicId); return; }
    const series=event.target.closest("[data-series-id]");
    if(series){ openSeries(series.dataset.seriesId); return; }
  });
  $("searchInput").addEventListener("input",e=>{state.query=e.target.value;renderCollection();});
  $("seriesSearchInput").addEventListener("input",e=>{state.seriesQuery=e.target.value;renderSeries();});
  ["statusFilter","publisherFilter","seriesFilter","yearFilter","sortSelect"].forEach(id=>{
    $(id).addEventListener("change",e=>{
      const key={statusFilter:"status",publisherFilter:"publisher",seriesFilter:"seriesFilter",yearFilter:"year",sortSelect:"sort"}[id];
      state[key]=e.target.value;renderCollection();
    });
  });
  $("backButton").addEventListener("click",()=>showView(state.lastView));
  $("mobileMenu").addEventListener("click",()=>document.querySelector(".main-nav").classList.toggle("open"));
}

function showView(view){
  if(view!=="detail") state.lastView=view;
  state.view=view;
  document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el.id===view+"View"));
  document.querySelectorAll("[data-view-link]").forEach(el=>el.classList.toggle("active",el.dataset.viewLink===view));
  document.querySelector(".main-nav").classList.remove("open");
  if(view==="collection") renderCollection();
  if(view==="series") renderSeries();
  if(view==="wishlist") renderWishlist();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderAll(){
  renderDashboard(); renderCollection(); renderSeries(); renderWishlist();
}

function renderDashboard(){
  const owned=state.comics.filter(c=>c.status==="owned").length;
  const unread=state.comics.filter(c=>!c.read).length;
  const standalone=state.comics.filter(c=>!c.seriesId).length;
  $("stats").innerHTML=[
    [state.comics.length,"Comics gesamt"],[state.series.length,"Reihen"],[unread,"Noch ungelesen"],[standalone,"Einzelbände"]
  ].map(([number,label])=>'<article class="stat"><strong>'+number+'</strong><span>'+label+'</span></article>').join("");
  const recent=[...state.comics].sort((a,b)=>(b.addedDate||"").localeCompare(a.addedDate||"")).slice(0,4);
  $("recentGrid").innerHTML=recent.map(recentCard).join("");
  if(recent[0]) $("heroCoverA").src=recent[0].cover;
  if(recent[1]) $("heroCoverB").src=recent[1].cover;
  $("wishCount").textContent=state.wishlist.size;
}

function recentCard(c){
  return '<article class="recent-card" data-comic-id="'+esc(c.id)+'" tabindex="0"><img src="'+esc(c.cover)+'" alt="Cover von '+esc(c.title)+'" loading="lazy"><div class="recent-info"><p class="kicker">'+esc(c.publisher||"")+'</p><h3>'+esc(c.title)+'</h3><p>'+esc(c.authors.join(", "))+'</p></div></article>';
}

function filteredComics(){
  const q=state.query.trim().toLocaleLowerCase("de");
  return state.comics.filter(c=>{
    const hay=[c.title,c.subtitle,c.publisher,c.isbn13,c.series,...(c.authors||[])].filter(Boolean).join(" ").toLocaleLowerCase("de");
    const status=state.status==="all" || (state.status==="owned"&&c.status==="owned") || (state.status==="unread"&&!c.read) || (state.status==="favorite"&&c.favorite);
    const series=state.seriesFilter==="all" || (state.seriesFilter==="standalone"&&!c.seriesId) || c.seriesId===state.seriesFilter;
    return (!q||hay.includes(q)) && status && (state.publisher==="all"||c.publisher===state.publisher) && series && (state.year==="all"||yearOf(c)===state.year);
  }).sort((a,b)=>{
    if(state.sort==="year-desc") return yearOf(b).localeCompare(yearOf(a)) || a.title.localeCompare(b.title,"de");
    if(state.sort==="added-desc") return (b.addedDate||"").localeCompare(a.addedDate||"") || a.title.localeCompare(b.title,"de");
    return a.title.localeCompare(b.title,"de");
  });
}

function renderCollection(){
  const items=filteredComics();
  $("resultCount").textContent=items.length+" von "+state.comics.length+" Comics";
  $("comicGrid").innerHTML=items.map(comicCard).join("");
  $("emptyState").hidden=items.length>0;
  const chips=[];
  if(state.query) chips.push("Suche: "+state.query);
  if(state.publisher!=="all") chips.push(state.publisher);
  if(state.seriesFilter!=="all") chips.push(state.seriesFilter==="standalone"?"Einzelbände":state.series.find(s=>s.id===state.seriesFilter)?.title||state.seriesFilter);
  if(state.year!=="all") chips.push(state.year);
  if(state.status!=="all") chips.push({owned:"Im Bestand",unread:"Ungelesen",favorite:"Favoriten"}[state.status]);
  $("activeFilters").innerHTML=chips.map(chip=>'<span>'+esc(chip)+'</span>').join("");
}

function comicCard(c){
  const line=c.series ? esc(c.series)+(c.volume?" · Band "+esc(c.volume):"") : [c.publisher,yearOf(c)].filter(Boolean).map(esc).join(" · ");
  return '<article class="comic-card" data-comic-id="'+esc(c.id)+'" tabindex="0"><div class="cover-frame"><img src="'+esc(c.cover)+'" alt="Cover von '+esc(c.title)+'" loading="lazy"><span class="status-dot '+(c.read?"read":"unread")+'" title="'+(c.read?"Gelesen":"Ungelesen")+'"></span></div><p class="card-meta">'+line+'</p><h3>'+esc(c.title)+'</h3><p class="card-author">'+esc((c.authors||[]).join(", "))+'</p></article>';
}

function seriesStats(series,items){
  const c=series.completeness;
  if(!c || c.status==="not-applicable") return {percent:100,label:items.length+" Ausgaben",gap:c?.note||"Keine fortlaufende Albumreihe",status:"Nicht anwendbar"};
  const total=c.publishedCount||items.length;
  const owned=Math.max(0,total-(c.missing||[]).length);
  const complete=c.status==="complete";
  return {percent:total?Math.round(owned/total*100):100,label:owned+" von "+total+" deutschsprachigen Bänden",gap:complete?(c.ongoing?"Aktuell vollständig · Reihe läuft":"Vollständig"):"Fehlend: "+(c.missing||[]).map(m=>"Band "+m.volume+" „"+m.title+"“").join(", "),status:complete?"Vollständig":"Unvollständig"};
}

function renderSeries(){
  const q=state.seriesQuery.trim().toLocaleLowerCase("de");
  const groups=state.series.map(series=>{
    const items=series.comics.map(byId).filter(Boolean);
    return {...series,items};
  }).filter(s=>!q||s.title.toLocaleLowerCase("de").includes(q));
  const standalone=state.comics.filter(c=>!c.seriesId);
  $("seriesResultCount").textContent=groups.length+" Reihen · "+standalone.length+" Einzelbände";
  $("seriesGrid").innerHTML=groups.map(seriesCard).join("")+(q?"":standaloneCard(standalone));
}

function coverStack(items){
  return '<div class="series-covers">'+items.slice(0,3).map(c=>'<img src="'+esc(c.cover)+'" alt="" loading="lazy">').join("")+'</div>';
}

function seriesVisualState(c){
  if(!c||c.status==="not-applicable") return "series-neutral";
  if(c.status==="incomplete") return "series-incomplete";
  if(c.ongoing) return "series-current";
  return "series-complete";
}

function seriesBandStrip(s){
  const c=s.completeness;
  if(!c?.publishedCount||c.status==="not-applicable") return "";
  const missing=new Map((c.missing||[]).map(m=>[Number.parseInt(m.volume,10),m]));
  const ownedByVolume=new Map();
  const unassigned=[];
  s.items.forEach(item=>{
    const n=volumeNumber(item.volume);
    if(n&&!ownedByVolume.has(n)) ownedByVolume.set(n,item); else unassigned.push(item);
  });
  const slots=[];
  for(let n=1;n<=c.publishedCount;n++){
    const gap=missing.get(n);
    if(gap){
      slots.push('<div class="band-slot band-missing" title="Fehlt: '+esc(gap.title)+'"><span class="band-number">Band '+n+'</span><span class="missing-mark">＋</span><strong>'+esc(gap.title)+'</strong></div>');
      continue;
    }
    const item=ownedByVolume.get(n)||unassigned.shift();
    if(item) slots.push('<div class="band-slot band-owned" title="'+esc(item.title)+'"><img src="'+esc(item.cover)+'" alt="Band '+n+': '+esc(item.title)+'" loading="lazy"><span class="band-number">Band '+n+'</span></div>');
  }
  return '<div class="band-strip" aria-label="Vorhandene und fehlende Bände">'+slots.join("")+'</div>';
}

function seriesCard(s){
  const stats=seriesStats(s,s.items);
  const c=s.completeness;
  const visual=seriesVisualState(c);
  const sources=(c?.sources||[]).map(src=>'<a class="series-source" href="'+esc(src.url)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">Quelle ↗</a>').join("");
  const checked=c?.checkedAt?'<span class="series-checked">Geprüft '+new Intl.DateTimeFormat("de-DE").format(new Date(c.checkedAt))+'</span>':"";
  return '<article class="series-card '+visual+'" data-series-id="'+esc(s.id)+'" tabindex="0">'+coverStack(s.items)+'<div class="series-card-body"><div class="series-status-row"><span class="series-status-dot"></span><p class="kicker">'+esc(stats.status)+' · '+s.items.length+' Ausgaben</p></div><h2>'+esc(s.title)+'</h2><p>'+esc(stats.label)+'</p><div class="progress" aria-label="'+stats.percent+' Prozent"><span style="width:'+stats.percent+'%"></span></div>'+seriesBandStrip(s)+'<p class="series-gap">'+esc(stats.gap)+'</p><div class="series-proof">'+checked+sources+'</div><strong>Reihe öffnen →</strong></div></article>';
}

function standaloneCard(items){
  return '<button class="series-card standalone-card" data-series-id="standalone">'+coverStack(items)+'<div class="series-card-body"><p class="kicker">'+items.length+' Comics</p><h2>Einzelbände</h2><p>Abgeschlossene Geschichten und noch nicht zugeordnete Ausgaben.</p><strong>Einzelbände öffnen →</strong></div></button>';
}

function openSeries(id){
  state.seriesFilter=id;
  $("seriesFilter").value=id;
  showView("collection");
}

function openDetail(id){
  const c=byId(id); if(!c) return;
  state.lastView=state.view==="detail"?"collection":state.view;
  renderDetail(c); showView("detail");
}

function dataRow(label,value){
  return '<div class="data-row"><span>'+esc(label)+'</span><strong>'+esc(value==null||value===""?"Nicht angegeben":value)+'</strong></div>';
}

function renderDetail(c){
  const seriesLabel=c.series ? c.series+(c.volume?" · Band "+c.volume:"") : "Einzelband";
  $("detailContent").innerHTML='<div class="detail-hero"><div class="detail-visual"><img src="'+esc(c.cover)+'" alt="Cover von '+esc(c.title)+'"></div><div class="detail-main"><p class="kicker">'+esc(seriesLabel)+'</p><h1>'+esc(c.title)+'</h1><p class="detail-byline">'+esc((c.authors||[]).join(" · "))+'</p><p>'+esc(c.subtitle||"")+'</p><div class="status-actions"><button class="'+(c.read?"active":"")+'" data-action="read">✓ Gelesen</button><button class="'+(c.favorite?"active":"")+'" data-action="favorite">★ Favorit</button><button class="'+(state.wishlist.has(c.id)?"active":"")+'" data-action="wishlist">♡ Wunschliste</button></div></div></div><div class="detail-sections"><section class="info-section"><h2>Bibliografische Daten</h2><div class="data-list">'+
  dataRow("Reihe",c.series||"Einzelband")+dataRow("Band",c.volume)+dataRow("Verlag",c.publisher)+dataRow("Erscheinungsdatum",formatDate(c.publicationDate))+dataRow("Auflage",c.edition)+dataRow("Einband",c.binding)+dataRow("Seiten",c.pages)+dataRow("Sprache",c.language)+dataRow("ISBN",c.isbn13||"Ohne ISBN")+dataRow("Genre",(c.genre||[]).join(", "))+dataRow("Datenquelle",c.metadataSource)+
  '</div></section><section class="private-block"><h2>Meine Sammlung</h2><div class="data-list">'+dataRow("Status",c.status==="owned"?"Im Bestand":c.status)+dataRow("Zustand",c.condition)+dataRow("Standort",c.shelf)+dataRow("Kaufpreis",formatMoney(c.purchasePrice))+dataRow("Kaufdatum",formatDate(c.purchaseDate))+dataRow("Kaufort",c.purchasePlace)+dataRow("Bewertung",c.rating?c.rating+" / 5":"Noch nicht bewertet")+'</div><p class="privacy-note">Diese persönlichen Angaben bleiben Bestandteil deines privaten Katalogs.</p></section></div>';
  document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{
    const action=button.dataset.action;
    if(action==="read") c.read=!c.read;
    if(action==="favorite") c.favorite=!c.favorite;
    if(action==="wishlist"){state.wishlist.has(c.id)?state.wishlist.delete(c.id):state.wishlist.add(c.id);}
    renderDetail(c);renderDashboard();renderCollection();renderWishlist();
  }));
}

function renderWishlist(){
  const items=state.comics.filter(c=>state.wishlist.has(c.id));
  if(!items.length){
    $("wishlistContent").className="empty-wishlist";
    $("wishlistContent").innerHTML='<div class="empty-icon">♡</div><h2>Die Wunschliste ist noch leer.</h2><p>Auf der Detailseite kannst du einen Comic vormerken.</p><button class="primary-action" data-view-link="collection">Sammlung öffnen <span>→</span></button>';
  } else {
    $("wishlistContent").className="comic-grid wishlist-grid";
    $("wishlistContent").innerHTML=items.map(comicCard).join("");
  }
}

window.addEventListener("beforeprint",()=>document.querySelectorAll('img[loading="lazy"]').forEach(img=>img.loading="eager"));

init();
