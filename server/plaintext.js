/**
 * plaintext.js — 服务端 XOR 分片编解码工具
 *
 * 背景：momo 匿名模式下，4 枚 XOR 碎片在服务端中转时以
 * `shard1|shard2|shard3|shard4` 形式广播（assembled.text）。
 * 服务端本就持有全部碎片，合体即可得明文。
 *
 * 用途：仅供「隐蔽助教」机器人触发引擎理解讨论内容。
 * 已放弃「服务器看不到内容」的零知识承诺（见 CLAUDE.md 决策）。
 */

const { randomBytes } = require('crypto');

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

/**
 * 从 assembled.text（碎片串）还原明文
 * @param {string} assembledText - `shard1|shard2|...` 或已为明文
 * @returns {string} 明文
 */
function decodeAssembled(assembledText) {
  if (typeof assembledText !== 'string' || !assembledText.includes('|')) return assembledText || '';
  const frags = assembledText.split('|');
  if (frags.length < 2) return assembledText;
  try {
    const byteArrays = frags.map(hexToBytes);
    const len = byteArrays[0].length;
    if (len === 0) return '';
    for (const arr of byteArrays) if (arr.length !== len) return assembledText; // 非碎片串
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      let x = 0;
      for (const arr of byteArrays) x ^= arr[i];
      out[i] = x;
    }
    return decoder.decode(out);
  } catch {
    return assembledText;
  }
}

/**
 * 将明文分片为 N 枚 XOR 碎片（与客户端 crypto.ts 算法一致）
 * @param {string} plaintext
 * @param {number} n - 碎片总数（默认 4）
 * @returns {string[]} Hex 编码碎片数组
 */
function encodeShards(plaintext, n = 4) {
  const plainBytes = encoder.encode(plaintext);
  const len = plainBytes.length;
  const randoms = [];
  for (let i = 0; i < n - 1; i++) randoms.push(randomBytes(len));
  const last = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let x = plainBytes[i];
    for (const r of randoms) x ^= r[i];
    last[i] = x;
  }
  return [...randoms, last].map(bytesToHex);
}

module.exports = { decodeAssembled, encodeShards, hexToBytes, bytesToHex };
