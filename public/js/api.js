/**
 * CareerDesk — API Client Service
 * ===================================
 * Handles requests to Flask backend endpoints with automatic Bearer JWT injection,
 * in-memory/sessionStorage query caching (5-min TTL), and request cancellation.
 */

const ApiClient = {
  // In-memory query cache & inflight request controllers
  _cache: new Map(),
  _activeAbortController: null,
  _CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes

  clearCache() {
    this._cache.clear();
    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith("cd_opps_") || k.startsWith("cd_stats_")) {
          sessionStorage.removeItem(k);
        }
      });
    } catch (_) {}
  },

  handleApiError(error, context = {}) {
    if (window.AppLogger) {
      window.AppLogger.error(error, context);
    }
    return window.AppLogger?.sanitizeUserSafeMessage(error) ||
           error?.message ||
           "An unexpected error occurred. Please try again.";
  },

  async request(endpoint, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

    // 1. Offline Network Guard
    if (!navigator.onLine && isMutating) {
      const offlineErr = new Error("You're offline. Changes cannot be saved until internet connection is restored.");
      offlineErr.isOffline = true;
      this.handleApiError(offlineErr, { operation: `offline_block:${method}:${endpoint}` });
      throw offlineErr;
    }

    // 2. Retry Logic: Up to 2 retries for idempotent GET requests with exponential backoff (1s, 2s)
    const maxRetries = isMutating ? 0 : 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        return await this._executeRequest(endpoint, options);
      } catch (err) {
        if (err.name === "AbortError" && !err.isTimeout) {
          // Intentionally cancelled by user/newer query (e.g. search keystroke)
          return null;
        }

        const isNetworkOr5xx = err.isTimeout || !navigator.onLine || (err.status >= 500);
        if (!isMutating && isNetworkOr5xx && attempt < maxRetries) {
          attempt++;
          const delayMs = attempt * 1000; // 1000ms (1s), then 2000ms (2s)
          if (window.AppLogger) {
            window.AppLogger.warn(`Request ${endpoint} failed. Retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})...`, {
              operation: "api_retry",
              endpoint,
              attempt
            });
          }
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        this.handleApiError(err, { operation: `request:${method}:${endpoint}` });
        throw err;
      }
    }
  },

  async _executeRequest(endpoint, options = {}) {
    const url = `${AppConfig.API_BASE_URL}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    // Inject Bearer token if user is signed in
    const token = window.authManager?.getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // 10-Second AbortController Timeout Guard
    const timeoutController = new AbortController();
    let isTimeout = false;

    const timeoutId = setTimeout(() => {
      isTimeout = true;
      timeoutController.abort();
    }, 10000);

    // Link optional parent cancellation signal (e.g. search query debouncing)
    let parentAbortHandler = null;
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        const abortErr = new Error("Aborted");
        abortErr.name = "AbortError";
        throw abortErr;
      }
      parentAbortHandler = () => timeoutController.abort();
      options.signal.addEventListener("abort", parentAbortHandler);
    }

    const config = {
      ...options,
      headers,
      signal: timeoutController.signal
    };

    window.app?.startProgressBar?.();

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // 401 Session Expiry
        if (response.status === 401) {
          if (window.authManager && window.authManager.isAuthenticated()) {
            window.authManager.handleSessionExpired?.();
          }
          const err = new Error("Your session has expired or requires re-authentication.");
          err.status = 401;
          throw err;
        }

        // 403 Forbidden / Account Suspended
        if (response.status === 403) {
          if (data.is_banned) {
            window.dispatchEvent(new CustomEvent("account_banned", { detail: data }));
          }
          const err = new Error(data.error || "You don't have permission to do this.");
          err.status = 403;
          throw err;
        }

        // 400 Bad Request
        if (response.status === 400) {
          const err = new Error(data.error || "Invalid request. Check your input and try again.");
          err.status = 400;
          throw err;
        }

        // 404 Not Found
        if (response.status === 404) {
          const err = new Error("This item no longer exists.");
          err.status = 404;
          throw err;
        }

        // 429 Rate Limited
        if (response.status === 429) {
          const err = new Error("Too many requests. Please wait a moment.");
          err.status = 429;
          throw err;
        }

        // 500 / 502 / 503 Server Error
        if (response.status >= 500) {
          const err = new Error("Server error. We're looking into it.");
          err.status = response.status;
          throw err;
        }

        const err = new Error(data.error || `HTTP ${response.status}: Failed request`);
        err.status = response.status;
        throw err;
      }

      return data;
    } catch (err) {
      if (isTimeout) {
        const timeoutErr = new Error("Request timed out. Please try again.");
        timeoutErr.isTimeout = true;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (options.signal && parentAbortHandler) {
        options.signal.removeEventListener("abort", parentAbortHandler);
      }
      window.app?.finishProgressBar?.();
    }
  },

  // ── Public Opportunity Endpoints with Query Caching & Request Cancellation ─
  async getOpportunities(params = {}, bypassCache = false) {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search.trim());
    if (params.type && params.type !== "all") query.set("type", params.type);
    if (params.mode && params.mode !== "all") query.set("mode", params.mode);
    if (params.sort) query.set("sort", params.sort);
    if (params.page) query.set("page", params.page);
    if (params.limit) query.set("limit", params.limit);

    const queryString = query.toString() ? `?${query.toString()}` : "";
    const cacheKey = `cd_opps_${queryString}`;
    const now = Date.now();

    // 1. Check in-memory cache
    if (!bypassCache && this._cache.has(cacheKey)) {
      const cached = this._cache.get(cacheKey);
      if (now - cached.timestamp < this._CACHE_TTL_MS) {
        return cached.data;
      }
      this._cache.delete(cacheKey);
    }

    // 2. Check sessionStorage cache
    if (!bypassCache) {
      try {
        const stored = sessionStorage.getItem(cacheKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (now - parsed.timestamp < this._CACHE_TTL_MS) {
            this._cache.set(cacheKey, parsed);
            return parsed.data;
          }
          sessionStorage.removeItem(cacheKey);
        }
      } catch (e) {
        // Ignore storage quotas or restrictions
      }
    }

    // 3. Cancel previous inflight opportunity search request to avoid race conditions
    if (this._activeAbortController) {
      this._activeAbortController.abort();
    }
    this._activeAbortController = new AbortController();

    try {
      const data = await this.request(`/api/opportunities${queryString}`, {
        signal: this._activeAbortController.signal
      });

      if (!data) return null; // Was aborted

      // Cache the result
      const cacheEntry = { timestamp: now, data };
      this._cache.set(cacheKey, cacheEntry);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      } catch (e) {
        // Handle potential quota exceeded
      }

      return data;
    } finally {
      this._activeAbortController = null;
    }
  },

  clearCache() {
    this._cache.clear();
    try {
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith("cd_opps_")) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (e) {}
  },

  async getOpportunity(id) {
    const cacheKey = `cd_opp_${id}`;
    const now = Date.now();

    if (this._cache.has(cacheKey)) {
      const cached = this._cache.get(cacheKey);
      if (now - cached.timestamp < this._CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const data = await this.request(`/api/opportunities/${id}`);
    if (data) {
      this._cache.set(cacheKey, { timestamp: now, data });
    }
    return data;
  },

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  async getBookmarks() {
    return this.request(`/api/bookmarks`);
  },

  async addBookmark(opportunityId) {
    return this.request(`/api/bookmarks`, {
      method: "POST",
      body: JSON.stringify({ opportunity_id: opportunityId })
    });
  },

  async removeBookmark(opportunityId) {
    return this.request(`/api/bookmarks/${opportunityId}`, {
      method: "DELETE"
    });
  },

  // ── Applications (Pipeline) ───────────────────────────────────────────────
  async getApplications() {
    return this.request(`/api/applications`);
  },

  async updateApplication(opportunityId, status, notes = "") {
    return this.request(`/api/applications`, {
      method: "POST",
      body: JSON.stringify({
        opportunity_id: opportunityId,
        status,
        notes
      })
    });
  },

  // ── Dashboard Aggregates ──────────────────────────────────────────────────
  async getDashboard() {
    return this.request(`/api/dashboard`);
  },

  // ── Submissions ───────────────────────────────────────────────────────────
  async submitOpportunity(payload) {
    return this.request(`/api/submissions`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  // ── Public Aggregate Stats ────────────────────────────────────────────────
  async getOpportunityStats() {
    return this.request(`/api/opportunities/stats`);
  },

  async getPublicAnnouncement() {
    return this.request(`/api/announcement`);
  },

  // ── Password Recovery Guidance ────────────────────────────────────────────
  async getForgotPasswordInfo(email = "") {
    return this.request(`/api/auth/forgot-password`, {
      method: "POST",
      body: JSON.stringify({ email })
    });
  },

  // ── User Profile Management ──────────────────────────────────────────────
  async getProfile() {
    return this.request(`/api/auth/me`);
  },

  async updateProfile(profileData) {
    return this.request(`/api/auth/profile`, {
      method: "PUT",
      body: JSON.stringify(profileData)
    });
  }
};

window.ApiClient = ApiClient;
