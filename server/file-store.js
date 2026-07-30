/**
 * file-store.js — 文件上传存储 & 7 天自动清理
 *
 * 职责：
 * 1. 接收 HTTP 文件上传，存到 server/uploads/
 * 2. 生成唯一文件 ID，返回访问 URL
 * 3. 7 天后自动删除过期文件
 *
 * 安全红线：文件不关联任何用户身份，仅通过 room 维度隔离
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** 文件元数据：id → { originalName, mimeType, size, ext, uploadedAt } */
const fileMeta = new Map();

/** 允许的 MIME 类型 */
const ALLOWED_TYPES = new Set([
  // 图片
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // 文档
  'application/pdf',
  'application/msword',  // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'text/plain',
]);

/** 最大文件大小：10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 判断是否为图片 */
function isImage(mimeType) {
  return mimeType.startsWith('image/');
}

/**
 * 保存上传文件
 * @param {Buffer} buffer - 文件内容
 * @param {string} originalName - 原始文件名
 * @param {string} mimeType - MIME 类型
 * @returns {{ id: string, url: string, size: number, isImage: boolean }}
 */
function saveFile(buffer, originalName, mimeType) {
  if (!ALLOWED_TYPES.has(mimeType)) {
    throw new Error(`不支持的文件类型: ${mimeType}`);
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`文件过大 (${(buffer.length / 1024 / 1024).toFixed(1)}MB)，上限 10MB`);
  }

  const id = crypto.randomUUID();
  const ext = path.extname(originalName) || mimeToExt(mimeType);
  const filename = `${id}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  fs.writeFileSync(filepath, buffer);

  // 图片：生成缩略图（200px 宽，~20-30KB）
  let thumbUrl = null;
  if (isImage(mimeType) && mimeType !== 'image/gif' && mimeType !== 'image/svg+xml') {
    try {
      thumbUrl = generateThumbnail(buffer, id, ext, mimeType);
    } catch (e) {
      console.warn('[file-store] 缩略图生成失败:', e.message);
    }
  }

  fileMeta.set(id, {
    originalName, mimeType, size: buffer.length, ext,
    uploadedAt: Date.now(), thumbUrl,
  });

  console.log(`[file-store] 已存储: ${filename} (${(buffer.length / 1024).toFixed(1)}KB)${thumbUrl ? ' + 缩略图' : ''}`);

  return {
    id,
    url: `/files/${filename}`,
    thumbUrl: thumbUrl || `/files/${filename}`, // 无缩略图时 fallback 到原图
    size: buffer.length,
    isImage: isImage(mimeType),
    mimeType,
    originalName,
  };
}

/**
 * 根据文件 ID 获取文件路径（用于 HTTP 响应）
 * @returns {{ filepath: string, mimeType: string } | null}
 */
function getFile(filename) {
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) return null;

  // 从文件名提取 ID
  const id = path.basename(filename, path.extname(filename));
  const meta = fileMeta.get(id);

  return {
    filepath,
    mimeType: meta?.mimeType || 'application/octet-stream',
    originalName: meta?.originalName || filename,
  };
}

/**
 * 清理过期文件（7 天）
 */
function cleanExpired() {
  const cutoff = Date.now() - RETENTION_MS;
  let cleaned = 0;

  for (const [id, meta] of fileMeta) {
    if (meta.uploadedAt < cutoff) {
      const filename = `${id}${meta.ext}`;
      const filepath = path.join(UPLOAD_DIR, filename);
      try {
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        fileMeta.delete(id);
        cleaned++;
      } catch (err) {
        console.error(`[file-store] 清理失败: ${filename}`, err.message);
      }
    }
  }

  if (cleaned > 0) {
    console.log(`[file-store] 过期清理: ${cleaned} 个文件`);
  }
}

// 每小时清理一次
setInterval(cleanExpired, 60 * 60 * 1000);

/** 生成缩略图（200px 宽，JPEG 品质 70%，约 20-30KB） */
function generateThumbnail(buffer, id, ext, mimeType) {
  const sharp = require('sharp');
  const thumbFilename = `${id}_thumb.jpg`;
  const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
  sharp(buffer)
    .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toFile(thumbPath);
  return `/files/${thumbFilename}`;
}

function mimeToExt(mime) {
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
    'image/webp': '.webp', 'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
  };
  return map[mime] || '.bin';
}

module.exports = { saveFile, getFile, cleanExpired, ALLOWED_TYPES, MAX_FILE_SIZE };
