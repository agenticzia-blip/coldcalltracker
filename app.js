// -------------------------------------------------------------------------- //
//                       APPOINT FUNNELS - APPLICATION LOGIC                  //
// -------------------------------------------------------------------------- //

// Global Application State
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

// Timer Variables
let timerInterval = null;

// Initialize Lucide Icons & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Load Saved State & History
  loadFromLocalStorage();

  // Start Session Stopwatch
  startTimer();

  // Setup Event Listeners
  setupEventListeners();

  // Update UI and Charts
  updateUI();
  renderCharts();
});

// -------------------------------------------------------------------------- //
//                          LOCAL STORAGE PERSISTENCE                         //
// -------------------------------------------------------------------------- //

function saveToLocalStorage() {
  localStorage.setItem('af_active_session', JSON.stringify(state.activeSession));
  localStorage.setItem('af_history', JSON.stringify(state.history));
}

function loadFromLocalStorage() {
  // Load Active Session (if it exists)
  const savedActive = localStorage.getItem('af_active_session');
  if (savedActive) {
    state.activeSession = JSON.parse(savedActive);
    if (state.activeSession.name) {
      document.getElementById('session-name').value = state.activeSession.name;
    }
  } else {
    state.activeSession.startTime = Date.now();
  }

  // Load History
  const savedHistory = localStorage.getItem('af_history');
  if (savedHistory) {
    state.history = JSON.parse(savedHistory);
  }

  // Enforce 1-Year Retention Policy (Prune logs older than 365 days)
  pruneOldLogs();
}

function pruneOldLogs() {
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
  const originalLength = state.history.length;
  
  // Filter logs to only keep those from the last 365 days
  state.history = state.history.filter(log => {
    const logDate = new Date(log.timestamp).getTime();
    return logDate >= oneYearAgo;
  });

  if (state.history.length < originalLength) {
    console.log(`Pruned ${originalLength - state.history.length} logs older than 1 year.`);
    saveToLocalStorage();
  }
}

// -------------------------------------------------------------------------- //
//                            STOPWATCH / TIMER STATE                          //
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
//                       EVENT LISTENERS & CONTROLS                           //
// -------------------------------------------------------------------------- //

function setupEventListeners() {
  // Input field for Session Name
  const sessionNameInput = document.getElementById('session-name');
  sessionNameInput.addEventListener('input', (e) => {
    state.activeSession.name = e.target.value;
    saveToLocalStorage();
  });

  // Card click listeners (for incrementing counts)
  document.querySelectorAll('.funnel-card .card-interactive-area').forEach(card => {
    card.addEventListener('click', (e) => {
      const target = card.getAttribute('data-target');
      adjustCounter(target, true);
      
      // Satisfying click effect
      card.parentElement.classList.add('active-pulse');
      setTimeout(() => card.parentElement.classList.remove('active-pulse'), 150);

      // Trigger Confetti on Booking
      if (target === 'booked') {
        triggerConfettiSplash();
      }
    });
  });

  // Decrement button click listeners
  document.querySelectorAll('.btn-decrement').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Avoid triggering card click
      const target = btn.getAttribute('data-target');
      adjustCounter(target, false);
    });
  });

  // Reset current session button
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset current session counters? This cannot be undone.')) {
      state.activeSession.total = 0;
      state.activeSession.picked = 0;
      state.activeSession.pitched = 0;
      state.activeSession.rejected = 0;
      state.activeSession.booked = 0;
      state.activeSession.name = '';
      document.getElementById('session-name').value = '';
      resetTimer();
      saveToLocalStorage();
      updateUI();
    }
  });

  // Save session button
  document.getElementById('btn-save').addEventListener('click', () => {
    saveSession();
  });

  // Export history button
  document.getElementById('btn-export').addEventListener('click', () => {
    exportHistory();
  });

  // Clear all history
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('CAUTION: This will permanently delete ALL past call records. Do you want to proceed?')) {
      state.history = [];
      saveToLocalStorage();
      updateUI();
      renderCharts();
    }
  });

  // Chart type toggles
  document.getElementById('btn-chart-dials').addEventListener('click', (e) => {
    toggleChartType('dials', e.target);
  });
  document.getElementById('btn-chart-funnel').addEventListener('click', (e) => {
    toggleChartType('bookings', e.target);
  });

  // Search History Input
  document.getElementById('history-search').addEventListener('input', () => {
    renderHistoryTable();
  });

  // Filter History Select Range
  document.getElementById('history-filter-range').addEventListener('change', () => {
    renderHistoryTable();
  });
}

// -------------------------------------------------------------------------- //
//                       CASCADING FUNNEL COUNTER LOGIC                       //
// -------------------------------------------------------------------------- //

function adjustCounter(stage, isIncrement) {
  if (isIncrement) {
    state.activeSession[stage]++;

    // Cascade validations upwards to keep the funnel mathematically sound:
    // Dials >= Connects >= Pitched >= (Booked + Not Interested)
    if (stage === 'booked' || stage === 'rejected') {
      const neededPitched = state.activeSession.booked + state.activeSession.rejected;
      if (state.activeSession.pitched < neededPitched) {
        state.activeSession.pitched = neededPitched;
      }
    }
    if (state.activeSession.picked < state.activeSession.pitched) {
      state.activeSession.picked = state.activeSession.pitched;
    }
    if (state.activeSession.total < state.activeSession.picked) {
      state.activeSession.total = state.activeSession.picked;
    }
  } else {
    // Decrement
    if (state.activeSession[stage] > 0) {
      state.activeSession[stage]--;

      // Cascade validation downwards to maintain funnel structure:
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
          // Reduce rejected first, then booked to fit inside pitches
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
//                            UI RENDER / REFRESH                             //
// -------------------------------------------------------------------------- //

function updateUI() {
  const active = state.activeSession;

  // 1. Current Counter Displays
  document.getElementById('count-total').textContent = active.total;
  document.getElementById('count-picked').textContent = active.picked;
  document.getElementById('count-pitched').textContent = active.pitched;
  document.getElementById('count-rejected').textContent = active.rejected;
  document.getElementById('count-booked').textContent = active.booked;

  // 2. Conversion Percentages on Active Cards
  const connectRate = active.total > 0 ? Math.round((active.picked / active.total) * 100) : 0;
  const pitchRate = active.picked > 0 ? Math.round((active.pitched / active.picked) * 100) : 0;
  const rejectRate = active.pitched > 0 ? Math.round((active.rejected / active.pitched) * 100) : 0;
  const bookRate = active.pitched > 0 ? Math.round((active.booked / active.pitched) * 100) : 0;
  const overallBookRate = active.total > 0 ? Math.round((active.booked / active.total) * 100) : 0;

  document.getElementById('pct-picked').textContent = `${connectRate}% Connect Rate`;
  document.getElementById('pct-pitched-connect').textContent = `${pitchRate}% of Connects`;
  document.getElementById('pct-rejected').textContent = `${rejectRate}% of Pitched`;
  document.getElementById('pct-booked').textContent = `${overallBookRate}% Overall Rate`;

  // 3. Visual Funnel Levels Update
  document.getElementById('funnel-val-total').textContent = active.total;
  document.getElementById('funnel-val-picked').textContent = active.picked;
  document.getElementById('funnel-val-pitched').textContent = active.pitched;
  document.getElementById('funnel-val-booked').textContent = active.booked;

  // Calculate funnel fills
  const connectFunnelPct = active.total > 0 ? (active.picked / active.total) * 100 : 0;
  const pitchFunnelPct = active.total > 0 ? (active.pitched / active.total) * 100 : 0;
  const bookFunnelPct = active.total > 0 ? (active.booked / active.total) * 100 : 0;

  // Set widths of level fillers
  document.querySelector('#funnel-lvl-total .funnel-fill').style.width = active.total > 0 ? '100%' : '0%';
  document.querySelector('#funnel-lvl-picked .funnel-fill').style.width = `${connectFunnelPct}%`;
  document.querySelector('#funnel-lvl-pitched .funnel-fill').style.width = `${pitchFunnelPct}%`;
  document.querySelector('#funnel-lvl-booked .funnel-fill').style.width = `${bookFunnelPct}%`;

  document.getElementById('funnel-pct-picked').textContent = `${connectRate}%`;
  document.getElementById('funnel-pct-pitched').textContent = `${active.total > 0 ? Math.round(pitchFunnelPct) : 0}%`;
  document.getElementById('funnel-pct-booked').textContent = `${active.total > 0 ? Math.round(bookFunnelPct) : 0}%`;

  // 4. Global Stats Calculations (Aggregate over history)
  let totalDials = 0;
  let totalBooked = 0;
  let totalPicked = 0;

  state.history.forEach(log => {
    totalDials += log.total;
    totalBooked += log.booked;
    totalPicked += log.picked;
  });

  const globalConnectRate = totalDials > 0 ? Math.round((totalPicked / totalDials) * 100) : 0;
  const globalBookingRate = totalDials > 0 ? Math.round((totalBooked / totalDials) * 100) : 0;

  document.getElementById('global-total-dials').textContent = totalDials;
  document.getElementById('global-bookings').textContent = totalBooked;
  document.getElementById('global-connect-rate').textContent = `${globalConnectRate}%`;
  document.getElementById('global-booking-rate').textContent = `${globalBookingRate}%`;

  // 5. Render History Logs
  renderHistoryTable();
}

// -------------------------------------------------------------------------- //
//                           SAVE & LOG CURRENT SESSION                       //
// -------------------------------------------------------------------------- //

function saveSession() {
  const active = state.activeSession;

  if (active.total === 0) {
    alert('Cannot save an empty session. Increment some cards first!');
    return;
  }

  // Create a new history entry
  const sessionLabel = active.name.trim() || `Calling Session #${state.history.length + 1}`;
  const newLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    name: sessionLabel,
    total: active.total,
    picked: active.picked,
    pitched: active.pitched,
    rejected: active.rejected,
    booked: active.booked
  };

  // Add to start of history
  state.history.unshift(newLog);

  // Auto-prune logs older than 1 year
  pruneOldLogs();

  // Reset active session counters
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
  renderCharts();
  
  alert('Session saved to history successfully!');
}

function deleteHistoryRow(id) {
  if (confirm('Are you sure you want to delete this historical log entry?')) {
    state.history = state.history.filter(log => log.id !== id);
    saveToLocalStorage();
    updateUI();
    renderCharts();
  }
}

// -------------------------------------------------------------------------- //
//                       HISTORY TABLE RENDERING & FILTERS                    //
// -------------------------------------------------------------------------- //

function renderHistoryTable() {
  const tableBody = document.getElementById('history-table-body');
  const searchVal = document.getElementById('history-search').value.toLowerCase().trim();
  const rangeVal = document.getElementById('history-filter-range').value;

  // Clear existing body
  tableBody.innerHTML = '';

  // Filter logs
  let filteredLogs = state.history;

  // Filter 1: Range
  const now = new Date();
  if (rangeVal === 'today') {
    filteredLogs = filteredLogs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate.toDateString() === now.toDateString();
    });
  } else if (rangeVal === 'week') {
    const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    filteredLogs = filteredLogs.filter(log => new Date(log.timestamp).getTime() >= sevenDaysAgo);
  } else if (rangeVal === 'month') {
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    filteredLogs = filteredLogs.filter(log => new Date(log.timestamp).getTime() >= thirtyDaysAgo);
  }

  // Filter 2: Search Query
  if (searchVal !== '') {
    filteredLogs = filteredLogs.filter(log => {
      const formattedDate = new Date(log.timestamp).toLocaleDateString();
      return log.name.toLowerCase().includes(searchVal) || formattedDate.includes(searchVal);
    });
  }

  // Handle Empty State
  if (filteredLogs.length === 0) {
    tableBody.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="9" class="text-center">
          <div class="table-empty-state">
            <i data-lucide="folder-open"></i>
            <p>${state.history.length === 0 ? 'No historical call data found. Complete a session and click save!' : 'No entries match your search/filter.'}</p>
          </div>
        </td>
      </tr>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  // Populate Table Rows
  filteredLogs.forEach(log => {
    const date = new Date(log.timestamp);
    const dateFormatted = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeFormatted = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const bookingPct = log.total > 0 ? Math.round((log.booked / log.total) * 100) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="white-space: nowrap;">
        <strong>${dateFormatted}</strong><br>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${timeFormatted}</span>
      </td>
      <td>
        <span class="session-log-name">${escapeHTML(log.name)}</span>
      </td>
      <td class="text-center info-color" style="font-weight: 600;">${log.total}</td>
      <td class="text-center" style="color: var(--color-primary); font-weight: 600;">${log.picked}</td>
      <td class="text-center warning-color" style="font-weight: 600;">${log.pitched}</td>
      <td class="text-center error-color" style="font-weight: 600;">${log.rejected}</td>
      <td class="text-center success-color" style="font-weight: 700;">${log.booked}</td>
      <td class="text-center font-display" style="font-weight: 700; color: #fff;">
        <span class="${bookingPct >= 10 ? 'success-color' : ''}">${bookingPct}%</span>
      </td>
      <td class="text-right">
        <button class="btn-delete-row" data-id="${log.id}" title="Delete session log">
          <i data-lucide="trash"></i>
        </button>
      </td>
    `;

    // Append to body
    tableBody.appendChild(tr);
  });

  // Re-bind delete buttons
  tableBody.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteHistoryRow(id);
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
//                          CHART RENDERING (CHART.JS)                         //
// -------------------------------------------------------------------------- //

function toggleChartType(type, element) {
  state.currentChartType = type;
  document.querySelectorAll('.chart-toggles .btn').forEach(btn => btn.classList.remove('active'));
  element.classList.add('active');
  renderCharts();
}

function renderCharts() {
  const ctx = document.getElementById('analytics-chart').getContext('2d');
  const emptyOverlay = document.getElementById('chart-no-data');

  // Handle Chart instance deletion
  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }

  // Display empty state overlay if no saved history exists
  if (state.history.length === 0) {
    emptyOverlay.classList.add('show');
    return;
  } else {
    emptyOverlay.classList.remove('show');
  }

  // Max 10 recent sessions for clean display, reversed to go chronological (left to right)
  const recentLogs = [...state.history].slice(0, 10).reverse();
  const labels = recentLogs.map(log => {
    const d = new Date(log.timestamp);
    return `${d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} (${log.name.substring(0, 10)}...)`;
  });

  if (state.currentChartType === 'dials') {
    // DIALS TREND CHART (Line)
    const dialsData = recentLogs.map(log => log.total);
    const connectsData = recentLogs.map(log => log.picked);

    state.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Total Dials',
            data: dialsData,
            borderColor: '#00b0ff',
            backgroundColor: 'rgba(0, 176, 255, 0.05)',
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#00b0ff',
            pointRadius: 4
          },
          {
            label: 'Total Connections',
            data: connectsData,
            borderColor: '#7c4dff',
            backgroundColor: 'rgba(124, 77, 255, 0.05)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#7c4dff',
            pointRadius: 3
          }
        ]
      },
      options: getCommonChartOptions('Session Activity History')
    });
  } else {
    // CONVERSIONS HISTOGRAM (Stacked Bar)
    const bookedData = recentLogs.map(log => log.booked);
    const rejectedData = recentLogs.map(log => log.rejected);

    state.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Calls Booked',
            data: bookedData,
            backgroundColor: 'rgba(0, 230, 118, 0.8)',
            borderColor: '#00e676',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Not Interested',
            data: rejectedData,
            backgroundColor: 'rgba(255, 23, 68, 0.7)',
            borderColor: '#ff1744',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        ...getCommonChartOptions('Session Conversion Distribution'),
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#8c9bb4', font: { size: 9 } }
          },
          y: {
            stacked: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#8c9bb4', stepSize: 2 }
          }
        }
      }
    });
  }
}

function getCommonChartOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#8c9bb4',
          font: { family: 'Inter', size: 10, weight: 600 }
        }
      },
      tooltip: {
        backgroundColor: '#0a0e28',
        titleFont: { family: 'Outfit', weight: 'bold' },
        bodyFont: { family: 'Inter' },
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)'
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#8c9bb4', font: { size: 9 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#8c9bb4' }
      }
    }
  };
}

// -------------------------------------------------------------------------- //
//                          CSV / JSON HISTORY EXPORT                         //
// -------------------------------------------------------------------------- //

function exportHistory() {
  if (state.history.length === 0) {
    alert('No logs available to export.');
    return;
  }

  // Format historical data as CSV
  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Timestamp,Session Label,Total Dials,Connects,Pitched,Not Interested,Booked,Booking Rate %\n';

  state.history.forEach(log => {
    const date = new Date(log.timestamp).toLocaleString();
    const rate = log.total > 0 ? Math.round((log.booked / log.total) * 100) : 0;
    
    // Escape quotes in name
    const nameEscaped = `"${log.name.replace(/"/g, '""')}"`;
    
    csvContent += `${date},${nameEscaped},${log.total},${log.picked},${log.pitched},${log.rejected},${log.booked},${rate}%\n`;
  });

  // Trigger browser download link
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `appoint_funnels_history_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// -------------------------------------------------------------------------- //
//                         LIGHTWEIGHT PARTICLE CONFETTI                      //
// -------------------------------------------------------------------------- //

function triggerConfettiSplash() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#00e676', '#7c4dff', '#00b0ff', '#ffd600', '#ff2d55', '#ffffff'];

  // Initialize 100 floating shapes
  for (let i = 0; i < 100; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 100,
      y: canvas.height * 0.7 + (Math.random() - 0.5) * 50,
      radius: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 15,
      vy: -Math.random() * 15 - 10,
      gravity: 0.35,
      alpha: 1,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let activeParticlesCount = 0;

    particles.forEach(p => {
      if (p.alpha > 0) {
        activeParticlesCount++;
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.015;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        // Render paper confetti strips
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

    if (activeParticlesCount > 0) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  animate();
}

// Window resizing handler for confetti canvas sizing
window.addEventListener('resize', () => {
  const canvas = document.getElementById('confetti-canvas');
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
});
