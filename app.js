// Sangeet frontend. Connect your own Drive / YouTube source adapters in the marked section.
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const tracks=[];
const albums=[{title:"Late night thoughts",artist:"A Sangeet mix",symbol:"☾",art:"linear-gradient(135deg,#7d5ac5,#152d4a)"},{title:"Soft focus",artist:"Calm collection",symbol:"☁",art:"linear-gradient(135deg,#6cabb0,#d5b5a4)"},{title:"Electric dreams",artist:"Electronic mix",symbol:"⌁",art:"linear-gradient(135deg,#e77caa,#5546a6)"},{title:"Indie skies",artist:"Independent voices",symbol:"✳",art:"linear-gradient(135deg,#dc9a5d,#315d70)"},{title:"After hours",artist:"Night collection",symbol:"◇",art:"linear-gradient(135deg,#4356a1,#10182e)"}];
const defaults={theme:"nebula",accent:"#a855f7",density:"comfortable",navigation:"sidebar",motion:true,visualizer:true};
let settings={...defaults,...JSON.parse(localStorage.getItem("sangeet-settings")||"{}")};
let current=null, liked=JSON.parse(localStorage.getItem("sangeet-liked")||"[]"), queue=[...tracks], queueIndex=0, isPlaying=false;
const audio=$("#audio");
function saveSettings(){localStorage.setItem("sangeet-settings",JSON.stringify(settings));$("#savedMessage").textContent="Saved automatically";}
function applySettings(){
 document.documentElement.dataset.theme=settings.theme;
 document.documentElement.style.setProperty("--accent",settings.accent);
 document.documentElement.dataset.density=settings.density;
 document.documentElement.dataset.navigation=settings.navigation;
 document.body.classList.toggle("no-motion",!settings.motion);
 $("#motionToggle").checked=settings.motion;$("#visualizerToggle").checked=settings.visualizer;
 $$("[data-theme-choice]").forEach(b=>b.classList.toggle("selected",b.dataset.themeChoice===settings.theme));
 $$("[data-accent]").forEach(b=>b.classList.toggle("selected",b.dataset.accent.toLowerCase()===settings.accent.toLowerCase()));
 $$("[data-density]").forEach(b=>b.classList.toggle("selected",b.dataset.density===settings.density));
 $$("[data-navigation]").forEach(b=>b.classList.toggle("selected",b.dataset.navigation===settings.navigation));
}
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2200)}
function artEl(item,cls="art"){return `<div class="${cls}" style="--art:${item.art}">${item.symbol||"♫"}</div>`}
function renderAlbums(target,items=albums){$(target).innerHTML=items.map((a,i)=>`<article class="album-card" data-album="${i}">${artEl(a)}<b>${a.title}</b><small>${a.artist}</small></article>`).join("");}
function trackRow(t,i){return `<div class="track-row" data-track="${t.id}"><span class="track-number">${String(i+1).padStart(2,"0")}</span>${artEl(t,"track-art art")}<div class="track-info"><b>${esc2(t.title)}</b><small>${esc2(t.artist)} · ${esc2(t.album)}</small></div><span class="track-duration">${t.duration}</span><button class="track-like ${liked.includes(t.id)?"liked":""}" data-like="${t.id}" aria-label="Like">${liked.includes(t.id)?"♥":"♡"}</button></div>`}
function renderTracks(target,list=tracks){$(target).innerHTML=list.map(trackRow).join("")||'<p class="subhead">No tracks found. Try another search.</p>'}
function renderHome(){ $("#quickGrid").innerHTML=tracks.slice(0,3).map(t=>`<div class="quick-card" data-track="${t.id}">${artEl(t)}<div><b>${esc2(t.title)}</b><small>${esc2(t.artist)}</small></div><span class="quick-play">▶</span></div>`).join("");renderAlbums("#albumGrid");}
function showPage(name){$$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${name}`));$$("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===name));if(name==="library")renderAlbums("#libraryGrid");if(name==="liked")renderTracks("#likedList",likedTracks());if(name==="playlist")renderTracks("#playlistTracks",tracks.slice(0,4));window.scrollTo({top:0,behavior:settings.motion?"smooth":"instant"});}
function playTrack(track){if(!track)return;current=track;queueIndex=queue.findIndex(t=>t.id===track.id);$("#nowTitle").textContent=track.title;$("#nowArtist").textContent=track.artist;$("#miniArt").style.background=track.art;$("#miniArt").textContent=track.symbol;$("#likeCurrent").textContent=liked.includes(track.id)?"♥":"♡";$("#likeCurrent").classList.toggle("liked",liked.includes(track.id));if(track.src){audio.src=track.src;audio.play().then(()=>{isPlaying=true;updatePlayButton()}).catch(()=>toast("Playback could not start. Check the audio source."));}else{isPlaying=false;updatePlayButton();toast("Demo track selected — connect your music source to play audio.");}}
function updatePlayButton(){$("#playBtn").textContent=isPlaying?"Ⅱ":"▶";}
function togglePlay(){if(!current){playTrack(queue[0]);return}if(!audio.src){toast("Connect Drive / YouTube audio source to enable playback.");return}if(isPlaying)audio.pause();else audio.play().catch(()=>toast("Unable to play this track."));}
function toggleLike(id){if(liked.includes(id))liked=liked.filter(x=>x!==id);else liked.push(id);localStorage.setItem("sangeet-liked",JSON.stringify(liked));renderTracks("#likedList",likedTracks());renderTracks("#searchResults",filteredTracks($("#pageSearch").value));if(current?.id===id){$("#likeCurrent").textContent=liked.includes(id)?"♥":"♡";$("#likeCurrent").classList.toggle("liked",liked.includes(id));}}
function filteredTracks(q){q=(q||"").toLowerCase().trim();return tracks.filter(t=>!q||`${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q))}
function search(q){$("#resultsTitle").textContent=q?`Results for “${q}”`:"Suggested tracks";renderTracks("#searchResults",filteredTracks(q));showPage("search");}
function formatTime(s){if(!Number.isFinite(s))return"0:00";return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`}
document.addEventListener("click",e=>{
 const page=e.target.closest("[data-page]");if(page){showPage(page.dataset.page);return}
 const likeFirst=e.target.closest("[data-like]");if(likeFirst){toggleLike(String(likeFirst.dataset.like));return}
 const track=e.target.closest("[data-track]");if(track){playTrack(findTrack(track.dataset.track));return}
 const like=e.target.closest("[data-like]");if(like){toggleLike(Number(like.dataset.like));return}
 const theme=e.target.closest("[data-theme-choice]");if(theme){settings.theme=theme.dataset.themeChoice;applySettings();saveSettings();return}
 const accent=e.target.closest("[data-accent]");if(accent){settings.accent=accent.dataset.accent;applySettings();saveSettings();return}
 const density=e.target.closest("[data-density]");if(density){settings.density=density.dataset.density;applySettings();saveSettings();return}
 const nav=e.target.closest("[data-navigation]");if(nav){settings.navigation=nav.dataset.navigation;applySettings();saveSettings();return}
 const cat=e.target.closest("[data-query]");if(cat){search(cat.dataset.query);$("#pageSearch").value=cat.dataset.query;return}
 const album=e.target.closest("[data-album]");if(album)openMix(Number(album.dataset.album));
});
$("#globalSearch").addEventListener("keydown",e=>{if(e.key==="Enter")search(e.target.value)});
$("#pageSearch").addEventListener("input",e=>{renderTracks("#searchResults",filteredTracks(e.target.value));$("#resultsTitle").textContent=e.target.value?`Results for “${e.target.value}”`:"Suggested tracks"});
$("#playBtn").addEventListener("click",togglePlay);
$("#likeCurrent").addEventListener("click",()=>current&&toggleLike(current.id));
$("#nextBtn").addEventListener("click",()=>{queueIndex=(queueIndex+1)%queue.length;playTrack(queue[queueIndex])});
$("#prevBtn").addEventListener("click",()=>{queueIndex=(queueIndex-1+queue.length)%queue.length;playTrack(queue[queueIndex])});
$("#shuffleBtn").addEventListener("click",()=>{queue=[...tracks].sort(()=>Math.random()-.5);queueIndex=0;toast("Shuffle is on")});
$("#repeatBtn").addEventListener("click",()=>toast("Repeat mode toggled"));
$("#queueBtn").addEventListener("click",()=>toast("Queue: "+queue.map(t=>t.title).join(", ")));
$("#volume").addEventListener("input",e=>audio.volume=Number(e.target.value)/100);
audio.addEventListener("play",()=>{isPlaying=true;updatePlayButton()});audio.addEventListener("pause",()=>{isPlaying=false;updatePlayButton()});
audio.addEventListener("timeupdate",()=>{$("#currentTime").textContent=formatTime(audio.currentTime);$("#duration").textContent=formatTime(audio.duration);$("#progress").value=audio.duration?audio.currentTime/audio.duration*100:0});
$("#progress").addEventListener("input",e=>{if(audio.duration)audio.currentTime=audio.duration*Number(e.target.value)/100});
$("#motionToggle").addEventListener("change",e=>{settings.motion=e.target.checked;applySettings();saveSettings()});
$("#visualizerToggle").addEventListener("change",e=>{settings.visualizer=e.target.checked;saveSettings();toast("Visualizer preference saved")});
$("#customAccent").addEventListener("input",e=>{settings.accent=e.target.value;applySettings();saveSettings()});
$("#resetSettings").addEventListener("click",()=>{settings={...defaults};applySettings();saveSettings();toast("Appearance reset to default")});
$("#addPlaylist").addEventListener("click",()=>{const name=prompt("Name your playlist");if(name?.trim()){const b=document.createElement("button");b.className="nav-link";b.dataset.page="playlist";b.innerHTML=`<span>◈</span> ${name.trim()}`;$("#playlistNav").append(b);toast("Playlist created (local demo)") }});
$$("[data-filter]").forEach(b=>b.addEventListener("click",()=>{$$("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));if(b.dataset.filter==="tracks")renderAlbums("#libraryGrid",[]);else renderAlbums("#libraryGrid",albums)}));
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("#globalSearch").focus()}if(e.code==="Space"&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){e.preventDefault();togglePlay()}});
$("#dateChip").textContent=new Intl.DateTimeFormat("en",{weekday:"long",month:"short",day:"numeric"}).format(new Date()).toUpperCase();
renderHome();renderTracks("#searchResults");applySettings();showPage("home");

// MUSIC SOURCE INTEGRATION:
// Keep your drive.js and youtube.js separate. Adapt their search/play results to this shape:
// { id, title, artist, album, duration, symbol, art, src }
// Then call renderTracks("#searchResults", yourTracks) and playTrack(yourTrack).
// If your scripts expose functions, map them here; no assumptions are made about their exports.
