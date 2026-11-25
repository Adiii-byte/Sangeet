// ===== Settings =====
const AUDIUS = "https://api.audius.co/v1";
const APP = "sangeet";
const JAMENDO_ID = "";   // developer.jamendo.com se free client_id
const LASTFM_KEY = "";   // last.fm/api se free key

let tracks = [];
let current = -1;
let inFavs = false;
let favs = JSON.parse(localStorage.getItem("favs") || "[]");

// Genre buttons: label dikhega, q se search hoga
const GENRES = [
  { label: "Punjabi", q: "punjabi" },
  { label: "Bhojpuri", q: "bhojpuri" },
  { label: "Haryanvi", q: "haryanvi" },
  { label: "Bollywood", q: "bollywood" },
  { label: "English Pop", q: "pop" },
  { label: "Hip-Hop", q: "hip hop" },
  { label: "Lo-Fi", q: "lofi" },
  { label: "Classical", q: "classical" },
  { label: "Devotional", q: "devotional" },
  { label: "Chill", q: "chill" }
];

// ===== Chhote helpers =====
function $(id) {
  return document.getElementById(id);
}

function none() {
  return [];
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

// Photo load na ho to uski jagah 🎵 dikhao
function imgFail(img) {
  img.onerror = null;
  img.outerHTML = '<div class="noimg">🎵</div>';
}

// ===== Audius =====
function fromAudius(t) {
  return {
    id: "audius-" + t.id,
    title: t.title,
    artist: t.user.name,
    image: t.artwork ? t.artwork["150x150"] : "",
    audioUrl: AUDIUS + "/tracks/" + t.id + "/stream?app_name=" + APP,
    duration: t.duration,
    source: "Audius"
  };
}

async function getAudius(path) {
  const res = await fetch(AUDIUS + path + "&app_name=" + APP);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data.map(fromAudius);
}

function searchAudius(q) {
  return getAudius("/tracks/search?query=" + encodeURIComponent(q));
}

function trendingAudius() {
  return getAudius("/tracks/trending?time=week");
}

// ===== Jamendo =====
function fromJamendo(t) {
  return {
    id: "jamendo-" + t.id,
    title: t.name,
    artist: t.artist_name,
    image: t.image,
    audioUrl: t.audio,
    duration: t.duration,
    album: t.album_name,
    source: "Jamendo"
  };
}

async function getJamendo(extra) {
  if (!JAMENDO_ID) return [];
  const url = "https://api.jamendo.com/v3.0/tracks/?client_id=" + JAMENDO_ID +
    "&format=json&limit=20" + extra;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.results.map(fromJamendo);
}

function searchJamendo(q) {
  return getJamendo("&search=" + encodeURIComponent(q));
}

function trendingJamendo() {
  return getJamendo("&order=popularity_week");
}

// ===== Internet Archive =====
async function searchArchive(q) {
  const query = "(" + q + ") AND mediatype:audio";
  const url = "https://archive.org/advancedsearch.php?q=" + encodeURIComponent(query) +
    "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&rows=15&output=json";
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.response.docs.map(function (d) {
    const creator = Array.isArray(d.creator) ? d.creator[0] : d.creator;
    return {
      id: "archive-" + d.identifier,
      archiveId: d.identifier,
      title: String(d.title || d.identifier),
      artist: creator || "Internet Archive",
      image: "https://archive.org/services/img/" + d.identifier,
      audioUrl: "",   // play karte waqt dhundenge
      source: "Archive"
    };
  });
}

// Archive ke item ke andar se mp3 file dhundhna
async function resolveArchive(song) {
  const res = await fetch("https://archive.org/metadata/" + song.archiveId);
  const data = await res.json();
  const file = (data.files || []).find(function (f) {
    return f.format && f.format.indexOf("MP3") !== -1;
  });
  if (!file) return "";
  const path = file.name.split("/").map(encodeURIComponent).join("/");
  return "https://archive.org/download/" + song.archiveId + "/" + path;
}

// ===== Smart search: milana, duplicate hatana, sahi wale upar =====
function mix(lists) {
  const out = [];
  const max = Math.max.apply(null, lists.map(function (l) { return l.length; }));
  for (let i = 0; i < max; i++) {
    lists.forEach(function (l) {
      if (i < l.length) out.push(l[i]);
    });
  }
  return out;
}

function cleanUp(list, q) {
  const words = q.toLowerCase().split(" ").filter(Boolean);
  const seen = {};
  const out = [];
  list.forEach(function (t) {
    const key = (t.title + "|" + t.artist).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (seen[key]) return;
    seen[key] = true;
    const text = (t.title + " " + t.artist).toLowerCase();
    let score = 0;
    words.forEach(function (w) {
      if (text.indexOf(w) !== -1) score++;
    });
    t.score = score;
    out.push(t);
  });
  out.sort(function (a, b) { return b.score - a.score; });
  return out;
}

async function search() {
  const q = $("q").value.trim();
  if (!q) return;
  $("now").textContent = "Dhundh rahe hain...";
  const results = await Promise.all([
    searchAudius(q).catch(none),
    searchJamendo(q).catch(none),
    searchArchive(q).catch(none)
  ]);
  tracks = cleanUp(mix(results), q);
  inFavs = false;
  current = -1;
  $("now").textContent = tracks.length ? "Koi song select karo" : "Kuch nahi mila, dusra naam try karo";
  showList();
}

// ===== App khulte hi trending =====
async function loadTrending() {
  $("now").textContent = "Trending gaane la rahe hain...";
  const results = await Promise.all([
    trendingAudius().catch(none),
    trendingJamendo().catch(none)
  ]);
  tracks = cleanUp(mix(results), "");
  $("now").textContent = tracks.length ? "Trending gaane, koi select karo" : "Koi song select karo";
  showList();
}

// ===== Lyrics (LRCLIB) =====
async function loadLyrics(song) {
  const box = $("lyrics");
  box.textContent = "Lyrics dhundh rahe hain...";
  try {
    const url = "https://lrclib.net/api/get?artist_name=" + encodeURIComponent(song.artist) +
      "&track_name=" + encodeURIComponent(song.title);
    const res = await fetch(url);
    if (tracks[current] !== song) return;
    if (!res.ok) { box.textContent = "Is song ke lyrics nahi mile."; return; }
    const data = await res.json();
    if (data.instrumental) {
      box.textContent = "Ye instrumental track hai.";
    } else {
      box.textContent = data.plainLyrics || "Is song ke lyrics nahi mile.";
    }
  } catch (e) {
    box.textContent = "Is song ke lyrics nahi mile.";
  }
}

// ===== Milte-julte gaane (Last.fm) =====
async function loadSimilar(song) {
  const box = $("similar");
  box.innerHTML = "";
  if (!LASTFM_KEY) return;
  try {
    const url = "https://ws.audioscrobbler.com/2.0/?method=track.getsimilar" +
      "&artist=" + encodeURIComponent(song.artist) +
      "&track=" + encodeURIComponent(song.title) +
      "&api_key=" + LASTFM_KEY + "&format=json&limit=6";
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (tracks[current] !== song) return;
    const list = (data.similartracks && data.similartracks.track) || [];
    if (list.length === 0) return;
    box.innerHTML = "<b>Milte-julte gaane:</b> " + list.map(function (t) {
      return '<span class="chip" data-q="' + esc(t.name + " " + t.artist.name) + '">' + esc(t.name) + "</span>";
    }).join("");
  } catch (e) {}
}

// ===== Artist ki jaankari (MusicBrainz) =====
async function loadArtist(song) {
  const box = $("artistInfo");
  box.textContent = "";
  try {
    const url = "https://musicbrainz.org/ws/2/artist/?query=artist:" +
      encodeURIComponent('"' + song.artist + '"') + "&fmt=json&limit=1";
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (tracks[current] !== song) return;
    const a = data.artists && data.artists[0];
    if (!a) return;
    const parts = [];
    if (a.type) parts.push(a.type);
    if (a.country) parts.push(a.country);
    if (a["life-span"] && a["life-span"].begin) parts.push("since " + a["life-span"].begin);
    if (a.disambiguation) parts.push(a.disambiguation);
    if (parts.length) box.textContent = "Artist info: " + parts.join(" • ");
  } catch (e) {}
}

// ===== Favorites =====
function isFav(id) {
  return favs.some(function (f) { return f.id === id; });
}

function toggleFav(i, event) {
  event.stopPropagation();
  const t = tracks[i];
  if (isFav(t.id)) {
    favs = favs.filter(function (f) { return f.id !== t.id; });
  } else {
    favs.push(t);
  }
  localStorage.setItem("favs", JSON.stringify(favs));
  if (inFavs) { tracks = favs; }
  showList();
}

function showFavs() {
  inFavs = true;
  tracks = favs;
  current = -1;
  showList();
}

// ===== List dikhana =====
function showList() {
  const list = $("list");
  if (tracks.length === 0) {
    list.innerHTML = "<p>Yahan abhi kuch nahi hai.</p>";
    return;
  }
  let html = '<div class="thead"><span>#</span><span>Title</span><span>Artist</span>' +
    '<span>Album / Source</span><span>Duration</span><span></span></div>';
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const pic = t.image
      ? '<img src="' + esc(t.image) + '" alt="" onerror="imgFail(this)">'
      : '<div class="noimg">🎵</div>';
    const heart = ["Local", "Drive"].indexOf(t.source) !== -1 ? '<span class="heart"></span>' :
      '<span class="heart" onclick="toggleFav(' + i + ', event)">' + (isFav(t.id) ? "❤️" : "🤍") + "</span>";
    html +=
      '<div class="track' + (i === current ? " playing" : "") + '" onclick="play(' + i + ')">' +
        '<span class="num">' + (i === current ? "▶" : i + 1) + "</span>" +
        '<div class="tcell">' + pic + "<span>" + esc(t.title) + "</span></div>" +
        '<span class="artist">' + esc(t.artist) + "</span>" +
        '<span class="album">' + esc(t.album || t.source) + "</span>" +
        '<span class="dur">' + (t.duration ? fmt(t.duration) : "") + "</span>" +
        heart +
      "</div>";
  }
  list.innerHTML = html;
}

// ===== Bajana =====
async function play(i) {
  current = i;
  const song = tracks[i];
  $("now").textContent = "";
  showNowPlaying(song);
  document.querySelectorAll(".track").forEach(function (el, n) {
    el.classList.toggle("playing", n === i);
    el.querySelector(".num").textContent = n === i ? "▶" : n + 1;
  });

  // Archive ke item ka mp3 link pehli baar bajate waqt dhundhte hain
  if (song.archiveId && !song.audioUrl) {
    $("now").textContent = "Load ho raha hai...";
    try {
      song.audioUrl = await resolveArchive(song);
    } catch (e) {
      song.audioUrl = "";
    }
    if (current !== i) return;
    if (!song.audioUrl) {
      $("now").textContent = "Is item mein mp3 nahi mila, agla try kar rahe hain...";
      if (i + 1 < tracks.length) { play(i + 1); }
      return;
    }
    $("now").textContent = "";
  }

  if (song.driveId && !song.audioUrl) {
    $("now").textContent = "Drive se la rahe hain...";
    try {
      song.audioUrl = await resolveDrive(song);
    } catch (e) {
      $("now").textContent = "Drive se gaana nahi aaya: " + e.message;
      return;
    }
    if (current !== i) return;
    $("now").textContent = "";
  }

  const audio = $("audio");
  audio.src = song.audioUrl;
  audio.play().catch(function () {});

  if (["Local", "Drive"].indexOf(song.source) !== -1) {
    $("lyrics").textContent = "";
    $("similar").innerHTML = "";
    $("artistInfo").textContent = "";
  } else {
    loadLyrics(song);
    loadSimilar(song);
    loadArtist(song);
  }
}

// ===== Apni files bajana =====
$("files").addEventListener("change", function (e) {
  const picked = Array.from(e.target.files);
  tracks = picked.map(function (f, n) {
    return {
      id: "local-" + n + "-" + f.name,
      title: f.name.replace(/\.[^.]+$/, ""),
      artist: "Meri file",
      image: "",
      audioUrl: URL.createObjectURL(f),
      source: "Local"
    };
  });
  inFavs = false;
  current = -1;
  $("now").textContent = "Apni files, koi select karo";
  showList();
});

// ===== Now Playing card =====
let shuffleOn = false;
let repeatOn = false;
const audioEl = $("audio");

function showNowPlaying(song) {
  $("npTitle").textContent = song.title;
  $("npArtist").textContent = song.artist;
  $("npArt").style.backgroundImage = song.image
    ? 'url("' + song.image.replace(/"/g, "%22") + '")'
    : "none";
}

// 105 seconds ko "1:45" bana deta hai
function fmt(s) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ":" + (sec < 10 ? "0" : "") + sec;
}

function nextSong() {
  if (tracks.length === 0) return;
  if (shuffleOn) {
    play(Math.floor(Math.random() * tracks.length));
  } else if (current + 1 < tracks.length) {
    play(current + 1);
  }
}

function prevSong() {
  // 3 second se zyada baja ho ya pehla song ho to wahin se dobara shuru
  if (audioEl.currentTime > 3 || current <= 0) {
    audioEl.currentTime = 0;
    return;
  }
  play(current - 1);
}

audioEl.addEventListener("timeupdate", function () {
  if (isFinite(audioEl.duration) && audioEl.duration > 0) {
    $("seek").value = (audioEl.currentTime / audioEl.duration) * 100;
  }
  $("tCur").textContent = fmt(audioEl.currentTime);
});

audioEl.addEventListener("loadedmetadata", function () {
  $("tTot").textContent = fmt(audioEl.duration);
});

audioEl.addEventListener("play", function () { $("playBtn").textContent = "⏸"; });
audioEl.addEventListener("pause", function () { $("playBtn").textContent = "▶"; });

$("seek").addEventListener("input", function () {
  if (isFinite(audioEl.duration)) {
    audioEl.currentTime = ($("seek").value / 100) * audioEl.duration;
  }
});

$("playBtn").addEventListener("click", function () {
  if (!audioEl.getAttribute("src")) return;
  if (audioEl.paused) {
    audioEl.play().catch(function () {});
  } else {
    audioEl.pause();
  }
});

$("nextBtn").addEventListener("click", nextSong);
$("prevBtn").addEventListener("click", prevSong);

$("shuffleBtn").addEventListener("click", function () {
  shuffleOn = !shuffleOn;
  this.classList.toggle("on", shuffleOn);
});

$("repeatBtn").addEventListener("click", function () {
  repeatOn = !repeatOn;
  this.classList.toggle("on", repeatOn);
});

// ===== Volume =====
$("vol").addEventListener("input", function () {
  audioEl.volume = $("vol").value;
});

// ===== Tabs: Home, Search, Library =====
function showTab(name) {
  document.body.className = "tab-" + name;
  document.querySelectorAll("nav button").forEach(function (b) {
    b.classList.toggle("on", b.dataset.tab === name);
  });
  if (name === "home") loadTrending();
  if (name === "library") showFavs();
  if (name === "search") $("q").focus();
}

document.querySelectorAll("nav button").forEach(function (b) {
  b.addEventListener("click", function () { showTab(b.dataset.tab); });
});

// ===== Buttons aur events =====
function chipClick(e) {
  if (e.target.classList.contains("chip")) {
    $("q").value = e.target.dataset.q;
    search();
  }
}

$("genres").innerHTML = GENRES.map(function (g) {
  return '<span class="chip" data-q="' + esc(g.q) + '">' + esc(g.label) + "</span>";
}).join("");

$("genres").addEventListener("click", chipClick);
$("similar").addEventListener("click", chipClick);

$("audio").addEventListener("ended", function () {
  if (repeatOn) {
    $("audio").currentTime = 0;
    $("audio").play().catch(function () {});
  } else {
    nextSong();
  }
});

$("audio").addEventListener("error", function () {
  $("now").textContent = "Ye song nahi baj paya, agla try kar rahe hain...";
  if (current + 1 < tracks.length) { play(current + 1); }
});

$("btn").addEventListener("click", search);
$("q").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { search(); }
});

showTab("home");
