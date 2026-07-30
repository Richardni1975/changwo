/**
 * ai-client.js — DeepSeek API 客户端
 *
 * 提供 AI 决策分析 / 会议摘要 / 投票分析 等扩展能力。
 * 所有 AI 请求均为可选增强功能，不依赖用户身份信息。
 *
 * API 文档: https://api-docs.deepseek.com/
 */

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

/**
 * 发送聊天补全请求
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} opts
 * @returns {Promise<string>}
 */
async function chat(messages, { temperature = 0.7, maxTokens = 2048 } = {}) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY 未配置');
  }

  const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`DeepSeek API 请求失败 (${response.status}): ${errBody}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || '';
}

/**
 * 生成房间讨论摘要
 * @param {string[]} messages - 房间内最近的解密消息列表
 * @returns {Promise<string>} 摘要文本
 */
async function generateSummary(messages) {
  if (messages.length === 0) {
    return '暂无讨论内容。';
  }

  const prompt = `以下是匿名聊天室中最近的消息记录。请用简洁的中文（不超过 200 字）总结讨论的主要话题和关键观点。

消息记录：
${messages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

请总结：`;

  return chat([
    { role: 'system', content: '你是一个中立的会议摘要助手，擅长从多人匿名讨论中提取关键信息。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.3, maxTokens: 512 });
}

/**
 * 分析投票倾向（从匿名讨论文本中提取）
 * @param {string[]} messages - 房间消息列表
 * @returns {Promise<{options: Array<{label: string, count: number, percentage: number}>, summary: string}>}
 */
async function analyzePoll(messages) {
  if (messages.length === 0) {
    return { options: [], summary: '暂无讨论内容。' };
  }

  const prompt = `以下是匿名聊天室中关于某个决策的讨论。请分析讨论中的观点分布，以 JSON 格式返回：
{
  "options": [{"label": "观点名称", "count": 人数估计, "percentage": 百分比}],
  "summary": "一句话总结"
}

消息记录：
${messages.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;

  const raw = await chat([
    { role: 'system', content: '你是数据分析助手。请仅返回有效的 JSON，不要包含其他文字。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.1, maxTokens: 1024 });

  try {
    return JSON.parse(raw);
  } catch {
    return { options: [], summary: raw };
  }
}

/**
 * 健康检查
 */
async function healthCheck() {
  try {
    const response = await fetch(`${DEEPSEEK_BASE}/models`, {
      headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = { chat, generateSummary, analyzePoll, healthCheck };
