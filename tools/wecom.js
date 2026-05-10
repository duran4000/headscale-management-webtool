/**
 * 企业微信推送模块
 * 移植自 wecom.py
 */

const axios = require('axios');

// 默认配置（示例）
const DEFAULT_CONFIG = {
    companyId: '',
    appId: '',
    appSecret: '',
    enabled: false
};

class WeComManager {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.accessToken = null;
        this.tokenExpireTime = 0;
    }

    /**
     * 更新配置
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.accessToken = null; // 清除缓存的 token
        console.log('[WeCom] Config updated, enabled:', this.config.enabled);
    }

    /**
     * 获取配置
     */
    getConfig() {
        return { ...this.config, appSecret: '******' }; // 隐藏密钥
    }

    /**
     * 是否启用
     */
    isEnabled() {
        return this.config.enabled && this.config.companyId && this.config.appSecret;
    }

    /**
     * 获取 access_token
     */
    async getAccessToken() {
        // 检查缓存的 token 是否有效
        if (this.accessToken && Date.now() < this.tokenExpireTime) {
            return this.accessToken;
        }

        if (!this.config.companyId || !this.config.appSecret) {
            console.error('[WeCom] Missing companyId or appSecret');
            return null;
        }

        const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.companyId}&corpsecret=${this.config.appSecret}`;

        try {
            const response = await axios.get(url, { timeout: 10000 });
            const result = response.data;

            if (result.access_token) {
                this.accessToken = result.access_token;
                // token 有效期 7200 秒，提前 5 分钟过期
                this.tokenExpireTime = Date.now() + (result.expires_in - 300) * 1000;
                console.log('[WeCom] Access token obtained');
                return this.accessToken;
            } else {
                console.error('[WeCom] Failed to get access token:', result);
                return null;
            }
        } catch (error) {
            console.error('[WeCom] Error getting access token:', error.message);
            return null;
        }
    }

    /**
     * 发送文本消息
     */
    async sendText(text, touser = '@all') {
        if (!this.isEnabled()) {
            console.warn('[WeCom] Not enabled or not configured');
            return { success: false, error: 'Not enabled' };
        }

        const accessToken = await this.getAccessToken();
        if (!accessToken) {
            return { success: false, error: 'Failed to get access token' };
        }

        const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;
        const data = {
            touser: touser,
            agentid: this.config.appId,
            msgtype: 'text',
            text: { content: text },
            duplicate_check_interval: 600
        };

        try {
            const response = await axios.post(url, data, { timeout: 10000 });
            const result = response.data;

            if (result.errcode === 0) {
                console.log('[WeCom] Text sent successfully');
                return { success: true };
            } else {
                console.error('[WeCom] Failed to send text:', result);
                return { success: false, error: result.errmsg };
            }
        } catch (error) {
            console.error('[WeCom] Error sending text:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 发送 Markdown 消息
     */
    async sendMarkdown(text, touser = '@all') {
        if (!this.isEnabled()) {
            console.warn('[WeCom] Not enabled or not configured');
            return { success: false, error: 'Not enabled' };
        }

        const accessToken = await this.getAccessToken();
        if (!accessToken) {
            return { success: false, error: 'Failed to get access token' };
        }

        const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;
        const data = {
            touser: touser,
            agentid: this.config.appId,
            msgtype: 'markdown',
            markdown: { content: text },
            duplicate_check_interval: 600
        };

        try {
            const response = await axios.post(url, data, { timeout: 10000 });
            const result = response.data;

            if (result.errcode === 0) {
                console.log('[WeCom] Markdown sent successfully');
                return { success: true };
            } else {
                console.error('[WeCom] Failed to send markdown:', result);
                return { success: false, error: result.errmsg };
            }
        } catch (error) {
            console.error('[WeCom] Error sending markdown:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 发送节点状态变更通知
     */
    async sendNodeStatusNotification(nodeName, status, details = {}) {
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

        return await this.sendMarkdown(markdown);
    }

    /**
     * 发送测试消息
     */
    async sendTest() {
        const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        return await this.sendMarkdown(`## 🧪 测试消息\n\n这是一条测试消息，用于验证企业微信推送功能。\n\n**发送时间**: ${now}\n\n> Headscale 管理工具`);
    }
}

// 导出单例
const wecomManager = new WeComManager();

module.exports = {
    WeComManager,
    wecomManager,
    sendText: (text, touser) => wecomManager.sendText(text, touser),
    sendMarkdown: (text, touser) => wecomManager.sendMarkdown(text, touser),
    sendNodeStatusNotification: (nodeName, status, details) =>
        wecomManager.sendNodeStatusNotification(nodeName, status, details)
};
