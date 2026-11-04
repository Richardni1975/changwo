/**
 * bot-brain.js — SiliconFlow 大模型客户端 + 助教机器人三职责提示词
 *
 * 输出规范（已拍板）：中文、学生口吻、口语化、不学术化、不说教、不堆术语。
 * 模型通过环境变量 SILICONFLOW_MODEL 覆盖，默认走 SiliconFlow 免费模型。
 * 任何失败都返回 null（静默降级：机器人本次不发言），绝不抛异常给上层。
 */

const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1';
const SILICONFLOW_TOKEN = process.env.SILICONFLOW_API_KEY || '';
const MODEL = process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B';
const REQUEST_TIMEOUT_MS = 15000;

const SYSTEM_PROMPT = [
  '你是「畅吾欲言」匿名课堂讨论室里的一名同学，昵称 momo。',
  '你说话要像一名真实的大学生同学：口语化、自然、不端着、不学术、不说教、不堆砌术语，句子简短。',
  '你绝不能暴露自己是机器人或 AI。你不知道任何人的真实身份，也不评价任何人的身份。',
  '你从不提及「资料」「知识库」「文档」「书籍」「材料」等任何来源，也绝不用编号引用——所有想法都用你自己的话自然说出。',
].join('');

/**
 * 调用 SiliconFlow chat/completions
 * @returns {Promise<string|null>}
 */
async function chat(messages, { temperature = 0.8, maxTokens = 256 } = {}) {
  if (!SILICONFLOW_TOKEN) return null;
  try {
    const res = await fetch(`${SILICONFLOW_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SILICONFLOW_TOKEN}` },
      body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: maxTokens, stream: false, enable_thinking: false }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[bot-brain] SiliconFlow 请求失败 (${res.status}): ${await res.text().catch(() => '')}`);
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    return text.trim() || null;
  } catch (err) {
    console.error(`[bot-brain] 调用异常: ${err.message}`);
    return null;
  }
}

/** 职责一：暖场（老师发起议题后第一个发言） */
async function warmup(topic) {
  return chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `老师刚发起了一个议题：「${topic}」。请你作为第一个发言的同学，用 1～2 句话暖场：表现出对这个话题的兴趣，抛出一个开放的小问题或你的第一反应，邀请大家一起聊。不要长篇大论。` },
  ]);
}

/** 职责二：鼓励（有同学发言后） */
async function encourage(topic, message) {
  return chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `当前议题：「${topic}」。有位同学刚说：「${message}」。请你用 1 句话回应鼓励 ta：具体针对 ta 说的内容点个赞或追问一句，让 ta 愿意继续讲。别空泛地说"说得好"，别长篇大论。` },
  ]);
}

/** 职责三：建设性评论（基于知识库，轻引用，不暴露书名/章节/资料） */
async function comment(topic, recent, kbChunks) {
  const kbText = (kbChunks || []).map((c) => (c.text || '').trim()).filter(Boolean).join('\n');
  const kbSection = kbText
    ? `\n\n【仅供你吸收思路的背景知识，看完用自己的话说，禁止引用】\n${kbText}`
    : '';
  return chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `当前议题：「${topic}」。大家最近的发言：\n${recent.map((m, i) => `${i + 1}. ${m}`).join('\n')}${kbSection}\n\n请你以同学身份补充 1～2 句建设性的想法或建议：提出一个大家可能没想到的角度，或把上面背景知识里的思路化成具体做法。口语化、简短，别像老师讲课。\n\n【硬性要求】回答里绝不能出现「资料」「知识库」「文档」「书籍」「书里说」「材料」「背景知识」这类字眼，也绝不能出现任何编号或复述原文；必须完全用你自己、同学第一人称的话自然表达，让人完全看不出你参考了任何东西。` },
  ]);
}

module.exports = { warmup, encourage, comment, chat, MODEL };
