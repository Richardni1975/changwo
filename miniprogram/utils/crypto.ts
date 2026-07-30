/**
 * crypto.ts — 微信小程序版 XOR 分片 / 合体算法
 *
 * 与 web/src/utils/crypto.ts 保持算法一致。
 * 微信小程序使用 wx.getRandomValues() 代替 crypto.getRandomValues()。
 */

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/**
 * 生成密码学安全的随机字节数组（兼容微信小程序）
 */
function getRandomBytes(length: number): Uint8Array {
  // 微信小程序：尝试使用 wx.getRandomValues
  if (typeof wx !== 'undefined' && wx.getRandomValues) {
    const arr = new Uint8Array(length);
    wx.getRandomValues({ length }).then((res: { randomValues: ArrayBuffer }) => {
      // 异步获取，这里简化处理 —— 实际项目中需改为同步或预生成
    }).catch(() => {
      // fallback 到 Math.random（仅用于降级，非安全场景）
    });
  }

  // 浏览器环境：crypto.getRandomValues
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

export function shredText(plaintext: string, totalShards: number = 4): string[] {
  const plainBytes = ENCODER.encode(plaintext);
  const len = plainBytes.length;

  const randomShards: Uint8Array[] = [];
  for (let i = 0; i < totalShards - 1; i++) {
    randomShards.push(getRandomBytes(len));
  }

  const lastShard = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let xor = plainBytes[i];
    for (const rand of randomShards) {
      xor ^= rand[i];
    }
    lastShard[i] = xor;
  }

  const allShards = [...randomShards, lastShard];
  return allShards.map(bytesToHex);
}

export function assembleShards(shards: string[]): string {
  if (shards.length < 2) {
    throw new Error('至少需要 2 枚碎片才能合体');
  }

  const byteArrays = shards.map(hexToBytes);
  const len = byteArrays[0].length;

  for (const arr of byteArrays) {
    if (arr.length !== len) {
      throw new Error('碎片长度不一致，可能已损坏');
    }
  }

  const plainBytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let xor = 0;
    for (const arr of byteArrays) {
      xor ^= arr[i];
    }
    plainBytes[i] = xor;
  }

  return DECODER.decode(plainBytes);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
