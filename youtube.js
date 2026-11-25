// ===== YouTube section (official search + official embedded player) =====
// Key: console.cloud.google.com -> YouTube Data API v3 enable -> API key
const YT_KEY = "AIzaSyCUnKfnPs6SPyxUt7uckjG6JaIT-4VkLuI";

let ytPlayer = null;
let ytItems = [];
let ytIndex = -1;

// YouTube ka official player script load karo
const ytTag = document.createElement("script");
ytTag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(ytTag);

function ytDecode(s) {
  const t = document.createElement("textarea");
  t.innerHTML = s;
  return t.value;
}

async function ytSearch() {
  const q = $("yq").value.trim();
  if (!q) return;
  const box = $("ytList");
  if (!YT_KEY) {
    box.textContent = "Pehle youtube.js mein YT_KEY daalo.";
    return;
  }
  box.textContent = "Dhundh rahe hain...";
  try {
    const url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video" +
      "&videoEmbeddable=true&videoCategoryId=10&maxResults=15&q=" + encodeURIComponent(q) +
      "&key=" + YT_KEY;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      box.textContent = "YouTube error: " + (data.error ? data.error.message : res.status);
      return;
    }
    ytItems = data.items.map(function (it) {
      return {
        id: it.id.videoId,
        title: ytDecode(it.snippet.title),
        channel: ytDecode(it.snippet.channelTitle),
        thumb: it.snippet.thumbnails.medium.url
      };
    });
    ytShowList();
  } catch (e) {
    box.textContent = "Internet ya server ki dikkat, dobara try karo";
  }
}

function ytShowList() {
  $("ytList").innerHTML = ytItems.length ? ytItems.map(function (v, i) {
    return '<div class="ytrow" onclick="ytPlayIndex(' + i + ')">' +
      '<img src="' + esc(v.thumb) + '" alt="">' +
      "<div><div>" + esc(v.title) + "</div><small>" + esc(v.channel) + "</small></div></div>";
  }).join("") : "Kuch nahi mila.";
}

function ytPlayIndex(i) {
  if (!window.YT || !YT.Player) {
    $("ytNote").textContent = "Player load ho raha hai, ek second baad dobara click karo.";
    return;
  }
  ytIndex = i;
  const id = ytItems[i].id;
  if (!ytPlayer) {
    ytPlayer = new YT.Player("ytPlayer", {
      width: "100%",
      height: "315",
      videoId: id,
      playerVars: { autoplay: 1, playsinline: 1 },
      events: {
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.ENDED) ytNext();
        },
        onError: function () {
          $("ytNote").textContent = "Ye video embed nahi ho sakta, agla try kar rahe hain...";
          ytNext();
        }
      }
    });
  } else {
    ytPlayer.loadVideoById(id);
  }
}

function ytNext() {
  if (ytIndex + 1 < ytItems.length) ytPlayIndex(ytIndex + 1);
}

$("ybtn").addEventListener("click", ytSearch);
$("yq").addEventListener("keydown", function (e) {
  if (e.key === "Enter") ytSearch();
});

// Tab badalte hi doosra player ruk jaye
document.querySelectorAll("nav button").forEach(function (b) {
  b.addEventListener("click", function () {
    if (b.dataset.tab === "youtube") {
      $("audio").pause();
    } else if (ytPlayer && ytPlayer.pauseVideo) {
      ytPlayer.pauseVideo();
    }
  });
});
