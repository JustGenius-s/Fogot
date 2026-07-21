# Fogot Engine

<p align="center">
  <a href="https://godotengine.org">
    <img src="misc/logo/logo_outlined.svg" width="400" alt="Fogot Engine logo">
  </a>
</p>

## AI-Powered 2D Game Editor

**Fogot Engine** 是基于 [Godot Engine 4.7](https://godotengine.org) 的 fork，在编辑器中集成了 AI 助手面板，采用 **C++ WebView + React** 的混合架构，为 2D 游戏开发提供智能辅助能力。

### 核心能力

- **多模型对话**：支持 OpenAI / Anthropic / Google 及 OpenAI 兼容协议，流式输出、推理展示
- **多 Agent 编排**：主 Agent + Explorer / Coder 子 Agent，通过 `delegate_task` 隔离上下文执行子任务
- **计划模式**：先规划后执行，逐步可审阅
- **设计模式**：以 YAML frontmatter 编写设计文档与 Bible，生成 Kinds，统一项目设定
- **场景操作**：节点增删改、属性读写、信号连接、Skeleton2D 骨骼
- **资产生成**：AI 图像生成（img2img、分辨率 / 质量配置）与资产画廊（搜索、目录分组）
- **音频生成**：语音设计 / 克隆、语音与音乐生成
- **技能系统**：可加载 / 切换的 AI 技能包
- **上下文管理**：预算控制与自动压缩，长会话稳定
- **Question / Todo Dock**：向用户提问、跟踪待办

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
| AI 前端 | React 19, TypeScript 6, Vite 8 |
| AI SDK | Vercel AI SDK 6（`@ai-sdk/openai`、`@ai-sdk/anthropic`、`@ai-sdk/google`、`@ai-sdk/openai-compatible`） |
| 聊天 UI | `@assistant-ui/react`, shadcn/ui, Radix UI |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS 4 |
| 数据格式 | YAML（设计文档 / Bible）、Zod（schema 校验） |
| WebView | macOS: WKWebView / Windows: WebView2 (Edge Chromium) |

## 项目结构

```
editor/ai/
├── docks/              # AIChatDock — WebView 宿主与 JS↔C++ 桥接
├── shared/             # C++ 侧共享工具函数
├── tools/              # C++ Tool RPC 实现（按分类拆分）
│   ├── ai_tool_files.cpp           # 文件操作
│   ├── ai_tool_scene.cpp           # 场景 / 节点 / 骨骼
│   ├── ai_tool_editor.cpp          # 编辑器动作
│   ├── ai_tool_design.cpp          # 设计文档
│   ├── ai_tool_shell.cpp           # shell 命令
│   └── ai_tool_rpc.h               # RPC 分发
├── web/                # EditorWebView 平台抽象层
│   ├── editor_web_view_macos.mm      # macOS WKWebView 实现
│   └── editor_web_view_windows.cpp   # Windows WebView2 实现
└── chat-ui/            # React 前端应用
    └── src/
        ├── ai/         # Agent 定义、工具声明、上下文管理、技能系统
        │   ├── agents.ts           # Agent 配置与提示词装配
        │   ├── tools.ts            # 工具 barrel 与 allTools 集合
        │   ├── tools/              # 工具实现（files, scene, image, image-read,
        │   │                       #   docs, delegate, plan, skill, design, kinds,
        │   │                       #   audio, question）
        │   ├── prompts/            # Markdown 模块化系统提示词
        │   │   ├── default.md          # 主 Agent
        │   │   ├── plan.md             # 计划模式
        │   │   ├── design.md           # 设计模式
        │   │   ├── subagent-explore.md # 探索子 Agent
        │   │   └── subagent-coder.md   # 编码子 Agent
        │   ├── context-manager.ts  # 对话上下文管理
        │   ├── context-budget.ts   # 上下文预算
        │   ├── compaction.ts       # 上下文压缩
        │   ├── mentions.ts         # @ 引用（节点/脚本/场景）
        │   ├── skills.ts           # 技能加载与切换
        │   ├── image-model-store.ts / image-transport.ts
        │   └── question-store.ts   # ask_user 问题状态
        ├── components/ # UI 组件
        │   ├── assistant-ui/       # AI 聊天核心（thread、reasoning、markdown、mention/mode/model 选择器、子 Agent 线程…）
        │   ├── custom/             # 自定义工具渲染 UI（含 question-dock、todo-dock）
        │   ├── assets/             # 资产生成 / 画廊 / 设计 Bible / Kinds / 音频
        │   └── ui/                 # shadcn/ui 基础组件
        ├── lib/        # 工具函数、线程存储、模型目录与 provider 注册、图像/音频生成、设计 schema、i18n
        ├── bridge.ts   # C++↔JS 桥接协议
        └── App.tsx     # 应用入口
```

### Agent 与模式

主 Agent 按模式切换短身份声明 + 工具白名单（行为约束写在 tool description）：

| Agent / 模式 | 职责 |
|------|------|
| **主 Agent** | 通用对话与工具调度，可选注入技能列表 |
| **计划模式** (`plan`) | 只读探索并产出计划，`exit_plan_mode` / `ask_user` |
| **设计模式** (`design`) | 编写 / 同步设计文档与 Bible，生成 Kinds |
| **Explorer 子 Agent** | 只读、快速、彻底地搜索与浏览项目文件 |
| **Coder 子 Agent** | 跨多文件实施代码改动 |

子 Agent 通过 `delegate_task` 委派，支持子线程管理与隔离上下文。

### AI 工具清单

AI 可通过 RPC 调用以下工具操作项目：

| 分类 | 工具 | 功能 |
|------|------|------|
| **文件操作** | `read_file` / `write_file` | 读取 / 写入项目文件 |
| | `edit_file` | 字符串替换式精确编辑 |
| | `list_files` / `search_files` | 目录浏览 / 文本搜索 |
| | `delete_file` / `copy_file` / `move_file` | 删除 / 复制 / 移动文件 |
| | `execute_command` | 执行 shell 命令 |
| **场景管理** | `scene_list_nodes` / `scene_get_node` | 列出 / 查询节点 |
| | `scene_create_node` / `scene_delete_node` | 创建 / 删除节点 |
| | `scene_set_property` | 读写节点属性 |
| | `scene_reparent_node` / `scene_move_child` | 调整节点层级 / 排序 |
| | `scene_call_method` / `scene_connect_signal` | 调用方法 / 连接信号 |
| | `scene_instance_scene` | 实例化场景 |
| | `scene_run` / `scene_open` | 运行 / 打开场景 |
| | `scene_get_skeleton2d_data` / `scene_set_bone2d_rest` | Skeleton2D 骨骼数据 |
| **图像处理** | `read_image` | 读取图像并转为多模态内容（自动压缩） |
| | `generate_image` | AI 图像生成（img2img、分辨率 / 质量配置） |
| | `crop_image` / `get_image_info` | 裁剪 / 读取图像元信息 |
| **音频** | `design_voice` / `clone_voice` | 设计 / 克隆语音 |
| | `generate_speech` / `generate_music` | 生成语音 / 音乐 |
| | `list_voices` | 列出可用音色 |
| **知识与调试** | `get_class_docs` / `scene_get_class_docs` | 查阅 GDScript 类文档 |
| | `get_debugger_errors` / `get_script_errors` | 获取调试器 / 脚本错误 |
| **设计** | `write_design` / `sync_design` | 编写 / 同步设计文档（带 frontmatter 校验） |
| | `write_kind` / `list_kinds` | 编写 / 列出 Kinds |
| **编排** | `delegate_task` | 委派子 Agent（Explorer / Coder）执行子任务 |
| | `exit_plan_mode` / `update_plan` | 计划模式控制 |
| **交互** | `ask_user` | 向用户提问（Question Dock） |
| **技能** | `use_skill` | 加载 / 切换 AI 技能 |

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
pnpm install
pnpm run build:fast    # 产出单文件 dist/index.html
```

### 4. 开发模式（热重载）

```bash
# 终端 1：启动 Vite 开发服务器
cd editor/ai/chat-ui && pnpm run dev

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
