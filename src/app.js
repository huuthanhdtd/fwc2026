import { Auth } from './auth.js';
import { API } from './api.js';
import { Matches } from './matches.js';
import { Bracket } from './bracket.js';
import { Leaderboard } from './leaderboard.js';
import { Special } from './special.js';

export const App = {
  init() {
    this.setupTabs();
    this.setupLogout();
    
    Auth.init((user) => this.onLoginSuccess(user));

    if (Auth.isAuthenticated()) {
      this.showApp();
    } else {
      this.showLogin();
    }
  },

  onLoginSuccess(user) {
    this.showApp();

    const avatar = document.getElementById('user-avatar');
    const name = document.getElementById('user-name');
    const email = document.getElementById('user-email');

    if (avatar) avatar.src = user.picture;
    if (name) name.textContent = user.name;
    if (email) email.textContent = user.email;

    API.registerUser().then(res => {
      if (res && res.success) {
        this.showToast(res.message, 'success');
        Matches.init();
      } else {
        const errorMsg = res && res.message ? res.message : 'Đăng nhập không thành công.';
        this.showToast(errorMsg, 'error');
        setTimeout(() => {
          Auth.signOut();
        }, 2000);
      }
    });
  },

  setupTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item');
        const tabName = btn.dataset.tab;
        this.switchTab(tabName);
      });
    });
  },

  switchTab(tabName) {
    // Cập nhật trạng thái active của Menu Bottom Nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabName);
    });

    // Ẩn/Hiện panel tương ứng
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });

    // Lazy-load dữ liệu tab
    if (tabName === 'bracket') {
      Bracket.init();
    } else if (tabName === 'leaderboard') {
      Leaderboard.init();
      Leaderboard.loadLeaderboard(Leaderboard.currentType);
    } else if (tabName === 'special') {
      Special.init();
      Special.loadSpecialBets();
    }
  },

  setupLogout() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn đăng xuất không?')) {
          Auth.signOut();
        }
      });
    }
  },

  showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button class="toast-close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  showLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('hidden');
  },

  hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('hidden');
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const options = { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' };
      const formatter = new Intl.DateTimeFormat('vi-VN', options);
      const parts = formatter.formatToParts(date);
      let day = '01', month = '01', year = '2026';
      parts.forEach(p => {
        if (p.type === 'day') day = p.value;
        if (p.type === 'month') month = p.value;
        if (p.type === 'year') year = p.value;
      });
      return `${day}/${month}/${year}`;
    } catch (e) {
      console.warn('Lỗi formatDate:', e);
      return dateStr;
    }
  },

  timeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'vừa xong';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'hôm qua';
    return `${days} ngày trước`;
  }
};
