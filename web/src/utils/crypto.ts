/**
 * crypto.ts — XOR 分片 / 合体算法
 *
 * 在客户端本地执行，服务端永不触及明文。
 *
 * 算法：One-Time Pad XOR Secret Sharing
 * - 分片：生成 N-1 个随机碎片，第 N 个 = 明文 XOR 所有随机碎片
 * - 合体：所有碎片 XOR 还原明文
 *
 * ⚠️ 安全要求：
 * - 密钥碎片必须是密码学安全的随机数（crypto.getRandomValues）
 * - 原始语音文件在转写完成后必须立即销毁
 * - 合体后的明文不得上传服务器
 */

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/** crypto.getRandomValues 单次上限 65536 字节 */
const RANDOM_CHUNK_SIZE = 65536;

/** 生成指定长度的密码学安全随机字节（自动分块绕过 65536 限制） */
function getRandomBytes(length: number): Uint8Array {
  const result = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += RANDOM_CHUNK_SIZE) {
    const chunkSize = Math.min(RANDOM_CHUNK_SIZE, length - offset);
    const chunk = new Uint8Array(result.buffer, offset, chunkSize);
    crypto.getRandomValues(chunk);
  }
  return result;
}

/**
 * 将文本/数据分片为 N 枚加密碎片
 * @param plaintext - 原始文本（或 base64 图片数据）
 * @param totalShards - 碎片总数（默认 4）
 * @returns 碎片数组（Hex 编码字符串）
 */
export function shredText(plaintext: string, totalShards: number = 4): string[] {
  const plainBytes = ENCODER.encode(plaintext);
  const len = plainBytes.length;

  // 生成 N-1 枚随机碎片（自动分块绕过 65536 字节限制）
  const randomShards: Uint8Array[] = [];
  for (let i = 0; i < totalShards - 1; i++) {
    randomShards.push(getRandomBytes(len));
  }

  // 第 N 枚 = 明文 XOR 所有随机碎片
  const lastShard = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let xor = plainBytes[i];
    for (const rand of randomShards) {
      xor ^= rand[i];
    }
    lastShard[i] = xor;
  }

  // 全部转为 Hex 字符串传输
  const allShards = [...randomShards, lastShard];
  return allShards.map((shard) => bytesToHex(shard));
}

/**
 * 将 N 枚碎片合体还原为原文
 * @param shards - Hex 编码的碎片数组
 * @returns 原始文本
 */
export function assembleShards(shards: string[]): string {
  if (shards.length < 2) {
    throw new Error('至少需要 2 枚碎片才能合体');
  }

  const byteArrays = shards.map((hex) => hexToBytes(hex));
  const len = byteArrays[0].length;

  // 验证所有碎片长度一致
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

/**
 * Uint8Array → Hex 字符串
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hex 字符串 → Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * 安全擦除明文（覆盖后释放）
 * 调用此函数后，传入的字符串引用应被置为 null/undefined
 */
export function secureWipe(text: string): void {
  // 在 JS 中无法真正覆盖字符串内存，但可以通过
  // 使引用失效来让 GC 回收。对于敏感场景，
  // 建议使用 Uint8Array 并手动归零。
  // 此处保留接口以供未来 WASM 实现。
}
