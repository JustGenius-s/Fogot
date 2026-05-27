# Fogot Engine

<p align="center">
  <a href="https://godotengine.org">
    <img src="misc/logo/logo_outlined.svg" width="400" alt="Fogot Engine logo">
  </a>
</p>

## AI-Powered 2D Game Editor

**Fogot Engine** 是基于 [Godot Engine 4.7](https://godotengine.org) 的 fork，在编辑器中集成了 AI 助手面板，采用 **C++ WebView + React** 的混合架构，为 2D 游戏开发提供智能辅助能力（GDScript 编写、精灵处理、动画生成等）。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│  Godot Editor (C++)                                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │ AIChatDock (EditorDock)                            │  │
│  │  └─ EditorWebView (原生 WebView 控件)              │  │
│  └───────────────────────────────────────────────────┘  │
│         ↕ fogot:// scheme / messageHandlers             │
│  ┌───────────────────────────────────────────────────┐  │
│  │ React App (fogot-chat-ui)                          │  │
│  │  - Vercel AI SDK + assistant-ui                    │  │
│  │  - LLM 流式对话、多 Agent 编排                      │  │
│  │  - Tool RPC → C++ 文件/命令操作                     │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 分层设计

| 层级 | 职责 | 技术 |
|------|------|------|
| **C++ 宿主层** | WebView 托管、Tool RPC 分发、编辑器动作 | Godot EditorDock, WKWebView / WebView2 |
| **桥接层** | JS↔C++ 双向通信协议 | `fogot://` scheme, `postMessage` |
| **前端智能层** | LLM 对话、Agent 逻辑、UI 渲染 | React, Vercel AI SDK, assistant-ui |

## 技术栈

| 组件 | 技术 |
|------|------|
| 引擎基座 | Godot 4.7 beta, C++, SCons |
| AI 前端 | React 18, TypeScript, Vite 6 |
| AI SDK | Vercel AI SDK 6, `@ai-sdk/openai-compatible` |
| 聊天 UI | `@assistant-ui/react`, shadcn/ui |
| 样式 | Tailwind CSS 4 |
| WebView | macOS: WKWebView / Windows: WebView2 (Edge Chromium) |

## 项目结构

```
editor/ai/
├── docks/              # AIChatDock — WebView 宿主与 JS↔C++ 桥接
├── tools/              # C++ Tool RPC 实现（文件读写、搜索、命令执行等）
├── web/                # EditorWebView 平台抽象层
│   ├── editor_web_view_macos.mm      # macOS WKWebView 实现
│   └── editor_web_view_windows.cpp   # Windows WebView2 实现
└── chat-ui/            # React 前端应用
    └── src/
        ├── ai/         # Agent 定义与工具声明
        ├── components/ # UI 组件（shadcn + 自定义）
        ├── lib/        # 工具函数与线程存储
        ├── bridge.ts   # C++↔JS 桥接协议
        └── App.tsx     # 应用入口
```

### C++ Tool RPC

AI 可通过 RPC 调用以下工具操作项目文件：

| 工具 | 功能 |
|------|------|
| `read_file` | 读取项目文件 |
| `write_file` | 写入文件 |
| `edit_file` | 字符串替换式编辑 |
| `list_files` | 列出目录内容 |
| `delete_file` | 删除文件 |
| `copy_file` / `move_file` | 复制 / 移动文件 |
| `search_files` | 文本搜索 |
| `execute_command` | 执行 shell 命令 |

## 构建

### 1. 安装依赖

```bash
pip install scons

# Windows 额外依赖
python misc/scripts/install_d3d12_sdk_windows.py
python misc/scripts/install_accesskit.py
python misc/scripts/install_webview2_sdk.py
```

Windows 需要 [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)（C++ 桌面开发工作负载 + Windows SDK）。

### 2. 编译引擎

```bash
# 需要 Python 3.9+、SCons 4.4+、平台对应工具链
scons platform=<platform> target=editor
```

### 3. 构建 AI Chat UI

```bash
cd editor/ai/chat-ui
npm install
npm run build:fast    # 产出单文件 dist/index.html
```

### 4. 开发模式（热重载）

```bash
# 终端 1：启动 Vite 开发服务器
cd editor/ai/chat-ui && npm run dev

# 终端 2：设置环境变量后启动编辑器
# macOS / Linux
FOGOT_AI_DEV=1 ./bin/godot.macos.editor.arm64

# Windows (PowerShell)
$env:FOGOT_AI_DEV=1; .\bin\godot.windows.editor.x86_64.console.exe
```

开发模式下 WebView 加载 `http://127.0.0.1:5173`，支持热重载。

## 平台支持

| 平台 | WebView 状态 |
|------|--------------|
| macOS | ✅ 已实现 (WKWebView) |
| Windows | ✅ 已实现 (WebView2 / Edge Chromium) |
| Linux | 🚧 计划中 (WebKitGTK) |

## 基于 Godot Engine

本项目基于 [Godot Engine](https://godotengine.org) 开发，Godot 是一个功能完善的跨平台游戏引擎，采用 [MIT 许可证](https://godotengine.org/license) 开源。

编译说明与平台支持详见 [Godot 官方文档](https://docs.godotengine.org/en/latest/engine_details/development/compiling)。
