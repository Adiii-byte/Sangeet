// ===== Google Drive =====
// Option A (Sangeet ki Drive): API key + public folder ka ID
// Option B (Meri Google Drive): OAuth Client ID, user login karta hai
const G_API_KEY = "AIzaSyAA9pECYkSxFC40PuFYNOMyWB5cv_oz9AU";
const G_PUBLIC_FOLDER = "1KdlbVMVAmIZnK25qV9_qQnTFRLGLVEcn";
const G_CLIENT_ID = "98037795094-rhbqn8ia362knd8lmktniikefcr936nd.apps.googleusercontent.com";

const DRIVE = "https://www.googleapis.com/drive/v3/files";
let driveToken = "";

// Google ka login script load karo
const gTag = document.createElement("script");
gTag.src = "https://accounts.google.com/gsi/client";
document.head.appendChild(gTag);

function dNote(text) {
  $("dNote").textContent = text;
}

function driveLogin(next) {
  if (!G_CLIENT_ID) {
    dNote("Pehle drive.js mein G_CLIENT_ID daalo.");
    return;
  }
  if (!window.google || !google.accounts) {
    dNote("Google login load ho raha hai, ek second baad dobara click karo.");
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: G_CLIENT_ID,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    callback: function (resp) {
      if (resp.access_token) {
        driveToken = resp.access_token;
        next();
      } else {
        dNote("Login nahi ho paya.");
      }
    }
  });
  client.requestAccessToken();
}

async function listDrive(mode) {
  let url;
  const fields = "files(id,name)";
  const headers = {};
  if (mode === "mine") {
    if (!G_API_KEY || !G_PUBLIC_FOLDER) {
      dNote("Pehle drive.js mein G_API_KEY aur G_PUBLIC_FOLDER daalo.");
      return;
    }
    const q = "'" + G_PUBLIC_FOLDER + "' in parents and trashed=false and mimeType contains 'audio/'";
    url = DRIVE + "?q=" + encodeURIComponent(q) + "&fields=" + encodeURIComponent(fields) +
      "&pageSize=100&key=" + G_API_KEY;
  } else {
    const q = "trashed=false and mimeType contains 'audio/'";
    url = DRIVE + "?q=" + encodeURIComponent(q) + "&fields=" + encodeURIComponent(fields) + "&pageSize=100";
    headers.Authorization = "Bearer " + driveToken;
  }
  dNote("Drive se list la rahe hain...");
  try {
    const res = await fetch(url, { headers: headers });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { driveToken = ""; }
      dNote("Drive error: " + JSON.stringify(data.error || res.status));
      return;
    }
    tracks = data.files.map(function (f) {
      return {
        id: "drive-" + f.id,
        driveId: f.id,
        driveMode: mode,
        title: f.name.replace(/\.[^.]+$/, ""),
        artist: mode === "mine" ? "Sangeet ki Drive" : "Meri Drive",
        image: "",
        audioUrl: "",
        source: "Drive"
      };
    });
    inFavs = false;
    current = -1;
    dNote(tracks.length ? tracks.length + " gaane mile, koi select karo" : "Is Drive mein koi audio file nahi mili.");
    showList();
  } catch (e) {
    dNote("Internet ya server ki dikkat, dobara try karo");
  }
}

// play() isko tab bulata hai jab Drive ka gaana bajana ho
async function resolveDrive(song) {
  let url = DRIVE + "/" + song.driveId + "?alt=media";
  const headers = {};
  if (song.driveMode === "mine") {
    url += "&key=" + G_API_KEY;
  } else {
    headers.Authorization = "Bearer " + driveToken;
  }
  const res = await fetch(url, { headers: headers });
  if (!res.ok) {
    if (res.status === 401) { driveToken = ""; }
    throw new Error("status " + res.status + (res.status === 401 ? ", login dobara karo" : ""));
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

$("dMine").addEventListener("click", function () {
  listDrive("mine");
});

$("dYours").addEventListener("click", function () {
  if (driveToken) {
    listDrive("yours");
  } else {
    driveLogin(function () { listDrive("yours"); });
  }
});
