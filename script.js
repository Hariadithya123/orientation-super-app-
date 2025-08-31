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

// Theme toggle & help
$("#toggleTheme").addEventListener("click", () =>
  document.body.classList.toggle("light")
);
$("#helpBtn").addEventListener("click", () => {
  $("#orientationOverlay").style.display = "grid";
});

// Orientation permission
$("#enableOrientationBtn").addEventListener("click", async () => {
  try {
    if (typeof DeviceMotionEvent?.requestPermission === "function")
      await DeviceMotionEvent.requestPermission().catch(() => {});
    if (typeof DeviceOrientationEvent?.requestPermission === "function")
      await DeviceOrientationEvent.requestPermission().catch(() => {});
  } catch (e) {}
  $("#orientationOverlay").style.display = "none";
});

// Orientation handling
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

  // Compass flat
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

  if (beta > 45 && beta < 135 && Math.abs(gamma) < 35) {
    switchIfNew("alarm", () => {
      showPanel("alarm");
      setMode("⏰ Alarm Clock");
      app.style.transform = "rotate(0deg)";
    });
    return;
  }

  if (beta < -45 && beta > -135 && Math.abs(gamma) < 35) {
    switchIfNew("timer", () => {
      showPanel("timer");
      setMode("⏱ Timer");
      app.style.transform = "rotate(180deg)";
    });
    return;
  }

  if (gamma > 45) {
    switchIfNew("stopwatch", () => {
      showPanel("stopwatch");
      setMode("⏳ Stopwatch");
      app.style.transform = "rotate(0deg)";
    });
    return;
  }

  if (gamma < -45) {
    switchIfNew("weather", () => {
      showPanel("weather");
      setMode("🌦 Weather");
      app.style.transform = "rotate(0deg)";
      fetchWeatherOnce(true);
    });
    return;
  }
});

// Surprise mode shake
let lastX = null, lastY = null, lastZ = null;
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
  lastX = x; lastY = y; lastZ = z;
});

function triggerSurpriseMode() {
  showPanel("surprise");
  setMode("🎉 Surprise Mode");
  app.style.transform = "rotate(0deg)";
  document.body.style.background = `linear-gradient(135deg,hsl(${rand(0,360)},85%,65%),hsl(${rand(0,360)},85%,55%))`;
  fireConfetti();
}

function rand(min,max){return Math.floor(Math.random()*(max-min+1))+min;}

function fireConfetti(){
  if(confettiRunning) return;
  confettiRunning=true;
  const end=Date.now()+1500;
  (function frame(){
    confetti({particleCount:2,angle:60,spread:60,startVelocity:45,gravity:1,ticks:160,origin:{x:0}});
    confetti({particleCount:2,angle:120,spread:60,startVelocity:45,gravity:1,ticks:160,origin:{x:1}});
    if(Date.now()<end) requestAnimationFrame(frame);
    else confettiRunning=false;
  })();
}

// Weather fetch
let weatherFetched=false;
async function fetchWeatherOnce(force=false){
  if(weatherFetched&&!force) return;
  weatherFetched=true;
  const el=$("#weatherInfo");
  el.textContent="Fetching weather...";
  if(!navigator.geolocation){el.textContent="Geolocation not supported."; return;}
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude,longitude}=pos.coords;
    try{
      const url=`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
      const res=await fetch(url);
      const data=await res.json();
      if(data && data.current_weather){
        el.textContent=`🌍 Lat:${latitude.toFixed(2)}, Lon:${longitude.toFixed(2)} | 🌡 Temp:${data.current_weather.temperature}°C, 💨 Wind:${data.current_weather.windspeed} km/h`;
      } else {el.textContent="Weather unavailable"; weatherFetched=false;}
    } catch(err){console.error(err); el.textContent="Weather fetch failed"; weatherFetched=false;}
  },()=>{el.textContent="Location permission denied"; weatherFetched=false;});
}

// ===== TIMER with keypad =====
// ===== TIMER =====
let timerInterval = null;
let timerRemaining = 0;
let timerPaused = false;
let originalTimer = 0;

// Timer value for each unit
let timerUnits = { hours: "", minutes: "", seconds: "" };
let currentUnit = "hours";

// Render keypad 0-9
function renderKeypad() {
  const container = $("#timerKeypad");
  container.innerHTML = "";
  for (let i = 0; i <= 9; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.addEventListener("click", ()=>{
      if(timerUnits[currentUnit].length < 2) {
        timerUnits[currentUnit] += i;
        updateTimerDisplay();
      }
    });
    container.appendChild(btn);
  }
  // Clear button
  const clearBtn = document.createElement("button");
  clearBtn.textContent = "C";
  clearBtn.addEventListener("click", ()=>{
    timerUnits[currentUnit] = "";
    updateTimerDisplay();
  });
  container.appendChild(clearBtn);
}

// Tabs switching
$$(".tab").forEach(tab=>{
  tab.addEventListener("click", ()=>{
    $$(".tab").forEach(t=>t.classList.remove("active"));
    tab.classList.add("active");
    currentUnit = tab.dataset.unit;
  });
});

// Update timer display
function updateTimerDisplay() {
  const h = String(timerUnits.hours || "0").padStart(2,'0');
  const m = String(timerUnits.minutes || "0").padStart(2,'0');
  const s = String(timerUnits.seconds || "0").padStart(2,'0');
  $("#timer-display").textContent = `${h}:${m}:${s}`;
}

// Start timer
$("#startTimerBtn").addEventListener("click", ()=>{
  const h = parseInt(timerUnits.hours||"0");
  const m = parseInt(timerUnits.minutes||"0");
  const s = parseInt(timerUnits.seconds||"0");
  timerRemaining = h*3600 + m*60 + s;
  if(timerRemaining <=0){
    $("#timer-display").textContent="Set a valid time!";
    return;
  }
  originalTimer = timerRemaining;
  timerPaused=false;
  $("#pauseTimerBtn").textContent="Pause";
  clearInterval(timerInterval);

  updateTimerDisplay();
  timerInterval=setInterval(()=>{
    timerRemaining--;
    const hh=Math.floor(timerRemaining/3600);
    const mm=Math.floor((timerRemaining%3600)/60);
    const ss=timerRemaining%60;
    $("#timer-display").textContent=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    if(timerRemaining<=0){
      clearInterval(timerInterval);
      $("#timerSound").play();
      alert("⏱ Time's up!");
    }
  },1000);
});

// Pause / Resume
$("#pauseTimerBtn").addEventListener("click", ()=>{
  if(timerRemaining<=0) return;
  if(!timerPaused){
    clearInterval(timerInterval);
    timerPaused=true;
    $("#pauseTimerBtn").textContent="Resume";
  } else {
    timerInterval=setInterval(()=>{
      timerRemaining--;
      const hh=Math.floor(timerRemaining/3600);
      const mm=Math.floor((timerRemaining%3600)/60);
      const ss=timerRemaining%60;
      $("#timer-display").textContent=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
      if(timerRemaining<=0){
        clearInterval(timerInterval);
        $("#timerSound").play();
        alert("⏱ Time's up!");
      }
    },1000);
    timerPaused=false;
    $("#pauseTimerBtn").textContent="Pause";
  }
});

// Reset
$("#resetTimerBtn").addEventListener("click", ()=>{
  clearInterval(timerInterval);
  timerRemaining = originalTimer || 0;
  timerPaused=false;
  updateTimerDisplay();
});

// Initial keypad render
renderKeypad();
updateTimerDisplay();

// ===== STOPWATCH =====
let stopwatchInterval=null, stopwatchTime=0, laps=[];

$("#startStopwatchBtn").addEventListener("click",()=>{
  if(stopwatchInterval) return;
  stopwatchInterval=setInterval(()=>{
    stopwatchTime++;
    const min=Math.floor(stopwatchTime/6000);
    const sec=Math.floor((stopwatchTime%6000)/100);
    const cs=stopwatchTime%100;
    $("#stopwatchDisplay").textContent=`${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  },10);
});

$("#lapStopwatchBtn").addEventListener("click",()=>{
  laps.push(stopwatchTime);
  const lapList=laps.map((t,i)=>{
    const min=Math.floor(t/6000);
    const sec=Math.floor((t%6000)/100);
    const cs=t%100;
    return `Lap ${i+1}: ${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  });
  $("#laps").innerHTML=lapList.join("<br>");
});

$("#resetStopwatchBtn").addEventListener("click",()=>{
  clearInterval(stopwatchInterval);
  stopwatchInterval=null;
  stopwatchTime=0;
  laps=[];
  $("#stopwatchDisplay").textContent="00:00.00";
  $("#laps").innerHTML="";
});

// ===== ALARM =====
let alarmInterval=null;
$("#setAlarmBtn").addEventListener("click",()=>{
  const alarmInput=$("#alarmTime").value;
  if(!alarmInput) return alert("Set a valid time!");
  if(alarmInterval) clearInterval(alarmInterval);
  alarmInterval=setInterval(()=>{
    const now=new Date();
    const [h,m]=alarmInput.split(":").map(Number);
    if(now.getHours()===h && now.getMinutes()===m){
      $("#alarmSound").play();
      alert("⏰ Alarm ringing!");
      clearInterval(alarmInterval);
    }
  },1000);
  $("#alarmStatus").textContent="Alarm set for "+alarmInput;
});
$("#clearAlarmBtn").addEventListener("click",()=>{
  clearInterval(alarmInterval);
  alarmInterval=null;
  $("#alarmStatus").textContent="No alarm set";
});
