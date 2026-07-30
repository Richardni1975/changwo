/**
 * capacity-guard.js — 50人容量池控制器
 *
 * 原则（不可违反）：
 * - First-Come, First-Served（非抢占式）
 * - 满员时拒绝新用户，绝不踢出既有用户
 * - 重连用户复用既有槽位
 */

const { v4: uuidv4 } = require('uuid');

/**
 * @param {object} opts
 * @param {number} opts.maxCapacity - 每房间最大在线人数（默认 50）
 */
function createCapacityGuard({ maxCapacity = 50 } = {}) {
  // room → Set<sessionToken>
  const rooms = new Map();

  return {
    /**
     * 检查房间是否可以容纳新用户
     */
    canJoin(room) {
      const members = rooms.get(room);
      if (!members) return true;
      return members.size < maxCapacity;
    },

    /**
     * 用户加入房间，返回 sessionToken
     */
    join(room) {
      if (!rooms.has(room)) {
        rooms.set(room, new Set());
      }
      const members = rooms.get(room);

      if (members.size >= maxCapacity) {
        throw new Error('ROOM_CAPACITY_EXCEEDED');
      }

      const sessionToken = uuidv4();
      members.add(sessionToken);
      console.log(`[capacity] room=${room} joined (${members.size}/${maxCapacity})`);
      return sessionToken;
    },

    /**
     * 用户离开房间
     */
    leave(room, sessionToken) {
      const members = rooms.get(room);
      if (!members) return;
      members.delete(sessionToken);
      console.log(`[capacity] room=${room} left (${members.size}/${maxCapacity})`);
      // 房间空则清理
      if (members.size === 0) {
        rooms.delete(room);
      }
    },

    /**
     * 获取房间在线人数
     */
    getOnlineCount(room) {
      const members = rooms.get(room);
      return members ? members.size : 0;
    },

    /**
     * 检查 sessionToken 是否在房间内（重连校验）
     */
    isMember(room, sessionToken) {
      const members = rooms.get(room);
      return members ? members.has(sessionToken) : false;
    },

    /**
     * 获取房间所有成员 sessionToken 列表
     */
    getMembers(room) {
      const members = rooms.get(room);
      return members ? Array.from(members) : [];
    },
  };
}

module.exports = { createCapacityGuard };
