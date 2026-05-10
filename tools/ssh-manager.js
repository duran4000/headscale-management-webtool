/**
 * SSH Manager Module
 * 使用 SSH2 库进行远程节点管理
 *
 * 功能：
 * - 检测节点存活状态
 * - 检查端口开放
 * - 检查进程运行
 * - 执行远程命令
 * - 服务启停操作
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

// 加载节点配置
const configPath = path.join(__dirname, '..', 'config', 'nodes.json');
let nodeConfig = {
    sshKeyPath: '/root/.ssh/id_ed25519',
    nodes: {}
};

if (fs.existsSync(configPath)) {
    try {
        const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        nodeConfig = {
            sshKeyPath: rawConfig.sshKeyPath || '/root/.ssh/id_ed25519',
            nodes: rawConfig.nodes || {}
        };
        console.log(`[SSH] Loaded ${Object.keys(nodeConfig.nodes).length} nodes configuration`);
    } catch (err) {
        console.error(`[SSH] Failed to load config: ${err.message}`);
    }
}

// SSH 连接池
const connections = {};

/**
 * 获取 SSH 连接
 */
function getConnection(nodeIp) {
    const nodeInfo = nodeConfig.nodes[nodeIp];
    if (!nodeInfo) {
        return Promise.reject(new Error(`Node ${nodeIp} not configured`));
    }

    return new Promise((resolve, reject) => {
        const connKey = `${nodeIp}:${nodeInfo.port}`;

        // 如果已有活跃连接，直接使用
        if (connections[connKey] && connections[connKey]._channel) {
            return resolve(connections[connKey]);
        }

        const conn = new Client();

        conn.on('ready', () => {
            console.log(`[SSH] Connected to ${nodeInfo.user}@${nodeIp}:${nodeInfo.port}`);
            connections[connKey] = conn;
            resolve(conn);
        }).on('error', (err) => {
            console.error(`[SSH] Connection error to ${nodeIp}: ${err.message}`);
            delete connections[connKey];
            reject(err);
        }).on('close', () => {
            console.log(`[SSH] Connection closed to ${nodeIp}`);
            delete connections[connKey];
        });

        const connectConfig = {
            host: nodeIp,
            port: nodeInfo.port,
            username: nodeInfo.user,
            readyTimeout: 15000,
            keepaliveInterval: 30000
        };

        // 支持密钥或密码认证
        if (nodeInfo.password) {
            connectConfig.password = nodeInfo.password;
        } else {
            connectConfig.privateKey = fs.readFileSync(nodeConfig.sshKeyPath);
        }

        conn.connect(connectConfig);
    });
}

/**
 * 执行远程命令
 */
function execCommand(nodeIp, command) {
    return new Promise((resolve, reject) => {
        getConnection(nodeIp).then(conn => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    return reject(err);
                }

                let stdout = '';
                let stderr = '';

                stream.on('close', (code, signal) => {
                    resolve({
                        code,
                        signal,
                        stdout: stdout.trim(),
                        stderr: stderr.trim()
                    });
                }).on('data', (data) => {
                    stdout += data.toString();
                }).on('err', (err) => {
                    stderr += err.toString();
                });
            });
        }).catch(reject);
    });
}

/**
 * 获取节点状态
 */
async function getNodeStatus(nodeIp) {
    const nodeInfo = nodeConfig.nodes[nodeIp];
    if (!nodeInfo) {
        return { online: false, error: 'Node not configured' };
    }

    try {
        // 先检测端口
        const portResult = await checkPort(nodeIp, nodeInfo.port);
        if (!portResult.open) {
            return { online: false, error: 'SSH port not reachable', port: nodeInfo.port };
        }

        // 执行系统命令获取状态
        let sysinfo;
        if (nodeInfo.os === 'windows') {
            sysinfo = await execCommand(nodeIp, 'systeminfo | findstr /C:"OS Name" /C:"OS Version" /C:"Host Name"');
        } else {
            sysinfo = await execCommand(nodeIp, 'echo \"HOST:\" && hostname && echo \"UPTIME:\" && uptime && echo \"LOAD:\" && cat /proc/loadavg');
        }

        return {
            online: true,
            os: nodeInfo.os,
            name: nodeInfo.name,
            sysinfo: sysinfo.stdout.substring(0, 200)
        };
    } catch (err) {
        return { online: false, error: err.message };
    }
}

/**
 * 检测端口是否开放
 */
function checkPort(nodeIp, port) {
    return new Promise((resolve) => {
        const net = require('net');
        const socket = new net.Socket();

        socket.setTimeout(5000);

        socket.on('connect', () => {
            socket.destroy();
            resolve({ ip: nodeIp, port, open: true });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ ip: nodeIp, port, open: false, error: 'timeout' });
        });

        socket.on('error', (err) => {
            socket.destroy();
            resolve({ ip: nodeIp, port, open: false, error: err.message });
        });

        socket.connect(port, nodeIp);
    });
}

/**
 * 检查服务进程状态
 */
async function checkProcess(nodeIp, processName) {
    const nodeInfo = nodeConfig.nodes[nodeIp];
    if (!nodeInfo) {
        return { found: false, error: 'Node not configured' };
    }

    // Map service names to possible process patterns
    const processPatterns = {
        'kdeconnect': ['kdeconnectd', 'kdeconnect-indicator', 'kdeconnect'],
        'syncthing': ['syncthing', 'syncthing-inotify', 'SyncthingTray']
    };

    const patterns = processPatterns[processName] || [processName];

    try {
        let found = false;
        let details = '';

        for (const pattern of patterns) {
            let result;
            if (nodeInfo.os === 'windows') {
                result = await execCommand(nodeIp, `tasklist | findstr /I "${pattern}"`);
            } else {
                result = await execCommand(nodeIp, `pgrep -f "${pattern}" || pgrep -a "${pattern}"`);
            }

            if (result.stdout.length > 0) {
                found = true;
                details = result.stdout;
                break;
            }
        }

        return {
            found,
            processName,
            details: details.substring(0, 200)
        };
    } catch (err) {
        return { found: false, error: err.message };
    }
}

/**
 * 停止服务
 */
async function stopService(nodeIp, serviceName) {
    const nodeInfo = nodeConfig.nodes[nodeIp];
    if (!nodeInfo) {
        return { success: false, error: 'Node not configured' };
    }

    try {
        let result;
        if (nodeInfo.os === 'windows') {
            result = await execCommand(nodeIp, `net stop "${serviceName}" /y`);
        } else {
            result = await execCommand(nodeIp, `systemctl stop ${serviceName} 2>/dev/null || service ${serviceName} stop`);
        }

        return {
            success: result.code === 0,
            output: result.stdout + result.stderr
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * 启动服务
 */
async function startService(nodeIp, serviceName) {
    const nodeInfo = nodeConfig.nodes[nodeIp];
    if (!nodeInfo) {
        return { success: false, error: 'Node not configured' };
    }

    try {
        let result;
        if (nodeInfo.os === 'windows') {
            result = await execCommand(nodeIp, `net start "${serviceName}"`);
        } else {
            result = await execCommand(nodeIp, `systemctl start ${serviceName} 2>/dev/null || service ${serviceName} start`);
        }

        return {
            success: result.code === 0,
            output: result.stdout + result.stderr
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * 重启服务
 */
async function restartService(nodeIp, serviceName) {
    const stopResult = await stopService(nodeIp, serviceName);
    if (!stopResult.success) {
        return { success: false, error: `Stop failed: ${stopResult.output || stopResult.error}` };
    }

    // 等待 2 秒
    await new Promise(resolve => setTimeout(resolve, 2000));

    return await startService(nodeIp, serviceName);
}

/**
 * 获取所有节点概览
 */
async function getAllNodesStatus() {
    const results = {};

    for (const [ip, info] of Object.entries(nodeConfig.nodes)) {
        results[ip] = await getNodeStatus(ip);
    }

    return results;
}

/**
 * 关闭所有连接
 */
function closeAllConnections() {
    for (const [key, conn] of Object.entries(connections)) {
        try {
            conn.end();
        } catch (e) {
            // 忽略
        }
    }
}

module.exports = {
    getConnection,
    execCommand,
    getNodeStatus,
    checkPort,
    checkProcess,
    stopService,
    startService,
    restartService,
    getAllNodesStatus,
    closeAllConnections,
    nodeConfig
};