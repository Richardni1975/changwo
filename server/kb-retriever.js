/**
 * kb-retriever.js — 本地零成本知识库检索（字符 bigram 重叠打分）
 *
 * 启动时把 server/knowledge/ 下各课程的 index.json 全部载入内存，
 * retrieve(courseId, query, k) 按 bigram 重叠数取 Top-K 段落。
 */

const fs = require('fs');
const path = require('path');

function loadIndex(courseDir) {
  const p = path.join(courseDir, 'index.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function bigrams(text) {
  const s = text.replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/**
 * @param {string} knowledgeDir - server/knowledge 根目录
 */
function createKbStore(knowledgeDir) {
  const courses = new Map(); // courseId -> index

  function load() {
    courses.clear();
    if (!fs.existsSync(knowledgeDir)) return;
    for (const d of fs.readdirSync(knowledgeDir)) {
      const full = path.join(knowledgeDir, d);
      try {
        if (!fs.statSync(full).isDirectory()) continue;
        const idx = loadIndex(full);
        if (idx) courses.set(idx.courseId || d, idx);
      } catch {}
    }
  }
  load();

  function retrieve(courseId, query, k = 3) {
    const idx = courses.get(courseId);
    if (!idx || !query) return [];
    const qb = bigrams(query);
    if (qb.size === 0) return [];
    const scores = new Map();
    for (const bg of qb) {
      const ids = idx.bigrams[bg];
      if (!ids) continue;
      for (const id of ids) scores.set(id, (scores.get(id) || 0) + 1);
    }
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id, score]) => ({ text: idx.chunks[id].text, source: idx.chunks[id].source, score }));
  }

  function listCourses() {
    return Array.from(courses.keys());
  }

  return { retrieve, listCourses, reload: load };
}

module.exports = { createKbStore, loadIndex };
