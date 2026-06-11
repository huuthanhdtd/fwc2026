import { CONFIG } from './config.js';
import { Auth } from './auth.js';
import { App } from './app.js';

export const API = {
  async call(action, params = {}, method = 'GET') {
    if (!CONFIG.GAS_WEB_APP_URL) {
      console.warn('GAS_WEB_APP_URL chưa được cấu hình. Đang chạy ở chế độ offline.');
      App.showToast('Vui lòng cấu hình VITE_GAS_WEB_APP_URL trong file .env!', 'warning');
      return { success: false, message: 'Chưa cấu hình URL GAS', data: null };
    }

    App.showLoading();
    try {
      const user = Auth.getUser();
      const email = user ? user.email : '';
      const displayName = user ? user.name : '';

      let url = CONFIG.GAS_WEB_APP_URL;
      let options = {
        method: method,
        mode: 'cors',
      };

      if (method === 'GET') {
        const queryParams = new URLSearchParams({
          action: action,
          email: email,
          ...params
        });
        url += '?' + queryParams.toString();
      } else {
        // POST
        options.headers = {
          'Content-Type': 'text/plain;charset=utf-8' // GAS doPost nhận dữ liệu tốt nhất dạng text/plain
        };
        options.body = JSON.stringify({
          action: action,
          data: {
            email: email,
            displayName: displayName,
            ...params
          }
        });
      }

      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error(`Lỗi API [${action}]:`, error);
      App.showToast('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng!', 'error');
      return { success: false, message: error.message, data: null };
    } finally {
      App.hideLoading();
    }
  },

  // Gọi trực tiếp FIFA API (để giảm tải cho GAS hoặc tránh CORS nếu gọi trực tiếp được)
  async fetchMatchesDirect() {
    try {
      const response = await fetch(CONFIG.FIFA_API_URL);
      if (!response.ok) throw new Error('FIFA API error');
      const data = await response.json();
      return { success: true, data: data };
    } catch (e) {
      console.warn('Lỗi gọi trực tiếp FIFA API, chuyển sang gọi qua GAS Proxy:', e);
      return null;
    }
  },

  async fetchMatches() {
    // Thử gọi trực tiếp trước
    const directResult = await this.fetchMatchesDirect();
    if (directResult) {
      return directResult;
    }
    // Nếu bị CORS hoặc lỗi, gọi qua GAS Proxy
    return this.call('getMatches');
  },

  async placeBet(matchId, matchNumber, scores, betType, homeTeam, awayTeam, matchDate, overwrite = true) {
    return this.call('placeBet', {
      matchId,
      matchNumber,
      scores,
      betType,
      homeTeam,
      awayTeam,
      matchDate,
      overwrite
    }, 'POST');
  },

  async changeBet(matchId, oldScore, newScore) {
    return this.call('changeBet', {
      matchId,
      oldScore,
      newScore
    }, 'POST');
  },

  async getMyBets(filter = 'all') {
    return this.call('getMyBets', { filter });
  },

  async getMatchBets(matchId, isBulk = false) {
    return this.call('getMatchBets', { matchId, bulk: isBulk });
  },



  async processCommand(message) {
    return this.call('processCommand', { message }, 'POST');
  },

  async getLeaderboard(type = 'win') {
    return this.call('getLeaderboard', { type });
  },

  async getSpecialBets() {
    return this.call('getSpecialBets');
  },

  async placeSpecialBet(semifinals, finals, champion, topScorer, timestamp = null) {
    return this.call('placeSpecialBet', {
      semifinals,
      finals,
      champion,
      topScorer,
      timestamp
    }, 'POST');
  },

  async deleteSpecialBet(timestamp) {
    return this.call('deleteSpecialBet', { timestamp }, 'POST');
  },

  async registerUser() {
    const user = Auth.getUser();
    if (!user) return { success: false };
    return this.call('registerUser', {
      email: user.email,
      displayName: user.name,
      photoUrl: user.picture
    }, 'POST');
  }
};
