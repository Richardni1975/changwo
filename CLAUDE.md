# CLAUDE.md — 畅吾欲言 项目宪章与开发规范

> 本文件是项目宪法与 AI 协作规范。任何改动都不得违反本文的安全原则、网络数据契约、50人信道承载防挤退机制、6小时长会话内存回收、7天记录留存与一键导出规范、双端 Design Tokens 与代码质量标准。

---

## 一、项目定位与核心哲学

本项目是一款面向微信生态（小程序）与 PC Web 端的**熟人匿名沟通与集体决策工具**。
核心宗旨：通过「肉眼可见、物理级别的客户端脱敏与解构」消除熟人社会网络压迫，让用户敢于发表最真实的意见，同时实现对用户的全功能免费与极致流畅的交互体验。

### 核心安全与信任原则（Zero-Knowledge & Transparency）— 不可违反
1. **零身份映射（No Identity Mapping）**：后端数据库架构绝对禁止建立「用户真实 OpenID/ID ↔ 匿名发言」的关联映射表。房间由 `client.room` 运行期绑定，客户端发包严禁携带 `userId` / `OpenID` / 时间戳。
2. **客户端物理分片（Client-Side Secret Sharing）**：文本/语音转写内容在手机本地通过算法（XOR）打散为 4 串纯随机乱码（OTP 密钥碎片，如 `0x8F`）。原始语音文件在转写完成后**必须立即在本地销毁**，不得上传服务器。
3. **可视化信任与社会学互证（Visual Trust）**：发送端呈现「文本碎纸化 → 乱码光块 → 飞向群友」动效；接收端收到碎片时显示拼图收集态，合成时播放拼图合体动画。
4. **防时间序攻击（Anti-Timing Attack）**：发送/中转引入随机延迟漂移与伪造混淆包，避免通过「放下手机的时间」推断发送者。
5. **7 天无痕记录与一键导出**：房间内的解密明文记录仅滚动保留 **7 天（168 小时）**，过期由系统自动彻底清除。记录仅保存“时间 + 解密文本”，不保留任何身份轨迹，支持随时一键导出为 `.txt` 文件。

---

## 二、高并发与信道承载力架构（50人同频防挤退机制）

针对最多 50 人同时在同一个房间内协同沟通与决策的场景（类似腾讯会议房间模式），后端与 WebSocket 连接池必须严格遵循以下信道承载与容量保护策略：

### 1. 严格防挤退原则（Non-preemptive Connection Policy）
- **容量上限**：单个房间硬性限制最大并发在线连接数为 **50**（`MAX_ROOM_CAPACITY = 50`）。
- **拒绝策略（First-Come, First-Served）**：当房间在线人数达到 50 人时，**绝对禁止**将早期进入的用户断开或踢出（非抢占式）。对第 51 个及之后尝试进入的用户，服务端必须直接返回 `room_full` JSON 状态包并优雅拒绝（拒绝码 `ROOM_CAPACITY_EXCEEDED`），提示"房间已满"。
- **Session 唯一性与重连防抢占**：若同一设备/客户端触发断线重连，必须凭 `sessionToken` 校验并复用既有连接槽位，避免误判为新用户而被拒之门外。

### 2. 广播风暴防范与背压机制（Broadcast Storm & Backpressure）
- **事件节流（Presence Throttle）**：50 人并发时，进出房间广播（`presence`）若频繁触发会产生 $50 \times 50 = 2500$ 次/秒的包扩散。服务端必须对 `presence` 事件进行 **100ms~200ms 的 防抖/节流合并（Debounce/Batching）**，避免 CPU / 网卡爆满。
- **碎片中转背压控制**：`shard` 密码学碎片广播必须采用轻量级二进或极简 JSON；当单 Socket 缓冲区（`bufferedAmount`）超出阈值时，自动开启丢帧/降级机制，优先保障主信道稳定。

### 3. 心跳保活与僵尸连接清理（Zombie Connection Sweeping）
- **心跳契约**：客户端每 15 秒发送一次 `{type: 'ping'}`，服务端回复 `{type: 'pong'}`。
- **死锁防护**：服务端维持 30 秒超时判定。若超过 30 秒未收到心跳，才将其认定为僵尸连接并主动释放槽位（释放出的名额方可供新用户进入），彻底避免由于"假死"占用 50 人名额。

---

## 三、6 小时长会话与异构设备治理（Extreme Long-Session Guard）

为了保障 50 人高强度讨论 **6 小时以上**不崩溃，以及兼容中低端手机（如旧款安卓/iPhone）与低配 PC，客户端与服务端必须实施以下资源治理方案：

### 1. 6 小时长会话 DOM 虚拟化与内存 GC
- **视口 DOM 虚拟化**：Zone 1 视图层必须使用虚拟列表（Virtual List），**视口内仅渲染 20-30 条活动 DOM**。6 小时内产生的成千上万条历史记录自动持久化至本地 Storage（IndexedDB / `wx.setStorage`），避免 DOM 节点爆炸引发 OOM 闪退。
- **服务端碎片零残留 GC**：一旦 4 片集齐触发 `assembled`，中转服务内存中的碎片桶必须在 **100ms 内立即 `delete` 销毁**。服务端仅维护极其轻量的高速日志索引（用于 7 天历史回放），保证 6 小时运行期内存占用保持在 100MB 以下。

### 2. 低端设备动效自适应降级（Adaptive FPS）
- **帧率监控**：客户端实时检测渲染帧率。若连续 3 秒低于 25 FPS：
  - 自动禁用 `.shred-particle` 碎纸粒子飞散与高级 CSS 模糊滤镜（`backdrop-filter`）。
  - 将 `assembling` 动画简化为静态微光渐变，确保核心解密逻辑零卡顿。

### 3. 断线重连与增量补包（Reconnection Protocol）
- **系统挂起应对**：移动端切后台或熄屏超过 15 秒 WebSocket 断开时，客户端重连带上 `lastMsgServerTs`。
- **增量补包**：服务端接收重连后，仅增量推送缺失的 `assembled` 消息，实现"无感知恢复"。

---

## 四、网络链路与拓扑（Cloudflare Tunnel + STT / DeepSeek）

支持微信小程序与 PC Web 浏览器双端接入。

### 1. 拓扑结构
```text
[ 微信小程序客户端 / PC Web 浏览器 (最多 50 人/房间, 支持 6 小时长会话) ]
       │
       │ (1) HTTPS / WSS 域名请求 (api-mosaic.m0m0n1.top)
       ▼
[ Cloudflare Edge 节点 ] (负责 SSL 证书、WSS 协议升级、高防与 TCP 优化)
       │
       │ (2) 加密安全隧道 (Cloudflare Tunnel)
       ▼
[ 本地/内网服务器 (cloudflared 守护进程) ]
       │
       │ (3) Loopback 本地转发 (127.0.0.1:8080)
       ▼
[ Node.js 纯内存 WebSocket 中转服务 (server/relay.js) ]
  ├── 50人容量池控制 (Capacity Guard)
  ├── Presence 节流合并器 (Batching)
  ├── 7 天解密记录存储 & TXT 一键导出生成器
  ├── (4) SenseVoice STT (语音转文字: api.siliconflow.cn)
  └── (5) DeepSeek API (扩展 AI 决策分析/摘要模块)
```

---

## 五、前端与 UI 架构规范

### 1. 双端技术栈
| 端 | 框架 | UI 组件 | 状态管理 | 构建工具 |
|---|------|---------|----------|----------|
| 微信小程序 | 原生 WXML/WXSS/TS | WeUI + 自定义组件 | 全局 App 状态 + EventBus | 微信开发者工具 |
| PC Web | React 18 + TypeScript | Tailwind CSS + Radix UI | Zustand | Vite |

### 2. Design Tokens（双端共享）
所有颜色、间距、圆角、阴影、字体必须通过 Design Tokens 集中定义，双端引用同一份 JSON 源：
```jsonc
// shared/tokens/design-tokens.json
{
  "color": {
    "brand": { "primary": "#6366F1", "secondary": "#8B5CF6" },
    "surface": { "bg": "#0F0F23", "card": "rgba(255,255,255,0.05)" },
    "text": { "primary": "#F8FAFC", "secondary": "#94A3B8" },
    "status": { "success": "#22C55E", "warning": "#F59E0B", "error": "#EF4444" }
  },
  "spacing": { "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "32px" },
  "radius": { "sm": "6px", "md": "12px", "lg": "20px", "full": "9999px" },
  "animation": { "shred": "600ms", "assemble": "800ms", "presence": "300ms" }
}
```

### 3. 关键动画规范
- **碎纸化动画** (`.shred-particle`)：文本 → 离散粒子 → 乱码光块，时长 600ms，`ease-out`
- **拼图收集态** (`.shard-collecting`)：4 枚碎片旋转汇聚，带 `pulse` 呼吸光晕
- **合体动画** (`.assembling`)：碎片拼合 + 微光闪过，时长 800ms，`cubic-bezier(0.34, 1.56, 0.64, 1)`

---

## 六、WebSocket 消息协议规范

### 1. 消息类型枚举
```typescript
enum MessageType {
  // 连接与心跳
  JOIN = 'join',           // 加入房间
  LEAVE = 'leave',         // 离开房间
  PING = 'ping',           // 心跳
  PONG = 'pong',           // 心跳响应
  PRESENCE = 'presence',   // 在线人数广播（节流合并）
  
  // 核心通信
  SHARD = 'shard',         // 加密碎片中转
  ASSEMBLED = 'assembled', // 碎片集齐 → 广播解密结果
  
  // 系统
  ERROR = 'error',         // 错误
  ROOM_FULL = 'room_full', // 房间满员
  RECONNECT = 'reconnect', // 断线重连
  EXPORT = 'export',       // 一键导出请求
  
  // AI 扩展
  AI_SUMMARY = 'ai_summary',   // AI 决策摘要
  AI_POLL = 'ai_poll',         // AI 投票分析
}
```

### 2. 消息格式契约
```typescript
interface WireMessage {
  type: MessageType;
  room: string;            // 房间 ID（UUID v4）
  sessionToken?: string;   // 会话令牌（重连用）
  payload?: any;           // 业务载荷
  serverTs?: number;       // 服务端时间戳（防时序攻击）
  lastMsgServerTs?: number; // 重连时携带（增量补包）
}
```

---

## 七、安全红线与代码审计清单

在每次 PR / Commit 审查中必须检查以下项目：

- [ ] ❌ 后端数据库无 `userId ↔ message` 关联表
- [ ] ❌ 客户端请求不携带 `OpenID` / `userId` / 设备指纹
- [ ] ❌ 服务端不记录任何可关联到真实身份的元数据
- [ ] ✅ 碎片桶 `assembled` 后 100ms 内销毁
- [ ] ✅ 房间容量 `MAX_ROOM_CAPACITY = 50`，非抢占式拒绝
- [ ] ✅ 原始语音文件本地转写后即时销毁
- [ ] ✅ 解密明文 7 天自动过期清理
- [ ] ✅ 所有 WSS 通信走 Cloudflare Tunnel，不暴露源站 IP

---

## 八、开发环境与命令

### 启动开发环境
```bash
# 启动 WebSocket 中转服务（本地）
cd server && node relay.js

# 启动 Cloudflare Tunnel（需先安装 cloudflared）
cloudflared tunnel run changwo-relay

# 启动 PC Web 开发服务器
cd web && npm run dev

# 微信小程序：使用微信开发者工具打开 miniprogram/ 目录
```

### 代码质量
```bash
# TypeScript 类型检查
npx tsc --noEmit

# ESLint 检查
npx eslint . --ext .ts,.tsx

# 单元测试
npm test
```

---

## 九、目录结构

```
changwo/
├── CLAUDE.md                    # ← 本文件（项目宪章）
├── server/
│   ├── relay.js                 # WebSocket 中转服务（核心）
│   ├── capacity-guard.js        # 50人容量池控制
│   ├── presence-batcher.js      # Presence 节流合并器
│   ├── shard-bucket.js          # 碎片桶管理（4片集齐 → 100ms销毁）
│   ├── record-keeper.js         # 7天记录存储与清理
│   ├── stt-client.js            # SenseVoice STT 客户端
│   ├── ai-client.js             # DeepSeek API 客户端
│   └── package.json
├── miniprogram/                 # 微信小程序
│   ├── app.ts
│   ├── pages/
│   │   ├── room/                # 房间页（核心）
│   │   ├── create/              # 创建房间
│   │   └── history/             # 历史记录 & 导出
│   ├── utils/
│   │   ├── crypto.ts            # XOR 分片/合体算法
│   │   ├── ws-client.ts         # WebSocket 客户端
│   │   ├── virtual-list.ts      # 虚拟列表组件
│   │   └── fps-monitor.ts       # 帧率监控 & 动效降级
│   └── components/
│       ├── shred-animation/     # 碎纸化动画组件
│       └── shard-collector/     # 碎片收集动画组件
├── web/                         # PC Web 端
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Room.tsx         # 房间页（核心）
│   │   │   ├── CreateRoom.tsx
│   │   │   └── History.tsx
│   │   ├── components/
│   │   │   ├── ShredAnimation.tsx
│   │   │   ├── ShardCollector.tsx
│   │   │   ├── VirtualList.tsx
│   │   │   └── FpsMonitor.ts
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useCrypto.ts
│   │   │   └── usePresence.ts
│   │   ├── utils/
│   │   │   ├── crypto.ts        # XOR 分片/合体算法
│   │   │   └── export.ts        # TXT 一键导出
│   │   └── styles/
│   │       └── globals.css      # Tailwind + Design Tokens
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── shared/
│   └── tokens/
│       └── design-tokens.json   # 双端共享 Design Tokens
└── docs/
    ├── ARCHITECTURE.md          # 架构设计文档
    └── SECURITY.md              # 安全设计文档
```
