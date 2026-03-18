/**
 * Kith Personal CRM - Reusable UI Components
 *
 * Provides render functions that return HTML strings for use in pages.js
 * All components use CSS classes defined in style.css
 * Icons use window.utils.lucideIcon(name, size)
 * User data is escaped with window.utils.escapeHtml()
 */

window.components = {
  // ============================================================================
  // AVATAR & IDENTITY
  // ============================================================================

  /**
   * Avatar image with optional pride flag indicator
   * @param {string} photoUrl - URL to photo, or null
   * @param {string} name - Display name for alt text
   * @param {string} size - 'sm' (28px), 'md' (40px), 'lg' (64px)
   * @param {string|null} orientation - Pride flag identifier (e.g. 'gay', 'trans', 'ace')
   * @returns {string} HTML string
   */
  avatar(photoUrl, name, size = 'md', orientation = null) {
    const sizeMap = { sm: '28px', md: '40px', lg: '64px' };
    const sizeClass = `avatar-${size}`;
    const dimension = sizeMap[size] || sizeMap.md;
    const escapedName = window.utils.escapeHtml(name || 'User');

    let html = `<div class="avatar ${sizeClass}">`;

    if (photoUrl) {
      html += `<img src="${window.utils.escapeHtml(photoUrl)}" alt="${escapedName}" class="avatar-image">`;
    } else {
      // Initials fallback
      const initials = name
        ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : '?';
      html += `<div class="avatar-initials">${window.utils.escapeHtml(initials)}</div>`;
    }

    if (orientation) {
      const flagHtml = window.utils.lucideIcon('flag', 12);
      html += `<span class="avatar-flag avatar-flag-${window.utils.escapeHtml(orientation)}" title="${escapedName} • ${window.utils.escapeHtml(orientation)}">${flagHtml}</span>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Tag pill with color dot
   * @param {object} tag - { id, name, color }
   * @param {boolean} removable - If true, shows remove button
   * @returns {string} HTML string
   */
  tagPill(tag, removable = false) {
    if (!tag || !tag.name) return '';

    const escapedName = window.utils.escapeHtml(tag.name);
    const color = window.utils.escapeHtml(tag.color || 'gray');
    let html = `<span class="tag-pill tag-pill-${color}">`;
    html += `<span class="tag-dot"></span>`;
    html += `<span class="tag-name">${escapedName}</span>`;

    if (removable) {
      const closeIcon = window.utils.lucideIcon('x', 14);
      html += `<button class="tag-remove" onclick="window.app.removeTag(${tag.id})">${closeIcon}</button>`;
    }

    html += '</span>';
    return html;
  },

  /**
   * Group badge with icon and color
   * @param {object} group - { id, name, icon, color }
   * @returns {string} HTML string
   */
  groupBadge(group) {
    if (!group || !group.name) return '';

    const escapedName = window.utils.escapeHtml(group.name);
    const color = window.utils.escapeHtml(group.color || 'blue');
    const iconName = window.utils.escapeHtml(group.icon || 'users');
    const icon = window.utils.lucideIcon(iconName, 16);

    return `<span class="group-badge group-badge-${color}">${icon} ${escapedName}</span>`;
  },

  /**
   * Star rating display or input (1-5 stars)
   * @param {number} value - Current rating (0-5)
   * @param {boolean} editable - If true, shows clickable stars for input
   * @param {string} fieldName - Form field name for hidden input
   * @returns {string} HTML string
   */
  starRating(value = 0, editable = false, fieldName = 'rating') {
    const val = Math.min(5, Math.max(0, parseInt(value) || 0));
    let html = `<div class="star-rating${editable ? ' star-rating-editable' : ''}">`;

    for (let i = 1; i <= 5; i++) {
      const filled = i <= val ? 'star-filled' : 'star-empty';
      const icon = window.utils.lucideIcon(i <= val ? 'star' : 'star', 18);

      if (editable) {
        html += `<button type="button" class="star-btn ${filled}" onclick="window.app.setRating(${i})" data-value="${i}">${icon}</button>`;
      } else {
        html += `<span class="star ${filled}">${icon}</span>`;
      }
    }

    if (editable) {
      html += `<input type="hidden" name="${window.utils.escapeHtml(fieldName)}" value="${val}">`;
    }

    html += '</div>';
    return html;
  },

  // ============================================================================
  // BUTTONS
  // ============================================================================

  /**
   * Primary button
   * @param {string} text - Button text
   * @param {string} onclick - JavaScript to execute on click
   * @param {string|null} icon - Lucide icon name
   * @returns {string} HTML string
   */
  btnPrimary(text, onclick, icon = null) {
    const escapedText = window.utils.escapeHtml(text);
    const iconHtml = icon ? window.utils.lucideIcon(icon, 16) : '';
    return `<button class="btn btn-primary" onclick="${window.utils.escapeHtml(onclick)}">${iconHtml} ${escapedText}</button>`;
  },

  /**
   * Secondary button
   * @param {string} text - Button text
   * @param {string} onclick - JavaScript to execute on click
   * @param {string|null} icon - Lucide icon name
   * @returns {string} HTML string
   */
  btnSecondary(text, onclick, icon = null) {
    const escapedText = window.utils.escapeHtml(text);
    const iconHtml = icon ? window.utils.lucideIcon(icon, 16) : '';
    return `<button class="btn btn-secondary" onclick="${window.utils.escapeHtml(onclick)}">${iconHtml} ${escapedText}</button>`;
  },

  /**
   * Danger button (red, destructive)
   * @param {string} text - Button text
   * @param {string} onclick - JavaScript to execute on click
   * @param {string|null} icon - Lucide icon name
   * @returns {string} HTML string
   */
  btnDanger(text, onclick, icon = null) {
    const escapedText = window.utils.escapeHtml(text);
    const iconHtml = icon ? window.utils.lucideIcon(icon, 16) : '';
    return `<button class="btn btn-danger" onclick="${window.utils.escapeHtml(onclick)}">${iconHtml} ${escapedText}</button>`;
  },

  /**
   * Ghost button (minimal style)
   * @param {string} text - Button text
   * @param {string} onclick - JavaScript to execute on click
   * @param {string|null} icon - Lucide icon name
   * @returns {string} HTML string
   */
  btnGhost(text, onclick, icon = null) {
    const escapedText = window.utils.escapeHtml(text);
    const iconHtml = icon ? window.utils.lucideIcon(icon, 16) : '';
    return `<button class="btn btn-ghost" onclick="${window.utils.escapeHtml(onclick)}">${iconHtml} ${escapedText}</button>`;
  },

  // ============================================================================
  // MODALS
  // ============================================================================

  /**
   * Modal wrapper component
   * @param {string} title - Modal title
   * @param {string} bodyHtml - HTML content for modal body
   * @param {string} footerHtml - HTML for footer (buttons, etc)
   * @param {string} id - Unique modal ID
   * @param {string} size - Modal size class (e.g., 'modal-sm', 'modal-lg')
   * @returns {string} HTML string
   */
  modal(title, bodyHtml, footerHtml, id = 'modal', size = '') {
    const escapedTitle = window.utils.escapeHtml(title);
    const closeIcon = window.utils.lucideIcon('x', 20);

    let html = `<div class="modal-overlay" id="${window.utils.escapeHtml(id)}-overlay" onclick="window.components.closeModal('${window.utils.escapeHtml(id)}')">`;
    html += `<div class="modal ${window.utils.escapeHtml(size)}" onclick="event.stopPropagation()">`;

    // Header
    html += `<div class="modal-header">`;
    html += `<h2 class="modal-title">${escapedTitle}</h2>`;
    html += `<button class="modal-close" onclick="window.components.closeModal('${window.utils.escapeHtml(id)}')">${closeIcon}</button>`;
    html += `</div>`;

    // Content
    html += `<div class="modal-content">${bodyHtml}</div>`;

    // Footer
    if (footerHtml) {
      html += `<div class="modal-footer">${footerHtml}</div>`;
    }

    html += '</div></div>';
    return html;
  },

  /**
   * Show a modal by adding it to DOM
   * @param {string} title - Modal title
   * @param {string} bodyHtml - HTML content for body
   * @param {string} footerHtml - HTML for footer buttons
   * @param {object} opts - Options: { id, size, onClose }
   * @returns {void}
   */
  showModal(title, bodyHtml, footerHtml, opts = {}) {
    const id = opts.id || 'modal-' + Date.now();
    const size = opts.size || '';

    const container = document.getElementById('modal-container') || document.body;
    const modalHtml = this.modal(title, bodyHtml, footerHtml, id, size);

    const wrapper = document.createElement('div');
    wrapper.id = id;
    wrapper.innerHTML = modalHtml;
    container.appendChild(wrapper);

    // Focus management
    const modalEl = wrapper.querySelector('.modal');
    if (modalEl) {
      modalEl.focus();
    }
  },

  /**
   * Close and remove modal from DOM
   * @param {string} modalId - Modal ID to close (or null for last modal)
   * @returns {void}
   */
  closeModal(modalId = null) {
    if (modalId) {
      const el = document.getElementById(modalId);
      if (el) el.remove();
    } else {
      // Close last modal
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) overlay.parentElement.remove();
    }
  },

  // ============================================================================
  // EMPTY STATES & PLACEHOLDERS
  // ============================================================================

  /**
   * Empty state placeholder
   * @param {string} icon - Lucide icon name
   * @param {string} title - Empty state title
   * @param {string} description - Description text
   * @param {string} actionHtml - Optional action button HTML
   * @returns {string} HTML string
   */
  emptyState(icon, title, description, actionHtml = '') {
    const iconHtml = window.utils.lucideIcon(icon, 48);
    const escapedTitle = window.utils.escapeHtml(title);
    const escapedDesc = window.utils.escapeHtml(description);

    let html = `<div class="empty-state">`;
    html += `<div class="empty-state-icon">${iconHtml}</div>`;
    html += `<h3 class="empty-state-title">${escapedTitle}</h3>`;
    html += `<p class="empty-state-description">${escapedDesc}</p>`;

    if (actionHtml) {
      html += `<div class="empty-state-action">${actionHtml}</div>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Loading spinner
   * @returns {string} HTML string
   */
  spinner() {
    return `<div class="spinner"></div>`;
  },

  // ============================================================================
  // CONTACT COMPONENTS
  // ============================================================================

  /**
   * Contact row for lists/tables
   * @param {object} contact - { id, display_name, photo_url, location, relationship_type, orientation, is_favorite, is_spicy, tags: [] }
   * @param {boolean} spicyMode - Whether to show spicy indicators
   * @returns {string} HTML string
   */
  contactRow(contact, spicyMode = false) {
    if (!contact) return '';

    const id = contact.id;
    const name = window.utils.escapeHtml(contact.display_name || 'Unnamed');
    const location = window.utils.escapeHtml(contact.location || '');
    const avatar = this.avatar(contact.photo_url, contact.display_name, 'sm', contact.orientation);

    let html = `<div class="contact-row${spicyMode && contact.is_spicy ? ' contact-row-spicy' : ''}" onclick="window.app.viewContact(${id})">`;

    // Avatar and name section
    html += `<div class="contact-row-avatar">${avatar}</div>`;
    html += `<div class="contact-row-info">`;
    html += `<div class="contact-row-name">${name}</div>`;

    if (location) {
      const locationIcon = window.utils.lucideIcon('map-pin', 14);
      html += `<div class="contact-row-meta">${locationIcon} ${location}</div>`;
    }

    html += `</div>`;

    // Relationship badge
    if (contact.relationship_type) {
      html += this.relationshipBadge(contact.relationship_type);
    }

    // Tags
    if (contact.tags && contact.tags.length > 0) {
      html += `<div class="contact-row-tags">`;
      contact.tags.slice(0, 2).forEach(tag => {
        html += this.tagPill(tag);
      });
      if (contact.tags.length > 2) {
        html += `<span class="tag-more">+${contact.tags.length - 2}</span>`;
      }
      html += `</div>`;
    }

    // Favorite star
    if (contact.is_favorite) {
      const starIcon = window.utils.lucideIcon('star', 16);
      html += `<div class="contact-row-favorite">${starIcon}</div>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Contact card for grid view
   * @param {object} contact - { id, display_name, photo_url, location, relationship_type, orientation, is_favorite, is_spicy, tags: [] }
   * @param {boolean} spicyMode - Whether to show spicy indicators
   * @returns {string} HTML string
   */
  contactCard(contact, spicyMode = false) {
    if (!contact) return '';

    const id = contact.id;
    const name = window.utils.escapeHtml(contact.display_name || 'Unnamed');
    const location = window.utils.escapeHtml(contact.location || '');
    const avatar = this.avatar(contact.photo_url, contact.display_name, 'lg', contact.orientation);

    let html = `<div class="contact-card${spicyMode && contact.is_spicy ? ' contact-card-spicy' : ''}" onclick="window.app.viewContact(${id})">`;

    // Favorite button overlay
    if (contact.is_favorite) {
      const starIcon = window.utils.lucideIcon('star', 18);
      html += `<div class="contact-card-favorite">${starIcon}</div>`;
    }

    // Avatar
    html += `<div class="contact-card-avatar">${avatar}</div>`;

    // Info
    html += `<div class="contact-card-info">`;
    html += `<h3 class="contact-card-name">${name}</h3>`;

    if (location) {
      const locationIcon = window.utils.lucideIcon('map-pin', 14);
      html += `<p class="contact-card-location">${locationIcon} ${location}</p>`;
    }

    if (contact.relationship_type) {
      html += `<div class="contact-card-badge">`;
      html += this.relationshipBadge(contact.relationship_type);
      html += `</div>`;
    }

    if (contact.tags && contact.tags.length > 0) {
      html += `<div class="contact-card-tags">`;
      contact.tags.slice(0, 3).forEach(tag => {
        html += this.tagPill(tag);
      });
      html += `</div>`;
    }

    html += `</div>`;
    html += '</div>';
    return html;
  },

  /**
   * Badge for relationship type
   * @param {string} type - Relationship type (e.g., 'friend', 'family', 'romantic')
   * @returns {string} HTML string
   */
  relationshipBadge(type) {
    if (!type) return '';

    const escaped = window.utils.escapeHtml(type);
    const iconMap = {
      friend: 'users',
      family: 'heart',
      romantic: 'heart',
      professional: 'briefcase',
      acquaintance: 'user',
    };
    const iconName = iconMap[type.toLowerCase()] || 'user';
    const icon = window.utils.lucideIcon(iconName, 14);

    return `<span class="relationship-badge relationship-badge-${escaped}">${icon} ${escaped}</span>`;
  },

  // ============================================================================
  // EVENT & ACTIVITY COMPONENTS
  // ============================================================================

  /**
   * Event item for lists
   * @param {object} event - { id, type, title, date, time, location, contacts: [], status }
   * @returns {string} HTML string
   */
  eventItem(event) {
    if (!event) return '';

    const id = event.id;
    const title = window.utils.escapeHtml(event.title || 'Event');
    const location = window.utils.escapeHtml(event.location || '');
    const type = window.utils.escapeHtml(event.type || 'event');

    const iconMap = {
      birthday: 'cake',
      anniversary: 'calendar-heart',
      meeting: 'calendar',
      call: 'phone',
      email: 'mail',
      text: 'message-square',
      visit: 'map-pin',
      event: 'calendar',
    };
    const iconName = iconMap[type] || 'calendar';
    const icon = window.utils.lucideIcon(iconName, 18);

    let html = `<div class="event-item" onclick="window.app.viewEvent(${id})">`;

    // Icon and title
    html += `<div class="event-item-icon">${icon}</div>`;
    html += `<div class="event-item-content">`;
    html += `<h4 class="event-item-title">${title}</h4>`;

    // Date/time and location
    let meta = '';
    if (event.date) {
      meta += `${window.utils.escapeHtml(event.date)}`;
    }
    if (event.time) {
      meta += ` at ${window.utils.escapeHtml(event.time)}`;
    }

    if (meta) {
      const clockIcon = window.utils.lucideIcon('clock', 14);
      html += `<p class="event-item-meta">${clockIcon} ${meta}</p>`;
    }

    if (location) {
      const mapIcon = window.utils.lucideIcon('map-pin', 14);
      html += `<p class="event-item-meta">${mapIcon} ${location}</p>`;
    }

    // Linked contacts
    if (event.contacts && event.contacts.length > 0) {
      html += `<div class="event-item-contacts">`;
      event.contacts.forEach(contact => {
        html += this.avatar(contact.photo_url, contact.display_name, 'sm', contact.orientation);
      });
      html += `</div>`;
    }

    // Status badge
    if (event.status) {
      const statusEscaped = window.utils.escapeHtml(event.status);
      html += `<span class="event-status event-status-${statusEscaped}">${statusEscaped}</span>`;
    }

    html += `</div></div>`;
    return html;
  },

  /**
   * Timeline/feed item (activity or note)
   * @param {object} item - { type, content, date, author, icon }
   * @returns {string} HTML string
   */
  feedItem(item) {
    if (!item) return '';

    const type = window.utils.escapeHtml(item.type || 'activity');
    const content = window.utils.escapeHtml(item.content || '');
    const date = window.utils.escapeHtml(item.date || '');
    const author = item.author ? window.utils.escapeHtml(item.author) : '';

    const icon = item.icon ? window.utils.lucideIcon(item.icon, 18) : window.utils.lucideIcon('activity', 18);

    let html = `<div class="feed-item feed-item-${type}">`;

    html += `<div class="feed-item-icon">${icon}</div>`;
    html += `<div class="feed-item-content">`;
    html += `<p class="feed-item-text">${content}</p>`;

    if (date || author) {
      html += `<p class="feed-item-meta">`;
      if (author) html += author;
      if (author && date) html += ' • ';
      if (date) html += date;
      html += `</p>`;
    }

    html += `</div></div>`;
    return html;
  },

  /**
   * Note card
   * @param {object} note - { id, title, preview, date, tags: [] }
   * @returns {string} HTML string
   */
  noteCard(note) {
    if (!note) return '';

    const id = note.id;
    const title = window.utils.escapeHtml(note.title || 'Untitled');
    const preview = window.utils.escapeHtml(note.preview || '');
    const date = window.utils.escapeHtml(note.date || '');

    let html = `<div class="note-card" onclick="window.app.viewNote(${id})">`;

    html += `<div class="note-card-header">`;
    html += `<h4 class="note-card-title">${title}</h4>`;
    if (date) {
      html += `<span class="note-card-date">${date}</span>`;
    }
    html += `</div>`;

    if (preview) {
      html += `<p class="note-card-preview">${preview}</p>`;
    }

    if (note.tags && note.tags.length > 0) {
      html += `<div class="note-card-tags">`;
      note.tags.forEach(tag => {
        html += this.tagPill(tag);
      });
      html += `</div>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Reminder item
   * @param {object} reminder - { id, text, due_date, priority, completed }
   * @returns {string} HTML string
   */
  reminderItem(reminder) {
    if (!reminder) return '';

    const id = reminder.id;
    const text = window.utils.escapeHtml(reminder.text || '');
    const dueDate = window.utils.escapeHtml(reminder.due_date || '');
    const priority = window.utils.escapeHtml(reminder.priority || 'normal');
    const completed = reminder.completed || false;

    let html = `<div class="reminder-item${completed ? ' reminder-completed' : ''}">`;

    html += `<input type="checkbox" class="reminder-checkbox" ${completed ? 'checked' : ''} onchange="window.app.toggleReminder(${id})">`;

    html += `<div class="reminder-content">`;
    html += `<p class="reminder-text">${text}</p>`;

    if (dueDate) {
      const calIcon = window.utils.lucideIcon('calendar', 14);
      html += `<span class="reminder-due">${calIcon} ${dueDate}</span>`;
    }

    html += `</div>`;

    if (priority && priority !== 'normal') {
      html += `<span class="reminder-priority reminder-priority-${priority}">${priority}</span>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Notification item
   * @param {object} notification - { id, type, message, date, read }
   * @returns {string} HTML string
   */
  notificationItem(notification) {
    if (!notification) return '';

    const id = notification.id;
    const type = window.utils.escapeHtml(notification.type || 'info');
    const message = window.utils.escapeHtml(notification.message || '');
    const date = window.utils.escapeHtml(notification.date || '');
    const read = notification.read || false;

    const iconMap = {
      info: 'info',
      warning: 'alert-circle',
      error: 'x-circle',
      success: 'check-circle',
      event: 'calendar',
    };
    const iconName = iconMap[type] || 'bell';
    const icon = window.utils.lucideIcon(iconName, 18);

    let html = `<div class="notification-item${read ? ' notification-read' : ''}" onclick="window.app.markNotificationRead(${id})">`;

    html += `<div class="notification-icon notification-icon-${type}">${icon}</div>`;
    html += `<div class="notification-content">`;
    html += `<p class="notification-message">${message}</p>`;

    if (date) {
      html += `<span class="notification-date">${date}</span>`;
    }

    html += `</div>`;
    html += '</div>';
    return html;
  },

  // ============================================================================
  // MEDIA & ATTACHMENTS
  // ============================================================================

  /**
   * Media thumbnail (photo/video)
   * @param {object} media - { id, url, type, size }
   * @param {string} onclick - Optional onclick handler
   * @returns {string} HTML string
   */
  mediaThumbnail(media, onclick = '') {
    if (!media) return '';

    const url = window.utils.escapeHtml(media.url || '');
    const type = media.type || 'photo';
    const onclickAttr = onclick ? ` onclick="${window.utils.escapeHtml(onclick)}"` : '';

    let html = `<div class="media-thumbnail media-thumbnail-${type}"${onclickAttr}>`;

    if (type === 'video') {
      const playIcon = window.utils.lucideIcon('play-circle', 32);
      html += `<img src="${url}" alt="Video thumbnail" class="media-thumbnail-image">`;
      html += `<div class="media-thumbnail-overlay">${playIcon}</div>`;
    } else {
      html += `<img src="${url}" alt="Photo" class="media-thumbnail-image">`;
    }

    html += '</div>';
    return html;
  },

  // ============================================================================
  // DASHBOARD & STATS
  // ============================================================================

  /**
   * Stats card for dashboard
   * @param {string} icon - Lucide icon name
   * @param {string} label - Stat label
   * @param {string|number} value - Stat value
   * @param {string} color - Color class (e.g., 'blue', 'green', 'purple')
   * @returns {string} HTML string
   */
  statsCard(icon, label, value, color = '') {
    const iconHtml = window.utils.lucideIcon(icon, 28);
    const escapedLabel = window.utils.escapeHtml(label);
    const escapedValue = window.utils.escapeHtml(String(value));
    const colorClass = color ? ` stats-card-${window.utils.escapeHtml(color)}` : '';

    let html = `<div class="stats-card${colorClass}">`;
    html += `<div class="stats-card-icon">${iconHtml}</div>`;
    html += `<div class="stats-card-content">`;
    html += `<p class="stats-card-label">${escapedLabel}</p>`;
    html += `<p class="stats-card-value">${escapedValue}</p>`;
    html += `</div></div>`;
    return html;
  },

  // ============================================================================
  // FORM COMPONENTS
  // ============================================================================

  /**
   * Form group wrapper
   * @param {string} label - Field label
   * @param {string} inputHtml - HTML for input element
   * @param {string} hint - Optional hint/help text
   * @returns {string} HTML string
   */
  formGroup(label, inputHtml, hint = '') {
    const escapedLabel = window.utils.escapeHtml(label);
    const escapedHint = window.utils.escapeHtml(hint);

    let html = `<div class="form-group">`;
    html += `<label class="form-label">${escapedLabel}</label>`;
    html += inputHtml;

    if (hint) {
      html += `<p class="form-hint">${escapedHint}</p>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Text input field
   * @param {string} name - Input name attribute
   * @param {string} value - Current value
   * @param {string} placeholder - Placeholder text
   * @param {string} type - Input type (text, email, url, tel, etc)
   * @returns {string} HTML string
   */
  textInput(name, value = '', placeholder = '', type = 'text') {
    const escapedName = window.utils.escapeHtml(name);
    const escapedValue = window.utils.escapeHtml(String(value));
    const escapedPlaceholder = window.utils.escapeHtml(placeholder);
    const escapedType = window.utils.escapeHtml(type);

    return `<input type="${escapedType}" class="form-input" name="${escapedName}" value="${escapedValue}" placeholder="${escapedPlaceholder}">`;
  },

  /**
   * Text area field
   * @param {string} name - Input name attribute
   * @param {string} value - Current value
   * @param {string} placeholder - Placeholder text
   * @param {number} rows - Number of rows
   * @returns {string} HTML string
   */
  textArea(name, value = '', placeholder = '', rows = 3) {
    const escapedName = window.utils.escapeHtml(name);
    const escapedValue = window.utils.escapeHtml(String(value));
    const escapedPlaceholder = window.utils.escapeHtml(placeholder);
    const escapedRows = window.utils.escapeHtml(String(rows));

    return `<textarea class="form-textarea" name="${escapedName}" placeholder="${escapedPlaceholder}" rows="${escapedRows}">${escapedValue}</textarea>`;
  },

  /**
   * Select/dropdown field
   * @param {string} name - Input name attribute
   * @param {array} options - [{ label, value }]
   * @param {string} selected - Currently selected value
   * @param {string} placeholder - Placeholder text
   * @returns {string} HTML string
   */
  selectInput(name, options, selected = '', placeholder = 'Select…') {
    const escapedName = window.utils.escapeHtml(name);
    const escapedPlaceholder = window.utils.escapeHtml(placeholder);

    let html = `<select class="form-select" name="${escapedName}">`;

    if (placeholder) {
      html += `<option value="">${escapedPlaceholder}</option>`;
    }

    if (options && Array.isArray(options)) {
      options.forEach(opt => {
        const label = window.utils.escapeHtml(opt.label || opt.value);
        const value = window.utils.escapeHtml(String(opt.value));
        const isSelected = value === String(selected) ? ' selected' : '';
        html += `<option value="${value}"${isSelected}>${label}</option>`;
      });
    }

    html += '</select>';
    return html;
  },

  /**
   * Toggle/checkbox switch
   * @param {string} name - Input name attribute
   * @param {boolean} checked - Whether checked
   * @param {string} label - Label text
   * @returns {string} HTML string
   */
  toggleSwitch(name, checked = false, label = '') {
    const escapedName = window.utils.escapeHtml(name);
    const escapedLabel = window.utils.escapeHtml(label);
    const isChecked = checked ? ' checked' : '';

    let html = `<div class="toggle-switch">`;
    html += `<input type="checkbox" id="toggle-${escapedName}" name="${escapedName}" class="toggle-input"${isChecked}>`;
    html += `<label for="toggle-${escapedName}" class="toggle-label"></label>`;

    if (label) {
      html += `<span class="toggle-text">${escapedLabel}</span>`;
    }

    html += '</div>';
    return html;
  },

  // ============================================================================
  // PAGE LAYOUT COMPONENTS
  // ============================================================================

  /**
   * Page header with title and action buttons
   * @param {string} title - Page title
   * @param {string} actionsHtml - HTML for action buttons
   * @param {string} subtitle - Optional subtitle
   * @returns {string} HTML string
   */
  pageHeader(title, actionsHtml = '', subtitle = '') {
    const escapedTitle = window.utils.escapeHtml(title);
    const escapedSubtitle = window.utils.escapeHtml(subtitle);

    let html = `<div class="page-header">`;
    html += `<div class="page-header-content">`;
    html += `<h1 class="page-title">${escapedTitle}</h1>`;

    if (subtitle) {
      html += `<p class="page-subtitle">${escapedSubtitle}</p>`;
    }

    html += `</div>`;

    if (actionsHtml) {
      html += `<div class="page-header-actions">${actionsHtml}</div>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Toolbar with search, filters, and sort
   * @param {object} opts - Options object
   *   - searchPlaceholder: string
   *   - filters: [{ label, value, active }]
   *   - sortOptions: [{ label, value }]
   *   - currentSort: string
   *   - currentSortDir: 'asc' or 'desc'
   *   - extraHtml: string
   * @returns {string} HTML string
   */
  toolbar(opts = {}) {
    const searchPlaceholder = window.utils.escapeHtml(opts.searchPlaceholder || 'Search…');
    const filters = opts.filters || [];
    const sortOptions = opts.sortOptions || [];
    const currentSort = opts.currentSort || '';
    const currentSortDir = opts.currentSortDir || 'asc';
    const extraHtml = opts.extraHtml || '';

    let html = `<div class="toolbar">`;

    // Search input
    html += `<div class="toolbar-search">`;
    const searchIcon = window.utils.lucideIcon('search', 18);
    html += `<input type="text" class="toolbar-search-input" placeholder="${searchPlaceholder}" onkeyup="window.app.handleSearch(this.value)">`;
    html += `<span class="toolbar-search-icon">${searchIcon}</span>`;
    html += `</div>`;

    // Filter pills
    if (filters.length > 0) {
      html += `<div class="toolbar-filters">`;
      filters.forEach(filter => {
        const active = filter.active ? ' filter-pill-active' : '';
        const label = window.utils.escapeHtml(filter.label);
        const value = window.utils.escapeHtml(filter.value);
        html += `<button class="filter-pill${active}" onclick="window.app.toggleFilter('${value}')">${label}</button>`;
      });
      html += `</div>`;
    }

    // Sort dropdown
    if (sortOptions.length > 0) {
      html += `<div class="toolbar-sort">`;
      const sortLabel = sortOptions.find(o => o.value === currentSort)?.label || 'Sort';
      const escapedSortLabel = window.utils.escapeHtml(sortLabel);
      html += `<select class="toolbar-sort-select" onchange="window.app.handleSort(this.value)">`;
      sortOptions.forEach(opt => {
        const label = window.utils.escapeHtml(opt.label);
        const value = window.utils.escapeHtml(opt.value);
        const selected = value === currentSort ? ' selected' : '';
        html += `<option value="${value}"${selected}>${label}</option>`;
      });
      html += `</select>`;

      // Sort direction toggle
      const sortDirIcon = currentSortDir === 'asc' ? 'arrow-up' : 'arrow-down';
      const sortIcon = window.utils.lucideIcon(sortDirIcon, 16);
      html += `<button class="toolbar-sort-dir" onclick="window.app.toggleSortDir()" title="Toggle sort direction">${sortIcon}</button>`;
      html += `</div>`;
    }

    // Extra HTML
    if (extraHtml) {
      html += `<div class="toolbar-extra">${extraHtml}</div>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Filter pill (used in toolbar)
   * @param {string} label - Pill label
   * @param {boolean} active - Is currently active
   * @param {string} onclick - Click handler
   * @returns {string} HTML string
   */
  filterPill(label, active = false, onclick = '') {
    const escapedLabel = window.utils.escapeHtml(label);
    const activeClass = active ? ' filter-pill-active' : '';
    const onclickAttr = onclick ? ` onclick="${window.utils.escapeHtml(onclick)}"` : '';

    return `<span class="filter-pill${activeClass}"${onclickAttr}>${escapedLabel}</span>`;
  },

  /**
   * Pagination controls
   * @param {number} total - Total items
   * @param {number} limit - Items per page
   * @param {number} offset - Current offset
   * @returns {string} HTML string
   */
  pagination(total, limit, offset) {
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    if (totalPages <= 1) return '';

    let html = `<div class="pagination">`;

    // Previous button
    if (currentPage > 1) {
      const prevOffset = offset - limit;
      const prevIcon = window.utils.lucideIcon('chevron-left', 18);
      html += `<button class="pagination-btn" onclick="window.app.goToPage(${prevOffset})">${prevIcon}</button>`;
    }

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
      const pageOffset = (i - 1) * limit;
      const isActive = i === currentPage ? ' pagination-active' : '';
      html += `<button class="pagination-page${isActive}" onclick="window.app.goToPage(${pageOffset})">${i}</button>`;
    }

    // Next button
    if (currentPage < totalPages) {
      const nextOffset = offset + limit;
      const nextIcon = window.utils.lucideIcon('chevron-right', 18);
      html += `<button class="pagination-btn" onclick="window.app.goToPage(${nextOffset})">${nextIcon}</button>`;
    }

    html += '</div>';
    return html;
  },

  // ============================================================================
  // SOCIAL & EXTERNAL LINKS
  // ============================================================================

  /**
   * Social link display
   * @param {object} social - { platform, url, handle }
   * @returns {string} HTML string
   */
  socialLink(social) {
    if (!social || !social.platform) return '';

    const platform = window.utils.escapeHtml(social.platform.toLowerCase());
    const handle = window.utils.escapeHtml(social.handle || '');
    const url = window.utils.escapeHtml(social.url || '#');

    const iconMap = {
      twitter: 'twitter',
      x: 'x',
      instagram: 'instagram',
      facebook: 'facebook',
      linkedin: 'linkedin',
      github: 'github',
      tiktok: 'music',
      youtube: 'youtube',
      threads: 'at-sign',
    };
    const iconName = iconMap[platform] || 'link';
    const icon = window.utils.lucideIcon(iconName, 16);

    let html = `<a href="${url}" class="social-link social-link-${platform}" target="_blank" rel="noopener noreferrer">`;
    html += `${icon} ${handle || platform}`;
    html += '</a>';
    return html;
  },

  // ============================================================================
  // IMPORT & DATA MANAGEMENT
  // ============================================================================

  /**
   * Import progress widget
   * @param {object} job - { id, status, processed, total, errors }
   * @returns {string} HTML string
   */
  importWidget(job) {
    if (!job) return '';

    const status = window.utils.escapeHtml(job.status || 'processing');
    const processed = parseInt(job.processed) || 0;
    const total = parseInt(job.total) || 0;
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
    const errors = job.errors || 0;

    const statusIcon = status === 'completed' ? 'check-circle' : status === 'error' ? 'x-circle' : 'loader';
    const icon = window.utils.lucideIcon(statusIcon, 18);

    let html = `<div class="import-widget import-widget-${status}">`;

    html += `<div class="import-widget-header">`;
    html += `<div class="import-widget-status">${icon} <span>${window.utils.escapeHtml(status)}</span></div>`;
    html += `<div class="import-widget-count">${processed}/${total}</div>`;
    html += `</div>`;

    // Progress bar
    html += `<div class="import-widget-bar">`;
    html += `<div class="import-widget-progress" style="width: ${percent}%"></div>`;
    html += `</div>`;

    // Error count
    if (errors > 0) {
      html += `<div class="import-widget-errors">${errors} error${errors !== 1 ? 's' : ''}</div>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Data review card (for import review)
   * @param {object} stagingRecord - Imported data
   * @param {object|null} existingContact - Existing contact for comparison
   * @returns {string} HTML string
   */
  reviewCard(stagingRecord, existingContact = null) {
    if (!stagingRecord) return '';

    const name = window.utils.escapeHtml(stagingRecord.display_name || 'Unnamed');
    const imported = existingContact ? 'warning' : 'new';
    const importedIcon = existingContact ? 'alert-circle' : 'check-circle';
    const icon = window.utils.lucideIcon(importedIcon, 18);

    let html = `<div class="review-card review-card-${imported}">`;

    html += `<div class="review-card-header">`;
    html += `<div class="review-card-icon">${icon}</div>`;
    html += `<div class="review-card-title">${name}</div>`;

    if (existingContact) {
      html += `<span class="review-card-badge">Existing contact found</span>`;
    } else {
      html += `<span class="review-card-badge">New contact</span>`;
    }

    html += `</div>`;

    if (existingContact) {
      html += `<div class="review-card-actions">`;
      html += this.btnPrimary('Review Merge', `window.app.showMergeReview(${stagingRecord.id})`);
      html += this.btnSecondary('Import as New', `window.app.importAsNew(${stagingRecord.id})`);
      html += `</div>`;
    } else {
      html += `<div class="review-card-actions">`;
      html += this.btnPrimary('Import', `window.app.importContact(${stagingRecord.id})`);
      html += this.btnGhost('Skip', `window.app.skipContact(${stagingRecord.id})`);
      html += `</div>`;
    }

    html += '</div>';
    return html;
  },

  /**
   * Merge conflict row (side-by-side field comparison)
   * @param {string} fieldName - Field name
   * @param {any} valueA - Value from source A
   * @param {any} valueB - Value from source B
   * @param {string} selected - Currently selected ('a' or 'b')
   * @returns {string} HTML string
   */
  mergeFieldRow(fieldName, valueA, valueB, selected = 'a') {
    const escaped = window.utils.escapeHtml(fieldName);
    const valA = window.utils.escapeHtml(String(valueA || ''));
    const valB = window.utils.escapeHtml(String(valueB || ''));

    let html = `<div class="merge-field-row">`;

    html += `<div class="merge-field-name">${escaped}</div>`;

    // Value A
    html += `<div class="merge-field-value${selected === 'a' ? ' merge-selected' : ''}">`;
    html += `<input type="radio" name="merge-${escaped}" value="a" ${selected === 'a' ? 'checked' : ''} onchange="window.app.selectMergeValue('${escaped}', 'a')">`;
    html += `<span>${valA || '(empty)'}</span>`;
    html += `</div>`;

    // Value B
    html += `<div class="merge-field-value${selected === 'b' ? ' merge-selected' : ''}">`;
    html += `<input type="radio" name="merge-${escaped}" value="b" ${selected === 'b' ? 'checked' : ''} onchange="window.app.selectMergeValue('${escaped}', 'b')">`;
    html += `<span>${valB || '(empty)'}</span>`;
    html += `</div>`;

    html += '</div>';
    return html;
  },

  // ============================================================================
  // SETTINGS & ADMIN
  // ============================================================================

  /**
   * Settings section card
   * @param {string} title - Section title
   * @param {string} bodyHtml - Section content HTML
   * @returns {string} HTML string
   */
  settingsSection(title, bodyHtml) {
    const escapedTitle = window.utils.escapeHtml(title);

    let html = `<div class="settings-section">`;
    html += `<h3 class="settings-section-title">${escapedTitle}</h3>`;
    html += `<div class="settings-section-body">${bodyHtml}</div>`;
    html += '</div>';
    return html;
  },

  /**
   * User row for settings/admin page
   * @param {object} user - { id, display_name, photo_url, email, role, created_at }
   * @returns {string} HTML string
   */
  userRow(user) {
    if (!user) return '';

    const id = user.id;
    const name = window.utils.escapeHtml(user.display_name || 'Unnamed');
    const email = window.utils.escapeHtml(user.email || '');
    const role = window.utils.escapeHtml(user.role || 'user');
    const avatar = this.avatar(user.photo_url, user.display_name, 'sm');

    let html = `<div class="user-row">`;

    html += `<div class="user-row-avatar">${avatar}</div>`;
    html += `<div class="user-row-info">`;
    html += `<div class="user-row-name">${name}</div>`;

    if (email) {
      html += `<div class="user-row-email">${email}</div>`;
    }

    html += `</div>`;

    if (role) {
      html += `<span class="user-role user-role-${role}">${role}</span>`;
    }

    html += `<div class="user-row-actions">`;
    html += this.btnGhost('Edit', `window.app.editUser(${id})`);
    html += this.btnDanger('Remove', `window.app.removeUser(${id})`);
    html += `</div>`;

    html += '</div>';
    return html;
  },

  /**
   * Popover for dropdown menus (filters, sort options)
   * @param {string} triggerId - ID of trigger element
   * @param {array} items - [{ label, value, icon }]
   * @param {boolean} multiSelect - Allow multiple selections
   * @returns {string} HTML string
   */
  popover(triggerId, items, multiSelect = false) {
    if (!items || items.length === 0) return '';

    const escapedTriggerId = window.utils.escapeHtml(triggerId);
    let html = `<div class="popover" id="popover-${escapedTriggerId}">`;
    html += `<div class="popover-content">`;

    items.forEach(item => {
      const label = window.utils.escapeHtml(item.label);
      const value = window.utils.escapeHtml(String(item.value));
      const icon = item.icon ? window.utils.lucideIcon(item.icon, 16) : '';

      if (multiSelect) {
        html += `<label class="popover-item popover-item-checkbox">`;
        html += `<input type="checkbox" value="${value}">`;
        html += `<span>${icon} ${label}</span>`;
        html += `</label>`;
      } else {
        html += `<button class="popover-item" onclick="window.app.selectOption('${value}')">`;
        html += `${icon} ${label}`;
        html += `</button>`;
      }
    });

    html += `</div></div>`;
    return html;
  },
};

// Ensure window.components is globally available
if (typeof window !== 'undefined') {
  window.components = window.components || {};
}
