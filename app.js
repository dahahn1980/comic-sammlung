const state = {
  comics: [], series: [], view: "dashboard", query: "", seriesQuery: "",
  status: "all", publisher: "all", seriesFilter: "all", year: "all",
  sort: "title", wishlist: new Set(), lastView: "collection",
  releases: [], releaseFilter: "open", releaseDecisions: {}, releaseQuery: "", releaseSort: "date-desc"
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
    const [comicsResponse, seriesResponse, releasesResponse] = await Promise.all([fetch("data/comics.json"),fetch("data/series.json"),fetch("data/new-releases.json")]);
    if(!comicsResponse.ok || !seriesResponse.ok || !releasesResponse.ok) throw new Error("Daten konnten nicht geladen werden");
    state.comics = await comicsResponse.json();
    state.series = await seriesResponse.json();
    state.releases = await releasesResponse.json();
    loadLocalState();
    enrichReleases();
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
    const person=event.target.closest("[data-person]");
    if(person){ openPerson(person.dataset.person); return; }
    const publisher=event.target.closest("[data-publisher]");
    if(publisher){ openPublisher(publisher.dataset.publisher); return; }
    const series=event.target.closest("[data-series-id]");
    if(series){ openSeries(series.dataset.seriesId); return; }
    const card=event.target.closest("[data-comic-id]");
    if(card){ openDetail(card.dataset.comicId); return; }
    const decision=event.target.closest("[data-release-decision]");
    if(decision){ setReleaseDecision(decision.dataset.releaseId,decision.dataset.releaseDecision); return; }
    const releaseFilter=event.target.closest("[data-release-filter]");
    if(releaseFilter){ state.releaseFilter=releaseFilter.dataset.releaseFilter; renderReleases(); return; }
  });
  $("searchInput").addEventListener("input",e=>{state.query=e.target.value;renderCollection();});
  $("seriesSearchInput").addEventListener("input",e=>{state.seriesQuery=e.target.value;renderSeries();});
  $("releaseSearchInput").addEventListener("input",e=>{state.releaseQuery=e.target.value;renderReleases();});
  $("releaseSortSelect").addEventListener("change",e=>{state.releaseSort=e.target.value;renderReleases();});
  ["statusFilter","publisherFilter","seriesFilter","yearFilter","sortSelect"].forEach(id=>{
    $(id).addEventListener("change",e=>{
      const key={statusFilter:"status",publisherFilter:"publisher",seriesFilter:"seriesFilter",yearFilter:"year",sortSelect:"sort"}[id];
      state[key]=e.target.value;renderCollection();
    });
  });
  $("backButton").addEventListener("click",()=>showView(state.lastView));
  $("mobileMenu").addEventListener("click",()=>document.querySelector(".main-nav").classList.toggle("open"));
  $("resetReleaseDecisions").addEventListener("click",()=>{
    if(window.confirm("Alle Entscheidungen im Neuheiten-Katalog zurücksetzen?")){
      state.releaseDecisions={}; saveLocalState(); renderReleases(); renderWishlist(); renderDashboard();
    }
  });
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
  if(view==="newreleases") renderReleases();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderAll(){
  renderDashboard(); renderCollection(); renderSeries(); renderWishlist(); renderReleases();
}

function loadLocalState(){
  try{
    state.releaseDecisions=JSON.parse(localStorage.getItem("comicarchiv-release-decisions")||"{}");
    state.wishlist=new Set(JSON.parse(localStorage.getItem("comicarchiv-comic-wishlist")||"[]"));
  }catch(error){ console.warn("Lokaler Stand konnte nicht geladen werden",error); }
}

function saveLocalState(){
  localStorage.setItem("comicarchiv-release-decisions",JSON.stringify(state.releaseDecisions));
  localStorage.setItem("comicarchiv-comic-wishlist",JSON.stringify([...state.wishlist]));
}

function enrichReleases(){
  const ownedIsbns=new Set(state.comics.map(c=>c.isbn13).filter(Boolean));
  const missingByIsbn=new Map();
  state.series.forEach(series=>(series.completeness?.missing||[]).forEach(missing=>{
    if(missing.isbn13) missingByIsbn.set(missing.isbn13,{seriesId:series.id,seriesTitle:series.title,volume:missing.volume});
  }));
  const ownedPeople=new Set(state.comics.flatMap(c=>c.authors||[]).map(v=>v.toLocaleLowerCase("de")));
  state.releases=state.releases.map(release=>{
    const gap=missingByIsbn.get(release.isbn13);
    const knownPerson=(release.authors||[]).find(name=>ownedPeople.has(name.toLocaleLowerCase("de")));
    return {...release,owned:ownedIsbns.has(release.isbn13),gap,knownPerson,relevant:Boolean(gap||knownPerson)};
  });
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
  $("wishCount").textContent=state.wishlist.size+state.releases.filter(r=>state.releaseDecisions[r.id]==="wishlist").length;
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

function resetCollectionFilters(){
  state.query=""; state.status="all"; state.publisher="all"; state.seriesFilter="all"; state.year="all";
  $("searchInput").value="";
  $("statusFilter").value="all"; $("publisherFilter").value="all"; $("seriesFilter").value="all"; $("yearFilter").value="all";
}

function openSeries(id){
  resetCollectionFilters();
  state.seriesFilter=id;
  $("seriesFilter").value=id;
  showView("collection");
}

function openPerson(name){
  resetCollectionFilters();
  state.query=name;
  $("searchInput").value=name;
  showView("collection");
}

function openPublisher(name){
  resetCollectionFilters();
  state.publisher=name;
  $("publisherFilter").value=name;
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

function linkedDataRow(label,html){
  return '<div class="data-row"><span>'+esc(label)+'</span><strong>'+html+'</strong></div>';
}

function renderDetail(c){
  const hasSeries=Boolean(c.seriesId&&c.series);
  const seriesText=c.series+(c.volume?" · Band "+c.volume:"");
  const seriesLink=hasSeries
    ? '<button class="entity-link series-link" data-series-id="'+esc(c.seriesId)+'">'+esc(seriesText)+' <span aria-hidden="true">→</span></button>'
    : '<span>Einzelband</span>';
  const people=(c.authors||[]);
  const peopleLinks=people.length
    ? people.map(name=>'<button class="entity-link person-link" data-person="'+esc(name)+'">'+esc(name)+'</button>').join('<span class="entity-separator"> · </span>')
    : '<span>Nicht angegeben</span>';
  const publisherLink=c.publisher
    ? '<button class="entity-link" data-publisher="'+esc(c.publisher)+'">'+esc(c.publisher)+'</button>'
    : '<span>Nicht angegeben</span>';

  $("detailContent").innerHTML='<div class="detail-hero"><div class="detail-visual"><img src="'+esc(c.cover)+'" alt="Cover von '+esc(c.title)+'"></div><div class="detail-main"><div class="kicker detail-series-link">'+seriesLink+'</div><h1>'+esc(c.title)+'</h1><div class="detail-byline">'+peopleLinks+'</div><p>'+esc(c.subtitle||"")+'</p><div class="status-actions"><button class="'+(c.read?"active":"")+'" data-action="read">✓ Gelesen</button><button class="'+(c.favorite?"active":"")+'" data-action="favorite">★ Favorit</button><button class="'+(state.wishlist.has(c.id)?"active":"")+'" data-action="wishlist">♡ Wunschliste</button></div></div></div><div class="detail-sections"><section class="info-section"><h2>Bibliografische Daten</h2><div class="data-list">'+
  linkedDataRow("Reihe",seriesLink)+dataRow("Band",c.volume)+linkedDataRow("Beteiligte",peopleLinks)+linkedDataRow("Verlag",publisherLink)+dataRow("Erscheinungsdatum",formatDate(c.publicationDate))+dataRow("Auflage",c.edition)+dataRow("Einband",c.binding)+dataRow("Seiten",c.pages)+dataRow("Sprache",c.language)+dataRow("ISBN",c.isbn13||"Ohne ISBN")+dataRow("Genre",(c.genre||[]).join(", "))+dataRow("Datenquelle",c.metadataSource)+
  '</div><p class="detail-link-hint">Reihe, Beteiligte und Verlag sind anklickbar.</p></section><section class="private-block"><h2>Meine Sammlung</h2><div class="data-list">'+dataRow("Status",c.status==="owned"?"Im Bestand":c.status)+dataRow("Zustand",c.condition)+dataRow("Standort",c.shelf)+dataRow("Kaufpreis",formatMoney(c.purchasePrice))+dataRow("Kaufdatum",formatDate(c.purchaseDate))+dataRow("Kaufort",c.purchasePlace)+dataRow("Bewertung",c.rating?c.rating+" / 5":"Noch nicht bewertet")+'</div><p class="privacy-note">Diese persönlichen Angaben bleiben Bestandteil deines privaten Katalogs.</p></section></div>';
  document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{
    const action=button.dataset.action;
    if(action==="read") c.read=!c.read;
    if(action==="favorite") c.favorite=!c.favorite;
    if(action==="wishlist"){state.wishlist.has(c.id)?state.wishlist.delete(c.id):state.wishlist.add(c.id);saveLocalState();}
    renderDetail(c);renderDashboard();renderCollection();renderWishlist();
  }));
}

function renderWishlist(){
  const items=state.comics.filter(c=>state.wishlist.has(c.id));
  const releases=state.releases.filter(r=>state.releaseDecisions[r.id]==="wishlist");
  if(!items.length&&!releases.length){
    $("wishlistContent").className="empty-wishlist";
    $("wishlistContent").innerHTML='<div class="empty-icon">♡</div><h2>Die Wunschliste ist noch leer.</h2><p>Auf der Detailseite kannst du einen Comic vormerken.</p><button class="primary-action" data-view-link="collection">Sammlung öffnen <span>→</span></button>';
  } else {
    $("wishlistContent").className="wishlist-combined";
    $("wishlistContent").innerHTML=(releases.length?'<div class="wishlist-section"><div class="section-heading compact"><div><p class="kicker">Aus dem Neuheiten-Katalog</p><h2>Vorgemerkte Neuheiten</h2></div></div><div class="release-grid wishlist-release-grid">'+releases.map(releaseCard).join("")+'</div></div>':"")+(items.length?'<div class="wishlist-section"><div class="section-heading compact"><div><p class="kicker">Aus deinem Bestand</p><h2>Weitere Vormerkungen</h2></div></div><div class="comic-grid wishlist-grid">'+items.map(comicCard).join("")+'</div></div>':"");
  }
}

function setReleaseDecision(id,decision){
  if(state.releaseDecisions[id]===decision) delete state.releaseDecisions[id];
  else state.releaseDecisions[id]=decision;
  saveLocalState();
  renderReleases(); renderWishlist(); renderDashboard();
}

function releaseMatchesFilter(release){
  const decision=state.releaseDecisions[release.id]||"open";
  const q=state.releaseQuery.trim().toLocaleLowerCase("de");
  const hay=[release.title,release.subtitle,release.publisher,release.isbn13,...(release.authors||[])].filter(Boolean).join(" ").toLocaleLowerCase("de");
  if(q&&!hay.includes(q)) return false;
  if(state.releaseFilter==="open") return decision==="open"&&!release.owned;
  if(state.releaseFilter==="relevant") return release.relevant&&decision!=="dismissed"&&!release.owned;
  if(state.releaseFilter==="owned") return release.owned;
  return decision===state.releaseFilter;
}

function renderReleases(){
  if(!$("releaseGrid")) return;
  const releases=state.releases.filter(releaseMatchesFilter).sort((a,b)=>{
    if(state.releaseSort==="relevance") return Number(b.relevant)-Number(a.relevant)||(b.releaseDate||"").localeCompare(a.releaseDate||"");
    if(state.releaseSort==="title") return a.title.localeCompare(b.title,"de");
    if(state.releaseSort==="price-asc") return (a.price??Number.MAX_VALUE)-(b.price??Number.MAX_VALUE);
    return (b.releaseDate||"").localeCompare(a.releaseDate||"")||a.title.localeCompare(b.title,"de");
  });
  const counts={
    open:state.releases.filter(r=>(state.releaseDecisions[r.id]||"open")==="open"&&!r.owned).length,
    relevant:state.releases.filter(r=>r.relevant&&(state.releaseDecisions[r.id]||"open")!=="dismissed"&&!r.owned).length,
    wishlist:state.releases.filter(r=>state.releaseDecisions[r.id]==="wishlist").length,
    later:state.releases.filter(r=>state.releaseDecisions[r.id]==="later").length,
    dismissed:state.releases.filter(r=>state.releaseDecisions[r.id]==="dismissed").length,
    owned:state.releases.filter(r=>r.owned).length
  };
  $("releaseSummary").innerHTML='<article><strong>'+counts.open+'</strong><span>Noch offen</span></article><article><strong>'+counts.relevant+'</strong><span>Für dich relevant</span></article><article><strong>'+counts.wishlist+'</strong><span>Auf Wunschliste</span></article>';
  $("releaseTabs").querySelectorAll("[data-release-filter]").forEach(button=>{
    const key=button.dataset.releaseFilter;
    button.classList.toggle("active",key===state.releaseFilter);
    button.textContent=button.textContent.replace(/\s·\s\d+$/,"")+" · "+counts[key];
  });
  const grouped=releases.reduce((groups,release)=>{
    const key=release.calendarWeek||calendarWeek(release.firstSeenAt||release.releaseDate);
    (groups[key]??=[]).push(release);
    return groups;
  },{});
  $("releaseGrid").innerHTML=Object.entries(grouped).map(([week,items])=>
    '<section class="release-week"><div class="release-week-heading"><span>'+esc(week)+'</span><strong>'+items.length+' Titel</strong></div><div class="release-week-grid">'+items.map(releaseCard).join("")+'</div></section>'
  ).join("");
  $("releaseEmpty").hidden=releases.length>0;
  const dates=state.releases.map(r=>r.releaseDate).filter(Boolean).sort();
  $("releaseSourceNote").textContent=dates.length
    ?"Datenstand: PPM-Neuheiten vom "+formatDate(dates[0])+" bis "+formatDate(dates.at(-1))+" · "+state.releases.length+" geprüfte Titel · Quellenangaben öffnen jeweils den Originaleintrag bei PPM."
    :"Quellenangaben öffnen jeweils den verifizierten Originaleintrag bei PPM.";
}

function calendarWeek(value){
  if(!value) return "Frühere Neuheiten";
  const date=new Date(value+"T12:00:00");
  const utc=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  utc.setUTCDate(utc.getUTCDate()+4-(utc.getUTCDay()||7));
  const start=new Date(Date.UTC(utc.getUTCFullYear(),0,1));
  const week=Math.ceil((((utc-start)/86400000)+1)/7);
  return utc.getUTCFullYear()+"-KW"+String(week).padStart(2,"0");
}

function releaseCard(release){
  const decision=state.releaseDecisions[release.id]||"open";
  let relevance="";
  if(release.gap) relevance='<div class="release-match strong">Schließt deine Lücke: '+esc(release.gap.seriesTitle)+' · Band '+esc(release.gap.volume)+'</div>';
  else if(release.knownPerson) relevance='<div class="release-match">Von '+esc(release.knownPerson)+' – bereits in deiner Sammlung vertreten</div>';
  else if(release.owned) relevance='<div class="release-match owned">Bereits in deiner Sammlung</div>';
  const active=key=>decision===key?" active":"";
  const scopeLabel={"splitter":"Splitter komplett","franco-belgisch":"Frankobelgisch","sammlungsbezug":"Passt zu deiner Sammlung","redaktionell":"Redaktionelle Auswahl"}[release.scope]||"Kuratierte Auswahl";
  const edition=release.editionType&&release.editionType!=="regular"
    ? '<span class="edition-badge">'+(release.editionType==="variant"?"Variante":"Neu-/Gesamtausgabe")+'</span>'
    : "";
  return '<article class="release-card">'+
    '<div class="release-cover"><img src="'+esc(release.cover)+'" alt="Cover von '+esc(release.title)+'" loading="lazy" onerror="this.closest(\'.release-cover\').classList.add(\'cover-error\');this.remove()"><span class="source-badge">PPM</span><span class="cover-fallback">Cover bei PPM ansehen</span></div>'+
    '<div class="release-body">'+relevance+'<div class="release-labels"><span class="scope-badge">'+esc(scopeLabel)+'</span>'+edition+'</div><p class="card-meta">'+esc(release.publisher)+' · erfasst '+formatDate(release.firstSeenAt||release.releaseDate)+'</p><h2>'+esc(release.title)+'</h2><p class="release-subtitle">'+esc(release.subtitle||"")+'</p><p class="release-authors">'+esc((release.authors||[]).join(", "))+'</p><div class="release-facts"><span>'+esc(release.isbn13)+'</span><strong>'+formatMoney(release.price)+'</strong></div>'+
    '<div class="release-actions"><button class="wish'+active("wishlist")+'" data-release-id="'+esc(release.id)+'" data-release-decision="wishlist">♡ Wunschliste</button><button class="'+active("later")+'" data-release-id="'+esc(release.id)+'" data-release-decision="later">Später</button><button class="'+active("dismissed")+'" data-release-id="'+esc(release.id)+'" data-release-decision="dismissed">Nicht interessant</button></div>'+
    '<a class="release-source" href="'+esc(release.sourceUrl)+'" target="_blank" rel="noopener">Original bei PPM ansehen ↗</a></div></article>';
}

window.addEventListener("beforeprint",()=>document.querySelectorAll('img[loading="lazy"]').forEach(img=>img.loading="eager"));

init();
