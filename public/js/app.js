/**
 * CareerDesk — Application Controller
 * =======================================
 * Manages view routing, live search/filtering, Internshala-style opportunity cards,
 * optimistic bookmarks, Kanban pipeline, modals, and toasts.
 */

class OpportunityApp {
  constructor() {
    this.currentTab = "explore";
    this.opportunities = [];
    this.bookmarks = new Set();
    this.currentFilters = {
      search: "",
      type: "all",
      mode: "all",
      sort: "deadline_asc",
      page: 1,
      limit: 24
    };
    this.totalCount = 0;
    this.hasMore = false;
    this.isLoadingMore = false;
    this.searchDebounceTimer = null;
    this.lastDataFetchTime = Date.now();
  }

  async init() {
    this.setupGlobalErrorBoundaries();
    this.setupNetworkMonitoring();
    this.setupSessionExpiredHandler();
    this.setupFormValidations();
    this.setupRefocusHandler();
    this.setupEventListeners();
    this.setupCookieConsent();
    this.setupAuthSync();
    this.setupScrollAnimations();
    this.initLandingScrollSpy();
    await this.loadBookmarks();
    await this.checkGlobalAnnouncement();

    // Lazy-load: only eagerly fetch opportunities if user is already authenticated into workspace
    if (window.authManager && window.authManager.isAuthenticated()) {
      await this.loadExploreData();
    }
    await this.updateHeroStats();
  }

  // ── Global Error Boundaries (Never Show Blank Screen) ────────────────────
  setupGlobalErrorBoundaries() {
    window.addEventListener("error", (event) => {
      if (window.AppLogger) {
        window.AppLogger.error(event.error || event.message, {
          operation: "window_error",
          filename: event.filename,
          lineno: event.lineno
        });
      }
      const rootFallback = document.getElementById("rootCrashFallback");
      const appWorkspace = document.getElementById("appWorkspace");
      const landingView = document.getElementById("landingView");
      // If critical rendering failure occurs on root before view render
      if (rootFallback && (!appWorkspace || appWorkspace.style.display === "none") && (!landingView || landingView.style.display === "none")) {
        rootFallback.style.display = "flex";
      }
    });

    window.addEventListener("unhandledrejection", (event) => {
      if (window.AppLogger) {
        window.AppLogger.error(event.reason || "Unhandled Promise Rejection", {
          operation: "unhandled_promise_rejection"
        });
      }
    });
  }

  // ── Network Connectivity & Persistent Offline Banner ─────────────────────
  setupNetworkMonitoring() {
    const banner = document.getElementById("offlineNoticeBanner");
    const updateStatus = (isOnline) => {
      if (!isOnline) {
        if (banner) banner.style.display = "block";
        this.showToast("You're offline. Changes may not be saved.", "warning");
      } else {
        if (banner) banner.style.display = "none";
        this.showToast("You're back online. Re-syncing data...", "success");
        if (this.currentTab === "explore") {
          this.loadExploreData();
        } else if (this.currentTab === "bookmarks") {
          this.renderBookmarks();
        }
        this.updateHeroStats();
      }
    };

    window.addEventListener("online", () => updateStatus(true));
    window.addEventListener("offline", () => updateStatus(false));

    if (!navigator.onLine && banner) {
      banner.style.display = "block";
    }
  }

  // ── Session Expired Recovery Modal ───────────────────────────────────────
  setupSessionExpiredHandler() {
    window.addEventListener("session_expired", () => {
      const modal = document.getElementById("sessionExpiredModal");
      if (modal) modal.style.display = "flex";
    });

    const btnLogin = document.getElementById("btnSessionExpiredLogin");
    if (btnLogin) {
      btnLogin.addEventListener("click", () => {
        const modal = document.getElementById("sessionExpiredModal");
        if (modal) modal.style.display = "none";
        window.authManager?.signInWithGoogle();
      });
    }
  }

  // ── Form Client-Side Inline Validations ──────────────────────────────────
  setupFormValidations() {
    const fullNameInput = document.getElementById("profileFullName");
    const fullNameErr = document.getElementById("profileFullNameError");
    const collegeInput = document.getElementById("profileCollegeName");
    const collegeErr = document.getElementById("profileCollegeNameError");
    const degreeInput = document.getElementById("profileDegree");
    const degreeErr = document.getElementById("profileDegreeError");

    const validateFullName = () => {
      const val = (fullNameInput?.value || "").trim();
      if (!val) {
        if (fullNameErr) {
          fullNameErr.textContent = "Full name is required.";
          fullNameErr.style.display = "block";
        }
        fullNameInput?.classList.add("has-error");
        return false;
      }
      if (val.length < 2) {
        if (fullNameErr) {
          fullNameErr.textContent = "Full name must be at least 2 characters.";
          fullNameErr.style.display = "block";
        }
        fullNameInput?.classList.add("has-error");
        return false;
      }
      if (val.length > 200) {
        if (fullNameErr) {
          fullNameErr.textContent = "Full name cannot exceed 200 characters.";
          fullNameErr.style.display = "block";
        }
        fullNameInput?.classList.add("has-error");
        return false;
      }
      if (fullNameErr) fullNameErr.style.display = "none";
      fullNameInput?.classList.remove("has-error");
      return true;
    };

    const validateCollege = () => {
      const val = (collegeInput?.value || "").trim();
      if (val.length > 300) {
        if (collegeErr) {
          collegeErr.textContent = "College name cannot exceed 300 characters.";
          collegeErr.style.display = "block";
        }
        collegeInput?.classList.add("has-error");
        return false;
      }
      if (collegeErr) collegeErr.style.display = "none";
      collegeInput?.classList.remove("has-error");
      return true;
    };

    const validateDegree = () => {
      const val = (degreeInput?.value || "").trim();
      if (val.length > 150) {
        if (degreeErr) {
          degreeErr.textContent = "Degree cannot exceed 150 characters.";
          degreeErr.style.display = "block";
        }
        degreeInput?.classList.add("has-error");
        return false;
      }
      if (degreeErr) degreeErr.style.display = "none";
      degreeInput?.classList.remove("has-error");
      return true;
    };

    if (fullNameInput) {
      fullNameInput.addEventListener("blur", validateFullName);
      fullNameInput.addEventListener("input", () => {
        if (fullNameInput.classList.contains("has-error")) validateFullName();
      });
    }

    if (collegeInput) {
      collegeInput.addEventListener("blur", validateCollege);
      collegeInput.addEventListener("input", () => {
        if (collegeInput.classList.contains("has-error")) validateCollege();
      });
    }

    if (degreeInput) {
      degreeInput.addEventListener("blur", validateDegree);
      degreeInput.addEventListener("input", () => {
        if (degreeInput.classList.contains("has-error")) validateDegree();
      });
    }

    this.validateProfileForm = () => {
      const v1 = validateFullName();
      const v2 = validateCollege();
      const v3 = validateDegree();
      return v1 && v2 && v3;
    };
  }

  // ── Refocus Stale Data Check (visibilitychange) ──────────────────────────
  setupRefocusHandler() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        // If user was away for > 3 minutes, quietly refresh aggregates
        if (now - this.lastDataFetchTime > 3 * 60 * 1000) {
          this.lastDataFetchTime = now;
          this.updateHeroStats();
          if (this.currentTab === "explore" && window.authManager?.isAuthenticated()) {
            this.loadExploreData();
          }
        }
      }
    });
  }

  // ── Destructive Action Confirmation Modal ────────────────────────────────
  showConfirmModal({ title, message, confirmText = "Confirm", isDanger = true, onConfirm }) {
    const modal = document.getElementById("confirmationModal");
    const titleEl = document.getElementById("confirmModalTitle");
    const msgEl = document.getElementById("confirmModalMessage");
    const btnProceed = document.getElementById("btnProceedConfirm");
    const btnCancel = document.getElementById("btnCancelConfirm");

    if (!modal || !btnProceed) {
      if (confirm(message || "Are you sure?")) {
        onConfirm?.();
      }
      return;
    }

    if (titleEl) titleEl.textContent = title || "Confirm Action";
    if (msgEl) msgEl.textContent = message || "Are you sure you want to proceed?";
    btnProceed.textContent = confirmText;
    btnProceed.className = isDanger ? "btn-apply-action btn-danger" : "btn-apply-action";

    modal.style.display = "flex";

    const cleanup = () => {
      modal.style.display = "none";
      btnProceed.onclick = null;
      btnCancel.onclick = null;
      btnProceed.disabled = false;
    };

    btnCancel.onclick = () => cleanup();

    btnProceed.onclick = async () => {
      btnProceed.disabled = true;
      btnProceed.innerHTML = `
        <div class="spinner" style="width: 14px; height: 14px; border: 2px solid #FFFFFF; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px;"></div>
        Processing...
      `;
      try {
        if (onConfirm) await onConfirm();
      } catch (err) {
        if (window.AppLogger) {
          window.AppLogger.error(err, { operation: "confirm_modal_action" });
        }
      } finally {
        cleanup();
      }
    };
  }

  // ── Scroll Reveal Animations ──────────────────────────────────────────────
  setupScrollAnimations() {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal-on-scroll").forEach(el => observer.observe(el));
  }

  // ── Landing Page Header Sticky & Scrollspy ───────────────────────────────
  initLandingScrollSpy() {
    const siteHeader = document.querySelector(".site-header");
    const sections = ["overview", "how-it-works", "how-to-use", "for-whom"];
    const navLinks = document.querySelectorAll(".guest-nav-link, .mobile-landing-nav-link");

    const onScroll = () => {
      // 1. Elevated header shadow & backdrop blur enhancement when scrolled
      if (siteHeader) {
        if (window.scrollY > 20) {
          siteHeader.classList.add("is-scrolled");
        } else {
          siteHeader.classList.remove("is-scrolled");
        }
      }

      // 2. Active Section Spy for guest landing links
      let currentSectionId = "";
      const scrollPosition = window.scrollY + 120;

      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            currentSectionId = id;
            break;
          }
        }
      }

      if (currentSectionId) {
        navLinks.forEach(link => {
          const href = link.getAttribute("href");
          if (href === `#${currentSectionId}`) {
            link.classList.add("active");
          } else if (href && href.startsWith("#")) {
            link.classList.remove("active");
          }
        });
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Trigger on initial load to set state
    onScroll();
  }

  // ── Event Handlers & Routing ──────────────────────────────────────────────
  setupEventListeners() {
    // Desktop Navigation Tabs & Mobile Bottom Nav Items
    document.querySelectorAll(".nav-tab-item, .mobile-nav-item").forEach(tab => {
      tab.addEventListener("click", () => {
        const targetTab = tab.dataset.tab;
        if (targetTab) {
          this.switchTab(targetTab);
        }
      });
    });

    // Category Filter Pills (Internshala Style)
    document.querySelectorAll(".filter-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.currentFilters.type = pill.dataset.type || "all";
        this.loadExploreData();
      });
    });

    // Search Input with Debounce
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.currentFilters.search = e.target.value.trim();
          this.loadExploreData();
        }, 300);
      });
    }

    // Mode Filter
    const modeSelect = document.getElementById("modeSelect");
    if (modeSelect) {
      modeSelect.addEventListener("change", (e) => {
        this.currentFilters.mode = e.target.value;
        this.loadExploreData();
      });
    }

    // Sort Select
    const sortSelect = document.getElementById("sortSelect");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        this.currentFilters.sort = e.target.value;
        this.loadExploreData();
      });
    }

    // Auth Buttons (Header & Hero)
    const googleLoginButtons = ["btnGoogleLogin", "btnHeroGoogle", "btnCtaGoogle"];
    googleLoginButtons.forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener("click", () => {
          window.authManager.signInWithGoogle();
        });
      }
    });

    // User Profile Modal Trigger (Header dropdown)
    const btnOpenProfileModal = document.getElementById("btnOpenProfileModal");
    if (btnOpenProfileModal) {
      btnOpenProfileModal.addEventListener("click", (e) => {
        e.preventDefault();
        const userDropdown = document.getElementById("userDropdown");
        if (userDropdown) userDropdown.classList.remove("show");
        this.openProfileModal();
      });
    }

    // Load More Opportunities Button
    const btnLoadMoreOpps = document.getElementById("btnLoadMoreOpps");
    if (btnLoadMoreOpps) {
      btnLoadMoreOpps.addEventListener("click", () => {
        this.loadMoreOpportunities();
      });
    }

    // Profile Form Handlers
    const profileForm = document.getElementById("profileForm");
    if (profileForm) {
      profileForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.saveProfile();
      });
    }

    const closeProfileModalBtn = document.getElementById("closeProfileModalBtn");
    if (closeProfileModalBtn) {
      closeProfileModalBtn.addEventListener("click", () => this.closeAllModals());
    }

    const btnCancelProfile = document.getElementById("btnCancelProfile");
    if (btnCancelProfile) {
      btnCancelProfile.addEventListener("click", () => this.closeAllModals());
    }


    // Role Switcher Tabs on Landing Page
    const roleTabCandidate = document.getElementById("roleTabCandidate");
    const roleTabOrganizer = document.getElementById("roleTabOrganizer");
    const rolePanelCandidate = document.getElementById("rolePanelCandidate");
    const rolePanelOrganizer = document.getElementById("rolePanelOrganizer");

    if (roleTabCandidate && roleTabOrganizer && rolePanelCandidate && rolePanelOrganizer) {
      roleTabCandidate.addEventListener("click", () => {
        roleTabCandidate.classList.add("active");
        roleTabCandidate.setAttribute("aria-selected", "true");
        roleTabOrganizer.classList.remove("active");
        roleTabOrganizer.setAttribute("aria-selected", "false");
        rolePanelCandidate.style.display = "grid";
        rolePanelOrganizer.style.display = "none";
      });

      roleTabOrganizer.addEventListener("click", () => {
        roleTabOrganizer.classList.add("active");
        roleTabOrganizer.setAttribute("aria-selected", "true");
        roleTabCandidate.classList.remove("active");
        roleTabCandidate.setAttribute("aria-selected", "false");
        rolePanelOrganizer.style.display = "grid";
        rolePanelCandidate.style.display = "none";
      });
    }

    // Hero Explore & Submit Buttons
    const btnHeroExplore = document.getElementById("btnHeroExplore");
    if (btnHeroExplore) {
      btnHeroExplore.addEventListener("click", () => {
        const overviewSec = document.getElementById("overview");
        if (overviewSec) {
          overviewSec.scrollIntoView({ behavior: "smooth" });
        }
      });
    }

    const btnHeroSubmit = document.getElementById("btnHeroSubmit");
    if (btnHeroSubmit) {
      btnHeroSubmit.addEventListener("click", (e) => {
        if (window.authManager && window.authManager.isAuthenticated()) {
          this.switchTab("submit");
        } else {
          const howToUse = document.getElementById("how-to-use");
          if (howToUse) howToUse.scrollIntoView({ behavior: "smooth" });
          if (roleTabOrganizer) roleTabOrganizer.click();
        }
      });
    }

    // Product Guide Toggle in Workspace Subbar
    const btnToggleLandingGuide = document.getElementById("btnToggleLandingGuide");
    if (btnToggleLandingGuide) {
      btnToggleLandingGuide.addEventListener("click", () => {
        const landingView = document.getElementById("landingView");
        const appWorkspace = document.getElementById("appWorkspace");
        if (landingView && appWorkspace) {
          const isLandingVisible = landingView.style.display !== "none";
          if (isLandingVisible) {
            landingView.style.display = "none";
            appWorkspace.style.display = "block";
            btnToggleLandingGuide.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              Product Guide
            `;
          } else {
            landingView.style.display = "block";
            landingView.scrollIntoView({ behavior: "smooth" });
            btnToggleLandingGuide.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
              Return to App Terminal
            `;
          }
        }
      });
    }

    // Desktop Sign Out (from User Dropdown with Destructive Confirm Guard)
    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        this.showConfirmModal({
          title: "Sign Out of CareerDesk?",
          message: "Are you sure you want to sign out? Your saved bookmarks will remain safely attached to your Google account.",
          confirmText: "Sign Out",
          isDanger: true,
          onConfirm: async () => {
            await window.authManager.signOut();
            this.showToast("Signed out successfully", "info");
          }
        });
      });
    }

    // Mobile Header Profile Trigger (Jakob's Law Standard)
    const mobileHeaderProfileBtn = document.getElementById("mobileHeaderProfileBtn");
    if (mobileHeaderProfileBtn) {
      mobileHeaderProfileBtn.addEventListener("click", () => {
        this.openProfileDrawer();
      });
    }

    // Mobile Bottom Nav Profile Trigger
    const mobileNavProfileBtn = document.getElementById("mobileNavProfileBtn");
    if (mobileNavProfileBtn) {
      mobileNavProfileBtn.addEventListener("click", () => {
        this.openProfileDrawer();
      });
    }

    // Mobile Profile Drawer Controls
    const btnCloseProfileDrawer = document.getElementById("btnCloseProfileDrawer");
    if (btnCloseProfileDrawer) {
      btnCloseProfileDrawer.addEventListener("click", () => {
        this.closeProfileDrawer();
      });
    }

    const profileDrawerBackdrop = document.getElementById("profileDrawerBackdrop");
    if (profileDrawerBackdrop) {
      profileDrawerBackdrop.addEventListener("click", () => {
        this.closeProfileDrawer();
      });
    }

    // Mobile Profile Drawer Tab Links
    document.querySelectorAll("[data-drawer-tab]").forEach(item => {
      item.addEventListener("click", () => {
        const targetTab = item.dataset.drawerTab;
        this.closeProfileDrawer();
        if (targetTab) this.switchTab(targetTab);
      });
    });

    // Drawer Edit Profile Button
    const drawerBtnOpenProfile = document.getElementById("drawerBtnOpenProfile");
    if (drawerBtnOpenProfile) {
      drawerBtnOpenProfile.addEventListener("click", () => {
        this.closeProfileDrawer();
        this.openProfileModal();
      });
    }

    // Drawer Product Tour Button
    const drawerBtnTour = document.getElementById("drawerBtnTour");
    if (drawerBtnTour) {
      drawerBtnTour.addEventListener("click", () => {
        this.closeProfileDrawer();
        const landingView = document.getElementById("landingView");
        const appWorkspace = document.getElementById("appWorkspace");
        if (landingView && appWorkspace) {
          appWorkspace.style.display = "block";
          landingView.style.display = "block";
          landingView.scrollIntoView({ behavior: "smooth" });
        }
      });
    }

    // Drawer Sign Out Button (Prominent & Dedicated Mobile Logout with Confirm Guard)
    const btnDrawerLogout = document.getElementById("btnDrawerLogout");
    if (btnDrawerLogout) {
      btnDrawerLogout.addEventListener("click", () => {
        this.closeProfileDrawer();
        this.showConfirmModal({
          title: "Sign Out of CareerDesk?",
          message: "Are you sure you want to sign out? Your saved bookmarks will remain safely attached to your Google account.",
          confirmText: "Sign Out",
          isDanger: true,
          onConfirm: async () => {
            await window.authManager.signOut();
            this.showToast("Signed out successfully", "info");
          }
        });
      });
    }

    // Close Drawer on Escape Key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeProfileDrawer();
      }
    });

    // User Menu Dropdown Toggle
    const userProfileMenu = document.getElementById("userProfileMenu");
    const userDropdown = document.getElementById("userDropdown");
    if (userProfileMenu && userDropdown) {
      userProfileMenu.addEventListener("click", (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle("show");
      });

      document.addEventListener("click", () => {
        userDropdown.classList.remove("show");
      });
    }

    // Forgot Password Link Trigger
    const btnForgotPassword = document.getElementById("btnForgotPassword");
    if (btnForgotPassword) {
      btnForgotPassword.addEventListener("click", (e) => {
        e.preventDefault();
        this.openModal("forgotPasswordModal");
      });
    }


    // Modal Close Buttons
    document.querySelectorAll(".modal-close-btn, .btn-modal-close").forEach(btn => {
      btn.addEventListener("click", () => {
        this.closeAllModals();
      });
    });

    // Close on Backdrop Click & ESC Key
    document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) this.closeAllModals();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeAllModals();
    });

    // Global Account Suspension / Banned Alert Event
    window.addEventListener("account_banned", (e) => {
      const reason = e.detail?.error || "Your account has been suspended.";
      alert(`⚠️ Account Suspended:\n\n${reason}\n\nYour session has been terminated.`);
      if (window.authManager) {
        window.authManager.signOut();
      }
    });
  }

  // ── Cookie & Storage Notice ───────────────────────────────────────────────
  setupCookieConsent() {
    const banner = document.getElementById("cookieConsentBanner");
    const btnAccept = document.getElementById("btnAcceptCookies");
    if (!banner) return;

    const consent = localStorage.getItem("opp_cookie_consent");
    if (!consent) {
      banner.style.display = "block";
    }

    if (btnAccept) {
      btnAccept.addEventListener("click", () => {
        localStorage.setItem("opp_cookie_consent", "accepted");
        banner.style.display = "none";
      });
    }
  }

  setupAuthSync() {
    window.authManager.onAuthChange((user) => {
      const guestNav = document.getElementById("guestNavLinks");
      const navTabs = document.getElementById("navTabs");
      const loginWrapper = document.getElementById("guestAuthWrapper");
      const userMenu = document.getElementById("userProfileMenu");
      const landingView = document.getElementById("landingView");
      const appWorkspace = document.getElementById("appWorkspace");

      if (user) {
        // Authenticated: Show App Workspace, Hide Public Landing
        document.body.classList.add("is-authenticated");
        document.body.classList.remove("is-guest");
        if (guestNav) guestNav.style.display = "none";
        if (navTabs) navTabs.style.display = "flex";
        if (loginWrapper) loginWrapper.style.display = "none";

        const defaultAvatarSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23008BDC'/%3E%3Cstop offset='100%25' stop-color='%23006BC7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='50' fill='url(%23g)'/%3E%3Ccircle cx='50' cy='40' r='18' fill='%23FFFFFF' opacity='0.9'/%3E%3Cpath d='M20 85 C20 66 35 62 50 62 C65 62 80 66 80 85 Z' fill='%23FFFFFF' opacity='0.9'/%3E%3C/svg%3E";
        const avatarUrl = user.avatar_url || defaultAvatarSvg;
        const fullName = user.full_name || "Active Member";
        const email = user.email || "";

        if (userMenu) {
          userMenu.style.display = "flex";
          const nameEl = document.getElementById("navUserName");
          const avatarEl = document.getElementById("navUserAvatar");
          const roleEl = document.getElementById("navUserRole");
          if (nameEl) nameEl.textContent = fullName;
          if (avatarEl) avatarEl.src = avatarUrl;
          if (roleEl) roleEl.textContent = "Member";
        }

        // Sync Mobile Header Avatar Trigger
        const mobileHeaderAvatarImg = document.getElementById("mobileHeaderAvatarImg");
        if (mobileHeaderAvatarImg) mobileHeaderAvatarImg.src = avatarUrl;

        // Sync Mobile Bottom Nav Avatar
        const mobileBottomNavAvatar = document.getElementById("mobileBottomNavAvatar");
        const mobileBottomNavAvatarDefault = document.getElementById("mobileBottomNavAvatarDefault");
        if (mobileBottomNavAvatar) {
          mobileBottomNavAvatar.src = avatarUrl;
          mobileBottomNavAvatar.style.display = "block";
        }
        if (mobileBottomNavAvatarDefault) {
          mobileBottomNavAvatarDefault.style.display = "none";
        }

        // Sync Profile Sidebar Drawer Details
        const drawerAvatar = document.getElementById("drawerUserAvatar");
        const drawerName = document.getElementById("drawerUserName");
        const drawerEmail = document.getElementById("drawerUserEmail");
        const drawerRoleBadge = document.getElementById("drawerUserRoleBadge");
        const drawerCollege = document.getElementById("drawerCollegeBadge");

        if (drawerAvatar) {
          const firstChar = (fullName || "U").trim().charAt(0).toUpperCase();
          const monogramSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%23008BDC'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='18' font-weight='700' fill='%23FFFFFF' font-family='sans-serif'%3E${firstChar}%3C/text%3E%3C/svg%3E`;
          drawerAvatar.src = avatarUrl || monogramSvg;
          drawerAvatar.onerror = () => { drawerAvatar.src = monogramSvg; };
        }
        if (drawerName) drawerName.textContent = fullName;
        if (drawerEmail) drawerEmail.textContent = email;
        if (drawerRoleBadge) {
          drawerRoleBadge.textContent = "Google Verified";
          drawerRoleBadge.className = "badge-role-tag badge-role-student";
        }
        if (drawerCollege) {
          if (user.college_name && user.college_name.trim()) {
            drawerCollege.textContent = user.college_name.trim();
            drawerCollege.style.display = "inline-block";
          } else {
            drawerCollege.style.display = "none";
          }
        }

        if (landingView) landingView.style.display = "none";
        if (appWorkspace) appWorkspace.style.display = "block";

        this.loadBookmarks();
        this.switchTab("explore");
      } else {
        // Guest: Show Public Landing, Hide App Workspace
        document.body.classList.remove("is-authenticated");
        document.body.classList.add("is-guest");
        if (guestNav) guestNav.style.display = "flex";
        if (navTabs) navTabs.style.display = "none";
        if (loginWrapper) loginWrapper.style.display = "flex";
        if (userMenu) userMenu.style.display = "none";

        const mobileBottomNavAvatar = document.getElementById("mobileBottomNavAvatar");
        const mobileBottomNavAvatarDefault = document.getElementById("mobileBottomNavAvatarDefault");
        if (mobileBottomNavAvatar) mobileBottomNavAvatar.style.display = "none";
        if (mobileBottomNavAvatarDefault) mobileBottomNavAvatarDefault.style.display = "block";

        const drawerAvatar = document.getElementById("drawerUserAvatar");
        if (drawerAvatar) {
          drawerAvatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%23F1F5F9'/%3E%3Cpath d='M20 19c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 3c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z' fill='%2394A3B8'/%3E%3C/svg%3E";
        }
        const drawerName = document.getElementById("drawerUserName");
        const drawerEmail = document.getElementById("drawerUserEmail");
        const drawerRoleBadge = document.getElementById("drawerUserRoleBadge");
        const drawerCollege = document.getElementById("drawerCollegeBadge");
        if (drawerName) drawerName.textContent = "Guest Visitor";
        if (drawerEmail) drawerEmail.textContent = "Sign in with Google";
        if (drawerRoleBadge) {
          drawerRoleBadge.textContent = "Visitor";
          drawerRoleBadge.className = "badge-role-tag";
        }
        if (drawerCollege) drawerCollege.style.display = "none";

        if (landingView) landingView.style.display = "block";
        if (appWorkspace) appWorkspace.style.display = "none";

        this.loadBookmarks();
      }

      // Zero-Flicker: Dismiss Splash Screen smoothly once initial auth state is confirmed
      const splash = document.getElementById("authSplashScreen");
      if (splash) {
        splash.classList.add("splash-hidden");
        setTimeout(() => {
          if (splash.parentNode) splash.parentNode.removeChild(splash);
          document.body.classList.remove("auth-pending");
        }, 320);
      } else {
        document.body.classList.remove("auth-pending");
      }
    });
  }

  // ── Top Navigation Progress Bar ───────────────────────────────────────────
  startProgressBar() {
    const bar = document.getElementById("topProgressBar");
    if (bar) {
      bar.classList.remove("done");
      bar.classList.add("loading");
    }
  }

  finishProgressBar() {
    const bar = document.getElementById("topProgressBar");
    if (bar) {
      bar.classList.add("done");
      setTimeout(() => {
        bar.classList.remove("loading", "done");
      }, 300);
    }
  }

  // ── Tab Navigation (Protected Routes & Instant Progress) ─────────────────
  // ── Route-Level Error Boundaries & Tab Navigation ────────────────────────
  clearRouteErrorBoundary(tabId) {
    const view = document.getElementById(`${tabId}View`);
    if (!view) return;
    const existing = view.querySelector(".scoped-error-boundary");
    if (existing) existing.remove();
  }

  renderRouteErrorBoundary(tabId, error) {
    const view = document.getElementById(`${tabId}View`);
    if (!view) return;
    const safeMsg = window.ApiClient?.handleApiError(error, { operation: `route_error_${tabId}` }) ||
                    "This section failed to load. Please try again.";
    view.innerHTML = `
      <div class="scoped-error-boundary">
        <div class="scoped-error-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h3 class="scoped-error-title">This section failed to load</h3>
        <p class="scoped-error-desc">${safeMsg}</p>
        <button type="button" class="btn-apply-action" onclick="window.app.switchTab('${tabId}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
          Try Again
        </button>
      </div>
    `;
  }

  switchTab(tabId) {
    try {
      this.clearRouteErrorBoundary(tabId);

      // Protected Tab Gate: Saved Bookmarks requires authentication
      if (tabId === "bookmarks" && (!window.authManager || !window.authManager.isAuthenticated())) {
        this.showToast("Please sign in with Google to view and manage your saved bookmarks.", "info");
        window.authManager?.signInWithGoogle();
        return;
      }

      this.startProgressBar();
      this.currentTab = tabId;

      // Ensure Workspace is active when switching tabs
      const landingView = document.getElementById("landingView");
      const appWorkspace = document.getElementById("appWorkspace");
      if (appWorkspace) appWorkspace.style.display = "block";
      if (landingView) landingView.style.display = "none";

      // Update Subbar Active Tab Label
      const activeLabel = document.getElementById("workspaceActiveTabLabel");
      if (activeLabel) {
        const labels = {
          explore: "Explore Opportunities",
          bookmarks: "Saved Bookmarks"
        };
        activeLabel.textContent = labels[tabId] || "Workspace Terminal";
      }

      // Reset Guide Button Text if toggled
      const btnToggleLandingGuide = document.getElementById("btnToggleLandingGuide");
      if (btnToggleLandingGuide) {
        btnToggleLandingGuide.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          Product Guide
        `;
      }

      // Synchronize Desktop Nav Tab UI
      document.querySelectorAll(".nav-tab-item").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.tab === tabId);
      });

      // Synchronize Mobile Bottom Nav UI
      document.querySelectorAll(".mobile-nav-item").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.tab === tabId);
      });

      // Synchronize Profile Drawer Nav Items (Jakob's Law)
      document.querySelectorAll("[data-drawer-tab]").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.drawerTab === tabId);
      });

      // Show/Hide View Panels
      document.querySelectorAll(".view-panel").forEach(panel => {
        panel.classList.toggle("active", panel.id === `${tabId}View`);
      });

      // Refresh tab-specific data
      if (tabId === "explore") this.loadExploreData();
      if (tabId === "bookmarks") this.renderBookmarks();

      // Scroll to top of main content smoothly
      const mainEl = document.getElementById("mainContent");
      if (mainEl && window.scrollY > 300) {
        mainEl.scrollIntoView({ behavior: "smooth" });
      }

      this.finishProgressBar();
    } catch (err) {
      if (window.AppLogger) {
        window.AppLogger.error(err, { operation: `switchTab:${tabId}` });
      }
      this.renderRouteErrorBoundary(tabId, err);
      this.finishProgressBar();
    }
  }

  // ── Reset Search & Filters ───────────────────────────────────────────────
  resetFilters() {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.value = "";
    const modeSelect = document.getElementById("modeSelect");
    if (modeSelect) modeSelect.value = "all";
    const sortSelect = document.getElementById("sortSelect");
    if (sortSelect) sortSelect.value = "deadline_asc";

    document.querySelectorAll(".filter-pill").forEach(p => {
      p.classList.toggle("active", p.dataset.type === "all");
    });

    this.currentFilters = {
      search: "",
      type: "all",
      mode: "all",
      sort: "deadline_asc",
      page: 1,
      limit: 24
    };
    this.loadExploreData();
  }

  // ── Explore View & Pagination ─────────────────────────────────────────────
  async loadExploreData() {
    const grid = document.getElementById("opportunitiesGrid");
    if (!grid) return;

    this.currentFilters.page = 1;
    this.currentFilters.limit = 24;
    this.opportunities = [];
    grid.innerHTML = this.renderSkeletons(6);

    try {
      const data = await window.ApiClient.getOpportunities(this.currentFilters);
      this.lastDataFetchTime = Date.now();
      if (!data) return; // Request was aborted due to rapid new search query; ignore
      this.opportunities = data.opportunities || [];
      this.totalCount = data.total || this.opportunities.length;
      this.hasMore = !!data.has_more;
      this.renderOpportunities(this.opportunities);
    } catch (err) {
      if (err.name === "AbortError" && !err.isTimeout) return;
      const safeMsg = window.ApiClient?.handleApiError(err, { operation: "loadExploreData" }) ||
                      "We encountered an issue retrieving verified listings. Please check your connection or retry.";
      grid.innerHTML = `
        <div class="scoped-error-boundary">
          <div class="scoped-error-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <h3 class="scoped-error-title">This section failed to load</h3>
          <p class="scoped-error-desc">${safeMsg}</p>
          <button type="button" class="btn-apply-action" onclick="window.app.loadExploreData()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            Try Again
          </button>
        </div>
      `;
    } finally {
      this.updatePaginationUI();
    }
  }

  async loadMoreOpportunities() {
    if (this.isLoadingMore || !this.hasMore) return;
    this.isLoadingMore = true;

    const btn = document.getElementById("btnLoadMoreOpps");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <div class="spinner" style="width: 16px; height: 16px; border: 2px solid var(--brand-primary); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; vertical-align: middle; margin-right: 8px;"></div>
        <span>Loading more opportunities...</span>
      `;
    }

    try {
      const nextPage = (this.currentFilters.page || 1) + 1;
      this.currentFilters.page = nextPage;
      const data = await window.ApiClient.getOpportunities(this.currentFilters);
      if (data && data.opportunities) {
        this.opportunities = this.opportunities.concat(data.opportunities);
        this.totalCount = data.total || this.totalCount;
        this.hasMore = !!data.has_more;

        const grid = document.getElementById("opportunitiesGrid");
        if (grid) {
          const newCardsHtml = data.opportunities.map(opp => this.renderOpportunityCard(opp)).join("");
          grid.insertAdjacentHTML("beforeend", newCardsHtml);
        }
      }
    } catch (err) {
      this.showToast("Failed to load more opportunities. Please retry.", "error");
    } finally {
      this.isLoadingMore = false;
      this.updatePaginationUI();
    }
  }

  updatePaginationUI() {
    const loadedEl = document.getElementById("oppsLoadedCount");
    const totalEl = document.getElementById("oppsTotalCount");
    const btnLoadMore = document.getElementById("btnLoadMoreOpps");
    const allLoadedIndicator = document.getElementById("allLoadedIndicator");

    const loaded = this.opportunities ? this.opportunities.length : 0;
    const total = this.totalCount || loaded;

    if (loadedEl) loadedEl.textContent = loaded;
    if (totalEl) totalEl.textContent = total;

    if (btnLoadMore) {
      btnLoadMore.disabled = false;
      const remaining = Math.max(0, total - loaded);
      const nextBatch = Math.min(24, remaining);
      btnLoadMore.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <span>Load More Opportunities (${nextBatch} more)</span>
      `;
      btnLoadMore.style.display = this.hasMore ? "inline-flex" : "none";
    }

    if (allLoadedIndicator) {
      allLoadedIndicator.style.display = (!this.hasMore && loaded > 0) ? "block" : "none";
    }
  }

  renderOpportunities(opportunities) {
    const grid = document.getElementById("opportunitiesGrid");
    if (!grid) return;

    if (!opportunities || opportunities.length === 0) {
      grid.innerHTML = `
        <div class="designed-empty-state">
          <div class="empty-state-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <h3 class="empty-state-title">No matching opportunities found</h3>
          <p class="empty-state-desc">Try clearing your search query or selecting a different category filter.</p>
          <button type="button" class="btn-apply-action" onclick="window.app.resetFilters()">
            Clear All Filters
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = opportunities.map(opp => this.renderOpportunityCard(opp)).filter(Boolean).join("");
  }

  renderOpportunityCard(opp) {
    try {
      if (!opp || typeof opp !== "object") return "";

      const isBookmarked = this.bookmarks.has(Number(opp.id)) || this.bookmarks.has(String(opp.id));
      const deadlineVal = opp.deadline_utc || opp.deadline;
      const deadlineCountdown = this.calculateCountdown(deadlineVal);
      const organizer = opp.organiser || opp.organizer || "Verified Organizer";
      const category = opp.category || opp.opportunity_type || "Event";
      const applyUrl = opp.official_url || opp.apply_url || "#";
      const mode = (opp.mode || "online").toLowerCase();
      
      let prizeFormatted = opp.prize_label || opp.prize_pool;
      if (!prizeFormatted && opp.prize_inr) {
        prizeFormatted = `₹${Number(opp.prize_inr).toLocaleString('en-IN')}`;
      }
      if (!prizeFormatted) {
        prizeFormatted = "Prizes & Certificates";
      }

      const modeDisplay = mode === "in_person" || mode === "offline" ? "In-Person" : mode === "hybrid" ? "Hybrid" : "Online / Remote";

      return `
        <div class="opportunity-card" data-id="${opp.id}">
          <div>
            <!-- Header Row: Category Badge & Urgency / Hiring tags + Bookmark -->
            <div class="card-header-row">
              <div class="card-tags-wrapper">
                <span class="badge-tag badge-type-blue">${this.escapeHtml(category.toUpperCase())}</span>
                <span class="badge-tag badge-mode">${this.escapeHtml(modeDisplay)}</span>
                ${deadlineCountdown && deadlineCountdown.isUrgent ? `
                  <span class="badge-tag badge-urgent">
                    <span class="dot"></span>
                    ${deadlineCountdown.text}
                  </span>
                ` : `
                  <span class="badge-tag badge-actively-hiring">
                    <span class="dot"></span>
                    Active
                  </span>
                `}
              </div>
              <button class="btn-bookmark ${isBookmarked ? 'bookmarked' : ''}" 
                      title="${isBookmarked ? 'Remove Bookmark' : 'Bookmark Opportunity'}"
                      aria-label="${isBookmarked ? 'Remove bookmark for ' + this.escapeHtml(opp.title) : 'Bookmark ' + this.escapeHtml(opp.title)}"
                      onclick="window.app.toggleBookmark(${opp.id}, this)">
                <svg viewBox="0 0 24 24">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            </div>

            <h3 class="card-title">${this.escapeHtml(opp.title)}</h3>
            <div class="card-organizer">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              ${this.escapeHtml(organizer)}
            </div>
            <p class="card-description">${this.escapeHtml(opp.description || `${category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()} organized by ${organizer}. Hosted on ${opp.platform || 'official portal'}.`)}</p>

            <!-- Metadata List with Icons (Internshala <ul> Style) -->
            <ul class="card-metadata-list">
              <li class="meta-item-row">
                <div class="meta-item-left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                  <span>Prize / Stipend</span>
                </div>
                <span class="meta-item-val prize">${this.escapeHtml(prizeFormatted)}</span>
              </li>
              <li class="meta-item-row">
                <div class="meta-item-left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <span>Deadline</span>
                </div>
                <span class="meta-item-val">${this.formatDate(deadlineVal)}</span>
              </li>
            </ul>
          </div>

          <!-- Footer Actions Row -->
          <div class="card-actions-row">
            <button class="btn-card-details" 
                    aria-label="View details for ${this.escapeHtml(opp.title)}"
                    onclick="window.app.showOpportunityDetails(${opp.id})">
              View details
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
            <button class="btn-apply-action" 
                    aria-label="Apply to ${this.escapeHtml(opp.title)} on official portal"
                    onclick="window.app.applyToOpportunity(${opp.id}, '${this.escapeHtml(applyUrl)}')">
              Apply Now
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </button>
          </div>
        </div>
      `;
    } catch (cardErr) {
      if (window.AppLogger) {
        window.AppLogger.warn(cardErr, { operation: "renderOpportunityCard", oppId: opp?.id });
      }
      return "";
    }
  }

  // ── Bookmarking (Local-first & Cloud-synchronized) ───────────────────────
  async loadBookmarks() {
    // 1. Immediately restore cached bookmarks from localStorage for instant render
    try {
      const cached = localStorage.getItem("cd_saved_bookmarks");
      if (cached) {
        const ids = JSON.parse(cached);
        if (Array.isArray(ids)) {
          this.bookmarks = new Set(ids.map(Number));
          this.updateBookmarkBadges();
        }
      }
    } catch (e) {
      // Ignore local storage read errors silently
    }

    if (!window.authManager.isAuthenticated()) return;

    // 2. Fetch and sync from backend API when authenticated
    try {
      const data = await window.ApiClient.getBookmarks();
      const serverIds = (data.bookmarks || [])
        .map(b => b.opportunity_id || b.opp_opportunities?.id)
        .filter(Boolean)
        .map(Number);

      const merged = new Set([...this.bookmarks, ...serverIds]);
      this.bookmarks = merged;
      try {
        localStorage.setItem("cd_saved_bookmarks", JSON.stringify(Array.from(this.bookmarks)));
      } catch (e) {}
      this.updateBookmarkBadges();

      // Sync local bookmarks to server if missing
      for (const id of this.bookmarks) {
        if (!serverIds.includes(id)) {
          window.ApiClient.addBookmark(id).catch(() => {});
        }
      }
    } catch (err) {
      // Backend bookmarks sync silently degrades to cached state
    }
  }

  updateBookmarkBadges() {
    const count = this.bookmarks.size;
    const badge = document.getElementById("savedCountBadge");
    if (badge) badge.textContent = count;

    const mobileBadge = document.getElementById("mobileSavedBadge");
    if (mobileBadge) {
      mobileBadge.textContent = count;
      mobileBadge.style.display = count > 0 ? "flex" : "none";
    }

    const drawerBadge = document.getElementById("drawerBookmarksCount");
    if (drawerBadge) drawerBadge.textContent = count;
  }

  async toggleBookmark(oppId, btnEl) {
    oppId = Number(oppId);
    const isCurrentlyBookmarked = this.bookmarks.has(oppId);

    // Prevent rapid double-clicks while async sync runs
    if (btnEl) btnEl.style.pointerEvents = "none";

    // 1. Instant optimistic UI update
    if (isCurrentlyBookmarked) {
      this.bookmarks.delete(oppId);
      if (btnEl) btnEl.classList.remove("bookmarked");
      this.showToast("Removed from bookmarks", "info");
    } else {
      this.bookmarks.add(oppId);
      if (btnEl) btnEl.classList.add("bookmarked");
      this.showToast("Saved to bookmarks!", "success");
    }

    // Persist immediately in localStorage
    try {
      localStorage.setItem("cd_saved_bookmarks", JSON.stringify(Array.from(this.bookmarks)));
    } catch (e) {}

    this.updateBookmarkBadges();

    // 2. If user is authenticated, sync to cloud API
    if (window.authManager.isAuthenticated()) {
      try {
        if (isCurrentlyBookmarked) {
          await window.ApiClient.removeBookmark(oppId);
        } else {
          await window.ApiClient.addBookmark(oppId);
        }
      } catch (err) {
        const safeMsg = window.ApiClient?.handleApiError(err, { operation: "toggleBookmark", oppId });
        this.showToast(safeMsg || "Could not sync bookmark with cloud. Saved locally.", "warning");
      } finally {
        if (btnEl) btnEl.style.pointerEvents = "";
      }
    } else {
      if (btnEl) btnEl.style.pointerEvents = "";
    }
  }

  async renderBookmarks() {
    const grid = document.getElementById("bookmarksGrid");
    if (!grid) return;

    grid.innerHTML = this.renderSkeletons(4);

    let bookmarkedOpps = [];

    try {
      // If authenticated, fetch from backend
      if (window.authManager.isAuthenticated()) {
        try {
          const data = await window.ApiClient.getBookmarks();
          bookmarkedOpps = (data.bookmarks || []).map(b => b.opp_opportunities).filter(Boolean);
          const serverIds = bookmarkedOpps.map(o => Number(o.id));
          this.bookmarks = new Set([...this.bookmarks, ...serverIds]);
          try {
            localStorage.setItem("cd_saved_bookmarks", JSON.stringify(Array.from(this.bookmarks)));
          } catch (e) {}
          this.updateBookmarkBadges();
        } catch (err) {
          // Fallback to local cached bookmarks if server fetch fails
        }
      }

      // Fallback: match from already-loaded opportunities
      if (bookmarkedOpps.length === 0 && this.bookmarks.size > 0) {
        bookmarkedOpps = this.opportunities.filter(opp => this.bookmarks.has(Number(opp.id)));
      }

      // If still empty but we have bookmark IDs and this.opportunities is empty, fetch opportunities
      if (bookmarkedOpps.length === 0 && this.bookmarks.size > 0 && this.opportunities.length === 0) {
        try {
          const data = await window.ApiClient.getOpportunities({ limit: 100 });
          if (data && data.opportunities) {
            this.opportunities = data.opportunities;
            bookmarkedOpps = this.opportunities.filter(opp => this.bookmarks.has(Number(opp.id)));
          }
        } catch (e) {}
      }

      if (bookmarkedOpps.length === 0) {
        grid.innerHTML = `
          <div class="designed-empty-state">
            <div class="empty-state-icon-wrap" style="background: #FAF5FF; color: #7C3AED;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h3 class="empty-state-title">No Saved Bookmarks Yet</h3>
            <p class="empty-state-desc">Click the bookmark icon on any hackathon, coding contest, or fellowship to save it here for quick access.</p>
            <button type="button" class="btn-apply-action" onclick="window.app.switchTab('explore')">
              Explore Opportunities
            </button>
          </div>
        `;
        return;
      }

      grid.innerHTML = bookmarkedOpps.map(opp => this.renderOpportunityCard(opp)).filter(Boolean).join("");
    } catch (err) {
      const safeMsg = window.ApiClient?.handleApiError(err, { operation: "renderBookmarks" }) ||
                      "Failed to retrieve saved bookmarks. Please try again.";
      grid.innerHTML = `
        <div class="scoped-error-boundary">
          <div class="scoped-error-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <h3 class="scoped-error-title">This section failed to load</h3>
          <p class="scoped-error-desc">${safeMsg}</p>
          <button type="button" class="btn-apply-action" onclick="window.app.renderBookmarks()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            Try Again
          </button>
        </div>
      `;
    }
  }

  // ── Apply & Details ───────────────────────────────────────────────────────
  async applyToOpportunity(oppId, applyUrl) {
    if (applyUrl && applyUrl.startsWith("http")) {
      window.open(applyUrl, "_blank", "noopener,noreferrer");
    } else {
      this.showToast("Application link not available", "error");
    }
  }

  async showOpportunityDetails(oppId) {
    const modal = document.getElementById("detailsModal");
    const content = document.getElementById("detailsModalContent");
    if (!modal || !content) return;

    content.innerHTML = `<div style="text-align:center; padding: 40px;"><p>Loading opportunity details...</p></div>`;
    this.openModal("detailsModal");

    try {
      const opp = await window.ApiClient.getOpportunity(oppId);
      content.innerHTML = `
        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
          <span class="badge-tag badge-type-blue">${this.escapeHtml((opp.opportunity_type || "Event").toUpperCase())}</span>
          <span class="badge-tag badge-mode">${this.escapeHtml(opp.mode || "Online")}</span>
          <span class="badge-tag badge-actively-hiring"><span class="dot"></span> ${this.escapeHtml(opp.status || "Open")}</span>
        </div>
        <h2 style="font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; margin-bottom: 6px; color: var(--text-primary);">${this.escapeHtml(opp.title)}</h2>
        <div style="color: var(--brand-primary); font-weight: 600; font-size: 0.95rem; margin-bottom: 20px;">Organized by ${this.escapeHtml(opp.organizer || "Verified Organizer")}</div>

        <div class="card-metadata-list" style="margin-bottom: 20px;">
          <div class="meta-item-row" style="margin-bottom: 6px;">
            <span style="color: var(--text-muted);">Total Prize Pool:</span>
            <span class="meta-item-val prize">${this.escapeHtml(opp.prize_pool || "Prizes / Certificates")}</span>
          </div>
          <div class="meta-item-row">
            <span style="color: var(--text-muted);">Registration Deadline:</span>
            <span class="meta-item-val">${this.formatDate(opp.deadline)}</span>
          </div>
        </div>

        <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">About This Opportunity</h4>
        <div style="color: var(--text-secondary); line-height: 1.7; font-size: 0.92rem; margin-bottom: 20px; white-space: pre-line;">
          ${this.escapeHtml(opp.description || "No detailed description provided.")}
        </div>

        ${opp.eligibility ? `
          <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">Eligibility</h4>
          <p style="color: var(--text-secondary); font-size: 0.92rem; margin-bottom: 24px;">${this.escapeHtml(opp.eligibility)}</p>
        ` : ""}

        <div style="display: flex; gap: 12px; margin-top: 24px;">
          <button class="btn-apply-action" style="flex: 1; justify-content: center; height: 46px;" onclick="window.app.applyToOpportunity(${opp.id}, '${this.escapeHtml(opp.apply_url)}')">
            Go to Official Registration Portal
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </button>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">Error loading details.</div>`;
    }
  }



  // ── Hero & Platform Stats ──────────────────────────────────────────────────
  async updateHeroStats() {
    try {
      const stats = await window.ApiClient.getOpportunityStats();
      const total = stats.total || 914;
      const prizeFormatted = stats.total_prize_formatted || "₹40.9 Cr+";
      const closingSoon = stats.closing_this_week != null ? stats.closing_this_week : 321;

      const activeCountEl = document.getElementById("statActiveCount");
      if (activeCountEl) activeCountEl.textContent = total;

      const heroActive = document.getElementById("heroActiveBadge");
      if (heroActive) heroActive.textContent = `${total} Verified`;

      const prizeEl = document.getElementById("statPrizeCount");
      if (prizeEl) prizeEl.textContent = prizeFormatted;

      const heroPrize = document.getElementById("heroPrizeBadge");
      if (heroPrize) heroPrize.textContent = prizeFormatted;

      const urgentEl = document.getElementById("statUrgentCount");
      if (urgentEl) urgentEl.textContent = closingSoon;

      const liveBadge = document.getElementById("liveContestsBadgeCount");
      if (liveBadge) liveBadge.textContent = total;

      const drawerExplore = document.getElementById("drawerExploreBadge");
      if (drawerExplore) drawerExplore.textContent = total;

      const liveChip = document.getElementById("workspaceLiveContestsCount");
      if (liveChip) liveChip.innerHTML = `<strong>${total}</strong> Contests Live`;

      const totalEl = document.getElementById("oppsTotalCount");
      if (totalEl) totalEl.textContent = total;

      if (stats.categories) {
        const catMap = {
          all: `All Opportunities (${stats.categories.all || total})`,
          hackathon: `Hackathons (${stats.categories.hackathons || 0})`,
          contest: `Coding Contests (${stats.categories.coding || 0})`,
          competition: `Competitions (${stats.categories.competitions || 0})`,
          innovation: `Design & Innovation (${stats.categories.design || 0})`,
          case_study: `Case Studies & Quizzes (${stats.categories.quizzes || 0})`
        };
        document.querySelectorAll(".filter-pill[data-type]").forEach(pill => {
          const type = pill.dataset.type;
          if (catMap[type]) {
            pill.textContent = catMap[type];
          }
        });
      }
    } catch (e) {
      // Silent fallback if real stats endpoint is temporarily unavailable
    }
  }

  // ── Profile Management ───────────────────────────────────────────────────
  addSkillToProfile(skill) {
    const input = document.getElementById("profileSkills");
    if (!input) return;
    const current = (input.value || "").trim();
    if (!current) {
      input.value = skill;
    } else {
      const skillsArray = current.split(",").map(s => s.trim().toLowerCase());
      if (!skillsArray.includes(skill.toLowerCase())) {
        input.value = `${current}, ${skill}`;
      }
    }
    input.focus();
  }

  openProfileModal() {
    if (!window.authManager || !window.authManager.isAuthenticated()) {
      window.authManager.signInWithGoogle();
      return;
    }

    const profile = window.authManager.getUserData() || {};

    // Clear previous inline errors
    document.querySelectorAll(".form-error-msg").forEach(el => { el.style.display = "none"; el.textContent = ""; });
    document.querySelectorAll(".form-input.has-error").forEach(el => el.classList.remove("has-error"));

    const avatarEl = document.getElementById("profileModalAvatar");
    const nameEl = document.getElementById("profileModalTitle");
    const emailEl = document.getElementById("profileModalEmail");

    const defaultAvatarSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23008BDC'/%3E%3Cstop offset='100%25' stop-color='%23006BC7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='50' fill='url(%23g)'/%3E%3Ccircle cx='50' cy='40' r='18' fill='%23FFFFFF' opacity='0.9'/%3E%3Cpath d='M20 85 C20 66 35 62 50 62 C65 62 80 66 80 85 Z' fill='%23FFFFFF' opacity='0.9'/%3E%3C/svg%3E";
    if (avatarEl) {
      avatarEl.src = profile.avatar_url || defaultAvatarSvg;
    }
    if (nameEl) nameEl.textContent = profile.full_name || "Student Profile";
    if (emailEl) emailEl.textContent = profile.email || "";

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };

    setVal("profileFullName", profile.full_name);
    setVal("profileCollegeName", profile.college_name);
    setVal("profileDegree", profile.degree);
    setVal("profileGraduationYear", profile.graduation_year);

    // Save snapshot of opened profile to detect concurrent edit conflicts
    this._profileSnapshot = {
      full_name: profile.full_name || "",
      college_name: profile.college_name || "",
      degree: profile.degree || "",
      graduation_year: profile.graduation_year || "",
      updated_at: profile.updated_at || Date.now()
    };
    this._profileOpenedAt = Date.now();

    this.openModal("profileModal");
  }

  async saveProfile() {
    // 1. Offline network check
    if (!navigator.onLine) {
      this.showToast("You are offline. Cannot save changes until connection is restored.", "error");
      return;
    }

    // 2. Validate all fields client-side before API call
    if (this.validateProfileForm && !this.validateProfileForm()) {
      this.showToast("Please correct the errors in the form before submitting.", "error");
      return;
    }

    const fullNameInput = document.getElementById("profileFullName");
    const fullName = (fullNameInput?.value || "").trim();

    // 3. Concurrent edit conflict detection
    const currentLiveProfile = window.authManager.getUserData() || {};
    if (this._profileSnapshot && currentLiveProfile.updated_at &&
        this._profileSnapshot.updated_at &&
        new Date(currentLiveProfile.updated_at).getTime() > new Date(this._profileSnapshot.updated_at).getTime()) {
      this.showToast("This profile was updated in another session. Please refresh to see latest version.", "warning");
      return;
    }

    // 4. Disable submit button & show spinner to prevent double-submissions
    const btn = document.getElementById("btnSaveProfile");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <div class="spinner" style="width: 14px; height: 14px; border: 2px solid #FFFFFF; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px;"></div>
        Saving...
      `;
    }

    const payload = {
      full_name: fullName,
      college_name: (document.getElementById("profileCollegeName")?.value || "").trim(),
      degree: (document.getElementById("profileDegree")?.value || "").trim(),
      graduation_year: (document.getElementById("profileGraduationYear")?.value || "").trim(),
    };

    try {
      const res = await window.ApiClient.updateProfile(payload);
      if (res && res.user) {
        window.authManager.profile = res.user;
        window.authManager.notifyListeners();
        this.showToast("Profile updated successfully!", "success");
        this.closeAllModals();
      } else {
        throw new Error(res?.error || "Failed to update profile.");
      }
    } catch (err) {
      // Form values are preserved in the input elements (we do NOT clear or reset)
      const safeMsg = window.ApiClient?.handleApiError(err, { operation: "save_profile", userId: window.authManager?.getUserId() }) ||
                      "Failed to save profile. Please verify your inputs.";

      // Inline field-specific error mapping if API reports a specific field issue
      const errLower = (err?.message || "").toLowerCase();
      if (errLower.includes("name") || errLower.includes("full_name")) {
        const fnErr = document.getElementById("profileFullNameError");
        if (fnErr) {
          fnErr.textContent = "Please enter a valid full name.";
          fnErr.style.display = "block";
        }
        fullNameInput?.classList.add("has-error");
      }

      this.showToast(safeMsg, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  }

  // ── Mobile Profile Sidebar Drawer (Jakob's Law Standard) ───────────────────
  openProfileDrawer() {
    const drawer = document.getElementById("profileDrawer");
    const backdrop = document.getElementById("profileDrawerBackdrop");
    if (drawer) drawer.classList.add("open");
    if (backdrop) {
      backdrop.style.display = "block";
      requestAnimationFrame(() => backdrop.classList.add("open"));
    }
    document.body.style.overflow = "hidden";
  }

  closeProfileDrawer() {
    const drawer = document.getElementById("profileDrawer");
    const backdrop = document.getElementById("profileDrawerBackdrop");
    if (drawer) drawer.classList.remove("open");
    if (backdrop) {
      backdrop.classList.remove("open");
      setTimeout(() => {
        if (!drawer || !drawer.classList.contains("open")) {
          if (backdrop) backdrop.style.display = "none";
        }
      }, 250);
    }
    document.body.style.overflow = "";
  }

  // ── Modals & Toasts ───────────────────────────────────────────────────────
  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add("open");
  }

  closeAllModals() {
    this.closeProfileDrawer();
    document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("open"));
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  calculateCountdown(deadlineStr) {
    if (!deadlineStr) return null;
    const deadline = new Date(deadlineStr);
    const now = new Date();
    const diffMs = deadline - now;

    if (diffMs <= 0) return { text: "Closed", isUrgent: false };

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days === 0) {
      return { text: `${hours}h left`, isUrgent: true };
    }
    if (days <= 3) {
      return { text: `${days}d left`, isUrgent: true };
    }
    return { text: `${days}d left`, isUrgent: false };
  }

  formatDate(dateStr) {
    if (!dateStr) return "Rolling";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  renderSkeletons(count = 6) {
    return Array.from({ length: count }).map(() => `
      <div class="opportunity-card skeleton-card" style="pointer-events: none; opacity: 0.85;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <div style="display: flex; gap: 6px;">
              <div class="skeleton" style="height: 22px; width: 80px; border-radius: 999px;"></div>
              <div class="skeleton" style="height: 22px; width: 65px; border-radius: 999px;"></div>
            </div>
            <div class="skeleton" style="height: 32px; width: 32px; border-radius: 50%;"></div>
          </div>
          <div class="skeleton" style="height: 24px; width: 88%; margin-bottom: 8px; border-radius: 6px;"></div>
          <div class="skeleton" style="height: 16px; width: 55%; margin-bottom: 16px; border-radius: 4px;"></div>
          <div style="display: flex; gap: 8px; margin-bottom: 16px;">
            <div class="skeleton" style="height: 26px; width: 90px; border-radius: 6px;"></div>
            <div class="skeleton" style="height: 26px; width: 110px; border-radius: 6px;"></div>
          </div>
          <div class="skeleton" style="height: 36px; width: 100%; border-radius: 8px; margin-bottom: 16px;"></div>
        </div>
        <div class="skeleton" style="height: 42px; width: 100%; border-radius: 8px;"></div>
      </div>
    `).join("");
  }

  async checkGlobalAnnouncement() {
    const banner = document.getElementById("globalAnnouncementBanner");
    if (!banner) return;

    try {
      const data = await window.ApiClient.getPublicAnnouncement();
      if (data && data.announcement && data.announcement.is_active && data.announcement.message) {
        const a = data.announcement;
        const typeClass = `banner-${a.badge_type || "info"}`;
        banner.className = `site-announcement-container ${typeClass}`;
        
        let actionBtnHtml = "";
        if (a.action_url && a.action_label) {
          actionBtnHtml = `<a href="${this.escapeHtml(a.action_url)}" target="_blank" rel="noopener noreferrer" class="announcement-action-btn">${this.escapeHtml(a.action_label)} &rarr;</a>`;
        }

        banner.innerHTML = `
          <div class="announcement-content-inner">
            <span class="announcement-badge-pill">${this.escapeHtml((a.badge_type || "UPDATE").toUpperCase())}</span>
            <span class="announcement-message-text">${this.escapeHtml(a.message)}</span>
            ${actionBtnHtml}
          </div>
          <button type="button" class="announcement-dismiss-btn" id="btnDismissAnnouncement" aria-label="Dismiss announcement">&times;</button>
        `;
        banner.style.display = "block";

        const btnDismiss = document.getElementById("btnDismissAnnouncement");
        if (btnDismiss) {
          btnDismiss.addEventListener("click", () => {
            banner.style.display = "none";
          });
        }
      } else {
        banner.style.display = "none";
      }
    } catch (err) {
      banner.style.display = "none";
    }
  }
}

// Instantiate on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  // Splash screen safety watchdog: guarantee splash is dismissed even under heavy network latency
  setTimeout(() => {
    const splash = document.getElementById("authSplashScreen");
    if (splash && !splash.classList.contains("splash-hidden")) {
      splash.classList.add("splash-hidden");
      setTimeout(() => {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
        document.body.classList.remove("auth-pending");
      }, 300);
    } else {
      document.body.classList.remove("auth-pending");
    }
  }, 3500);

  window.app = new OpportunityApp();
  if (window.AppConfig?.load) {
    await window.AppConfig.load();
  }
  if (window.authManager?.init) {
    await window.authManager.init();
  }
  window.app.init();
});
