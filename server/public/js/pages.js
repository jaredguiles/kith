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
      // Fetch data — skip timeline (requires a contact_id, no "all" endpoint)
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
        .slice(0, 10);

      const reminderList = Array.isArray(reminders) ? reminders : (reminders?.data || []);
      const overdue = reminderList.filter(r => r.dueAt && new Date(r.dueAt) < now);
      const upcoming = (events?.data || []).slice(0, 5);

      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const eventsThisMonth = upcoming.filter(e => {
        const ed = new Date(e.startsAt);
        return ed >= thisMonth && ed <= thisMonthEnd;
      }).length;

      const html = `
        <div class="page-header">
          <div class="page-title">Home</div>
        </div>

        <div class="dashboard-grid">
          <!-- Stats Cards -->
          <div class="stats-container">
            <div class="stat-card">
              <div class="stat-number">${contactCount}</div>
              <div class="stat-label">Total Contacts</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${contactList.filter(c => c.createdAt && new Date(c.createdAt) >= thisMonth).length}</div>
              <div class="stat-label">Added This Month</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${eventsThisMonth}</div>
              <div class="stat-label">Events This Month</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${overdue.length}</div>
              <div class="stat-label">Overdue Reminders</div>
            </div>
          </div>

          <!-- Upcoming Birthdays -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Upcoming Birthdays</h3>
              <a href="#/contacts" class="text-link">See all</a>
            </div>
            <div class="card-body">
              ${birthdays.length > 0
                ? birthdays.map(b => `
                  <div class="birthday-item" data-contact-id="${b.id}">
                    ${window.components.avatar(b.photoUrl, b.displayName || '', 'sm')}
                    <div class="birthday-info">
                      <div class="birthday-name">${window.utils.escapeHtml(b.displayName || 'Unknown')}</div>
                      <div class="birthday-date">${window.utils.formatDate(b.nextBirthday)}</div>
                    </div>
                  </div>
                `).join('')
                : '<p class="empty-state">No birthdays in the next 30 days</p>'
              }
            </div>
          </div>

          <!-- Overdue Reminders -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Overdue Reminders</h3>
              <a href="#/notifications" class="text-link">See all</a>
            </div>
            <div class="card-body">
              ${overdue.length > 0
                ? overdue.slice(0, 5).map(r => `
                  <div class="reminder-item" data-reminder-id="${r.id}">
                    <div class="reminder-badge overdue"></div>
                    <div class="reminder-text">${window.utils.escapeHtml(r.title || '')}</div>
                    <div class="reminder-date">${window.utils.formatRelative(r.dueAt)}</div>
                  </div>
                `).join('')
                : '<p class="empty-state">No overdue reminders</p>'
              }
            </div>
          </div>

          <!-- Upcoming Events -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Upcoming Events</h3>
              <a href="#/events" class="text-link">See all</a>
            </div>
            <div class="card-body">
              ${upcoming.length > 0
                ? upcoming.map(e => `
                  <div class="event-item" data-event-id="${e.id}">
                    <div class="event-badge"></div>
                    <div>
                      <div class="event-name">${window.utils.escapeHtml(e.title || '')}</div>
                      <div class="event-date">${window.utils.formatDateTime(e.startsAt)}</div>
                    </div>
                  </div>
                `).join('')
                : '<p class="empty-state">No upcoming events</p>'
              }
            </div>
          </div>

          <!-- Recent Activity -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Recent Activity</h3>
            </div>
            <div class="card-body">
              ${false /* Timeline requires contact_id — show empty for now */
                ? ''
                : '<p class="empty-state">No recent activity</p>'
              }
            </div>
          </div>
        </div>
      `;

      setTimeout(() => this.initDashboard(), 0);
      return html;
    } catch (err) {
      console.error('Dashboard error:', err);
      window.utils.toast('Failed to load dashboard', 'error');
      return '<div class="error-state">Failed to load dashboard</div>';
    }
  },

  initDashboard: function() {
    document.querySelectorAll('.birthday-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.contactId;
        window.app.navigate('contact-detail', { id });
      });
    });

    document.querySelectorAll('.event-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.eventId;
        window.app.navigate('events', { id });
      });
    });
  },

  _getNextBirthday: function(birthday) {
    const bd = new Date(birthday);
    const now = new Date();
    let next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
    if (next < now) {
      next = new Date(now.getFullYear() + 1, bd.getMonth(), bd.getDate());
    }
    return next;
  },

  // ============================================================================
  // CONTACTS PAGE
  // ============================================================================

  contacts: async function(params = {}) {
    const limit = 20;
    const offset = params.offset || 0;
    const view = params.view || 'list';

    try {
      const filters = {
        limit,
        offset,
      };

      if (params.search) filters.search = params.search;
      if (params.tag) filters.tag = params.tag;
      if (params.group) filters.group = params.group;
      if (params.sort) filters.sort = params.sort;
      if (params.sortDir) filters.sortDir = params.sortDir;

      const [result, tags] = await Promise.all([
        window.api.getContacts(filters),
        window.api.getTags(),
      ]);

      const contacts = result.data || [];
      const total = result.total || 0;
      const pages = Math.ceil(total / limit);
      const currentPage = Math.floor(offset / limit) + 1;

      const html = `
        <div class="page-header">
          <div class="page-title">Contacts</div>
        </div>

        <div class="contacts-toolbar">
          <input type="text" class="input" id="contactSearch" placeholder="Search by name, email…" value="${window.utils.escapeHtml(params.search || '')}">

          <select class="select" id="tagFilter">
            <option value="">All Tags</option>
            ${(tags || []).map(t => `<option value="${window.utils.escapeHtml(t.id)}">${window.utils.escapeHtml(t.name)}</option>`).join('')}
          </select>

          <select class="select" id="sortSelect">
            <option value="name">Sort by Name</option>
            <option value="created">Sort by Created</option>
            <option value="updated">Sort by Updated</option>
          </select>

          <button class="btn btn-icon" id="viewToggle" title="Toggle view">
            ${view === 'list' ? window.utils.lucideIcon('grid', 16) : window.utils.lucideIcon('list', 16)}
          </button>
        </div>

        <div class="contacts-container ${view === 'grid' ? 'contacts-grid' : 'contacts-list'}">
          ${contacts.length > 0
            ? contacts.map(c => `
              <div class="contact-item ${view === 'grid' ? 'contact-card' : 'contact-row'}" data-contact-id="${window.utils.escapeHtml(c.id)}">
                ${window.components.avatar(c.photoUrl, c.displayName || '', 'md')}
                <div class="contact-info">
                  <div class="contact-name">${window.utils.escapeHtml(c.displayName || 'Unknown')}</div>
                  ${c.relationshipType ? `<div class="contact-meta">${window.utils.escapeHtml(c.relationshipType)}</div>` : ''}
                  ${c.email ? `<div class="contact-email">${window.utils.escapeHtml(c.email)}</div>` : ''}
                </div>
                ${c.favorite ? `<div class="star-icon">${window.utils.lucideIcon('star', 16)}</div>` : ''}
              </div>
            `).join('')
            : '<div class="empty-state">No contacts found</div>'
          }
        </div>

        ${pages > 1 ? `
          <div class="pagination">
            ${currentPage > 1 ? `<button class="btn btn-sm" data-page="${currentPage - 1}">Previous</button>` : ''}
            <span class="pagination-info">Page ${currentPage} of ${pages}</span>
            ${currentPage < pages ? `<button class="btn btn-sm" data-page="${currentPage + 1}">Next</button>` : ''}
          </div>
        ` : ''}
      `;

      setTimeout(() => this.initContacts(params), 0);
      return html;
    } catch (err) {
      console.error('Contacts error:', err);
      window.utils.toast('Failed to load contacts', 'error');
      return '<div class="error-state">Failed to load contacts</div>';
    }
  },

  initContacts: function(params) {
    const viewToggle = document.getElementById('viewToggle');
    if (viewToggle) {
      viewToggle.addEventListener('click', () => {
        const newView = (params.view || 'list') === 'list' ? 'grid' : 'list';
        window.app.navigate('contacts', { ...params, view: newView });
      });
    }

    document.querySelectorAll('.contact-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.contactId;
        window.app.navigate('contact-detail', { id });
      });
    });

    const searchInput = document.getElementById('contactSearch');
    if (searchInput) {
      searchInput.addEventListener('keyup', window.utils.debounce(() => {
        const search = searchInput.value.trim();
        window.app.navigate('contacts', { ...params, search, offset: 0 });
      }, 300));
    }

    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter) {
      tagFilter.addEventListener('change', () => {
        const tag = tagFilter.value;
        window.app.navigate('contacts', { ...params, tag, offset: 0 });
      });
    }

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        const sort = sortSelect.value;
        window.app.navigate('contacts', { ...params, sort, offset: 0 });
      });
    }

    document.querySelectorAll('.pagination button').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        const offset = (page - 1) * 20;
        window.app.navigate('contacts', { ...params, offset });
      });
    });
  },

  // ============================================================================
  // CONTACT DETAIL PAGE
  // ============================================================================

  'contact-detail': async function(params = {}) {
    if (!params.id) {
      return '<div class="error-state">Contact not found</div>';
    }

    try {
      const [contact, emails, phones, addresses, socials, notes, timeline, changelog, groups, tags] = await Promise.all([
        window.api.getContact(params.id),
        window.api.getContactEmails(params.id).catch(() => []),
        window.api.getContactPhones(params.id).catch(() => []),
        window.api.getContactAddresses(params.id).catch(() => []),
        window.api.getContactSocials(params.id).catch(() => []),
        window.api.getNotes(params.id).catch(() => []),
        window.api.getTimeline(params.id).catch(() => []),
        window.api.getContactChangelog(params.id).catch(() => []),
        window.api.getGroups(),
        window.api.getTags(),
      ]);

      const age = contact.birthday ? window.utils.calculateAge(contact.birthday) : null;
      const zodiac = contact.birthday ? window.utils.getZodiacSign(contact.birthday) : null;

      const html = `
        <div class="contact-detail-panel">
          <div class="contact-detail-header">
            <button class="btn-icon btn-back" onclick="window.app.navigate('contacts')">
              ${window.utils.lucideIcon('arrow-left', 20)}
            </button>
            <div class="contact-detail-title">${window.utils.escapeHtml(contact.displayName || '')}</div>
            <div class="contact-detail-actions">
              <button class="btn-icon" id="favBtn" title="Toggle favorite">
                ${window.utils.lucideIcon('star', 16)}
              </button>
              <button class="btn-icon" id="editBtn" title="Edit">
                ${window.utils.lucideIcon('edit', 16)}
              </button>
              <button class="btn-icon" id="moreBtn" title="More">
                ${window.utils.lucideIcon('more-horizontal', 16)}
              </button>
            </div>
          </div>

          <div class="contact-detail-body">
            <!-- Avatar & Basic Info -->
            <div class="detail-section">
              ${window.components.avatar(contact.photoUrl, contact.displayName || '', 'lg', contact.orientation)}
              <div class="detail-basic">
                <h2>${window.utils.escapeHtml(contact.displayName || '')}</h2>
                ${contact.location ? `<p class="detail-location">${window.utils.lucideIcon('map-pin', 14)} ${window.utils.escapeHtml(contact.location)}</p>` : ''}
                ${contact.relationshipType ? `<p class="detail-rel">${window.utils.escapeHtml(contact.relationshipType)}</p>` : ''}
              </div>
            </div>

            <!-- Contact Details -->
            <div class="detail-section">
              <h3>Contact Information</h3>
              ${emails.length > 0 ? `
                <div class="detail-field">
                  <label>Email</label>
                  ${emails.map(e => `<div class="detail-value">${window.utils.escapeHtml(e.email)}</div>`).join('')}
                </div>
              ` : ''}
              ${phones.length > 0 ? `
                <div class="detail-field">
                  <label>Phone</label>
                  ${phones.map(p => `<div class="detail-value">${window.utils.escapeHtml(p.phone)}</div>`).join('')}
                </div>
              ` : ''}
              ${addresses.length > 0 ? `
                <div class="detail-field">
                  <label>Address</label>
                  ${addresses.map(a => `<div class="detail-value">${window.utils.escapeHtml([a.street, a.city, a.state, a.zip].filter(Boolean).join(', '))}</div>`).join('')}
                </div>
              ` : ''}
            </div>

            <!-- Additional Info -->
            <div class="detail-section">
              <h3>Personal Information</h3>
              ${contact.nickname ? `<div class="detail-field"><label>Nickname</label><div class="detail-value">${window.utils.escapeHtml(contact.nickname)}</div></div>` : ''}
              ${contact.birthday ? `<div class="detail-field"><label>Birthday</label><div class="detail-value">${window.utils.formatDate(contact.birthday)} (age ${age})</div></div>` : ''}
              ${zodiac ? `<div class="detail-field"><label>Zodiac</label><div class="detail-value">${window.utils.escapeHtml(zodiac)}</div></div>` : ''}
              ${contact.bio ? `<div class="detail-field"><label>Bio</label><div class="detail-value">${window.utils.escapeHtml(contact.bio)}</div></div>` : ''}
            </div>

            <!-- Professional Info -->
            ${contact.occupation || contact.company ? `
              <div class="detail-section">
                <h3>Professional</h3>
                ${contact.occupation ? `<div class="detail-field"><label>Occupation</label><div class="detail-value">${window.utils.escapeHtml(contact.occupation)}</div></div>` : ''}
                ${contact.company ? `<div class="detail-field"><label>Company</label><div class="detail-value">${window.utils.escapeHtml(contact.company)}</div></div>` : ''}
                ${contact.website ? `<div class="detail-field"><label>Website</label><div class="detail-value"><a href="${window.utils.escapeHtml(contact.website)}" target="_blank">${window.utils.escapeHtml(contact.website)}</a></div></div>` : ''}
              </div>
            ` : ''}

            <!-- Social Links -->
            ${socials.length > 0 ? `
              <div class="detail-section">
                <h3>Social Media</h3>
                ${socials.map(s => `
                  <div class="detail-field">
                    <label>${window.utils.escapeHtml(s.platform)}</label>
                    <div class="detail-value"><a href="${window.utils.escapeHtml(s.url)}" target="_blank">@${window.utils.escapeHtml(s.handle)}</a></div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <!-- Tags & Groups -->
            ${(contact.tags && contact.tags.length > 0) || (contact.groups && contact.groups.length > 0) ? `
              <div class="detail-section">
                <h3>Collections</h3>
                ${contact.tags && contact.tags.length > 0 ? `
                  <div class="detail-tags">
                    ${contact.tags.map(t => `<span class="tag">${window.utils.escapeHtml(t.name)}</span>`).join('')}
                  </div>
                ` : ''}
                ${contact.groups && contact.groups.length > 0 ? `
                  <div class="detail-groups">
                    ${contact.groups.map(g => `<span class="badge">${window.utils.escapeHtml(g.name)}</span>`).join('')}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- Timeline -->
            <div class="detail-section">
              <h3>Timeline</h3>
              <div class="add-note-form">
                <textarea class="input" id="newNote" placeholder="Add a note…" rows="3"></textarea>
                <button class="btn btn-primary btn-sm" id="saveNoteBtn">Save Note</button>
              </div>
              <div class="timeline">
                ${timeline.length > 0 ? timeline.map(t => `
                  <div class="timeline-item">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content">
                      <div class="timeline-title">${window.utils.escapeHtml(t.title || '')}</div>
                      <div class="timeline-date">${window.utils.formatRelative(t.date)}</div>
                    </div>
                  </div>
                `).join('') : '<p class="empty-state">No timeline entries</p>'}
              </div>
            </div>

            <!-- Changelog -->
            ${changelog.length > 0 ? `
              <div class="detail-section">
                <h3>Change History</h3>
                <div class="changelog">
                  ${changelog.slice(0, 20).map(c => `
                    <div class="changelog-item">
                      <div class="changelog-field">${window.utils.escapeHtml(c.field)}</div>
                      <div class="changelog-change">
                        <span class="old-value">${window.utils.escapeHtml(c.oldValue || '')}</span>
                        <span class="arrow">→</span>
                        <span class="new-value">${window.utils.escapeHtml(c.newValue || '')}</span>
                      </div>
                      <div class="changelog-date">${window.utils.formatRelative(c.createdAt)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      setTimeout(() => this.initContactDetail(params.id), 0);
      return html;
    } catch (err) {
      console.error('Contact detail error:', err);
      return '<div class="error-state">Failed to load contact</div>';
    }
  },

  initContactDetail: function(contactId) {
    const saveNoteBtn = document.getElementById('saveNoteBtn');
    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', async () => {
        const noteText = document.getElementById('newNote').value.trim();
        if (noteText) {
          try {
            await window.api.createNote({
              contactId,
              text: noteText,
            });
            window.utils.toast('Note saved', 'success');
            document.getElementById('newNote').value = '';
            window.app.navigate('contact-detail', { id: contactId });
          } catch (err) {
            window.utils.toast('Failed to save note', 'error');
          }
        }
      });
    }

    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        window.app.openEditContactModal(contactId);
      });
    }

    const favBtn = document.getElementById('favBtn');
    if (favBtn) {
      favBtn.addEventListener('click', async () => {
        try {
          await window.api.toggleFavorite(contactId);
          window.utils.toast('Favorite toggled', 'success');
          window.app.navigate('contact-detail', { id: contactId });
        } catch (err) {
          window.utils.toast('Failed to toggle favorite', 'error');
        }
      });
    }
  },

  // ============================================================================
  // EVENTS PAGE
  // ============================================================================

  events: async function(params = {}) {
    const filter = params.filter || 'upcoming';
    const limit = 20;
    const offset = params.offset || 0;

    try {
      const now = new Date();
      const apiParams = { limit, offset };

      if (filter === 'upcoming') {
        apiParams.upcoming = 'true';
      } else if (filter === 'past') {
        apiParams.endDate = now.toISOString();
      }

      const [result, contacts] = await Promise.all([
        window.api.getEvents(apiParams),
        window.api.getContacts({ limit: 1000 }),
      ]);

      const events = result.data || [];
      const total = result.total || 0;
      const pages = Math.ceil(total / limit);
      const currentPage = Math.floor(offset / limit) + 1;

      const html = `
        <div class="page-header">
          <div class="page-title">Events</div>
          <button class="btn btn-primary" id="newEventBtn">Create Event</button>
        </div>

        <div class="events-filters">
          <button class="filter-pill ${filter === 'upcoming' ? 'active' : ''}" data-filter="upcoming">Upcoming</button>
          <button class="filter-pill ${filter === 'past' ? 'active' : ''}" data-filter="past">Past</button>
          <button class="filter-pill ${filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
        </div>

        <div class="events-list">
          ${events.length > 0
            ? events.map(e => `
              <div class="event-card" data-event-id="${window.utils.escapeHtml(e.id)}">
                <div class="event-date">${window.utils.formatDate(e.startsAt)}</div>
                <div class="event-title">${window.utils.escapeHtml(e.title)}</div>
                <div class="event-meta">
                  <span class="event-type">${window.utils.escapeHtml(e.type || 'event')}</span>
                  ${e.location ? `<span class="event-location">${window.utils.lucideIcon('map-pin', 12)} ${window.utils.escapeHtml(e.location)}</span>` : ''}
                </div>
              </div>
            `).join('')
            : '<div class="empty-state">No events</div>'
          }
        </div>

        ${pages > 1 ? `
          <div class="pagination">
            ${currentPage > 1 ? `<button class="btn btn-sm" data-page="${currentPage - 1}">Previous</button>` : ''}
            <span class="pagination-info">Page ${currentPage} of ${pages}</span>
            ${currentPage < pages ? `<button class="btn btn-sm" data-page="${currentPage + 1}">Next</button>` : ''}
          </div>
        ` : ''}
      `;

      setTimeout(() => this.initEvents(params), 0);
      return html;
    } catch (err) {
      console.error('Events error:', err);
      return '<div class="error-state">Failed to load events</div>';
    }
  },

  initEvents: function(params) {
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        window.app.navigate('events', { filter });
      });
    });

    const newEventBtn = document.getElementById('newEventBtn');
    if (newEventBtn) {
      newEventBtn.addEventListener('click', () => {
        window.app.openEventModal();
      });
    }

    document.querySelectorAll('.event-card').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.eventId;
        // Would open event detail
      });
    });
  },

  // ============================================================================
  // NOTIFICATIONS PAGE
  // ============================================================================

  notifications: async function() {
    try {
      const [reminders, birthdays, events] = await Promise.all([
        window.api.getDueReminders(),
        window.api.getContacts({ limit: 1000 }),
        window.api.getEvents({ limit: 100 }),
      ]);

      const now = new Date();
      const upcomingBirthdays = [];

      for (const contact of birthdays.data || []) {
        if (contact.birthday) {
          const nextBday = this._getNextBirthday(contact.birthday);
          if (nextBday && nextBday > now && nextBday < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
            upcomingBirthdays.push({
              type: 'birthday',
              contact,
              date: nextBday,
            });
          }
        }
      }

      const upcomingEvents = (events.data || [])
        .filter(e => new Date(e.startsAt) > now && new Date(e.startsAt) < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))
        .map(e => ({
          type: 'event',
          event: e,
          date: new Date(e.startsAt),
        }));

      const overdueReminders = (reminders || [])
        .filter(r => new Date(r.dueAt) < now)
        .map(r => ({
          type: 'reminder',
          reminder: r,
          date: new Date(r.dueAt),
        }));

      const items = [...overdueReminders, ...upcomingBirthdays, ...upcomingEvents].sort((a, b) => a.date - b.date);

      const html = `
        <div class="page-header">
          <div class="page-title">Notifications</div>
        </div>

        <div class="notifications-list">
          ${items.length > 0
            ? items.map(item => {
              if (item.type === 'reminder') {
                return `
                  <div class="notif-item reminder">
                    <div class="notif-icon">${window.utils.lucideIcon('alert-circle', 20)}</div>
                    <div class="notif-content">
                      <div class="notif-title">Overdue: ${window.utils.escapeHtml(item.reminder.text)}</div>
                      <div class="notif-date">${window.utils.formatRelative(item.reminder.dueAt)}</div>
                    </div>
                    <div class="notif-actions">
                      <button class="btn btn-sm" data-action="complete" data-id="${window.utils.escapeHtml(item.reminder.id)}">Mark Done</button>
                    </div>
                  </div>
                `;
              } else if (item.type === 'birthday') {
                return `
                  <div class="notif-item birthday">
                    <div class="notif-icon">${window.utils.lucideIcon('cake', 20)}</div>
                    <div class="notif-content">
                      <div class="notif-title">${window.utils.escapeHtml(item.contact.displayName || '')} birthday</div>
                      <div class="notif-date">${window.utils.formatDate(item.contact.birthday)}</div>
                    </div>
                    <div class="notif-actions">
                      <button class="btn btn-sm" data-action="view-contact" data-id="${window.utils.escapeHtml(item.contact.id)}">View</button>
                    </div>
                  </div>
                `;
              } else {
                return `
                  <div class="notif-item event">
                    <div class="notif-icon">${window.utils.lucideIcon('calendar', 20)}</div>
                    <div class="notif-content">
                      <div class="notif-title">${window.utils.escapeHtml(item.event.title)}</div>
                      <div class="notif-date">${window.utils.formatDateTime(item.event.startsAt)}</div>
                    </div>
                    <div class="notif-actions">
                      <button class="btn btn-sm" data-action="view-event" data-id="${window.utils.escapeHtml(item.event.id)}">View</button>
                    </div>
                  </div>
                `;
              }
            }).join('')
            : '<div class="empty-state">No notifications</div>'
          }
        </div>
      `;

      setTimeout(() => this.initNotifications(), 0);
      return html;
    } catch (err) {
      console.error('Notifications error:', err);
      return '<div class="error-state">Failed to load notifications</div>';
    }
  },

  initNotifications: function() {
    document.querySelectorAll('.notif-item .btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        try {
          if (action === 'complete') {
            await window.api.completeReminder(id);
            window.utils.toast('Reminder completed', 'success');
            window.app.navigate('notifications');
          } else if (action === 'view-contact') {
            window.app.navigate('contact-detail', { id });
          } else if (action === 'view-event') {
            // Navigate to event detail
          }
        } catch (err) {
          window.utils.toast('Action failed', 'error');
        }
      });
    });
  },

  _getNextBirthday: function(birthday) {
    const bd = new Date(birthday);
    const now = new Date();
    let next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
    if (next < now) {
      next = new Date(now.getFullYear() + 1, bd.getMonth(), bd.getDate());
    }
    return next;
  },

  // ============================================================================
  // GROUPS PAGE
  // ============================================================================

  groups: async function() {
    try {
      const groups = await window.api.getGroups();

      const html = `
        <div class="page-header">
          <div class="page-title">Groups</div>
          <button class="btn btn-primary" id="newGroupBtn">Create Group</button>
        </div>

        <div class="groups-grid">
          ${(groups || []).map(g => `
            <div class="group-card" data-group-id="${window.utils.escapeHtml(g.id)}">
              <div class="group-icon">
                ${g.icon || window.utils.lucideIcon('folder', 32)}
              </div>
              <div class="group-name">${window.utils.escapeHtml(g.name)}</div>
              <div class="group-desc">${window.utils.escapeHtml(g.description || '')}</div>
              <div class="group-count">${g.memberCount || 0} members</div>
              <div class="group-avatars">
                ${(g.avatars || []).slice(0, 3).map(av => `${window.components.avatar(av, '', 'sm')}`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      setTimeout(() => this.initGroups(), 0);
      return html;
    } catch (err) {
      console.error('Groups error:', err);
      return '<div class="error-state">Failed to load groups</div>';
    }
  },

  initGroups: function() {
    const newGroupBtn = document.getElementById('newGroupBtn');
    if (newGroupBtn) {
      newGroupBtn.addEventListener('click', () => {
        window.app.openGroupModal();
      });
    }

    document.querySelectorAll('.group-card').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.groupId;
        // Open group detail/expand
      });
    });
  },

  // ============================================================================
  // SETTINGS PAGE (ADMIN)
  // ============================================================================

  settings: async function() {
    try {
      const [settings, users, tags, groups, preferences] = await Promise.all([
        window.api.getSettings(),
        window.api.getUsers(),
        window.api.getTags(),
        window.api.getGroups(),
        window.api.getPreferences(),
      ]);

      const html = `
        <div class="page-header">
          <div class="page-title">Settings</div>
        </div>

        <div class="settings-container">
          <div class="settings-nav">
            <button class="settings-nav-item active" data-tab="general">General</button>
            <button class="settings-nav-item" data-tab="appearance">Appearance</button>
            <button class="settings-nav-item" data-tab="spicy">Spicy Mode</button>
            <button class="settings-nav-item" data-tab="users">Users</button>
            <button class="settings-nav-item" data-tab="data">Data</button>
          </div>

          <div class="settings-content">
            <!-- General Tab -->
            <div class="settings-tab active" data-tab="general">
              <h3>General Settings</h3>
              <div class="settings-field">
                <label>App Name</label>
                <input type="text" class="input" id="appNameInput" value="${window.utils.escapeHtml(settings?.appName || 'Kith')}">
              </div>
              <div class="settings-field">
                <label>App Logo</label>
                <input type="file" class="input" id="logoUpload" accept="image/*">
              </div>
              <button class="btn btn-primary" id="saveGeneralBtn">Save Changes</button>
            </div>

            <!-- Appearance Tab -->
            <div class="settings-tab" data-tab="appearance">
              <h3>Appearance</h3>
              <div class="settings-field">
                <label>Accent Color</label>
                <input type="color" class="input" id="accentColorInput" value="${settings?.accentColor || '#3b82f6'}">
              </div>
              <button class="btn btn-primary" id="saveAppearanceBtn">Save Changes</button>
            </div>

            <!-- Spicy Tab -->
            <div class="settings-tab" data-tab="spicy">
              <h3>Spicy Mode</h3>
              <div class="settings-field">
                <label>
                  <input type="checkbox" id="spicyEnableCheckbox" ${settings?.spicyEnabled ? 'checked' : ''}>
                  Enable Spicy Mode
                </label>
              </div>
              <div class="settings-field">
                <label>Access PIN (if enabled)</label>
                <input type="password" class="input" id="spicyPinInput" placeholder="••••">
              </div>
              <div class="settings-field">
                <label>Auto-disable Timer</label>
                <select class="select" id="spicyTimerSelect">
                  <option value="never">Never</option>
                  <option value="15m">15 minutes</option>
                  <option value="30m">30 minutes</option>
                  <option value="1h">1 hour</option>
                </select>
              </div>
              <button class="btn btn-primary" id="saveSpicyBtn">Save Changes</button>
            </div>

            <!-- Users Tab -->
            <div class="settings-tab" data-tab="users">
              <h3>User Management</h3>
              <button class="btn btn-primary" id="newUserBtn">Create User</button>
              <div class="users-table">
                ${(users || []).map(u => `
                  <div class="user-row">
                    <div class="user-name">${window.utils.escapeHtml(u.username)}</div>
                    <div class="user-role">${window.utils.formatRole(u.role)}</div>
                    <div class="user-actions">
                      <button class="btn btn-sm" data-action="edit" data-id="${window.utils.escapeHtml(u.id)}">Edit</button>
                      <button class="btn btn-sm" data-action="delete" data-id="${window.utils.escapeHtml(u.id)}">Delete</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Data Tab -->
            <div class="settings-tab" data-tab="data">
              <h3>Data Management</h3>
              <div class="settings-section">
                <h4>Import</h4>
                <div class="settings-field">
                  <label>Import File</label>
                  <input type="file" class="input" id="importFileInput" accept=".csv,.vcf,.json">
                </div>
                <div class="settings-field">
                  <label>Platform</label>
                  <select class="select" id="importPlatformSelect">
                    <option value="">Select platform…</option>
                    <option value="google">Google Contacts</option>
                    <option value="csv">CSV</option>
                    <option value="vcard">vCard</option>
                  </select>
                </div>
                <button class="btn btn-primary" id="uploadImportBtn">Upload</button>
              </div>
              <div class="settings-section">
                <h4>Export</h4>
                <button class="btn btn-secondary" id="exportBtn">Export Contacts</button>
              </div>
              <div class="settings-section">
                <h4>Default Tags</h4>
                <div class="tags-editor">
                  ${(tags || []).map(t => `
                    <div class="tag-item">
                      <span>${window.utils.escapeHtml(t.name)}</span>
                      <button class="btn-icon" data-action="delete-tag" data-id="${window.utils.escapeHtml(t.id)}">
                        ${window.utils.lucideIcon('x', 14)}
                      </button>
                    </div>
                  `).join('')}
                </div>
                <input type="text" class="input" id="newTagInput" placeholder="Add new tag…">
                <button class="btn btn-primary btn-sm" id="addTagBtn">Add Tag</button>
              </div>
            </div>
          </div>
        </div>
      `;

      setTimeout(() => this.initSettings(), 0);
      return html;
    } catch (err) {
      console.error('Settings error:', err);
      return '<div class="error-state">Failed to load settings</div>';
    }
  },

  initSettings: function() {
    // Tab switching
    document.querySelectorAll('.settings-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
        document.querySelector(`.settings-tab[data-tab="${tab}"]`)?.classList.add('active');
        btn.classList.add('active');
      });
    });

    // Save buttons
    const saveGeneralBtn = document.getElementById('saveGeneralBtn');
    if (saveGeneralBtn) {
      saveGeneralBtn.addEventListener('click', async () => {
        try {
          const appName = document.getElementById('appNameInput').value;
          await window.api.updateSetting('appName', appName);
          window.utils.toast('Settings saved', 'success');
        } catch (err) {
          window.utils.toast('Failed to save settings', 'error');
        }
      });
    }

    // Import
    const uploadImportBtn = document.getElementById('uploadImportBtn');
    if (uploadImportBtn) {
      uploadImportBtn.addEventListener('click', async () => {
        const file = document.getElementById('importFileInput').files[0];
        const platform = document.getElementById('importPlatformSelect').value;
        if (!file || !platform) {
          window.utils.toast('Please select file and platform', 'error');
          return;
        }
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('platform', platform);
          const result = await window.api.uploadImport(formData);
          window.utils.toast('Import started', 'success');
          window.app.navigate('import-review', { jobId: result.id });
        } catch (err) {
          window.utils.toast('Import failed', 'error');
        }
      });
    }
  },

  // ============================================================================
  // IMPORT REVIEW PAGE
  // ============================================================================

  'import-review': async function(params = {}) {
    if (!params.jobId) {
      return '<div class="error-state">Import job not found</div>';
    }

    try {
      const [job, records] = await Promise.all([
        window.api.getImportJob(params.jobId),
        window.api.getImportReview(params.jobId),
      ]);

      const html = `
        <div class="page-header">
          <div class="page-title">Review Import</div>
        </div>

        <div class="import-stats">
          <div class="stat">Total: ${records.length}</div>
          <div class="stat">Pending: ${records.filter(r => !r.reviewed).length}</div>
        </div>

        <div class="import-records">
          ${(records || []).map((record, idx) => `
            <div class="import-record" data-record-id="${window.utils.escapeHtml(record.id)}">
              <div class="record-data">
                <h4>${window.utils.escapeHtml(record.data.name)}</h4>
                <p>${window.utils.escapeHtml(record.data.email || 'No email')}</p>
              </div>
              <div class="record-actions">
                <button class="btn btn-sm" data-action="create">Create New</button>
                <button class="btn btn-sm" data-action="skip">Skip</button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="import-footer">
          <button class="btn btn-secondary" id="skipAllBtn">Skip All</button>
          <button class="btn btn-primary" id="finalizeBtn">Finalize Import</button>
        </div>
      `;

      setTimeout(() => this.initImportReview(params.jobId), 0);
      return html;
    } catch (err) {
      console.error('Import review error:', err);
      return '<div class="error-state">Failed to load import review</div>';
    }
  },

  initImportReview: function(jobId) {
    document.querySelectorAll('.record-actions .btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const recordEl = btn.closest('.import-record');
        const recordId = recordEl.dataset.recordId;
        const action = btn.dataset.action;

        try {
          await window.api.reviewImportRecord(recordId, { action });
          recordEl.remove();
        } catch (err) {
          window.utils.toast('Failed to process record', 'error');
        }
      });
    });

    const finalizeBtn = document.getElementById('finalizeBtn');
    if (finalizeBtn) {
      finalizeBtn.addEventListener('click', async () => {
        try {
          await window.api.finalizeImport(jobId);
          window.utils.toast('Import completed', 'success');
          window.app.navigate('contacts');
        } catch (err) {
          window.utils.toast('Failed to finalize import', 'error');
        }
      });
    }
  },
};
