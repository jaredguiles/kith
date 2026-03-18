window.utils = {
  // ============= DATE FORMATTING =============

  /**
   * Format date as "Mar 18, 2026"
   * @param {Date|string} date
   * @returns {string}
   */
  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString('en-US', options);
  },

  /**
   * Format date and time as "Mar 18, 2026 at 2:30 PM"
   * @param {Date|string} date
   * @returns {string}
   */
  formatDateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const dateStr = this.formatDate(d);
    const timeOptions = { hour: 'numeric', minute: '2-digit', meridiem: 'short' };
    const timeStr = d.toLocaleTimeString('en-US', timeOptions);
    return `${dateStr} at ${timeStr}`;
  },

  /**
   * Format date relative to now
   * "2 hours ago", "yesterday", "3 days ago", "next week", etc.
   * @param {Date|string} date
   * @returns {string}
   */
  formatRelative(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    // Past
    if (diffMs > 0) {
      if (diffSec < 60) return 'just now';
      if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
      if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
      if (diffDay === 1) return 'yesterday';
      if (diffDay < 7) return `${diffDay} days ago`;
      if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) > 1 ? 's' : ''} ago`;
      if (diffDay < 365) return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) > 1 ? 's' : ''} ago`;
      return `${Math.floor(diffDay / 365)} year${Math.floor(diffDay / 365) > 1 ? 's' : ''} ago`;
    }

    // Future
    const futureDiffMs = Math.abs(diffMs);
    const futureDiffSec = Math.floor(futureDiffMs / 1000);
    const futureDiffMin = Math.floor(futureDiffSec / 60);
    const futureDiffHour = Math.floor(futureDiffMin / 60);
    const futureDiffDay = Math.floor(futureDiffHour / 24);

    if (futureDiffSec < 60) return 'in a few seconds';
    if (futureDiffMin < 60) return `in ${futureDiffMin} minute${futureDiffMin > 1 ? 's' : ''}`;
    if (futureDiffHour < 24) return `in ${futureDiffHour} hour${futureDiffHour > 1 ? 's' : ''}`;
    if (futureDiffDay === 1) return 'tomorrow';
    if (futureDiffDay < 7) return `in ${futureDiffDay} days`;
    if (futureDiffDay < 30) return `in ${Math.floor(futureDiffDay / 7)} week${Math.floor(futureDiffDay / 7) > 1 ? 's' : ''}`;
    if (futureDiffDay < 365) return `in ${Math.floor(futureDiffDay / 30)} month${Math.floor(futureDiffDay / 30) > 1 ? 's' : ''}`;
    return `in ${Math.floor(futureDiffDay / 365)} year${Math.floor(futureDiffDay / 365) > 1 ? 's' : ''}`;
  },

  /**
   * Format time until a date
   * "in 3 days", "tomorrow", "in 2 hours"
   * @param {Date|string} date
   * @returns {string}
   */
  timeUntil(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = d - now;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMs < 0) return 'overdue';
    if (diffSec < 0) return 'now';
    if (diffMin === 0) return 'in seconds';
    if (diffMin < 60) return `in ${diffMin} minute${diffMin > 1 ? 's' : ''}`;
    if (diffHour < 24) return `in ${diffHour} hour${diffHour > 1 ? 's' : ''}`;
    if (diffDay === 1) return 'tomorrow';
    if (diffDay < 365) return `in ${diffDay} day${diffDay > 1 ? 's' : ''}`;
    return `in ${Math.floor(diffDay / 365)} year${Math.floor(diffDay / 365) > 1 ? 's' : ''}`;
  },

  /**
   * Calculate age from birthday
   * @param {Date|string} birthday
   * @returns {number}
   */
  calculateAge(birthday) {
    if (!birthday) return null;
    const birth = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  },

  /**
   * Get zodiac sign from birthday
   * Returns zodiac sign string (e.g., "Aries", "Taurus")
   * @param {Date|string} birthday
   * @returns {string}
   */
  getZodiacSign(birthday) {
    if (!birthday) return '';
    const date = new Date(birthday);
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const zodiacSigns = [
      { name: 'Capricorn', startMonth: 12, startDay: 22, endMonth: 1, endDay: 19 },
      { name: 'Aquarius', startMonth: 1, startDay: 20, endMonth: 2, endDay: 18 },
      { name: 'Pisces', startMonth: 2, startDay: 19, endMonth: 3, endDay: 20 },
      { name: 'Aries', startMonth: 3, startDay: 21, endMonth: 4, endDay: 19 },
      { name: 'Taurus', startMonth: 4, startDay: 20, endMonth: 5, endDay: 20 },
      { name: 'Gemini', startMonth: 5, startDay: 21, endMonth: 6, endDay: 20 },
      { name: 'Cancer', startMonth: 6, startDay: 21, endMonth: 7, endDay: 22 },
      { name: 'Leo', startMonth: 7, startDay: 23, endMonth: 8, endDay: 22 },
      { name: 'Virgo', startMonth: 8, startDay: 23, endMonth: 9, endDay: 22 },
      { name: 'Libra', startMonth: 9, startDay: 23, endMonth: 10, endDay: 22 },
      { name: 'Scorpio', startMonth: 10, startDay: 23, endMonth: 11, endDay: 21 },
      { name: 'Sagittarius', startMonth: 11, startDay: 22, endMonth: 12, endDay: 21 },
    ];

    for (const zodiac of zodiacSigns) {
      const isInRange = zodiac.startMonth === zodiac.endMonth
        ? month === zodiac.startMonth && day >= zodiac.startDay && day <= zodiac.endDay
        : month === zodiac.startMonth && day >= zodiac.startDay
        || month === zodiac.endMonth && day <= zodiac.endDay;

      if (isInRange) {
        return zodiac.name;
      }
    }
    return '';
  },

  // ============= STRING UTILITIES =============

  /**
   * Get initials from a name
   * "John Doe" → "JD"
   * @param {string} name
   * @returns {string}
   */
  getInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  },

  /**
   * Escape HTML special characters
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Sanitize string for safe display
   * Escapes HTML and trims whitespace
   * @param {string} str
   * @returns {string}
   */
  sanitize(str) {
    if (!str) return '';
    return this.escapeHtml(str.trim());
  },

  /**
   * Truncate string with ellipsis
   * "Hello World" truncated to 8 → "Hello..."
   * @param {string} str
   * @param {number} maxLen
   * @returns {string}
   */
  truncate(str, maxLen = 50) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
  },

  /**
   * Generate a random ID string
   * @returns {string}
   */
  generateId() {
    return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  },

  /**
   * Convert string to URL-friendly slug
   * "Hello World!" → "hello-world"
   * @param {string} str
   * @returns {string}
   */
  slugify(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  /**
   * Format role string
   * "main_admin" → "Main Admin"
   * @param {string} role
   * @returns {string}
   */
  formatRole(role) {
    if (!role) return '';
    return role
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  // ============= URL UTILITIES =============

  /**
   * Parse URL query parameters
   * Returns object from current window.location.search
   * @returns {object}
   */
  parseQueryParams() {
    const params = {};
    const searchParams = new URLSearchParams(window.location.search);
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }
    return params;
  },

  /**
   * Build query string from object
   * {foo: "bar", baz: 123} → "foo=bar&baz=123"
   * @param {object} params
   * @returns {string}
   */
  buildQueryString(params) {
    if (!params || Object.keys(params).length === 0) return '';
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        searchParams.append(key, value);
      }
    }
    return searchParams.toString();
  },

  // ============= FUNCTIONAL UTILITIES =============

  /**
   * Debounce a function
   * Returns debounced version that only executes after ms of inactivity
   * @param {function} fn - Function to debounce
   * @param {number} ms - Milliseconds to wait
   * @returns {function}
   */
  debounce(fn, ms = 300) {
    let timeout;
    return function debounced(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  // ============= UI UTILITIES =============

  /**
   * Show a toast notification
   * @param {string} message
   * @param {string} type - 'success', 'error', 'info' (default: 'info')
   * @param {number} duration - Milliseconds to show (default: 3000)
   */
  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container') || this._createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    const typeStyles = {
      success: { bg: '#10b981', text: 'white' },
      error: { bg: '#ef4444', text: 'white' },
      info: { bg: '#3b82f6', text: 'white' },
    };

    const style = typeStyles[type] || typeStyles.info;
    toast.style.cssText = `
      background-color: ${style.bg};
      color: ${style.text};
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.3s ease-out;
    `;

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  },

  /**
   * Show a confirmation modal
   * @param {string} message
   * @param {function} onConfirm - Callback if user confirms
   * @param {string} confirmText - Button label (default: "Confirm")
   * @param {string} cancelText - Button label (default: "Cancel")
   */
  confirm(message, onConfirm, confirmText = 'Confirm', cancelText = 'Cancel') {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background-color: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 20px 25px rgba(0, 0, 0, 0.15);
      max-width: 400px;
      text-align: center;
    `;

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    messageEl.style.cssText = `
      margin: 0 0 20px 0;
      font-size: 16px;
      color: #333;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
      justify-content: center;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = confirmText;
    confirmBtn.style.cssText = `
      padding: 8px 16px;
      background-color: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    `;
    confirmBtn.addEventListener('click', () => {
      overlay.remove();
      onConfirm();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = cancelText;
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      background-color: #e5e7eb;
      color: #333;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    `;
    cancelBtn.addEventListener('click', () => overlay.remove());

    buttonContainer.appendChild(confirmBtn);
    buttonContainer.appendChild(cancelBtn);
    modal.appendChild(messageEl);
    modal.appendChild(buttonContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  },

  /**
   * Create toast container if it doesn't exist
   * @returns {HTMLElement}
   */
  _createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 400px;
    `;
    document.body.appendChild(container);
    return container;
  },

  // ============= PRIDE FLAG UTILITIES =============

  /**
   * Get CSS gradient for pride flag
   * @param {string} orientation - e.g., "lesbian", "gay", "bisexual", "transgender", "non-binary"
   * @returns {string} - CSS gradient string
   */
  getPrideFlagGradient(orientation) {
    const gradients = {
      lesbian: 'linear-gradient(to right, #ff7a00, #ffb700, #ffffff, #ff7a00)',
      gay: 'linear-gradient(to right, #e40303, #ff8c00, #ffff41, #0051ba, #4b369d)',
      bisexual: 'linear-gradient(to right, #d60270, #d60270 40%, #9b4f96 40%, #9b4f96 60%, #0038a8 60%)',
      transgender: 'linear-gradient(to right, #5bcefa, #f5a9d0, #ffffff, #f5a9d0, #5bcefa)',
      'non-binary': 'linear-gradient(to right, #ffd700, #ffffff, #9c4dc4, #000000)',
      asexual: 'linear-gradient(to right, #000000, #a4a4a4, #ffffff, #810081)',
      aromantic: 'linear-gradient(to right, #3da542, #a4d65e, #ffffff, #ff8580, #000000)',
      genderfluid: 'linear-gradient(to right, #ff76a4, #ffffff, #c011d7, #000000, #2f3cbe)',
    };
    return gradients[orientation?.toLowerCase()] || 'linear-gradient(to right, #e40303, #ff8c00, #ffff41, #0051ba, #4b369d)';
  },

  /**
   * Get CSS class for pride flag indicator
   * @param {string} orientation
   * @returns {string}
   */
  getPrideFlagClass(orientation) {
    return `pride-flag pride-flag-${this.slugify(orientation)}`;
  },

  // ============= ICON UTILITIES =============

  /**
   * Get SVG string for Lucide icon
   * Common icons map included for quick access
   * @param {string} name - Icon name (e.g., 'home', 'users', 'heart')
   * @param {number} size - Icon size in pixels (default: 24)
   * @returns {string} - SVG element as string
   */
  lucideIcon(name, size = 24) {
    const icons = {
      home: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
      users: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      star: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
      heart: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
      flame: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.583-4.35 1.485-5.395.922-.433 2.28.007 2.973 1.055.204.304.672.857 1.02 1.567.228.468.582 1.643.973 2.273.393.632.852 1.424 1.635 1.428.172 0 .343-.027.512-.081 1.519-.454 2.368-1.62 2.368-3.267 0-2.007-1.41-3.909-3.506-4.352-2.096-.443-4.342 1.044-4.97 3.348-.228.987-.191 1.925.122 2.821.314.896.998 1.694 1.353 2.102.327.374.506 1.07.506 1.556 0 .396-.115.792-.348 1.097z" clip-rule="evenodd" fill-rule="evenodd"/><path d="M12 17.5v2.5"/></svg>`,
      search: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
      plus: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
      x: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
      edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
      trash: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
      settings: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m2.12 2.12l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m2.12-2.12l4.24-4.24M19.78 19.78l-4.24-4.24m-2.12-2.12l-4.24-4.24"/></svg>`,
      bell: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
      mail: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6L12 13 2 6"/></svg>`,
      phone: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
      'map-pin': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
      link: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
      image: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
      video: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
      tag: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
      folder: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
      share: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
      merge: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
      eye: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
      'eye-off': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
      check: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
      'chevron-right': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
      'arrow-left': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
      filter: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
      sort: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></svg>`,
      download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
      upload: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
      'more-horizontal': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
      'more-vertical': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
      'log-out': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
      user: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
      'user-plus': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
      clock: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      'alert-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      info: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      'message-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      coffee: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-10a4 4 0 0 1 4-4h1"/><path d="M6 1v4"/><path d="M10 1v4"/><path d="M14 1v4"/><path d="M6 8h12v10"/></svg>`,
      utensils: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V2"/><path d="M7 2v20"/><path d="M20 2v20"/><path d="M20 2c0 1.1.9 2 2 2v0a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2v0c1.1 0 2 .9 2 2v0a2 2 0 0 1-2 2v0c1.1 0 2 .9 2 2v0a2 2 0 0 1-2 2v0"/></svg>`,
      plane: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.7v-2.7a2 2 0 0 0-1.972-2L5 11V2s-4 .5-4 4.5 4 2.5 4 9.5s-4 5 4 9.5 4 4.5 4 4.5h15a2 2 0 0 0 2-2v-2.7"/><path d="M5 11h14.5"/></svg>`,
      dumbbell: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12v4H6z"/><path d="M4 8h2v8H4z"/><path d="M18 8h2v8h-2z"/><path d="M6 12h12v4H6z"/></svg>`,
      zap: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    };

    return icons[name] || `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;
  },
};

// Add CSS animation for toast
if (!document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    @keyframes slideOut {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(100%);
      }
    }
  `;
  document.head.appendChild(style);
}
