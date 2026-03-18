window.api = {
  token: null,

  /**
   * Convert snake_case keys to camelCase recursively
   */
  _toCamel(obj) {
    if (Array.isArray(obj)) return obj.map(v => this._toCamel(v));
    if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
      return Object.keys(obj).reduce((result, key) => {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        result[camelKey] = this._toCamel(obj[key]);
        return result;
      }, {});
    }
    return obj;
  },

  /**
   * Convert camelCase keys to snake_case for sending to API
   */
  _toSnake(obj) {
    if (Array.isArray(obj)) return obj.map(v => this._toSnake(v));
    if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
      return Object.keys(obj).reduce((result, key) => {
        const snakeKey = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
        result[snakeKey] = this._toSnake(obj[key]);
        return result;
      }, {});
    }
    return obj;
  },

  /**
   * Base fetch wrapper that adds auth headers and handles errors
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
   * @param {string} path - API path (e.g., '/api/contacts')
   * @param {*} body - Request body (will be JSON stringified)
   * @param {object} options - Additional fetch options
   * @returns {Promise<*>} Response data (keys converted to camelCase)
   */
  async request(method, path, body = null, options = {}) {
    const url = `${window.location.origin}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add auth token if available
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const fetchOptions = {
      method,
      headers,
      ...options,
    };

    if (body && method !== 'GET') {
      if (body instanceof FormData) {
        // FormData: don't JSON-stringify, don't set Content-Type (browser will set it with boundary)
        fetchOptions.body = body;
        delete fetchOptions.headers['Content-Type'];
      } else {
        // Convert camelCase keys to snake_case for the API
        fetchOptions.body = JSON.stringify(this._toSnake(body));
      }
    }

    try {
      const response = await fetch(url, fetchOptions);

      // Handle 401 - token expired or invalid
      if (response.status === 401) {
        this.token = null;
        localStorage.removeItem('kith_token');
        if (window.app && window.app.showLogin) {
          window.app.showLogin();
        }
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.data = errorData;
        throw error;
      }

      // Handle empty responses
      if (response.status === 204) {
        return null;
      }

      const data = await response.json();
      return this._toCamel(data);
    } catch (error) {
      console.error(`API Error [${method} ${path}]:`, error);
      throw error;
    }
  },

  // ============= AUTH =============

  /**
   * Login with username and password
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{user, token}>}
   */
  async login(username, password) {
    const result = await this.request('POST', '/api/auth/login', {
      username,
      password,
    });
    if (result && result.token) {
      this.token = result.token;
      localStorage.setItem('kith_token', result.token);
    }
    return result;
  },

  /**
   * Get current authenticated user
   * @returns {Promise<object>}
   */
  async getMe() {
    return this.request('GET', '/api/auth/me');
  },

  /**
   * Change password
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<object>}
   */
  async changePassword(currentPassword, newPassword) {
    return this.request('PATCH', '/api/auth/password', {
      currentPassword,
      newPassword,
    });
  },

  // ============= USERS (ADMIN) =============

  /**
   * Get all users
   * @returns {Promise<array>}
   */
  async getUsers() {
    return this.request('GET', '/api/users');
  },

  /**
   * Create a new user
   * @param {object} data - User data (username, email, password, role, etc.)
   * @returns {Promise<object>}
   */
  async createUser(data) {
    return this.request('POST', '/api/users', data);
  },

  /**
   * Update a user
   * @param {string} id - User ID
   * @param {object} data - Fields to update
   * @returns {Promise<object>}
   */
  async updateUser(id, data) {
    return this.request('PATCH', `/api/users/${id}`, data);
  },

  /**
   * Delete a user
   * @param {string} id - User ID
   * @returns {Promise<null>}
   */
  async deleteUser(id) {
    return this.request('DELETE', `/api/users/${id}`);
  },

  // ============= CONTACTS =============

  /**
   * Get contacts with filtering and pagination
   * @param {object} params - Filter params
   *   - tag: filter by tag ID
   *   - group: filter by group ID
   *   - search: search by name/email
   *   - sort: sort field (name, created, updated)
   *   - sortDir: asc or desc
   *   - favorites: boolean
   *   - spicy: boolean
   *   - limit: page size
   *   - offset: pagination offset
   * @returns {Promise<{data, total}>}
   */
  async getContacts(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/api/contacts${qs ? '?' + qs : ''}`);
  },

  /**
   * Get a single contact
   * @param {string} id - Contact ID
   * @returns {Promise<object>}
   */
  async getContact(id) {
    return this.request('GET', `/api/contacts/${id}`);
  },

  /**
   * Create a new contact
   * @param {object} data - Contact data
   * @returns {Promise<object>}
   */
  async createContact(data) {
    return this.request('POST', '/api/contacts', data);
  },

  /**
   * Update a contact
   * @param {string} id - Contact ID
   * @param {object} data - Fields to update
   * @returns {Promise<object>}
   */
  async updateContact(id, data) {
    return this.request('PATCH', `/api/contacts/${id}`, data);
  },

  /**
   * Delete a contact
   * @param {string} id - Contact ID
   * @returns {Promise<null>}
   */
  async deleteContact(id) {
    return this.request('DELETE', `/api/contacts/${id}`);
  },

  /**
   * Merge two contacts
   * @param {string} id - Primary contact ID
   * @param {string} otherId - Contact to merge into primary
   * @param {object} fieldDecisions - Which fields to keep from each contact
   * @returns {Promise<object>}
   */
  async mergeContacts(id, otherId, fieldDecisions) {
    return this.request('POST', `/api/contacts/${id}/merge`, {
      otherId,
      fieldDecisions,
    });
  },

  /**
   * Share a contact with another user
   * @param {string} id - Contact ID
   * @param {string} userId - User to share with
   * @param {string} permissions - read, edit, admin
   * @param {string} shareScope - private, group, public
   * @returns {Promise<object>}
   */
  async shareContact(id, userId, permissions, shareScope) {
    return this.request('POST', `/api/contacts/${id}/share`, {
      userId,
      permissions,
      shareScope,
    });
  },

  /**
   * Unshare a contact
   * @param {string} id - Contact ID
   * @param {string} userId - User to unshare from
   * @returns {Promise<null>}
   */
  async unshareContact(id, userId) {
    return this.request('DELETE', `/api/contacts/${id}/share/${userId}`);
  },

  /**
   * Set contact photo
   * @param {string} id - Contact ID
   * @param {string} mediaId - Media ID
   * @returns {Promise<object>}
   */
  async setContactPhoto(id, mediaId) {
    return this.request('PATCH', `/api/contacts/${id}/photo`, {
      mediaId,
    });
  },

  /**
   * Toggle favorite status
   * @param {string} id - Contact ID
   * @returns {Promise<object>}
   */
  async toggleFavorite(id) {
    return this.request('POST', `/api/contacts/${id}/favorite`);
  },

  /**
   * Get contact changelog
   * @param {string} id - Contact ID
   * @returns {Promise<array>}
   */
  async getContactChangelog(id) {
    return this.request('GET', `/api/contacts/${id}/changelog`);
  },

  // ============= CONTACT DETAILS =============

  /**
   * Get all emails for a contact
   * @param {string} contactId
   * @returns {Promise<array>}
   */
  async getContactEmails(contactId) {
    return this.request('GET', `/api/contacts/${contactId}/emails`);
  },

  /**
   * Add an email to a contact
   * @param {string} contactId
   * @param {object} data - {email, type, isPrimary}
   * @returns {Promise<object>}
   */
  async addContactEmail(contactId, data) {
    return this.request('POST', `/api/contacts/${contactId}/emails`, data);
  },

  /**
   * Update an email
   * @param {string} id - Email ID
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateEmail(id, data) {
    return this.request('PATCH', `/api/emails/${id}`, data);
  },

  /**
   * Delete an email
   * @param {string} id - Email ID
   * @returns {Promise<null>}
   */
  async deleteEmail(id) {
    return this.request('DELETE', `/api/emails/${id}`);
  },

  /**
   * Get all phones for a contact
   * @param {string} contactId
   * @returns {Promise<array>}
   */
  async getContactPhones(contactId) {
    return this.request('GET', `/api/contacts/${contactId}/phones`);
  },

  /**
   * Add a phone to a contact
   * @param {string} contactId
   * @param {object} data - {phone, type, isPrimary}
   * @returns {Promise<object>}
   */
  async addContactPhone(contactId, data) {
    return this.request('POST', `/api/contacts/${contactId}/phones`, data);
  },

  /**
   * Update a phone
   * @param {string} id - Phone ID
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updatePhone(id, data) {
    return this.request('PATCH', `/api/phones/${id}`, data);
  },

  /**
   * Delete a phone
   * @param {string} id - Phone ID
   * @returns {Promise<null>}
   */
  async deletePhone(id) {
    return this.request('DELETE', `/api/phones/${id}`);
  },

  /**
   * Get all addresses for a contact
   * @param {string} contactId
   * @returns {Promise<array>}
   */
  async getContactAddresses(contactId) {
    return this.request('GET', `/api/contacts/${contactId}/addresses`);
  },

  /**
   * Add an address to a contact
   * @param {string} contactId
   * @param {object} data - {street, city, state, zip, country, type, isPrimary}
   * @returns {Promise<object>}
   */
  async addContactAddress(contactId, data) {
    return this.request('POST', `/api/contacts/${contactId}/addresses`, data);
  },

  /**
   * Update an address
   * @param {string} id - Address ID
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateAddress(id, data) {
    return this.request('PATCH', `/api/addresses/${id}`, data);
  },

  /**
   * Delete an address
   * @param {string} id - Address ID
   * @returns {Promise<null>}
   */
  async deleteAddress(id) {
    return this.request('DELETE', `/api/addresses/${id}`);
  },

  // ============= TAGS =============

  /**
   * Get all tags
   * @returns {Promise<array>}
   */
  async getTags() {
    return this.request('GET', '/api/tags');
  },

  /**
   * Create a tag
   * @param {object} data - {name, color}
   * @returns {Promise<object>}
   */
  async createTag(data) {
    return this.request('POST', '/api/tags', data);
  },

  /**
   * Update a tag
   * @param {string} id - Tag ID
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateTag(id, data) {
    return this.request('PATCH', `/api/tags/${id}`, data);
  },

  /**
   * Delete a tag
   * @param {string} id - Tag ID
   * @returns {Promise<null>}
   */
  async deleteTag(id) {
    return this.request('DELETE', `/api/tags/${id}`);
  },

  /**
   * Add a tag to a contact
   * @param {string} contactId
   * @param {string} tagId
   * @returns {Promise<object>}
   */
  async addTagToContact(contactId, tagId) {
    return this.request('POST', `/api/contacts/${contactId}/tags/${tagId}`);
  },

  /**
   * Remove a tag from a contact
   * @param {string} contactId
   * @param {string} tagId
   * @returns {Promise<null>}
   */
  async removeTagFromContact(contactId, tagId) {
    return this.request('DELETE', `/api/contacts/${contactId}/tags/${tagId}`);
  },

  // ============= GROUPS =============

  /**
   * Get all groups
   * @returns {Promise<array>}
   */
  async getGroups() {
    return this.request('GET', '/api/groups');
  },

  /**
   * Create a group
   * @param {object} data - {name, description}
   * @returns {Promise<object>}
   */
  async createGroup(data) {
    return this.request('POST', '/api/groups', data);
  },

  /**
   * Update a group
   * @param {string} id - Group ID
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateGroup(id, data) {
    return this.request('PATCH', `/api/groups/${id}`, data);
  },

  /**
   * Delete a group
   * @param {string} id - Group ID
   * @returns {Promise<null>}
   */
  async deleteGroup(id) {
    return this.request('DELETE', `/api/groups/${id}`);
  },

  /**
   * Add a contact to a group
   * @param {string} groupId
   * @param {string} contactId
   * @returns {Promise<object>}
   */
  async addGroupMember(groupId, contactId) {
    return this.request('POST', `/api/groups/${groupId}/members/${contactId}`);
  },

  /**
   * Remove a contact from a group
   * @param {string} groupId
   * @param {string} contactId
   * @returns {Promise<null>}
   */
  async removeGroupMember(groupId, contactId) {
    return this.request('DELETE', `/api/groups/${groupId}/members/${contactId}`);
  },

  // ============= SOCIALS =============

  /**
   * Get social media links for a contact
   * @param {string} contactId
   * @returns {Promise<array>}
   */
  async getContactSocials(contactId) {
    return this.request('GET', `/api/contacts/${contactId}/socials`);
  },

  /**
   * Add a social link to a contact
   * @param {string} contactId
   * @param {object} data - {platform, handle, url}
   * @returns {Promise<object>}
   */
  async addSocial(contactId, data) {
    return this.request('POST', `/api/contacts/${contactId}/socials`, data);
  },

  /**
   * Update a social link
   * @param {string} id - Social ID
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateSocial(id, data) {
    return this.request('PATCH', `/api/socials/${id}`, data);
  },

  /**
   * Delete a social link
   * @param {string} id - Social ID
   * @returns {Promise<null>}
   */
  async deleteSocial(id) {
    return this.request('DELETE', `/api/socials/${id}`);
  },

  // ============= SPICY =============

  /**
   * Get spicy profile for a contact
   * @param {string} contactId
   * @returns {Promise<object>}
   */
  async getSpicyProfile(contactId) {
    return this.request('GET', `/api/contacts/${contactId}/spicy`);
  },

  /**
   * Update spicy profile
   * @param {string} contactId
   * @param {object} data - {orientation, pronouns, interested_in, etc.}
   * @returns {Promise<object>}
   */
  async updateSpicyProfile(contactId, data) {
    return this.request('PATCH', `/api/contacts/${contactId}/spicy`, data);
  },

  // ============= EVENTS =============

  /**
   * Get events with filtering
   * @param {object} params - {contact, type, startDate, endDate, limit, offset}
   * @returns {Promise<{data, total}>}
   */
  async getEvents(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/api/events${qs ? '?' + qs : ''}`);
  },

  /**
   * Get a single event
   * @param {string} id - Event ID
   * @returns {Promise<object>}
   */
  async getEvent(id) {
    return this.request('GET', `/api/events/${id}`);
  },

  /**
   * Create an event
   * @param {object} data - {name, date, type, contacts, description}
   * @returns {Promise<object>}
   */
  async createEvent(data) {
    return this.request('POST', '/api/events', data);
  },

  /**
   * Update an event
   * @param {string} id - Event ID
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateEvent(id, data) {
    return this.request('PATCH', `/api/events/${id}`, data);
  },

  /**
   * Delete an event
   * @param {string} id - Event ID
   * @returns {Promise<null>}
   */
  async deleteEvent(id) {
    return this.request('DELETE', `/api/events/${id}`);
  },

  /**
   * Link media to an event
   * @param {string} eventId
   * @param {string} mediaId
   * @returns {Promise<object>}
   */
  async linkEventMedia(eventId, mediaId) {
    return this.request('POST', `/api/events/${eventId}/media/${mediaId}`);
  },

  /**
   * Unlink media from an event
   * @param {string} eventId
   * @param {string} mediaId
   * @returns {Promise<null>}
   */
  async unlinkEventMedia(eventId, mediaId) {
    return this.request('DELETE', `/api/events/${eventId}/media/${mediaId}`);
  },

  // ============= TIMELINE =============

  /**
   * Get timeline for a contact
   * @param {string} contactId
   * @returns {Promise<array>}
   */
  async getTimeline(contactId) {
    return this.request('GET', `/api/contacts/${contactId}/timeline`);
  },

  /**
   * Create a timeline event
   * @param {object} data - {contactId, type, title, date, description, metadata}
   * @returns {Promise<object>}
   */
  async createTimelineEvent(data) {
    return this.request('POST', '/api/timeline', data);
  },

  /**
   * Delete a timeline event
   * @param {string} id - Timeline event ID
   * @returns {Promise<null>}
   */
  async deleteTimelineEvent(id) {
    return this.request('DELETE', `/api/timeline/${id}`);
  },

  // ============= NOTES =============

  /**
   * Get notes for a contact
   * @param {string} contactId
   * @returns {Promise<array>}
   */
  async getNotes(contactId) {
    return this.request('GET', `/api/contacts/${contactId}/notes`);
  },

  /**
   * Create a note
   * @param {object} data - {contactId, text, isPrivate}
   * @returns {Promise<object>}
   */
  async createNote(data) {
    return this.request('POST', '/api/notes', data);
  },

  /**
   * Update a note
   * @param {string} id - Note ID
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateNote(id, data) {
    return this.request('PATCH', `/api/notes/${id}`, data);
  },

  /**
   * Delete a note
   * @param {string} id - Note ID
   * @returns {Promise<null>}
   */
  async deleteNote(id) {
    return this.request('DELETE', `/api/notes/${id}`);
  },

  // ============= REMINDERS =============

  /**
   * Get due reminders
   * @returns {Promise<array>}
   */
  async getDueReminders() {
    return this.request('GET', '/api/reminders/due');
  },

  /**
   * Create a reminder
   * @param {object} data - {contactId, text, dueDate, priority}
   * @returns {Promise<object>}
   */
  async createReminder(data) {
    return this.request('POST', '/api/reminders', data);
  },

  /**
   * Update a reminder
   * @param {string} id - Reminder ID
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateReminder(id, data) {
    return this.request('PATCH', `/api/reminders/${id}`, data);
  },

  /**
   * Mark a reminder as complete
   * @param {string} id - Reminder ID
   * @returns {Promise<object>}
   */
  async completeReminder(id) {
    return this.request('POST', `/api/reminders/${id}/complete`);
  },

  /**
   * Delete a reminder
   * @param {string} id - Reminder ID
   * @returns {Promise<null>}
   */
  async deleteReminder(id) {
    return this.request('DELETE', `/api/reminders/${id}`);
  },

  // ============= MESSAGES =============

  /**
   * Get messages for a contact
   * @param {string} contactId
   * @returns {Promise<array>}
   */
  async getMessages(contactId) {
    return this.request('GET', `/api/contacts/${contactId}/messages`);
  },

  /**
   * Create a message
   * @param {object} data - {contactId, type, content, metadata}
   * @returns {Promise<object>}
   */
  async createMessage(data) {
    return this.request('POST', '/api/messages', data);
  },

  // ============= MEDIA =============

  /**
   * Get media with filtering
   * @param {object} params - {type, contact, limit, offset}
   * @returns {Promise<{data, total}>}
   */
  async getMedia(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/api/media${qs ? '?' + qs : ''}`);
  },

  /**
   * Upload media
   * @param {FormData} formData - Must contain 'file' field
   * @returns {Promise<object>}
   */
  async uploadMedia(formData) {
    return this.request('POST', '/api/media', formData, {
      headers: {}, // Let browser set Content-Type and boundary
    });
  },

  /**
   * Update media
   * @param {string} id - Media ID
   * @param {object} data - {name, description, tags}
   * @returns {Promise<object>}
   */
  async updateMedia(id, data) {
    return this.request('PATCH', `/api/media/${id}`, data);
  },

  /**
   * Delete media
   * @param {string} id - Media ID
   * @returns {Promise<null>}
   */
  async deleteMedia(id) {
    return this.request('DELETE', `/api/media/${id}`);
  },

  // ============= AUDIT & CHANGELOG =============

  /**
   * Get audit log
   * @param {object} params - {entity, action, startDate, endDate, limit, offset}
   * @returns {Promise<{data, total}>}
   */
  async getAuditLog(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/api/audit${qs ? '?' + qs : ''}`);
  },

  /**
   * Get changelog for a contact
   * @param {string} contactId
   * @returns {Promise<array>}
   */
  async getChangelog(contactId) {
    return this.request('GET', `/api/contacts/${contactId}/changelog`);
  },

  // ============= SETTINGS (ADMIN) =============

  /**
   * Get all settings
   * @returns {Promise<object>}
   */
  async getSettings() {
    return this.request('GET', '/api/settings');
  },

  /**
   * Get public settings (available to all authenticated users)
   * @returns {Promise<object>}
   */
  async getPublicSettings() {
    return this.request('GET', '/api/settings/public');
  },

  /**
   * Update a setting
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @returns {Promise<object>}
   */
  async updateSetting(key, value) {
    return this.request('PUT', `/api/settings/${encodeURIComponent(key)}`, {
      value,
    });
  },

  // ============= PREFERENCES =============

  /**
   * Get user preferences
   * @returns {Promise<object>}
   */
  async getPreferences() {
    return this.request('GET', '/api/preferences');
  },

  /**
   * Update a preference
   * @param {string} key - Preference key
   * @param {*} value - Preference value
   * @returns {Promise<object>}
   */
  async updatePreference(key, value) {
    return this.request('PUT', `/api/preferences/${encodeURIComponent(key)}`, {
      value,
    });
  },

  // ============= IMPORT =============

  /**
   * Upload import file
   * @param {FormData} formData - Must contain 'file' field
   * @returns {Promise<object>} - Returns import job
   */
  async uploadImport(formData) {
    return this.request('POST', '/api/import/upload', formData, {
      headers: {},
    });
  },

  /**
   * Get all import jobs
   * @returns {Promise<array>}
   */
  async getImportJobs() {
    return this.request('GET', '/api/import/jobs');
  },

  /**
   * Get a single import job
   * @param {string} id - Job ID
   * @returns {Promise<object>}
   */
  async getImportJob(id) {
    return this.request('GET', `/api/import/jobs/${id}`);
  },

  /**
   * Get import review data
   * @param {string} jobId
   * @returns {Promise<array>} - Array of records to review
   */
  async getImportReview(jobId) {
    return this.request('GET', `/api/import/jobs/${jobId}/review`);
  },

  /**
   * Review and update an import record
   * @param {string} id - Record ID
   * @param {object} data - {action, mergeWith, fieldDecisions}
   * @returns {Promise<object>}
   */
  async reviewImportRecord(id, data) {
    return this.request('PATCH', `/api/import/records/${id}`, data);
  },

  /**
   * Finalize and complete import
   * @param {string} jobId
   * @returns {Promise<object>}
   */
  async finalizeImport(jobId) {
    return this.request('POST', `/api/import/jobs/${jobId}/finalize`);
  },

  /**
   * Cancel an import job
   * @param {string} jobId
   * @returns {Promise<null>}
   */
  async cancelImport(jobId) {
    return this.request('DELETE', `/api/import/jobs/${jobId}`);
  },

  /**
   * Initialize API - load token from localStorage
   */
  init() {
    const storedToken = localStorage.getItem('kith_token');
    if (storedToken) {
      this.token = storedToken;
    }
  },
};

// Auto-initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.api.init());
} else {
  window.api.init();
}
