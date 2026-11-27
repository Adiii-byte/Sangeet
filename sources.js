// ===== Sangeet sources: Audius, Jamendo, Archive, Drive, YouTube, Spotify, local files =====
// Apni keys yahan paste karo (purani script.js / youtube.js / drive.js se wahi values)
const JAMENDO_ID = "18a5930f";
const YT_KEY = "AIzaSyCUnKfnPs6SPyxUt7uckjG6JaIT-4VkLuI";
const G_API_KEY = "AIzaSyAA9pECYkSxFC40PuFYNOMyWB5cv_oz9AU";
const G_PUBLIC_FOLDER = "1KdlbVMVAmIZnK25qV9_qQnTFRLGLVEcn";
const G_CLIENT_ID = "98037795094-rhbqn8ia362knd8lmktniikefcr936nd.apps.googleusercontent.com";

const AUDIUS = "https://api.audius.co/v1";
const APP_NAME = "sangeet";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

// ---------- helpers ----------
const catalog = {};
const likedData = JSON.parse(localStorage.getItem("sangeet-likedtracks") || "{}");
let lastList = tracks;
let driveToken = "";

function reg(list) { list.forEach(t => { catalog[t.id] = t; }); return list; }
function findTrack(id) { return catalog[id] || likedData[id] || null; }
function likedTracks() { return reg(liked.map(id => likedData[id]).filter(Boolean)); }
function none() { return []; }
function esc2(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function mmss(s) {
  s = Number(s);
  if (!isFinite(s) || s <= 0) return "";
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}
function safeUrl(u) { return String(u).replace(/["'()\s]/g, c => "%" + c.charCodeAt(0).toString(16)); }

// har source ka gaana ek hi shape mein
function mk(o) {
  return {
    id: o.id, title: o.title || "Untitled", artist: o.artist || "Unknown",
    album: o.album || o.source, duration: mmss(o.seconds),
    symbol: o.image ? "\u200b" : "♫",
    art: o.image ? "url('" + safeUrl(o.image) + "') center/cover no-repeat" : "linear-gradient(135deg,#7855b8,#183d55)",
    src: o.src || "", kind: o.kind || "", ref: o.ref || "", mode: o.mode || "", source: o.source
  };
}
function setTracks(list) { reg(list); tracks.splice(0, tracks.length, ...list); }

// ---------- Audius / Jamendo / Archive ----------
async function audiusGet(path) {
  const r = await fetch(AUDIUS + path + "&app_name=" + APP_NAME);
  if (!r.ok) return [];
  const j = await r.json();
  return j.data.map(t => mk({
    id: "audius-" + t.id, title: t.title, artist: t.user.name,
    image: t.artwork && t.artwork["150x150"], seconds: t.duration,
    src: AUDIUS + "/tracks/" + t.id + "/stream?app_name=" + APP_NAME, source: "Audius"
  }));
}
async function jamendoGet(extra) {
  if (!JAMENDO_ID) return [];
  const r = await fetch("https://api.jamendo.com/v3.0/tracks/?client_id=" + JAMENDO_ID + "&format=json&limit=20" + extra);
  if (!r.ok) return [];
  const j = await r.json();
  return j.results.map(t => mk({
    id: "jamendo-" + t.id, title: t.name, artist: t.artist_name, album: t.album_name,
    image: t.image, seconds: t.duration, src: t.audio, source: "Jamendo"
  }));
}
async function archiveSearch(q) {
  const url = "https://archive.org/advancedsearch.php?q=" + encodeURIComponent("(" + q + ") AND mediatype:audio") +
    "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&rows=15&output=json";
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  return j.response.docs.map(d => mk({
    id: "archive-" + d.identifier, title: String(d.title || d.identifier),
    artist: (Array.isArray(d.creator) ? d.creator[0] : d.creator) || "Internet Archive",
    image: "https://archive.org/services/img/" + d.identifier, kind: "archive", ref: d.identifier, source: "Archive"
  }));
}

// Archive aur Drive ka asli audio link bajate waqt nikalte hain
async function resolveSrc(t) {
  if (t.src) return t.src;
  if (t.kind === "archive") {
    const r = await fetch("https://archive.org/metadata/" + t.ref);
    const d = await r.json();
    const f = (d.files || []).find(x => x.format && x.format.indexOf("MP3") !== -1);
    if (!f) throw new Error("mp3 nahi mila");
    return "https://archive.org/download/" + t.ref + "/" + f.name.split("/").map(encodeURIComponent).join("/");
  }
  if (t.kind === "drive") {
    let url = DRIVE + "/" + t.ref + "?alt=media";
    const h = {};
    if (t.mode === "mine") url += "&key=" + G_API_KEY; else h.Authorization = "Bearer " + driveToken;
    const r = await fetch(url, { headers: h });
    if (!r.ok) { if (r.status === 401) driveToken = ""; throw new Error("Drive status " + r.status); }
    return URL.createObjectURL(await r.blob());
  }
  return "";
}

// ---------- smart search: milana, duplicate hatana, sahi wale upar ----------
function mixLists(ls) {
  const out = [];
  const max = Math.max(0, ...ls.map(l => l.length));
  for (let i = 0; i < max; i++) ls.forEach(l => { if (i < l.length) out.push(l[i]); });
  return out;
}
function rank(list, q) {
  const words = q.toLowerCase().split(" ").filter(Boolean);
  const seen = {};
  const out = [];
  list.forEach(t => {
    const key = (t.title + "|" + t.artist).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (seen[key]) return;
    seen[key] = true;
    const text = (t.title + " " + t.artist).toLowerCase();
    t._s = words.filter(w => text.indexOf(w) !== -1).length;
    out.push(t);
  });
  return out.sort((a, b) => b._s - a._s);
}

let searchSeq = 0;
window.search = async function (q) {
  q = (q || "").trim();
  $("#resultsTitle").textContent = q ? "Results for “" + q + "”" : "Suggested tracks";
  showPage("search");
  if (!q) { renderTracks("#searchResults", tracks); return; }
  const seq = ++searchSeq;
  $("#searchResults").innerHTML = '<p class="subhead">Dhundh rahe hain...</p>';
  const res = await Promise.all([
    audiusGet("/tracks/search?query=" + encodeURIComponent(q)).catch(none),
    jamendoGet("&search=" + encodeURIComponent(q)).catch(none),
    archiveSearch(q).catch(none)
  ]);
  if (seq !== searchSeq) return;
  setTracks(rank(mixLists(res), q));
  renderTracks("#searchResults", tracks);
};

async function loadTrending() {
  const res = await Promise.all([
    audiusGet("/tracks/trending?time=week").catch(none),
    jamendoGet("&order=popularity_week").catch(none)
  ]);
  const list = rank(mixLists(res), "");
  if (!list.length) {
    $("#quickGrid").innerHTML = '<p class="subhead">Trending abhi load nahi hua. Internet check karo ya Search try karo.</p>';
    return;
  }
  setTracks(list);
  renderHome();
  renderTracks("#searchResults", tracks);
}

// ---------- Quick mixes (Home aur Library ke cards) ----------
const MIXES = [
  ["Punjabi", "punjabi", "#7c2d12", "#f97316"], ["Bhojpuri", "bhojpuri", "#831843", "#fb7185"],
  ["Haryanvi", "haryanvi", "#78350f", "#f59e0b"], ["Bollywood", "bollywood", "#7f1d1d", "#ef4444"],
  ["English Pop", "pop", "#581c87", "#c084fc"], ["Hip-Hop", "hip hop", "#1c1917", "#ea580c"],
  ["Lo-Fi", "lofi", "#1e3a5f", "#fb923c"], ["Classical", "classical", "#422006", "#fcd34d"],
  ["Devotional", "devotional", "#9a3412", "#fdba74"], ["Chill", "chill", "#134e4a", "#f97316"]
];
albums.splice(0, albums.length, ...MIXES.map(m => ({
  title: m[0], artist: "Quick mix", symbol: m[0].charAt(0),
  art: "linear-gradient(135deg," + m[2] + "," + m[3] + ")", q: m[1]
})));
window.openMix = async function (i) {
  const m = albums[i];
  if (!m || !m.q) return;
  await search(m.q);
  if (tracks.length) playTrack(tracks[0]);
};

// ---------- player: queue, resolve, likes ----------
const _renderTracks = window.renderTracks;
window.renderTracks = function (target, list) {
  list = list || tracks;
  lastList = list;
  reg(list);
  _renderTracks(target, list);
};

window.playTrack = async function (track) {
  if (!track) return;
  if (!queue.some(q => q.id === track.id)) {
    const from = [lastList, tracks, likedTracks()].find(l => l.some(t => t.id === track.id));
    queue = [...(from || [track])];
  }
  current = track;
  queueIndex = queue.findIndex(t => t.id === track.id);
  $("#nowTitle").textContent = track.title;
  $("#nowArtist").textContent = track.artist;
  $("#miniArt").style.background = track.art;
  $("#miniArt").textContent = track.symbol;
  const on = liked.includes(track.id);
  $("#likeCurrent").textContent = on ? "♥" : "♡";
  $("#likeCurrent").classList.toggle("liked", on);
  stopEmbeds();
  try {
    if (!track.src) track.src = await resolveSrc(track);
  } catch (e) { toast("Ye gaana load nahi hua: " + e.message); return; }
  if (current !== track || !track.src) return;
  audio.src = track.src;
  audio.play().catch(() => toast("Playback shuru nahi hua."));
};

window.toggleLike = function (id) {
  const t = findTrack(id);
  if (!t) return;
  if (t.kind === "drive" || t.source === "Local") { toast("Drive aur local gaane like nahi ho sakte."); return; }
  if (liked.includes(id)) { liked = liked.filter(x => x !== id); delete likedData[id]; }
  else { liked.push(id); likedData[id] = { ...t }; }
  localStorage.setItem("sangeet-liked", JSON.stringify(liked));
  localStorage.setItem("sangeet-likedtracks", JSON.stringify(likedData));
  renderTracks("#likedList", likedTracks());
  renderTracks("#searchResults", tracks);
  if (current && current.id === id) {
    $("#likeCurrent").textContent = liked.includes(id) ? "♥" : "♡";
    $("#likeCurrent").classList.toggle("liked", liked.includes(id));
  }
};

audio.addEventListener("ended", () => $("#nextBtn").click());
audio.addEventListener("play", stopEmbeds);   // gaana shuru ho to YouTube/Spotify ruk jaye (ek baar mein ek hi)
audio.addEventListener("error", () => {
  if (!audio.getAttribute("src")) return;
  toast("Ye gaana nahi baj paya, agla try kar rahe hain...");
  if (queueIndex + 1 < queue.length) playTrack(queue[queueIndex + 1]);
});
$("#pageSearch").addEventListener("keydown", e => { if (e.key === "Enter") search(e.target.value); });

// ---------- Sources page ----------
let ytPlayer = null, ytItems = [], ytIndex = -1;
function stopYT() {
  if (ytPlayer && ytPlayer.pauseVideo) { try { ytPlayer.pauseVideo(); } catch (e) {} }
  $("#ytFloat").hidden = true;
}
function stopEmbeds() { stopYT(); stopSpotify(); }
const _showPage = window.showPage;
window.showPage = function (name) {
  // YouTube aur Spotify floating window dusre pages pe bhi chalti rehti hain
  _showPage(name);
};
$$("[data-src]").forEach(b => b.addEventListener("click", () => {
  $$("[data-src]").forEach(x => x.classList.toggle("selected", x === b));
  $$(".src-panel").forEach(p => p.classList.toggle("active", p.id === "src-" + b.dataset.src));
}));

// YouTube (official player, ads aayenge)
const ytTag = document.createElement("script");
ytTag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(ytTag);
function decodeHtml(s) { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; }
async function ytSearch() {
  const q = $("#ytq").value.trim();
  if (!q) return;
  if (!YT_KEY) { toast("Pehle sources.js mein YT_KEY daalo."); return; }
  $("#ytList").innerHTML = '<p class="subhead">Dhundh rahe hain...</p>';
  try {
    const url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true" +
      "&videoCategoryId=10&maxResults=15&q=" + encodeURIComponent(q) + "&key=" + YT_KEY;
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok) { $("#ytList").innerHTML = '<p class="subhead">YouTube error: ' + esc2(d.error ? d.error.message : r.status) + "</p>"; return; }
    ytItems = d.items.map(it => ({
      id: it.id.videoId, title: decodeHtml(it.snippet.title),
      channel: decodeHtml(it.snippet.channelTitle), thumb: it.snippet.thumbnails.medium.url
    }));
    ytIndex = -1;
    ytRender();
  } catch (e) { $("#ytList").innerHTML = '<p class="subhead">Internet ya server ki dikkat, dobara try karo.</p>'; }
}
function ytRender() {
  $("#ytList").innerHTML = ytItems.map((v, i) =>
    '<div class="track-row yt' + (i === ytIndex ? " playing" : "") + '" data-yt="' + i + '"><span class="track-number">' + (i === ytIndex ? "▶" : String(i + 1).padStart(2, "0")) + '</span>' +
    '<div class="track-art art" style="--art:url(\'' + safeUrl(v.thumb) + '\') center/cover no-repeat">&#8203;</div>' +
    '<div class="track-info"><b>' + esc2(v.title) + "</b><small>" + esc2(v.channel) + "</small></div><span></span><span></span></div>"
  ).join("") || '<p class="subhead">Kuch nahi mila.</p>';
}
let ytAuto = true;
function ytNext() {
  if (ytIndex + 1 < ytItems.length) ytPlayIndex(ytIndex + 1);
  else toast("YouTube list khatam ho gayi.");
}
function ytPrev() { if (ytIndex > 0) ytPlayIndex(ytIndex - 1); }
function ytPlayIndex(i) {
  if (!window.YT || !YT.Player) { toast("YouTube player load ho raha hai, ek second baad dobara tap karo."); return; }
  audio.pause();
  stopSpotify();
  $("#ytFloat").hidden = false;
  ytIndex = i;
  ytRender();
  const id = ytItems[i].id;
  if (!ytPlayer) {
    ytPlayer = new YT.Player("ytPlayer", {
      width: "100%", height: "100%", videoId: id, playerVars: { autoplay: 1, playsinline: 1 },
      events: {
        onStateChange: e => { if (e.data === YT.PlayerState.ENDED && ytAuto) ytNext(); },
        onError: () => { toast("Ye video embed nahi ho sakta" + (ytAuto ? ", agla try kar rahe hain..." : ".")); if (ytAuto) ytNext(); }
      }
    });
  } else { ytPlayer.loadVideoById(id); }
}
$("#ytAll").addEventListener("click", () => { if (ytItems.length) ytPlayIndex(0); else toast("Pehle YouTube pe kuch dhundo."); });
$("#ytPrev").addEventListener("click", ytPrev);
$("#ytNext").addEventListener("click", ytNext);
$("#ytAuto").addEventListener("change", e => { ytAuto = e.target.checked; });
$("#ytBtn").addEventListener("click", ytSearch);
$("#ytClose").addEventListener("click", () => { if (ytPlayer && ytPlayer.stopVideo) { try { ytPlayer.stopVideo(); } catch (e) {} } $("#ytFloat").hidden = true; });
$("#ytq").addEventListener("keydown", e => { if (e.key === "Enter") ytSearch(); });
$("#ytList").addEventListener("click", e => { const r = e.target.closest("[data-yt]"); if (r) ytPlayIndex(Number(r.dataset.yt)); });

// Spotify (official embed + iFrame API: saved gaane back-to-back chal sakte hain)
// Spotify playlists: naam -> saved links ki list (browser mein save hoti hain)
let spData = JSON.parse(localStorage.getItem("sangeet-spplaylists") || "null");
if (!spData) spData = { cur: "My Spotify", lists: { "My Spotify": JSON.parse(localStorage.getItem("sangeet-splinks") || "[]") } };
let spCur = spData.lists[spData.cur] ? spData.cur : Object.keys(spData.lists)[0];
let spLinks = spData.lists[spCur];
let spPlayList = spLinks;
function spSave() { spData.cur = spCur; localStorage.setItem("sangeet-spplaylists", JSON.stringify(spData)); }
let spApi = null, spCtl = null, spPending = null, spIndex = -1, spType = "", spAuto = true;
let spEnding = false, spLast = null, spWantPlay = false;
window.onSpotifyIframeApiReady = api => {
  spApi = api;
  if (spPending) { const u = spPending; spPending = null; spLoad(u); }
};
const spTag = document.createElement("script");
spTag.src = "https://open.spotify.com/embed/iframe-api/v1";
spTag.async = true;
document.head.appendChild(spTag);

function spUri(link) {
  const m = link.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
  return m ? { type: m[1], uri: "spotify:" + m[1] + ":" + m[2] } : null;
}
function stopSpotify() {
  spWantPlay = false;
  spEnding = true;
  if (spCtl) { try { spCtl.pause(); } catch (e) {} }
  $("#spFloat").hidden = true;
}
function spLoad(u) {
  audio.pause();
  stopYT();
  spType = u.type;
  spEnding = false;
  spLast = null;
  spWantPlay = true;
  $("#spFloat").hidden = false;
  if (spCtl) {
    spCtl.loadUri(u.uri);
    setTimeout(() => { if (spWantPlay) spCtl.play(); }, 700);
    return;
  }
  if (!spApi) { spPending = u; toast("Spotify player load ho raha hai..."); return; }
  spApi.createController($("#spEmbed"), { width: "100%", height: 152, uri: u.uri }, c => {
    spCtl = c;
    c.addListener("ready", () => { if (spWantPlay) c.play(); });
    c.addListener("playback_update", spOnUpdate);
  });
}
// gaana khatam hote hi agla saved gaana
function spOnUpdate(e) {
  const d = e.data;
  if (!d.isPaused) spWantPlay = false;
  const prev = spLast;
  spLast = d;
  if (!spAuto || spEnding || spIndex < 0 || spType !== "track") return;
  const wasNearEnd = prev && prev.duration > 0 && prev.position >= prev.duration - 1500;
  const finished = (d.isPaused && wasNearEnd) || (d.duration > 0 && d.position >= d.duration - 250);
  if (finished) { spEnding = true; setTimeout(spNext, 400); }
}
function spPlayAt(i, list) {
  list = list || spLinks;
  const l = list[i];
  const u = l && spUri(l.link);
  if (!u) return;
  spPlayList = list;
  spIndex = i;
  spList();
  spLoad(u);
}
function spNext() {
  if (spIndex + 1 < spPlayList.length) spPlayAt(spIndex + 1, spPlayList);
  else toast("Saved list khatam ho gayi.");
}
function spPrev() { if (spIndex > 0) spPlayAt(spIndex - 1, spPlayList); }
function spRenderPls() {
  const names = Object.keys(spData.lists);
  $("#spPls").innerHTML = names.map((n, i) =>
    '<button class="pl-chip' + (n === spCur ? " on" : "") + '" data-pl="' + i + '">' + esc2(n) + " (" + spData.lists[n].length + ")</button>").join("") +
    '<button class="pl-chip" id="plNew">＋ New playlist</button><button class="pl-chip" id="plRen">Rename</button><button class="pl-chip" id="plDel">Delete</button>';
}
function spList() {
  spRenderPls();
  const here = spPlayList === spLinks;
  $("#spList").innerHTML = spLinks.map((x, i) =>
    '<div class="track-row sp' + (here && i === spIndex ? " playing" : "") + '" data-sp="' + i + '"><span class="track-number">' + (here && i === spIndex ? "▶" : String(i + 1).padStart(2, "0")) + '</span>' +
    '<div class="track-art art" style="--art:linear-gradient(135deg,#1db954,#0b3d20)">&#8203;</div>' +
    '<div class="track-info"><b>' + esc2(x.label) + '</b><small>Spotify link</small></div><span></span>' +
    '<button class="track-like" data-spdel="' + i + '" aria-label="Remove">✕</button></div>').join("");
}
async function spLabel(link) {
  try { const r = await fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(link)); if (r.ok) return (await r.json()).title; } catch (e) {}
  return link;
}
async function spPlayInput() {
  const link = $("#spq").value.trim();
  if (!spUri(link)) { toast("Ye Spotify ka sahi link nahi lag raha."); return; }
  let i = spLinks.findIndex(x => x.link === link);
  if (i < 0) {
    spLinks.push({ link, label: link });
    i = spLinks.length - 1;
    spSave();
    spPlayAt(i);
    spLabel(link).then(t => { spLinks[i].label = t; spSave(); spList(); });
  } else spPlayAt(i);
}
$("#spPlayBtn").addEventListener("click", spPlayInput);
$("#spAll").addEventListener("click", () => { if (spLinks.length) spPlayAt(0); else toast("Pehle kuch Spotify links save karo."); });
$("#spPrev").addEventListener("click", spPrev);
$("#spNext").addEventListener("click", spNext);
$("#spAuto").addEventListener("change", e => { spAuto = e.target.checked; });
$("#spClose").addEventListener("click", stopSpotify);
$("#spSearchBtn").addEventListener("click", () => {
  const q = $("#spq").value.trim();
  if (q) window.open("https://open.spotify.com/search/" + encodeURIComponent(q), "_blank", "noopener");
});
$("#spq").addEventListener("keydown", e => { if (e.key === "Enter") spPlayInput(); });
$("#spPls").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  const names = Object.keys(spData.lists);
  if (b.dataset.pl !== undefined) {
    spCur = names[Number(b.dataset.pl)];
    spLinks = spData.lists[spCur];
  } else if (b.id === "plNew") {
    const n = (prompt("Playlist ka naam") || "").trim();
    if (!n) return;
    if (spData.lists[n]) { toast("Is naam ki playlist pehle se hai."); return; }
    spData.lists[n] = [];
    spCur = n;
    spLinks = spData.lists[n];
  } else if (b.id === "plRen") {
    const n = (prompt("Naya naam", spCur) || "").trim();
    if (!n || n === spCur) return;
    if (spData.lists[n]) { toast("Is naam ki playlist pehle se hai."); return; }
    const nl = {};
    names.forEach(k => { nl[k === spCur ? n : k] = spData.lists[k]; });
    spData.lists = nl;
    spCur = n;
  } else if (b.id === "plDel") {
    if (names.length < 2) { toast("Kam se kam ek playlist rehni chahiye."); return; }
    if (!confirm("“" + spCur + "” playlist delete karein?")) return;
    if (spPlayList === spLinks) spIndex = -1;
    delete spData.lists[spCur];
    spCur = Object.keys(spData.lists)[0];
    spLinks = spData.lists[spCur];
  }
  spSave();
  spList();
});
$("#spList").addEventListener("click", e => {
  const del = e.target.closest("[data-spdel]");
  if (del) {
    const k = Number(del.dataset.spdel);
    spLinks.splice(k, 1);
    if (spPlayList === spLinks) { if (k < spIndex) spIndex--; else if (k === spIndex) spIndex = -1; }
    spSave();
    spList();
    return;
  }
  const row = e.target.closest("[data-sp]");
  if (row) spPlayAt(Number(row.dataset.sp));
});

// Google Drive
const gTag = document.createElement("script");
gTag.src = "https://accounts.google.com/gsi/client";
document.head.appendChild(gTag);
function driveLogin(next) {
  if (!G_CLIENT_ID) { $("#dNote").textContent = "Pehle sources.js mein G_CLIENT_ID daalo."; return; }
  if (!window.google || !google.accounts) { $("#dNote").textContent = "Google login load ho raha hai, ek second baad dobara tap karo."; return; }
  google.accounts.oauth2.initTokenClient({
    client_id: G_CLIENT_ID, scope: "https://www.googleapis.com/auth/drive.readonly",
    callback: r => { if (r.access_token) { driveToken = r.access_token; next(); } else $("#dNote").textContent = "Login nahi ho paya."; }
  }).requestAccessToken();
}
async function listDrive(mode) {
  const headers = {};
  let q = "trashed=false and mimeType contains 'audio/'";
  let url;
  if (mode === "mine") {
    if (!G_API_KEY || !G_PUBLIC_FOLDER) { $("#dNote").textContent = "Pehle sources.js mein G_API_KEY aur G_PUBLIC_FOLDER daalo."; return; }
    q = "'" + G_PUBLIC_FOLDER + "' in parents and " + q;
    url = DRIVE + "?q=" + encodeURIComponent(q) + "&fields=" + encodeURIComponent("files(id,name)") + "&pageSize=100&key=" + G_API_KEY;
  } else {
    url = DRIVE + "?q=" + encodeURIComponent(q) + "&fields=" + encodeURIComponent("files(id,name)") + "&pageSize=100";
    headers.Authorization = "Bearer " + driveToken;
  }
  $("#dNote").textContent = "Drive se list la rahe hain...";
  try {
    const r = await fetch(url, { headers });
    const d = await r.json();
    if (!r.ok) { if (r.status === 401) driveToken = ""; $("#dNote").textContent = "Drive error: " + (d.error ? d.error.message : r.status); return; }
    const list = d.files.map(f => mk({
      id: "drive-" + f.id, title: f.name.replace(/\.[^.]+$/, ""), artist: mode === "mine" ? "Sangeet ki Drive" : "Meri Drive",
      kind: "drive", ref: f.id, mode, source: "Drive"
    }));
    $("#dNote").textContent = list.length ? list.length + " gaane mile, koi select karo." : "Is Drive mein koi audio file nahi mili.";
    renderTracks("#driveList", list);
  } catch (e) { $("#dNote").textContent = "Internet ya server ki dikkat, dobara try karo."; }
}
$("#dMine").addEventListener("click", () => listDrive("mine"));
$("#dYours").addEventListener("click", () => { if (driveToken) listDrive("yours"); else driveLogin(() => listDrive("yours")); });

// Apni files
$("#localFiles").addEventListener("change", e => {
  const list = Array.from(e.target.files).map((f, n) => mk({
    id: "local-" + Date.now() + "-" + n, title: f.name.replace(/\.[^.]+$/, ""), artist: "Meri file",
    src: URL.createObjectURL(f), kind: "local", source: "Local"
  }));
  renderTracks("#localList", list);
});

// ---------- start ----------
spList();
renderHome();
loadTrending();
