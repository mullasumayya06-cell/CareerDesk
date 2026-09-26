/**
 * CareerDesk — Auth Module (Supabase Auth & Google OAuth)
 * ========================================================
 * Production Google OAuth Single Sign-On and session management.
 * Zero demo/test login harnesses.
 */

class AuthManager {
  constructor() {
    this.client = null;
    this.session = null;
    this.user = null;
    this.profile = null;
    this.listeners = [];
  }

  /**
   * Initialize Supabase client and restore session
   */
  async init() {
    this.isReady = false;
    localStorage.removeItem("opp_demo_session");

    if (!window.supabase) {
      this.isReady = true;
      return;
    }

    try {
      this.client = window.supabase.createClient(
        AppConfig.SUPABASE_URL,
        AppConfig.SUPABASE_ANON_KEY
      );

      // Check existing Supabase session
      const { data, error } = await this.client.auth.getSession();
      if (!error && data?.session) {
        this.session = data.session;
        this.user = data.session.user;
        this.notifyListeners();
        this.fetchBackendProfile().then(() => {
          this.notifyListeners();
        });
      }

      // Listen for auth state changes with subscription reference
      const { data: subData } = this.client.auth.onAuthStateChange(async (event, session) => {
        if (session) {
          this.session = session;
          this.user = session.user;
          this.notifyListeners();
          this.fetchBackendProfile().then(() => {
            this.notifyListeners();
          });
        } else {
          this.session = null;
          this.user = null;
          this.profile = null;
          this.notifyListeners();
        }
      });
      this.authSubscription = subData?.subscription || null;

      // Clean up URL hash if returning from OAuth redirect
      if (window.location.hash && window.location.hash.includes("access_token")) {
        try {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch (_) {}
      }

      // Check for OAuth errors returned in URL query or hash
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash);
      const authError = urlParams.get("error_description") || urlParams.get("error") || hashParams.get("error_description") || hashParams.get("error");
      if (authError) {
        const readableError = decodeURIComponent(authError).replace(/\+/g, " ");
        setTimeout(() => {
          window.app?.showToast?.(`Sign in failed: ${readableError}`, "error");
        }, 500);
        try {
          history.replaceState(null, "", window.location.pathname);
        } catch (_) {}
      }

    } catch (err) {
      if (window.AppLogger) {
        window.AppLogger.error(err, { operation: "auth_init" });
      }
    } finally {
      this.isReady = true;
    }
  }

  cleanup() {
    if (this.authSubscription && typeof this.authSubscription.unsubscribe === "function") {
      this.authSubscription.unsubscribe();
      this.authSubscription = null;
    }
  }

  /**
   * Translates Firebase/Supabase auth error codes to friendly user-safe text
   */
  translateAuthError(error) {
    if (!error) return "";
    const msg = error.message || String(error);
    if (msg.includes("popup-closed-by-user") || msg.includes("access_denied") || msg.includes("User cancelled")) {
      return ""; // Silently ignore deliberate user dismissal
    }
    if (msg.includes("wrong-password") || msg.includes("invalid_grant")) {
      return "Incorrect credentials. Please verify your details.";
    }
    if (msg.includes("user-not-found")) {
      return "No account found with this email.";
    }
    if (msg.includes("email-already-in-use") || msg.includes("already registered")) {
      return "An account with this email already exists.";
    }
    if (msg.includes("too-many-requests") || msg.includes("rate limit")) {
      return "Too many sign-in attempts. Please try again in a few minutes.";
    }
    if (msg.includes("network-request-failed") || msg.includes("Failed to fetch")) {
      return "Network error. Please check your internet connection.";
    }
    return "Sign in was unsuccessful. Please try again.";
  }

  /**
   * Handle expired JWT session mid-flight with refresh attempt
   */
  async handleSessionExpired() {
    if (!this.client || !this.session) return;

    try {
      const { data, error } = await this.client.auth.refreshSession();
      if (!error && data?.session) {
        this.session = data.session;
        this.user = data.session.user;
        this.notifyListeners();
        return;
      }
    } catch (_) {}

    if (window.AppLogger) {
      window.AppLogger.warn("Session expired and refresh failed. Logging out.", { operation: "session_expired" });
    }
    await this.signOut();
    window.dispatchEvent(new CustomEvent("session_expired"));
  }

  /**
   * Fetch user's synced profile from CareerDesk backend
   */
  async fetchBackendProfile() {
    if (!this.session?.access_token) return;

    try {
      const res = await fetch(`${AppConfig.API_BASE_URL}/api/auth/me`, {
        headers: {
          "Authorization": `Bearer ${this.session.access_token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.user) {
          this.profile = data.user;
        }
      } else if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data.is_banned) {
          window.dispatchEvent(new CustomEvent("account_banned", { detail: data }));
          await this.signOut();
        }
      }
    } catch (err) {
      if (window.AppLogger) {
        window.AppLogger.error(err, { operation: "fetchBackendProfile" });
      }
    }

    // Safety fallback: Ensure profile object exists from user metadata so app never breaks
    if (!this.profile && this.user) {
      const meta = this.user.user_metadata || {};
      this.profile = {
        id: this.user.id,
        email: this.user.email,
        full_name: meta.full_name || meta.name || this.user.email?.split("@")[0] || "Member",
        avatar_url: meta.avatar_url || meta.picture || "",
        role: "student"
      };
    }
  }

  /**
   * Trigger Google OAuth sign-in flow
   */
  async signInWithGoogle() {
    if (!this.client) {
      if (window.AppConfig && (!AppConfig.SUPABASE_URL || !AppConfig.SUPABASE_ANON_KEY)) {
        await window.AppConfig.load();
      }
      if (AppConfig.SUPABASE_URL && AppConfig.SUPABASE_ANON_KEY) {
        await this.init();
      }
    }

    if (!this.client) {
      window.app?.showToast?.("Authentication service is initializing. Please retry in a few seconds.", "info");
      return;
    }

    try {
      const { error } = await this.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });

      if (error) {
        const safeMsg = this.translateAuthError(error);
        if (safeMsg) {
          window.app?.showToast?.(safeMsg, "error");
        }
        if (window.AppLogger) {
          window.AppLogger.error(error, { operation: "oauth_google" });
        }
      }
    } catch (err) {
      const safeMsg = this.translateAuthError(err);
      if (safeMsg) {
        window.app?.showToast?.(safeMsg, "error");
      }
    }
  }

  /**
   * Sign out and clear all cached sessions and tokens
   */
  async signOut() {
    localStorage.removeItem("opp_demo_session");
    localStorage.removeItem("careerdesk_auth_session");
    localStorage.removeItem("careerdesk_user_profile");
    localStorage.removeItem("careerdesk_bookmarks");
    try {
      sessionStorage.clear();
    } catch (_) {}

    if (window.ApiClient && typeof window.ApiClient.clearCache === "function") {
      window.ApiClient.clearCache();
    }

    if (this.client) {
      try {
        await this.client.auth.signOut();
      } catch (_) {}
    }
    this.session = null;
    this.user = null;
    this.profile = null;
    this.notifyListeners();
  }

  /**
   * Get JWT access token for backend authorization
   */
  getAccessToken() {
    return this.session?.access_token || null;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!this.session;
  }

  /**
   * Get user ID for context tracking without PII
   */
  getUserId() {
    return this.user?.id || this.profile?.id || null;
  }

  /**
   * Get display user object
   */
  getUserData() {
    if (this.profile) return this.profile;
    if (this.user) {
      const meta = this.user.user_metadata || {};
      return {
        id: this.user.id,
        email: this.user.email,
        full_name: meta.full_name || meta.name || "Student",
        avatar_url: meta.avatar_url || meta.picture || "",
        role: "student"
      };
    }
    return null;
  }

  onAuthChange(callback) {
    this.listeners.push(callback);
    callback(this.getUserData());
  }

  notifyListeners() {
    const user = this.getUserData();
    this.listeners.forEach(cb => cb(user));
  }
}

window.authManager = new AuthManager();
