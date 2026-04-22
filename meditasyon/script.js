// Meditasyon "Başlat" butonları için modal açma
const modalOverlay = document.getElementById("meditation-modal");
const modalTitleEl = document.querySelector(".modal-title");
const modalBodyEl = document.querySelector(".modal-body");
const modalCloseBtn = document.querySelector(".modal-close");
const modalOkBtn = document.querySelector(".modal-ok");

let activeMeditation = null;
let meditationIntervalId = null;

function refreshMeditationButtons() {
  return Array.from(document.querySelectorAll("[data-meditation]"));
}

function bindMeditationButtons(root = document) {
  const buttons = Array.from(root.querySelectorAll("[data-meditation]"));
  buttons.forEach((btn) => {
    if (btn.dataset.boundMeditation === "1") return;
    btn.dataset.boundMeditation = "1";
    btn.addEventListener("click", () => {
      const title = btn.getAttribute("data-meditation") || "Meditasyon";
      const minutes = parseFloat(btn.getAttribute("data-minutes") || "");
      const videoUrl = btn.getAttribute("data-video") || "";
      openMeditationIntro({ title, minutes, videoUrl });
    });
  });
}

// Üst menü: aktif sekmeyi dinamik göster
const navLinks = Array.from(
  document.querySelectorAll(
    '.nav a[href^="#"]:not([href="#"]):not(.open-auth):not(.open-subscription), .paketler-quick-nav a[href^="#"], .mobile-nav-drawer a[href^="#"]:not([href="#"]):not(.open-auth):not(.open-subscription)'
  )
);
const sectionById = new Map(
  navLinks
    .map((a) => a.getAttribute("href"))
    .filter(Boolean)
    .map((href) => {
      const id = href.slice(1);
      const el = document.getElementById(id);
      return el ? [id, el] : null;
    })
    .filter(Boolean)
);

function setActiveNav(id) {
  navLinks.forEach((a) => {
    const href = a.getAttribute("href") || "";
    a.classList.toggle("active", href === `#${id}`);
  });
}

// ——— API / Auth (bulut senkron) ———
const API_BASE = "http://localhost:3001/api";
const AUTH_STORAGE_KEY = "gaia:auth:v1";

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeJsonParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadAuth() {
  return safeJsonParse(localStorage.getItem(AUTH_STORAGE_KEY));
}

function saveAuth(auth) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch {
    // ignore
  }
}

function clearAuth() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function apiFetch(path, { method = "GET", body, authRequired = false } = {}) {
  const auth = loadAuth();
  const headers = { "Content-Type": "application/json" };
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth?.refreshToken) {
    // one-shot refresh
    const refreshed = await tryRefresh(auth.refreshToken);
    if (refreshed?.accessToken) {
      headers.Authorization = `Bearer ${refreshed.accessToken}`;
      const retry = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      return retry;
    }
  }

  if (authRequired && res.status === 401) throw new Error("auth_required");
  return res;
}

async function tryRefresh(refreshToken) {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const next = { accessToken: json.accessToken, refreshToken: json.refreshToken, user: json.user };
    saveAuth(next);
    return next;
  } catch {
    return null;
  }
}

async function fetchMe() {
  const res = await apiFetch("/me", { authRequired: true });
  if (!res.ok) throw new Error("me_failed");
  const json = await res.json();
  const auth = loadAuth();
  if (auth) saveAuth({ ...auth, user: json.user });
  return json.user;
}

function stopMeditationSession() {
  if (meditationIntervalId) window.clearInterval(meditationIntervalId);
  meditationIntervalId = null;
  activeMeditation = null;
}

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function openMeditationIntro({ title, minutes, videoUrl }) {
  if (!modalOverlay || !modalTitleEl || !modalBodyEl || !modalOkBtn) return;
  stopMeditationSession();

  activeMeditation = {
    title,
    minutes: Number.isFinite(minutes) ? minutes : 5,
    videoUrl: videoUrl || "",
  };

  modalTitleEl.textContent = title || "Meditasyon";
  modalBodyEl.textContent =
    "Sakin bir yer bul, telefonunu sessize al ve nefesine dön. Hazır olduğunda başlat.";
  modalOkBtn.textContent = "Hazırım";
  modalOverlay.classList.add("open");
}

function startMeditationSession() {
  if (!activeMeditation || !modalBodyEl || !modalOkBtn) return;

  let remaining = Math.max(1, Math.round(activeMeditation.minutes * 60));
  modalOkBtn.textContent = "Bitir";

  const safeVideo = activeMeditation.videoUrl
    ? `<div class="meditation-video"><iframe src="${activeMeditation.videoUrl}" title="Meditasyon videosu" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe></div>`
    : "";

  modalBodyEl.innerHTML = `
    <div class="meditation-session">
      <div class="meditation-timer">
        <strong>Süre</strong>
        <span class="meditation-remaining">${formatMMSS(remaining)}</span>
      </div>
      ${safeVideo}
      <div style="color: var(--text-soft); font-size: 0.9rem;">
        İpucu: Omuzları indir, çeneyi gevşet, nefesi uzat.
      </div>
    </div>
  `;

  const remainingEl = modalBodyEl.querySelector(".meditation-remaining");

  meditationIntervalId = window.setInterval(() => {
    remaining -= 1;
    if (remainingEl) remainingEl.textContent = formatMMSS(remaining);
    if (remaining <= 0) {
      window.clearInterval(meditationIntervalId);
      meditationIntervalId = null;
      try {
        // Uyku alarmındaki yumuşak sesi reuse edelim
        playChime?.();
      } catch {
        // ignore
      }
      if (remainingEl) remainingEl.textContent = "00:00";
      modalOkBtn.textContent = "Kapat";
    }
  }, 1000);
}

function closeModal() {
  stopMeditationSession();
  modalOverlay?.classList.remove("open");
}

bindMeditationButtons();

modalOkBtn?.addEventListener("click", () => {
  // Intro durumundaysa başlat; çalışıyorsa bitir
  if (!activeMeditation) return closeModal();
  if (meditationIntervalId) return closeModal();
  return startMeditationSession();
});

modalCloseBtn?.addEventListener("click", closeModal);
modalOverlay?.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Abonelik modalı
const subscriptionModalOverlay = document.getElementById("subscription-modal");
const subscriptionCloseBtn = document.querySelector(".subscription-close");
const subscriptionOkBtn = document.querySelector(".subscription-ok");

function openSubscriptionModal() {
  subscriptionModalOverlay?.classList.add("open");
}

function closeSubscriptionModal() {
  subscriptionModalOverlay?.classList.remove("open");
}

document.querySelectorAll(".open-subscription").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    openSubscriptionModal();
  });
});

subscriptionCloseBtn?.addEventListener("click", closeSubscriptionModal);
subscriptionOkBtn?.addEventListener("click", closeSubscriptionModal);
subscriptionModalOverlay?.addEventListener("click", (e) => {
  if (e.target === subscriptionModalOverlay) closeSubscriptionModal();
});

// Mobil tam ekran menü (Flov tarzı — “İçerikler” başlığı)
const mobileNavDrawer = document.getElementById("mobile-nav-drawer");
const mobileNavToggle = document.getElementById("mobile-nav-toggle");
const mobileNavClose = document.getElementById("mobile-nav-close");

function closeMobileNav() {
  if (!mobileNavDrawer || !mobileNavToggle) return;
  mobileNavDrawer.setAttribute("hidden", "");
  mobileNavDrawer.classList.remove("is-open");
  mobileNavToggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("mobile-nav-open");
  try {
    mobileNavToggle.focus();
  } catch {
    /* ignore */
  }
}

function openMobileNav() {
  if (!mobileNavDrawer || !mobileNavToggle) return;
  mobileNavDrawer.removeAttribute("hidden");
  mobileNavDrawer.classList.add("is-open");
  mobileNavToggle.setAttribute("aria-expanded", "true");
  document.body.classList.add("mobile-nav-open");
  try {
    mobileNavClose?.focus();
  } catch {
    /* ignore */
  }
}

mobileNavToggle?.addEventListener("click", () => {
  if (mobileNavDrawer?.hasAttribute("hidden")) openMobileNav();
  else closeMobileNav();
});

mobileNavClose?.addEventListener("click", () => closeMobileNav());

mobileNavDrawer?.addEventListener("click", (e) => {
  if (e.target === mobileNavDrawer) {
    closeMobileNav();
    return;
  }
  const t = e.target.closest("a");
  if (!t || !mobileNavDrawer.contains(t)) return;
  if (
    t.classList.contains("open-subscription") ||
    t.classList.contains("open-auth") ||
    t.classList.contains("js-open-breath")
  ) {
    closeMobileNav();
    return;
  }
  const href = t.getAttribute("href") || "";
  if (href.startsWith("#") && href.length > 1) closeMobileNav();
});

window.addEventListener("resize", () => {
  if (window.matchMedia("(min-width: 901px)").matches) closeMobileNav();
});

// Nefes: 6 kategori + bilgi köşesi; Başlat → büyük oynatıcı (breath-modal--expanded)
const breathModalOverlay = document.getElementById("breath-modal");
const breathModalInner = document.getElementById("breath-modal-inner");
const breathCloseBtn = document.querySelector(".breath-close");
const breathOkBtn = document.querySelector(".breath-modal-ok");
const breathPlayerEl = document.getElementById("breath-player");
const breathPlayerTitleEl = document.getElementById("breath-player-title");
const breathPlayerSummaryEl = document.getElementById("breath-player-summary");
const breathActiveIframe = document.getElementById("breath-active-iframe");
const breathPlayerClearBtn = document.getElementById("breath-player-clear");
const breathShrinkBtn = document.getElementById("breath-shrink-btn");

const BREATH_YT_EMBED = "https://www.youtube-nocookie.com/embed/";

function setBreathExpanded(on) {
  breathModalInner?.classList.toggle("breath-modal--expanded", !!on);
  if (breathShrinkBtn) breathShrinkBtn.hidden = !on;
}

function resetBreathPlayer() {
  setBreathExpanded(false);
  document.querySelectorAll("#breath-modal .breath-topic").forEach((el) => {
    el.classList.remove("breath-topic--active");
  });
  if (breathActiveIframe) {
    breathActiveIframe.src = "about:blank";
    breathActiveIframe.removeAttribute("title");
  }
  if (breathPlayerTitleEl) breathPlayerTitleEl.textContent = "";
  if (breathPlayerSummaryEl) {
    breathPlayerSummaryEl.textContent = "";
    breathPlayerSummaryEl.hidden = true;
  }
  if (breathPlayerEl) breathPlayerEl.hidden = true;
}

function startBreathTopic(btn) {
  const yt = btn.getAttribute("data-youtube");
  const title = btn.getAttribute("data-breath-title") || "Nefes pratiği";
  if (!yt || !breathActiveIframe || !breathPlayerEl || !breathPlayerTitleEl) return;

  const topic = btn.closest(".breath-topic");
  const infoText = topic?.querySelector(".breath-topic-info-text")?.textContent?.replace(/\s+/g, " ").trim() || "";

  document.querySelectorAll("#breath-modal .breath-topic").forEach((el) => {
    el.classList.toggle("breath-topic--active", el.contains(btn));
  });

  breathPlayerTitleEl.textContent = title;
  if (breathPlayerSummaryEl) {
    breathPlayerSummaryEl.textContent = infoText;
    breathPlayerSummaryEl.hidden = !infoText;
  }
  breathActiveIframe.title = `${title} — rehber video`;
  breathActiveIframe.src = `${BREATH_YT_EMBED}${yt}?rel=0&modestbranding=1`;
  breathPlayerEl.hidden = false;
  setBreathExpanded(true);
  window.requestAnimationFrame(() => {
    try {
      breathPlayerEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      /* ignore */
    }
  });
}

function openBreathModal() {
  if (!breathModalOverlay) return;
  closeNavCartPopover();
  resetBreathPlayer();
  breathModalOverlay.classList.add("open");
  try {
    breathCloseBtn?.focus();
  } catch {
    /* ignore */
  }
}

function closeBreathModal() {
  if (!breathModalOverlay) return;
  breathModalOverlay.classList.remove("open");
  resetBreathPlayer();
}

breathCloseBtn?.addEventListener("click", closeBreathModal);
breathOkBtn?.addEventListener("click", closeBreathModal);
breathModalOverlay?.addEventListener("click", (e) => {
  if (e.target === breathModalOverlay) closeBreathModal();
});

breathModalOverlay?.addEventListener("click", (e) => {
  const startBtn = e.target.closest?.(".breath-start-btn");
  if (!startBtn || !breathModalOverlay.contains(startBtn)) return;
  e.preventDefault();
  startBreathTopic(startBtn);
});

breathPlayerClearBtn?.addEventListener("click", () => {
  resetBreathPlayer();
});

breathShrinkBtn?.addEventListener("click", () => {
  setBreathExpanded(false);
  try {
    document.getElementById("breath-topics")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    /* ignore */
  }
});

document.querySelectorAll(".js-open-breath").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    closeMobileNav();
    openBreathModal();
  });
});

// Auth modal (giriş/kayıt)
const authModalOverlay = document.getElementById("auth-modal");
const authCloseBtn = document.querySelector(".auth-close");
const authOkBtn = document.querySelector(".auth-ok");
const authTabs = Array.from(document.querySelectorAll(".auth-tab"));
const authForms = Array.from(document.querySelectorAll(".auth-form"));
const authStatus = document.querySelector(".auth-status");
const authMe = document.querySelector(".auth-me");
const authLogoutBtn = document.querySelector(".auth-logout-btn");

function setAuthStatus(text) {
  if (authStatus) authStatus.textContent = text || "";
}

function setAuthMe(text) {
  if (authMe) authMe.textContent = text || "";
}

function openAuthModal() {
  authModalOverlay?.classList.add("open");
  renderAuthState();
}

function closeAuthModal() {
  authModalOverlay?.classList.remove("open");
  setAuthStatus("");
}

function showAuthTab(tabKey) {
  authTabs.forEach((t) => t.classList.toggle("active", t.getAttribute("data-auth-tab") === tabKey));
  authForms.forEach((f) => f.classList.toggle("hidden", f.getAttribute("data-auth-form") !== tabKey));
}

async function renderAuthState() {
  const auth = loadAuth();
  if (!auth?.accessToken && auth?.refreshToken) {
    await tryRefresh(auth.refreshToken);
  }
  const next = loadAuth();
  if (!next?.accessToken) {
    setAuthMe("Giriş yapılmadı.");
    return;
  }
  try {
    const me = await fetchMe();
    setAuthMe(`Giriş yapıldı: ${me.email}`);
  } catch {
    setAuthMe("Giriş yapılmadı.");
  }
}

document.querySelectorAll(".open-auth").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const tab = btn.getAttribute("data-auth-modal-tab") || "login";
    showAuthTab(tab === "register" ? "register" : "login");
    openAuthModal();
  });
});

authCloseBtn?.addEventListener("click", closeAuthModal);
authOkBtn?.addEventListener("click", closeAuthModal);
authModalOverlay?.addEventListener("click", (e) => {
  if (e.target === authModalOverlay) closeAuthModal();
});

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => showAuthTab(tab.getAttribute("data-auth-tab") || "login"));
});

authForms.forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthStatus("Gönderiliyor...");
    const mode = form.getAttribute("data-auth-form") || "login";
    const email = form.querySelector(".auth-email")?.value || "";
    const password = form.querySelector(".auth-password")?.value || "";
    try {
      const res = await fetch(`${API_BASE}/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthStatus("Hata: giriş yapılamadı.");
        return;
      }
      saveAuth({ accessToken: json.accessToken, refreshToken: json.refreshToken, user: json.user });
      setAuthStatus("Tamam.");
      await renderAuthState();
      await loadMoodHistory();
    } catch {
      setAuthStatus("Hata: sunucuya ulaşılamadı.");
    }
  });
});

authLogoutBtn?.addEventListener("click", () => {
  clearAuth();
  setAuthStatus("Çıkış yapıldı.");
  setAuthMe("Giriş yapılmadı.");
});

// Kişiye özel paketler modalı
const packageModalOverlay = document.getElementById("package-modal");
const packageTitleEl = document.querySelector(".package-title");
const packageBodyEl = document.querySelector(".package-body");
const packageCloseBtn = document.querySelector(".package-close");
const packageOkBtn = document.querySelector(".package-ok");

const packageContent = {
  divorce: {
    title: "Yeni Bir Başlangıç (Boşanma Sonrası)",
    summary:
      "Zihnin ‘keşke’lerde dolaşırken bedeni güvene çağıran, kısa ve düzenli bir destek akışı.",
    steps: [
      "Sabah: 4-4-4 nefes (2 dk) + niyet cümlesi (1 dk)",
      "Gün içinde: 5 dk Sakinleşme meditasyonu",
      "Akşam: 3 cümle şükran + 1 ‘kendime iyi davrandığım şey’ notu",
    ],
    tips: [
      "Kendini suçlama cümlelerini yakala: ‘Ben hep…’ yerine ‘Şu an…’ diye değiştir.",
      "Mesaj/arama isteği gelince 10 nefes kuralı uygula: önce bedenini sakinleştir.",
      "Sınır: Bu hafta 1 küçük ‘hayır’ denemesi.",
    ],
  },
  "alone-home": {
    title: "Evde İlk Günler (Yalnız Eve Çıkma)",
    summary:
      "Yeni ev düzenini güvenli bir ritüele dönüştürerek yalnızlığı yumuşatmaya odaklanır.",
    steps: [
      "Ev ritüeli: 10 dk toparlama + 4-7-8 nefes (3 tur)",
      "Gün içinde: 8 dk Şükran meditasyonu",
      "Gece: Uykuya hazırlık (10 dk) + ekranı 20 dk erken bırak",
    ],
    tips: [
      "Evde yalnız hissettiğinde: ışığı aç, su iç, pencereden 30 sn dışarı bak.",
      "Bir ‘güven köşesi’ yap: battaniye + mum/oda kokusu + çay.",
      "Haftada 2 küçük sosyal hedef: markette selam, kısa yürüyüş.",
    ],
  },
  "new-city": {
    title: "Sosyal Reset (Yeni Şehir/Yeni Çevre)",
    summary:
      "Kendini itmeden, küçük adımlarla yeni bağ kurmayı kolaylaştıran bir plan.",
    steps: [
      "Sabah: niyet + 2 dk nefes",
      "Gün içinde: 5 dk Sakinleşme veya kısa yürüyüş",
      "Hafta: 2 yeni yer/aktivite (kafe, kurs, yürüyüş grubu gibi)",
    ],
    tips: [
      "‘Merhaba’ hedefi: günde 1 kez küçük temas.",
      "Yeni ortama girerken: omuzları indir, çeneyi gevşet, nefesi uzat.",
      "Kendine sosyal ‘minimum’ koy: sadece 20 dk kalmak bile başarı.",
    ],
  },
};

function openPackageModal(key) {
  if (!packageModalOverlay || !packageTitleEl || !packageBodyEl) return;
  const content = packageContent[key];
  if (!content) return;

  packageTitleEl.textContent = content.title;
  packageBodyEl.innerHTML = `
    <p>${content.summary}</p>
    <h4>Mini akış</h4>
    <ul>${content.steps.map((s) => `<li>${s}</li>`).join("")}</ul>
    <h4>Küçük tavsiyeler</h4>
    <ul>${content.tips.map((t) => `<li>${t}</li>`).join("")}</ul>
  `;

  packageModalOverlay.classList.add("open");
}

function closePackageModal() {
  packageModalOverlay?.classList.remove("open");
}

document.querySelectorAll(".package-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-package");
    if (key) openPackageModal(key);
  });
});

packageCloseBtn?.addEventListener("click", closePackageModal);
packageOkBtn?.addEventListener("click", closePackageModal);
packageModalOverlay?.addEventListener("click", (e) => {
  if (e.target === packageModalOverlay) closePackageModal();
});

// (Meditasyon modal mantığı dosyanın başına taşındı)

// Tıklayınca da hemen aktif göster (hash değişimi anında)
navLinks.forEach((a) => {
  a.addEventListener("click", () => {
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#")) setActiveNav(href.slice(1));
  });
});

// Scroll ile aktif bölümü algıla
if ("IntersectionObserver" in window && sectionById.size > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];

      if (visible && visible.target && visible.target.id) {
        setActiveNav(visible.target.id);
      }
    },
    {
      root: null,
      threshold: [0.2, 0.35, 0.5, 0.7],
      rootMargin: "-30% 0px -55% 0px",
    }
  );

  sectionById.forEach((el) => observer.observe(el));
} else {
  // İlk yüklemede hash varsa en azından onu işaretle
  const hash = (window.location.hash || "").replace("#", "");
  if (hash) setActiveNav(hash);
}

// Günlük enerji & mod: emoji sürükle-bırak seçici (sade sürüm)
const moodPicker = document.querySelector(".mood-picker");
const moodKnob = document.querySelector(".mood-knob");
const moodFill = document.querySelector(".mood-track-fill");
const moodLabel = document.querySelector(".mood-label");
const moodPercent = document.querySelector(".mood-percent");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function moodMeta(value01) {
  const v = clamp(value01, 0, 1);
  if (v < 0.25) return { emoji: "😴", label: "Düşük" };
  if (v < 0.55) return { emoji: "🙂", label: "Dengeli" };
  if (v < 0.8) return { emoji: "😊", label: "İyi" };
  return { emoji: "🤩", label: "Yüksek" };
}

function setMood(value01) {
  if (!moodPicker || !moodKnob || !moodFill || !moodLabel || !moodPercent) return;
  const v = clamp(value01, 0, 1);
  const meta = moodMeta(v);

  const rect = moodPicker.getBoundingClientRect();
  const trackTop = 14;
  const trackBottom = 14;
  const usable = rect.height - trackTop - trackBottom;
  const y = trackTop + (1 - v) * usable;

  moodKnob.style.top = `${y}px`;
  moodKnob.textContent = meta.emoji;
  moodFill.style.height = `${Math.round(v * 100)}%`;
  moodFill.style.background = `linear-gradient(180deg, var(--pink), var(--peach))`;
  moodLabel.textContent = meta.label;
  moodPercent.textContent = `${Math.round(v * 100)}%`;
}

function currentMoodValue() {
  if (!moodFill) return 0.5;
  const h = parseFloat(String(moodFill.style.height || "50").replace("%", ""));
  return clamp((Number.isFinite(h) ? h : 50) / 100, 0, 1);
}

let moodDragging = false;
function moodValueFromClientY(clientY) {
  if (!moodPicker) return 0.5;
  const rect = moodPicker.getBoundingClientRect();
  const trackTop = 14;
  const trackBottom = 14;
  const usable = rect.height - trackTop - trackBottom;
  const y = clamp(clientY - rect.top - trackTop, 0, usable);
  const v = 1 - y / usable;
  return clamp(v, 0, 1);
}

function attachMoodEvents() {
  if (!moodPicker || !moodKnob) return;

  const onPointerMove = (e) => {
    if (!moodDragging) return;
    setMood(moodValueFromClientY(e.clientY));
  };
  const onPointerUp = () => {
    if (!moodDragging) return;
    moodDragging = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  const startDrag = (e) => {
    moodDragging = true;
    moodKnob.setPointerCapture?.(e.pointerId);
    setMood(moodValueFromClientY(e.clientY));
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  moodKnob.addEventListener("pointerdown", startDrag);
  moodPicker.addEventListener("pointerdown", (e) => {
    // knob dışına tıklayınca da seç
    if (e.target === moodKnob) return;
    setMood(moodValueFromClientY(e.clientY));
  });

  // Resize sonrası knob yerini düzelt
  window.addEventListener("resize", () => {
    setMood(currentMoodValue());
  });
}

setMood(0.5);
attachMoodEvents();

// Mod kaydet + geçmiş
const moodNoteEl = document.getElementById("mood-note");
const moodSaveBtn = document.querySelector(".mood-save-btn");
const moodLoadBtn = document.querySelector(".mood-load-btn");
const moodSaveStatus = document.querySelector(".mood-save-status");
const moodHistoryChart = document.querySelector(".mood-history-chart");
const moodHistoryList = document.querySelector(".mood-history-list");

function setMoodSaveStatus(text) {
  if (moodSaveStatus) moodSaveStatus.textContent = text || "";
}

function renderMoodChart(itemsAsc) {
  if (!moodHistoryChart) return;
  if (!itemsAsc || itemsAsc.length === 0) {
    moodHistoryChart.innerHTML = "<div style=\"color: var(--text-soft);\">Henüz kayıt yok.</div>";
    return;
  }
  const w = 520;
  const h = 110;
  const pad = 10;
  const minX = pad;
  const maxX = w - pad;
  const minY = pad;
  const maxY = h - pad;

  const pts = itemsAsc.map((it, idx) => {
    const t = itemsAsc.length === 1 ? 0 : idx / (itemsAsc.length - 1);
    const x = minX + t * (maxX - minX);
    const y = maxY - (it.moodValue || 0) * (maxY - minY);
    return { x, y };
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  moodHistoryChart.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Mod trendi">
      <defs>
        <linearGradient id="moodLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--pink)"></stop>
          <stop offset="100%" stop-color="var(--peach)"></stop>
        </linearGradient>
      </defs>
      <path d="${d}" fill="none" stroke="url(#moodLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${pts
        .map(
          (p) =>
            `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="rgba(255,255,255,0.95)" stroke="rgba(243,180,196,0.9)" stroke-width="2"></circle>`
        )
        .join("")}
    </svg>
  `;
}

function renderMoodHistory(itemsDesc) {
  if (!moodHistoryList) return;
  if (!itemsDesc || itemsDesc.length === 0) {
    moodHistoryList.innerHTML = "<div style=\"color: var(--text-soft);\">Henüz kayıt yok.</div>";
    return;
  }
  moodHistoryList.innerHTML = itemsDesc
    .slice(0, 30)
    .map((it) => {
      const meta = moodMeta(it.moodValue || 0);
      const note = (it.note || "").trim();
      return `
        <div class="mood-history-row">
          <div class="left">
            <div class="date">${it.entryDate}</div>
            <div class="note">${note ? note.replaceAll("<", "&lt;") : "—"}</div>
          </div>
          <div class="right" aria-label="Enerji">
            <span style="font-size: 1.2rem;">${meta.emoji}</span>
            <span style="color: var(--text-soft); font-size: 0.9rem;">${Math.round((it.moodValue || 0) * 100)}%</span>
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadMoodHistory() {
  if (!moodHistoryList || !moodHistoryChart) return;
  const auth = loadAuth();
  if (!auth?.accessToken && !auth?.refreshToken) {
    moodHistoryChart.innerHTML =
      '<div style="color: var(--text-soft);">Geçmiş için giriş yap.</div>';
    moodHistoryList.innerHTML =
      '<div style="color: var(--text-soft);">Geçmiş için giriş yap.</div>';
    return;
  }
  try {
    const to = todayYYYYMMDD();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 29);
    const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(
      fromDate.getDate()
    ).padStart(2, "0")}`;

    const res = await apiFetch(`/moods?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      authRequired: true,
    });
    const json = await res.json();
    const itemsDesc = Array.isArray(json.items) ? json.items : [];
    const itemsAsc = [...itemsDesc].reverse();
    renderMoodChart(itemsAsc);
    renderMoodHistory(itemsDesc);
  } catch {
    moodHistoryChart.innerHTML =
      '<div style="color: var(--text-soft);">Sunucuya bağlanılamadı.</div>';
    moodHistoryList.innerHTML =
      '<div style="color: var(--text-soft);">Sunucuya bağlanılamadı.</div>';
  }
}

moodSaveBtn?.addEventListener("click", async () => {
  setMoodSaveStatus("");
  const auth = loadAuth();
  if (!auth?.accessToken && !auth?.refreshToken) {
    setMoodSaveStatus("Kaydetmek için giriş yap.");
    openAuthModal();
    return;
  }

  try {
    setMoodSaveStatus("Kaydediliyor...");
    const entryDate = todayYYYYMMDD();
    const moodValue = currentMoodValue();
    const note = moodNoteEl?.value || "";
    const res = await apiFetch("/moods", {
      method: "POST",
      body: { entryDate, moodValue, note },
      authRequired: true,
    });
    if (!res.ok) {
      setMoodSaveStatus("Hata: kaydedilemedi.");
      return;
    }
    setMoodSaveStatus("Kaydedildi.");
    await loadMoodHistory();
  } catch {
    setMoodSaveStatus("Hata: sunucuya ulaşılamadı.");
  }
});

moodLoadBtn?.addEventListener("click", loadMoodHistory);

loadMoodHistory();

// Uyku destek: alarm/hatırlatıcı (sayfa açıkken)
const sleepTimeInput = document.querySelector(".sleep-time");
const sleepMessageInput = document.querySelector(".sleep-message");
const sleepSetBtn = document.querySelector(".sleep-set-btn");
const sleepCancelBtn = document.querySelector(".sleep-cancel-btn");
const sleepTestBtn = document.querySelector(".sleep-test-btn");
const sleepStatus = document.querySelector(".sleep-status");

const SLEEP_STORAGE_KEY = "gaia:sleepReminder:v1";
let sleepTimeoutId = null;

function setSleepStatus(text) {
  if (sleepStatus) sleepStatus.textContent = text;
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 523.25;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    o.stop(ctx.currentTime + 0.75);
    o.onended = () => ctx.close?.();
  } catch {
    // ignore
  }
}

function notifySleep(message) {
  playChime();
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Gaia • Uyku Hatırlatıcı", { body: message || "Uyku zamanı." });
  } else {
    alert(message || "Uyku zamanı.");
  }
}

function nextOccurrenceFromHHMM(hhmm) {
  const [hh, mm] = String(hhmm || "23:30").split(":").map((x) => parseInt(x, 10));
  const now = new Date();
  const target = new Date();
  target.setHours(Number.isFinite(hh) ? hh : 23, Number.isFinite(mm) ? mm : 30, 0, 0);
  if (target.getTime() <= now.getTime() + 1000) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function clearSleepTimeout() {
  if (sleepTimeoutId) window.clearTimeout(sleepTimeoutId);
  sleepTimeoutId = null;
}

function saveSleepConfig(cfg) {
  try {
    localStorage.setItem(SLEEP_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

function loadSleepConfig() {
  try {
    const raw = localStorage.getItem(SLEEP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function ensureNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

async function scheduleSleepReminder({ time, message }) {
  clearSleepTimeout();
  const nextAt = nextOccurrenceFromHHMM(time);
  const delay = Math.max(0, nextAt.getTime() - Date.now());

  sleepTimeoutId = window.setTimeout(() => {
    notifySleep(message);
    // her gün tekrar et
    scheduleSleepReminder({ time, message });
  }, delay);

  saveSleepConfig({ enabled: true, time, message, nextAt: nextAt.getTime() });
  setSleepStatus(`Kuruldu: ${nextAt.toLocaleString("tr-TR")}`);
}

function cancelSleepReminder() {
  clearSleepTimeout();
  try {
    localStorage.removeItem(SLEEP_STORAGE_KEY);
  } catch {
    // ignore
  }
  setSleepStatus("Alarm kapatıldı.");
}

async function initSleep() {
  const localCfg = loadSleepConfig();

  // Bulut ayarları (giriş varsa) yerel ayarın üstüne yazsın
  try {
    const auth = loadAuth();
    if (auth?.accessToken || auth?.refreshToken) {
      const res = await apiFetch("/sleep/settings", { authRequired: true });
      if (res.ok) {
        const json = await res.json();
        const s = json?.settings;
        if (s?.timeHHMM) {
          if (sleepTimeInput) sleepTimeInput.value = s.timeHHMM;
          if (sleepMessageInput && typeof s.message === "string") sleepMessageInput.value = s.message;
          if (s.enabled) {
            scheduleSleepReminder({ time: s.timeHHMM, message: s.message });
            return;
          }
          setSleepStatus("Alarm kapalı.");
          return;
        }
      }
    }
  } catch {
    // ignore → local fallback
  }

  if (localCfg?.enabled && localCfg?.time) {
    if (sleepTimeInput) sleepTimeInput.value = localCfg.time;
    if (sleepMessageInput && typeof localCfg.message === "string") sleepMessageInput.value = localCfg.message;
    scheduleSleepReminder({ time: localCfg.time, message: localCfg.message });
  } else {
    setSleepStatus("Alarm kapalı.");
  }
}

sleepSetBtn?.addEventListener("click", async () => {
  const time = sleepTimeInput?.value || "23:30";
  const message = sleepMessageInput?.value || "Uyku zamanı: ekranı bırak, nefes al.";
  await ensureNotificationPermission();
  scheduleSleepReminder({ time, message });

  // Buluta da yaz
  try {
    await apiFetch("/sleep/settings", {
      method: "PUT",
      body: { timeHHMM: time, message, enabled: true },
      authRequired: true,
    });
  } catch {
    // ignore
  }
});

sleepCancelBtn?.addEventListener("click", async () => {
  cancelSleepReminder();
  const time = sleepTimeInput?.value || "23:30";
  const message = sleepMessageInput?.value || "Uyku zamanı: ekranı bırak, nefes al.";
  try {
    await apiFetch("/sleep/settings", {
      method: "PUT",
      body: { timeHHMM: time, message, enabled: false },
      authRequired: true,
    });
  } catch {
    // ignore
  }
});
sleepTestBtn?.addEventListener("click", () => notifySleep(sleepMessageInput?.value || "Uyku zamanı."));

initSleep();

// Uyku rutini (bulut)
const sleepRoutineTitleInput = document.querySelector(".sleep-routine-title");
const sleepRoutineRefreshBtn = document.querySelector(".sleep-routine-refresh");
const sleepRoutineListEl = document.querySelector(".sleep-routine-list");
const sleepRoutineNewInput = document.querySelector(".sleep-routine-new");
const sleepRoutineAddBtn = document.querySelector(".sleep-routine-add-btn");
const sleepRoutineSaveBtn = document.querySelector(".sleep-routine-save");
const sleepRoutineClearBtn = document.querySelector(".sleep-routine-clear");
const sleepRoutineStatusEl = document.querySelector(".sleep-routine-status");

let sleepRoutineState = { routineId: null, title: "Uyku Öncesi Rutinim", items: [], date: todayYYYYMMDD() };

function setSleepRoutineStatus(text) {
  if (sleepRoutineStatusEl) sleepRoutineStatusEl.textContent = text || "";
}

function renderSleepRoutine() {
  if (!sleepRoutineListEl) return;
  const items = sleepRoutineState.items || [];
  if (items.length === 0) {
    sleepRoutineListEl.innerHTML = "<div style=\"color: var(--text-soft);\">Henüz madde yok.</div>";
    return;
  }
  sleepRoutineListEl.innerHTML = items
    .map((it, idx) => {
      const checked = it.isDoneToday ? "checked" : "";
      const id = it.id || `local-${idx}`;
      const safeLabel = String(it.label || "").replaceAll("<", "&lt;");
      return `
        <div class="sleep-routine-item" data-item-id="${id}">
          <label>
            <input type="checkbox" ${checked} />
            <span class="label">${safeLabel}</span>
          </label>
          <button type="button" class="remove" aria-label="Sil">×</button>
        </div>
      `;
    })
    .join("");
}

async function loadSleepRoutine() {
  setSleepRoutineStatus("");
  const auth = loadAuth();
  if (!auth?.accessToken && !auth?.refreshToken) {
    if (sleepRoutineListEl) {
      sleepRoutineListEl.innerHTML = "<div style=\"color: var(--text-soft);\">Rutin için giriş yap.</div>";
    }
    return;
  }
  try {
    setSleepRoutineStatus("Yükleniyor...");
    const res = await apiFetch("/sleep/routine", { authRequired: true });
    if (!res.ok) throw new Error("failed");
    const json = await res.json();
    sleepRoutineState = {
      routineId: json?.routine?.id || null,
      title: json?.routine?.title || "Uyku Öncesi Rutinim",
      items: Array.isArray(json?.items) ? json.items : [],
      date: json?.date || todayYYYYMMDD(),
    };
    if (sleepRoutineTitleInput) sleepRoutineTitleInput.value = sleepRoutineState.title;
    renderSleepRoutine();
    setSleepRoutineStatus("");
  } catch {
    setSleepRoutineStatus("Sunucuya bağlanılamadı.");
  }
}

async function saveSleepRoutine() {
  const auth = loadAuth();
  if (!auth?.accessToken && !auth?.refreshToken) {
    setSleepRoutineStatus("Kaydetmek için giriş yap.");
    openAuthModal();
    return;
  }
  try {
    setSleepRoutineStatus("Kaydediliyor...");
    const title = sleepRoutineTitleInput?.value || "Uyku Öncesi Rutinim";
    const items = (sleepRoutineState.items || []).map((it) => ({
      id: it.id && !String(it.id).startsWith("local-") ? it.id : undefined,
      label: it.label || "",
    }));
    const res = await apiFetch("/sleep/routine", {
      method: "PUT",
      body: { title, items },
      authRequired: true,
    });
    if (!res.ok) throw new Error("failed");
    setSleepRoutineStatus("Kaydedildi.");
    await loadSleepRoutine();
  } catch {
    setSleepRoutineStatus("Hata: kaydedilemedi.");
  }
}

sleepRoutineRefreshBtn?.addEventListener("click", loadSleepRoutine);
sleepRoutineSaveBtn?.addEventListener("click", saveSleepRoutine);

sleepRoutineAddBtn?.addEventListener("click", () => {
  const label = (sleepRoutineNewInput?.value || "").trim();
  if (!label) return;
  sleepRoutineState.items = [...(sleepRoutineState.items || []), { id: `local-${Date.now()}`, label, isDoneToday: false }];
  if (sleepRoutineNewInput) sleepRoutineNewInput.value = "";
  renderSleepRoutine();
});

sleepRoutineClearBtn?.addEventListener("click", () => {
  sleepRoutineState.items = [];
  renderSleepRoutine();
  setSleepRoutineStatus("Temizlendi (Kaydet’e basarsan buluta da yazar).");
});

sleepRoutineTitleInput?.addEventListener("input", () => {
  sleepRoutineState.title = sleepRoutineTitleInput.value;
});

sleepRoutineListEl?.addEventListener("click", async (e) => {
  const row = e.target?.closest?.(".sleep-routine-item");
  if (!row) return;
  const itemId = row.getAttribute("data-item-id");
  const idx = (sleepRoutineState.items || []).findIndex((it) => (it.id || "").toString() === itemId);
  if (idx < 0) return;

  if (e.target?.classList?.contains("remove")) {
    sleepRoutineState.items.splice(idx, 1);
    renderSleepRoutine();
    return;
  }

  if (e.target?.matches?.('input[type="checkbox"]')) {
    const it = sleepRoutineState.items[idx];
    const checked = !!e.target.checked;
    it.isDoneToday = checked;
    // sadece server id varsa checkin at
    if (it.id && !String(it.id).startsWith("local-")) {
      try {
        await apiFetch("/sleep/checkin", {
          method: "PUT",
          body: { routineItemId: it.id, isDone: checked, checkinDate: sleepRoutineState.date },
          authRequired: true,
        });
      } catch {
        // ignore
      }
    }
  }
});

loadSleepRoutine();

// Günün Kartı: otomatik değişen mini metinler
const quoteTextEl = document.getElementById("quote-text");
const quoteCounterEl = document.getElementById("quote-counter");
const quoteNextBtn = document.querySelector(".quote-next-btn");
const quotePauseBtn = document.querySelector(".quote-pause-btn");

const quotes = [
  "“Şefkatle yavaşlıyorum.”",
  "“Bugün küçük bir adım yeter.”",
  "“Nefesim güvenli bir liman.”",
  "“Kontrol edebildiğime dönüyorum.”",
  "“Zihnim geçiyor; ben kalıyorum.”",
  "“Kendime nazik konuşuyorum.”",
  "“Bedenim şu an güvende.”",
  "“Biraz dinlenmek iyileştirir.”",
  "“Kendimi aceleye getirmiyorum.”",
  "“Bu da geçecek; ben buradayım.”",
];

let quoteIndex = 0;
let quoteTimer = null;
let quotePaused = false;

function renderQuote(nextIndex) {
  if (!quoteTextEl || !quoteCounterEl) return;
  quoteIndex = (nextIndex + quotes.length) % quotes.length;

  quoteTextEl.classList.add("fade");
  window.setTimeout(() => {
    quoteTextEl.textContent = quotes[quoteIndex];
    quoteCounterEl.textContent = `${quoteIndex + 1}/${quotes.length}`;
    quoteTextEl.classList.remove("fade");
  }, 160);
}

function startQuoteTimer() {
  if (quoteTimer) window.clearInterval(quoteTimer);
  quoteTimer = window.setInterval(() => {
    if (quotePaused) return;
    renderQuote(quoteIndex + 1);
  }, 5500);
}

quoteNextBtn?.addEventListener("click", () => renderQuote(quoteIndex + 1));
quotePauseBtn?.addEventListener("click", () => {
  quotePaused = !quotePaused;
  if (quotePauseBtn) quotePauseBtn.textContent = quotePaused ? "Devam" : "Durdur";
});

if (quoteTextEl && quoteCounterEl) {
  renderQuote(0);
  startQuoteTimer();
}

// Meditasyon filtreleme
const filterChips = Array.from(document.querySelectorAll(".filter-chip"));
const meditationCards = Array.from(document.querySelectorAll(".meditation-card"));

function applyMeditationFilter(filterKey) {
  meditationCards.forEach((card) => {
    const cat = card.getAttribute("data-category") || "";
    const show = filterKey === "all" ? true : cat === filterKey;
    card.style.display = show ? "" : "none";
  });
}

filterChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const key = chip.getAttribute("data-filter") || "all";
    filterChips.forEach((c) => c.classList.toggle("active", c === chip));
    applyMeditationFilter(key);
  });
});

// Ürünler: filtreleme + modal inceleme
const productFilterChips = Array.from(
  document.querySelectorAll('.filter-chip[data-product-filter]')
);
const productCards = Array.from(document.querySelectorAll(".product-card"));
const productModalOverlay = document.getElementById("product-modal");
const productTitleEl = document.querySelector(".product-title");
const productSubtitleEl = document.querySelector(".product-subtitle");
const productBodyEl = document.querySelector(".product-body");
const productCloseBtn = document.querySelector(".product-close");
const productOkBtn = document.querySelector(".product-ok");

/** Mağaza vitrininde ve sepet özetinde gösterilen ürünler (ana sayfada blok yok) */
const STORE_DISPLAY_IDS = [
  "mat-1",
  "tutsu-1",
  "kitap-1",
  "minder-1",
  "battaniye-1",
  "gua-sha-1",
  "kase-1",
  "def-1",
  "maske-1",
  "sprey-1",
  "defter-1",
  "bolster-1",
  "ses-1",
];

/** Mağaza vitrini: üstte editör seçkisi, sonra kategori blokları */
const STORE_CATEGORY_SECTIONS = [
  {
    key: "editor",
    title: "Editörün seçimleri",
    subtitle: "Bu dönem öne çıkardığımız üç ürün — hızlı başlangıç için.",
    ids: ["mat-1", "tutsu-1", "kitap-1"],
  },
  {
    key: "yoga",
    title: "Yoga matları ve minder",
    subtitle: "Mat, meditasyon minderi ve bolster ile pratik zemini.",
    ids: ["mat-1", "minder-1", "bolster-1"],
  },
  {
    key: "tutsu",
    title: "Tütsü ve ritüel",
    subtitle: "Koku, şark kasesi ve davul ile kısa ritüeller.",
    ids: ["tutsu-1", "sprey-1", "kase-1", "def-1"],
  },
  {
    key: "okuma",
    title: "Okuma ve günlük",
    subtitle: "Kitap ve farkındalık günlüğü ile yazılı pratik.",
    ids: ["kitap-1", "defter-1"],
  },
  {
    key: "konfor",
    title: "Konfor ve uyku",
    subtitle: "Battaniye ve uyku bandı ile yumuşak geçişler.",
    ids: ["battaniye-1", "maske-1"],
  },
  {
    key: "ses-bakim",
    title: "Ses ve bakım",
    subtitle: "Kulaklık ve yüz masaj seti.",
    ids: ["ses-1", "gua-sha-1"],
  },
];

/** Mağaza / sepet satırında ürünü kısaca tanımlayan süs emojisi (ekran okuyucuya yansımaz) */
const STORE_PRODUCT_ICONS = {
  "mat-1": "🧘",
  "tutsu-1": "🕯️",
  "kitap-1": "📖",
  "minder-1": "🪷",
  "battaniye-1": "🧺",
  "gua-sha-1": "💆",
  "kase-1": "🔔",
  "def-1": "🥁",
  "maske-1": "😴",
  "sprey-1": "🌿",
  "defter-1": "✍️",
  "bolster-1": "🛋️",
  "ses-1": "🎧",
};

function storeProductIcon(id) {
  return STORE_PRODUCT_ICONS[id] || "📦";
}

/** Ara toplam bu tutar ve üzerindeyse kargo 0; altında sabit kargo. */
const GAIA_FREE_SHIPPING_SUBTOTAL_TRY = 1000;
const GAIA_SHIPPING_FLAT_TRY = 59.9;

const productCatalog = {
  "mat-1": {
    title: "Yoga Matı",
    shelfTitle: "Yoga Matı",
    price: "₺1.290",
    subtitle: "Kaymaz yüzey • Ev & stüdyo kullanımı",
    kpis: [
      { label: "Kalınlık", value: "3–5 mm" },
      { label: "Malzeme", value: "TPE / doğal kauçuk" },
      { label: "Hissiyat", value: "Yumuşak tutuş" },
    ],
    bullets: [
      "Kaymaz doku, terli pratikte daha iyi tutuş.",
      "Taşımayı kolaylaştıran hafif seçenekler.",
      "Doğa tonlarıyla sakin bir görünüm.",
    ],
  },
  "tutsu-1": {
    title: "Tütsü & Tütsülük",
    shelfTitle: "Tütsü",
    price: "₺420",
    subtitle: "Ritüel • Koku ile ortam hazırlığı",
    kpis: [
      { label: "Kokular", value: "Lavanta / sandal / adaçayı" },
      { label: "Tütsülük", value: "Seramik / taş" },
      { label: "Kullanım", value: "5–10 dk" },
    ],
    bullets: [
      "Kısa meditasyon öncesi ortamı yumuşatır.",
      "Geniş taban, külleri daha iyi toplar.",
      "Kokuyu hafif tutmak için kısa yakma önerilir.",
    ],
  },
  "kitap-1": {
    title: "Kişisel Gelişim Kitabı",
    shelfTitle: "Kişisel Gelişim Kitabı",
    price: "₺285",
    subtitle: "Farkındalık • alışkanlık • günlük pratik",
    kpis: [
      { label: "Tür", value: "Kişisel gelişim" },
      { label: "Hacim", value: "≈240 sayfa" },
      { label: "Dil", value: "Türkçe" },
    ],
    bullets: [
      "Kısa bölümlerle her gün ilerleyebilirsin.",
      "Nefes ve farkındalık önerileriyle desteklenir.",
      "Kendine veya hediye olarak uygun.",
    ],
  },
  "minder-1": {
    title: "Meditasyon Minderi",
    shelfTitle: "Meditasyon minderi",
    price: "₺890",
    subtitle: "Konfor • Daha rahat oturuş",
    kpis: [
      { label: "Tür", value: "Zafu / bolster" },
      { label: "Kılıf", value: "Yıkanabilir" },
      { label: "Destek", value: "Kalça/omurga" },
    ],
    bullets: [
      "Uzun oturuşlarda bacaklara alan açar.",
      "Omurgayı daha dik ve rahat tutmaya yardımcı olur.",
      "Keten/pamuk seçenekleriyle nefes alan doku.",
    ],
  },
  "battaniye-1": {
    title: "Meditasyon Battaniyesi",
    shelfTitle: "Meditasyon battaniyesi",
    price: "₺540",
    subtitle: "Yumuşak dokunuş • Oturuşta ekstra sıcaklık",
    kpis: [
      { label: "Malzeme", value: "Yün / pamuk karışımı" },
      { label: "Boyut", value: "130 × 170 cm" },
      { label: "Bakım", value: "Soğuk yıkama" },
    ],
    bullets: [
      "Uzun oturuşlarda dizleri ve sırtı destekler.",
      "Hafif ve katlanabilir; taşıması kolay.",
      "Pastel tonlarla sakin bir köşe hissi.",
    ],
  },
  "gua-sha-1": {
    title: "Gua Sha & Yüz Masaj Seti",
    shelfTitle: "Gua sha seti",
    price: "₺320",
    subtitle: "Yüz & boyun gevşetme • Ritüel sonrası bakım",
    kpis: [
      { label: "Taş", value: "Yeşim / kuvars" },
      { label: "Parça", value: "2 parça" },
      { label: "Kullanım", value: "Kuru / yağlı" },
    ],
    bullets: [
      "Kısa masajla gerginliği yumuşatmaya yardımcı olur.",
      "Yuvarlatılmış kenarlar, kontrollü baskı.",
      "Hediye kutusunda saklanabilir.",
    ],
  },
  "kase-1": {
    title: "Şark Kasesi",
    shelfTitle: "Şark kasesi",
    price: "₺780",
    subtitle: "Ses banyosu • Nefes öncesi odak",
    kpis: [
      { label: "Çap", value: "≈12–14 cm" },
      { label: "Ses", value: "Uzun süren titreşim" },
      { label: "Aksesuar", value: "Deri tokmak" },
    ],
    bullets: [
      "Pratik başında kısa bir ses ritüeli oluşturur.",
      "Metal alaşım, dengeli ton.",
      "Taşıma çantası ile birlikte düşünülebilir.",
    ],
  },
  "def-1": {
    title: "Mini Ritüel Davulu",
    shelfTitle: "Mini davul",
    price: "₺1.450",
    subtitle: "Ritm • Yerinde meditasyon",
    kpis: [
      { label: "Çap", value: "≈25 cm" },
      { label: "Ses", value: "Derin vuruş" },
      { label: "Kullanım", value: "Eller / tokmak" },
    ],
    bullets: [
      "Yavaş tempo ile nefese eşlik etmek için uygun.",
      "Ahşap çerçeve, doğal deri yüzey.",
      "Ses hassasiyeti olanlar için orta şiddet önerilir.",
    ],
  },
  "maske-1": {
    title: "Uyku Göz Bandı",
    shelfTitle: "Uyku göz bandı",
    price: "₺195",
    subtitle: "Işığı keser • Hafif baskı",
    kpis: [
      { label: "Doku", value: "İpek hissi saten" },
      { label: "Ayar", value: "Elastik kayış" },
      { label: "Yıkama", value: "Elde / hassas program" },
    ],
    bullets: [
      "Gece rutinine eklenebilen küçük bir konfor.",
      "Burun kanadı için hafif contalı modeller tercih edilir.",
      "Seyahatte de kullanılabilir.",
    ],
  },
  "sprey-1": {
    title: "Oda & Yastık Spreyi",
    shelfTitle: "Oda spreyi",
    price: "₺145",
    subtitle: "Lavanta notası • Ortam hazırlığı",
    kpis: [
      { label: "Hacim", value: "100 ml" },
      { label: "İçerik", value: "Bitkisel esans" },
      { label: "Kullanım", value: "Yastık / oda" },
    ],
    bullets: [
      "Meditasyon öncesi ortamı yumuşatmak için hafif sıkım.",
      "Doğrudan cilde sıkmayın; tekstil ve hava için.",
      "Serin ve kuru yerde saklayın.",
    ],
  },
  "defter-1": {
    title: "Farkındalık Günlüğü",
    shelfTitle: "Farkındalık günlüğü",
    price: "₺265",
    subtitle: "Günlük yazı • minik görevler",
    kpis: [
      { label: "Sayfa", value: "≈160 sayfa" },
      { label: "Cilt", value: "Yumuşak kapak" },
      { label: "Tip", value: "Çizgili / noktalı" },
    ],
    bullets: [
      "3 satırlık mini günlük alanlarıyla başlaması kolay.",
      "Alışkanlık takibi için haftalık özet kutuları.",
      "Kalemle birlikte hediye paketi düşünülebilir.",
    ],
  },
  "bolster-1": {
    title: "Yoga Bolster",
    shelfTitle: "Yoga bolster",
    price: "₺720",
    subtitle: "Yin & restoratif • Destek yastığı",
    kpis: [
      { label: "Dolgu", value: "Karabuğday / pamuk" },
      { label: "Kılıf", value: "Fermuarlı, yıkanabilir" },
      { label: "Boyut", value: "≈60 × 25 cm" },
    ],
    bullets: [
      "Kalça altına veya diz arasına yerleştirilebilir.",
      "Uzun süreli pasif pozlarda rahatlatır.",
      "Mat ve minderle uyumlu doğal tonlar.",
    ],
  },
  "ses-1": {
    title: "Kablosuz Rahat Kulaklık",
    shelfTitle: "Kulaklık",
    price: "₺1.890",
    subtitle: "Meditasyon sesleri • Uzun pil",
    kpis: [
      { label: "Tip", value: "Kulak üstü" },
      { label: "Gürültü", value: "Pasif yalıtım" },
      { label: "Bağlantı", value: "Bluetooth 5.x" },
    ],
    bullets: [
      "Rehberli seansları daha net duymak için uygun.",
      "Uzun süreli kullanımda yumuşak ped seçenekleri.",
      "Şarj kutusu ile gün içi taşıma.",
    ],
  },
};

function shelfLabel(p) {
  return p?.shelfTitle || p?.title || "";
}

function parseTryFromPriceLabel(str) {
  const digits = String(str || "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function formatTryPrice(n) {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `₺${n}`;
  }
}

function formatTryPriceFraction(n) {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `₺${Number(n).toFixed(2)}`;
  }
}

function showGaiaToast(message) {
  let host = document.getElementById("gaia-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "gaia-toast-host";
    host.className = "gaia-toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  t.className = "gaia-toast";
  t.textContent = message;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("gaia-toast--show"));
  window.setTimeout(() => {
    t.classList.remove("gaia-toast--show");
    window.setTimeout(() => t.remove(), 280);
  }, 2400);
}

const GAIA_CART_KEY = "gaia:cart:v1";

function loadGaiaCart() {
  try {
    const raw = localStorage.getItem(GAIA_CART_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function saveGaiaCart(cart) {
  try {
    localStorage.setItem(GAIA_CART_KEY, JSON.stringify(cart));
  } catch {
    /* ignore */
  }
}

function gaiaCartTotalQty(cart) {
  return Object.values(cart).reduce((a, n) => a + (Number(n) || 0), 0);
}

function syncNavCartBadges() {
  const cart = loadGaiaCart();
  const n = gaiaCartTotalQty(cart);
  document.querySelectorAll("#nav-cart-badge, #nav-cart-badge-mobile").forEach((el) => {
    el.textContent = String(n);
    el.classList.toggle("nav-cart-badge--empty", n === 0);
  });
}

function gaiaShippingForSubtotal(subtotalTry) {
  const ship =
    subtotalTry >= GAIA_FREE_SHIPPING_SUBTOTAL_TRY ? 0 : GAIA_SHIPPING_FLAT_TRY;
  return { shippingTry: ship, grandTry: subtotalTry + ship };
}

function applyNavCartQtyFromInputs() {
  const ul = document.getElementById("nav-cart-product-list");
  if (!ul) return;
  const next = { ...loadGaiaCart() };
  let changed = false;
  ul.querySelectorAll("[data-cart-qty-input]").forEach((inp) => {
    const id = inp.getAttribute("data-cart-qty-input");
    if (!id || !productCatalog[id]) return;
    let n = parseInt(String(inp.value).replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n < 1) {
      if (next[id]) {
        delete next[id];
        changed = true;
      }
      return;
    }
    if (n > 99) n = 99;
    if (next[id] !== n) changed = true;
    next[id] = n;
  });
  saveGaiaCart(next);
  syncNavCartBadges();
  if (changed) showGaiaToast("Sepet güncellendi");
  renderNavCartProductList();
}

function renderNavCartProductList() {
  const ul = document.getElementById("nav-cart-product-list");
  const sub = document.getElementById("nav-cart-popover-sub");
  const checkoutBlock = document.getElementById("nav-cart-checkout-block");
  const totalsEl = document.getElementById("nav-cart-totals");
  if (!ul) return;

  const cart = loadGaiaCart();
  const idsInCart = STORE_DISPLAY_IDS.filter((id) => (cart[id] || 0) > 0 && productCatalog[id]);

  if (idsInCart.length === 0) {
    ul.innerHTML = `
      <li class="nav-cart-empty">
        <p class="nav-cart-empty-text">Sepetinde ürün yok.</p>
        <button type="button" class="btn-secondary nav-cart-empty-btn js-open-store-from-cart">Mağazaya git</button>
      </li>`;
    if (sub) sub.textContent = "Mağazadan ürün seçip «Sepete ekle» diyebilirsin.";
    if (checkoutBlock) checkoutBlock.hidden = true;
    if (totalsEl) totalsEl.innerHTML = "";
    ul.querySelector(".js-open-store-from-cart")?.addEventListener("click", () => {
      closeNavCartPopover();
      openStoreModal();
    });
    return;
  }

  if (sub) sub.textContent = "Adetleri düzenle, «Sepeti güncelle» ile kaydet; ürünü tamamen kaldırmak için «Ürünü sil».";
  if (checkoutBlock) checkoutBlock.hidden = false;

  let subtotal = 0;
  ul.innerHTML = idsInCart
    .map((id) => {
      const p = productCatalog[id];
      const qty = cart[id];
      const unitTry = parseTryFromPriceLabel(p.price);
      const lineTry = unitTry * qty;
      subtotal += lineTry;
      const label = shelfLabel(p);
      const icon = storeProductIcon(id);
      return `
        <li class="nav-cart-row nav-cart-row--line" data-product-id="${id}">
          <div class="nav-cart-row-main">
            <strong class="nav-cart-row-title"><span class="nav-cart-row-icon" aria-hidden="true">${icon}</span><span class="nav-cart-row-title-text">${label}</span></strong>
            <span class="nav-cart-row-meta">Birim: ${p.price || "—"}</span>
            <div class="nav-cart-row-controls">
              <div class="nav-cart-qty-group" role="group" aria-label="${label} adet">
                <button type="button" class="btn-nav-cart-step" data-cart-dec="${id}" aria-label="Bir azalt">−</button>
                <input class="nav-cart-qty-input" type="number" min="1" max="99" value="${qty}" inputmode="numeric" data-cart-qty-input="${id}" aria-label="Adet" />
                <button type="button" class="btn-nav-cart-step" data-cart-inc="${id}" aria-label="Bir artır">+</button>
              </div>
              <button type="button" class="btn-nav-cart-delete-line" data-cart-delete="${id}">Ürünü sil</button>
            </div>
          </div>
          <div class="nav-cart-row-actions">
            <span class="nav-cart-line-total">${formatTryPrice(lineTry)}</span>
          </div>
        </li>`;
    })
    .join("");

  const { shippingTry, grandTry } = gaiaShippingForSubtotal(subtotal);
  const shipLabel =
    shippingTry === 0 ? "Bedava" : formatTryPriceFraction(shippingTry);

  if (totalsEl) {
    totalsEl.innerHTML = `
      <button type="button" class="btn-secondary btn-nav-cart-refresh" id="nav-cart-update-btn">Sepeti güncelle</button>
      <p class="nav-cart-shipping-note">
        <strong>${formatTryPrice(GAIA_FREE_SHIPPING_SUBTOTAL_TRY)}</strong> ve üzeri siparişlerde kargo bedava.
        Altında kargo: <strong>${formatTryPriceFraction(GAIA_SHIPPING_FLAT_TRY)}</strong>.
      </p>
      <div class="nav-cart-total-line"><span>Ara toplam</span><strong>${formatTryPrice(subtotal)}</strong></div>
      <div class="nav-cart-total-line"><span>Kargo</span><strong>${shipLabel}</strong></div>
      <div class="nav-cart-total-line nav-cart-total-line--grand"><span>Ödenecek</span><strong>${formatTryPrice(grandTry)}</strong></div>`;
  }

  document.getElementById("nav-cart-update-btn")?.addEventListener("click", () => {
    applyNavCartQtyFromInputs();
  });

  ul.querySelectorAll("[data-cart-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cart-dec");
      if (!id) return;
      const next = { ...loadGaiaCart() };
      if (!next[id]) return;
      next[id] -= 1;
      if (next[id] <= 0) delete next[id];
      saveGaiaCart(next);
      syncNavCartBadges();
      renderNavCartProductList();
    });
  });

  ul.querySelectorAll("[data-cart-inc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cart-inc");
      if (!id || !productCatalog[id]) return;
      const next = { ...loadGaiaCart() };
      const q = Math.min(99, (next[id] || 0) + 1);
      next[id] = q;
      saveGaiaCart(next);
      syncNavCartBadges();
      renderNavCartProductList();
    });
  });

  ul.querySelectorAll("[data-cart-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cart-delete");
      if (!id) return;
      const next = { ...loadGaiaCart() };
      delete next[id];
      saveGaiaCart(next);
      syncNavCartBadges();
      showGaiaToast("Ürün sepetten kaldırıldı");
      renderNavCartProductList();
    });
  });
}

syncNavCartBadges();

function openNavCartPopover() {
  const pop = document.getElementById("nav-cart-popover");
  const t1 = document.getElementById("nav-cart-toggle");
  const t2 = document.getElementById("nav-cart-toggle-mobile");
  if (!pop) return;
  renderNavCartProductList();
  pop.removeAttribute("hidden");
  pop.classList.add("is-open");
  [t1, t2].forEach((t) => t?.setAttribute("aria-expanded", "true"));
  closeMobileNav();
}

function closeNavCartPopover() {
  const pop = document.getElementById("nav-cart-popover");
  const t1 = document.getElementById("nav-cart-toggle");
  const t2 = document.getElementById("nav-cart-toggle-mobile");
  if (!pop) return;
  pop.setAttribute("hidden", "");
  pop.classList.remove("is-open");
  [t1, t2].forEach((t) => t?.setAttribute("aria-expanded", "false"));
}

function toggleNavCartPopover() {
  const pop = document.getElementById("nav-cart-popover");
  if (!pop) return;
  if (pop.classList.contains("is-open")) closeNavCartPopover();
  else openNavCartPopover();
}

document.getElementById("nav-cart-toggle")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleNavCartPopover();
});
document.getElementById("nav-cart-toggle-mobile")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleNavCartPopover();
});

const storeModalOverlay = document.getElementById("store-modal");
const storeGridEl = document.getElementById("store-grid");
const storeCloseBtn = document.querySelector(".store-close");
const storeOkBtn = document.querySelector(".store-ok");
const storeOpenCartBtn = document.getElementById("store-open-cart-btn");

function storeCardHtml(id) {
  const p = productCatalog[id];
  if (!p) return "";
  const label = shelfLabel(p);
  const price = p.price || "—";
  const icon = storeProductIcon(id);
  return `
        <article class="store-card" data-product-id="${id}">
          <h4 class="store-card-title"><span class="store-card-icon" aria-hidden="true">${icon}</span><span class="store-card-title-text">${label}</span></h4>
          <p class="store-card-price">${price}</p>
          <p class="store-card-sub">${p.subtitle}</p>
          <div class="store-card-actions">
            <button type="button" class="btn-secondary btn-store-detail" data-store-detail="${id}">İncele</button>
            <button type="button" class="btn-primary btn-store-add" data-cart-add-store="${id}">Sepete ekle</button>
          </div>
        </article>`;
}

function renderStoreGrid() {
  if (!storeGridEl) return;
  storeGridEl.innerHTML = STORE_CATEGORY_SECTIONS.map((section) => {
    const cards = section.ids.map((id) => storeCardHtml(id)).filter(Boolean).join("");
    if (!cards) return "";
    const editorClass = section.key === "editor" ? " store-section--editor" : "";
    return `
      <section class="store-section${editorClass}" data-store-section="${section.key}" aria-labelledby="store-sec-${section.key}">
        <header class="store-section-head">
          <h4 class="store-section-title" id="store-sec-${section.key}">${section.title}</h4>
          <p class="store-section-sub">${section.subtitle}</p>
        </header>
        <div class="store-section-grid">${cards}</div>
      </section>`;
  }).join("");

  if (!storeGridEl.innerHTML.trim()) {
    storeGridEl.innerHTML = `<p class="store-empty">Şu an listelenecek ürün yok.</p>`;
  }
}

storeGridEl?.addEventListener("click", (e) => {
  const detailBtn = e.target.closest?.("[data-store-detail]");
  if (detailBtn && storeGridEl.contains(detailBtn)) {
    const id = detailBtn.getAttribute("data-store-detail");
    if (!id) return;
    closeStoreModal();
    openProductModal(id);
    return;
  }
  const addBtn = e.target.closest?.("[data-cart-add-store]");
  if (addBtn && storeGridEl.contains(addBtn)) {
    const id = addBtn.getAttribute("data-cart-add-store");
    if (!id || !productCatalog[id]) return;
    const next = { ...loadGaiaCart() };
    next[id] = (next[id] || 0) + 1;
    saveGaiaCart(next);
    syncNavCartBadges();
    renderNavCartProductList();
    const label = shelfLabel(productCatalog[id]);
    showGaiaToast(`${label} sepete eklendi`);
  }
});

function openStoreModal() {
  if (!storeModalOverlay) return;
  closeNavCartPopover();
  closeMobileNav();
  renderStoreGrid();
  storeModalOverlay.classList.add("open");
}

function closeStoreModal() {
  storeModalOverlay?.classList.remove("open");
}

document.querySelectorAll(".js-open-store").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    openStoreModal();
  });
});

storeCloseBtn?.addEventListener("click", () => closeStoreModal());
storeOkBtn?.addEventListener("click", () => closeStoreModal());
storeModalOverlay?.addEventListener("click", (e) => {
  if (e.target === storeModalOverlay) closeStoreModal();
});

storeOpenCartBtn?.addEventListener("click", () => {
  closeStoreModal();
  openNavCartPopover();
});

document.addEventListener("click", (e) => {
  const pop = document.getElementById("nav-cart-popover");
  if (!pop?.classList.contains("is-open")) return;
  const t = e.target;
  if (t.closest?.("#nav-cart-popover")) return;
  if (t.closest?.("#nav-cart-toggle") || t.closest?.("#nav-cart-toggle-mobile")) return;
  closeNavCartPopover();
});

function openProductModal(productId) {
  if (!productModalOverlay || !productTitleEl || !productSubtitleEl || !productBodyEl) return;
  const p = productCatalog[productId];
  if (!p) return;

  productTitleEl.textContent = p.title;
  productSubtitleEl.textContent = p.subtitle;
  const inStore = STORE_DISPLAY_IDS.includes(productId);
  const storeFooter = inStore
    ? `<div class="product-modal-cart">
        <p class="product-modal-price-tag">${p.price || "—"}</p>
        <button type="button" class="btn-primary" data-cart-add-modal="${productId}">Sepete ekle</button>
      </div>`
    : "";

  productBodyEl.innerHTML = `
    <div class="kpi-row">
      ${p.kpis
        .map((k) => `<div class="kpi"><strong>${k.label}</strong><span>${k.value}</span></div>`)
        .join("")}
    </div>
    <ul class="product-list">${p.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
    ${storeFooter}
  `;
  productModalOverlay.classList.add("open");
}

function closeProductModal() {
  productModalOverlay?.classList.remove("open");
}

document.querySelectorAll(".product-open-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const card = btn.closest(".product-card");
    const id = card?.getAttribute("data-product");
    if (id) openProductModal(id);
  });
});

productCloseBtn?.addEventListener("click", closeProductModal);
productOkBtn?.addEventListener("click", closeProductModal);
productModalOverlay?.addEventListener("click", (e) => {
  if (e.target === productModalOverlay) closeProductModal();
});

productModalOverlay?.addEventListener("click", (e) => {
  const addBtn = e.target.closest?.("[data-cart-add-modal]");
  if (!addBtn) return;
  const id = addBtn.getAttribute("data-cart-add-modal");
  if (!id || !productCatalog[id]) return;
  const next = { ...loadGaiaCart() };
  next[id] = Math.min(99, (next[id] || 0) + 1);
  saveGaiaCart(next);
  syncNavCartBadges();
  renderNavCartProductList();
  showGaiaToast(`${shelfLabel(productCatalog[id])} sepete eklendi`);
});

function applyProductFilter(filterKey) {
  productCards.forEach((card) => {
    const cat = card.getAttribute("data-category") || "";
    const show = filterKey === "all" ? true : cat === filterKey;
    card.style.display = show ? "" : "none";
  });
}

productFilterChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const key = chip.getAttribute("data-product-filter") || "all";
    productFilterChips.forEach((c) => c.classList.toggle("active", c === chip));
    applyProductFilter(key);
  });
});

// Abonelik butonları (sadece örnek uyarı)
const subscribeButtons = document.querySelectorAll(".subscribe-btn");

subscribeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    alert(
      "Teşekkürler!\nÖdeme sayfasına yönlendiriliyorsunuz. 7 gün ücretsiz deneme sonrası seçtiğin plan geçerli olacak."
    );
  });
});

// Nefes animasyonu için metin döngüsü
const breathText = document.querySelector(".breath-text");

if (breathText) {
  const steps = [
    "Nefes al (4 saniye)",
    "Nefesi tut (4 saniye)",
    "Nefesi ver (4 saniye)",
  ];
  let index = 0;

  setInterval(() => {
    index = (index + 1) % steps.length;
    breathText.textContent = steps[index];
  }, 4000);
}

// Ses dosyaları yoksa bozuk player yerine kısa mesaj göster
document.querySelectorAll("audio").forEach((audio) => {
  const onError = () => {
    const msg = document.createElement("div");
    msg.className = "audio-missing";
    msg.textContent = "Ses dosyası bulunamadı (örnek alan).";
    audio.replaceWith(msg);
  };

  // Bazı tarayıcılarda error event'i bazen gecikebiliyor; yine de dinleyelim.
  audio.addEventListener("error", onError, { once: true });
});

// ——— Yukarı çık butonu: aşağı kaydırınca göster, tıklanınca başa kaydır ———
const scrollToTopBtn = document.getElementById("scroll-to-top");
const SCROLL_SHOW_PX = 400;

function toggleScrollToTop() {
  if (!scrollToTopBtn) return;
  if (window.scrollY > SCROLL_SHOW_PX) {
    scrollToTopBtn.classList.add("visible");
  } else {
    scrollToTopBtn.classList.remove("visible");
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (scrollToTopBtn) {
  window.addEventListener("scroll", toggleScrollToTop, { passive: true });
  scrollToTopBtn.addEventListener("click", scrollToTop);
  toggleScrollToTop();
}

// ——— Uzman chat ———
const chatFab = document.getElementById("chat-fab");
const chatDrawer = document.getElementById("chat-drawer");
const chatCloseBtn = document.querySelector(".chat-close");
const chatMessagesEl = document.querySelector(".chat-messages");
const chatForm = document.querySelector(".chat-form");
const chatInput = document.querySelector(".chat-input");
const chatStatus = document.querySelector(".chat-status");
const chatSuggestionBtns = Array.from(document.querySelectorAll(".chat-suggestion"));

function setChatStatus(text) {
  if (chatStatus) chatStatus.textContent = text || "";
}

function openChat() {
  const auth = loadAuth();
  if (!auth?.accessToken && !auth?.refreshToken) {
    openAuthModal();
    setChatStatus("Sohbet için giriş yap.");
    return;
  }
  chatDrawer?.classList.add("open");
  chatDrawer?.setAttribute("aria-hidden", "false");
  setChatStatus("");
  chatInput?.focus?.();
}

function closeChat() {
  chatDrawer?.classList.remove("open");
  chatDrawer?.setAttribute("aria-hidden", "true");
  setChatStatus("");
}

function addChatMessage(role, text) {
  if (!chatMessagesEl) return;
  const el = document.createElement("div");
  el.className = `chat-msg ${role}`;
  el.textContent = text;
  chatMessagesEl.appendChild(el);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function sendChatMessage(text) {
  const msg = (text || "").trim();
  if (!msg) return;
  addChatMessage("user", msg);
  setChatStatus("Yanıt yazılıyor...");
  try {
    const res = await apiFetch("/chat", {
      method: "POST",
      body: { message: msg },
      authRequired: true,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = json?.error || "chat_failed";
      if (err === "gemini_not_configured") {
        addChatMessage("assistant", "Chat aktif değil: backend’de Gemini API key ayarlanmalı.");
      } else {
        addChatMessage("assistant", "Şu an yanıt veremiyorum. Biraz sonra tekrar dener misin?");
      }
      setChatStatus("");
      return;
    }
    addChatMessage("assistant", json.reply || "—");
    setChatStatus("");
  } catch {
    addChatMessage("assistant", "Sunucuya bağlanılamadı.");
    setChatStatus("");
  }
}

chatFab?.addEventListener("click", openChat);
chatCloseBtn?.addEventListener("click", closeChat);

chatForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = chatInput?.value || "";
  if (chatInput) chatInput.value = "";
  sendChatMessage(v);
});

chatSuggestionBtns.forEach((btn) => {
  btn.addEventListener("click", () => sendChatMessage(btn.textContent || ""));
});

// ——— Explore rails: oklarla yatay kaydır ———
document.querySelectorAll(".rail").forEach((rail) => {
  const track = rail.querySelector(".rail-track");
  if (!track) return;
  rail.querySelectorAll(".rail-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = parseInt(btn.getAttribute("data-rail-dir") || "1", 10);
      const card = track.querySelector(".rail-card");
      const step = (card?.getBoundingClientRect()?.width || 280) + 12;
      track.scrollBy({ left: dir * step * 1.2, behavior: "smooth" });
    });
  });
});

// Klavye: ESC ile kapat
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.getElementById("nav-cart-popover")?.classList?.contains("is-open")) {
    closeNavCartPopover();
    return;
  }
  if (document.getElementById("store-modal")?.classList?.contains("open")) {
    closeStoreModal();
    return;
  }
  if (mobileNavDrawer && !mobileNavDrawer.hasAttribute("hidden")) closeMobileNav();
  // chat
  if (chatDrawer?.classList?.contains("open")) closeChat();
  // auth
  if (authModalOverlay?.classList?.contains("open")) closeAuthModal();
  // subscription
  if (subscriptionModalOverlay?.classList?.contains("open")) closeSubscriptionModal();
  // package/product/meditation modalları zaten click dışı ile kapanıyor; ESC ile de kapatalım
  if (packageModalOverlay?.classList?.contains("open")) closePackageModal();
  if (productModalOverlay?.classList?.contains("open")) closeProductModal();
  if (modalOverlay?.classList?.contains("open")) closeModal();
});

// Anasayfa: üst bar — hero görünürken açık (Flov) tema, aşağı kayınca Gaia overlay
const gaiaHeroEl = document.getElementById("gaia-hero");
if (gaiaHeroEl) {
  const syncHeroBar = () => {
    const r = gaiaHeroEl.getBoundingClientRect();
    const visible = r.bottom > 72;
    document.body.classList.toggle("hero-studio-bar", visible);
  };
  syncHeroBar();
  window.addEventListener("scroll", syncHeroBar, { passive: true });
  window.addEventListener("resize", syncHeroBar);
}

// Çerez şeridi (yalnız anasayfa bloğu)
(function initCookieStrip() {
  const strip = document.querySelector(".cookie-strip");
  const btn = strip?.querySelector(".cookie-ok");
  if (!strip || !btn) return;
  try {
    if (localStorage.getItem("gaia:cookies-ok") === "1") {
      strip.remove();
      return;
    }
  } catch {
    /* ignore */
  }
  btn.addEventListener("click", () => {
    try {
      localStorage.setItem("gaia:cookies-ok", "1");
    } catch {
      /* ignore */
    }
    strip.remove();
  });
})();

