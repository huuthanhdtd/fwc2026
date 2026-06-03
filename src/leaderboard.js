import { API } from './api.js';

export const Leaderboard = {
  initialized: false,
  currentType: 'win',

  init() {
    if (this.initialized) return;

    this.setupEventListeners();
    this.loadLeaderboard(this.currentType);
    this.initialized = true;
  },

  setupEventListeners() {
    const tabs = document.querySelectorAll('.leaderboard-tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        const type = e.target.dataset.type;
        this.currentType = type;
        this.loadLeaderboard(type);
      });
    });
  },

  async loadLeaderboard(type) {
    const metricHeader = document.getElementById('leaderboard-metric-header');
    if (metricHeader) {
      metricHeader.textContent = this.getMetricLabel(type);
    }

    const res = await API.getLeaderboard(type);
    if (res && res.success && res.data) {
      this.renderLeaderboard(res.data, type);
    } else {
      document.getElementById('leaderboard-rows').innerHTML = '<tr><td colspan="3" class="no-data">Không thể tải bảng xếp hạng.</td></tr>';
    }
  },

  renderLeaderboard(data, type) {
    const podiumContainer = document.getElementById('podium-container');
    const tableBody = document.getElementById('leaderboard-rows');

    podiumContainer.innerHTML = '';
    tableBody.innerHTML = '';

    if (data.length === 0) {
      podiumContainer.innerHTML = '<div class="no-data" style="border:none;">Chưa có dữ liệu xếp hạng</div>';
      tableBody.innerHTML = '<tr><td colspan="3" class="no-data">Chưa có ai tham gia dự đoán hoặc trận đấu chưa kết thúc.</td></tr>';
      return;
    }

    const top3 = data.slice(0, 3);
    const rest = data.slice(3);

    const order = [1, 0, 2];
    
    order.forEach(idx => {
      const player = top3[idx];
      if (!player) return;

      const step = document.createElement('div');
      step.className = `podium-step podium-step--${idx + 1}`;

      const avatarUrl = player.photoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${player.email}`;
      const displayName = player.displayName || player.email.split('@')[0];
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';

      step.innerHTML = `
        <span class="podium-badge">${medal}</span>
        <img class="podium-avatar" src="${avatarUrl}" alt="${displayName}" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';">
        <span class="podium-name" title="${player.email}">${displayName}</span>
        <span class="podium-score">${player.count}</span>
      `;
      podiumContainer.appendChild(step);
    });

    data.forEach((player, index) => {
      const row = document.createElement('tr');
      const avatarUrl = player.photoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${player.email}`;
      const displayName = player.displayName || player.email.split('@')[0];

      row.innerHTML = `
        <td class="cell-rank">${index + 1}</td>
        <td class="cell-user">
          <img class="cell-avatar" src="${avatarUrl}" alt="${displayName}" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';">
          <span class="cell-name" title="${player.email}">${displayName}</span>
        </td>
        <td class="cell-metric">${player.count}</td>
      `;
      tableBody.appendChild(row);
    });
  },

  getMetricLabel(type) {
    switch (type) {
      case 'win':
        return 'Thắng';
      case 'lost':
        return 'Thua';
      case 'do':
        return 'Tổng cược';
      case 'khomau':
        return 'Khô máu';
      case 'hp':
        return 'Hiệp phụ';
      default:
        return 'Số lần';
    }
  }
};
