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
            if (c.type === "0" || c.type === "5") { // text or news
                const sel = c.id === selectedId ? 'selected' : '';
                html += `<option value="${c.id}" ${sel}>#${c.name}</option>`;
            }
        });
        html += `</select>`;
        return html;
    },

    generateRoleSelect: function(id, selectedId) {
        let html = `<select id="${id}" class="ds-select"><option value="">-- None --</option>`;
        this.roles.forEach(r => {
            if (r.name !== "@everyone") {
                const sel = r.id === selectedId ? 'selected' : '';
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
            
            let html = '';
            data.networks.forEach(net => {
                const isEnabled = net.member ? net.member.enabled : false;
                
                html += `
                <div class="network-card">
                    <div class="net-header">
                        ${net.icon_url ? `<img src="${net.icon_url}" class="net-icon">` : ''}
                        <div>
                            <div class="net-name">${net.name} ${net.is_owner ? '<span class="net-badge">Owner</span>' : ''}</div>
                            <div class="net-id">Network ID: ${net.network_id} • ${net.member_count} guilds</div>
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

                    ${net.member ? `
                    <div class="setting-card">
                        <h3><i class="fas fa-sliders"></i> Notification Setup</h3>
                        
                        <div class="setting-row">
                            <div class="setting-label">Enable Notifications<br><small>Receive pings from this network</small></div>
                            <div class="toggle ${isEnabled ? 'active' : ''}" id="gp-toggle-${net.network_id}" onclick="this.classList.toggle('active')"></div>
                        </div>
                        
                        <div class="setting-row">
                            <div class="setting-label">Target Channel<br><small>Where to post incoming pings</small></div>
                            ${this.generateChannelSelect(`gp-ch-${net.network_id}`, net.member.channel_id)}
                        </div>
                        
                        <div class="setting-row">
                            <div class="setting-label">Ping Role<br><small>Role to mention on new ganks</small></div>
                            ${this.generateRoleSelect(`gp-role-${net.network_id}`, net.member.ping_role_id)}
                        </div>

                        <div class="setting-row" style="margin-top:20px;">
                            <button class="btn-save" onclick="DS.saveGankPing('${net.network_id}')">Save Changes</button>
                        </div>
                    </div>
                    ` : '<p>Not a member of this network.</p>'}
                </div>`;
            });
            container.innerHTML = html;
        }
        else if (key === 'antialt') {
            const data = await this.fetchAPI(`/guild/${gid}/antialt`);
            if (!data) return;
            const s = data.settings;
            
            container.innerHTML = `
            <div class="setting-card">
                <h3><i class="fas fa-shield-halved"></i> Verification Engine</h3>
                
                <div class="setting-row">
                    <div class="setting-label">Enable Anti-Alt<br><small>Require new users to verify via website</small></div>
                    <div class="toggle ${s.enabled ? 'active' : ''}" id="aa-enable" onclick="this.classList.toggle('active')"></div>
                </div>
                
                <div class="setting-row">
                    <div class="setting-label">Verification Channel<br><small>Where the Verify button is posted</small></div>
                    ${this.generateChannelSelect('aa-vch', s.verify_channel_id)}
                </div>

                <div class="setting-row">
                    <div class="setting-label">Security Log Channel<br><small>Logs VPNs, alt detections, failures</small></div>
                    ${this.generateChannelSelect('aa-lch', s.log_channel_id)}
                </div>
                
                <div class="setting-row">
                    <div class="setting-label">Verified Role<br><small>Given upon successful verification</small></div>
                    ${this.generateRoleSelect('aa-vrole', s.verified_role_id)}
                </div>
            </div>
            
            <div class="setting-card">
                <h3><i class="fas fa-sliders"></i> Security Thresholds</h3>
                
                <div class="setting-row">
                    <div class="setting-label">Min Account Age (Days)<br><small>Accounts younger than this are flagged</small></div>
                    <input type="number" id="aa-age" class="ds-input" value="${s.min_account_age_days}" min="0" max="365">
                </div>
                
                <div class="setting-row">
                    <div class="setting-label">Suspect Risk Score<br><small>Score required to flag for manual review (0-100)</small></div>
                    <input type="number" id="aa-suspect" class="ds-input" value="${s.risk_suspect_threshold}" min="0" max="100">
                </div>
                
                <div class="setting-row">
                    <div class="setting-label">Auto-Ban Risk Score<br><small>Score required to instantly ban (0-100)</small></div>
                    <input type="number" id="aa-ban" class="ds-input" value="${s.risk_ban_threshold}" min="0" max="100">
                </div>
                
                <div class="setting-row" style="margin-top:20px;">
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
                    <div class="stat-value">${data.stats.cpu_usage}</div>
                    <div class="stat-label">CPU Usage</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.stats.ram_usage}</div>
                    <div class="stat-label">RAM Usage</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.stats.ping}</div>
                    <div class="stat-label">Latency</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.stats.uptime}</div>
                    <div class="stat-label">Uptime</div>
                </div>
            </div>
            
            <div class="setting-card">
                <h3><i class="fas fa-tv"></i> Live Stats Channel</h3>
                
                <div class="setting-row">
                    <div class="setting-label">Voice Channel<br><small>Channel name updates with live stats</small></div>
                    ${this.generateChannelSelect('bs-ch', data.stats_channel_id)}
                </div>
                
                <div class="setting-row">
                    <div class="setting-label">Update Interval (Minutes)<br><small>How often to rename the channel (Discord rate limit is 5m)</small></div>
                    <input type="number" id="bs-int" class="ds-input" value="${data.update_interval}" min="5">
                </div>
                
                <div class="setting-row" style="margin-top:20px;">
                    <button class="btn-save" onclick="DS.saveBotStats()">Save Config</button>
                </div>
            </div>
            `;
        }
        else {
            container.innerHTML = `<div class="setting-card"><p>Configuration panel for <strong>${key}</strong> is under construction via Web Dashboard API.</p><p style="color:var(--text-muted);font-size:0.85rem;margin-top:10px;">Use Discord slash commands to manage these settings in the meantime.</p></div>`;
        }
    },

    // ── Save Actions ────────────────────────────────────

    saveGankPing: async function(netId) {
        const gid = this.currentGuild.id;
        const body = {
            network_id: netId,
            enabled: document.getElementById(`gp-toggle-${netId}`).classList.contains('active'),
            channel_id: document.getElementById(`gp-ch-${netId}`).value || null,
            ping_role_id: document.getElementById(`gp-role-${netId}`).value || null
        };
        const res = await this.fetchAPI(`/guild/${gid}/gankping`, 'POST', body);
        if (res && res.ok) this.toast("GankPing settings saved");
    },

    saveAntiAlt: async function() {
        const gid = this.currentGuild.id;
        const body = {
            enabled: document.getElementById(`aa-enable`).classList.contains('active'),
            verify_channel_id: document.getElementById(`aa-vch`).value || null,
            log_channel_id: document.getElementById(`aa-lch`).value || null,
            verified_role_id: document.getElementById(`aa-vrole`).value || null,
            min_account_age_days: parseInt(document.getElementById(`aa-age`).value),
            risk_suspect_threshold: parseInt(document.getElementById(`aa-suspect`).value),
            risk_ban_threshold: parseInt(document.getElementById(`aa-ban`).value),
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
    }
};

window.DS = DS;
