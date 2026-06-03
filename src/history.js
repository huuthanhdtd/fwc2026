import { API } from './api.js';
import { Auth } from './auth.js';
import { Matches } from './matches.js';
import { App } from './app.js';

export const History = {
  myBets: [],
  initialized: false,

  async init() {
    if (this.initialized) return;

    this.setupFilters();
    this.setupEditHandlers();
    await this.loadHistory();
    this.initialized = true;
  },

  setupFilters() {
    const selectMatch = document.getElementById('filter-match');
    const inputDate = document.getElementById('filter-date');

    selectMatch.addEventListener('change', () => this.applyFilters());
    inputDate.addEventListener('input', () => this.applyFilters());

    this.populateMatchSelect();
  },

  setupEditHandlers() {
    const container = document.getElementById('history-list');
    if (!container) return;

    container.addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-edit-bet')) {
        const btn = e.target;
        const matchId = btn.dataset.matchId;
        const matchNumber = btn.dataset.matchNumber;
        const betType = btn.dataset.betType;
        const oldScores = btn.dataset.scores;
        const homeTeam = btn.dataset.homeTeam;
        const awayTeam = btn.dataset.awayTeam;
        const matchDate = btn.dataset.matchDate;

        let betTypeName = '90 phút';
        if (betType === 'khomau') betTypeName = 'Khô máu';
        if (betType === 'hp') betTypeName = 'Hiệp phụ';

        const newScores = prompt(`Chỉnh sửa dự đoán [${betTypeName}] cho trận này.\nTỉ số cũ: ${oldScores}\nNhập tỉ số mới (VD: 2-1):`, oldScores);
        
        if (newScores === null) return;
        
        const scoreVal = newScores.trim();
        if (!scoreVal) {
          App.showToast('Vui lòng nhập tỷ số!', 'warning');
          return;
        }

        const parts = scoreVal.split(',').map(s => s.trim());
        const isValid = parts.every(p => /^\d+-\d+$/.test(p));
        if (!isValid) {
          App.showToast('Định dạng tỷ số không đúng! VD: 2-1 hoặc 2-1,3-2', 'warning');
          return;
        }

        if (scoreVal === oldScores) {
          App.showToast('Tỉ số mới trùng với tỉ số cũ!', 'info');
          return;
        }

        const res = await API.placeBet(matchId, matchNumber, scoreVal, betType, homeTeam, awayTeam, matchDate);
        
        if (res && res.success) {
          App.showToast(res.message, 'success');
          await this.loadHistory();
        } else {
          App.showToast(res ? res.message : 'Lỗi không xác định khi cập nhật cược.', 'error');
        }
      }
    });
  },

  populateMatchSelect() {
    const selectMatch = document.getElementById('filter-match');
    selectMatch.innerHTML = '<option value="all">Tất cả trận đấu</option>';

    Matches.allMatches.forEach(match => {
      const option = document.createElement('option');
      option.value = match.id;
      
      const homeName = match.home.abbr || match.home.name;
      const awayName = match.away.abbr || match.away.name;
      option.textContent = `Trận #${match.matchNumber}: ${homeName} vs ${awayName}`;
      
      selectMatch.appendChild(option);
    });
  },

  async loadHistory() {
    const user = Auth.getUser();
    if (!user) return;

    const res = await API.getMyBets('all');
    if (res && res.success && res.data) {
      this.myBets = res.data;
      this.applyFilters();
    } else {
      document.getElementById('history-list').innerHTML = '<div class="no-data">Không thể tải lịch sử đặt cược.</div>';
    }
  },

  applyFilters() {
    const selectMatch = document.getElementById('filter-match').value;
    const inputDate = document.getElementById('filter-date').value;

    let filtered = [...this.myBets];

    if (selectMatch !== 'all') {
      filtered = filtered.filter(b => String(b.matchId) === String(selectMatch));
    }

    if (inputDate) {
      filtered = filtered.filter(b => b.matchDate === inputDate);
    }

    this.renderBets(filtered);
  },

  renderBets(bets) {
    const container = document.getElementById('history-list');
    container.innerHTML = '';

    if (bets.length === 0) {
      container.innerHTML = '<div class="no-data">Không tìm thấy dữ liệu đặt cược phù hợp.</div>';
      return;
    }

    bets.forEach(bet => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const actualMatch = Matches.allMatches.find(m => m.id === String(bet.matchId));
      
      let matchDateStr = bet.matchDate ? App.formatDate(bet.matchDate) : '';
      let matchInfo = `Trận #${bet.matchId} • Vòng bảng`;
      let scoreText = '- : -';
      let statusText = 'Chờ kết quả';
      let statusClass = 'status-pending';

      let isStarted = false;
      if (actualMatch) {
        matchInfo = `Trận #${actualMatch.matchNumber} • ${actualMatch.group || actualMatch.stage}`;
        
        const d = new Date(actualMatch.date);
        matchDateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        isStarted = actualMatch.status === 3 || actualMatch.status === 4 || actualMatch.status === 12 || actualMatch.status === 10 || new Date() > new Date(actualMatch.date);

        if (actualMatch.home.score !== null && actualMatch.away.score !== null) {
          scoreText = `${actualMatch.home.score} - ${actualMatch.away.score}`;

          if (actualMatch.status === 10) {
            const actualScore = `${actualMatch.home.score}-${actualMatch.away.score}`;
            const predictions = bet.scores.split(',').map(s => s.trim());
            
            const isWin = predictions.includes(actualScore);
            if (isWin) {
              statusText = 'Thắng ✅';
              statusClass = 'status-win';
            } else {
              statusText = 'Thua ❌';
              statusClass = 'status-lost';
            }
          } else {
            statusText = 'Đang đá ⏳';
            statusClass = 'status-pending';
          }
        }
      }

      let betTypeLabel = '90 phút';
      if (bet.betType === 'khomau') betTypeLabel = '🩸 Khô máu';
      if (bet.betType === 'hp') betTypeLabel = '⭐ Hiệp phụ';

      const formattedTime = App.timeAgo(bet.timestamp);

      card.innerHTML = `
        <div class="history-card__header">
          <span>${matchInfo}</span>
          <span>${matchDateStr}</span>
        </div>
        <div class="history-card__teams">
          <strong>${bet.homeTeam || actualMatch?.home.name || 'Đang cập nhật'}</strong>
          <span>vs</span>
          <strong>${bet.awayTeam || actualMatch?.away.name || 'Đang cập nhật'}</strong>
        </div>
        <div class="history-card__prediction">
          <div>
            <span class="pred-tag">${betTypeLabel}</span>
            <span class="pred-score">${bet.scores}</span>
            ${actualMatch && !isStarted ? `
              <button class="btn-edit-bet" 
                data-match-id="${bet.matchId}" 
                data-match-number="${bet.matchNumber || ''}" 
                data-bet-type="${bet.betType}" 
                data-scores="${bet.scores}" 
                data-home-team="${bet.homeTeam || ''}" 
                data-away-team="${bet.awayTeam || ''}" 
                data-match-date="${bet.matchDate || ''}">✏️ Sửa</button>
            ` : ''}
          </div>
          <span class="pred-status ${statusClass}">${statusText}</span>
        </div>
        <div class="history-card__timestamp">
          Tỉ số thực tế: ${scoreText} • Đã đặt ${formattedTime}
        </div>
      `;

      container.appendChild(card);
    });
  }
};
