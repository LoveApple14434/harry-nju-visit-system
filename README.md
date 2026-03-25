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
- 文件上传限制为 `pdf/jpg/jpeg/png`，默认 5MB。
- 后台审批支持：
	- 通过
	- 驳回（必须输入自定义理由或选择预设理由：日期冲突、公函不合格、资料不完整、其他）
- 日历视图按申请创建日期聚合，并展示：
	- 总申请数
	- 已预约数（已通过审批）
	- 已预约单位名称（用于核对）

## Git 开发流程

1. 初始化（首次）

```bash
git init
git add .
git commit -m "chore: bootstrap visit demo"
```

2. 日常开发建议

```bash
git checkout -b feature/<name>
git add .
git commit -m "feat: <change summary>"
git log --oneline --decorate -n 10
```
