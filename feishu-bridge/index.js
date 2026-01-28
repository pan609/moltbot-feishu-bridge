import * as lark from "@larksuiteoapi/node-sdk";

// ========== 环境变量配置 ==========
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const MOLTBOT_URL = process.env.MOLTBOT_URL || "http://127.0.0.1:18789";
const MOLTBOT_TOKEN = process.env.MOLTBOT_TOKEN;

if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
  console.error("错误: 请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET");
  process.exit(1);
}

if (!MOLTBOT_TOKEN) {
  console.error("错误: 请设置环境变量 MOLTBOT_TOKEN");
  process.exit(1);
}

// ========== 状态管理 ==========
const userSessions = new Map(); // 用户会话历史
const processedMessages = new Set(); // 已处理消息ID（用于去重）

// ========== 飞书客户端 ==========
const client = new lark.Client({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
  disableTokenCache: false,
});

// ========== 消息卡片 ==========
/**
 * 创建飞书消息卡片
 * @param {string} content - Markdown 格式的消息内容
 * @param {boolean} isThinking - 是否为"思考中"状态
 */
function createCard(content, isThinking = false) {
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: isThinking ? "yellow" : "blue",
      title: {
        tag: "plain_text",
        content: isThinking ? "🤔 正在思考..." : "💬 回复",
      },
    },
    elements: [{ tag: "markdown", content }],
  });
}

/**
 * 发送消息卡片
 */
async function sendCard(chatId, content, isThinking = false) {
  try {
    const res = await client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "interactive",
        content: createCard(content, isThinking),
      },
    });
    return res.data?.message_id;
  } catch (error) {
    console.error("发送卡片失败:", error.message);
    return null;
  }
}

/**
 * 更新消息卡片内容
 */
async function updateCard(messageId, content) {
  try {
    await client.im.message.patch({
      path: { message_id: messageId },
      data: { content: createCard(content, false) },
    });
    return true;
  } catch (error) {
    console.error("更新卡片失败:", error.message);
    return false;
  }
}

// ========== Moltbot API ==========
/**
 * 调用 Moltbot 获取回复
 * @param {string} userId - 用户ID
 * @param {string} userMessage - 用户消息
 */
async function getMoltbotResponse(userId, userMessage) {
  // 获取或创建用户会话历史
  if (!userSessions.has(userId)) {
    userSessions.set(userId, []);
  }
  const history = userSessions.get(userId);

  // 添加用户消息到历史
  history.push({ role: "user", content: userMessage });

  // 限制历史长度（保留最近20条）
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }

  try {
    const response = await fetch(`${MOLTBOT_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MOLTBOT_TOKEN}`,
        "x-clawdbot-agent-id": "main",
      },
      body: JSON.stringify({
        model: "clawdbot",
        messages: history,
        user: `feishu:${userId}`,
      }),
    });

    if (!response.ok) {
      return `抱歉，出现了错误 (HTTP ${response.status})`;
    }

    const data = await response.json();
    const assistantMessage =
      data.choices?.[0]?.message?.content || "抱歉，没有获取到回复";

    // 保存助手回复到历史
    history.push({ role: "assistant", content: assistantMessage });

    return assistantMessage;
  } catch (error) {
    console.error("Moltbot 请求失败:", error.message);
    return `抱歉，请求失败: ${error.message}`;
  }
}

// ========== 消息去重 ==========
/**
 * 清理过期的消息ID（保留最近1000条）
 * 这是为了防止内存无限增长
 */
function cleanupProcessedMessages() {
  if (processedMessages.size > 1000) {
    const arr = Array.from(processedMessages);
    arr.slice(0, arr.length - 500).forEach((id) => processedMessages.delete(id));
  }
}

// ========== 事件处理 ==========
const eventDispatcher = new lark.EventDispatcher({}).register({
  "im.message.receive_v1": async (data) => {
    const message = data.message;
    const messageId = message.message_id;

    // 去重检查：飞书可能会重发消息，需要跳过已处理的
    if (processedMessages.has(messageId)) {
      console.log(`[${messageId}] 重复消息，已跳过`);
      return;
    }
    processedMessages.add(messageId);
    cleanupProcessedMessages();

    // 只处理文本消息
    if (message.message_type !== "text") {
      return;
    }

    // 解析消息内容
    let userText = "";
    try {
      userText = JSON.parse(message.content).text || "";
    } catch (e) {
      return;
    }

    if (!userText.trim()) {
      return;
    }

    const userId = data.sender?.sender_id?.open_id || "unknown";
    const chatId = message.chat_id;

    console.log(`[${messageId}] 收到消息: ${userText}`);

    // 1. 发送"正在思考..."卡片
    const thinkingMsgId = await sendCard(
      chatId,
      "请稍候，正在为您生成回复...",
      true
    );

    // 2. 调用 Moltbot 获取回复
    const reply = await getMoltbotResponse(userId, userText);

    // 3. 更新卡片为实际回复
    if (thinkingMsgId) {
      const updated = await updateCard(thinkingMsgId, reply);
      // 如果更新失败，发送新卡片
      if (!updated) {
        await sendCard(chatId, reply, false);
      }
    } else {
      await sendCard(chatId, reply, false);
    }

    console.log(`[${messageId}] 回复完成`);
  },
});

// ========== 启动服务 ==========
const wsClient = new lark.WSClient({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
  loggerLevel: lark.LoggerLevel.info,
});

console.log("🦞 Moltbot-Feishu Bridge 启动中...");
console.log(`   Moltbot URL: ${MOLTBOT_URL}`);
wsClient.start({ eventDispatcher });
console.log("✅ WebSocket 连接已建立，等待消息...");
