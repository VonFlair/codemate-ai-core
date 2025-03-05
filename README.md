# CodeMate AI Core 
Judson Feng 独立开发的 AI 代码助手  
**AGPL-3.0-only (带 Commercial Exception)**

## 简体中文

### 简介
CodeMate AI Core 是专为开发者打造的智能代码生成工具，集成 **DeepSeek-chat** 模型，结合上下文感知与文本分析能力，为你带来高效且精准的代码补全与对话式开发体验。

### 主要特性
- **智能上下文感知**  
  自动读取光标附近代码，并结合语言类型，为你生成合适的代码补全。
- **多语言支持**  
  适配 Python、JavaScript、TypeScript、Java 等常见语言场景。
- **高性价比**  
  提供本地缓存策略，减少不必要的 API 调用，显著降低成本。
- **实时反馈**  
  VS Code 状态栏显示生成进度，随时可撤销与重做。

### 安装与使用

#### 1. 安装
 1. 从 [GitHub Releases](https://github.com/codemate-ai-core/releases/codemate-ai-core-1.0.1.vsix) 下载最新的 `.vsix` 文件，使用以下命令行安装：  
   ```bash
   code --install-extension codemate-ai-core-1.0.x.vsix --force
   ```
2. 重启 VS Code 完成插件加载。

#### 2. 配置
1. 在 VS Code 设置（Settings）中搜索 `codemate.apiKey` 并填入你的 DeepSeek API 密钥。  
2. 若需自定义生成温度、超时时间等，请在设置中调整 `codemate.temperature` 与 `codemate.timeout`。

#### 3. 快速上手
- **AI 补全**：编辑器内使用命令面板执行 `CodeMate: AI Chat`。插件会获取你的上下文，并生成候选代码，询问你是否插入到当前光标处。  
- **更新记录面板**：执行命令 `CodeMate: showUpdateHistory` 或 `Ctrl + Alt + U` 打开记录面板，一键撤销或重做。  

### 常见问题
1. **为什么插入的代码与预期不一致？**  
   请确认上下文是否充足，并检查 `codemate.temperature` 是否设置过高导致生成结果偏发散。  
2. **发生网络或超时错误**  
   确保网络稳定并检查 `codemate.timeout` 值


### 许可证
本项目实际使用的许可证是：  
**AGPL-3.0-only**（带 Commercial Exception），允许在特定商业场景中使用，详情请见 [LICENSE](license) 文件。  

---

## English

### Introduction
CodeMate AI Core is an intelligent code generation plugin for developers, powered by the **DeepSeek-R1** large language model. It provides context-aware code completions and interactive conversation features, helping you code faster and more efficiently.

### Key Features
- **Context Awareness**  
  Analyzes the text around your cursor and the active programming language to produce relevant completion suggestions.
- **Multi-Language Support**  
  Optimized for Python, JavaScript, TypeScript, Java, and more.
- **DeepSeek-R1 Powered**  
  Handles up to 64K tokens in context, making it suitable for large-scale projects.
- **Cost-Effective**  
  Built-in caching strategy reduces unnecessary API calls, effectively cutting down overall expenses.
- **Real-Time Feedback**  
  Visual indicators in the VS Code status bar and an interactive confirmation flow for inserting code, plus undo/redo history tracking.

### Installation & Usage

#### 1. Install
1. Download the latest `.vsix` file from the [GitHub Releases](https://github.com/codemate-ai-core/releases/codemate-ai-core-1.0.1.vsix) page and install it via command line:
   ```bash
   code --install-extension codemate-ai-core-1.0.x.vsix --force
   ```
2. Reload/Restart VS Code to activate the extension.

#### 2. Configuration
1. In VS Code settings, search for `codemate.apiKey` and insert your DeepSeek API key.  
2. Adjust `codemate.temperature` and `codemate.timeout` as needed to customize generation behavior.

#### 3. Quick Start
- **AI Completion**: Run the `CodeMate: AI Chat` command. The plugin fetches your current context, generates suggestions, and asks if you’d like to insert them at the cursor.  
- **Update History Panel**: Run `CodeMate: showUpdateHistory` to open a panel listing all code insertions. You can easily undo or redo them.

### FAQ
1. **Why do generated snippets differ from what I expected?**  
   Ensure there is sufficient context around your cursor, and verify if you set `codemate.temperature` too high, leading to more creative but less predictable results.  
2. **Network or timeout errors**  
   Make sure your network is stable and check the `codemate.timeout` setting. See our [Troubleshooting Docs](https://codemate.dev/docs/troubleshooting) for more details.


### License
This project is licensed under:  
**AGPL-3.0-only with a Commercial Exception**, which permits usage in specific commercial scenarios.  
For detailed terms, please see the [LICENSE](license) file.  

