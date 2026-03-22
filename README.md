# A Note

轻量级自托管笔记 + 任务管理工具。Markdown 编辑、四象限任务管理、实时自动保存，无需数据库。

## 功能特性

- **Markdown 笔记** — 富文本编辑器，浮动格式工具栏 + 键盘快捷键（Ctrl+B / I / K / E / D）
- **四象限任务** — 基于艾森豪威尔矩阵，按紧急/重要分类（Do / Plan / Delegate / Eliminate）
- **截止日期** — 任务可设截止日期，列表和矩阵视图中均有可视化提示
- **多页面** — 每个页面拥有独立短链，支持无限创建
- **实时保存** — 输入即保存（400ms 防抖），页面关闭前通过 Beacon API 兜底
- **冲突检测** — 基于 SHA-256 哈希的乐观锁，多设备编辑自动提示
- **深色/浅色主题** — 一键切换，偏好自动记忆
- **Markdown 导出** — 将笔记和任务导出为 `.md` 文件
- **响应式布局** — 桌面端三栏布局，移动端标签页切换
- **密码保护** — 可选的 HMAC Cookie 鉴权

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vanilla JS (ES Modules)、CSS Variables 主题系统 |
| 后端 | PHP 8.1+、文件存储（JSON + JSONL） |
| 服务器 | Apache + mod_rewrite |
| 数据库 | 无 — 纯文件系统，LOCK_EX 保证并发安全 |

## 项目结构

```
web-note/
├── index.html              # SPA 页面外壳
├── index.php               # PHP 路由控制器
├── style.css               # 全局样式（含深色主题）
├── .htaccess               # Apache URL 重写
├── lib/
│   ├── auth.php            # 鉴权模块
│   ├── data.php            # 数据读写 & 版本管理
│   └── http.php            # HTTP 工具
└── assets/scripts/
    ├── app-init.js          # 入口：事件绑定 & 初始化
    ├── core/
    │   ├── config.js        # 常量配置
    │   ├── state.js         # 全局状态
    │   ├── storage.js       # localStorage 持久化
    │   ├── api.js           # API 请求 & 保存逻辑
    │   └── actions.js       # 渲染调度
    ├── features/
    │   ├── editor.js        # 编辑器模式 & 行号
    │   ├── markdown.js      # Markdown → HTML 解析
    │   ├── markdown-toolbar.js  # 格式化工具栏
    │   ├── todos.js         # 任务增删改查
    │   ├── pages.js         # 多页面管理
    │   ├── navigation.js    # 移动端导航
    │   ├── save-status.js   # 保存状态指示
    │   └── theme.js         # 主题切换
    └── ui/
        ├── dom.js           # DOM 引用 & 工具函数
        └── render.js        # 列表 & 矩阵渲染
```

## 部署

### 环境要求

- PHP 8.1+
- Apache（启用 `mod_rewrite`）
- 对数据目录有读写权限

### 步骤

1. 将 `web-note/` 部署到 Web 服务器根目录
2. 确保 `.htaccess` 生效（`AllowOverride All`）
3. 访问根路径，自动跳转到随机新页面

### 数据存储

数据默认写入 `web-notebook-data/pages/`（与 `web-note/` 同级），结构：

```
web-notebook-data/pages/{pageId}/
├── current.json        # 当前内容
├── history.jsonl       # 变更日志
└── revisions/          # 历史快照（上限 500 份，自动清理）
```

### 环境变量（可选）

| 变量 | 说明 |
|---|---|
| `WEB_NOTE_DATA_ROOT` | 自定义数据存储路径 |
| `WEB_NOTE_ACCESS_PASSWORD_HASH` | bcrypt 密码哈希（推荐） |
| `WEB_NOTE_ACCESS_PASSWORD` | 明文密码（不推荐） |

## API

| 端点 | 方法 | 说明 |
|---|---|---|
| `/` | GET | 跳转到新页面 |
| `/{pageId}` | GET | 加载页面 |
| `/api/pages` | GET | 列出所有页面 |
| `/api/pages/{pageId}` | GET | 获取笔记 + 任务 + 哈希 |
| `/api/pages/{pageId}/save` | POST | 保存（含冲突检测） |
| `/api/pages/{pageId}/delete` | POST | 软删除（移入 .trash） |
| `/auth/login` | POST | 登录 |
| `/auth/logout` | POST | 登出 |

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl/⌘ + S` | 立即保存 |
| `Ctrl/⌘ + B` | 粗体 |
| `Ctrl/⌘ + I` | 斜体 |
| `Ctrl/⌘ + K` | 插入链接 |
| `Ctrl/⌘ + E` | 行内代码 |
| `Ctrl/⌘ + D` | 删除线 |
| `N` / `/` | 聚焦任务输入框（非编辑状态） |
| `Tab` | 插入两个空格（编辑器内） |

## 许可证

MIT
