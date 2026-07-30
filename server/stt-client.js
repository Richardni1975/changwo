/**
 * stt-client.js — SenseVoice 语音转文字客户端
 *
 * 通过 SiliconFlow API 将语音转为文字。
 * 安全要求：转写完成后原始语音文件必须立即在本地销毁。
 *
 * API 文档: https://docs.siliconflow.cn/reference/audio-transcriptions
 */

const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1';
const SILICONFLOW_TOKEN = process.env.SILICONFLOW_API_KEY || '';

/**
 * 将 Base64 编码的音频转为文字
 * @param {string} audioBase64 - Base64 编码的音频数据
 * @param {object} opts
 * @param {string} opts.language - 音频语言（默认 'zh'）
 * @returns {Promise<{text: string, duration: number}>}
 */
async function transcribe(audioBase64, { language = 'zh' } = {}) {
  if (!SILICONFLOW_TOKEN) {
    throw new Error('SILICONFLOW_API_KEY 未配置');
  }

  const formData = new FormData();
  // 将 Base64 转为 Blob（在 Node.js 18+ 中可用）
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const blob = new Blob([audioBuffer], { type: 'audio/wav' });
  formData.append('file', blob, 'audio.wav');
  formData.append('model', 'SenseVoiceSmall');
  formData.append('language', language);

  const response = await fetch(`${SILICONFLOW_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SILICONFLOW_TOKEN}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`STT 转写失败 (${response.status}): ${errBody}`);
  }

  const result = await response.json();
  return {
    text: result.text || '',
    duration: result.duration || 0,
  };
}

/**
 * 健康检查 — 验证 API 连通性
 */
async function healthCheck() {
  try {
    const response = await fetch(`${SILICONFLOW_BASE}/models`, {
      headers: { Authorization: `Bearer ${SILICONFLOW_TOKEN}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = { transcribe, healthCheck };
