"use strict";

/* =========================================================
   TUGAS RUTIN 5: Weather App (OpenWeatherMap API)
   Fitur: cuaca saat ini, prakiraan per 3 jam, prakiraan 5 hari,
   toggle °C/°F, riwayat pencarian (LocalStorage), animasi latar
   sesuai kondisi cuaca, loading state, dan error handling.
   ========================================================= */

/* ---------- 1. KONFIGURASI ---------- */

// GANTI teks di bawah dengan API key milikmu dari openweathermap.org
const API_KEY = "678d52936ed09c21c2f2ca741d2dd709";

const PLACEHOLDER_KEY = "ISI_API_KEY_KAMU_DI_SINI";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const DEFAULT_CITY = "Medan";
const MAX_HISTORY = 5;
const STORAGE_KEYS = { history: "weather-history", unit: "weather-unit" };

const iconUrl = (code) => `https://openweathermap.org/img/wn/${code}@2x.png`;

/* ---------- 2. ELEMEN DOM & STATE ---------- */

const $ = (selector) => document.querySelector(selector);

const els = {
  form: $("#search-form"),
  input: $("#city-input"),
  searchButton: $("#search-button"),
  error: $("#error"),
  loading: $("#loading"),
  weather: $("#weather"),
  city: $("#city-name"),
  country: $("#country"),
  temp: $("#temp"),
  summary: $("#summary"),
  range: $("#range"),
  hourly: $("#hourly-list"),
  daily: $("#daily-list"),
  details: $("#details-list"),
  updated: $("#updated"),
  historySection: $("#history-section"),
  historyList: $("#history-list"),
  historyClear: $("#history-clear"),
  unitButtons: document.querySelectorAll(".unit-toggle__button"),
};

const state = {
  unit: "C",
  data: null,
  requestId: 0,
};

/* ---------- 3. UTILITAS ---------- */

// Penyimpanan aman: tidak error walau LocalStorage diblokir browser
const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* diabaikan: aplikasi tetap jalan tanpa penyimpanan */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* diabaikan */
    }
  },
};

// Mencegah teks dari API/pengguna disisipkan sebagai HTML
const escapeHTML = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Suhu selalu diambil dalam Celsius, lalu dikonversi di sini saat ditampilkan
const toUnit = (celsius) => Math.round(state.unit === "F" ? (celsius * 9) / 5 + 32 : celsius);
const formatTemp = (celsius) => `${toUnit(celsius)}°`;

const pad = (number) => String(number).padStart(2, "0");

// Waktu setempat kota: detik UTC + selisih zona waktu kota, dibaca dengan getter UTC
const localDate = (unix, timezone) => new Date((unix + timezone) * 1000);
const dateKey = (unix, timezone) => localDate(unix, timezone).toISOString().slice(0, 10);
const formatClock = (unix, timezone) => {
  const date = localDate(unix, timezone);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};
const weekdayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" });

const COMPASS = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"];
const getCompass = (degrees) => COMPASS[Math.round(degrees / 45) % 8];

const getCountryName = (code) => {
  try {
    return new Intl.DisplayNames(["id"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

/* ---------- 4. EFEK LATAR: bintang, hujan, salju ---------- */

const buildStars = () => {
  const fragment = document.createDocumentFragment();
  Array.from({ length: 80 }).forEach(() => {
    const star = document.createElement("span");
    star.className = "star";
    star.style.cssText = [
      `left:${Math.random() * 100}%`,
      `top:${Math.random() * 70}%`,
      `--size:${(Math.random() * 2 + 1).toFixed(1)}px`,
      `--delay:${(Math.random() * 5).toFixed(1)}s`,
      `--duration:${(Math.random() * 3 + 2).toFixed(1)}s`,
    ].join(";");
    fragment.append(star);
  });
  $("#stars").append(fragment);
};

// Partikel hujan/salju digambar di <canvas> agar ringan
const fx = (() => {
  const canvas = $("#fx-canvas");
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const settings = { type: null, intensity: 1 };
  let particles = [];
  let frameId = null;
  let width = 0;
  let height = 0;

  const rand = (min, max) => Math.random() * (max - min) + min;

  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const spawn = (type, anywhere) =>
    type === "snow"
      ? { x: rand(0, width), y: anywhere ? rand(0, height) : -10, r: rand(1.2, 3.4), speed: rand(0.5, 1.6), sway: rand(0, Math.PI * 2) }
      : { x: rand(-100, width), y: anywhere ? rand(0, height) : -30, len: rand(12, 26), speed: rand(15, 26) };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);

    if (settings.type === "rain") {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      particles.forEach((drop) => {
        ctx.moveTo(drop.x - drop.len * 0.18, drop.y - drop.len);
        ctx.lineTo(drop.x, drop.y);
        drop.x += drop.speed * 0.18;
        drop.y += drop.speed;
        if (drop.y > height + 30 || drop.x > width + 30) Object.assign(drop, spawn("rain", false));
      });
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      particles.forEach((flake) => {
        flake.sway += 0.02;
        flake.x += Math.sin(flake.sway) * 0.6;
        flake.y += flake.speed;
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
        ctx.fill();
        if (flake.y > height + 10) Object.assign(flake, spawn("snow", false));
      });
    }

    frameId = requestAnimationFrame(draw);
  };

  const stop = () => {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    ctx.clearRect(0, 0, width, height);
  };

  const start = () => {
    stop();
    if (!settings.type || reduceMotion.matches) return;
    const divisor = settings.type === "snow" ? 6000 : 4500;
    const count = Math.min(Math.round(((width * height) / divisor) * settings.intensity), 260);
    particles = Array.from({ length: count }, () => spawn(settings.type, true));
    frameId = requestAnimationFrame(draw);
  };

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
  resize();

  return {
    set(type, intensity = 1) {
      settings.type = type;
      settings.intensity = intensity;
      start();
    },
  };
})();

/* ---------- 5. TEMA CUACA ---------- */

// Mengubah kode kondisi OpenWeatherMap menjadi nama tema latar
const getTheme = ({ id, icon }) => {
  const isNight = icon.endsWith("n");
  if (id >= 200 && id < 300) return "thunder";
  if (id >= 300 && id < 600) return "rain";
  if (id >= 600 && id < 700) return "snow";
  if (id >= 700 && id < 800) return "fog";
  if (id === 800) return isNight ? "clear-night" : "clear-day";
  if (id === 801 || id === 802) return isNight ? "partly-night" : "partly-day";
  return isNight ? "clouds-night" : "clouds-day";
};

const getRainIntensity = (id) => {
  if (id >= 200 && id < 300) return 1.2;
  if (id < 400) return 0.5;
  return id <= 501 ? 0.8 : 1.3;
};

const applyTheme = (weather) => {
  const theme = getTheme(weather);
  document.body.dataset.theme = theme;
  document.body.dataset.time = weather.icon.endsWith("n") ? "night" : "day";

  if (theme === "rain" || theme === "thunder") fx.set("rain", getRainIntensity(weather.id));
  else if (theme === "snow") fx.set("snow", 1);
  else fx.set(null);
};

/* ---------- 6. AMBIL DATA (Fetch API + async/await) ---------- */

class WeatherError extends Error {
  constructor(type, message) {
    super(message);
    this.type = type;
  }
}

const fetchJSON = async (endpoint, city) => {
  if (!API_KEY || API_KEY === PLACEHOLDER_KEY) {
    throw new WeatherError("apikey", "API key belum diisi. Buka script.js lalu ganti nilai API_KEY dengan key dari openweathermap.org.");
  }

  const params = new URLSearchParams({ q: city, appid: API_KEY, units: "metric", lang: "id" });
  let response;

  try {
    response = await fetch(`${BASE_URL}/${endpoint}?${params}`);
  } catch {
    throw new WeatherError("network", "Tidak bisa terhubung ke server. Periksa koneksi internetmu lalu coba lagi.");
  }

  if (response.status === 404) throw new WeatherError("notfound", `Kota "${city}" tidak ditemukan. Periksa penulisan namanya.`);
  if (response.status === 401) throw new WeatherError("apikey", "API key tidak valid atau belum aktif. Key baru bisa butuh sampai beberapa jam untuk aktif.");
  if (response.status === 429) throw new WeatherError("limit", "Batas permintaan API tercapai. Coba lagi beberapa menit lagi.");
  if (!response.ok) throw new WeatherError("server", `Server cuaca sedang bermasalah (kode ${response.status}).`);

  return response.json();
};

/* ---------- 7. OLAH DATA (map / filter / reduce) ---------- */

// Mengelompokkan prakiraan 3-jaman menjadi data per hari
const buildDaily = (forecast, current) => {
  const timezone = forecast.city.timezone;
  const todayKey = dateKey(current.dt, timezone);

  const groups = forecast.list.reduce((result, item) => {
    const key = dateKey(item.dt, timezone);
    if (!result[key]) result[key] = [];
    result[key].push(item);
    return result;
  }, {});

  return Object.entries(groups)
    .map(([key, items]) => {
      const temps = items.map((item) => item.main.temp);
      if (key === todayKey) temps.push(current.main.temp);

      // Ikon hari itu diambil dari data yang paling dekat dengan jam 12 siang
      const midday = items.reduce((best, item) =>
        Math.abs(localDate(item.dt, timezone).getUTCHours() - 12) <
        Math.abs(localDate(best.dt, timezone).getUTCHours() - 12)
          ? item
          : best
      );

      return {
        key,
        isToday: key === todayKey,
        label: key === todayKey ? "Hari ini" : weekdayFormatter.format(localDate(items[0].dt, timezone)),
        min: Math.min(...temps),
        max: Math.max(...temps),
        icon: midday.weather[0].icon.replace("n", "d"),
        description: midday.weather[0].description,
      };
    })
    .slice(0, 5);
};

/* ---------- 8. TAMPILKAN DATA ---------- */

const describeFeels = (feels, actual) => {
  const diff = feels - actual;
  if (diff >= 2) return "Terasa lebih hangat dari suhu aktual.";
  if (diff <= -2) return "Terasa lebih dingin dari suhu aktual.";
  return "Mirip dengan suhu aktual.";
};

const describeHumidity = (humidity) => {
  if (humidity >= 80) return "Udara sangat lembap.";
  if (humidity >= 60) return "Udara cukup lembap.";
  return "Udara relatif kering.";
};

const describeVisibility = (meters) => {
  if (meters >= 8000) return "Jarak pandang sangat baik.";
  if (meters >= 4000) return "Jarak pandang cukup baik.";
  return "Jarak pandang terbatas.";
};

const renderCurrent = (current, daily) => {
  const [weather] = current.weather;
  const today = daily.find((day) => day.isToday);
  const high = today ? today.max : current.main.temp_max;
  const low = today ? today.min : current.main.temp_min;

  els.city.textContent = current.name;
  els.country.textContent = getCountryName(current.sys.country);
  els.temp.textContent = formatTemp(current.main.temp);
  els.summary.innerHTML = `
    <img class="current__icon" src="${iconUrl(weather.icon)}" alt="" width="56" height="56">
    <span>${escapeHTML(capitalize(weather.description))}</span>`;
  els.range.textContent = `T: ${formatTemp(high)}  R: ${formatTemp(low)}`;
  document.title = `${current.name} ${formatTemp(current.main.temp)} | Cuaca`;
};

const renderHourly = (current, forecast) => {
  const timezone = current.timezone;
  const [weather] = current.weather;

  const hours = [
    { label: "Sekarang", icon: weather.icon, description: weather.description, temp: current.main.temp, pop: 0 },
    ...forecast.list.slice(0, 7).map((item) => ({
      label: formatClock(item.dt, timezone),
      icon: item.weather[0].icon,
      description: item.weather[0].description,
      temp: item.main.temp,
      pop: item.pop ?? 0,
    })),
  ];

  els.hourly.innerHTML = hours
    .map(
      (hour) => `
      <li class="hourly__item">
        <span class="hourly__time">${hour.label}</span>
        <img class="hourly__icon" src="${iconUrl(hour.icon)}" alt="${escapeHTML(hour.description)}" width="50" height="50" loading="lazy">
        <span class="hourly__temp">${formatTemp(hour.temp)}</span>
        ${hour.pop >= 0.1 ? `<span class="hourly__pop">${Math.round(hour.pop * 100)}%</span>` : ""}
      </li>`
    )
    .join("");
};

const renderDaily = (daily) => {
  const lowest = Math.min(...daily.map((day) => day.min));
  const highest = Math.max(...daily.map((day) => day.max));
  const range = highest - lowest || 1;

  els.daily.innerHTML = daily
    .map((day) => {
      const start = ((day.min - lowest) / range) * 100;
      const size = Math.max(((day.max - day.min) / range) * 100, 8);
      return `
      <li class="daily__item">
        <span class="daily__day">${escapeHTML(day.label)}</span>
        <img class="daily__icon" src="${iconUrl(day.icon)}" alt="${escapeHTML(day.description)}" width="40" height="40" loading="lazy">
        <span class="daily__min">${formatTemp(day.min)}</span>
        <span class="daily__bar" aria-hidden="true">
          <span class="daily__fill" style="--start:${start.toFixed(1)}%;--size:${size.toFixed(1)}%"></span>
        </span>
        <span class="daily__max">${formatTemp(day.max)}</span>
      </li>`;
    })
    .join("");
};

const renderDetails = (current) => {
  const { main, wind, sys, timezone } = current;
  const visibility = current.visibility ?? null;

  const tiles = [
    { title: "Terasa seperti", value: formatTemp(main.feels_like), note: describeFeels(main.feels_like, main.temp) },
    { title: "Kelembapan", value: `${main.humidity}%`, note: describeHumidity(main.humidity) },
    {
      title: "Angin",
      value: `${Math.round(wind.speed * 3.6)} km/j`,
      note: `Arah ${getCompass(wind.deg ?? 0)}${wind.gust ? `, hembusan ${Math.round(wind.gust * 3.6)} km/j` : ""}.`,
    },
    { title: "Tekanan", value: `${main.pressure} hPa`, note: "Tekanan udara di permukaan laut." },
    {
      title: "Jarak pandang",
      value: visibility === null ? "-" : `${(visibility / 1000).toFixed(1).replace(".0", "")} km`,
      note: visibility === null ? "Data tidak tersedia." : describeVisibility(visibility),
    },
    {
      title: "Matahari terbit",
      value: formatClock(sys.sunrise, timezone),
      note: `Terbenam pukul ${formatClock(sys.sunset, timezone)}.`,
    },
  ];

  els.details.innerHTML = tiles
    .map(
      (tile) => `
      <li class="card tile">
        <h3 class="card__title">${tile.title}</h3>
        <p class="tile__value">${escapeHTML(tile.value)}</p>
        <p class="tile__note">${escapeHTML(tile.note)}</p>
      </li>`
    )
    .join("");
};

const render = () => {
  if (!state.data) return;

  const { current, forecast } = state.data;
  const daily = buildDaily(forecast, current);

  renderCurrent(current, daily);
  renderHourly(current, forecast);
  renderDaily(daily);
  renderDetails(current);
  applyTheme(current.weather[0]);

  els.updated.textContent = `Diperbarui pukul ${formatClock(current.dt, current.timezone)} waktu setempat.`;
  els.weather.hidden = false;
};

/* ---------- 9. LOADING & ERROR ---------- */

const setLoading = (isLoading) => {
  els.loading.hidden = !isLoading;
  els.weather.setAttribute("aria-busy", String(isLoading));
  els.weather.classList.toggle("weather--stale", isLoading);
  els.searchButton.disabled = isLoading;
};

const showError = (message) => {
  els.error.textContent = message;
  els.error.hidden = false;
};

const clearError = () => {
  els.error.textContent = "";
  els.error.hidden = true;
};

/* ---------- 10. RIWAYAT PENCARIAN (LocalStorage) ---------- */

const getHistory = () => {
  const saved = storage.get(STORAGE_KEYS.history, []);
  return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : [];
};

const renderHistory = () => {
  const history = getHistory();
  els.historySection.hidden = history.length === 0;
  els.historyList.innerHTML = history
    .map(
      (city) =>
        `<li><button class="history__button" type="button" data-city="${escapeHTML(city)}">${escapeHTML(city)}</button></li>`
    )
    .join("");
};

const saveHistory = (city) => {
  const updated = [city, ...getHistory().filter((item) => item.toLowerCase() !== city.toLowerCase())].slice(0, MAX_HISTORY);
  storage.set(STORAGE_KEYS.history, updated);
  renderHistory();
};

/* ---------- 11. ALUR UTAMA ---------- */

const loadWeather = async (cityName) => {
  const city = cityName.trim();
  if (!city) {
    showError("Ketik nama kota terlebih dahulu.");
    return;
  }

  const requestId = ++state.requestId;
  clearError();
  setLoading(true);

  try {
    const [current, forecast] = await Promise.all([fetchJSON("weather", city), fetchJSON("forecast", city)]);
    if (requestId !== state.requestId) return; // pencarian lama diabaikan

    state.data = { current, forecast };
    els.input.value = current.name;
    saveHistory(current.name);
    render();
  } catch (error) {
    if (requestId !== state.requestId) return;
    showError(error instanceof WeatherError ? error.message : "Terjadi kesalahan tak terduga. Silakan coba lagi.");
    console.error(error);
  } finally {
    if (requestId === state.requestId) setLoading(false);
  }
};

/* ---------- 12. EVENT ---------- */

const updateUnitButtons = () => {
  els.unitButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.unit === state.unit));
  });
};

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadWeather(els.input.value);
});

els.historyList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-city]");
  if (!button) return;
  els.input.value = button.dataset.city;
  loadWeather(button.dataset.city);
});

els.historyClear.addEventListener("click", () => {
  storage.remove(STORAGE_KEYS.history);
  renderHistory();
});

els.unitButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.unit = button.dataset.unit;
    storage.set(STORAGE_KEYS.unit, state.unit);
    updateUnitButtons();
    render();
  });
});

/* ---------- 13. MULAI ---------- */

const init = () => {
  state.unit = storage.get(STORAGE_KEYS.unit, "C") === "F" ? "F" : "C";
  buildStars();
  updateUnitButtons();
  renderHistory();

  const startCity = getHistory()[0] ?? DEFAULT_CITY;
  els.input.value = startCity;
  loadWeather(startCity);
};

init();