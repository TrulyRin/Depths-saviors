/**
 * Dashboard Application Logic
 * API_BASE: Set via localStorage key 'ds_api_url', or defaults below.
 * To configure: open browser console and run:
 *   localStorage.setItem('ds_api_url', 'http://YOUR_VPS_IP:8080/api')
 */

function getApiBase() {
    const stored = localStorage.getItem('ds_api_url');
    if (stored) return stored;
    // Auto-detect: if accessing from localhost, use local API
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        return 'http://localhost:8080/api';
    }
    // Production default — update this when you have a reverse proxy
    return 'https://api.deepsaviors.xyz/api';
}

const PRIVATE_GUILD_ID = "1305511241577529354";

// Cog metadata used client-side when bot API is unreachable
const COG_REGISTRY = {
    gankping:         { name: "Gank Notifications",     icon: "fa-bullhorn",         scope: "global"  },
    antialt:          { name: "Anti-Alt Verification",   icon: "fa-shield-halved",    scope: "private" },
    points:           { name: "Points System",           icon: "fa-chart-line",       scope: "private" },
    allies:           { name: "Ally Management",         icon: "fa-handshake",        scope: "private" },
    auto_delete:      { name: "Ticket Auto-Delete",      icon: "fa-trash-can",        scope: "private" },
    auto_slowmode:    { name: "Auto Slowmode",           icon: "fa-gauge-high",       scope: "private" },
    botstats:         { name: "Bot Statistics",           icon: "fa-chart-bar",        scope: "private" },
    format_enforcer:  { name: "Format Enforcer",         icon: "fa-align-left",       scope: "private" },
    forum_moderator:  { name: "Forum Moderator",         icon: "fa-comments",         scope: "private" },
    faq:              { name: "FAQ System",               icon: "fa-circle-question",  scope: "private" },
    deepwoken:        { name: "Build Tracker",            icon: "fa-gamepad",          scope: "private" },
    tryout:           { name: "Tryout System",            icon: "fa-clipboard-check",  scope: "private" },
    kos:              { name: "KOS System",               icon: "fa-crosshairs",       scope: "private" },
    koscheck:         { name: "KOS Check",                icon: "fa-magnifying-glass", scope: "private" },
    commands:         { name: "Role Commands",            icon: "fa-user-tag",         scope: "private" },
};

const DS = {
    token: null,
    user: null,
    currentGuild: null,
    channels: [],
    roles: [],
    apiBase: getApiBase(),
    botApiOnline: false,

    // Discord OAuth Config
    clientId: "1373795045529878560",
    redirectUri: "https://www.deepsaviors.xyz/callback",

    init: function() {
        this.token = localStorage.getItem('ds_token');
        if (!this.token) {
            this.showLogin();
            return;
        }

        // Setup Sidebar Toggle
        const st = document.getElementById('sidebar-toggle');
        const sb = document.getElementById('dash-sidebar');
        if (st && sb) {
            st.addEventListener('click', () => {
                sb.classList.toggle('open');
            });
        }

        this.loadDiscordUser().then(user => {
            if (!user) {
                this.logout();
                return;
            }
            this.user = user;
            this.showServers();
        });
    },

    loginUrl: function() {
        return `https://discord.com/api/oauth2/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=token&scope=identify%20guilds`;
    },

    showLogin: function() {
        document.getElementById('view-login').style.display = 'flex';
        document.getElementById('view-servers').style.display = 'none';
        document.getElementById('view-dashboard').style.display = 'none';
        const btn = document.getElementById('login-btn');
        btn.href = this.loginUrl();
    },

    logout: function() {
        localStorage.removeItem('ds_token');
        localStorage.removeItem('ds_token_ts');
        window.location.reload();
    },

    // ── API Helpers ─────────────────────────────────────

    /** Safe timeout signal — polyfill for browsers without AbortSignal.timeout */
    _timeoutSignal: function(ms) {
        if (typeof AbortSignal.timeout === 'function') {
            return AbortSignal.timeout(ms);
        }
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
    },

    /** Detect if a fetch error is caused by a browser shield/blocker */
    _isBlockedError: function(err) {
        return err instanceof TypeError && (
            err.message.includes('Failed to fetch') ||
            err.message.includes('NetworkError') ||
            err.message.includes('Load failed') ||
            err.message.includes('blocked')
        );
    },

    fetchDiscord: async function(url) {
        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: 'omit',       // Avoid CORS cookie issues in Brave
                mode: 'cors',
                signal: this._timeoutSignal(10000)
            });
            if (res.status === 401) { 
                console.error('[Discord API] 401 Unauthorized for', url);
                this.logout(); 
                return null; 
            }
            if (!res.ok) {
                console.error('[Discord API] HTTP', res.status, 'for', url);
                return null;
            }
            return await res.json();
        } catch (e) {
            console.error('[Discord API] Network error for', url, e);
            if (this._isBlockedError(e)) {
                this._showShieldWarning();
            }
            return null;
        }
    },

    fetchAPI: async function(endpoint, method = 'GET', body = null) {
        try {
            const opts = {
                method: method,
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: 'omit',
                mode: 'cors',
                signal: this._timeoutSignal(10000)
            };
            if (body) {
                opts.headers['Content-Type'] = 'application/json';
                opts.body = JSON.stringify(body);
            }
            const res = await fetch(this.apiBase + endpoint, opts);
            if (res.status === 401 || res.status === 403) {
                this.toast("Permission denied for this action", "error");
                return null;
            }
            if (!res.ok) throw new Error(await res.text());
            this.botApiOnline = true;
            return await res.json();
        } catch (e) {
            console.error('[Bot API]', e);
            return null;
        }
    },

    /** Quick connectivity check to the bot API */
    checkBotAPI: async function() {
        try {
            const res = await fetch(this.apiBase + '/bot/guilds', {
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: 'omit',
                mode: 'cors',
                signal: this._timeoutSignal(4000)
            });
            if (res.ok) { this.botApiOnline = true; return await res.json(); }
        } catch (e) { /* unreachable */ }
        this.botApiOnline = false;
        return null;
    },

    /** Show a warning when browser shields are blocking API calls */
    _showShieldWarning: function() {
        if (this._shieldWarned) return;
        this._shieldWarned = true;

        const isBrave = navigator.brave && typeof navigator.brave.isBrave === 'function';
        const browserName = isBrave ? 'Brave' : 'your browser';

        const warning = document.createElement('div');
        warning.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;background:#1a1a2e;border-bottom:3px solid #E6A23C;padding:16px 24px;text-align:center;font-size:0.9rem;';
        warning.innerHTML = `
            <p style="color:#E6A23C;font-weight:700;margin-bottom:6px;">
                <i class="fas fa-shield-halved"></i> ${browserName} is blocking Discord API requests
            </p>
            <p style="color:#ccc;font-size:0.85rem;">
                ${isBrave 
                    ? 'Click the <strong>Brave Shield (lion icon)</strong> in the address bar → set Shields to <strong>Down</strong> for this site, then reload.'
                    : 'Your browser\'s privacy settings or an ad blocker may be blocking cross-origin requests to <code>discord.com</code>. Try disabling your shield/blocker for this site, or use a different browser.'}
            </p>
            <button onclick="this.parentElement.remove()" style="margin-top:8px;background:#E6A23C;color:#000;border:none;padding:6px 18px;border-radius:6px;font-weight:600;cursor:pointer;">Dismiss</button>
        `;
        document.body.prepend(warning);
    },

    toast: function(msg, type="success") {
        const el = document.getElementById('toast');
        el.className = `toast show ${type}`;
        el.textContent = msg;
        setTimeout(() => { el.className = `toast ${type}`; }, 3000);
    },

    // ── Data Loaders ────────────────────────────────────

    loadDiscordUser: async function() {
        return await this.fetchDiscord("https://discord.com/api/v10/users/@me");
    },

    showServers: async function() {
        document.getElementById('view-login').style.display = 'none';
        document.getElementById('view-servers').style.display = 'block';
        document.getElementById('view-dashboard').style.display = 'none';

        const avatar = this.user.avatar 
            ? `https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png` 
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        document.getElementById('user-bar').innerHTML = `
            <img src="${avatar}">
            <span>${this.user.username}</span>
            <button class="logout-btn" onclick="DS.logout()">Logout</button>
        `;

        const grid = document.getElementById('server-grid');
        grid.innerHTML = `<div class="skeleton" style="height:120px;grid-column:1/-1;"></div>`;

        // 1. Fetch user's guilds directly from Discord API (always works)
        const discordGuilds = await this.fetchDiscord("https://discord.com/api/v10/users/@me/guilds");
        if (!discordGuilds || !Array.isArray(discordGuilds)) {
            grid.innerHTML = `<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">Could not fetch your Discord servers. Try logging out and back in.</p>
            <div style="text-align:center;grid-column:1/-1;margin-top:10px;"><button class="logout-btn" onclick="DS.logout()">Re-Login</button></div>`;
            return;
        }

        console.log('[Dashboard] Got', discordGuilds.length, 'guilds from Discord');

        // 2. Filter to guilds where user has Administrator
        const adminGuilds = discordGuilds.filter(g => {
            const perms = BigInt(g.permissions);
            return (perms & 8n) === 8n; // ADMINISTRATOR
        });

        console.log('[Dashboard]', adminGuilds.length, 'guilds with admin perms');

        // 3. Optionally check bot API to filter to guilds the bot is in
        const botData = await this.checkBotAPI();
        let displayGuilds = adminGuilds;

        if (botData && botData.guilds) {
            // Bot API is reachable — only show guilds the bot is also in
            const botGuildIds = new Set(botData.guilds.map(g => g.id));
            displayGuilds = adminGuilds.filter(g => botGuildIds.has(g.id));
        }
        // If bot API is down, show all admin guilds (management will show error per-guild)

        if (displayGuilds.length === 0) {
            grid.innerHTML = `<div style="text-align:center;grid-column:1/-1;padding:40px;">
                <p style="margin-bottom:12px;">No manageable servers found${this.botApiOnline ? ' where the bot is present' : ''}.</p>
                ${!this.botApiOnline ? '<p style="color:#E6A23C;font-size:0.85rem;margin-bottom:12px;"><i class="fas fa-exclamation-triangle"></i> Bot API is offline — showing all admin servers. Connect your bot API to filter.</p>' : ''}
                <a href="/joinds" style="color:var(--primary);">Invite Bot</a>
            </div>`;
            return;
        }

        if (!this.botApiOnline) {
            grid.insertAdjacentHTML('beforebegin', 
                `<div style="text-align:center;padding:10px 20px;margin-bottom:10px;">
                    <p style="color:#E6A23C;font-size:0.85rem;"><i class="fas fa-exclamation-triangle"></i> Bot API not connected — showing all your admin servers. Settings management requires the bot to be running.</p>
                    <p style="color:var(--text-muted);font-size:0.8rem;margin-top:4px;">API URL: <code>${this.apiBase}</code> · To change: <code>localStorage.setItem('ds_api_url','http://YOUR_IP:8080/api')</code></p>
                </div>`);
        }

        grid.innerHTML = '';
        displayGuilds.forEach(g => {
            const card = document.createElement('div');
            card.className = 'server-card';
            card.onclick = () => this.loadGuild(g.id, g);
            
            const iconHtml = g.icon 
                ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" class="server-icon">`
                : `<div class="server-icon-placeholder">${g.name.charAt(0)}</div>`;
                
            card.innerHTML = `
                ${iconHtml}
                <h3>${g.name}</h3>
                <span class="member-count">${this.botApiOnline ? 'Manage Settings' : 'View Server'}</span>
            `;
            grid.appendChild(card);
        });
    },

    // ── Guild Dashboard ─────────────────────────────────

    loadGuild: async function(guildId, discordGuild) {
        document.getElementById('view-servers').style.display = 'none';
        document.getElementById('view-dashboard').style.display = 'flex';

        // Try to get overview from bot API
        const res = await this.fetchAPI(`/guild/${guildId}/overview`);

        let guildInfo, cogs, isPrivate;

        if (res) {
            // Bot API available — use full data
            guildInfo = res.guild;
            cogs = res.cogs;
            isPrivate = res.is_private;
        } else {
            // Bot API unavailable — use Discord data + client-side cog registry
            guildInfo = {
                id: discordGuild ? discordGuild.id : guildId,
                name: discordGuild ? discordGuild.name : `Server ${guildId}`,
                icon: discordGuild && discordGuild.icon 
                    ? `https://cdn.discordapp.com/icons/${guildId}/${discordGuild.icon}.png` 
                    : null,
            };
            isPrivate = guildId === PRIVATE_GUILD_ID;
            cogs = {};
            for (const [key, meta] of Object.entries(COG_REGISTRY)) {
                if (meta.scope === "global" || isPrivate) {
                    cogs[key] = meta;
                }
            }
        }

        this.currentGuild = guildInfo;

        // Setup Sidebar header
        const sbGuild = document.getElementById('sidebar-guild');
        const iconHtml = guildInfo.icon 
            ? `<img src="${guildInfo.icon}">` 
            : `<div style="width:36px;height:36px;border-radius:10px;background:var(--primary-glow);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:bold;">${guildInfo.name.charAt(0)}</div>`;
            
        sbGuild.innerHTML = `<i class="fas fa-chevron-left back-arrow"></i> ${iconHtml} <span>${guildInfo.name}</span>`;
        sbGuild.onclick = () => this.showServers();

        // Load reference data (channels & roles) from bot API if available
        if (this.botApiOnline) {
            const channelsRes = await this.fetchAPI(`/guild/${guildId}/channels`);
            this.channels = channelsRes ? channelsRes.channels : [];
            const rolesRes = await this.fetchAPI(`/guild/${guildId}/roles`);
            this.roles = rolesRes ? rolesRes.roles : [];
        } else {
            this.channels = [];
            this.roles = [];
        }

        // Build Nav and Panels
        const nav = document.getElementById('cog-nav');
        const content = document.getElementById('dash-content');
        nav.innerHTML = '';
        content.innerHTML = '';

        // Show connection warning if bot API is down
        if (!this.botApiOnline) {
            content.innerHTML = `
                <div class="setting-card" style="border-color:#E6A23C;margin-bottom:20px;">
                    <h3 style="color:#E6A23C;"><i class="fas fa-exclamation-triangle"></i> Bot API Not Connected</h3>
                    <p style="color:var(--text-muted);margin-top:8px;">The bot's API server is not reachable. Settings panels are shown but cannot load or save data until the bot is running and accessible.</p>
                    <p style="color:var(--text-muted);font-size:0.85rem;margin-top:8px;">Current API URL: <code>${this.apiBase}</code></p>
                    <p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px;">To set your API URL, open browser console and run: <code>localStorage.setItem('ds_api_url', 'http://YOUR_IP:8080/api')</code></p>
                </div>
            `;
        }

        let first = true;
        for (const [key, meta] of Object.entries(cogs)) {
            // Nav Item
            const a = document.createElement('div');
            a.className = `cog-nav-item ${first ? 'active' : ''}`;
            a.dataset.target = `panel-${key}`;
            a.innerHTML = `<i class="fas ${meta.icon}"></i> ${meta.name}`;
            a.onclick = (e) => this.switchPanel(e.currentTarget);
            nav.appendChild(a);

            // Panel Container
            const p = document.createElement('div');
            p.className = `cog-section ${first ? 'active' : ''}`;
            p.id = `panel-${key}`;
            p.innerHTML = `<h2>${meta.name}</h2><p class="section-desc">Manage ${meta.name.toLowerCase()} settings.</p><div id="content-${key}"><div class="skeleton" style="height:150px"></div></div>`;
            content.appendChild(p);
            
            // Render specific panel contents
            this.renderPanel(key);
            first = false;
        }
    },

    switchPanel: function(el) {
        document.querySelectorAll('.cog-nav-item').forEach(e => e.classList.remove('active'));
        document.querySelectorAll('.cog-section').forEach(e => e.classList.remove('active'));
        
        el.classList.add('active');
        document.getElementById(el.dataset.target).classList.add('active');
        
        if (window.innerWidth <= 768) {
            document.getElementById('dash-sidebar').classList.remove('open');
        }
    },

    // ── UI Generators ───────────────────────────────────

    generateChannelSelect: function(id, selectedId) {
        let html = `<select id="${id}" class="ds-select"><option value="">-- None --</option>`;
        this.channels.forEach(c => {
            const typeStr = String(c.type);
            if (typeStr === "0" || typeStr === "5" || typeStr === "text" || typeStr === "news") {
                const sel = String(c.id) === String(selectedId) ? 'selected' : '';
                html += `<option value="${c.id}" ${sel}>#${c.name}</option>`;
            }
        });
        html += `</select>`;
        return html;
    },

    generateVoiceSelect: function(id, selectedId) {
        let html = `<select id="${id}" class="ds-select"><option value="">-- None --</option>`;
        this.channels.forEach(c => {
            const typeStr = String(c.type);
            if (typeStr === "2" || typeStr === "voice") {
                const sel = String(c.id) === String(selectedId) ? 'selected' : '';
                html += `<option value="${c.id}" ${sel}>🔊 ${c.name}</option>`;
            }
        });
        html += `</select>`;
        return html;
    },

    generateRoleSelect: function(id, selectedId) {
        let html = `<select id="${id}" class="ds-select"><option value="">-- None --</option>`;
        this.roles.forEach(r => {
            if (r.name !== "@everyone") {
                const sel = String(r.id) === String(selectedId) ? 'selected' : '';
                html += `<option value="${r.id}" ${sel}>@${r.name}</option>`;
            }
        });
        html += `</select>`;
        return html;
    },

    // ── Panel Renderers ─────────────────────────────────

    renderPanel: async function(key) {
        const container = document.getElementById(`content-${key}`);
        const gid = this.currentGuild.id;

        if (key === 'gankping') {
            const data = await this.fetchAPI(`/guild/${gid}/gankping`);
            if (!data) return;
            
            const isPro = data.is_pro || false;
            
            let myNetworksHtml = '';
            
            data.networks.forEach(net => {
                let adminHtml = '';
                if (net.is_owner) {
                    let pendingHtml = '';
                    if (net.pending_applicants && net.pending_applicants.length > 0) {
                        pendingHtml = `
                            <h4 style="margin-top:20px;margin-bottom:10px;"><i class="fas fa-user-clock"></i> Pending Applicants</h4>
                            <div style="background:var(--bg);border-radius:6px;padding:10px;">
                                ${net.pending_applicants.map(app => `
                                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                                        <div>
                                            <strong>${app.guild_name}</strong> (ID: ${app.guild_id})<br>
                                            <small style="color:var(--text-muted)">Requested by ${app.requested_by}</small>
                                        </div>
                                        <div>
                                            <button class="btn-save" style="padding:4px 8px;font-size:0.8rem;" onclick="DS.adminAccept('${net.network_id}', '${app.guild_id}')">Accept</button>
                                            <button class="btn-save" style="padding:4px 8px;font-size:0.8rem;background:var(--danger);" onclick="DS.adminReject('${net.network_id}', '${app.guild_id}')">Reject</button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        `;
                    }
                    
                    let membersHtml = '';
                    let analyticsHtml = '';
                    if (net.all_members && net.all_members.length > 0) {
                        analyticsHtml = `
                            <h4 style="margin-top:20px;margin-bottom:10px;"><i class="fas fa-chart-pie"></i> Detailed Gank Analytics (Pro)</h4>
                            <div style="background:var(--bg);border-radius:6px;padding:10px;max-height:300px;overflow-y:auto; border: 1px solid ${isPro ? '#FFD700' : '#555'}; position: relative;">
                                ${!isPro ? `<div style="position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.7); display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:10;">
                                    <i class="fas fa-lock" style="font-size:2rem; color:#FFD700; margin-bottom:10px;"></i>
                                    <p style="color:#fff; font-weight:bold;">Pro Plan Required</p>
                                </div>` : ''}
                                <table class="ds-table" style="width:100%; text-align:left;">
                                    <tr><th>Guild</th><th>Attended</th><th>Missed</th><th>Response Rate</th></tr>
                                    ${net.all_members.map(m => {
                                        const attended = m.ganks_attended || 0;
                                        const missed = m.ganks_missed || 0;
                                        const total = attended + missed;
                                        const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
                                        let rateColor = rate > 50 ? '#00BF7F' : (rate > 20 ? '#E6A23C' : '#E63946');
                                        return `
                                            <tr>
                                                <td>${m.guild_name}</td>
                                                <td style="color:#00BF7F;">${attended}</td>
                                                <td style="color:#E63946;">${missed}</td>
                                                <td style="color:${rateColor}; font-weight:bold;">${rate}%</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </table>
                            </div>
                        `;

                        membersHtml = `
                            <h4 style="margin-top:20px;margin-bottom:10px;"><i class="fas fa-users"></i> Network Members</h4>
                            <div style="background:var(--bg);border-radius:6px;padding:10px;max-height:200px;overflow-y:auto;">
                                ${net.all_members.map(m => `
                                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                                        <div>
                                            <strong>${m.guild_name}</strong> (ID: ${m.guild_id})
                                        </div>
                                            <div>
                                                ${m.is_owner ? '<span class="net-badge" style="background:var(--primary);color:#000;">Owner</span>' : `<button class="btn-save" style="padding:4px 8px;font-size:0.8rem;background:var(--danger);" onclick="DS.adminKick('${net.network_id}', '${m.guild_id}')">Kick</button>`}
                                            </div>
                                    </div>
                                `).join('')}
                            </div>
                        `;
                    } else {
                        membersHtml = `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:10px;">No other members in this network yet.</p>`;
                    }

                    adminHtml = `
                    <div class="setting-card" style="margin-top:16px;border:1px solid var(--primary);">
                        <h3 style="color:var(--primary);"><i class="fas fa-crown"></i> Network Administration</h3>
                        
                        <div class="split-columns">
                            <div class="split-col">
                                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                    <div class="setting-label">Network Name</div>
                                    <input type="text" id="admin-name-${net.network_id}" class="ds-input" style="width:100%" value="${net.name}">
                                </div>
                                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                    <div class="setting-label">Icon URL</div>
                                    <input type="text" id="admin-icon-${net.network_id}" class="ds-input" style="width:100%" value="${net.icon_url || ''}">
                                </div>
                                <div class="setting-row">
                                    <div class="setting-label">Requires Approval<br><small>Manually approve joins</small></div>
                                    <div class="toggle ${net.requires_approval ? 'active' : ''}" id="admin-req-${net.network_id}" onclick="this.classList.toggle('active')"></div>
                                </div>
                            </div>
                            <div class="split-col">
                                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                    <div class="setting-label">Description</div>
                                    <textarea id="admin-desc-${net.network_id}" class="ds-input" style="width:100%;height:80px;resize:vertical;">${net.description || ''}</textarea>
                                </div>
                                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                    <div class="setting-label">Max Members</div>
                                    <input type="number" id="admin-max-${net.network_id}" class="ds-input" style="width:100%" value="${net.max_members}" min="2">
                                </div>
                            </div>
                        </div>
                        <div class="setting-row" style="margin-top:10px;border-top:none;">
                            <button class="btn-save" onclick="DS.adminEditNetwork('${net.network_id}')">Save Network Details</button>
                        </div>

                        ${pendingHtml}
                        ${analyticsHtml}
                        ${membersHtml}
                    </div>
                    `;
                }

                if (net.is_member) {
                    const isEnabled = net.member ? net.member.enabled : false;
                    const autoNotify = net.member ? net.member.auto_notify : false;
                    
                    myNetworksHtml += `
                    <div class="network-card">
                        <div class="net-header">
                            ${net.icon_url ? `<img src="${net.icon_url}" class="net-icon">` : ''}
                            <div>
                                <div class="net-name">${net.name} ${net.is_owner ? '<span class="net-badge" style="background:var(--primary);color:#000;">Owner</span>' : ''}</div>
                                <div class="net-id">Network ID: ${net.network_id} • ${net.member_count}/${net.max_members} guilds</div>
                            </div>
                        </div>
                        
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-value">${net.stats.total_ganks}</div>
                                <div class="stat-label">Total Ganks</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${net.stats.coming_responses}</div>
                                <div class="stat-label">Assists</div>
                            </div>
                        </div>
                        
                        <div class="setting-card" style="margin-top:16px;">
                            <h3><i class="fas fa-sliders"></i> Notification Setup</h3>
                            <div class="split-columns">
                                <div class="split-col">
                                    <div class="setting-row">
                                        <div class="setting-label">Enable Notifications<br><small>Receive pings from this network</small></div>
                                        <div class="toggle ${isEnabled ? 'active' : ''}" id="gp-toggle-${net.network_id}" onclick="this.classList.toggle('active')"></div>
                                    </div>
                                    <div class="setting-row">
                                        <div class="setting-label">Auto Notify<br><small>Skip manual confirmation</small></div>
                                        <div class="toggle ${autoNotify ? 'active' : ''}" id="gp-auto-${net.network_id}" onclick="this.classList.toggle('active')"></div>
                                    </div>
                                </div>
                                <div class="split-col">
                                    <div class="setting-row">
                                        <div class="setting-label">Target Channel<br><small>Where to post incoming pings</small></div>
                                        ${this.generateChannelSelect(`gp-ch-${net.network_id}`, net.member.channel_id)}
                                    </div>
                                    <div class="setting-row">
                                        <div class="setting-label">Ping Role<br><small>Role to mention on new ganks</small></div>
                                        ${this.generateRoleSelect(`gp-role-${net.network_id}`, net.member.ping_role_id)}
                                    </div>
                                    <div class="setting-row">
                                        <div class="setting-label">Ally Role (Optional)<br><small>Role for recognized allies</small></div>
                                        ${this.generateRoleSelect(`gp-ally-${net.network_id}`, net.member.ally_role_id)}
                                    </div>
                                </div>
                            <div class="setting-row" style="margin-top:20px;border-top:none;">
                                <button class="btn-save" onclick="DS.saveGankPing('${net.network_id}')">Save Notification Setup</button>
                            </div>
                            </div>

                            <div class="setting-card" style="margin-top:16px; border:1px solid ${isPro ? '#FFD700' : '#555'}; position: relative;">
                            ${!isPro ? `<div style="position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.7); display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:10; border-radius: 6px;">
                                <i class="fas fa-lock" style="font-size:2rem; color:#FFD700; margin-bottom:10px;"></i>
                                <p style="color:#fff; font-weight:bold;">Pro Plan Required for Custom Branding</p>
                            </div>` : ''}
                            <h3 style="color:#FFD700;"><i class="fas fa-palette"></i> Custom Branding</h3>
                            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px;">Make the bot look like it belongs to your server when it sends a ping in your channels.</p>

                            <div class="setting-row">
                                <div class="setting-label">Enable Custom Branding<br><small>Uses webhooks to change bot appearance</small></div>
                                <div class="toggle ${net.member?.use_custom_branding ? 'active' : ''}" id="gp-brand-toggle-${net.network_id}" onclick="if(${isPro}) this.classList.toggle('active')"></div>
                            </div>
                            <div class="split-columns">
                                <div class="split-col">
                                    <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                        <div class="setting-label">Custom Bot Name</div>
                                        <input type="text" id="gp-brand-name-${net.network_id}" class="ds-input" style="width:100%" placeholder="Leave empty for Server Name" value="${net.member?.custom_bot_name || ''}">
                                    </div>
                                </div>
                                <div class="split-col">
                                    <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                        <div class="setting-label">Custom Avatar URL</div>
                                        <input type="text" id="gp-brand-avatar-${net.network_id}" class="ds-input" style="width:100%" placeholder="Leave empty for Server Icon" value="${net.member?.custom_bot_avatar || ''}">
                                    </div>
                                </div>
                            </div>
                            <div class="split-columns">
                                <div class="split-col">
                                    <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                        <div class="setting-label">Embed Title</div>
                                        <input type="text" id="gp-embed-title-${net.network_id}" class="ds-input" style="width:100%" placeholder="Leave empty for GANK ALERT" value="${net.member?.custom_embed_title || ''}">
                                    </div>
                                    <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                        <div class="setting-label">Embed Accent Color</div>
                                        <input type="text" id="gp-embed-color-${net.network_id}" class="ds-input" style="width:100%" placeholder="#E63946" value="${net.member?.custom_embed_color || ''}">
                                    </div>
                                </div>
                                <div class="split-col">
                                    <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                        <div class="setting-label">Embed Thumbnail URL</div>
                                        <input type="text" id="gp-embed-thumb-${net.network_id}" class="ds-input" style="width:100%" placeholder="Leave empty for Network Icon" value="${net.member?.custom_embed_thumbnail || ''}">
                                    </div>
                                </div>
                            </div>

                            <div class="setting-row" style="margin-top:20px;border-top:none;">
                                <button class="btn-save" onclick="DS.saveGankPing('${net.network_id}')">Save Branding Options</button>
                            </div>
                            </div>

                            ${adminHtml}
                    </div>`;
                } else if (net.is_pending) {
                    myNetworksHtml += `
                    <div class="network-card" style="opacity: 0.8;">
                        <div class="net-header" style="margin-bottom:0;">
                            ${net.icon_url ? `<img src="${net.icon_url}" class="net-icon">` : ''}
                            <div>
                                <div class="net-name">${net.name} <span class="net-badge" style="background:#555;color:#fff;">Pending Approval</span></div>
                                <div class="net-id">ID: ${net.network_id}</div>
                            </div>
                        </div>
                    </div>`;
                }
            });
            
            if (!myNetworksHtml) myNetworksHtml = `<p style="color:var(--text-muted);margin-bottom:20px;">This server is not a part of any gank networks yet.</p>`;

            container.innerHTML = `
                <div style="margin-bottom:40px;">
                    <h3><i class="fas fa-network-wired"></i> My Networks</h3>
                    <div style="margin-top:16px;">${myNetworksHtml}</div>
                </div>

                <div class="split-columns" style="margin-top:40px; align-items: stretch;">
                    <div class="setting-card split-col" style="margin-top:0;">
                        <h3><i class="fas fa-sign-in-alt"></i> Join Network</h3>
                        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px;">Enter the private ID of a network to send a join request.</p>
                        <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                            <div class="setting-label">Network ID</div>
                            <input type="text" id="gp-join-id" class="ds-input" style="width:100%" placeholder="network-id-here">
                        </div>
                        <div class="setting-row" style="margin-top:20px;border-top:none;">
                            <button class="btn-save" onclick="DS.joinNetworkById()">Join Network</button>
                        </div>
                    </div>

                    <div class="setting-card split-col" style="margin-top:0;">
                        <h3><i class="fas fa-plus-circle"></i> Create Network</h3>
                        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px;">Create a new gankping network to manage your own coalition.</p>
                        <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                            <div class="setting-label">Network ID (3-32 chars)</div>
                            <input type="text" id="gp-create-id" class="ds-input" style="width:100%" placeholder="e.g. my-awesome-guild">
                        </div>
                        <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                            <div class="setting-label">Display Name</div>
                            <input type="text" id="gp-create-name" class="ds-input" style="width:100%" placeholder="e.g. Awesome Guild Pings">
                        </div>
                        <div class="setting-row" style="margin-top:20px;border-top:none;">
                            <button class="btn-save" onclick="DS.createNetwork()">Create Network</button>
                        </div>
                    </div>
                </div>
            `;
        }
        else if (key === 'antialt') {
            const data = await this.fetchAPI(`/guild/${gid}/antialt`);
            if (!data) return;
            const s = data.settings;
            
            container.innerHTML = `
            <div class="split-columns">
                <div class="split-col">
                    <div class="setting-card">
                        <h3><i class="fas fa-shield-halved"></i> Verification Engine</h3>
                        <div class="setting-row">
                            <div class="setting-label">Enable Anti-Alt</div>
                            <div class="toggle ${s.enabled ? 'active' : ''}" id="aa-enable" onclick="this.classList.toggle('active')"></div>
                        </div>
                        <div class="setting-row">
                            <div class="setting-label">Verification Channel</div>
                            ${this.generateChannelSelect('aa-vch', s.verify_channel_id)}
                        </div>
                        <div class="setting-row">
                            <div class="setting-label">Security Log Channel</div>
                            ${this.generateChannelSelect('aa-lch', s.log_channel_id)}
                        </div>
                        <div class="setting-row">
                            <div class="setting-label">Verified Role</div>
                            ${this.generateRoleSelect('aa-vrole', s.verified_role_id)}
                        </div>
                    </div>
                </div>
                <div class="split-col">
                    <div class="setting-card">
                        <h3><i class="fas fa-sliders"></i> Security Thresholds</h3>
                        <div class="setting-row">
                            <div class="setting-label">Min Account Age (Days)</div>
                            <input type="number" id="aa-age" class="ds-input" value="${s.min_account_age_days}" min="0" max="365">
                        </div>
                        <div class="setting-row">
                            <div class="setting-label">Suspect Risk Score</div>
                            <input type="number" id="aa-suspect" class="ds-input" value="${s.risk_suspect_threshold}" min="0" max="100">
                        </div>
                        <div class="setting-row">
                            <div class="setting-label">Auto-Ban Risk Score</div>
                            <input type="number" id="aa-ban" class="ds-input" value="${s.risk_ban_threshold}" min="0" max="100">
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="setting-card">
                <h3><i class="fas fa-list-check"></i> Whitelist</h3>
                <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px;">User IDs that bypass verification. Put each ID on a new line.</p>
                <textarea id="aa-whitelist" class="ds-input" style="width:100%;height:100px;resize:vertical;font-family:monospace;">${(s.whitelist || []).join('\n')}</textarea>
                <div class="setting-row" style="margin-top:20px;border-top:none;">
                    <button class="btn-save" onclick="DS.saveAntiAlt()">Save Anti-Alt Settings</button>
                </div>
            </div>
            `;
        }
        else if (key === 'botstats') {
            const data = await this.fetchAPI(`/guild/${gid}/botstats`);
            if (!data) return;
            
            container.innerHTML = `
            <div class="stats-grid" style="margin-bottom:30px;">
                <div class="stat-card">
                    <div class="stat-value">${data.stats.cpu_percent}%</div>
                    <div class="stat-label">CPU Usage</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.stats.memory_usage}</div>
                    <div class="stat-label">RAM Usage</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.stats.latency_ms}ms</div>
                    <div class="stat-label">Latency</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.stats.uptime_formatted}</div>
                    <div class="stat-label">Uptime</div>
                </div>
            </div>
            
            <div class="setting-card">
                <h3><i class="fas fa-tv"></i> Live Stats Channel</h3>
                <div class="setting-row">
                    <div class="setting-label">Voice Channel<br><small>Channel name updates with live stats</small></div>
                    ${this.generateVoiceSelect('bs-ch', data.stats_channel_id)}
                </div>
                <div class="setting-row">
                    <div class="setting-label">Update Interval (Minutes)<br><small>How often to rename the channel</small></div>
                    <input type="number" id="bs-int" class="ds-input" value="${data.update_interval}" min="5">
                </div>
                <div class="setting-row" style="margin-top:20px;border-top:none;">
                    <button class="btn-save" onclick="DS.saveBotStats()">Save Config</button>
                </div>
            </div>
            `;
        }
        else if (key === 'points') {
            const data = await this.fetchAPI(`/guild/${gid}/points`);
            if (!data) return;
            
            const buildLbHtml = (entries) => {
                if (!entries || entries.length === 0) return '<p style="color:var(--text-muted);font-size:0.9rem;padding:20px 0;">No data yet.</p>';
                return entries.map((e, i) => `
                    <div class="lb-entry">
                        <div class="lb-rank">#${i+1}</div>
                        ${e.avatar ? `<img src="${e.avatar}" class="lb-avatar">` : `<div class="lb-avatar" style="background:var(--primary-glow)"></div>`}
                        <div class="lb-name">${e.name}</div>
                        <div class="lb-pts">${e.points} pts</div>
                    </div>
                `).join('');
            };

            container.innerHTML = `
            <div class="setting-card" style="margin-bottom:20px;">
                <p>Last Reset: <strong>${data.last_reset || 'Never'}</strong></p>
            </div>
            <div class="split-columns">
                <div class="split-col">
                    <div class="setting-card">
                        <h3><i class="fas fa-calendar-alt"></i> Monthly Leaderboard</h3>
                        <div style="margin-top:16px;">${buildLbHtml(data.monthly)}</div>
                    </div>
                </div>
                <div class="split-col">
                    <div class="setting-card">
                        <h3><i class="fas fa-globe"></i> Global Leaderboard</h3>
                        <div style="margin-top:16px;">${buildLbHtml(data.global)}</div>
                    </div>
                </div>
            </div>
            `;
        }
        else if (key === 'allies') {
            const data = await this.fetchAPI(`/guild/${gid}/allies`);
            if (!data) return;
            
            let tableHtml = '<table class="ds-table"><tr><th>Ally Name</th><th>Power</th><th>Review Notes</th><th>Actions</th></tr>';
            data.allies.forEach(a => {
                let pBars = '';
                for(let i=0; i<5; i++) pBars += `<span class="${i < a.power ? 'filled' : ''}"></span>`;
                
                tableHtml += `
                <tr>
                    <td>${a.name}</td>
                    <td><div class="power-bar">${pBars}</div></td>
                    <td><span style="font-size:0.85rem;color:var(--text-muted);">${a.review || 'No notes'}</span></td>
                    <td>
                        <button class="remove-btn" style="background:none;border:none;color:#E63946;cursor:pointer;" onclick="DS.removeAlly('${a.name}')"><i class="fas fa-trash-can"></i> Remove</button>
                    </td>
                </tr>`;
            });
            tableHtml += '</table>';
            
            if(data.allies.length === 0) {
                tableHtml = '<p style="color:var(--text-muted);margin:20px 0;">No allies registered yet.</p>';
            }

            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-handshake"></i> Current Allies</h3>
                ${tableHtml}
            </div>
            <div class="setting-card">
                <h3><i class="fas fa-plus"></i> Add New Ally</h3>
                <div class="split-columns" style="gap:16px; margin-top:16px;">
                    <input type="text" id="ally-name" class="ds-input" placeholder="Ally Name / Guild" style="flex:1;">
                    <select id="ally-power" class="ds-select" style="width:120px;min-width:120px;">
                        <option value="1">Power: 1</option>
                        <option value="2">Power: 2</option>
                        <option value="3">Power: 3</option>
                        <option value="4">Power: 4</option>
                        <option value="5">Power: 5</option>
                    </select>
                </div>
                <input type="text" id="ally-review" class="ds-input" placeholder="Review notes (optional)" style="width:100%; margin-top:10px;">
                <button class="btn-save" style="margin-top:16px;" onclick="DS.addAlly()">Add Ally</button>
            </div>
            `;
        }
        else if (key === 'faq') {
            const data = await this.fetchAPI(`/guild/${gid}/faq`);
            if (!data) return;
            
            window.removeFaqRow = function(btn) {
                btn.closest('.faq-row').remove();
            };
            window.addFaqRow = function(q = '', a = '') {
                const container = document.getElementById('faq-container');
                const row = document.createElement('div');
                row.className = 'faq-row';
                row.style.cssText = 'display:flex; gap:10px; margin-bottom:10px; align-items:flex-start;';
                row.innerHTML = `
                    <input type="text" class="ds-input faq-q-input" placeholder="Trigger Question" value="${q.replace(/"/g, '&quot;')}" style="flex:1;">
                    <textarea class="ds-input faq-a-input" placeholder="Response Answer..." style="flex:2; height:40px; resize:vertical;">${a}</textarea>
                    <button class="btn-save" style="background:var(--danger); padding:10px;" onclick="removeFaqRow(this)"><i class="fas fa-trash"></i></button>
                `;
                container.appendChild(row);
            };

            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-circle-question"></i> AI FAQ System</h3>
                <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px;">The AI uses SentenceTransformers to detect similar questions. Add trigger questions and their responses below.</p>
                
                <div id="faq-container" style="margin-bottom: 16px;"></div>
                
                <button class="btn-save" style="background:#555; margin-bottom: 20px;" onclick="addFaqRow()">+ Add FAQ Entry</button>
                
                <div class="setting-row" style="margin-top:20px;border-top:1px solid var(--border);padding-top:20px;">
                    <button class="btn-save" onclick="DS.saveFaq()">Save Config</button>
                </div>
            </div>`;
            
            // Populate existing rows
            setTimeout(() => {
                data.entries.forEach(e => {
                    window.addFaqRow(e.question, e.answer);
                });
                if (data.entries.length === 0) window.addFaqRow();
            }, 50);
        }
        else if (key === 'tryout') {
            const data = await this.fetchAPI(`/guild/${gid}/tryout`);
            if (!data) return;
            let locs = '';
            for(const [id, name] of Object.entries(data.locations)) {
                locs += `<span class="ds-badge">${name}</span>`;
            }
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-clipboard-check"></i> Tryout Settings (Read-Only)</h3>
                <div class="setting-row">
                    <div class="setting-label">Tryout Category</div>
                    <div class="setting-value">ID: ${data.category_id}</div>
                </div>
                <div class="setting-row">
                    <div class="setting-label">Questions per tryout</div>
                    <div class="setting-value">${data.questions_per_tryout}</div>
                </div>
                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <div class="setting-label">Available Locations</div>
                    <div class="badge-list">${locs}</div>
                </div>
            </div>`;
        }
        else if (key === 'auto_delete') {
            const data = await this.fetchAPI(`/guild/${gid}/auto_delete`);
            if (!data) return;
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-trash-can"></i> Ticket Auto-Delete</h3>
                <div class="setting-row">
                    <div class="setting-label">Ticket Category<br><small>Category where tickets are created</small></div>
                    ${this.generateChannelSelect('ad-category', data.ticket_category_id)}
                </div>
                <div class="setting-row">
                    <div class="setting-label">Delete After (Days)<br><small>Inactivity threshold before deletion</small></div>
                    <input type="number" id="ad-days" class="ds-input" value="${data.delete_after_days}" min="1">
                </div>
                <div class="setting-row" style="margin-top:20px;border-top:none;">
                    <button class="btn-save" onclick="DS.saveAutoDelete()">Save Config</button>
                </div>
            </div>`;
        }
        else if (key === 'auto_slowmode') {
            const data = await this.fetchAPI(`/guild/${gid}/auto_slowmode`);
            if (!data) return;
            let thresholdsText = data.thresholds.map(t => `${t.messages}:${t.slowmode}`).join(', ');
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-gauge-high"></i> Auto Slowmode Settings</h3>
                <div class="setting-row">
                    <div class="setting-label">Time Window (Seconds)<br><small>Window to count messages</small></div>
                    <input type="number" id="asm-window" class="ds-input" value="${data.window_seconds}" min="1">
                </div>
                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <div class="setting-label">Thresholds (Format: messages:slowmode, comma separated)</div>
                    <input type="text" id="asm-thresholds" class="ds-input" value="${thresholdsText}" style="width:100%">
                </div>
                <div class="setting-row" style="margin-top:20px;border-top:none;">
                    <button class="btn-save" onclick="DS.saveAutoSlowmode()">Save Config</button>
                </div>
            </div>`;
        }
        else if (key === 'format_enforcer') {
            const data = await this.fetchAPI(`/guild/${gid}/format_enforcer`);
            if (!data) return;
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-align-left"></i> Format Enforcer</h3>
                <div class="setting-row">
                    <div class="setting-label">Monitored Channel<br><small>Channel requiring strict format</small></div>
                    ${this.generateChannelSelect('fe-ch', data.channel_id)}
                </div>
                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <div class="setting-label">Required Headers (one per line)</div>
                    <textarea id="fe-headers" class="ds-input" style="width:100%;height:80px;resize:vertical;">${data.required_headers.join('\n')}</textarea>
                </div>
                <div class="setting-row" style="margin-top:20px;border-top:none;">
                    <button class="btn-save" onclick="DS.saveFormatEnforcer()">Save Config</button>
                </div>
            </div>`;
        }
        else if (key === 'forum_moderator') {
            const data = await this.fetchAPI(`/guild/${gid}/forum_moderator`);
            if (!data) return;
            let tagsText = Object.entries(data.tag_descriptions).map(([k, v]) => `${k}|${v}`).join('\n');
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-comments"></i> Forum Moderator</h3>
                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <div class="setting-label">Drip Forum IDs (comma separated)</div>
                    <input type="text" id="fm-drip" class="ds-input" value="${data.drip_forum_ids.join(', ')}" style="width:100%">
                </div>
                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top: 10px;">
                    <div class="setting-label">Help Forum IDs (comma separated)</div>
                    <input type="text" id="fm-help" class="ds-input" value="${data.help_forum_ids.join(', ')}" style="width:100%">
                </div>
                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top: 10px;">
                    <div class="setting-label">Tag Descriptions (Format: TagName|Description, one per line)</div>
                    <textarea id="fm-tags" class="ds-input" style="width:100%;height:120px;resize:vertical;">${tagsText}</textarea>
                </div>
                <div class="setting-row" style="margin-top:20px;border-top:none;">
                    <button class="btn-save" onclick="DS.saveForumModerator()">Save Config</button>
                </div>
            </div>`;
        }
        else if (key === 'kos') {
            const data = await this.fetchAPI(`/guild/${gid}/kos`);
            if (!data) return;
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-crosshairs"></i> KOS System</h3>
                <div class="setting-row">
                    <div class="setting-label">Target KOS Channel<br><small>Where KOS entries are posted</small></div>
                    ${this.generateChannelSelect('kos-ch', data.target_kos_channel_id)}
                </div>
                <p style="color:var(--text-muted);font-size:0.85rem;margin-top:16px;">This config is currently read-only.</p>
            </div>`;
        }
        else if (key === 'koscheck') {
            const data = await this.fetchAPI(`/guild/${gid}/koscheck`);
            if (!data) return;
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-magnifying-glass"></i> KOS Check / Similarity Engine</h3>
                <div class="setting-row">
                    <div class="setting-label">Similarity Model<br><small>SentenceTransformer model used</small></div>
                    <input type="text" class="ds-input" value="${data.similarity_model}" readonly>
                </div>
                <div class="setting-row">
                    <div class="setting-label">Similarity Threshold<br><small>Confidence required for a match</small></div>
                    <input type="text" class="ds-input" value="${data.threshold}" readonly>
                </div>
                <p style="color:var(--text-muted);font-size:0.85rem;margin-top:16px;">This config is currently read-only.</p>
            </div>`;
        }
        else if (key === 'deepwoken') {
            const data = await this.fetchAPI(`/guild/${gid}/deepwoken`);
            if (!data) return;
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-gamepad"></i> Build Tracker</h3>
                <div class="setting-row">
                    <div class="setting-label">Database Status</div>
                    <span class="ds-badge" style="background:#00BF7F;color:#000;">${data.status}</span>
                </div>
                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <div class="setting-label">Tracked Categories</div>
                    <div class="badge-list">${data.tracked.map(c => `<span class="ds-badge">${c}</span>`).join('')}</div>
                </div>
                <p style="color:var(--text-muted);font-size:0.85rem;margin-top:16px;">This config is currently read-only.</p>
            </div>`;
        }
        else if (key === 'commands') {
            const data = await this.fetchAPI(`/guild/${gid}/commands`);
            if (!data) return;
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-user-tag"></i> Role Commands</h3>
                <div class="setting-row">
                    <div class="setting-label">Ally Role<br><small>Required to bypass certain checks</small></div>
                    ${this.generateRoleSelect('cmd-ally', data.ally_role_id)}
                </div>
                <div class="setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <div class="setting-label">Highrank Roles (comma separated IDs)<br><small>Allowed to use moderation commands</small></div>
                    <input type="text" id="cmd-highranks" class="ds-input" value="${data.highrank_role_ids.join(', ')}" style="width:100%">
                </div>
                <div class="setting-row" style="margin-top:20px;border-top:none;">
                    <button class="btn-save" onclick="DS.saveCommands()">Save Config</button>
                </div>
            </div>`;
        }
        else {
            container.innerHTML = `<div class="setting-card"><p>No settings available for this module.</p></div>`;
        }
    },

    // ── Save Actions ────────────────────────────────────

    saveGankPing: async function(netId) {
        const gid = this.currentGuild.id;
        const body = {
            network_id: netId,
            enabled: document.getElementById(`gp-toggle-${netId}`).classList.contains('active'),
            auto_notify: document.getElementById(`gp-auto-${netId}`).classList.contains('active'),
            channel_id: document.getElementById(`gp-ch-${netId}`).value || null,
            ping_role_id: document.getElementById(`gp-role-${netId}`).value || null,
            ally_role_id: document.getElementById(`gp-ally-${netId}`).value || null
        };
        
        const brandToggle = document.getElementById(`gp-brand-toggle-${netId}`);
        if (brandToggle) {
            body.use_custom_branding = brandToggle.classList.contains('active');
            const brandName = document.getElementById(`gp-brand-name-${netId}`);
            if (brandName) body.custom_bot_name = brandName.value;
            const brandAvatar = document.getElementById(`gp-brand-avatar-${netId}`);
            if (brandAvatar) body.custom_bot_avatar = brandAvatar.value;
            const embedTitle = document.getElementById(`gp-embed-title-${netId}`);
            if (embedTitle) body.custom_embed_title = embedTitle.value;
            const embedColor = document.getElementById(`gp-embed-color-${netId}`);
            if (embedColor) body.custom_embed_color = embedColor.value;
            const embedThumb = document.getElementById(`gp-embed-thumb-${netId}`);
            if (embedThumb) body.custom_embed_thumbnail = embedThumb.value;
        }

        const res = await this.fetchAPI(`/guild/${gid}/gankping`, 'POST', body);
        if (res && res.ok) this.toast("GankPing settings saved");
    },
    
    joinNetworkById: async function() {
        const netId = document.getElementById('gp-join-id').value.trim();
        if (!netId) return this.toast("Please enter a Network ID", "error");
        
        if (!confirm(`Request to join network ${netId}?`)) return;
        const gid = this.currentGuild.id;
        const res = await this.fetchAPI(`/guild/${gid}/gankping/join`, 'POST', { network_id: netId });
        if (res && res.ok) {
            this.toast(res.status === 'pending' ? "Join request sent (pending approval)" : "Successfully joined network!");
            this.renderPanel('gankping');
        }
    },
    
    createNetwork: async function() {
        const gid = this.currentGuild.id;
        const netId = document.getElementById('gp-create-id').value.trim();
        const name = document.getElementById('gp-create-name').value.trim();
        
        if (!netId || !name) {
            this.toast("Network ID and Name are required", "error");
            return;
        }
        
        const res = await this.fetchAPI(`/guild/${gid}/gankping/create`, 'POST', {
            network_id: netId,
            name: name
        });
        if (res && res.ok) {
            this.toast("Network created successfully!");
            this.renderPanel('gankping');
        }
    },

    adminEditNetwork: async function(netId) {
        const gid = this.currentGuild.id;
        const body = {
            network_id: netId,
            action: 'edit_network',
            name: document.getElementById(`admin-name-${netId}`).value.trim(),
            description: document.getElementById(`admin-desc-${netId}`).value.trim(),
            icon_url: document.getElementById(`admin-icon-${netId}`).value.trim(),
            requires_approval: document.getElementById(`admin-req-${netId}`).classList.contains('active'),
            max_members: document.getElementById(`admin-max-${netId}`).value
        };
        const res = await this.fetchAPI(`/guild/${gid}/gankping/admin`, 'POST', body);
        if (res && res.ok) {
            this.toast("Network details saved!");
            this.renderPanel('gankping');
        }
    },

    adminAccept: async function(netId, targetGid) {
        const gid = this.currentGuild.id;
        const res = await this.fetchAPI(`/guild/${gid}/gankping/admin`, 'POST', { network_id: netId, action: 'accept_applicant', target_gid: targetGid });
        if (res && res.ok) {
            this.toast("Applicant accepted");
            this.renderPanel('gankping');
        }
    },

    adminReject: async function(netId, targetGid) {
        const gid = this.currentGuild.id;
        const res = await this.fetchAPI(`/guild/${gid}/gankping/admin`, 'POST', { network_id: netId, action: 'reject_applicant', target_gid: targetGid });
        if (res && res.ok) {
            this.toast("Applicant rejected");
            this.renderPanel('gankping');
        }
    },

    adminKick: async function(netId, targetGid) {
        if (!confirm("Are you sure you want to kick this guild from the network?")) return;
        const gid = this.currentGuild.id;
        const res = await this.fetchAPI(`/guild/${gid}/gankping/admin`, 'POST', { network_id: netId, action: 'kick_member', target_gid: targetGid });
        if (res && res.ok) {
            this.toast("Member kicked from network");
            this.renderPanel('gankping');
        }
    },

    saveAntiAlt: async function() {
        const gid = this.currentGuild.id;
        const wlText = document.getElementById('aa-whitelist').value;
        const whitelist = wlText.split('\n').map(s => s.trim()).filter(s => s);
        
        const body = {
            enabled: document.getElementById(`aa-enable`).classList.contains('active'),
            verify_channel_id: document.getElementById(`aa-vch`).value || null,
            log_channel_id: document.getElementById(`aa-lch`).value || null,
            verified_role_id: document.getElementById(`aa-vrole`).value || null,
            min_account_age_days: parseInt(document.getElementById(`aa-age`).value),
            risk_suspect_threshold: parseInt(document.getElementById(`aa-suspect`).value),
            risk_ban_threshold: parseInt(document.getElementById(`aa-ban`).value),
            whitelist: whitelist
        };
        const res = await this.fetchAPI(`/guild/${gid}/antialt`, 'POST', body);
        if (res && res.ok) this.toast("Anti-Alt settings saved");
    },
    
    saveBotStats: async function() {
        const gid = this.currentGuild.id;
        const body = {
            stats_channel_id: document.getElementById(`bs-ch`).value || null,
            update_interval: parseInt(document.getElementById(`bs-int`).value)
        };
        const res = await this.fetchAPI(`/guild/${gid}/botstats`, 'POST', body);
        if (res && res.ok) this.toast("BotStats config saved");
    },
    
    addAlly: async function() {
        const gid = this.currentGuild.id;
        const name = document.getElementById('ally-name').value.trim();
        const power = parseInt(document.getElementById('ally-power').value);
        const review = document.getElementById('ally-review').value.trim();
        
        if(!name) { this.toast("Ally name required", "error"); return; }
        
        const res = await this.fetchAPI(`/guild/${gid}/allies`, 'POST', {
            action: 'add', name, power, review
        });
        if (res && res.ok) {
            this.toast("Ally added successfully");
            this.renderPanel('allies'); // Refresh table
        }
    },
    
    removeAlly: async function(name) {
        if(!confirm(`Remove ally ${name}?`)) return;
        const gid = this.currentGuild.id;
        const res = await this.fetchAPI(`/guild/${gid}/allies`, 'POST', {
            action: 'remove', name
        });
        if (res && res.ok) {
            this.toast("Ally removed");
            this.renderPanel('allies');
        }
    },
    
    saveAutoDelete: async function() {
        const gid = this.currentGuild.id;
        const body = {
            ticket_category_id: document.getElementById('ad-category').value || null,
            delete_after_days: parseInt(document.getElementById('ad-days').value) || 3
        };
        const res = await this.fetchAPI(`/guild/${gid}/auto_delete`, 'POST', body);
        if (res && res.ok) this.toast("Auto-Delete config saved");
    },
    
    saveAutoSlowmode: async function() {
        const gid = this.currentGuild.id;
        const windowSecs = parseInt(document.getElementById('asm-window').value) || 10;
        const text = document.getElementById('asm-thresholds').value;
        const thresholds = text.split(',').map(part => {
            const [msgs, slow] = part.split(':');
            return {messages: parseInt(msgs), slowmode: parseInt(slow)};
        }).filter(t => !isNaN(t.messages) && !isNaN(t.slowmode));
        
        const body = {
            window_seconds: windowSecs,
            thresholds: thresholds
        };
        const res = await this.fetchAPI(`/guild/${gid}/auto_slowmode`, 'POST', body);
        if (res && res.ok) this.toast("Auto-Slowmode config saved");
    },
    
    saveFormatEnforcer: async function() {
        const gid = this.currentGuild.id;
        const text = document.getElementById('fe-headers').value;
        const headers = text.split('\\n').map(l => l.trim()).filter(l => l);
        const body = {
            channel_id: document.getElementById('fe-ch').value || null,
            required_headers: headers
        };
        const res = await this.fetchAPI(`/guild/${gid}/format_enforcer`, 'POST', body);
        if (res && res.ok) this.toast("Format Enforcer config saved");
    },
    
    saveForumModerator: async function() {
        const gid = this.currentGuild.id;
        const dripText = document.getElementById('fm-drip').value;
        const helpText = document.getElementById('fm-help').value;
        const tagsText = document.getElementById('fm-tags').value;
        
        const tagsObj = {};
        tagsText.split('\\n').forEach(line => {
            const parts = line.split('|');
            if (parts.length >= 2) {
                tagsObj[parts[0].trim()] = parts.slice(1).join('|').trim();
            }
        });
        
        const body = {
            drip_forum_ids: dripText.split(',').map(s => s.trim()).filter(s => s),
            help_forum_ids: helpText.split(',').map(s => s.trim()).filter(s => s),
            tag_descriptions: tagsObj
        };
        const res = await this.fetchAPI(`/guild/${gid}/forum_moderator`, 'POST', body);
        if (res && res.ok) this.toast("Forum Moderator config saved");
    },
    
    saveFaq: async function() {
        const gid = this.currentGuild.id;
        const entries = [];
        const rows = document.querySelectorAll('.faq-row');
        
        rows.forEach(row => {
            const q = row.querySelector('.faq-q-input').value.trim();
            const a = row.querySelector('.faq-a-input').value.trim();
            if (q && a) {
                entries.push({ question: q, answer: a });
            }
        });
        
        const res = await this.fetchAPI(`/guild/${gid}/faq`, 'POST', { entries });
        if (res && res.ok) this.toast("FAQ config saved");
    },
    
    saveCommands: async function() {
        const gid = this.currentGuild.id;
        const hrText = document.getElementById('cmd-highranks').value;
        const body = {
            ally_role_id: document.getElementById('cmd-ally').value || null,
            highrank_role_ids: hrText.split(',').map(s => s.trim()).filter(s => s)
        };
        const res = await this.fetchAPI(`/guild/${gid}/commands`, 'POST', body);
        if (res && res.ok) this.toast("Role Commands config saved");
    }
};

window.DS = DS;
