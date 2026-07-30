#!/bin/bash
# 畅吾欲言 生产环境启动脚本
# 用法: NODE_ENV=production PORT=8080 bash start.sh

export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-8080}

echo "=========================================="
echo "  油炸冰棍 — 聊天服务器启动"
echo "  环境: $NODE_ENV  端口: $PORT"
echo "=========================================="

# 检查前端是否已构建
if [ ! -d "../web/dist" ]; then
  echo "❌ 前端未构建！请先运行: cd ../web && npm run build"
  exit 1
fi

echo "✅ 静态文件: ../web/dist"
echo "✅ 启动 relay..."

node relay.js
