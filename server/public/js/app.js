/**
 * Kith Personal CRM - Main Application Controller
 *
 * Handles routing, state management, authentication, and global UI interactions.
 */

window.app = {
  // ============================================================================
  // STATE
  // ============================================================================

  currentUser: null,
  currentPage: 'dashboard',
  spicyMode: false,
  spicyEnabled: false,
  settings: {},
  favorites: [],
  groups: [],
  contactsCache: {},
  eventsCache: {},
  isLoading: false,
  importPollInterval: null,
  importWidgetVisible: false,

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the app on page load
   */
  async init() {
    // Check for existing token
    const token = localStorage.getItem('kith_token');
    if (token) {
      window.api.token = token;
      try {
        const user = await window.api.getMe();
        if (user) {
          this.currentUser = user;
          this.showApp();
          await this.loadAppData();
          this.setupRouter();
          this.setupEventHandlers();
          this.startImportPolling();
          return;
        }
      } catch (err) {
        console.log('Token invalid, showing login');
      }
    }

    // No valid token
    this.showLogin();
  },

  /**
   * Load settings, favorites, and groups
   */
  async loadAppData() {
    try {
      const [settings, favorites, groups] = await Promise.all([
        window.api.getSettings(),
        window.api.getContacts({ favorites: true, limit: 50 }),
        window.api.getGroups(),
      ]);

      this.settings = settings || {};
      this.favorites = (favorites.data || []).slice(0, 10);
      this.groups = groups || [];
      this.spicyEnabled = settings?.spicyEnabled || false;

      // Load preferences
      const prefs = await window.api.getPreferences();
      this.spicyMode = prefs?.spicyMode || false;

      // Update UI
      this.updateUserInfo();
      this.loadFavorites();
      this.loadGroups();
      this.updateAppSettings();
    } catch (err) {
      console.error('Failed to load app data:', err);
    }
  },

  // ============================================================================
  // ROUTER
  // ============================================================================

  /**
   * Navigate to a page with optional parameters
   */
  async navigate(page, params = {}) {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      // Update current page
      this.currentPage = page;

      // Update URL hash
      const hash = this._paramsToHash(page, params);
      window.location.hash = hash;

      // Render page
      const pageFunction = window.pages[page];
      if (!pageFunction) {
        window.utils.toast(`Page "${page}" not found`, 'error');
        this.isLoading = false;
        return;
      }

      const html = await pageFunction.call(window.pages, params);
      const pageContent = document.getElementById('pageContent');
      if (pageContent) {
        pageContent.innerHTML = html;
      }

      // Update nav highlighting
      this.updateNavHighlight(page);

      // Close sidebar on mobile after navigation
      this.closeMobileSidebar();
    } catch (err) {
      console.error('Navigation error:', err);
      window.utils.toast('Failed to load page', 'error');
    } finally {
      this.isLoading = false;
    }
  },

  /**
   * Setup router to listen for hash changes
   */
  setupRouter() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1);
      const { page, params } = this._hashToParams(hash);
      this.navigate(page, params);
    });

    // Initial navigation from hash
    const initialHash = window.location.hash.slice(1);
    if (initialHash) {
      const { page, params } = this._hashToParams(initialHash);
      this.navigate(page, params);
    } else {
      this.navigate('dashboard');
    }
  },

  /**
   * Convert page and params to URL hash
   */
  _paramsToHash(page, params) {
    if (Object.keys(params).length === 0) {
      return `/${page}`;
    }
    const qs = window.utils.buildQueryString(params);
    return `/${page}${qs ? '?' + qs : ''}`;
  },

  /**
   * Convert URL hash to page and params
   */
  _hashToParams(hash) {
    const [path, qs] = hash.split('?');
    const page = path.replace(/^\//, '') || 'dashboard';
    const params = {};

    if (qs) {
      const searchParams = new URLSearchParams(qs);
      for (const [key, value] of searchParams.entries()) {
        params[key] = value;
      }
    }

    return { page, params };
  },

  /**
   * Update nav highlighting based on current page
   */
  updateNavHighlight(page) {
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.dataset.page === page) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  },

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Handle login form submission
   */
  async handleLogin(username, password) {
    try {
      const result = await window.api.login(username, password);
      if (result && result.user) {
        this.currentUser = result.user;
        this.showApp();
        await this.loadAppData();
        this.setupRouter();
        this.setupEventHandlers();
        this.startImportPolling();
        window.utils.toast('Welcome back!', 'success');
      }
    } catch (err) {
      console.error('Login failed:', err);
      window.utils.toast(err.message || 'Login failed', 'error');
    }
  },

  /**
   * Logout and return to login page
   */
  logout() {
    localStorage.removeItem('kith_token');
    window.api.token = null;
    this.currentUser = null;
    this.showLogin();
  },

  // ============================================================================
  // UI VISIBILITY
  // ============================================================================

  /**
   * Show login page, hide app
   */
  showLogin() {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
  },

  /**
   * Show app, hide login page
   */
  showApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
  },

  // ============================================================================
  // SIDEBAR MANAGEMENT
  // ============================================================================

  /**
   * Load and render favorites in sidebar
   */
  loadFavorites() {
    const container = document.getElementById('favoritesContent');
    if (!container) return;

    const html = this.favorites
      .map(contact => `
        <a class="sidebar-item" data-contact-id="${window.utils.escapeHtml(contact.id)}">
          ${window.components.avatar(contact.photoUrl, contact.firstName || '', 'sm')}
          <span class="sidebar-item-text">${window.utils.escapeHtml(window.utils.truncate((contact.firstName || '') + ' ' + (contact.lastName || ''), 20))}</span>
        </a>
      `)
      .join('');

    container.innerHTML = html || '<p class="sidebar-empty">No favorites yet</p>';

    container.querySelectorAll('.sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.contactId;
        this.navigate('contact-detail', { id });
      });
    });
  },

  /**
   * Load and render groups in sidebar
   */
  loadGroups() {
    const container = document.getElementById('groupsContent');
    if (!container) return;

    const html = this.groups
      .slice(0, 5)
      .map(group => `
        <a class="sidebar-item" data-group-id="${window.utils.escapeHtml(group.id)}">
          <span class="sidebar-item-icon">${window.utils.lucideIcon('folder', 14)}</span>
          <span class="sidebar-item-text">${window.utils.escapeHtml(window.utils.truncate(group.name, 20))}</span>
        </a>
      `)
      .join('');

    container.innerHTML = html || '<p class="sidebar-empty">No groups</p>';

    container.querySelectorAll('.sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.groupId;
        this.navigate('contacts', { group: id });
      });
    });
  },

  /**
   * Update user info in sidebar
   */
  updateUserInfo() {
    if (!this.currentUser) return;

    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserRole = document.getElementById('sidebarUserRole');

    if (sidebarUserName) {
      sidebarUserName.textContent = this.currentUser.username;
    }
    if (sidebarUserRole) {
      sidebarUserRole.textContent = window.utils.formatRole(this.currentUser.role);
    }

    // Show settings nav if admin
    const settingsNav = document.getElementById('settingsNav');
    if (settingsNav) {
      settingsNav.style.display = this.currentUser.role === 'main_admin' ? 'flex' : 'none';
    }
  },

  /**
   * Toggle mobile sidebar visibility
   */
  toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const isOpen = sidebar.classList.contains('open');

    if (isOpen) {
      this.closeMobileSidebar();
    } else {
      sidebar.classList.add('open');
      overlay.classList.add('open');
    }
  },

  /**
   * Close mobile sidebar
   */
  closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  },

  // ============================================================================
  // SPICY MODE
  // ============================================================================

  /**
   * Toggle spicy mode with transition
   */
  async toggleSpicyMode() {
    if (!this.spicyEnabled) {
      window.utils.toast('Spicy mode is not enabled', 'info');
      return;
    }

    try {
      this.spicyMode = !this.spicyMode;

      // Update preference
      await window.api.updatePreference('spicyMode', this.spicyMode);

      // Update UI
      const mainApp = document.getElementById('mainApp');
      if (this.spicyMode) {
        mainApp.classList.add('spicy-mode');
        window.utils.toast('Spicy mode enabled', 'success');
      } else {
        mainApp.classList.remove('spicy-mode');
        window.utils.toast('Spicy mode disabled', 'success');
      }

      // Animate transition
      document.documentElement.style.transition = 'color 600ms ease-in-out';
      setTimeout(() => {
        document.documentElement.style.transition = '';
      }, 600);
    } catch (err) {
      console.error('Failed to toggle spicy mode:', err);
      window.utils.toast('Failed to toggle spicy mode', 'error');
    }
  },

  // ============================================================================
  // MODALS - CONTACT
  // ============================================================================

  /**
   * Open add/edit contact modal
   */
  openEditContactModal(contactId = null) {
    const modal = this._createContactModal(contactId);
    document.body.appendChild(modal);
  },

  /**
   * Create contact modal element
   */
  _createContactModal(contactId) {
    const container = document.createElement('div');
    container.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = contactId ? 'Edit Contact' : 'Add New Contact';

    const formSections = contactId ? '' : `
      <div class="form-section">
        <h4>Basic Info</h4>
        <input type="text" class="input" placeholder="First name" id="firstName" required>
        <input type="text" class="input" placeholder="Last name" id="lastName">
      </div>

      <div class="form-section">
        <h4>Personal</h4>
        <input type="date" class="input" placeholder="Birthday" id="birthday">
        <input type="text" class="input" placeholder="Location" id="location">
        <textarea class="input" placeholder="Bio" id="bio" rows="3"></textarea>
      </div>

      <div class="form-section">
        <h4>Professional</h4>
        <input type="text" class="input" placeholder="Occupation" id="occupation">
        <input type="text" class="input" placeholder="Company" id="company">
        <input type="url" class="input" placeholder="Website" id="website">
      </div>

      <div class="form-section">
        <h4>How We Met</h4>
        <input type="text" class="input" placeholder="How we met" id="howWeMet">
        <input type="date" class="input" placeholder="Date met" id="metDate">
        <select class="select" id="relationshipType">
          <option value="">Select relationship type…</option>
          <option value="friend">Friend</option>
          <option value="family">Family</option>
          <option value="work">Work</option>
          <option value="acquaintance">Acquaintance</option>
        </select>
      </div>
    `;

    modal.innerHTML = `
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="btn-icon" id="closeModalBtn">
          ${window.utils.lucideIcon('x', 20)}
        </button>
      </div>

      <div class="modal-body">
        ${formSections}
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
        <button class="btn btn-primary" id="saveContactBtn">${contactId ? 'Update' : 'Create'}</button>
      </div>
    `;

    container.appendChild(modal);

    // Event handlers
    const closeBtn = modal.querySelector('#closeModalBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => container.remove());
    }

    const cancelBtn = modal.querySelector('#cancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => container.remove());
    }

    const saveBtn = modal.querySelector('#saveContactBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const data = {
          firstName: document.getElementById('firstName')?.value || '',
          lastName: document.getElementById('lastName')?.value || '',
          birthday: document.getElementById('birthday')?.value || null,
          location: document.getElementById('location')?.value || '',
          bio: document.getElementById('bio')?.value || '',
          occupation: document.getElementById('occupation')?.value || '',
          company: document.getElementById('company')?.value || '',
          website: document.getElementById('website')?.value || '',
          how_we_met: document.getElementById('howWeMet')?.value || '',
          met_date: document.getElementById('metDate')?.value || null,
          relationship_type: document.getElementById('relationshipType')?.value || '',
        };

        try {
          if (contactId) {
            await window.api.updateContact(contactId, data);
            window.utils.toast('Contact updated', 'success');
            this.navigate('contact-detail', { id: contactId });
          } else {
            const result = await window.api.createContact(data);
            window.utils.toast('Contact created', 'success');
            this.navigate('contact-detail', { id: result.id });
          }
          container.remove();
        } catch (err) {
          window.utils.toast('Failed to save contact', 'error');
        }
      });
    }

    container.addEventListener('click', (e) => {
      if (e.target === container) container.remove();
    });

    return container;
  },

  // ============================================================================
  // MODALS - EVENT
  // ============================================================================

  /**
   * Open create event modal
   */
  openEventModal(eventId = null) {
    const modal = this._createEventModal(eventId);
    document.body.appendChild(modal);
  },

  /**
   * Create event modal element
   */
  _createEventModal(eventId) {
    const container = document.createElement('div');
    container.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-header">
        <h2>${eventId ? 'Edit Event' : 'Create Event'}</h2>
        <button class="btn-icon" id="closeEventModalBtn">
          ${window.utils.lucideIcon('x', 20)}
        </button>
      </div>

      <div class="modal-body">
        <div class="form-section">
          <input type="text" class="input" placeholder="Event title" id="eventTitle" required>
          <input type="date" class="input" id="eventDate" required>
          <input type="time" class="input" id="eventTime">
          <input type="text" class="input" placeholder="Location" id="eventLocation">
          <textarea class="input" placeholder="Description" id="eventDesc" rows="3"></textarea>
          <select class="select" id="eventType">
            <option value="birthday">Birthday</option>
            <option value="meeting">Meeting</option>
            <option value="anniversary">Anniversary</option>
            <option value="trip">Trip</option>
            <option value="other">Other</option>
          </select>
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="eventSpicy">
            Mark as spicy
          </label>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelEventBtn">Cancel</button>
        <button class="btn btn-primary" id="saveEventBtn">${eventId ? 'Update' : 'Create'}</button>
      </div>
    `;

    container.appendChild(modal);

    const closeBtn = modal.querySelector('#closeEventModalBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => container.remove());
    }

    const cancelBtn = modal.querySelector('#cancelEventBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => container.remove());
    }

    const saveBtn = modal.querySelector('#saveEventBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const title = document.getElementById('eventTitle')?.value || '';
        if (!title) {
          window.utils.toast('Event title is required', 'error');
          return;
        }

        const data = {
          title,
          type: document.getElementById('eventType')?.value || 'other',
          description: document.getElementById('eventDesc')?.value || '',
          location: document.getElementById('eventLocation')?.value || '',
          startDate: document.getElementById('eventDate')?.value,
          endDate: document.getElementById('eventDate')?.value,
          is_spicy: document.getElementById('eventSpicy')?.checked || false,
        };

        try {
          if (eventId) {
            await window.api.updateEvent(eventId, data);
            window.utils.toast('Event updated', 'success');
          } else {
            const result = await window.api.createEvent(data);
            window.utils.toast('Event created', 'success');
          }
          this.navigate('events');
          container.remove();
        } catch (err) {
          window.utils.toast('Failed to save event', 'error');
        }
      });
    }

    container.addEventListener('click', (e) => {
      if (e.target === container) container.remove();
    });

    return container;
  },

  // ============================================================================
  // MODALS - GROUP
  // ============================================================================

  /**
   * Open create group modal
   */
  openGroupModal(groupId = null) {
    const modal = this._createGroupModal(groupId);
    document.body.appendChild(modal);
  },

  /**
   * Create group modal element
   */
  _createGroupModal(groupId) {
    const container = document.createElement('div');
    container.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-header">
        <h2>${groupId ? 'Edit Group' : 'Create Group'}</h2>
        <button class="btn-icon" id="closeGroupModalBtn">
          ${window.utils.lucideIcon('x', 20)}
        </button>
      </div>

      <div class="modal-body">
        <div class="form-section">
          <input type="text" class="input" placeholder="Group name" id="groupName" required>
          <textarea class="input" placeholder="Description" id="groupDesc" rows="3"></textarea>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelGroupBtn">Cancel</button>
        <button class="btn btn-primary" id="saveGroupBtn">${groupId ? 'Update' : 'Create'}</button>
      </div>
    `;

    container.appendChild(modal);

    const closeBtn = modal.querySelector('#closeGroupModalBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => container.remove());
    }

    const cancelBtn = modal.querySelector('#cancelGroupBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => container.remove());
    }

    const saveBtn = modal.querySelector('#saveGroupBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const name = document.getElementById('groupName')?.value || '';
        if (!name) {
          window.utils.toast('Group name is required', 'error');
          return;
        }

        const data = {
          name,
          description: document.getElementById('groupDesc')?.value || '',
        };

        try {
          if (groupId) {
            await window.api.updateGroup(groupId, data);
            window.utils.toast('Group updated', 'success');
          } else {
            const result = await window.api.createGroup(data);
            window.utils.toast('Group created', 'success');
          }
          this.navigate('groups');
          container.remove();
        } catch (err) {
          window.utils.toast('Failed to save group', 'error');
        }
      });
    }

    container.addEventListener('click', (e) => {
      if (e.target === container) container.remove();
    });

    return container;
  },

  // ============================================================================
  // COMMAND PALETTE
  // ============================================================================

  /**
   * Open command palette
   */
  openCommandPalette() {
    const palette = document.getElementById('cmdPalette');
    if (!palette) return;

    palette.style.display = 'flex';
    const input = document.getElementById('cmdInput');
    if (input) {
      input.focus();
      input.value = '';
    }

    this._updateCommandList('');
  },

  /**
   * Close command palette
   */
  closeCommandPalette() {
    const palette = document.getElementById('cmdPalette');
    if (palette) {
      palette.style.display = 'none';
    }
  },

  /**
   * Update command list based on search
   */
  _updateCommandList(query) {
    const list = document.getElementById('cmdList');
    if (!list) return;

    const commands = [
      { name: 'New Contact', icon: 'user-plus', action: () => this.openEditContactModal() },
      { name: 'New Event', icon: 'calendar', action: () => this.openEventModal() },
      { name: 'New Group', icon: 'folder', action: () => this.openGroupModal() },
      { name: 'Toggle Spicy Mode', icon: 'flame', action: () => this.toggleSpicyMode() },
      { name: 'Go to Dashboard', icon: 'home', action: () => this.navigate('dashboard') },
      { name: 'Go to Contacts', icon: 'users', action: () => this.navigate('contacts') },
      { name: 'Go to Events', icon: 'calendar', action: () => this.navigate('events') },
      { name: 'Go to Settings', icon: 'settings', action: () => this.navigate('settings') },
      { name: 'Sign Out', icon: 'log-out', action: () => this.logout() },
    ];

    // Filter commands
    const filtered = query
      ? commands.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
      : commands;

    list.innerHTML = filtered
      .map((cmd, idx) => `
        <div class="cmd-item" data-index="${idx}">
          <span class="cmd-icon">${window.utils.lucideIcon(cmd.icon, 16)}</span>
          <span class="cmd-name">${cmd.name}</span>
        </div>
      `)
      .join('');

    // Attach event listeners
    list.querySelectorAll('.cmd-item').forEach((item, idx) => {
      item.addEventListener('click', () => {
        filtered[idx].action();
        this.closeCommandPalette();
      });
    });
  },

  // ============================================================================
  // SETTINGS
  // ============================================================================

  /**
   * Update app UI based on settings
   */
  updateAppSettings() {
    // Update app name
    const appName = this.settings?.appName || 'Kith';
    document.getElementById('sidebarAppName').textContent = appName;
    document.getElementById('mobAppName').textContent = appName;
    document.title = appName;

    // Update accent color
    if (this.settings?.accentColor) {
      document.documentElement.style.setProperty('--accent-color', this.settings.accentColor);
    }

    // Update spicy mode class
    const mainApp = document.getElementById('mainApp');
    if (this.spicyMode && mainApp) {
      mainApp.classList.add('spicy-mode');
    }

    // Show/hide spicy toggle
    const spicyToggle = document.getElementById('spicyToggle');
    if (spicyToggle) {
      spicyToggle.style.display = this.spicyEnabled ? 'flex' : 'none';
    }
  },

  // ============================================================================
  // IMPORT POLLING
  // ============================================================================

  /**
   * Start polling for active imports
   */
  startImportPolling() {
    if (this.importPollInterval) {
      clearInterval(this.importPollInterval);
    }

    this.importPollInterval = setInterval(async () => {
      try {
        const jobs = await window.api.getImportJobs();
        const activeJob = jobs?.find(j => j.status === 'processing');

        if (activeJob) {
          this._showImportWidget(activeJob);
        } else {
          this._hideImportWidget();
        }
      } catch (err) {
        console.error('Import polling error:', err);
      }
    }, 5000);
  },

  /**
   * Show import progress widget
   */
  _showImportWidget(job) {
    const widget = document.getElementById('importWidget');
    if (!widget) return;

    const progress = (job.processedCount / job.totalCount) * 100 || 0;

    widget.style.display = 'flex';
    document.getElementById('importWidgetTitle').textContent = `Processing ${job.platform} import…`;
    document.getElementById('importProgressBar').style.width = progress + '%';
    document.getElementById('importWidgetStats').innerHTML = `
      <div class="stat">${job.processedCount} of ${job.totalCount}</div>
      <div class="stat">${Math.round(progress)}%</div>
    `;

    if (job.status === 'review_pending') {
      const reviewBtn = document.getElementById('importReviewBtn');
      if (reviewBtn) {
        reviewBtn.style.display = 'block';
        reviewBtn.onclick = () => this.navigate('import-review', { jobId: job.id });
      }
    }

    this.importWidgetVisible = true;
  },

  /**
   * Hide import progress widget
   */
  _hideImportWidget() {
    const widget = document.getElementById('importWidget');
    if (widget && this.importWidgetVisible) {
      widget.style.display = 'none';
      this.importWidgetVisible = false;
    }
  },

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Setup global event handlers
   */
  setupEventHandlers() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        this.handleLogin(username, password);
      });
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        window.utils.confirm('Sign out?', () => this.logout());
      });
    }

    // Add contact button
    const addContactBtn = document.getElementById('addContactBtn');
    if (addContactBtn) {
      addContactBtn.addEventListener('click', () => {
        this.openEditContactModal();
      });
    }

    // Mobile menu button
    const mobMenuBtn = document.getElementById('mobMenuBtn');
    if (mobMenuBtn) {
      mobMenuBtn.addEventListener('click', () => {
        this.toggleMobileSidebar();
      });
    }

    // Sidebar overlay
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', () => {
        this.closeMobileSidebar();
      });
    }

    // Spicy toggle
    const spicyToggle = document.getElementById('spicyToggle');
    if (spicyToggle) {
      spicyToggle.addEventListener('click', () => {
        this.toggleSpicyMode();
      });
    }

    // Command palette
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const palette = document.getElementById('cmdPalette');
        if (palette && palette.style.display === 'none') {
          this.openCommandPalette();
        } else {
          this.closeCommandPalette();
        }
      }

      // Close palette on Escape
      if (e.key === 'Escape') {
        this.closeCommandPalette();
      }
    });

    // Command palette search
    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) {
      cmdInput.addEventListener('input', (e) => {
        this._updateCommandList(e.target.value);
      });
    }

    // Global search in sidebar
    const globalSearch = document.getElementById('globalSearch');
    if (globalSearch) {
      globalSearch.addEventListener('keyup', window.utils.debounce((e) => {
        const query = e.target.value.trim();
        if (query) {
          this.navigate('contacts', { search: query });
        }
      }, 300));
    }

    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        this.navigate(page);
      });
    });

    // Password visibility toggle
    window.toggleLoginPassword = function() {
      const input = document.getElementById('loginPassword');
      const icon = document.getElementById('eyeIcon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        input.type = 'password';
        icon.innerHTML = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
      }
    };

    // Show/hide spicy content
    const spicyProfileElements = document.querySelectorAll('[data-spicy]');
    spicyProfileElements.forEach(el => {
      el.style.display = this.spicyMode ? 'block' : 'none';
    });
  },
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.app.init());
} else {
  window.app.init();
}
