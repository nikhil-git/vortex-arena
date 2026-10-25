/**
 * Vortex Arena - Operations & Analytics Dashboard Controller
 * Modern, responsive, real-time analytics client backed by live server APIs.
 */

(function () {
  'use strict';

  class AnalyticsDashboard {
    constructor() {
      this.token = sessionStorage.getItem('vortex_admin_token') || null;
      this.currentSection = 'overview';
      this.currentPeriod = '7d';
      this.customStart = null;
      this.customEnd = null;
      this.refreshIntervalMs = 30000;
      this.refreshTimer = null;
      this.isFetching = false;

      // In-memory cache of fetched reports
      this.data = {
        overview: null,
        traffic: null,
        downloads: null,
        engagement: null,
        performance: null,
        errors: null,
        live: null
      };

      this.init();
    }

    init() {
      this.bindAuthEvents();
      this.bindNavigation();
      this.bindControls();

      if (this.token) {
        this.hideAuthModal();
        this.loadDashboardData();
        this.setupAutoRefresh();
      } else {
        this.showAuthModal();
      }
    }

    // =======================================================================
    // AUTHENTICATION & SECURITY
    // =======================================================================

    bindAuthEvents() {
      const authForm = document.getElementById('auth-form');
      const authInput = document.getElementById('admin-key-input');
      const authError = document.getElementById('auth-error-msg');
      const lockBtn = document.getElementById('admin-lock-btn');

      if (authForm) {
        authForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const key = (authInput.value || '').trim();
          if (!key) return;

          try {
            const res = await fetch('/api/analytics/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key })
            });

            const data = await res.json();
            if (res.ok && data.token) {
              this.token = data.token;
              sessionStorage.setItem('vortex_admin_token', this.token);
              authError.style.display = 'none';
              this.hideAuthModal();
              this.loadDashboardData();
              this.setupAutoRefresh();
            } else {
              authError.textContent = data.error || 'Invalid admin key';
              authError.style.display = 'block';
            }
          } catch (err) {
            authError.textContent = 'Connection error. Check server status.';
            authError.style.display = 'block';
          }
        });
      }

      if (lockBtn) {
        lockBtn.addEventListener('click', () => {
          this.token = null;
          sessionStorage.removeItem('vortex_admin_token');
          if (this.refreshTimer) clearInterval(this.refreshTimer);
          this.showAuthModal();
        });
      }
    }

    showAuthModal() {
      const modal = document.getElementById('auth-modal');
      if (modal) modal.style.display = 'flex';
      const input = document.getElementById('admin-key-input');
      if (input) {
        input.value = '';
        input.focus();
      }
    }

    hideAuthModal() {
      const modal = document.getElementById('auth-modal');
      if (modal) modal.style.display = 'none';
    }

    async fetchApi(endpoint) {
      if (!this.token) {
        this.showAuthModal();
        throw new Error('Unauthorized');
      }

      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.status === 401 || res.status === 403) {
        this.token = null;
        sessionStorage.removeItem('vortex_admin_token');
        this.showAuthModal();
        throw new Error('Session expired');
      }

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      return res.json();
    }

    // =======================================================================
    // NAVIGATION & SECTIONS
    // =======================================================================

    bindNavigation() {
      const navItems = document.querySelectorAll('.nav-item');
      navItems.forEach((item) => {
        item.addEventListener('click', () => {
          const section = item.dataset.section;
          if (!section) return;
          this.switchSection(section);
        });
      });
    }

    switchSection(sectionName) {
      this.currentSection = sectionName;

      // Update active nav item
      document.querySelectorAll('.nav-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.section === sectionName);
      });

      // Update active section container
      document.querySelectorAll('.dashboard-section').forEach((sec) => {
        sec.classList.remove('active');
      });
      const targetSec = document.getElementById(`section-${sectionName}`);
      if (targetSec) targetSec.classList.add('active');

      // Refresh section rendering
      this.renderCurrentSection();
    }

    // =======================================================================
    // CONTROLS: DATE RANGE, REFRESH & CSV EXPORT
    // =======================================================================

    bindControls() {
      // Date pills
      const datePills = document.querySelectorAll('.date-pill');
      datePills.forEach((pill) => {
        pill.addEventListener('click', () => {
          const period = pill.dataset.period;
          if (period === 'custom') {
            document.getElementById('custom-date-modal').style.display = 'flex';
            return;
          }

          datePills.forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentPeriod = period;
          this.customStart = null;
          this.customEnd = null;
          this.loadDashboardData();
        });
      });

      // Custom date modal
      const applyCustomBtn = document.getElementById('apply-custom-date-btn');
      if (applyCustomBtn) {
        applyCustomBtn.addEventListener('click', () => {
          const startVal = document.getElementById('custom-start-input').value;
          const endVal = document.getElementById('custom-end-input').value;
          if (!startVal || !endVal) return;

          this.customStart = startVal + ' 00:00:00';
          this.customEnd = endVal + ' 23:59:59';
          this.currentPeriod = 'custom';

          document.querySelectorAll('.date-pill').forEach((p) => p.classList.remove('active'));
          document.getElementById('custom-date-btn').classList.add('active');
          document.getElementById('custom-date-modal').style.display = 'none';

          this.loadDashboardData();
        });
      }

      // Manual Refresh button
      const refreshBtn = document.getElementById('refresh-now-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          const icon = document.getElementById('refresh-icon');
          if (icon) icon.style.transform = 'rotate(360deg)';
          setTimeout(() => { if (icon) icon.style.transform = ''; }, 600);
          this.loadDashboardData();
        });
      }

      // Auto Refresh interval selector
      const refreshSelect = document.getElementById('auto-refresh-select');
      if (refreshSelect) {
        refreshSelect.addEventListener('change', () => {
          this.refreshIntervalMs = parseInt(refreshSelect.value, 10);
          this.setupAutoRefresh();
        });
      }

      // CSV Export
      const exportSelect = document.getElementById('export-csv-select');
      if (exportSelect) {
        exportSelect.addEventListener('change', () => {
          const reportType = exportSelect.value;
          exportSelect.value = ''; // reset dropdown
          if (reportType) this.downloadCsvReport(reportType);
        });
      }
    }

    setupAutoRefresh() {
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      if (this.refreshIntervalMs > 0) {
        this.refreshTimer = setInterval(() => {
          this.loadDashboardData(true);
        }, this.refreshIntervalMs);
      }
    }

    async downloadCsvReport(reportType) {
      if (!this.token) return;
      let url = `/api/analytics/export/csv?type=${encodeURIComponent(reportType)}&period=${encodeURIComponent(this.currentPeriod)}`;
      if (this.customStart && this.customEnd) {
        url += `&customStart=${encodeURIComponent(this.customStart)}&customEnd=${encodeURIComponent(this.customEnd)}`;
      }

      try {
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `vortex_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (e) {
        alert('Failed to export CSV report: ' + e.message);
      }
    }

    // =======================================================================
    // DATA FETCHING ORCHESTRATION
    // =======================================================================

    async loadDashboardData(isBackground = false) {
      if (this.isFetching) return;
      this.isFetching = true;

      const query = `?period=${encodeURIComponent(this.currentPeriod)}` +
        (this.customStart && this.customEnd ? `&customStart=${encodeURIComponent(this.customStart)}&customEnd=${encodeURIComponent(this.customEnd)}` : '');

      try {
        // Parallel fetch for active and core metrics
        const [overviewRes, trafficRes, downloadsRes, engagementRes, perfRes, errorsRes, liveRes] = await Promise.allSettled([
          this.fetchApi(`/api/analytics/overview${query}`),
          this.fetchApi(`/api/analytics/traffic${query}`),
          this.fetchApi(`/api/analytics/downloads${query}`),
          this.fetchApi(`/api/analytics/engagement${query}`),
          this.fetchApi(`/api/analytics/performance${query}`),
          this.fetchApi(`/api/analytics/errors${query}`),
          this.fetchApi(`/api/analytics/live`)
        ]);

        if (overviewRes.status === 'fulfilled') this.data.overview = overviewRes.value;
        if (trafficRes.status === 'fulfilled') this.data.traffic = trafficRes.value;
        if (downloadsRes.status === 'fulfilled') this.data.downloads = downloadsRes.value;
        if (engagementRes.status === 'fulfilled') this.data.engagement = engagementRes.value;
        if (perfRes.status === 'fulfilled') this.data.performance = perfRes.value;
        if (errorsRes.status === 'fulfilled') this.data.errors = errorsRes.value;
        if (liveRes.status === 'fulfilled') this.data.live = liveRes.value;

        this.renderLivePulse();
        this.renderCurrentSection();

        const timeStr = new Date().toLocaleTimeString();
        const updatedEl = document.getElementById('last-updated-text');
        if (updatedEl) updatedEl.textContent = `Updated: ${timeStr}`;
      } catch (err) {
        console.error('Error fetching dashboard reports:', err);
      } finally {
        this.isFetching = false;
      }
    }

    // =======================================================================
    // RENDERING DISPATCHER
    // =======================================================================

    renderLivePulse() {
      const live = this.data.live || (this.data.overview && this.data.overview.livePulse);
      if (!live) return;

      this.setVal('live-combatants', live.totalCombatants || 0);
      this.setVal('live-rooms', live.activeMatches || 0);
      this.setVal('live-sockets', live.wsConnected || 0);
      this.setVal('live-ping', `${live.ping ? live.ping.median : 0} ms`);
      this.setVal('live-tick', `${live.serverTickRate || 30} Hz`);
      
      const hours = Math.floor((live.serverUptimeSeconds || 0) / 3600);
      const mins = Math.floor(((live.serverUptimeSeconds || 0) % 3600) / 60);
      this.setVal('live-uptime', `${hours}h ${mins}m`);
    }

    renderCurrentSection() {
      switch (this.currentSection) {
        case 'overview':
          this.renderOverview();
          break;
        case 'traffic':
          this.renderTraffic();
          break;
        case 'downloads':
          this.renderDownloads();
          break;
        case 'engagement':
          this.renderEngagement();
          break;
        case 'performance':
          this.renderPerformance();
          break;
        case 'errors':
          this.renderErrors();
          break;
      }
    }

    // =======================================================================
    // 1. OVERVIEW SECTION RENDERER
    // =======================================================================

    renderOverview() {
      const overview = this.data.overview;
      if (!overview || !overview.kpis) return;

      const kpis = overview.kpis;
      this.setVal('kpi-total-visits', (kpis.totalVisits.value || 0).toLocaleString());
      this.setTrend('kpi-total-visits-trend', kpis.totalVisits.change);

      this.setVal('kpi-unique-visitors', (kpis.uniqueVisitors.value || 0).toLocaleString());
      this.setTrend('kpi-unique-visitors-trend', kpis.uniqueVisitors.change);

      this.setVal('kpi-game-launches', (kpis.gameLaunches.value || 0).toLocaleString());
      this.setTrend('kpi-game-launches-trend', kpis.gameLaunches.change);

      this.setVal('kpi-conv-rate', kpis.conversionRate.value || '0.0%');
      this.setTrend('kpi-conv-rate-trend', kpis.conversionRate.change);

      this.setVal('kpi-apk-downloads', (kpis.apkDownloads.value || 0).toLocaleString());
      this.setTrend('kpi-apk-downloads-trend', kpis.apkDownloads.change);

      this.setVal('kpi-total-sessions', (kpis.totalSessions.value || 0).toLocaleString());
      this.setTrend('kpi-total-sessions-trend', kpis.totalSessions.change);

      this.setVal('kpi-active-combatants', (kpis.activeCombatants.value || 0).toLocaleString());

      this.setVal('kpi-system-errors', (kpis.systemErrors.value || 0).toLocaleString());
      this.setTrend('kpi-system-errors-trend', kpis.systemErrors.change, true); // true = inverted trend (down is good)

      // Render Overview Multi-Series Timeline Chart
      const trend = overview.trend || [];
      const labels = trend.map(t => t.time_bucket ? t.time_bucket.slice(5) : '');
      const series = [
        { label: 'Visits', color: '#00f0ff', values: trend.map(t => t.visits || 0) },
        { label: 'Game Launches', color: '#00ff88', values: trend.map(t => t.game_launches || 0) },
        { label: 'APK Downloads', color: '#ffaa00', values: trend.map(t => t.apk_downloads || 0) }
      ];

      this.renderLineChart('overview-chart-canvas', labels, series);
    }

    // =======================================================================
    // 2. WEBSITE TRAFFIC SECTION RENDERER
    // =======================================================================

    renderTraffic() {
      const traffic = this.data.traffic;
      if (!traffic) return;

      // Time series chart
      const ts = traffic.timeSeries || [];
      const labels = ts.map(r => r.bucket ? r.bucket.slice(5) : '');
      const series = [
        { label: 'Sessions', color: '#00f0ff', values: ts.map(r => r.sessions || 0) },
        { label: 'Page Views', color: '#a855f7', values: ts.map(r => r.page_views || 0) },
        { label: 'Game Launches', color: '#00ff88', values: ts.map(r => r.game_launches || 0) }
      ];
      this.renderLineChart('traffic-chart-canvas', labels, series);

      // Top pages table
      const pagesTbody = document.getElementById('top-pages-tbody');
      if (pagesTbody) {
        const pages = traffic.topPages || [];
        pagesTbody.innerHTML = pages.length === 0
          ? '<tr><td colspan="2" style="text-align:center; color: var(--text-dark);">No page view events recorded yet.</td></tr>'
          : pages.map(p => `
              <tr>
                <td style="font-family: monospace; color: var(--cyan);">${this.escapeHtml(p.page_path)}</td>
                <td style="text-align: right; font-weight: 700;">${p.views.toLocaleString()}</td>
              </tr>
            `).join('');
      }

      // Referrers table
      const refTbody = document.getElementById('referrers-tbody');
      if (refTbody) {
        const referrers = traffic.referrers || [];
        refTbody.innerHTML = referrers.length === 0
          ? '<tr><td colspan="2" style="text-align:center; color: var(--text-dark);">Direct visits / No external referrers.</td></tr>'
          : referrers.map(r => `
              <tr>
                <td>${this.escapeHtml(r.source_host)}</td>
                <td style="text-align: right; font-weight: 700;">${r.session_count.toLocaleString()}</td>
              </tr>
            `).join('');
      }

      // Devices table
      const devTbody = document.getElementById('devices-tbody');
      if (devTbody) {
        const devices = traffic.devices || [];
        devTbody.innerHTML = devices.map(d => `
          <tr>
            <td><span class="badge badge-cyan">${this.escapeHtml(d.device_category)}</span></td>
            <td style="text-align: right; font-weight: 700;">${d.count.toLocaleString()}</td>
          </tr>
        `).join('') || '<tr><td colspan="2">No data</td></tr>';
      }

      // Browsers table
      const browTbody = document.getElementById('browsers-tbody');
      if (browTbody) {
        const browsers = traffic.browsers || [];
        browTbody.innerHTML = browsers.map(b => `
          <tr>
            <td>${this.escapeHtml(b.browser)}</td>
            <td style="text-align: right; font-weight: 700;">${b.count.toLocaleString()}</td>
          </tr>
        `).join('') || '<tr><td colspan="2">No data</td></tr>';
      }

      // OS table
      const osTbody = document.getElementById('os-tbody');
      if (osTbody) {
        const oss = traffic.operatingSystems || [];
        osTbody.innerHTML = oss.map(o => `
          <tr>
            <td>${this.escapeHtml(o.os)}</td>
            <td style="text-align: right; font-weight: 700;">${o.count.toLocaleString()}</td>
          </tr>
        `).join('') || '<tr><td colspan="2">No data</td></tr>';
      }
    }

    // =======================================================================
    // 3. APK DOWNLOADS SECTION RENDERER
    // =======================================================================

    renderDownloads() {
      const dl = this.data.downloads;
      if (!dl) return;

      const kpis = dl.kpis || {};
      this.setVal('kpi-dl-clicks', (kpis.totalClicks || 0).toLocaleString());
      this.setVal('kpi-dl-served', (kpis.totalServed || 0).toLocaleString());
      this.setVal('kpi-dl-unique', (kpis.uniqueDownloaders || 0).toLocaleString());
      this.setVal('kpi-dl-conv', kpis.visitorConversionRate || '0.00%');

      // Downloads timeline chart
      const timeline = dl.downloadsTimeline || [];
      const labels = timeline.map(t => t.time_bucket ? t.time_bucket.slice(5) : '');
      const series = [
        { label: 'Clicks (Intent)', color: '#00f0ff', values: timeline.map(t => t.clicks || 0) },
        { label: 'Completed (Fulfillment)', color: '#00ff88', values: timeline.map(t => t.successful_downloads || 0) },
        { label: 'Failed / Aborted', color: '#ff3366', values: timeline.map(t => t.failed_downloads || 0) }
      ];
      this.renderLineChart('downloads-chart-canvas', labels, series);

      // UI placement source table
      const srcTbody = document.getElementById('dl-sources-tbody');
      if (srcTbody) {
        const sources = dl.sourceBreakdown || [];
        srcTbody.innerHTML = sources.map(s => `
          <tr>
            <td><span class="badge badge-cyan">${this.escapeHtml(s.source)}</span></td>
            <td style="text-align: right; font-weight: 700;">${(s.served_count || 0).toLocaleString()}</td>
          </tr>
        `).join('') || '<tr><td colspan="2" style="text-align:center; color: var(--text-dark);">No download events recorded.</td></tr>';
      }

      // Physical File Status
      const file = dl.fileHealth || {};
      this.setVal('file-name', file.path || 'VortexArena.apk');
      this.setVal('file-status', file.status || 'Checking...');
      this.setVal('file-size', `${file.sizeMb || '0.00'} MB (${(file.sizeBytes || 0).toLocaleString()} bytes)`);
      this.setVal('file-modified', file.lastModified ? new Date(file.lastModified).toLocaleString() : 'N/A');

      // Recent Downloads Audit Log
      const recentTbody = document.getElementById('recent-downloads-tbody');
      if (recentTbody) {
        const recent = dl.recentDownloads || [];
        recentTbody.innerHTML = recent.map(r => {
          const badgeClass = r.status === 'served' ? 'badge-green' : (r.status === 'clicked' ? 'badge-cyan' : 'badge-red');
          return `
            <tr>
              <td>${new Date(r.created_at).toLocaleString()}</td>
              <td>${this.escapeHtml(r.version || '1.0.0')}</td>
              <td><span class="badge badge-cyan">${this.escapeHtml(r.source || 'direct')}</span></td>
              <td><span class="badge ${badgeClass}">${this.escapeHtml(r.status)}</span></td>
              <td style="font-family: monospace;">${((r.bytes_sent || 0) / 1024 / 1024).toFixed(2)} MB</td>
              <td>${this.escapeHtml(r.device_category || 'mobile')}</td>
            </tr>
          `;
        }).join('') || '<tr><td colspan="6" style="text-align:center; color: var(--text-dark);">No download attempts yet.</td></tr>';
      }
    }

    // =======================================================================
    // 4. PLAYER ENGAGEMENT & RETENTION SECTION RENDERER
    // =======================================================================

    renderEngagement() {
      const eng = this.data.engagement;
      if (!eng) return;

      const kpis = eng.kpis || {};
      this.setVal('kpi-eng-dau', (kpis.dau || 0).toLocaleString());
      this.setVal('kpi-eng-wau', (kpis.wau || 0).toLocaleString());
      this.setVal('kpi-eng-mau', (kpis.mau || 0).toLocaleString());
      this.setVal('kpi-eng-stickiness', kpis.stickinessRatio || '0.0%');

      const avgDur = kpis.avgSessionDurationSec || 0;
      this.setVal('kpi-eng-avg-dur', `${Math.floor(avgDur / 60)}m ${avgDur % 60}s`);

      const medDur = kpis.medianSessionDurationSec || 0;
      this.setVal('kpi-eng-med-dur', `${Math.floor(medDur / 60)}m ${medDur % 60}s`);

      this.setVal('kpi-eng-matches-completed', (kpis.matchesCompleted || 0).toLocaleString());
      this.setVal('kpi-eng-abandonment', kpis.abandonmentRate || '0.0%');

      // DAU timeline chart
      const dauRows = eng.dauTimeline || [];
      const labels = dauRows.map(r => r.day ? r.day.slice(5) : '');
      const series = [
        { label: 'Daily Active Users (DAU)', color: '#00f0ff', values: dauRows.map(r => r.dau || 0) }
      ];
      this.renderLineChart('dau-chart-canvas', labels, series);

      // Retention Cohorts Table
      const cohortsTbody = document.getElementById('cohorts-tbody');
      if (cohortsTbody) {
        const cohorts = eng.retentionCohorts || [];
        cohortsTbody.innerHTML = cohorts.map(c => `
          <tr>
            <td><strong>${this.escapeHtml(c.cohortWeek)}</strong></td>
            <td>${this.escapeHtml(c.startDate)}</td>
            <td style="font-weight: 700;">${c.cohortSize.toLocaleString()}</td>
            <td><span class="badge badge-cyan">${c.day1Retention}</span></td>
            <td><span class="badge badge-green">${c.day7Retention}</span></td>
            <td><span class="badge badge-amber">${c.day28Retention}</span></td>
          </tr>
        `).join('') || '<tr><td colspan="6" style="text-align:center; color: var(--text-dark);">Insufficient historical data for retention cohorts.</td></tr>';
      }

      // User Type Split Table
      const userSplitTbody = document.getElementById('user-split-tbody');
      if (userSplitTbody) {
        const split = eng.userTypeSplit || [];
        userSplitTbody.innerHTML = split.map(u => `
          <tr>
            <td><span class="badge ${u.user_type === 'guest' ? 'badge-amber' : (u.user_type === 'registered' ? 'badge-green' : 'badge-cyan')}">${this.escapeHtml(u.user_type)}</span></td>
            <td style="font-weight: 700;">${(u.sessions || 0).toLocaleString()}</td>
            <td>${(u.game_launches || 0).toLocaleString()}</td>
            <td>${(u.matches_played || 0).toLocaleString()}</td>
            <td>${Math.round(u.avg_duration_sec || 0)}s</td>
          </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center; color: var(--text-dark);">No active session splits yet.</td></tr>';
      }
    }

    // =======================================================================
    // 5. MULTIPLAYER PERFORMANCE SECTION RENDERER
    // =======================================================================

    renderPerformance() {
      const perf = this.data.performance;
      if (!perf) return;

      const kpis = perf.kpis || {};
      this.setVal('kpi-perf-peak', (kpis.peakConcurrentPlayers || 0).toLocaleString());
      this.setVal('kpi-perf-sockets', (kpis.currentConnectedSockets || 0).toLocaleString());
      this.setVal('kpi-perf-med-ping', `${perf.latencyDistribution ? perf.latencyDistribution.median : 0} ms`);
      this.setVal('kpi-perf-p95-ping', `${perf.latencyDistribution ? perf.latencyDistribution.p95 : 0} ms`);
      this.setVal('kpi-perf-tick', kpis.serverTickRate || '30 Hz');
      this.setVal('kpi-perf-tick-dur', kpis.avgTickDuration || '0 ms');
      this.setVal('kpi-perf-memory', kpis.memoryRss || '0 MB');
      this.setVal('kpi-perf-connects', (kpis.wsConnects || 0).toLocaleString());

      // Historical snapshots timeline chart
      const timeline = perf.timeline || [];
      const labels = timeline.map(r => r.time_bucket ? r.time_bucket.slice(11) : '');
      const series = [
        { label: 'Active Players', color: '#00f0ff', values: timeline.map(r => r.avg_players || 0) },
        { label: 'Median Ping (ms)', color: '#ffaa00', values: timeline.map(r => r.avg_ping_median || 0) }
      ];
      this.renderLineChart('performance-chart-canvas', labels, series);
    }

    // =======================================================================
    // 6. ERRORS & RELIABILITY SECTION RENDERER
    // =======================================================================

    renderErrors() {
      const errs = this.data.errors;
      if (!errs) return;

      const summary = errs.summary || {};
      this.setVal('kpi-err-total', (summary.totalErrors || 0).toLocaleString());
      this.setVal('kpi-err-rate', summary.errorRate || '0.0%');
      this.setVal('kpi-err-health', summary.healthyScore || '100.0%');

      // Error categories table
      const typesTbody = document.getElementById('error-types-tbody');
      if (typesTbody) {
        const types = errs.byType || [];
        typesTbody.innerHTML = types.map(t => `
          <tr>
            <td><span class="badge badge-red">${this.escapeHtml(t.error_type)}</span></td>
            <td style="text-align: right; font-weight: 700;">${(t.count || 0).toLocaleString()}</td>
          </tr>
        `).join('') || '<tr><td colspan="2" style="text-align:center; color: var(--green);">Zero errors detected in this period! Clean operations.</td></tr>';
      }

      // Recent error log table
      const recentTbody = document.getElementById('recent-errors-tbody');
      if (recentTbody) {
        const recent = errs.recentErrors || [];
        recentTbody.innerHTML = recent.map(r => `
          <tr>
            <td>${new Date(r.created_at).toLocaleTimeString()}</td>
            <td><span class="badge badge-red">${this.escapeHtml(r.error_type)}</span></td>
            <td>${r.status_code || 500}</td>
            <td style="font-family: monospace; color: var(--cyan);">${this.escapeHtml(r.path || '/')}</td>
            <td style="color: #fff; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(r.message)}">
              ${this.escapeHtml(r.message)}
            </td>
          </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center; color: var(--green);">No technical error events recorded.</td></tr>';
      }
    }

    // =======================================================================
    // LIGHTWEIGHT HIGH-PERFORMANCE CANVAS CHART ENGINE
    // =======================================================================

    renderLineChart(canvasId, labels, series) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      ctx.resetTransform();
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;
      const padLeft = 46;
      const padRight = 20;
      const padTop = 20;
      const padBottom = 30;

      const chartW = width - padLeft - padRight;
      const chartH = height - padTop - padBottom;

      ctx.clearRect(0, 0, width, height);

      // Determine max value across all series
      let maxVal = 5;
      for (const s of series) {
        for (const v of s.values) {
          if (v > maxVal) maxVal = v;
        }
      }
      maxVal = Math.ceil(maxVal * 1.15); // headroom

      // Draw Gridlines & Y-Axis labels
      const gridSteps = 4;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#607286';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let i = 0; i <= gridSteps; i++) {
        const yVal = Math.round((maxVal / gridSteps) * (gridSteps - i));
        const yPos = padTop + (chartH / gridSteps) * i;
        ctx.beginPath();
        ctx.moveTo(padLeft, yPos);
        ctx.lineTo(width - padRight, yPos);
        ctx.stroke();
        ctx.fillText(yVal.toLocaleString(), padLeft - 8, yPos);
      }

      if (!labels || labels.length === 0) {
        ctx.fillStyle = '#607286';
        ctx.textAlign = 'center';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.fillText('Awaiting live data in selected time window...', width / 2, height / 2);
        return;
      }

      // X-Axis labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const stepX = chartW / Math.max(1, labels.length - 1);
      const labelSkip = Math.max(1, Math.ceil(labels.length / 8));

      for (let i = 0; i < labels.length; i += labelSkip) {
        const xPos = padLeft + i * stepX;
        ctx.fillText(labels[i], xPos, height - padBottom + 8);
      }

      // Draw Series Lines & Gradients
      for (const s of series) {
        if (!s.values || s.values.length === 0) continue;

        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        const points = [];
        for (let i = 0; i < s.values.length; i++) {
          const x = padLeft + i * stepX;
          const y = padTop + chartH - (s.values[i] / maxVal) * chartH;
          points.push({ x, y });
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Area gradient fill
        const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
        grad.addColorStop(0, s.color + '33'); // 20% opacity
        grad.addColorStop(1, s.color + '00'); // 0% opacity
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(points[0].x, padTop + chartH);
        for (const pt of points) ctx.lineTo(pt.x, pt.y);
        ctx.lineTo(points[points.length - 1].x, padTop + chartH);
        ctx.closePath();
        ctx.fill();

        // Data point dots
        ctx.fillStyle = s.color;
        for (const pt of points) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // =======================================================================
    // DOM UTILITIES
    // =======================================================================

    setVal(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }

    setTrend(id, changeStr, isInverted = false) {
      const el = document.getElementById(id);
      if (!el || !changeStr) return;

      el.textContent = changeStr;
      el.className = 'trend-pill';

      const isPositive = changeStr.startsWith('+');
      const isNeutral = changeStr === '0%' || changeStr === 'real-time';

      if (isNeutral) {
        el.classList.add('trend-neutral');
      } else if (isPositive) {
        el.classList.add(isInverted ? 'trend-down' : 'trend-up');
      } else {
        el.classList.add(isInverted ? 'trend-up' : 'trend-down');
      }
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }

  // Instantiate when DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new AnalyticsDashboard();
  });
})();
