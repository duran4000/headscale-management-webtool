import json
import requests
import base64
import os
import time
import threading
import logging
from db_manager import DBManager

logger = logging.getLogger("WeComManager")

DEFAULT_WECOM_CONFIG = {
    'company_id': 'ww0da7881136f24b78',
    'app_id': '1000002',
    'app_secret': 'c-dq_5Uc-bABOACgwc2pM812NB3e_9-DD-hAtrEBzVo',
    'enabled': True
}

class WeComManager:
    def __init__(self, db_path=None):
        self.db_mgr = DBManager(db_path) if db_path else DBManager()
        self.config = self._load_config()
        self._poll_thread = None
        self._poll_running = False
        self._message_handlers = {}
        self._last_msg_id = None
        
    def _load_config(self):
        config = self.db_mgr.execute_query(
            "SELECT company_id, app_id, app_secret, enabled FROM wecom_config WHERE id = 1",
            fetch_one=True
        )
        if config and config[0]:
            return {
                'company_id': config[0],
                'app_id': config[1],
                'app_secret': config[2],
                'enabled': bool(config[3])
            }
        
        if config and not config[0]:
            self._save_default_config()
            return DEFAULT_WECOM_CONFIG.copy()
        
        return DEFAULT_WECOM_CONFIG.copy()
    
    def _save_default_config(self):
        self.db_mgr.execute_query(
            """INSERT OR REPLACE INTO wecom_config (id, company_id, app_id, app_secret, enabled)
               VALUES (1, ?, ?, ?, ?)""",
            (DEFAULT_WECOM_CONFIG['company_id'], 
             DEFAULT_WECOM_CONFIG['app_id'], 
             DEFAULT_WECOM_CONFIG['app_secret'], 
             int(DEFAULT_WECOM_CONFIG['enabled'])),
            commit=True
        )
    
    def save_config(self, company_id, app_id, app_secret, enabled=True):
        self.db_mgr.execute_query(
            """INSERT OR REPLACE INTO wecom_config (id, company_id, app_id, app_secret, enabled)
               VALUES (1, ?, ?, ?, ?)""",
            (company_id, app_id, app_secret, int(enabled)),
            commit=True
        )
        self.config = {
            'company_id': company_id,
            'app_id': app_id,
            'app_secret': app_secret,
            'enabled': enabled
        }
        
    def is_enabled(self):
        return self.config and self.config.get('enabled', False)
    
    def _get_access_token(self):
        if not self.config:
            logger.error("WeCom config not set")
            return None
            
        url = f"https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid={self.config['company_id']}&corpsecret={self.config['app_secret']}"
        try:
            response = requests.get(url, timeout=10)
            result = response.json()
            access_token = result.get('access_token')
            if access_token:
                return access_token
            else:
                logger.error(f"Failed to get access token: {result}")
                return None
        except Exception as e:
            logger.error(f"Error getting access token: {e}")
            return None
    
    def send_text(self, text, touser='@all'):
        if not self.is_enabled():
            logger.warning("WeCom is not enabled")
            return False
            
        access_token = self._get_access_token()
        if not access_token:
            return False
            
        url = f"https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={access_token}"
        data = {
            "touser": touser,
            "agentid": self.config['app_id'],
            "msgtype": "text",
            "text": {"content": text},
            "duplicate_check_interval": 600
        }
        try:
            response = requests.post(url, data=json.dumps(data), timeout=10)
            result = response.json()
            if result.get('errcode') == 0:
                logger.info(f"Text sent successfully: {text[:50]}...")
                return True
            else:
                logger.error(f"Failed to send text: {result}")
                return False
        except Exception as e:
            logger.error(f"Error sending text: {e}")
            return False
    
    def send_image(self, image_path, touser='@all'):
        if not self.is_enabled():
            logger.warning("WeCom is not enabled")
            return False
            
        if not os.path.exists(image_path):
            logger.error(f"Image file not found: {image_path}")
            return False
            
        access_token = self._get_access_token()
        if not access_token:
            return False
        
        try:
            with open(image_path, 'rb') as f:
                image_data = f.read()
            
            upload_url = f"https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token={access_token}&type=image"
            upload_response = requests.post(upload_url, files={"picture": image_data}, timeout=30)
            upload_result = upload_response.json()
            
            if 'media_id' not in upload_result:
                logger.error(f"Failed to upload image: {upload_result}")
                return False
            
            media_id = upload_result['media_id']
            send_url = f"https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={access_token}"
            data = {
                "touser": touser,
                "agentid": self.config['app_id'],
                "msgtype": "image",
                "image": {"media_id": media_id},
                "duplicate_check_interval": 600
            }
            response = requests.post(send_url, data=json.dumps(data), timeout=10)
            result = response.json()
            if result.get('errcode') == 0:
                logger.info(f"Image sent successfully: {image_path}")
                return True
            else:
                logger.error(f"Failed to send image: {result}")
                return False
        except Exception as e:
            logger.error(f"Error sending image: {e}")
            return False
    
    def send_markdown(self, text, touser='@all'):
        if not self.is_enabled():
            logger.warning("WeCom is not enabled")
            return False
            
        access_token = self._get_access_token()
        if not access_token:
            return False
            
        url = f"https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={access_token}"
        data = {
            "touser": touser,
            "agentid": self.config['app_id'],
            "msgtype": "markdown",
            "markdown": {"content": text},
            "duplicate_check_interval": 600
        }
        try:
            response = requests.post(url, data=json.dumps(data), timeout=10)
            result = response.json()
            if result.get('errcode') == 0:
                logger.info(f"Markdown sent successfully")
                return True
            else:
                logger.error(f"Failed to send markdown: {result}")
                return False
        except Exception as e:
            logger.error(f"Error sending markdown: {e}")
            return False
    
    def _svg_to_png(self, svg_file, output_png):
        try:
            from PIL import Image
            import io
            import cairosvg
            
            cairosvg.svg2png(url=svg_file, write_to=output_png, scale=2)
            logger.info(f"SVG converted to PNG: {output_png}")
            return True
        except ImportError:
            logger.warning("cairosvg not installed, trying online API...")
            return self._svg_to_png_online(svg_file, output_png)
        except Exception as e:
            logger.error(f"Error converting SVG to PNG: {e}")
            return self._svg_to_png_online(svg_file, output_png)
    
    def _svg_to_png_online(self, svg_file, output_png):
        try:
            with open(svg_file, 'r', encoding='utf-8') as f:
                svg_content = f.read()
            
            import base64
            encoded = base64.b64encode(svg_content.encode('utf-8')).decode('ascii')
            
            url = f"https://svg2png.com/api/convert"
            response = requests.post(url, json={"svg": svg_content}, timeout=30)
            
            if response.status_code == 200:
                with open(output_png, 'wb') as f:
                    f.write(response.content)
                logger.info(f"SVG converted to PNG via online API: {output_png}")
                return True
            else:
                logger.error(f"Online API failed: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Error using online API: {e}")
            return False
    
    def send_topo_image(self, image_path, network_name, touser='@all'):
        return self.send_image(image_path, touser)
    
    def send_topo_from_mermaid(self, mermaid_file, network_name, touser='@all'):
        """
        发送拓扑图到企业微信
        优先使用已生成的 SVG/PNG 文件，避免重复转换
        只发送图片，不发送额外的文本消息
        """
        base_path = mermaid_file.replace('.md', '')
        topo_dir = os.path.dirname(mermaid_file)
        base_name = os.path.basename(base_path)
        
        png_files = [f for f in os.listdir(topo_dir) if f.startswith(base_name) and f.endswith('.png')]
        svg_files = [f for f in os.listdir(topo_dir) if f.startswith(base_name) and f.endswith('.svg')]
        
        if png_files:
            png_file = os.path.join(topo_dir, png_files[0])
            logger.info(f"Using existing PNG: {png_file}")
            return self.send_image(png_file, touser)
        
        if svg_files:
            svg_file = os.path.join(topo_dir, svg_files[0])
            png_file = svg_file.replace('.svg', '_converted.png')
            logger.info(f"Converting SVG to PNG: {svg_file}")
            if self._svg_to_png(svg_file, png_file):
                return self.send_image(png_file, touser)
        
        logger.warning("No PNG/SVG found, sending as markdown")
        return self.send_topo_mermaid(mermaid_file, network_name, touser)
    
    def send_topo_mermaid_as_image(self, mermaid_file, network_name, touser='@all'):
        return self.send_topo_from_mermaid(mermaid_file, network_name, touser)
    
    def send_topo_mermaid(self, mermaid_file, network_name, touser='@all'):
        if not os.path.exists(mermaid_file):
            logger.error(f"Mermaid file not found: {mermaid_file}")
            return False
            
        try:
            with open(mermaid_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            header = f"**网络拓扑图: {network_name}**\n> 生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            full_content = header + content
            
            if len(full_content) > 4096:
                full_content = full_content[:4090] + "...\n```"
            
            return self.send_markdown(full_content, touser)
        except Exception as e:
            logger.error(f"Error sending mermaid: {e}")
            return False
    
    def get_messages(self):
        access_token = self._get_access_token()
        if not access_token:
            return []
        
        url = f"https://qyapi.weixin.qq.com/cgi-bin/message/get?access_token={access_token}"
        try:
            params = {"type": "text"}
            if self._last_msg_id:
                params["msgid"] = self._last_msg_id
            
            response = requests.get(url, params=params, timeout=10)
            
            if not response.text:
                return []
            
            try:
                result = response.json()
            except Exception as json_err:
                logger.debug(f"Response not JSON: {response.text[:200]}")
                return []
            
            if result.get('errcode') == 0:
                messages = result.get('msglist', [])
                if messages:
                    self._last_msg_id = messages[0].get('msgid')
                return messages
            elif result.get('errcode') == 45009:
                logger.warning("Message polling not enabled or API limit reached")
                return []
            else:
                logger.debug(f"Message API returned: {result}")
                return []
        except Exception as e:
            logger.error(f"Error getting messages: {e}")
            return []
    
    def register_handler(self, command, handler):
        self._message_handlers[command.lower()] = handler
    
    def _process_message(self, msg):
        content = msg.get('content', '').strip()
        sender = msg.get('from', '')
        
        if not content:
            return
        
        parts = content.split(maxsplit=1)
        command = parts[0].lower()
        args = parts[1] if len(parts) > 1 else ''
        
        handler = self._message_handlers.get(command)
        if handler:
            try:
                result = handler(args, sender)
                if result:
                    self.send_text(result, sender)
            except Exception as e:
                logger.error(f"Error handling command '{command}': {e}")
                self.send_text(f"执行命令 '{command}' 时出错: {e}", sender)
    
    def _poll_loop(self, interval=10):
        logger.warning("企业微信不支持主动轮询获取消息，请配置回调URL接收消息")
        self._poll_running = False
    
    def start_polling(self, interval=10):
        logger.warning("企业微信不支持主动轮询获取消息")
        logger.info("如需接收消息，请在企业微信后台配置消息回调URL")
        return False
    
    def stop_polling(self):
        self._poll_running = False
        if self._poll_thread:
            self._poll_thread.join(timeout=5)
            self._poll_thread = None
        logger.info("Stopped WeCom message polling")


wecom_manager = WeComManager()

def send_message(msg):
    return wecom_manager.send_text(msg)

def send_image(image_path):
    return wecom_manager.send_image(image_path)

def send_markdown(text):
    return wecom_manager.send_markdown(text)

if __name__ == '__main__':
    import sys
    msg = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else "推送测试\n测试换行"
    print(send_message(msg))
