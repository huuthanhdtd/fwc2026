import { API } from './api.js';
import { Auth } from './auth.js';
import { Matches } from './matches.js';
import { App } from './app.js';

export const Special = {
  initialized: false,
  deadline: null, // Ngày diễn ra trận đầu tiên
  uniqueTeams: [],

  async init() {
    if (this.initialized) return;

    this.setupFormSubmit();
    this.setupDeleteHandler();
    this.initialized = true;
  },

  setupFormSubmit() {
    const form = document.getElementById('special-bets-form');
    const btnCancel = document.getElementById('btn-cancel-special');
    if (!form) return;

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        this.exitEditMode();
        App.showToast('Đã hủy chế độ chỉnh sửa.', 'info');
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (this.isLocked()) {
        App.showToast('Giải đấu đã bắt đầu! Đã khóa cược ngoài.', 'error');
        return;
      }

      // Lấy dữ liệu cược
      const sf1 = document.getElementById('sf-team-1').value;
      const sf2 = document.getElementById('sf-team-2').value;
      const sf3 = document.getElementById('sf-team-3').value;
      const sf4 = document.getElementById('sf-team-4').value;

      const sfSelected = [sf1, sf2, sf3, sf4].filter(Boolean);
      const semifinals = sfSelected.sort().join(', ');

      const f1 = document.getElementById('f-team-1').value;
      const f2 = document.getElementById('f-team-2').value;

      const fSelected = [f1, f2].filter(Boolean);
      const finals = fSelected.sort().join(', ');

      const champion = document.getElementById('champion-team').value;
      const topScorer = document.getElementById('top-scorer-input').value.trim();

      // Kiểm tra điền ít nhất một mục
      if (sfSelected.length === 0 && fSelected.length === 0 && !champion && !topScorer) {
        App.showToast('Vui lòng điền ít nhất một mục dự đoán!', 'warning');
        return;
      }

      // Kiểm tra trùng lắp đội bán kết
      const sfSet = new Set(sfSelected);
      if (sfSelected.length !== sfSet.size) {
        App.showToast('Các đội bán kết được chọn không được trùng nhau!', 'warning');
        return;
      }

      // Kiểm tra trùng lắp đội chung kết
      const fSet = new Set(fSelected);
      if (fSelected.length !== fSet.size) {
        App.showToast('Các đội chung kết được chọn không được trùng nhau!', 'warning');
        return;
      }

      const isEdit = form.dataset.mode === 'edit';
      const editingTimestamp = form.dataset.editingTimestamp || null;

      App.showLoading();
      // Gọi API cập nhật lên Google Sheets
      const res = await API.placeSpecialBet(semifinals, finals, champion, topScorer, editingTimestamp);
      App.hideLoading();

      if (res && res.success) {
        App.showToast(res.message, 'success');
        if (isEdit) {
          this.exitEditMode();
        } else {
          form.reset();
          this.loadSpecialBets();
        }
      } else {
        App.showToast(res ? res.message : 'Lỗi không xác định khi lưu cược đặc biệt giải.', 'error');
      }
    });
  },

  isLocked() {
    if (!this.deadline) return false;
    return new Date() > this.deadline;
  },

  async loadSpecialBets() {
    // 1. Tải và đổ danh sách các đội vào dropdown
    await this.populateTeamDropdowns();

    // 2. Xác định hạn chót (Ngày giờ diễn ra Trận 1)
    if (Matches.allMatches && Matches.allMatches.length > 0) {
      this.deadline = new Date(Matches.allMatches[0].date);
    }

    // 3. Cập nhật giao diện Trạng thái khóa cược
    this.updateLockStatus();

    // 4. Lấy tất cả dự đoán đặc biệt của team từ API
    const res = await API.getSpecialBets();
    if (res && res.success && res.data) {
      const allBets = res.data;
      this.allBets = allBets; // Lưu cache danh sách dự đoán


      this.renderTeamSpecialBets(allBets);
    } else {
      document.getElementById('special-bets-rows').innerHTML = `
        <tr><td colspan="6" class="no-data">Không thể tải dữ liệu cược đặc biệt của cả team.</td></tr>
      `;
    }
  },

  async populateTeamDropdowns() {
    if (this.uniqueTeams.length > 0) return;

    // Load matches nếu chưa có cache
    if (!Matches.allMatches || Matches.allMatches.length === 0) {
      await Matches.loadMatches();
    }

    const teamSet = new Set();
    Matches.allMatches.forEach(m => {
      if (m.home && m.home.name && m.home.abbr !== 'TBD') teamSet.add(m.home.name);
      if (m.away && m.away.name && m.away.abbr !== 'TBD') teamSet.add(m.away.name);
    });

    this.uniqueTeams = [...teamSet].sort((a, b) => a.localeCompare(b));

    // Đổ dữ liệu vào tất cả select
    const selects = document.querySelectorAll('.special-select');
    selects.forEach(select => {
      const isSF = select.id.startsWith('sf-');
      const isF = select.id.startsWith('f-');
      const isChamp = select.id === 'champion-team';

      let defaultLabel = 'Chọn đội...';
      if (isSF) defaultLabel = 'Chọn đội bán kết...';
      if (isF) defaultLabel = 'Chọn đội chung kết...';
      if (isChamp) defaultLabel = 'Chọn đội vô địch...';

      select.innerHTML = `<option value="">${defaultLabel}</option>`;
      this.uniqueTeams.forEach(team => {
        const opt = document.createElement('option');
        opt.value = team;
        opt.textContent = team;
        select.appendChild(opt);
      });
    });
  },

  updateLockStatus() {
    const isLocked = this.isLocked();
    const deadlineMsg = document.getElementById('special-bets-deadline-msg');
    const form = document.getElementById('special-bets-form');
    const btn = document.getElementById('btn-save-special');

    if (!deadlineMsg) return;

    if (isLocked) {
      deadlineMsg.textContent = '❌ Giải đấu đã chính thức khởi tranh. Cược ngoài đã khóa!';
      deadlineMsg.className = 'deadline-msg locked';
      if (form) {
        form.querySelectorAll('.special-select, .special-input').forEach(el => el.disabled = true);
      }
      if (btn) btn.disabled = true;
    } else {
      let deadlineText = 'Đang xác định...';
      if (this.deadline) {
        try {
          const options = { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric' };
          const formatter = new Intl.DateTimeFormat('vi-VN', options);
          const parts = formatter.formatToParts(this.deadline);
          let hour = '00', minute = '00', day = '01', month = '01', year = '2026';
          parts.forEach(p => {
            if (p.type === 'hour') hour = p.value;
            if (p.type === 'minute') minute = p.value;
            if (p.type === 'day') day = p.value;
            if (p.type === 'month') month = p.value;
            if (p.type === 'year') year = p.value;
          });
          deadlineText = `${hour}:${minute} ngày ${day}/${month}/${year}`;
        } catch (e) {
          console.warn('Lỗi format deadline GMT+7:', e);
          const hours = String(this.deadline.getHours()).padStart(2, '0');
          const minutes = String(this.deadline.getMinutes()).padStart(2, '0');
          const day = String(this.deadline.getDate()).padStart(2, '0');
          const month = String(this.deadline.getMonth() + 1).padStart(2, '0');
          deadlineText = `${hours}:${minutes} ngày ${day}/${month}/${this.deadline.getFullYear()}`;
        }
      }
      deadlineMsg.textContent = `⏳ Hạn cuối lưu cược ngoài: trước ${deadlineText} (trận khai mạc giải bắt đầu).`;
      deadlineMsg.className = 'deadline-msg open';
    }
  },

  fillForm(bet) {
    try {
      // Xóa trắng trước khi điền
      document.getElementById('sf-team-1').value = "";
      document.getElementById('sf-team-2').value = "";
      document.getElementById('sf-team-3').value = "";
      document.getElementById('sf-team-4').value = "";

      if (bet.semifinals) {
        const sfTeams = bet.semifinals.split(',').map(t => t.trim());
        if (sfTeams[0]) document.getElementById('sf-team-1').value = sfTeams[0];
        if (sfTeams[1]) document.getElementById('sf-team-2').value = sfTeams[1];
        if (sfTeams[2]) document.getElementById('sf-team-3').value = sfTeams[2];
        if (sfTeams[3]) document.getElementById('sf-team-4').value = sfTeams[3];
      }

      // 2 Chung kết
      document.getElementById('f-team-1').value = "";
      document.getElementById('f-team-2').value = "";
      if (bet.finals) {
        const fTeams = bet.finals.split(',').map(t => t.trim());
        if (fTeams[0]) document.getElementById('f-team-1').value = fTeams[0];
        if (fTeams[1]) document.getElementById('f-team-2').value = fTeams[1];
      }

      // Vô địch
      document.getElementById('champion-team').value = bet.champion || "";

      // Vua phá lưới
      document.getElementById('top-scorer-input').value = bet.topScorer || "";
    } catch (e) {
      console.warn('Lỗi khi tự động điền form cược ngoài:', e);
    }
  },

  renderTeamSpecialBets(bets) {
    const tbody = document.getElementById('special-bets-rows');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (bets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="no-data">Chưa có ai đặt cược đặc biệt.</td></tr>`;
      return;
    }

    // Sắp xếp theo thời gian (Mới nhất -> Cũ nhất)
    bets.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const currentUser = Auth.getUser();
    const isLocked = this.isLocked();

    bets.forEach(bet => {
      const tr = document.createElement('tr');

      const userCell = `
        <div class="user-cell">
          <strong>${bet.displayName || bet.email.split('@')[0]}</strong>
        </div>
      `;

      let actionButtonsHtml = '-';
      if (currentUser && bet.email === currentUser.email && !isLocked) {
        actionButtonsHtml = `
          <button class="btn-edit-special" data-timestamp="${bet.timestamp}" style="background: rgba(201, 168, 76, 0.15); border: 1px solid var(--primary); color: var(--primary); padding: 4px 8px; border-radius: var(--radius-sm); font-size: 0.75rem; cursor: pointer; transition: var(--transition); margin-right: 4px;">Sửa</button>
          <button class="btn-delete-special" data-timestamp="${bet.timestamp}" style="background: rgba(231, 76, 60, 0.15); border: 1px solid var(--error); color: var(--error); padding: 4px 8px; border-radius: var(--radius-sm); font-size: 0.75rem; cursor: pointer; transition: var(--transition);">Xóa</button>
        `;
      }

      tr.innerHTML = `
        <td>${userCell}</td>
        <td>${bet.semifinals || '-'}</td>
        <td>${bet.finals || '-'}</td>
        <td style="color:var(--primary); font-weight:600;">${bet.champion || '-'}</td>
        <td style="font-style:italic;">${bet.topScorer || '-'}</td>
        <td>${actionButtonsHtml}</td>
      `;

      tbody.appendChild(tr);
    });
  },

  enterEditMode(bet) {
    const form = document.getElementById('special-bets-form');
    const btnSave = document.getElementById('btn-save-special');
    const btnCancel = document.getElementById('btn-cancel-special');
    if (!form || !btnSave || !btnCancel) return;

    form.dataset.mode = 'edit';
    form.dataset.editingTimestamp = bet.timestamp;

    this.fillForm(bet);

    btnSave.textContent = 'Cập nhật dự đoán';
    btnCancel.classList.remove('hidden');

    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  exitEditMode() {
    const form = document.getElementById('special-bets-form');
    const btnSave = document.getElementById('btn-save-special');
    const btnCancel = document.getElementById('btn-cancel-special');
    if (!form || !btnSave || !btnCancel) return;

    form.removeAttribute('data-mode');
    form.removeAttribute('data-editing-timestamp');

    form.reset();

    btnSave.textContent = 'Lưu dự đoán đặc biệt';
    btnCancel.classList.add('hidden');

    this.loadSpecialBets();
  },

  setupDeleteHandler() {
    const tbody = document.getElementById('special-bets-rows');
    if (!tbody) return;

    tbody.addEventListener('click', async (e) => {
      // Nhấp nút Xóa
      if (e.target.classList.contains('btn-delete-special')) {
        const btn = e.target;
        const timestamp = btn.dataset.timestamp;

        if (confirm('Bạn có chắc chắn muốn xóa dự đoán cược ngoài này không?')) {
          App.showLoading();
          const res = await API.deleteSpecialBet(timestamp);
          App.hideLoading();
          if (res && res.success) {
            App.showToast(res.message, 'success');
            await this.loadSpecialBets();
          } else {
            App.showToast(res ? res.message : 'Lỗi không thể xóa dự đoán cược ngoài.', 'error');
          }
        }
      }

      // Nhấp nút Sửa
      if (e.target.classList.contains('btn-edit-special')) {
        const btn = e.target;
        const timestamp = btn.dataset.timestamp;
        const bet = this.allBets.find(b => b.timestamp === timestamp);
        if (bet) {
          this.enterEditMode(bet);
          App.showToast('Đã điền cược cần sửa vào form phía trên.', 'info');
        }
      }
    });
  }
};
