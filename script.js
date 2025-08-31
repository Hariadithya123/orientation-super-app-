const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const app = $("#app");
const modeLabel = $("#modeLabel");

const panels = {
  compass: $("#compassPanel"),
  alarm: $("#alarmPanel"),
  timer: $("#timerPanel"),
  weather: $("#weatherPanel"),
  stopwatch: $("#stopwatchPanel"),
  surprise: $("#surprisePanel"),
};

function showPanel(id) {
  Object.values(panels).forEach((p) => p.classList.add("hidden"));
  panels[id].classList.remove("hidden");
}

// ===== Voice Feedback =====
function speak(text) {
  const utter = new SpeechSynthesisUtterance(text);
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

function setMode(text) {
  modeLabel.textContent = text;
  speak(text);
}

/* ========================= Theme Toggle & Help ========================= */
$("#toggleTheme").addEventListener("click", () =>
  document.body.classList.toggle("light")
);

$("#helpBtn").addEventListener("click", () => {
  $("#orientationOverlay").style.display = "grid";
});

/* ========================= Orientation Permission ========================= */
$("#enableOrientationBtn").addEventListener("click", async () => {
  try {
    if (typeof DeviceMotionEvent?.requestPermission === "function")
      await DeviceMotionEvent.requestPermission().catch(() => {});
    if (typeof DeviceOrientationEvent?.requestPermission === "function")
      await DeviceOrientationEvent.requestPermission().catch(() => {});
  } catch (e) {}
  $("#orientationOverlay").style.display = "none";
});

/* ========================= Orientation Handling ========================= */
let lastMode = "";
let lastSwitch = 0;
const SWITCH_COOLDOWN = 450;

function switchIfNew(mode, cb) {
  const now = Date.now();
  if (mode !== lastMode && now - lastSwitch > SWITCH_COOLDOWN) {
    lastMode = mode;
    lastSwitch = now;
    cb();
  }
}

window.addEventListener("deviceorientation", (e) => {
  const { alpha, beta, gamma } = e;
  if (alpha == null || beta == null || gamma == null) return;

  // COMPASS (flat)
  if (Math.abs(beta) < 10 && Math.abs(gamma) < 10) {
    switchIfNew("compass", () => {
      showPanel("compass");
      setMode("🧭 Compass");
      app.style.transform = "rotate(0deg)";
    });
    if (lastMode === "compass") {
      $("#compassDisplay").textContent = `Heading: ${Math.round(alpha)}°`;
    }
    return;
  }

  // PORTRAIT UP → ALARM
  if (beta > 45 && beta < 135 && Math.abs(gamma) < 35) {
    switchIfNew("alarm", () => {
      showPanel("alarm");
      setMode("⏰ Alarm Clock");
      app.style.transform = "rotate(0deg)";
    });
    return;
  }

  // PORTRAIT DOWN → TIMER
  if (beta < -45 && beta > -135 && Math.abs(gamma) < 35) {
    switchIfNew("timer", () => {
      showPanel("timer");
      setMode("⏱ Timer");
      app.style.transform = "rotate(180deg)";
    });
    return;
  }

  // LANDSCAPE RIGHT → STOPWATCH
  if (gamma > 45) {
    switchIfNew("stopwatch", () => {
      showPanel("stopwatch");
      setMode("⏳ Stopwatch");
      app.style.transform = "rotate(0deg)";
    });
    return;
  }

  // LANDSCAPE LEFT → WEATHER
  if (gamma < -45) {
    switchIfNew("weather", () => {
      showPanel("weather");
      setMode("🌦 Weather");
      app.style.transform = "rotate(0deg)";
      fetchWeatherOnce(true); // allow retry
    });
    return;
  }
});

/* ========================= Surprise Mode ========================= */
let lastX = null,
  lastY = null,
  lastZ = null;
const SHAKE_THRESHOLD = 28;
let confettiRunning = false;

window.addEventListener("devicemotion", (e) => {
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;
  const { x, y, z } = acc;
  if (lastX !== null) {
    const diff =
      Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
    if (diff > SHAKE_THRESHOLD) triggerSurpriseMode();
  }
  lastX = x;
  lastY = y;
  lastZ = z;
});

function triggerSurpriseMode() {
  showPanel("surprise");
  setMode("🎉 Surprise Mode");
  app.style.transform = "rotate(0deg)";
  document.body.style.background = `linear-gradient(135deg,hsl(${rand(
    0,
    360
  )},85%,65%),hsl(${rand(0, 360)},85%,55%))`;
  fireConfetti();
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fireConfetti() {
  if (confettiRunning) return;
  confettiRunning = true;
  const end = Date.now() + 1500;
  (function frame() {
    confetti({
      particleCount: 2,
      angle: 60,
      spread: 60,
      startVelocity: 45,
      gravity: 1,
      ticks: 160,
      origin: { x: 0 },
    });
    confetti({
      particleCount: 2,
      angle: 120,
      spread: 60,
      startVelocity: 45,
      gravity: 1,
      ticks: 160,
      origin: { x: 1 },
    });
    if (Date.now() < end) requestAnimationFrame(frame);
    else confettiRunning = false;
  })();
}

/* ========================= Weather Fetch ========================= */
/* ========================= Weather Fetch (Open-Meteo, no API key) ========================= */
let weatherFetched = false;
async function fetchWeatherOnce(force = false) {
  if (weatherFetched && !force) return;
  weatherFetched = true;

  const el = $("#weatherInfo");
  el.textContent = "Fetching weather...";

  if (!navigator.geolocation) {
    el.textContent = "Geolocation not supported.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
        const res = await fetch(url);
        const data = await res.json();
        console.log("Open-Meteo response:", data);

        if (data && data.current_weather) {
          el.textContent =
            `🌍 Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)} | ` +
            `🌡 Temp: ${data.current_weather.temperature}°C, ` +
            `💨 Wind: ${data.current_weather.windspeed} km/h`;
        } else {
          el.textContent = "Weather unavailable";
          weatherFetched = false;
        }
      } catch (err) {
        console.error("Weather fetch error:", err);
        el.textContent = "Weather fetch failed";
        weatherFetched = false;
      }
    },
    () => {
      el.textContent = "Location permission denied";
      weatherFetched = false;
    }
  );
}

