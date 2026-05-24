// -------------------------------------------------------------------------- //
//              APPOINT FUNNELS - MINIMALIST COLD CALL TRACKER LOGIC          //
// -------------------------------------------------------------------------- //

// Global State
const state = {
  activeSession: {
    total: 0,
    picked: 0,
    pitched: 0,
    rejected: 0,
    booked: 0,
    name: '',
    startTime: null
  },
  history: [],
  currentChartType: 'dials', // 'dials' or 'bookings'
  chartInstance: null
};

// Stopwatch interval
let timerInterval = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Load from local storage cache
  loadFromLocalStorage();

  // Start stopwatch
  startTimer();

  // Setup control listeners
  setupEventListeners();

  // Refresh user interface & draw trends
  updateUI();
});

// -------------------------------------------------------------------------- //
//                          LOCAL STORAGE PERSISTENCE                         //
// -------------------------------------------------------------------------- //

function saveToLocalStorage() {
  localStorage.setItem('af_active_session_min', JSON.stringify(state.activeSession));
  localStorage.setItem('af_history_min', JSON.stringify(state.history));
}

function loadFromLocalStorage() {
  // Load Active Session
  const savedActive = localStorage.getItem('af_active_session_min');
  if (savedActive) {
    state.activeSession = JSON.parse(savedActive);
    if (state.activeSession.name) {
      document.getElementById('session-name').value = state.activeSession.name;
    }
  } else {
    state.activeSession.startTime = Date.now();
  }

  // Load History
  const savedHistory = localStorage.getItem('af_history_min');
  if (savedHistory) {
    state.history = JSON.parse(savedHistory);
  }

  // Apply 365 days retention bounds
  pruneOldLogs();
}

function pruneOldLogs() {
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
  const originalLength = state.history.length;

  state.history = state.history.filter(log => {
    const logDate = new Date(log.timestamp).getTime();
    return logDate >= oneYearAgo;
  });

  if (state.history.length < originalLength) {
    console.log(`Pruned ${originalLength - state.history.length} old logs from history.`);
    saveToLocalStorage();
  }
}

// -------------------------------------------------------------------------- //
//                            SESSION TIMING CLOCK                            //
// -------------------------------------------------------------------------- //

function startTimer() {
  if (!state.activeSession.startTime) {
    state.activeSession.startTime = Date.now();
  }

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - state.activeSession.startTime;
    const hours = Math.floor(elapsedMs / (3600 * 1000));
    const minutes = Math.floor((elapsedMs % (3600 * 1000)) / (60 * 1000));
    const seconds = Math.floor((elapsedMs % (60 * 1000)) / 1000);

    const pad = (num) => String(num).padStart(2, '0');
    document.getElementById('timer-display').textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }, 1000);
}

function resetTimer() {
  state.activeSession.startTime = Date.now();
  startTimer();
}

// -------------------------------------------------------------------------- //
//                        CONTROLS AND BINDINGS SETUP                         //
// -------------------------------------------------------------------------- //

function setupEventListeners() {
  // Tab Switching event listeners
  document.querySelectorAll('.tab-link').forEach(link => {
    link.addEventListener('click', () => {
      const targetTab = link.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Session Label input
  const nameInput = document.getElementById('session-name');
  nameInput.addEventListener('input', (e) => {
    state.activeSession.name = e.target.value;
    saveToLocalStorage();
  });

  // Increment click body of cards
  document.querySelectorAll('.minimalist-card .card-click-area').forEach(card => {
    card.addEventListener('click', () => {
      const target = card.getAttribute('data-target');
      adjustCounter(target, true);

      // Satisfying celebration on booked meeting
      if (target === 'booked') {
        triggerConfettiSplash();
      }
    });
  });

  // Decrement minus icon clicks
  document.querySelectorAll('.btn-decrement').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Stop click triggers on card body
      const target = btn.getAttribute('data-target');
      adjustCounter(target, false);
    });
  });

  // Reset Session counters
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset current active session counters?')) {
      state.activeSession.total = 0;
      state.activeSession.picked = 0;
      state.activeSession.pitched = 0;
      state.activeSession.rejected = 0;
      state.activeSession.booked = 0;
      state.activeSession.name = '';
      nameInput.value = '';
      resetTimer();
      saveToLocalStorage();
      updateUI();
    }
  });

  // Save Session
  document.getElementById('btn-save').addEventListener('click', () => {
    saveSession();
  });

  // Export CSV
  document.getElementById('btn-export').addEventListener('click', () => {
    exportToCSV();
  });

  // Clear cache logs
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('CAUTION: Permanently clear all campaign logs? This cannot be undone.')) {
      state.history = [];
      saveToLocalStorage();
      updateUI();
      renderCharts();
    }
  });

  // Toggle dynamic charts
  document.getElementById('btn-chart-dials').addEventListener('click', (e) => {
    toggleChart('dials', e.target);
  });
  document.getElementById('btn-chart-funnel').addEventListener('click', (e) => {
    toggleChart('bookings', e.target);
  });

  // Live text search filters
  document.getElementById('history-search').addEventListener('input', () => {
    renderHistoryTable();
  });

  // Date range filter selects
  document.getElementById('history-filter-range').addEventListener('change', () => {
    renderHistoryTable();
  });
}

// Tab switcher handler
function switchTab(tabName) {
  // Toggle tab buttons active status
  document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  const activeBtn = Array.from(document.querySelectorAll('.tab-link')).find(btn => btn.getAttribute('data-tab') === tabName);
  if (activeBtn) activeBtn.classList.add('active');

  // Toggle target content panel
  const activeContent = document.getElementById(`tab-content-${tabName}`);
  if (activeContent) activeContent.classList.add('active');

  // Critical redraw for Chart.js canvas sizes when shown inside container
  if (tabName === 'history') {
    setTimeout(() => {
      renderCharts();
    }, 50); // Let CSS display block apply first
  }
}

// -------------------------------------------------------------------------- //
//                       CASCADING BOUNDARY VALIDATIONS                       //
// -------------------------------------------------------------------------- //

function adjustCounter(stage, isIncrement) {
  if (isIncrement) {
    state.activeSession[stage]++;

    // Upward cascade: Total Dials >= Connected >= Pitched >= (Booked + Not Interested)
    if (stage === 'booked' || stage === 'rejected') {
      const neededPitches = state.activeSession.booked + state.activeSession.rejected;
      if (state.activeSession.pitched < neededPitches) {
        state.activeSession.pitched = neededPitches;
      }
    }
    if (state.activeSession.picked < state.activeSession.pitched) {
      state.activeSession.picked = state.activeSession.pitched;
    }
    if (state.activeSession.total < state.activeSession.picked) {
      state.activeSession.total = state.activeSession.picked;
    }
  } else {
    // Decrement adjustments
    if (state.activeSession[stage] > 0) {
      state.activeSession[stage]--;

      // Downward boundaries
      if (stage === 'total') {
        if (state.activeSession.picked > state.activeSession.total) {
          state.activeSession.picked = state.activeSession.total;
        }
      }
      if (stage === 'picked' || stage === 'total') {
        if (state.activeSession.pitched > state.activeSession.picked) {
          state.activeSession.pitched = state.activeSession.picked;
        }
      }
      if (stage === 'pitched' || stage === 'picked' || stage === 'total') {
        const maxLeaves = state.activeSession.pitched;
        if (state.activeSession.booked + state.activeSession.rejected > maxLeaves) {
          state.activeSession.rejected = Math.min(state.activeSession.rejected, maxLeaves);
          state.activeSession.booked = Math.max(0, maxLeaves - state.activeSession.rejected);
        }
      }
    }
  }

  saveToLocalStorage();
  updateUI();
}

// -------------------------------------------------------------------------- //
//                            UI RENDER MANAGERS                              //
// -------------------------------------------------------------------------- //

function updateUI() {
  const active = state.activeSession;

  // Render Counters
  document.getElementById('count-total').textContent = active.total;
  document.getElementById('count-picked').textContent = active.picked;
  document.getElementById('count-pitched').textContent = active.pitched;
  document.getElementById('count-rejected').textContent = active.rejected;
  document.getElementById('count-booked').textContent = active.booked;

  // Render conversion percentages
  const connRate = active.total > 0 ? Math.round((active.picked / active.total) * 100) : 0;
  const pitchRate = active.picked > 0 ? Math.round((active.pitched / active.picked) * 100) : 0;
  const declineRate = active.pitched > 0 ? Math.round((active.rejected / active.pitched) * 100) : 0;
  const overallRate = active.total > 0 ? Math.round((active.booked / active.total) * 100) : 0;

  document.getElementById('pct-picked').textContent = `${connRate}% Connect Rate`;
  document.getElementById('pct-pitched-connect').textContent = `${pitchRate}% of Connects`;
  document.getElementById('pct-rejected').textContent = `${declineRate}% of Pitched`;
  document.getElementById('pct-booked').textContent = `${overallRate}% Overall Rate`;

  // Render Visual Funnel stage values
  document.getElementById('funnel-val-total').textContent = active.total;
  document.getElementById('funnel-val-picked').textContent = active.picked;
  document.getElementById('funnel-val-pitched').textContent = active.pitched;
  document.getElementById('funnel-val-booked').textContent = active.booked;

  // Visual Funnel stage width percentages
  const connectVisualPct = active.total > 0 ? (active.picked / active.total) * 100 : 0;
  const pitchVisualPct = active.total > 0 ? (active.pitched / active.total) * 100 : 0;
  const bookVisualPct = active.total > 0 ? (active.booked / active.total) * 100 : 0;

  document.querySelector('#funnel-lvl-total .funnel-fill-bar').style.width = active.total > 0 ? '100%' : '0%';
  document.querySelector('#funnel-lvl-picked .funnel-fill-bar').style.width = `${connectVisualPct}%`;
  document.querySelector('#funnel-lvl-pitched .funnel-fill-bar').style.width = `${pitchVisualPct}%`;
  document.querySelector('#funnel-lvl-booked .funnel-fill-bar').style.width = `${bookVisualPct}%`;

  document.getElementById('funnel-pct-picked').textContent = `${connRate}%`;
  document.getElementById('funnel-pct-pitched').textContent = `${active.total > 0 ? Math.round(pitchVisualPct) : 0}%`;
  document.getElementById('funnel-pct-booked').textContent = `${active.total > 0 ? Math.round(bookVisualPct) : 0}%`;

  // Render Global aggregates
  let gDials = 0;
  let gBookings = 0;
  let gConnects = 0;

  state.history.forEach(log => {
    gDials += log.total;
    gConnects += log.picked;
    gBookings += log.booked;
  });

  const avgConnRate = gDials > 0 ? Math.round((gConnects / gDials) * 100) : 0;
  const avgBookRate = gDials > 0 ? Math.round((gBookings / gDials) * 100) : 0;

  document.getElementById('global-total-dials').textContent = gDials;
  document.getElementById('global-bookings').textContent = gBookings;
  document.getElementById('global-connect-rate').textContent = `${avgConnRate}%`;
  document.getElementById('global-booking-rate').textContent = `${avgBookRate}%`;

  // Render logs
  renderHistoryTable();
}

// -------------------------------------------------------------------------- //
//                       SAVE ACTIVE TRACKER SESSION                          //
// -------------------------------------------------------------------------- //

function saveSession() {
  const active = state.activeSession;

  if (active.total === 0) {
    alert('Log some outbound attempts before attempting to save the session.');
    return;
  }

  const campaignLabel = active.name.trim() || `Outbound Session #${state.history.length + 1}`;
  const logItem = {
    id: 'campaign_log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    name: campaignLabel,
    total: active.total,
    picked: active.picked,
    pitched: active.pitched,
    rejected: active.rejected,
    booked: active.booked
  };

  // Add to stack
  state.history.unshift(logItem);

  // Prune older than 365 days
  pruneOldLogs();

  // Reset current active states
  state.activeSession = {
    total: 0,
    picked: 0,
    pitched: 0,
    rejected: 0,
    booked: 0,
    name: '',
    startTime: Date.now()
  };
  document.getElementById('session-name').value = '';

  saveToLocalStorage();
  updateUI();

  // Alert and auto-transition to history tab to see saved results!
  alert('Outbound campaign session saved successfully!');
  switchTab('history');
}

function deleteHistoryItem(id) {
  if (confirm('Permanently delete this specific outreach log?')) {
    state.history = state.history.filter(log => log.id !== id);
    saveToLocalStorage();
    updateUI();
    renderCharts();
  }
}

// -------------------------------------------------------------------------- //
//                           HISTORY LOG TABLE RENDERING                      //
// -------------------------------------------------------------------------- //

function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  const searchVal = document.getElementById('history-search').value.toLowerCase().trim();
  const rangeVal = document.getElementById('history-filter-range').value;

  tbody.innerHTML = '';

  let filtered = state.history;

  // Filter 1: Date range
  const now = new Date();
  if (rangeVal === 'today') {
    filtered = filtered.filter(l => new Date(l.timestamp).toDateString() === now.toDateString());
  } else if (rangeVal === 'week') {
    const limits = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= limits);
  } else if (rangeVal === 'month') {
    const limits = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= limits);
  }

  // Filter 2: Text search
  if (searchVal !== '') {
    filtered = filtered.filter(l => {
      const dateStr = new Date(l.timestamp).toLocaleDateString();
      return l.name.toLowerCase().includes(searchVal) || dateStr.includes(searchVal);
    });
  }

  // Handle empty lists
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="9" class="text-center">
          <div class="table-empty-display">
            <i data-lucide="inbox"></i>
            <p>${state.history.length === 0 ? 'No historical campaign logs found. complete an active session above and click save!' : 'No entries match your search/filter.'}</p>
          </div>
        </td>
      </tr>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  // Build rows
  filtered.forEach(log => {
    const date = new Date(log.timestamp);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const bookRate = log.total > 0 ? Math.round((log.booked / log.total) * 100) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="white-space: nowrap;">
        <strong>${dateStr}</strong><br>
        <span style="font-size: 0.72rem; color: var(--text-muted);">${timeStr}</span>
      </td>
      <td>
        <span style="font-weight:600;">${escapeHTML(log.name)}</span>
      </td>
      <td class="text-center info-color" style="font-weight: 600;">${log.total}</td>
      <td class="text-center" style="color: var(--color-primary); font-weight: 600;">${log.picked}</td>
      <td class="text-center warning-color" style="font-weight: 600;">${log.pitched}</td>
      <td class="text-center error-color" style="font-weight: 600;">${log.rejected}</td>
      <td class="text-center success-color" style="font-weight: 700;">${log.booked}</td>
      <td class="text-center font-display" style="font-weight: 700; color: var(--text-main);">
        <span class="${bookRate >= 8 ? 'success-color' : ''}">${bookRate}%</span>
      </td>
      <td class="text-right">
        <button class="btn-delete-row" data-id="${log.id}" title="Delete log">
          <i data-lucide="trash"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Re-bind click event triggers
  tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteHistoryItem(id);
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// -------------------------------------------------------------------------- //
//                       LIGHT-THEMED CHART.JS TRENDS                         //
// -------------------------------------------------------------------------- //

function toggleChart(type, btnElement) {
  state.currentChartType = type;
  document.querySelectorAll('.toggle-group .btn').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');
  renderCharts();
}

function renderCharts() {
  const canvas = document.getElementById('analytics-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('chart-no-data');

  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }

  if (state.history.length === 0) {
    overlay.classList.add('show');
    return;
  } else {
    overlay.classList.remove('show');
  }

  // Reverse latest 10 items to plot chronologically
  const recentLogs = [...state.history].slice(0, 10).reverse();
  const labels = recentLogs.map(l => {
    const d = new Date(l.timestamp);
    return `${d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} (${l.name.substring(0, 8)}...)`;
  });

  if (state.currentChartType === 'dials') {
    // Activity line chart
    const dials = recentLogs.map(l => l.total);
    const connects = recentLogs.map(l => l.picked);

    state.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Total Dials',
            data: dials,
            borderColor: '#2563eb', // Royal blue
            backgroundColor: 'rgba(37, 99, 235, 0.03)',
            borderWidth: 3,
            tension: 0.25,
            fill: true,
            pointBackgroundColor: '#2563eb',
            pointRadius: 4
          },
          {
            label: 'Total Connections',
            data: connects,
            borderColor: '#0ea5e9', // Info cyan
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.25,
            pointBackgroundColor: '#0ea5e9',
            pointRadius: 3
          }
        ]
      },
      options: getCommonChartConfig('Daily Outbound Dialer trends')
    });
  } else {
    // Stacked bookings chart
    const bookings = recentLogs.map(l => l.booked);
    const rejections = recentLogs.map(l => l.rejected);

    state.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Closed Bookings',
            data: bookings,
            backgroundColor: 'rgba(16, 185, 129, 0.85)', // Success Green
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Not Interested',
            data: rejections,
            backgroundColor: 'rgba(239, 68, 68, 0.8)', // Danger Red
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        ...getCommonChartConfig('Campaign outcome allocations'),
        scales: {
          x: {
            stacked: true,
            grid: { color: '#f1f5f9' },
            ticks: { color: '#64748b', font: { family: 'Inter', size: 9 } }
          },
          y: {
            stacked: true,
            grid: { color: '#f1f5f9' },
            ticks: { color: '#64748b', stepSize: 2 }
          }
        }
      }
    });
  }
}

function getCommonChartConfig(sub) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#475569',
          font: { family: 'Inter', size: 10, weight: 600 }
        }
      },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: '#0f172a',
        bodyColor: '#475569',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        titleFont: { family: 'Outfit', weight: 'bold' },
        bodyFont: { family: 'Inter' }
      }
    },
    scales: {
      x: {
        grid: { color: '#f1f5f9' },
        ticks: { color: '#64748b', font: { family: 'Inter', size: 9 } }
      },
      y: {
        grid: { color: '#f1f5f9' },
        ticks: { color: '#64748b' }
      }
    }
  };
}

// -------------------------------------------------------------------------- //
//                       EXPORT HISTORICAL CAMPAIGNS TO CSV                   //
// -------------------------------------------------------------------------- //

function exportToCSV() {
  if (state.history.length === 0) {
    alert('No outreach log history available to export.');
    return;
  }

  let csv = 'data:text/csv;charset=utf-8,';
  csv += 'Timestamp,Campaign Label,Sent,Connected,Pitched,Not Interested,Booked,Booking Rate %\n';

  state.history.forEach(l => {
    const time = new Date(l.timestamp).toLocaleString();
    const rate = l.total > 0 ? Math.round((l.booked / l.total) * 100) : 0;
    const labelClean = `"${l.name.replace(/"/g, '""')}"`;
    
    csv += `${time},${labelClean},${l.total},${l.picked},${l.pitched},${l.rejected},${l.booked},${rate}%\n`;
  });

  const uri = encodeURI(csv);
  const a = document.createElement('a');
  a.setAttribute('href', uri);
  a.setAttribute('download', `appoint_funnels_history_${Date.now()}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// -------------------------------------------------------------------------- //
//                         LIGHTWEIGHT PARTICLE CONFETTI                      //
// -------------------------------------------------------------------------- //

function triggerConfettiSplash() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#3b82f6', '#10b981', '#0ea5e9', '#f59e0b', '#ef4444', '#6366f1'];

  // Splash 80 floating elements from the lower half
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 80,
      y: canvas.height * 0.7,
      radius: Math.random() * 4 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 12 - 8,
      gravity: 0.32,
      alpha: 1,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 8
    });
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let count = 0;

    particles.forEach(p => {
      if (p.alpha > 0) {
        count++;
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.018;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        if (Math.random() > 0.5) {
          ctx.fillRect(-p.radius, -p.radius / 2, p.radius * 2, p.radius);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    });

    if (count > 0) {
      requestAnimationFrame(loop);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  loop();
}

// Keep canvas full viewport
window.addEventListener('resize', () => {
  const canvas = document.getElementById('confetti-canvas');
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
});
