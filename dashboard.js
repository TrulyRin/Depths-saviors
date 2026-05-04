/**
 * Dashboard Application Logic
 */

const API_BASE = "https://api.deepsaviors.xyz/api"; // Needs reverse proxy setup

const DS = {
    token: null,
    user: null,
    currentGuild: null,
    channels: [],
    roles: [],
    
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

    fetchDiscord: async function(url) {
        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.status === 401) { this.logout(); return null; }
            return await res.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    fetchAPI: async function(endpoint, method = 'GET', body = null) {
        try {
            const opts = {
                method: method,
                headers: { 'Authorization': `Bearer ${this.token}` }
            };
            if (body) {
                opts.headers['Content-Type'] = 'application/json';
                opts.body = JSON.stringify(body);
            }
            const res = await fetch(API_BASE + endpoint, opts);
            if (res.status === 401 || res.status === 403) {
                this.toast("Session expired or permission denied", "error");
                this.logout(); 
                return null;
            }
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
        } catch (e) {
            console.error(e);
            this.toast(e.message, "error");
            return null;
        }
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

        // Get bot guilds (needs to be from our API because Discord OAuth only gives us user guilds)
        // Wait, implicit OAuth doesn't let us see WHICH of the user's guilds the bot is in unless we ask our API.
        const res = await this.fetchAPI("/bot/guilds");
        if (!res || !res.guilds) {
            grid.innerHTML = `<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">Could not fetch server list.</p>`;
            return;
        }

        const discordGuilds = await this.fetchDiscord("https://discord.com/api/v10/users/@me/guilds");
        if (!discordGuilds) return;

        // Find intersection where user has MANAGE_GUILD and bot is in
        const botGuildIds = new Set(res.guilds.map(g => g.id));
        const adminGuilds = discordGuilds.filter(g => {
            const perms = BigInt(g.permissions);
            const manageGuild = (perms & 32n) === 32n;
            const admin = (perms & 8n) === 8n;
            return (manageGuild || admin) && botGuildIds.has(g.id);
        });

        if (adminGuilds.length === 0) {
            grid.innerHTML = `<div style="text-align:center;grid-column:1/-1;padding:40px;">
                <p>No manageable servers found where the bot is present.</p>
                <a href="/joinds" style="color:var(--primary);margin-top:10px;display:inline-block;">Invite Bot</a>
            </div>`;
            return;
        }

        grid.innerHTML = '';
        adminGuilds.forEach(g => {
            const card = document.createElement('div');
            card.className = 'server-card';
            card.onclick = () => this.loadGuild(g.id);
            
            const iconHtml = g.icon 
                ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" class="server-icon">`
                : `<div class="server-icon-placeholder">${g.name.charAt(0)}</div>`;
                
            card.innerHTML = `
                ${iconHtml}
                <h3>${g.name}</h3>
                <span class="member-count">Manage Settings</span>
            `;
            grid.appendChild(card);
        });
    },

    // ── Guild Dashboard ─────────────────────────────────

    loadGuild: async function(guildId) {
        document.getElementById('view-servers').style.display = 'none';
        document.getElementById('view-dashboard').style.display = 'flex';
        
        const res = await this.fetchAPI(`/guild/${guildId}/overview`);
        if (!res) { this.showServers(); return; }
        
        this.currentGuild = res.guild;
        
        // Setup Sidebar header
        const sbGuild = document.getElementById('sidebar-guild');
        const iconHtml = this.currentGuild.icon 
            ? `<img src="${this.currentGuild.icon}">` 
            : `<div style="width:36px;height:36px;border-radius:10px;background:var(--primary-glow);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:bold;">${this.currentGuild.name.charAt(0)}</div>`;
            
        sbGuild.innerHTML = `<i class="fas fa-chevron-left back-arrow"></i> ${iconHtml} <span>${this.currentGuild.name}</span>`;
        sbGuild.onclick = () => this.showServers();

        // Load reference data
        const channelsRes = await this.fetchAPI(`/guild/${guildId}/channels`);
        this.channels = channelsRes ? channelsRes.channels : [];
        const rolesRes = await this.fetchAPI(`/guild/${guildId}/roles`);
        this.roles = rolesRes ? rolesRes.roles : [];

        // Build Nav and Panels
        const nav = document.getElementById('cog-nav');
        const content = document.getElementById('dash-content');
        nav.innerHTML = '';
        content.innerHTML = '';

        let first = true;
        for (const [key, meta] of Object.entries(res.cogs)) {
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
