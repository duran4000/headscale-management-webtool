const express = require('express');
const axios = require('axios');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { wecomManager } = require('./wecom');
const { getNodeStatus, checkProcess, stopService, startService, restartService, getAllNodesStatus, nodeConfig } = require('./ssh-manager');

const app = express();
let PORT = process.env.PROXY_PORT || 3006;

// Node status monitoring
let nodeStatusCache = {};  // { nodeId: { online: bool, name: string } }
let monitoringInterval = null;

// Load configuration from file
const configPath = path.join(__dirname, 'config.json');
const exampleConfigPath = path.join(__dirname, 'config.example.json');

let HEADSCALE_SERVER = 'https://YOUR_SERVER_IP:65437';
let HEADSCALE_API_KEY = '';

// WeCom configuration (loaded from config.json)
let wecomConfig = {
    companyId: '',
    appId: '',
    appSecret: '',
    enabled: false
};

// Store full config for saving
let fullConfig = {};

// Try to load config.json
if (fs.existsSync(configPath)) {
    try {
        fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (fullConfig.serverUrl) HEADSCALE_SERVER = fullConfig.serverUrl;
        if (fullConfig.apiKey) HEADSCALE_API_KEY = fullConfig.apiKey;
        if (fullConfig.proxyPort) PORT = fullConfig.proxyPort;

        // Load WeCom config from config.json
        if (fullConfig.wecom) {
            wecomConfig = {
                companyId: fullConfig.wecom.companyId || '',
                appId: fullConfig.wecom.appId || '',
                appSecret: fullConfig.wecom.appSecret || '',
                enabled: fullConfig.wecom.enabled || false
            };
            console.log(`[Config] WeCom config loaded, enabled: ${wecomConfig.enabled}`);
        }

        console.log(`[Config] Loaded configuration from config.json`);
    } catch (err) {
        console.warn(`[Config] Failed to parse config.json: ${err.message}`);
        console.log(`[Config] Using default values`);
    }
} else {
    console.log(`[Config] config.json not found, using default values`);
    console.log(`[Config] To configure, copy config.example.json to config.json and edit it`);
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Default page - serve headscale-tool-v2.html
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'headscale-tool-v2.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.status(404).send('headscale-tool-v2.html not found');
    }
});

// Configuration management endpoint
app.post('/config', (req, res) => {
    const { serverUrl, apiKey } = req.body;
    if (serverUrl && serverUrl.startsWith('https://')) {
        HEADSCALE_SERVER = serverUrl;
        console.log(`[${new Date().toISOString()}] Server URL updated: ${HEADSCALE_SERVER}`);
    }
    if (apiKey && apiKey.startsWith('hskey-')) {
        HEADSCALE_API_KEY = apiKey;
        console.log(`[${new Date().toISOString()}] API key updated`);
    }
    res.json({ success: true, serverUrl: HEADSCALE_SERVER, maskedKey: HEADSCALE_API_KEY ? HEADSCALE_API_KEY.substring(0, 20) + '...' : 'Not set' });
});

app.get('/config', (req, res) => {
    const maskedKey = HEADSCALE_API_KEY ? HEADSCALE_API_KEY.substring(0, 20) + '...' : 'Not set';
    res.json({ serverUrl: HEADSCALE_SERVER, maskedKey });
});

// Create HTTPS agent that accepts self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'pass', timestamp: new Date().toISOString() });
});

// Extract host from HEADSCALE_SERVER for headers
const getServerHost = () => {
    try {
        const url = new URL(HEADSCALE_SERVER);
        return url.host;
    } catch {
        return HEADSCALE_SERVER.replace(/^https?:\/\//, '');
    }
};

// Custom rename endpoint for nodes
app.post('/api/node/:id/rename', async (req, res) => {
    try {
        const nodeId = req.params.id;
        const { new_name } = req.body;
        
        if (!new_name) {
            return res.status(400).json({ error: 'new_name is required' });
        }
        
        console.log(`[${new Date().toISOString()}] RENAME request for node ${nodeId} to ${new_name}`);
        
        // Try PATCH method first
        try {
            const patchResponse = await axios({
                method: 'PATCH',
                url: `${HEADSCALE_SERVER}/api/v1/node/${nodeId}`,
                headers: {
                    host: getServerHost(),
                    'Authorization': `Bearer ${HEADSCALE_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                data: { givenName: new_name },
                httpsAgent: httpsAgent,
                validateStatus: () => true,
                timeout: 30000
            });
            
            // Add CORS headers
            res.set({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            
            if (patchResponse.status === 200 || patchResponse.status === 204) {
                console.log(`[${new Date().toISOString()}] RENAME successful via PATCH`);
                return res.status(200).json({ 
                    success: true, 
                    message: 'Node renamed successfully',
                    node: patchResponse.data 
                });
            }
        } catch (patchError) {
            console.log(`[${new Date().toISOString()}] PATCH failed: ${patchError.message}`);
        }
        
        // If PATCH failed, try PUT method
        try {
            const putResponse = await axios({
                method: 'PUT',
                url: `${HEADSCALE_SERVER}/api/v1/node/${nodeId}`,
                headers: {
                    host: getServerHost(),
                    'Authorization': `Bearer ${HEADSCALE_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                data: { givenName: new_name },
                httpsAgent: httpsAgent,
                validateStatus: () => true,
                timeout: 30000
            });
            
            // Add CORS headers
            res.set({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            
            if (putResponse.status === 200 || putResponse.status === 204) {
                console.log(`[${new Date().toISOString()}] RENAME successful via PUT`);
                return res.status(200).json({ 
                    success: true, 
                    message: 'Node renamed successfully',
                    node: putResponse.data 
                });
            }
        } catch (putError) {
            console.log(`[${new Date().toISOString()}] PUT failed: ${putError.message}`);
        }
        
        // Add CORS headers
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        
        // If both methods failed, return helpful error message
        res.status(501).json({ 
            error: 'Rename not supported by this Headscale version',
            message: 'The REST API for renaming nodes is not implemented in this version of Headscale',
            suggestion: 'Please use the Headscale CLI on your server: headscale nodes rename -i ' + nodeId + ' ' + new_name,
            note: 'The rename functionality is available via CLI but not via REST API in current Headscale versions'
        });
        
    } catch (error) {
        console.error(`[ERROR] Rename failed: ${error.message}`);
        
        // Add CORS headers
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        
        res.status(500).json({
            error: 'Rename failed',
            message: error.message,
            suggestion: 'Please use the Headscale CLI: headscale nodes rename -i ' + req.params.id + ' ' + req.body.new_name
        });
    }
});

// ==================== Topology Discovery Endpoint ====================

// Helper: execute tailscale ping and parse result
function pingNode(ip) {
    return new Promise((resolve) => {
        // Windows: tailscale ping --c 1 <ip>
        // Linux/Mac: tailscale ping --timeout=1s <ip>
        const isWindows = process.platform === 'win32';
        const cmd = isWindows
            ? `tailscale ping --c 1 ${ip}`
            : `tailscale ping --timeout=2s ${ip}`;

        exec(cmd, { timeout: 8000 }, (error, stdout, stderr) => {
            const output = stdout.trim();
            const errorOutput = stderr.trim();

            // Check if there's a pong response in the output (even if exit code is non-zero)
            // Parse: "pong from redminote13pro (100.64.0.1) via [IPv6]:port in 15ms"
            // Or: "pong from node via DERP(tokyo) in 50ms"
            const match = output.match(/pong from .+? via (.+?) in (\d+)ms/);

            if (match) {
                const via = match[1];
                const latency = parseInt(match[2], 10);
                const isDirect = !via.includes('DERP');

                resolve({
                    ip,
                    success: true,
                    latency,
                    connectionType: isDirect ? 'direct' : 'derp',
                    via: isDirect ? via : via.match(/DERP\((.+?)\)/)?.[1] || via
                });
                return;
            }

            // If tailscale ping failed but node is reachable via normal ping, mark as relay connection
            // This happens when direct connection can't be established but DERP relay works
            if (error && output.includes('direct connection not established')) {
                // Fallback to ICMP ping to measure latency
                exec(`ping -n 1 -w 2000 ${ip}`, { timeout: 5000 }, (pingError, pingStdout) => {
                    const pingMatch = pingStdout.match(/time[=<](\d+)ms/i) ||
                                      pingStdout.match(/(\d+)ms/i);
                    const latency = pingMatch ? parseInt(pingMatch[1], 10) : 999;

                    resolve({
                        ip,
                        success: true,
                        latency,
                        connectionType: 'derp',
                        via: 'DERP relay (no direct)',
                        isRelay: true
                    });
                });
                return;
            }

            // Complete failure
            if (error) {
                resolve({ ip, success: false, error: error.message || output || errorOutput });
                return;
            }

            resolve({ ip, success: false, raw: output });
        });
    });
}

// Topology endpoint - returns real connection data
app.get('/api/topology', async (req, res) => {
    try {
        console.log(`[${new Date().toISOString()}] TOPOLOGY request`);

        // Get local machine's Tailscale IP
        const localIP = await new Promise((resolve) => {
            exec('tailscale ip -4', { timeout: 3000 }, (error, stdout) => {
                resolve(error ? null : stdout.trim());
            });
        });

        // Get local machine's hostname
        const localHostname = await new Promise((resolve) => {
            exec(`tailscale status | grep "${localIP}"`, { timeout: 3000, shell: true }, (error, stdout) => {
                if (error) {
                    resolve(null);
                } else {
                    // Output format: "100.64.0.2   y9000p          default  windows  -"
                    const parts = stdout.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        resolve(parts[1]);  // Second column is hostname
                    } else {
                        resolve(null);
                    }
                }
            });
        });

        console.log(`[Topology] Local IP: ${localIP || 'unknown'}, Hostname: ${localHostname || 'unknown'}`);

        // Get node list from Headscale
        const nodesResponse = await axios({
            method: 'GET',
            url: `${HEADSCALE_SERVER}/api/v1/node`,
            headers: {
                host: getServerHost(),
                'Authorization': `Bearer ${HEADSCALE_API_KEY}`
            },
            httpsAgent: httpsAgent,
            timeout: 10000
        });

        const allNodes = nodesResponse.data.nodes || [];

        // Filter out local machine from node list
        const nodes = allNodes.filter(n => {
            const nodeIP = n.ipAddresses?.find(ip => ip.startsWith('100.64.'));
            return nodeIP !== localIP;
        });

        const onlineNodes = nodes.filter(n => n.online && n.ipAddresses?.length > 0);

        console.log(`[Topology] Found ${allNodes.length} nodes, ${nodes.length} after excluding self, ${onlineNodes.length} online`);

        // Ping all online nodes in parallel
        const pingPromises = onlineNodes.map(async (node) => {
            // Use first Tailscale IP (100.64.x.x)
            const tsIP = node.ipAddresses.find(ip => ip.startsWith('100.64.')) || node.ipAddresses[0];
            const result = await pingNode(tsIP);

            return {
                nodeId: node.id,
                nodeName: node.givenName || node.name,
                ip: tsIP,
                ...result
            };
        });

        const pingResults = await Promise.all(pingPromises);

        // Build topology data
        const topology = {
            timestamp: new Date().toISOString(),
            probeNode: 'local',
            localIP: localIP,
            localHostname: localHostname,
            nodes: nodes.map(n => ({
                id: n.id,
                name: n.givenName || n.name,
                ip: n.ipAddresses?.[0],
                online: n.online,
                namespace: n.user?.name || 'default'
            })),
            connections: pingResults.filter(r => r.success).map(r => ({
                from: 'local',
                to: r.nodeId,
                toName: r.nodeName,
                latency: r.latency,
                type: r.connectionType,
                via: r.via
            })),
            failed: pingResults.filter(r => !r.success).map(r => ({
                nodeId: r.nodeId,
                nodeName: r.nodeName,
                error: r.error || r.raw
            }))
        };

        // CORS headers
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });

        res.json(topology);

    } catch (error) {
        console.error(`[ERROR] Topology failed: ${error.message}`);
        res.status(500).json({
            error: 'Topology discovery failed',
            message: error.message
        });
    }
});

// ==================== WeCom & Monitor API endpoints ====================
// These must be defined BEFORE the catch-all /api proxy

// WeCom config endpoints
app.get('/api/wecom/config', (req, res) => {
    res.json({
        companyId: wecomConfig.companyId,
        appId: wecomConfig.appId,
        enabled: wecomConfig.enabled,
        // Don't expose secret
        configured: !!wecomConfig.appSecret
    });
});

app.post('/api/wecom/config', (req, res) => {
    const { companyId, appId, appSecret, enabled } = req.body;

    if (companyId !== undefined) wecomConfig.companyId = companyId;
    if (appId !== undefined) wecomConfig.appId = appId;
    if (appSecret !== undefined) wecomConfig.appSecret = appSecret;
    if (enabled !== undefined) wecomConfig.enabled = enabled;

    // Update full config and save to config.json
    fullConfig.wecom = {
        companyId: wecomConfig.companyId,
        appId: wecomConfig.appId,
        appSecret: wecomConfig.appSecret,
        enabled: wecomConfig.enabled
    };
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));

    console.log('[WeCom] Configuration saved to config.json');
    res.json({ success: true, config: { ...wecomConfig, appSecret: '******' } });
});

app.post('/api/wecom/test', async (req, res) => {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const result = await sendWeComMarkdown(`## 🧪 测试消息\n\n这是一条测试消息。\n\n**时间**: ${now}\n\n> Headscale 管理工具`);
    res.json(result);
});

// Monitoring control endpoints
app.post('/api/monitor/start', (req, res) => {
    const { interval } = req.body;
    startNodeMonitoring(interval || 60);
    res.json({ success: true, message: 'Monitoring started' });
});

app.post('/api/monitor/stop', (req, res) => {
    stopNodeMonitoring();
    res.json({ success: true, message: 'Monitoring stopped' });
});

app.get('/api/monitor/status', (req, res) => {
    res.json({
        active: monitoringInterval !== null,
        nodeCount: Object.keys(nodeStatusCache).length,
        nodes: nodeStatusCache,
        wecom: {
            enabled: wecomConfig.enabled,
            configured: !!wecomConfig.appSecret
        }
    });
});

// ==================== SSH Management & Node Operations ====================

// Get all nodes SSH status
app.get('/api/nodes/ssh/status', async (req, res) => {
    try {
        const status = await getAllNodesStatus();
        res.json({ success: true, nodes: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single node SSH status
app.get('/api/nodes/:ip/ssh/status', async (req, res) => {
    try {
        const status = await getNodeStatus(req.params.ip);
        res.json({ success: true, ...status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check port status
app.get('/api/nodes/:ip/port/:port', async (req, res) => {
    try {
        const { checkPort } = require('./ssh-manager');
        const result = await checkPort(req.params.ip, parseInt(req.params.port));
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check process status
app.get('/api/nodes/:ip/process/:name', async (req, res) => {
    try {
        const result = await checkProcess(req.params.ip, req.params.name);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop service
app.post('/api/nodes/:ip/service/:action/:service', async (req, res) => {
    try {
        const { action, service } = req.params;
        let result;

        switch (action) {
            case 'stop':
                result = await stopService(req.params.ip, service);
                break;
            case 'start':
                result = await startService(req.params.ip, service);
                break;
            case 'restart':
                result = await restartService(req.params.ip, service);
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Execute custom command
app.post('/api/nodes/:ip/command', async (req, res) => {
    try {
        const { command } = req.body;
        if (!command) {
            return res.status(400).json({ success: false, error: 'Command required' });
        }

        // Security: Only allow specific commands
        const allowedPatterns = [
            /^systeminfo/i, /^hostname/i, /^uptime/i, /^ps\s/, /^top\s/,
            /^tasklist/i, /^net\s+stat/i, /^ss\s/, /^docker\s/, /^systemctl\s+status/i,
            /^curl\s/, /^ping\s/, /^nslookup/i, /^rundll32\.exe/i,
            /^shutdown/i, /^powercfg/i, /^wakeonlan/i, /^dir\s/i, /^type\s/i, /^icacls/i, /^takeown/i, /^net\s+use/i, /^more\s/i, /^echo\s/i, /^move\s/i, /^taskkill\s/i, /^start\s/i, /^wmic\s/i, /^where\s/i, /^schtasks\s/i, /^sc\s/i, /^reg\s/i, /^powershell\s/i, /^mkdir\s/i
        ];

        const isAllowed = allowedPatterns.some(p => p.test(command));
        if (!isAllowed) {
            return res.status(403).json({ success: false, error: 'Command not allowed' });
        }

        const { execCommand } = require('./ssh-manager');
        const result = await execCommand(req.params.ip, command);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// List configured nodes
app.get('/api/nodes/list', (req, res) => {
    const nodes = Object.entries(nodeConfig.nodes).map(([ip, info]) => ({
        ip,
        name: info.name,
        port: info.port,
        user: info.user,
        os: info.os
    }));
    res.json({ success: true, nodes });
});

// Proxy all API requests to Headscale server
app.use('/api', async (req, res) => {
    try {
        const targetUrl = `${HEADSCALE_SERVER}/api/v1${req.url}`;

        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${targetUrl}`);

        const headers = {
            ...req.headers,
            host: getServerHost(),
            origin: undefined,
            referer: undefined,
            'Authorization': `Bearer ${HEADSCALE_API_KEY}`
        };

        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: headers,
            data: req.body,
            params: req.query,
            httpsAgent: httpsAgent,
            validateStatus: () => true,
            timeout: 30000
        });

        // Add CORS headers to response
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });

        res.status(response.status).send(response.data);

    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        if (error.response) {
            console.error(`[ERROR] Response status: ${error.response.status}`);
            console.error(`[ERROR] Response data: ${JSON.stringify(error.response.data)}`);
        }

        // Add CORS headers to response
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });

        // Return proper JSON response for errors
        if (error.response) {
            res.status(error.response.status).json({
                error: error.message,
                status: error.response.status,
                details: error.response.data || null
            });
        } else if (error.code === 'ECONNREFUSED') {
            res.status(503).json({
                error: 'Connection refused',
                message: 'Cannot connect to Headscale server'
            });
        } else {
            res.status(500).json({
                error: 'Proxy error',
                message: error.message,
                details: error.response ? error.response.data : null
            });
        }
    }
});

// ==================== WeCom Integration & Node Monitoring ====================

// WeCom API functions
async function getWeComAccessToken() {
    if (!wecomConfig.companyId || !wecomConfig.appSecret) {
        return null;
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${wecomConfig.companyId}&corpsecret=${wecomConfig.appSecret}`;

    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data.access_token || null;
    } catch (error) {
        console.error('[WeCom] Failed to get access token:', error.message);
        return null;
    }
}

async function sendWeComMarkdown(text) {
    if (!wecomConfig.enabled) {
        console.log('[WeCom] Notification disabled');
        return { success: false, error: 'Disabled' };
    }

    const accessToken = await getWeComAccessToken();
    if (!accessToken) {
        return { success: false, error: 'No access token' };
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;
    const data = {
        touser: '@all',
        agentid: wecomConfig.appId,
        msgtype: 'markdown',
        markdown: { content: text }
    };

    try {
        const response = await axios.post(url, data, { timeout: 10000 });
        if (response.data.errcode === 0) {
            console.log('[WeCom] Message sent successfully');
            return { success: true };
        } else {
            console.error('[WeCom] Send failed:', response.data);
            return { success: false, error: response.data.errmsg };
        }
    } catch (error) {
        console.error('[WeCom] Send error:', error.message);
        return { success: false, error: error.message };
    }
}

// Send node status notification
async function sendNodeStatusNotification(nodeName, status, details = {}) {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const emoji = status === 'online' ? '🟢' : '🔴';
    const statusText = status === 'online' ? '上线' : '下线';

    const markdown = `## ${emoji} 节点状态变更

**节点**: ${nodeName}
**状态**: ${statusText}
**时间**: ${now}
${details.ip ? `**IP**: ${details.ip}` : ''}

> Headscale 管理工具`;

    return await sendWeComMarkdown(markdown);
}

// Check node status changes
async function checkNodeStatusChanges() {
    try {
        const response = await axios({
            method: 'GET',
            url: `${HEADSCALE_SERVER}/api/v1/node`,
            headers: {
                host: getServerHost(),
                'Authorization': `Bearer ${HEADSCALE_API_KEY}`
            },
            httpsAgent: httpsAgent,
            timeout: 10000
        });

        const nodes = response.data.nodes || [];

        for (const node of nodes) {
            const nodeId = node.id;
            const nodeName = node.givenName || node.name;
            const isOnline = node.online;
            const cached = nodeStatusCache[nodeId];

            // Check for status change
            if (cached !== undefined && cached.online !== isOnline) {
                console.log(`[Monitor] Node ${nodeName} status changed: ${cached.online ? 'online' : 'offline'} -> ${isOnline ? 'online' : 'offline'}`);

                // Send notification
                if (wecomConfig.enabled) {
                    await sendNodeStatusNotification(nodeName, isOnline ? 'online' : 'offline', {
                        ip: node.ipAddresses?.[0],
                        namespace: node.user?.name
                    });
                }
            }

            // Update cache
            nodeStatusCache[nodeId] = {
                online: isOnline,
                name: nodeName,
                ip: node.ipAddresses?.[0]
            };
        }
    } catch (error) {
        console.error('[Monitor] Failed to check node status:', error.message);
    }
}

// Start monitoring
function startNodeMonitoring(intervalSeconds = 60) {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }

    console.log(`[Monitor] Starting node status monitoring (interval: ${intervalSeconds}s)`);

    // Initial check
    checkNodeStatusChanges();

    // Periodic check
    monitoringInterval = setInterval(checkNodeStatusChanges, intervalSeconds * 1000);
}

function stopNodeMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
        console.log('[Monitor] Node status monitoring stopped');
    }
}

// ==================== Node Monitoring Functions ====================

async function checkNodeStatus() {
    try {
        const response = await axios({
            method: 'GET',
            url: `${HEADSCALE_SERVER}/api/v1/node`,
            headers: {
                'Authorization': `Bearer ${HEADSCALE_API_KEY}`
            },
            httpsAgent: httpsAgent,
            timeout: 10000
        });

        const nodes = response.data.nodes || [];

        for (const node of nodes) {
            const nodeId = node.id;
            const nodeName = node.givenName || node.name || `Node ${nodeId}`;
            const isOnline = node.online;
            const cached = nodeStatusCache[nodeId];

            // Check for status change
            if (cached !== undefined && cached.online !== isOnline) {
                const statusText = isOnline ? '上线' : '下线';
                console.log(`[Monitor] ${nodeName} ${statusText}`);

                // Send notification
                if (wecomConfig.enabled) {
                    sendNodeStatusNotification(nodeName, isOnline ? 'online' : 'offline', {
                        ip: node.ipAddresses?.[0],
                        namespace: node.user?.name || 'default'
                    });
                }
            }

            // Update cache
            nodeStatusCache[nodeId] = {
                online: isOnline,
                name: nodeName,
                ip: node.ipAddresses?.[0],
                namespace: node.user?.name || 'default'
            };
        }

    } catch (error) {
        console.error('[Monitor] Check failed:', error.message);
    }
}

function startNodeMonitoring(interval = 60) {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }

    // Initial check
    checkNodeStatus();

    // Set up periodic check
    monitoringInterval = setInterval(checkNodeStatus, interval * 1000);
    console.log(`[Monitor] Started with interval ${interval}s`);
}

function stopNodeMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
        console.log('[Monitor] Stopped');
    }
}

async function sendNodeStatusNotification(nodeName, status, details) {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const emoji = status === 'online' ? '🟢' : '🔴';
    const statusText = status === 'online' ? '上线' : '下线';

    const markdown = `## ${emoji} 节点状态变更通知

**节点名称**: ${nodeName}
**状态**: ${statusText}
**时间**: ${now}
${details.ip ? `**IP地址**: ${details.ip}` : ''}
${details.namespace ? `**命名空间**: ${details.namespace}` : ''}

---
> Headscale 管理工具自动推送`;

    await sendWeComMarkdown(markdown);
}

app.listen(PORT, () => {
    console.log('============================================================');
    console.log('  Headscale REST API Proxy Server');
    console.log('============================================================');
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Remote: ${HEADSCALE_SERVER}`);
    console.log(`Architecture: Browser -> Local Proxy -> Headscale REST API`);
    console.log('============================================================');
    console.log('Configuration:');
    console.log(`  config.json: ${fs.existsSync(configPath) ? 'Found' : 'Not found (using defaults)'}`);
    console.log(`  To configure: Copy config.example.json to config.json`);
    console.log('============================================================');
    console.log('Available endpoints:');
    console.log('  GET  /health');
    console.log('  GET  /config');
    console.log('  POST /config');
    console.log('  GET  /api/topology      <- Real P2P topology');
    console.log('  GET  /api/user');
    console.log('  GET  /api/node');
    console.log('  GET  /api/node/:id');
    console.log('  PATCH /api/node/:id');
    console.log('  DELETE /api/node/:id');
    console.log('  GET  /api/preauthkey');
    console.log('  POST /api/preauthkey');
    console.log('  DELETE /api/preauthkey/:id');
    console.log('============================================================');
    console.log('Press Ctrl+C to stop the server');
    console.log('============================================================');

    // Auto-start node monitoring
    if (wecomConfig.enabled) {
        console.log('[Monitor] Auto-starting node monitoring...');
        startNodeMonitoring(60);
    }
});
