/**
 * kb-builder.js — 将知识库 Markdown 切成段落并构建字符 bigram 倒排索引
 *
 * 用法: node kb-builder.js [knowledgeDir]
 * 默认扫描 server/knowledge/ 下的各课程文件夹（= 一门课），各自生成一个 index.json。
 *
 * 检索策略：v1 本地零成本，字符 bigram 重叠打分（不调用 embedding，成本 ≈0）。
 */

const fs = require('fs');
const path = require('path');

const CHUNK_MIN = 40;    // 段落最小字符数（太短的丢弃）
const CHUNK_MAX = 600;   // 段落最大字符数（超长二次切分）

/** 提取文本的字符 bigram 集合（去空白） */
function bigrams(text) {
  const s = text.replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/** 将一篇文章切分为若干语义段落 */
function splitIntoChunks(markdown) {
  const chunks = [];
  for (const raw of markdown.split(/\n+/)) {
    const para = raw.replace(/^[#>]+/, '').trim();
    if (!para || para.length < CHUNK_MIN) continue;
    if (para.length <= CHUNK_MAX) { chunks.push(para); continue; }
    // 超长段：按中英文句末标点二次切分聚合
    let buf = '';
    for (const piece of para.split(/(?<=[。！？.!?])/)) {
      buf += piece;
      if (buf.length >= CHUNK_MIN) { chunks.push(buf.trim()); buf = ''; }
    }
    if (buf.trim().length >= CHUNK_MIN) chunks.push(buf.trim());
  }
  return chunks;
}

/** 构建单个课程文件夹的索引 */
function buildCourse(courseDir) {
  const courseId = path.basename(courseDir);
  const files = fs.readdirSync(courseDir).filter((f) => f.endsWith('.md')).sort();
  const chunks = [];
  const inverted = new Map(); // bigram -> Set<chunkIndex>

  for (const f of files) {
    const text = fs.readFileSync(path.join(courseDir, f), 'utf-8');
    for (const c of splitIntoChunks(text)) {
      const idx = chunks.length;
      chunks.push({ id: idx, source: f, text: c });
      for (const bg of bigrams(c)) {
        if (!inverted.has(bg)) inverted.set(bg, new Set());
        inverted.get(bg).add(idx);
      }
    }
  }

  const bigramIndex = {};
  for (const [bg, set] of inverted) bigramIndex[bg] = Array.from(set);

  return { courseId, chunkCount: chunks.length, chunks, bigrams: bigramIndex };
}

function main() {
  const root = process.argv[2] || path.join(__dirname, 'knowledge');
  if (!fs.existsSync(root)) { console.error(`知识库目录不存在: ${root}`); process.exit(1); }
  const courses = fs.readdirSync(root).filter((d) => {
    try { return fs.statSync(path.join(root, d)).isDirectory(); } catch { return false; }
  });
  if (courses.length === 0) { console.error(`知识库目录下没有课程文件夹: ${root}`); process.exit(1); }
  for (const c of courses) {
    const result = buildCourse(path.join(root, c));
    const out = path.join(root, c, 'index.json');
    fs.writeFileSync(out, JSON.stringify(result), 'utf-8');
    console.log(`[kb-builder] ${c}: ${result.chunkCount} 个段落 → ${out}`);
  }
}

if (require.main === module) main();

module.exports = { buildCourse, splitIntoChunks, bigrams };
