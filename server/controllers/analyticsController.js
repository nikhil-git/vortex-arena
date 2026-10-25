/**
 * Vortex Arena - Analytics API Controller & Admin Authentication
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const analyticsService = require('../services/analyticsService');

class AnalyticsController {
  /**
   * Admin Authentication for Dashboard Access
   */
  login(req, res) {
    try {
      const { key, password } = req.body || {};
      const candidateKey = key || password;

      if (!candidateKey) {
        return res.status(400).json({ error: 'Admin access key required' });
      }

      const expectedKey = config.ADMIN_KEY || 'vortex-admin-2026';
      if (candidateKey !== expectedKey) {
        return res.status(401).json({ error: 'Invalid admin access key' });
      }

      const token = jwt.sign(
        { role: 'admin', authorized: true, timestamp: Date.now() },
        config.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        success: true,
        token,
        role: 'admin',
        message: 'Admin operations authorization granted'
      });
    } catch (err) {
      console.error('[Analytics] Auth error:', err);
      return res.status(500).json({ error: 'Internal server error during auth' });
    }
  }

  /**
   * Verify Admin Token Middleware
   */
  adminMiddleware(req, res, next) {
    // 1. Direct header key bypass for automation or internal curls
    const directKey = req.headers['x-admin-key'];
    if (directKey && directKey === (config.ADMIN_KEY || 'vortex-admin-2026')) {
      req.isAdmin = true;
      return next();
    }

    // 2. Bearer JWT Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Admin access key or token required' });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      if (!decoded || decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
      }
      req.adminUser = decoded;
      req.isAdmin = true;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired admin session token' });
    }
  }

  // =========================================================================
  // PUBLIC INGESTION APIS
  // =========================================================================

  track(req, res) {
    try {
      const {
        type = 'visit',
        visitorId,
        sessionId,
        userId,
        userType,
        path,
        referrer,
        screenResolution,
        category,
        eventName,
        data
      } = req.body || {};

      const userAgent = req.headers['user-agent'] || '';

      if (type === 'visit' || (!category && !eventName)) {
        analyticsService.recordVisit({
          visitorId,
          sessionId,
          userId,
          userType,
          path,
          referrer,
          userAgent,
          screenResolution
        });
      } else {
        analyticsService.recordEvent({
          visitorId,
          sessionId,
          userId,
          userType,
          category: category || 'general',
          eventName: eventName || 'custom_event',
          data
        });
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[Analytics] Track endpoint error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  heartbeat(req, res) {
    try {
      const { visitorId, sessionId, currentPath, playTimeSeconds } = req.body || {};
      analyticsService.recordHeartbeat({
        visitorId,
        sessionId,
        currentPath,
        playTimeSeconds
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  recordDownloadClick(req, res) {
    try {
      const { visitorId, sessionId, source, version } = req.body || {};
      const userAgent = req.headers['user-agent'] || '';
      analyticsService.recordApkDownloadClick({
        visitorId,
        sessionId,
        source: source || 'direct',
        version: version || '1.0.0',
        userAgent
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  reportError(req, res) {
    try {
      const { errorType, statusCode, message, stack, path, visitorId, userId } = req.body || {};
      const userAgent = req.headers['user-agent'] || '';
      analyticsService.recordError({
        errorType: errorType || 'client_js',
        statusCode: statusCode || 500,
        message: message || 'Unknown client error',
        stack,
        path,
        visitorId,
        userId,
        userAgent
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  reportPerformance(req, res) {
    try {
      const { pingMs } = req.body || {};
      if (typeof pingMs === 'number') {
        analyticsService.recordLatencyPing(pingMs);
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // PROTECTED QUERY APIS
  // =========================================================================

  getOverview(req, res) {
    try {
      const data = analyticsService.getOverviewMetrics(req.query);
      return res.status(200).json(data);
    } catch (err) {
      console.error('[Analytics] getOverview error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  getTraffic(req, res) {
    try {
      const data = analyticsService.getTrafficMetrics(req.query);
      return res.status(200).json(data);
    } catch (err) {
      console.error('[Analytics] getTraffic error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  getDownloads(req, res) {
    try {
      const data = analyticsService.getDownloadMetrics(req.query);
      return res.status(200).json(data);
    } catch (err) {
      console.error('[Analytics] getDownloads error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  getEngagement(req, res) {
    try {
      const data = analyticsService.getEngagementMetrics(req.query);
      return res.status(200).json(data);
    } catch (err) {
      console.error('[Analytics] getEngagement error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  getPerformance(req, res) {
    try {
      const data = analyticsService.getPerformanceMetrics(req.query);
      return res.status(200).json(data);
    } catch (err) {
      console.error('[Analytics] getPerformance error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  getErrors(req, res) {
    try {
      const data = analyticsService.getErrorMetrics(req.query);
      return res.status(200).json(data);
    } catch (err) {
      console.error('[Analytics] getErrors error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  getLive(req, res) {
    try {
      const data = analyticsService.getLiveStatus();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  exportCsv(req, res) {
    try {
      const { type = 'overview', period = '7d', customStart = null, customEnd = null } = req.query;
      const csvData = analyticsService.generateCsv(type, period, customStart, customEnd);
      
      const fileName = `vortex_arena_${type}_report_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.status(200).send(csvData);
    } catch (err) {
      console.error('[Analytics] exportCsv error:', err);
      return res.status(500).send('Error generating CSV report');
    }
  }
}

module.exports = new AnalyticsController();
