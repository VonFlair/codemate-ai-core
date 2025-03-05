import fetch from 'node-fetch';
import * as vscode from 'vscode';

interface APIError {
    error?: {
        message?: string;
    };
}

interface APIResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

// ----------------------- 全局更新记录与撤销/重做 -----------------------
interface UpdateRecord {
    id: number;
    type: "aiComplete" | "aiChat";
    range: vscode.Range;
    content: string;
    timestamp: Date;
}

let updateHistory: UpdateRecord[] = [];
let undoStack: UpdateRecord[] = [];
let redoStack: UpdateRecord[] = [];
let updateRecordId = 1;

// ----------------------- 生成代码预览清理 -----------------------
// 去掉所有 ``` 或 ```python 标记（无论出现在开头、中间或结尾）
function cleanCode(content: string): string {
    return content.replace(/```\w*\s*/g, '').trim();
}

// ----------------------- 扩展入口 -----------------------
export function activate(context: vscode.ExtensionContext) {

    // 注册 AI 代码补全命令
    context.subscriptions.push(vscode.commands.registerCommand('codemate.aiComplete', async () => {
        console.log('[CodeMate] AI Complete command triggered.');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请先打开代码文件');
            return;
        }
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBar.text = '$(sync~spin) AI 正在生成代码...';
        statusBar.show();

        try {
            const config = vscode.workspace.getConfiguration('codemate');
            const apiKey = config.get<string>('apiKey');
            if (!apiKey) {
                throw new Error('请在设置中配置 API 密钥 (codemate.apiKey)');
            }

            // 构建上下文：取光标前 5 行代码
            const doc = editor.document;
            const cursorPos = editor.selection.active;
            const startPos = new vscode.Position(Math.max(0, cursorPos.line - 5), 0);
            const codeContext = doc.getText(new vscode.Range(startPos, cursorPos));
            
            // 调用 AI 接口（先使用 deepseek-reasoner，超时后降级 deepseek-chat）
            const completion = await getAICompletion({
                apiKey,
                code: codeContext,
                language: doc.languageId
            });
            
            // 预览并确认插入（预览前清除 Markdown 标记）
            const cleaned = cleanCode(completion);
            await previewAndConfirm(editor, cleaned, "aiComplete");
            statusBar.text = '代码生成成功';
            setTimeout(() => statusBar.dispose(), 3000);
            context.subscriptions.push(
                vscode.window.registerWebviewViewProvider(
                    "codemate.historyView",
                    new UpdateHistoryViewProvider(context)
                )
            );
        } catch (error) {
            handleError(error);
            statusBar.dispose();
        }
    }));

    // 注册 AI 对话命令（使用 withProgress 显示加载提示）
    context.subscriptions.push(vscode.commands.registerCommand('codemate.aiChat', async () => {
        console.log('[CodeMate] AI Chat command triggered.');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请先打开代码文件');
            return;
        }
        const config = vscode.workspace.getConfiguration('codemate');
        const apiKey = config.get<string>('apiKey');
        if (!apiKey) {
            vscode.window.showErrorMessage('请在设置中配置 API 密钥 (codemate.apiKey)');
            return;
        }
        // 弹出输入对话框，输入 deepseek_chat 模型的提示
        const prompt = await vscode.window.showInputBox({ prompt: "请输入 deepseek_chat 模型的提示：" });
        if (!prompt) {
            return;
        }

        // 显示加载提示
        const completion = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "生成代码中...",
            cancellable: false
        }, async () => {
            return await requestWithModel("deepseek-chat", { apiKey, code: prompt, language: editor.document.languageId });
        });

        const cleaned = cleanCode(completion);
        await previewAndConfirm(editor, cleaned, "aiChat");
    }));

    // 注册撤销更新命令
    context.subscriptions.push(vscode.commands.registerCommand('codemate.undoUpdate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if (undoStack.length === 0) {
            vscode.window.showInformationMessage("没有可撤销的更新");
            return;
        }
        const lastUpdate = undoStack.pop()!;
        await editor.edit(editBuilder => {
            editBuilder.delete(lastUpdate.range);
        });
        redoStack.push(lastUpdate);
        vscode.window.showInformationMessage("撤销成功");
    }));

    // 注册重做更新命令
    context.subscriptions.push(vscode.commands.registerCommand('codemate.redoUpdate', async () => {
        console.log('[CodeMate] Redo command triggered.');
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if (redoStack.length === 0) {
            vscode.window.showInformationMessage("没有可重做的更新");
            return;
        }
        const update = redoStack.pop()!;
        await editor.edit(editBuilder => {
            editBuilder.insert(update.range.start, update.content);
        });
        undoStack.push(update);
        updateHistory.push(update);
        vscode.window.showInformationMessage("重做成功");
    }));

    // 注册 Reveal Update 命令（增加检查，避免 record 未定义）
    context.subscriptions.push(vscode.commands.registerCommand('codemate.revealUpdate', async (record?: UpdateRecord) => {
        if (!record) {
            vscode.window.showErrorMessage("未找到更新记录，无法定位。");
            return;
        }
        console.log('[CodeMate] Reveal command triggered: ' + record.id);
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        editor.revealRange(record.range, vscode.TextEditorRevealType.InCenter);

        // 添加临时高亮
        const highlightDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 0, 0.3)',
            border: '2px solid yellow'
        });
        setTimeout(() => {
            highlightDecoration.dispose();
        }, 5000); 
    }));

    // 注册“显示更新记录”命令，采用 Webview 面板展示更新记录与撤销/重做按钮
    context.subscriptions.push(vscode.commands.registerCommand('codemate.showUpdateHistory', () => {
        console.log('[CodeMate] Show Update History command triggered.');
        showUpdateHistoryPanel(context);
    }));

    vscode.window.showInformationMessage("CodeMate 扩展已激活，试试 ctrl+alt+c 或 ctrl+alt+u 吧！");
}

// ----------------------- 预览与确认逻辑 -----------------------
async function previewAndConfirm(editor: vscode.TextEditor, content: string, type: "aiComplete" | "aiChat"): Promise<void> {
    console.log(`[CodeMate] Preview code:\n${content}`);

    const startPos = editor.selection.active;
    await editor.edit(editBuilder => {
        editBuilder.insert(startPos, content);
    });
    const endPos = editor.document.positionAt(editor.document.offsetAt(startPos) + content.length);
    const previewRange = new vscode.Range(startPos, endPos);

    const previewDecorationType = vscode.window.createTextEditorDecorationType({ color: 'gray' });
    editor.setDecorations(previewDecorationType, [previewRange]);

    const userChoice = await vscode.window.showInformationMessage("是否接受生成的代码？", "接受", "拒绝");
    if (userChoice === "接受") {
        editor.setDecorations(previewDecorationType, []);
        const updateRecord: UpdateRecord = {
            id: updateRecordId++,
            type,
            range: previewRange,
            content: content,
            timestamp: new Date()
        };
        updateHistory.push(updateRecord);
        undoStack.push(updateRecord);
        if (undoStack.length > 10) {
            undoStack.shift();
        }
        vscode.window.showInformationMessage("已接受 AI 生成的代码");
    } else {
        await editor.edit(editBuilder => {
            editBuilder.delete(previewRange);
        });
        vscode.window.showInformationMessage("已拒绝 AI 生成的代码");
    }
}

// ----------------------- AI 请求逻辑 -----------------------
async function getAICompletion(params: { apiKey: string; code: string; language: string; }): Promise<string> {
    try {
        return await requestWithModel("deepseek-reasoner", params);
    } catch (error) {
        if (error instanceof Error && error.message.includes("超时")) {
            vscode.window.showInformationMessage("deepseek-reasoner 请求超时，切换至 deepseek-chat 模式");
            return await requestWithModel("deepseek-chat", params);
        }
        throw error;
    }
}

async function requestWithModel(
    model: string,
    params: { apiKey: string; code: string; language: string; }
): Promise<string> {
    const timeoutDuration = model === "deepseek-reasoner" ? 15000 : 30000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutDuration);

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${params.apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{
                    role: "user",
                    content: `请使用 ${params.language} 补全以下代码，并仅返回完整的可执行纯代码，禁止添加任何解释、注释或 Markdown 标记：\n${params.code}`
                }],
                temperature: 0.3,
                maxChainLength: 2000
            }),
            signal: controller.signal
        });
        if (!response.ok) {
            const errorData = await response.json() as APIError;
            throw new Error(`API错误: ${errorData.error?.message || response.statusText}`);
        }
        const data = await response.json() as APIResponse;
        return data.choices[0].message.content.trim();

    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('请求超时，请检查网络连接');
        }
        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

// ----------------------- 更新记录 Webview 面板 -----------------------
function showUpdateHistoryPanel(context: vscode.ExtensionContext) {
// 修改webview的创建参数
    const panel = vscode.window.createWebviewPanel(
        "updateHistory",
        "CodeMate 更新记录",
        vscode.ViewColumn.One,
        { 
            enableScripts: true,
            localResourceRoots: [context.extensionUri], // 添加本地资源限制
            enableCommandUris: true,    // 允许执行命令
            enableFindWidget: true      // 避免aria-hidden警告
        }
    );

    // Initial content setup
    panel.webview.html = getUpdateHistoryHtml();

    // Use context.subscriptions to manage panel lifecycle
    context.subscriptions.push(
        panel.onDidDispose(() => {
            // Optional: cleanup logic if needed
            console.log('[CodeMate] Update History Panel closed');
        })
    );
    
    panel.webview.onDidReceiveMessage(message => {
        switch(message.command) {
            case 'undo':
                vscode.commands.executeCommand('codemate.undoUpdate').then(() => {
                    updatePanelContent(panel);
                });
                break;
            case 'redo':
                vscode.commands.executeCommand('codemate.redoUpdate').then(() => {
                    updatePanelContent(panel);
                });
                break;
            case 'reveal':
                const rec = updateHistory.find(r => r.id === message.id);
                if (rec) {
                    vscode.commands.executeCommand('codemate.revealUpdate', rec);
                } else {
                    vscode.window.showErrorMessage("未找到该更新记录，可能已撤销。");
                }
                break;
        }
    }, undefined, context.subscriptions);
}
  

function updatePanelContent(panel: vscode.WebviewPanel) {
    panel.webview.html = getUpdateHistoryHtml();
}

function getUpdateHistoryHtml(): string {
    // 确保记录按时间倒序排列
    const sortedHistory = [...updateHistory].reverse();
    
    const rows = sortedHistory.length > 0 
        ? sortedHistory.map(record => {
            return `<tr>
                <td>${record.id}</td>
                <td>${record.type === "aiComplete" ? "代码补全" : "AI对话"}</td>
                <td>${record.timestamp.toLocaleTimeString()}</td>
                <td><button class="reveal-btn" data-id="${record.id}">🔍定位</button></td>
            </tr>`;
        }).join("\n")
        : `<tr><td colspan="4" style="text-align:center;padding:20px;">暂无更新记录</td></tr>`;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            /* 添加更清晰的样式 */
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }
            th {
                background: #f5f5f5;
                padding: 8px;
                text-align: left;
                border-bottom: 2px solid #ddd;
            }
            td {
                padding: 8px;
                border-bottom: 1px solid #eee;
            }
            button {
                background: none;
                border: 1px solid #0078d4;
                color: #0078d4;
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
            }
            button:hover {
                background: #0078d411;
            }
        </style>
    </head>
    <body>
        <div style="margin-bottom:10px;">
            <button onclick="handleCommand('undo')">↩️撤销</button>
            <button onclick="handleCommand('redo')">↪️重做</button>
        </div>
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>类型</th>
                    <th>时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
        <script>
            // 更可靠的事件监听方式
            document.querySelector('tbody').addEventListener('click', (e) => {
                if(e.target.classList.contains('reveal-btn')) {
                    const id = parseInt(e.target.dataset.id);
                    vscode.postMessage({ command: 'reveal', id });
                }
            });

            function handleCommand(cmd) {
                vscode.postMessage({ command: cmd });
            }
        </script>
    </body>
    </html>`;
}


// ----------------------- 统一错误处理 -----------------------
function handleError(error: unknown): void {
    console.error('[CodeMate]', error);
    const err = error as Error;
    console.error('[CodeMate]', err.message);
    vscode.window.showErrorMessage(`代码补全失败: ${err.message}`, '查看文档').then(choice => {
        if (choice === '查看文档') {
            vscode.env.openExternal(vscode.Uri.parse('https://codemate.dev/docs/troubleshooting'));
        }
    });
}



class UpdateHistoryViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        
        // 初始加载内容
        webviewView.webview.html = getUpdateHistoryHtml();
        
        // 监听消息
        webviewView.webview.onDidReceiveMessage(message => {
            // 处理消息的逻辑（同之前的showUpdateHistoryPanel）
        });
    }
}
// ----------------------- 扩展停用 -----------------------
export function deactivate() {
    console.log('[CodeMate] Extension deactivated.');
}
