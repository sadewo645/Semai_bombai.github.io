const APPS_SCRIPT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbx_4_Tg1QJTNlYCuyVaI2w4L_jGWmoow9a9CG6T9BOtp7Mx47xSFgfHyjB5RCeN1kl4/exec';
const REFRESH_MS = 30_000;
const IDEAL = {
  dayTemp: [20, 25],
  nightTemp: [15, 18],
  humidity: [65, 75],
  vpd: [0.4, 0.8],
};

const state = {
  timer: null,
  charts: {},
  records: [],
};

const el = {
  overlay: document.getElementById('state-overlay'),
  stateMessage: document.getElementById('state-message'),
  retryBtn: document.getElementById('retry-btn'),
  connectionStatus: document.getElementById('connection-status'),
  lastUpdate: document.getElementById('last-update'),
  latestTemp: document.getElementById('latest-temp'),
  latestHumidity: document.getElementById('latest-humidity'),
  latestLamp: document.getElementById('latest-lamp'),
  latestFan: document.getElementById('latest-fan'),
  latestVpd: document.getElementById('latest-vpd'),
  latestGdd: document.getElementById('latest-gdd'),
  latestScore: document.getElementById('latest-score'),
  scoreLabel: document.getElementById('score-label'),
  scoreCard: document.getElementById('score-card'),
  scoreDot: document.getElementById('score-dot'),
  statusText: document.getElementById('status-text'),
  gddTotal: document.getElementById('gdd-total'),
  vpdRisk: document.getElementById('vpd-risk'),
  tableBody: document.getElementById('latest-table-body'),
  rowsCount: document.getElementById('rows-count'),
};

const chartIds = {
  tempChart: 'line',
  humidityChart: 'line',
  lampChart: 'bar',
  fanChart: 'bar',
  vpdChart: 'line',
  gddChart: 'line',
  scoreChart: 'line',
};

document.addEventListener('DOMContentLoaded', () => {
  el.retryBtn.addEventListener('click', loadData);
  createCharts();
  loadData();
  state.timer = setInterval(loadData, REFRESH_MS);
});

async function loadData() {
  setState('loading', 'Memuat data dari Apps Script...');
  try {
    const response = await fetch(APPS_SCRIPT_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    if (!Array.isArray(raw)) throw new Error('Format JSON bukan array objek');

    const parsed = raw
      .map(parseRow)
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    if (!parsed.length) throw new Error('Tidak ada data valid dari endpoint');

    state.records = parsed;
    renderDashboard(parsed);
    setState('ready');
    el.connectionStatus.textContent = 'Terhubung';
    el.lastUpdate.textContent = new Date().toLocaleString('id-ID');
  } catch (error) {
    console.error(error);
    setState('error', `Gagal mengambil data: ${error.message}`);
    el.connectionStatus.textContent = 'Gagal';
  }
}

function parseRow(row) {
  const time = new Date(row.Waktu);
  const temp = Number.parseFloat(row.Suhu);
  const humidity = Number.parseFloat(row.Kelembaban);

  if (Number.isNaN(time.getTime()) || Number.isNaN(temp) || Number.isNaN(humidity)) return null;

  const lampOn = toBinaryStatus(row.Lampu);
  const fanOn = toBinaryStatus(row['Fan udara']);

  const vpsat = 0.61078 * Math.exp((17.27 * temp) / (temp + 237.3));
  const vpair = vpsat * (humidity / 100);
  const vpd = vpsat - vpair;

  const gddRow = Math.max(0, temp - 5);

  const tempRange = isDay(time) ? IDEAL.dayTemp : IDEAL.nightTemp;
  const tempScore = rangeScore(temp, tempRange[0], tempRange[1]);
  const humidityScore = rangeScore(humidity, IDEAL.humidity[0], IDEAL.humidity[1]);
  const vpdScore = rangeScore(vpd, IDEAL.vpd[0], IDEAL.vpd[1]);
  const score = clamp(0.45 * tempScore + 0.35 * humidityScore + 0.2 * vpdScore, 0, 100);

  return {
    time,
    label: formatTime(time),
    temp,
    humidity,
    lampOn,
    fanOn,
    vpd,
    gddRow,
    score,
  };
}

function renderDashboard(rows) {
  const latest = rows.at(-1);
  const gddTotal = rows.reduce((sum, row) => sum + row.gddRow, 0);
  const scoreMeta = scoreCategory(latest.score);

  el.latestTemp.textContent = `${latest.temp.toFixed(1)}°C`;
  el.latestHumidity.textContent = `${latest.humidity.toFixed(1)}%`;
  el.latestLamp.textContent = latest.lampOn ? 'Nyala' : 'Mati';
  el.latestFan.textContent = latest.fanOn ? 'Nyala' : 'Mati';
  el.latestVpd.textContent = `${latest.vpd.toFixed(2)} kPa`;
  el.latestGdd.textContent = latest.gddRow.toFixed(2);
  el.latestScore.textContent = latest.score.toFixed(0);
  el.scoreLabel.textContent = scoreMeta.label;
  el.statusText.textContent = `${scoreMeta.label} (${latest.score.toFixed(0)})`;
  el.gddTotal.textContent = gddTotal.toFixed(2);
  el.vpdRisk.textContent = latest.vpd > 1 ? 'Risiko stres transpirasi berat' : 'Aman terkendali';

  el.scoreCard.style.borderColor = scoreMeta.color;
  el.latestScore.style.color = scoreMeta.color;
  el.scoreDot.style.background = scoreMeta.color;

  updateCharts(rows);
  renderTable(rows.slice(-10).reverse());
  el.rowsCount.textContent = `${rows.length} baris`;
}

function renderTable(rows) {
  el.tableBody.innerHTML = rows
    .map((row) => {
      const scoreMeta = scoreCategory(row.score);
      return `
      <tr>
        <td>${row.label}</td>
        <td>${row.temp.toFixed(1)}</td>
        <td>${row.humidity.toFixed(1)}</td>
        <td><span class="status-pill ${row.lampOn ? 'pill-on' : 'pill-off'}">${row.lampOn ? 'Nyala' : 'Mati'}</span></td>
        <td><span class="status-pill ${row.fanOn ? 'pill-on' : 'pill-off'}">${row.fanOn ? 'Nyala' : 'Mati'}</span></td>
        <td>${row.vpd.toFixed(2)}</td>
        <td>${row.gddRow.toFixed(2)}</td>
        <td style="color:${scoreMeta.color};font-weight:700;">${row.score.toFixed(0)} (${scoreMeta.label})</td>
      </tr>`;
    })
    .join('');
}

function createCharts() {
  Object.entries(chartIds).forEach(([id, type]) => {
    const ctx = document.getElementById(id);
    state.charts[id] = new Chart(ctx, {
      type,
      data: { labels: [], datasets: [] },
      options: baseChartOptions(type),
    });
  });
}

function updateCharts(rows) {
  const labels = rows.map((row) => row.label);

  setChart('tempChart', labels, [
    lineDataset('Suhu (°C)', rows.map((r) => r.temp), '#38bdf8'),
  ]);
  setChart('humidityChart', labels, [
    lineDataset('Kelembapan (%)', rows.map((r) => r.humidity), '#22d3ee'),
  ]);

  setChart('lampChart', labels, [
    barDataset('Lampu', rows.map((r) => (r.lampOn ? 1 : 0)), '#7c83ff'),
  ]);
  setChart('fanChart', labels, [
    barDataset('Fan Udara', rows.map((r) => (r.fanOn ? 1 : 0)), '#ef5da8'),
  ]);

  setChart('vpdChart', labels, [
    lineDataset('VPD (kPa)', rows.map((r) => r.vpd), '#f59e0b'),
    lineDataset('Batas Risiko 1.0', rows.map(() => 1), '#ef4444', true),
  ]);
  setChart('gddChart', labels, [
    lineDataset('GDD Row', rows.map((r) => r.gddRow), '#60a5fa'),
    lineDataset('Akumulasi GDD', cumulative(rows.map((r) => r.gddRow)), '#a78bfa'),
  ]);
  setChart('scoreChart', labels, [
    areaDataset('Skor Kondisi', rows.map((r) => r.score)),
  ]);
}

function setChart(id, labels, datasets) {
  const chart = state.charts[id];
  chart.data.labels = labels;
  chart.data.datasets = datasets;
  chart.update();
}

function baseChartOptions(type) {
  const isBinary = type === 'bar';
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 650, easing: 'easeOutQuart' },
    plugins: {
      legend: { labels: { color: '#dbeafe' } },
      tooltip: {
        backgroundColor: 'rgba(13, 19, 44, 0.95)',
        borderColor: 'rgba(108, 148, 255, 0.5)',
        borderWidth: 1,
        titleColor: '#eff6ff',
        bodyColor: '#dbeafe',
      },
    },
    scales: {
      x: {
        ticks: { color: '#b7c8e8', maxRotation: 0, autoSkip: true },
        grid: { color: 'rgba(133, 157, 211, 0.18)' },
      },
      y: {
        min: isBinary ? 0 : undefined,
        max: isBinary ? 1 : undefined,
        ticks: {
          color: '#b7c8e8',
          callback: (value) => (isBinary ? (value === 1 ? 'Nyala' : 'Mati') : value),
        },
        grid: { color: 'rgba(133, 157, 211, 0.18)' },
      },
    },
  };
}

function lineDataset(label, data, color, dashed = false) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.34,
    borderDash: dashed ? [5, 5] : [],
  };
}

function barDataset(label, data, color) {
  return {
    label,
    data,
    backgroundColor: color,
    borderRadius: 6,
  };
}

function areaDataset(label, data) {
  return {
    label,
    data,
    borderWidth: 2,
    borderColor: '#38bdf8',
    pointRadius: 0,
    tension: 0.3,
    fill: true,
    backgroundColor: (ctx) => {
      const { chart } = ctx;
      const gradient = chart.ctx.createLinearGradient(0, 0, 0, chart.height || 300);
      gradient.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0.25)');
      return gradient;
    },
    segment: {
      borderColor: (ctx) => scoreCategory(ctx.p1.parsed.y).color,
    },
  };
}

function rangeScore(value, min, max) {
  if (value >= min && value <= max) return 100;
  const center = (min + max) / 2;
  const spread = (max - min) / 2 || 1;
  const distance = Math.abs(value - center) / spread;
  return clamp(100 - distance * 40, 0, 100);
}

function scoreCategory(score) {
  if (score >= 80) return { label: 'Ideal', color: '#3b82f6' };
  if (score >= 60) return { label: 'Baik', color: '#22d3ee' };
  if (score >= 40) return { label: 'Waspada', color: '#f59e0b' };
  return { label: 'Buruk', color: '#ef4444' };
}

function isDay(date) {
  const hour = date.getHours();
  return hour >= 6 && hour < 18;
}

function toBinaryStatus(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'on', 'nyala', 'true', 'hidup', 'yes'].includes(normalized);
}

function formatTime(date) {
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cumulative(values) {
  let sum = 0;
  return values.map((value) => {
    sum += value;
    return sum;
  });
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function setState(mode, message = '') {
  if (mode === 'loading') {
    el.overlay.classList.remove('hidden');
    el.stateMessage.textContent = message;
    el.retryBtn.hidden = true;
  }

  if (mode === 'ready') {
    el.overlay.classList.add('hidden');
  }

  if (mode === 'error') {
    el.overlay.classList.remove('hidden');
    el.stateMessage.textContent = message;
    el.retryBtn.hidden = false;
  }
}
