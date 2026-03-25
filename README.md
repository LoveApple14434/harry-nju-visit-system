# 访客预约 Demo

本地 demo，包含：
- 前台访客端：动态表单（文本、数字、选择、文件）、必填校验、提交申请
- 后台管理员端：字段配置、申请列表、审批（通过/驳回）、日历视图（已预约高亮与单位名称）
- 后端与数据库：Express + SQLite，文件本地存储

## 启动

1. 安装依赖

```bash
npm install
```

2. 启动

```bash
npm run dev
```

3. 打开页面
- 访客端: http://localhost:3000/visitor
- 管理端: http://localhost:3000/admin

## 说明
- 管理端配置会实时影响访客端字段。
- 系统默认固定必填项：`来访时间`（key 为 `visit_time`），不可删除。
- 文件上传限制为 `pdf/jpg/jpeg/png`，默认 5MB。
- 后台审批支持：
	- 通过
	- 驳回（必须输入自定义理由或选择预设理由：日期冲突、公函不合格、资料不完整、其他）
- 后台申请列表过滤支持图形化日期选择（date picker），仅按来访时间过滤。
- 日期选择支持快捷范围按钮：三天内 / 一周内 / 一月内。
- 日历视图按来访时间聚合（不是表单提交时间），并展示：
	- 总申请数
	- 已预约数（已通过审批）
	- 已预约单位名称（用于核对）

## 服务器部署

以下示例基于 Linux（Ubuntu 22.04+）、Node.js 20、Nginx、systemd。

1. 安装运行环境

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

2. 上传代码并安装依赖

```bash
cd /opt
sudo mkdir -p visit && sudo chown -R "$USER":"$USER" visit
cd /opt/visit
# 将项目代码上传到此目录（git clone / rsync / scp 均可）
npm install --omit=dev
```

3. 创建 systemd 服务

```bash
sudo tee /etc/systemd/system/visit-demo.service > /dev/null <<'EOF'
[Unit]
Description=Visit Demo Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/visit
ExecStart=/usr/bin/node apps/api/src/server.js
Restart=always
RestartSec=3
User=www-data
Group=www-data
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable visit-demo
sudo systemctl start visit-demo
sudo systemctl status visit-demo
```

4. 配置 Nginx 反向代理

```bash
sudo tee /etc/nginx/sites-available/visit-demo > /dev/null <<'EOF'
server {
	listen 80;
	server_name _;

	client_max_body_size 10m;

	location / {
		proxy_pass http://127.0.0.1:3000;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
}
EOF

sudo ln -sf /etc/nginx/sites-available/visit-demo /etc/nginx/sites-enabled/visit-demo
sudo nginx -t
sudo systemctl reload nginx
```

5. 可选：开启 HTTPS（推荐）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

6. 运维常用命令

```bash
sudo systemctl restart visit-demo
sudo journalctl -u visit-demo -f
sudo systemctl reload nginx
```
