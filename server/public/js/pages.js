/**
 * Kith Personal CRM - Page Renderers
 *
 * Each page function returns HTML string for that page.
 * After render (via setTimeout 0), initPage() is called to bind event listeners.
 */

window.pages = {
  // ============================================================================
  // DASHBOARD PAGE
  // ============================================================================

  dashboard: async function() {
    try {
      const [allContacts, reminders, events] = await Promise.all([
        window.api.getContacts({ limit: 1000, offset: 0 }),
        window.api.getDueReminders().catch(() => []),
        window.api.getEvents({ limit: 10, offset: 0, upcoming: true }),
      ]);

      const contactCount = allContacts?.total || 0;
      const contactList = allContacts?.data || [];
      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Get upcoming birthdays
      const birthdays = contactList
        .filter(c => c.birthday)
        .map(c => ({
          ...c,
          nextBirthday: this._getNextBirthday(c.birthday),
        }))
        .filter(c => {
          const bd = new Date(c.nextBirthday);
          return bd >= now && bd <= thirtyDaysLater;
        })
        .sort((a, b) => new Date(a.nextBirthday) - new Date(b.nextBirthday))
        .slice(0, 2);

      const reminderList = Array.isArray(reminders) ? reminders : (reminders?.data || []);
      const overdue = reminderList.filter(r => r.dueAt && new Date(r.dueAt) < now);
      const thisMonth = contactList.filter(c => {
        if (!c.createdAt) return false;
        const d = new Date(c.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;

      const upcomingCount = reminderList.filter(r =>
        r.dueAt && new Date(r.dueAt) > now && new Date(r.dueAt) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      ).length;

      const reconnectCount = contactList.filter(c => {
        if (!c.lastContactedAt) return true;
        const lastDate = new Date(c.lastContactedAt);
        const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);
        return daysSince >= 60;
      }).length;

      const upcomingEvents = (events?.data || []).slice(0, 4);
      const reconnectPeople = contactList
        .filter(c => !c.lastContactedAt || (now - new Date(c.lastContactedAt)) / (1000 * 60 * 60 * 24) >= 60)
        .sort((a, b) => new Date(a.lastContactedAt || 0) - new Date(b.lastContactedAt || 0))
        .slice(0, 5);

      const recentActivity = await this._getRecentActivity(contactList.slice(0, 50));

      const html = `
        <div class="page-header">
          <div class="page-header-left">
            <h1 class="page-title">Dashboard</h1>
          </div>
          <div class="page-header-actions"></div>
        </div>

        <div class="dash-two-col">
            <div class="dash-main">
              <!-- Stats Row -->
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-label">Total Contacts</div>
                  <div class="stat-value">${window.utils.escapeHtml(String(contactCount))}</div>
                  <div class="stat-change text-green">+${window.utils.escapeHtml(String(thisMonth))} this month</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Events This Month</div>
                  <div class="stat-value">${window.utils.escapeHtml(String(upcomingEvents.length))}</div>
                  <div class="stat-change text-muted">Scheduled</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Upcoming</div>
                  <div class="stat-value">${window.utils.escapeHtml(String(upcomingCount))}</div>
                  <div class="stat-change text-muted">Next 7 days</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Reconnect</div>
                  <div class="stat-value">${window.utils.escapeHtml(String(reconnectCount))}</div>
                  <div class="stat-change text-amber">60+ days</div>
                </div>
              </div>

              <!-- Recent Activity Section -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">Recent Activity</div>
                </div>
                <div class="card-body">
                  <div class="feed">
                    ${recentActivity}
                  </div>
                </div>
              </div>
            </div>

            <!-- RIGHT COLUMN: Sidebar cards -->
            <div class="dash-aside">
              <!-- Upcoming Events Card -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">Upcoming Events</div>
                  <a href="#" style="font-size: 0.75rem; color: var(--text-secondary); text-decoration: none;">View all</a>
                </div>
                <div class="card-body">
                  ${upcomingEvents.map(evt => `
                    <div class="upcoming-event-row">
                      <div class="upcoming-event-date">
                        <div class="upcoming-event-day">${new Date(evt.startsAt || evt.startsAt).getDate()}</div>
                        <div class="upcoming-event-month">${new Date(evt.startsAt || evt.startsAt).toLocaleDateString('en-US', { month: 'short' })}</div>
                      </div>
                      <div class="upcoming-event-info">
                        <div class="upcoming-event-title">${window.utils.escapeHtml(evt.title || evt.name || '')}</div>
                        <div class="upcoming-event-sub">${evt.startsAt ? window.utils.formatDateTime(evt.startsAt).split(' ').slice(-2).join(' ') : ''}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Reconnect Card -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">Reconnect</div>
                  <a href="#" style="font-size: 0.75rem; color: var(--text-secondary); text-decoration: none;">View all</a>
                </div>
                <div class="card-body">
                  ${reconnectPeople.map(person => {
                    const lastDays = person.lastContactedAt ? Math.floor((now - new Date(person.lastContactedAt)) / (1000 * 60 * 60 * 24)) : 999;
                    return `
                    <div class="reconnect-item">
                      <div class="av av-sm" style="background: rgba(124,91,245,0.12); color: var(--accent);">${window.utils.escapeHtml(String(person.displayName || '?')[0])}</div>
                      <div class="reconnect-item-info">
                        <div class="reconnect-item-name">${window.utils.escapeHtml(person.displayName || '')}</div>
                        <div class="reconnect-item-last">${lastDays} days ago</div>
                      </div>
                      <button class="btn btn-ghost btn-xs">
                        ${window.utils.lucideIcon('users', 12)}
                        Reach out
                      </button>
                    </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Birthdays Soon Card -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">Birthdays Soon</div>
                </div>
                <div class="card-body">
                  ${birthdays.map(b => {
                    const nextBd = new Date(b.nextBirthday);
                    const daysDiff = Math.floor((nextBd - now) / (1000 * 60 * 60 * 24));
                    return `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border);">
                      <div class="av av-sm" style="background: rgba(244,114,182,0.12); color: var(--pink);">${window.utils.escapeHtml(String(b.displayName || '?')[0])}</div>
                      <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">${window.utils.escapeHtml(b.displayName || '')}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 1px;">${window.utils.formatDate(b.nextBirthday)}</div>
                      </div>
                      <span class="badge badge-pink" style="font-size: 0.65rem;">${daysDiff}d</span>
                    </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>
      `;

      setTimeout(() => this._initDashboard(), 0);
      return html;
    } catch (err) {
      console.error('Dashboard error:', err);
      return `<div class="content-area"><div class="empty-state"><p>Error loading dashboard</p></div></div>`;
    }
  },

  _initDashboard() {
    // Add event listeners if needed
  },

  async _getRecentActivity(contacts) {
    const activities = [];
    // Mock recent activity - in a real app would come from an API
    activities.push(`
      <div class="feed-item">
        <div class="feed-icon" style="color: var(--text-accent); border-color: var(--accent-border); background: var(--accent-subtle);">
          ${window.utils.lucideIcon('edit-2', 13)}
        </div>
        <div class="feed-body">
          <div class="feed-title">Note added to ${window.utils.escapeHtml(contacts[0]?.firstName || 'Contact')}</div>
          <div class="feed-desc">"Follow up next week"</div>
          <div class="feed-time">Today at 2:45 PM</div>
        </div>
      </div>
    `);
    return activities.join('');
  },

  _getNextBirthday(birthday) {
    if (!birthday) return null;
    const bd = new Date(birthday);
    const now = new Date();
    const thisYear = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
    return thisYear >= now ? thisYear : new Date(now.getFullYear() + 1, bd.getMonth(), bd.getDate());
  },

  // ============================================================================
  // CONTACTS PAGE
  // ============================================================================

  contacts: async function(params = {}) {
    try {
      params = this._hashToParams(params);
      const search = params.search || '';
      const tag = params.tag || '';
      const group = params.group || '';
      const sort = params.sort || 'name';
      const view = params.view || 'table';

      const contactsResp = await window.api.getContacts({
        search,
        tag,
        group,
        sort,
        sortDir: 'asc',
        limit: 100,
        offset: 0,
      });

      const contacts = contactsResp?.data || [];
      const total = contactsResp?.total || 0;

      const html = `
        <div class="page-header">
          <div class="page-header-left">
            <h1 class="page-title">Contacts <span class="page-title-count">${window.utils.escapeHtml(String(total))}</span></h1>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary btn-sm" onclick="window.app.openAddContactModal()">
              ${window.utils.lucideIcon('plus', 13)}
              Add contact
            </button>
          </div>
        </div>

        <div class="toolbar">
          <div class="toolbar-left">
            <div class="filter-pills">
              <button class="filter-pill ${!search && !tag && !group ? 'active' : ''}" onclick="window.app.filterContacts({})">All</button>
              <button class="filter-pill" onclick="window.app.filterContacts({favorites: true})">Favorites</button>
            </div>
          </div>
          <div class="toolbar-right">
            <div class="search-wrap">
              ${window.utils.lucideIcon('search', 13)}
              <input type="text" placeholder="Search contacts…" value="${window.utils.escapeHtml(search)}" onkeyup="window.app.filterContacts({search: this.value})">
            </div>
          </div>
        </div>

        <div class="content-area">
          <div class="data-table">
            <div class="data-table-head">
              <div class="data-table-row">
                <div class="col-person">Person</div>
                <div class="col-rel">Relationship</div>
                <div class="col-contact">Contact</div>
                <div class="col-tags">Tags</div>
                <div class="col-activity">Activity</div>
                <div class="col-actions"></div>
              </div>
            </div>
            <div class="data-table-body">
              ${contacts.map(c => `
                <div class="data-table-row" onclick="window.app.navigateTo('contact-detail', {id: '${window.utils.escapeHtml(c.id)}'})">
                  <div class="col-person">
                    <div class="td-person">
                      <div class="av av-sm">${window.utils.escapeHtml(String(c.firstName || c.name || '?')[0])}</div>
                      <div>
                        <div class="person-name">${window.utils.escapeHtml(c.firstName ? c.firstName + (c.lastName ? ' ' + c.lastName : '') : c.name || '')}</div>
                        <div class="person-title">${window.utils.escapeHtml(c.jobTitle || '')}</div>
                      </div>
                    </div>
                  </div>
                  <div class="col-rel">
                    <div class="td-rel">${window.utils.escapeHtml(c.relationshipStatus || 'Contact')}</div>
                  </div>
                  <div class="col-contact">
                    <div class="td-contact">
                      ${c.email ? `<div>${window.utils.escapeHtml(c.email)}</div>` : ''}
                      ${c.phone ? `<div>${window.utils.escapeHtml(c.phone)}</div>` : ''}
                    </div>
                  </div>
                  <div class="col-tags">
                    <div class="td-tags">
                      ${(c.tags || []).slice(0, 2).map(t => `<span class="tag-pill">${window.utils.escapeHtml(t.name || t)}</span>`).join('')}
                    </div>
                  </div>
                  <div class="col-activity">
                    <div class="td-activity">${c.lastContactedAt ? window.utils.formatRelative(c.lastContactedAt) : 'Never'}</div>
                  </div>
                  <div class="col-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); alert('More actions')">
                      ${window.utils.lucideIcon('more-vertical', 13)}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      setTimeout(() => this._initContacts(), 0);
      return html;
    } catch (err) {
      console.error('Contacts error:', err);
      return `<div class="error-message">Error loading contacts</div>`;
    }
  },

  _initContacts() {
    // Add event listeners if needed
  },

  // ============================================================================
  // EVENTS PAGE
  // ============================================================================

  events: async function(params = {}) {
    try {
      params = this._hashToParams(params);
      const status = params.status || 'upcoming';

      const eventsResp = await window.api.getEvents({ limit: 100, offset: 0 });
      const events = eventsResp?.data || [];
      const total = eventsResp?.total || 0;

      // Group by status
      const now = new Date();
      const upcoming = events.filter(e => new Date(e.startsAt || e.date) >= now);
      const past = events.filter(e => new Date(e.startsAt || e.date) < now);

      const html = `
        <div class="page-header">
          <div class="page-header-left">
            <h1 class="page-title">Events <span class="page-title-count">${window.utils.escapeHtml(String(total))}</span></h1>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary btn-sm" onclick="window.app.openAddEventModal()">
              ${window.utils.lucideIcon('plus', 13)}
              New event
            </button>
          </div>
        </div>

        <div class="toolbar">
          <div class="toolbar-left">
            <div class="filter-pills">
              <button class="filter-pill ${status === 'upcoming' ? 'active' : ''}" onclick="window.app.filterEvents({status: 'upcoming'})">Upcoming</button>
              <button class="filter-pill ${status === 'past' ? 'active' : ''}" onclick="window.app.filterEvents({status: 'past'})">Past</button>
              <button class="filter-pill ${status === 'all' ? 'active' : ''}" onclick="window.app.filterEvents({status: 'all'})">All</button>
            </div>
          </div>
          <div class="toolbar-right">
            <div class="search-wrap">
              ${window.utils.lucideIcon('search', 13)}
              <input type="text" placeholder="Search events…">
            </div>
          </div>
        </div>

        <div class="content-area">
          ${status !== 'past' ? `
            <div class="event-section">
              <div class="event-section-label">UPCOMING</div>
              <div class="event-list">
                ${upcoming.map(evt => this._renderEventItem(evt)).join('')}
              </div>
            </div>
          ` : ''}

          ${status !== 'upcoming' ? `
            <div class="event-section">
              <div class="event-section-label">PAST</div>
              <div class="event-list">
                ${past.map(evt => this._renderEventItem(evt)).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;

      setTimeout(() => this._initEvents(), 0);
      return html;
    } catch (err) {
      console.error('Events error:', err);
      return `<div class="error-message">Error loading events</div>`;
    }
  },

  _renderEventItem(evt) {
    return `
      <div class="event-item">
        <div class="event-item-icon">
          ${window.utils.lucideIcon('calendar', 18)}
        </div>
        <div class="event-item-body">
          <div class="event-item-title">${window.utils.escapeHtml(evt.title || evt.name || '')}</div>
          <div class="event-item-meta">
            <span>${window.utils.formatDate(evt.startsAt || evt.startsAt)}</span>
            ${evt.location ? `<span>${window.utils.escapeHtml(evt.location)}</span>` : ''}
          </div>
        </div>
        <div class="event-item-right">
          ${evt.type ? `<span class="badge badge-surface">${window.utils.escapeHtml(evt.type)}</span>` : ''}
          <button class="btn-icon" title="More">
            ${window.utils.lucideIcon('more-vertical', 13)}
          </button>
        </div>
      </div>
    `;
  },

  _initEvents() {
    // Add event listeners if needed
  },

  // ============================================================================
  // NOTIFICATIONS PAGE
  // ============================================================================

  notifications: async function(params = {}) {
    try {
      params = this._hashToParams(params);
      const filterType = params.type || 'all';

      const html = `
        <div class="page-header">
          <div class="page-title-section">
            <h1 class="page-title">Notifications <span class="badge badge-red ml-8">7</span></h1>
          </div>
          <div class="page-actions">
            <button class="btn btn-ghost btn-sm" onclick="window.app.markAllNotificationsRead()">
              ${window.utils.lucideIcon('check', 14)}
              Mark all read
            </button>
          </div>
        </div>

        <div class="filter-pills">
          <button class="filter-pill ${filterType === 'all' ? 'active' : ''}" onclick="window.app.filterNotifications('all')">All</button>
          <button class="filter-pill ${filterType === 'unread' ? 'active' : ''}" onclick="window.app.filterNotifications('unread')">
            Unread <span class="badge badge-red">7</span>
          </button>
          <button class="filter-pill ${filterType === 'birthday' ? 'active' : ''}" onclick="window.app.filterNotifications('birthday')">Birthdays</button>
          <button class="filter-pill ${filterType === 'reconnect' ? 'active' : ''}" onclick="window.app.filterNotifications('reconnect')">Reconnect</button>
          <button class="filter-pill ${filterType === 'system' ? 'active' : ''}" onclick="window.app.filterNotifications('system')">System</button>
        </div>

        <div class="notif-list">
          <div class="notif-item unread" data-type="birthday">
            <div class="notif-icon text-pink">
              ${window.utils.lucideIcon('birthday', 18)}
            </div>
            <div class="notif-content">
              <div class="notif-text"><strong>Dom Aguiles</strong> turns 29 in 15 days. Don't forget to reach out!</div>
              <div class="notif-time">2h ago</div>
            </div>
            <div class="notif-actions">
              <button class="btn btn-ghost btn-xs">View contact</button>
            </div>
          </div>
        </div>
      `;

      setTimeout(() => this._initNotifications(), 0);
      return html;
    } catch (err) {
      console.error('Notifications error:', err);
      return `<div class="error-message">Error loading notifications</div>`;
    }
  },

  _initNotifications() {
    // Add event listeners if needed
  },

  // ============================================================================
  // GROUPS PAGE
  // ============================================================================

  groups: async function(params = {}) {
    try {
      params = this._hashToParams(params);
      const filterType = params.filter || 'all';

      const groupsResp = await window.api.getGroups();
      const groups = groupsResp || [];

      const html = `
        <div class="page-header">
          <div class="page-header-left">
            <h1 class="page-title">Groups <span class="page-title-count">${window.utils.escapeHtml(String(groups.length))}</span></h1>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary btn-sm" onclick="window.app.openAddGroupModal()">
              ${window.utils.lucideIcon('plus', 13)}
              New group
            </button>
          </div>
        </div>

        <div class="toolbar">
          <div class="toolbar-left">
            <div class="filter-pills">
              <button class="filter-pill ${filterType === 'all' ? 'active' : ''}" onclick="window.app.filterGroups('all')">All</button>
              <button class="filter-pill ${filterType === 'system' ? 'active' : ''}" onclick="window.app.filterGroups('system')">System</button>
              <button class="filter-pill ${filterType === 'custom' ? 'active' : ''}" onclick="window.app.filterGroups('custom')">Custom</button>
            </div>
          </div>
          <div class="toolbar-right">
            <div class="search-wrap">
              ${window.utils.lucideIcon('search', 13)}
              <input type="text" placeholder="Search groups…">
            </div>
          </div>
        </div>

        <div class="content-area">
          <div class="groups-grid">
            ${groups.map(g => `
              <div class="group-card">
                <div class="group-card-header" onclick="window.app.toggleGroupMembers('${window.utils.escapeHtml(g.id)}')">
                  <div class="group-card-icon" style="background: rgba(124,91,245,0.12); color: var(--accent);">
                    ${window.utils.lucideIcon('users', 18)}
                  </div>
                  <div class="group-card-info">
                    <div class="group-card-name">${window.utils.escapeHtml(g.name || '')}</div>
                    <div class="group-card-desc">${window.utils.escapeHtml(g.description || '')}</div>
                  </div>
                  <div class="group-card-meta">
                    <span class="group-card-count">${g.members?.length || 0}</span>
                    <span class="badge badge-surface">${window.utils.escapeHtml(g.type || 'Custom')}</span>
                    ${window.utils.lucideIcon('chevron-down', 14)}
                  </div>
                </div>
                <div class="group-card-members" id="${window.utils.escapeHtml(g.id)}-members">
                  ${(g.members || []).slice(0, 3).map(m => `
                    <div class="group-member-row">
                      <div class="av av-xs">${window.utils.escapeHtml(String(m.firstName || m.name || '?')[0])}</div>
                      <div class="group-member-info">
                        <span class="group-member-name">${window.utils.escapeHtml(m.firstName ? m.firstName + (m.lastName ? ' ' + m.lastName : '') : m.name || '')}</span>
                        <span class="group-member-loc">${window.utils.escapeHtml(m.city || '')}</span>
                      </div>
                      <button class="btn-icon" title="Remove">
                        ${window.utils.lucideIcon('x', 13)}
                      </button>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      setTimeout(() => this._initGroups(), 0);
      return html;
    } catch (err) {
      console.error('Groups error:', err);
      return `<div class="error-message">Error loading groups</div>`;
    }
  },

  _initGroups() {
    // Add event listeners if needed
  },

  // ============================================================================
  // SETTINGS PAGE
  // ============================================================================

  settings: async function(params = {}) {
    try {
      params = this._hashToParams(params);
      const activeTab = params.tab || 'general';

      const html = `
        <div class="page-header">
          <div class="page-header-left">
            <h1 class="page-title">Settings</h1>
          </div>
        </div>

        <div class="tabs">
          <button class="tab ${activeTab === 'general' ? 'active' : ''}" onclick="window.app.switchSettingsTab('general')">General</button>
          <button class="tab ${activeTab === 'users' ? 'active' : ''}" onclick="window.app.switchSettingsTab('users')">Users</button>
          <button class="tab ${activeTab === 'spicy' ? 'active' : ''}" onclick="window.app.switchSettingsTab('spicy')">Spicy Mode</button>
          <button class="tab ${activeTab === 'account' ? 'active' : ''}" onclick="window.app.switchSettingsTab('account')">Account</button>
        </div>

        <div class="content-area">
          <!-- TAB 1: GENERAL -->
          <div class="tab-panel ${activeTab === 'general' ? 'active' : ''}" id="tab-general">
            <div class="settings-layout">
              <div class="settings-section">
                <div class="settings-section-title">App</div>
                <div class="settings-row spaced">
                  <div class="settings-row-label">
                    <div class="settings-row-title">App name</div>
                  </div>
                  <div class="settings-row-input">
                    <input class="input" type="text" value="Kith" style="width: 280px;">
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: USERS -->
          <div class="tab-panel ${activeTab === 'users' ? 'active' : ''}" id="tab-users">
            <div class="settings-layout">
              <div class="users-table-wrap">
                <div class="users-table-header">
                  <div class="users-table-title">Users</div>
                  <button class="btn btn-primary btn-sm">
                    ${window.utils.lucideIcon('plus', 13)}
                    Invite user
                  </button>
                </div>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last active</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><div style="display: flex; align-items: center; gap: 10px;"><div class="av av-sm">${window.utils.lucideIcon('user', 16)}</div>Jared A.</div></td>
                      <td><span class="badge badge-accent">Main Admin</span></td>
                      <td><span class="badge badge-green">Active</span></td>
                      <td><span style="color: var(--text-muted); font-size: 0.875rem;">just now</span></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 3: SPICY MODE -->
          <div class="tab-panel ${activeTab === 'spicy' ? 'active' : ''}" id="tab-spicy">
            <div class="settings-layout">
              <div class="settings-section">
                <div class="settings-section-title">Spicy Mode</div>
                <div class="settings-row spaced">
                  <div class="settings-row-label">
                    <div class="settings-row-title">Enable Spicy Mode</div>
                  </div>
                  <div class="settings-row-input">
                    <div class="toggle-wrap">
                      <input type="checkbox" id="spicyEnableToggle" checked>
                      <label for="spicyEnableToggle"></label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 4: ACCOUNT -->
          <div class="tab-panel ${activeTab === 'account' ? 'active' : ''}" id="tab-account">
            <div class="settings-layout">
              <div class="settings-section">
                <div class="settings-section-title">Profile</div>
                <div class="settings-row spaced">
                  <div class="settings-row-label">
                    <div class="settings-row-title">Display name</div>
                  </div>
                  <div class="settings-row-input">
                    <input class="input" type="text" value="Jared A." style="width: 280px;">
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      setTimeout(() => this._initSettings(), 0);
      return html;
    } catch (err) {
      console.error('Settings error:', err);
      return `<div class="error-message">Error loading settings</div>`;
    }
  },

  _initSettings() {
    // Add event listeners if needed
  },

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  _hashToParams(input) {
    if (typeof input === 'string') {
      const params = new URLSearchParams(input.replace(/^#/, ''));
      const obj = {};
      params.forEach((v, k) => {
        obj[k] = v;
      });
      return obj;
    }
    return input;
  },

  _paramsToHash(params) {
    const qs = new URLSearchParams(params).toString();
    return '#' + qs;
  },
};

// Attach to window
if (window.pages) {
  Object.assign(window.pages, window.pages);
}
