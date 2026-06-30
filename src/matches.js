import { API } from './api.js';
import { Auth } from './auth.js';
import { App } from './app.js';

export const Matches = {
  allMatches: [],
  knockoutMatches: [],  // includes TBD knockout matches for bracket display
  selectedDate: null,

  async init() {
    this.setupEventListeners();
    await this.loadMatches();
    this.renderDateBar();

    const todayStr = this.getTodayDateStr();
    const todayMatches = this.allMatches.filter(m => m.localDateOnly === todayStr);
    const hasMatchesToday = todayMatches.length > 0;
    const allTodayMatchesFinished = hasMatchesToday && todayMatches.every(m => m.status === 0);

    let targetDate = todayStr;

    if (hasMatchesToday && !allTodayMatchesFinished) {
      targetDate = todayStr;
    } else {
      // Tìm ngày đầu tiên có trận đấu chưa kết thúc sau ngày hôm nay
      const nextMatch = this.allMatches.find(m => m.localDateOnly > todayStr && !this.isMatchFinished(m));
      if (nextMatch) {
        targetDate = nextMatch.localDateOnly;
      } else {
        // Nếu không có trận tiếp theo chưa kết thúc, tìm trận chưa kết thúc bất kỳ
        const anyActiveMatch = this.allMatches.find(m => !this.isMatchFinished(m));
        if (anyActiveMatch) {
          targetDate = anyActiveMatch.localDateOnly;
        } else if (this.allMatches.length > 0) {
          // Nếu tất cả trận đã kết thúc, chọn ngày của trận cuối cùng
          targetDate = this.allMatches[this.allMatches.length - 1].localDateOnly;
        }
      }
    }

    this.filterByDate(targetDate, true);

    // Mặc định cuộn sang phải cùng trên thanh chọn ngày
    const scrollContainer = document.querySelector('.date-scroll-container');
    if (scrollContainer) {
      setTimeout(() => {
        scrollContainer.scrollLeft = scrollContainer.scrollWidth;
      }, 100);
    }
  },

  setupEventListeners() {
    // Event delegation cho đặt dự đoán từ Card
    document.getElementById('matches-list').addEventListener('click', async (e) => {
      // Nút đặt dự đoán
      if (e.target.classList.contains('bet-btn')) {
        const card = e.target.closest('.match-card');
        const matchId = card.dataset.matchId;
        const matchNumber = card.dataset.matchNumber;
        const input = card.querySelector('.bet-input');
        const select = card.querySelector('.bet-type-select');

        await this.handlePlaceBet(matchId, matchNumber, input, select, card);
      }

      // Click vào dự đoán của tôi để sửa nhanh
      if (e.target.closest('.my-pred-tag--editable')) {
        const tag = e.target.closest('.my-pred-tag--editable');
        const score = tag.dataset.score;
        const type = tag.dataset.type;
        const card = tag.closest('.match-card');

        this.enterEditMode(card, score, type);
        App.showToast('Đã bật chế độ chỉnh sửa. Nhập tỷ số mới và ấn Cập nhật hoặc Hủy.', 'info');
      }

      // Click nút Hủy trong chế độ sửa
      if (e.target.classList.contains('bet-cancel-btn')) {
        const card = e.target.closest('.match-card');
        this.exitEditMode(card);
        App.showToast('Đã hủy chế độ chỉnh sửa.', 'info');
      }

      // Toggle xem danh sách dự đoán của team
      if (e.target.closest('.bets-header')) {
        const header = e.target.closest('.bets-header');
        const list = header.nextElementSibling;
        list.classList.toggle('hidden');
      }
    });

    // Enter key cho input dự đoán
    document.getElementById('matches-list').addEventListener('keypress', async (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('bet-input')) {
        const card = e.target.closest('.match-card');
        const btn = card.querySelector('.bet-btn');
        btn.click();
      }
    });
  },

  async loadMatches() {
    const res = await API.fetchMatches();
    if (res && res.success && res.data && res.data.Results) {
      const normalized = res.data.Results.map(m => this.normalizeMatch(m));
      this.allMatches = normalized.filter(m => m.home.abbr !== 'TBD' && m.away.abbr !== 'TBD');
      // Lưu tất cả trận knockout (kể cả TBD) cho sơ đồ bracket
      this.knockoutMatches = normalized.filter(m => parseInt(m.matchNumber, 10) >= 73);
      // this.allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else {
      App.showToast('Không thể tải lịch thi đấu từ FIFA API.', 'error');
    }
  },

  normalizeMatch(m) {
    // Xử lý cờ
    const getFlagUrl = (abbr, picUrl) => {
      if (picUrl) {
        return picUrl.replace('{format}', 'sq').replace('{size}', '2');
      }
      if (abbr && abbr !== 'TBD') {
        return `https://api.fifa.com/api/v3/picture/flags-sq-2/${abbr}`;
      }
      return 'https://api.fifa.com/api/v3/picture/flags-sq-2/TBD';
    };

    // Tên đội
    const getTeamName = (team, placeholder) => {
      if (team && team.TeamName && team.TeamName.length > 0) {
        return team.TeamName[0].Description;
      }
      return placeholder || 'Chưa xác định';
    };

    let localDateOnly = '';
    try {
      const dateObj = new Date(m.Date);

      // Lấy giờ và phút ở múi giờ Asia/Ho_Chi_Minh
      const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hour12: false });
      const minFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', minute: 'numeric' });
      const vnHour = parseInt(hourFormatter.format(dateObj), 10);
      const vnMin = parseInt(minFormatter.format(dateObj), 10);

      let finalDateObj = dateObj;
      if (vnHour * 60 + vnMin > 13 * 60) {
        finalDateObj = new Date(dateObj.getTime() + 24 * 60 * 60 * 1000);
      }

      const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
      localDateOnly = formatter.format(finalDateObj);
    } catch (e) {
      console.warn('Lỗi format GMT+7 localDateOnly:', e);
      localDateOnly = (m.LocalDate || m.Date).substring(0, 10);
    }

    return {
      id: m.IdMatch,
      matchNumber: m.MatchNumber,
      date: m.Date,
      localDate: m.Date,
      localDateOnly: localDateOnly,
      stage: m.StageName && m.StageName[0] ? m.StageName[0].Description : 'Vòng bảng',
      group: m.GroupName && m.GroupName[0] ? m.GroupName[0].Description : '',
      home: {
        name: getTeamName(m.Home, m.PlaceHolderA),
        abbr: m.Home ? m.Home.Abbreviation : 'TBD',
        flag: getFlagUrl(m.Home ? m.Home.Abbreviation : '', m.Home ? m.Home.PictureUrl : null),
        score: m.HomeTeamScore
      },
      away: {
        name: getTeamName(m.Away, m.PlaceHolderB),
        abbr: m.Away ? m.Away.Abbreviation : 'TBD',
        flag: getFlagUrl(m.Away ? m.Away.Abbreviation : '', m.Away ? m.Away.PictureUrl : null),
        score: m.AwayTeamScore
      },
      // Raw placeholders cho bracket display (khi đội chưa được xác định)
      homePlaceholder: m.PlaceHolderA || '',
      awayPlaceholder: m.PlaceHolderB || '',
      stadium: m.Stadium && m.Stadium.Name ? m.Stadium.Name[0].Description : 'Đang cập nhật',
      city: m.Stadium && m.Stadium.CityName ? m.Stadium.CityName[0].Description + ', ' + m.Stadium.IdCountry : '',
      status: m.MatchStatus,
      resultType: m.ResultType,
      homePenaltyScore: m.HomeTeamPenaltyScore,
      awayPenaltyScore: m.AwayTeamPenaltyScore,
      matchTime: m.MatchTime || m.matchTime || ''
    };
  },

  isMatchFinished(match) {
    const now = new Date();
    const matchStartTime = new Date(match.date);
    return (
      match.status === 0 || (now > matchStartTime && (now - matchStartTime > 130 * 60 * 1000))
    );
  },

  isSecondHalfStarted(match) {
    const now = new Date();
    const matchStartTime = new Date(match.date);
    const elapsedMs = now.getTime() - matchStartTime.getTime();

    if (match.status === 0) {
      return true;
    }

    if (match.status === 3 || match.status === 4) {
      if (match.matchTime) {
        const minutes = parseInt(match.matchTime.split('+')[0].replace(/[^0-9]/g, ''), 10);
        if (!isNaN(minutes) && minutes > 45) {
          return true;
        }
      }
      if (elapsedMs >= 60 * 60 * 1000) {
        return true;
      }
    }

    return false;
  },

  getOpenBetTypes(match) {
    const now = new Date();
    const matchStartTime = new Date(match.date);
    const isStarted = match.status === 3 || match.status === 4 || match.status === 0 || now > matchStartTime;
    const isFinished = this.isMatchFinished(match);

    const openTypes = [];

    // 1. Cược 90' (do) chỉ mở trước khi trận đấu bắt đầu
    if (!isStarted) {
      openTypes.push('do');
    }

    // 2. Cược khô máu (khomau) mở trước khi bắt đầu hiệp 2 và chưa kết thúc trận
    const is2ndHalf = this.isSecondHalfStarted(match);
    if (isStarted && !is2ndHalf && !isFinished) {
      openTypes.push('khomau');
    }

    // 3. Cược hiệp phụ (hp) chỉ cho trận từ vòng 32 trở đi, mở khi bắt đầu hiệp 2 và chưa kết thúc trận
    if (is2ndHalf && !isFinished && match.matchNumber >= 73) {
      openTypes.push('hp');
    }

    return openTypes;
  },

  getStageClassForDate(dateStr) {
    const matches = this.allMatches.filter(m => m.localDateOnly === dateStr);
    if (matches.length === 0) return 'stage-group';

    // Tìm mã trận lớn nhất để quyết định vòng đấu cao nhất trong ngày
    let maxMatchNum = 0;
    for (const m of matches) {
      const num = parseInt(m.matchNumber, 10);
      if (!isNaN(num) && num > maxMatchNum) {
        maxMatchNum = num;
      }
    }

    if (maxMatchNum >= 1 && maxMatchNum <= 72) return 'stage-group';
    if (maxMatchNum >= 73 && maxMatchNum <= 88) return 'stage-r32';
    if (maxMatchNum >= 89 && maxMatchNum <= 96) return 'stage-r16';
    if (maxMatchNum >= 97 && maxMatchNum <= 100) return 'stage-qf';
    if (maxMatchNum >= 101 && maxMatchNum <= 102) return 'stage-sf';
    if (maxMatchNum === 103) return 'stage-third';
    if (maxMatchNum === 104) return 'stage-final';

    return 'stage-group';
  },

  renderDateBar() {
    const pillsContainer = document.getElementById('date-pills');
    pillsContainer.innerHTML = '';

    // Lấy danh sách các ngày thi đấu độc nhất
    const uniqueDates = [...new Set(this.allMatches.map(m => m.localDateOnly))];

    uniqueDates.forEach(dateStr => {
      // Tách phần ngày tháng trực tiếp từ YYYY-MM-DD để tránh lệch múi giờ
      const parts = dateStr.split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);

      // Tạo date object ở GMT+7 để lấy thứ trong tuần chính xác
      const dateObj = new Date(`${dateStr}T12:00:00+07:00`);

      const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' });
      const weekdayStr = weekdayFormatter.format(dateObj); // returns "Sun", "Mon", ...
      const daysOfWeekMap = {
        'Sun': 'CN', 'Mon': 'T2', 'Tue': 'T3', 'Wed': 'T4', 'Thu': 'T5', 'Fri': 'T6', 'Sat': 'T7'
      };
      const dayName = daysOfWeekMap[weekdayStr] || 'CN';
      const dayMonthStr = `${day}/${month}`;

      const pill = document.createElement('div');
      const stageClass = this.getStageClassForDate(dateStr);
      pill.className = `date-pill ${stageClass}`;
      pill.dataset.date = dateStr;

      pill.innerHTML = `
        <span class="pill-day">${dayName}</span>
        <span class="pill-date">${dayMonthStr}</span>
      `;

      pill.addEventListener('click', () => {
        this.filterByDate(dateStr);
      });

      pillsContainer.appendChild(pill);
    });
  },

  filterByDate(dateStr, isInitial = false) {
    this.selectedDate = dateStr;

    // Cập nhật active pill
    document.querySelectorAll('.date-pill').forEach(pill => {
      if (pill.dataset.date === dateStr) {
        pill.classList.add('active');
        if (!isInitial) {
          pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      } else {
        pill.classList.remove('active');
      }
    });

    // Lọc trận đấu
    const filtered = this.allMatches.filter(m => m.localDateOnly === dateStr);
    this.renderMatches(filtered);
  },

  async renderMatches(matches) {
    const container = document.getElementById('matches-list');
    container.innerHTML = '';

    if (matches.length === 0) {
      container.innerHTML = '<div class="no-matches-placeholder">Không có trận đấu nào trong ngày này.</div>';
      return;
    }

    // Fetch all bets for these matches in bulk
    let bulkBets = {};
    if (matches.length > 0) {
      const matchIds = matches.map(m => m.id).join(',');
      const res = await API.getMatchBets(matchIds, true);
      if (res && res.success && res.data) {
        bulkBets = res.data;
      }
    }

    const template = document.getElementById('match-card-template');

    matches.forEach(match => {
      const card = template.content.cloneNode(true).querySelector('.match-card');

      card.dataset.matchId = match.id;
      card.dataset.matchNumber = match.matchNumber;

      // Meta info
      card.querySelector('.match-card__group').textContent = match.group || match.stage;
      card.querySelector('.match-card__number').textContent = `Trận #${match.matchNumber}`;

      // Status
      let displayStatus = match.status;
      // if (this.isMatchFinished(match)) {
      //   displayStatus = 10;
      // }
      // else if (displayStatus !== 3 && displayStatus !== 4 && displayStatus !== 12) {
      //   // Nếu chưa bắt đầu nhưng đã quá giờ đấu (mà chưa đủ 130 phút) -> Đang diễn ra
      //   const now = new Date();
      //   const matchStartTime = new Date(match.date);
      //   if (now > matchStartTime) {
      //     displayStatus = 3;
      //   }
      // }

      const statusBadge = card.querySelector('.match-card__status');
      let statusText = this.getStatusText(displayStatus);
      if (statusText === "Đang đá") {
        if (match.matchTime === "") {
          statusText = "Nghỉ giữa hiệp";
        } else {
          statusText += " (" + match.matchTime + ")";
        }
      }
      statusBadge.textContent = statusText;
      statusBadge.className = `match-card__status ${this.getStatusClass(displayStatus)}`;

      // Time & Stadium
      const timeStr = this.formatMatchTime(match.localDate);
      card.querySelector('.match-card__time').textContent = timeStr;
      card.querySelector('.match-card__stadium').textContent = `${match.stadium}, ${match.city}`;

      // Teams
      card.querySelector('.team--home .team__name').textContent = match.home.name;
      card.querySelector('.team--home .team__flag').src = match.home.flag;

      card.querySelector('.team--away .team__name').textContent = match.away.name;
      card.querySelector('.team--away .team__flag').src = match.away.flag;

      // Scores
      const scoreHome = card.querySelector('.score__home');
      const scoreAway = card.querySelector('.score__away');
      if (match.home.score !== null && match.away.score !== null) {
        scoreHome.textContent = match.home.score;
        scoreAway.textContent = match.away.score;
        scoreHome.classList.add('official-score');
        scoreAway.classList.add('official-score');
      } else {
        scoreHome.textContent = '-';
        scoreAway.textContent = '-';
      }

      // Extra status (Hiệp phụ, penalty)
      const extraStatus = card.querySelector('.match-card__extra-status');
      if (match.homePenaltyScore !== null && match.awayPenaltyScore !== null) {
        extraStatus.textContent = `Penalty: ${match.home.abbr} ${match.homePenaltyScore} - ${match.awayPenaltyScore} ${match.away.abbr}`;
        extraStatus.classList.remove('hidden');
      } else if (match.resultType === 2) {
        extraStatus.textContent = 'Sau hiệp phụ';
        extraStatus.classList.remove('hidden');
      } else {
        extraStatus.classList.add('hidden');
      }

      // Cấu hình các loại cược đang mở và hiển thị hàng input
      const openBetTypes = this.getOpenBetTypes(match);
      const betInputRow = card.querySelector('.bet-input-row');

      if (openBetTypes.length > 0) {
        betInputRow.classList.remove('hidden');
        const select = card.querySelector('.bet-type-select');
        select.innerHTML = '';

        if (openBetTypes.includes('do')) {
          const opt = document.createElement('option');
          opt.value = 'do';
          opt.textContent = "90'";
          select.appendChild(opt);
        }
        if (openBetTypes.includes('khomau')) {
          const opt = document.createElement('option');
          opt.value = 'khomau';
          opt.textContent = "🩸";
          select.appendChild(opt);
        }
        if (openBetTypes.includes('hp')) {
          const opt = document.createElement('option');
          opt.value = 'hp';
          opt.textContent = "⭐";
          select.appendChild(opt);
        }
      } else {
        betInputRow.classList.add('hidden');
      }

      // Load dự đoán của trận đấu này
      const bets = bulkBets[match.id] || [];
      this.loadMatchBetsAndPredictions(match, card, bets);

      container.appendChild(card);
    });
  },

  async loadMatchBetsAndPredictions(match, card, bets = null) {
    const betsListContainer = card.querySelector('.bets-list');
    const badgeCount = card.querySelector('.bets-count-badge');
    const myPredContainer = card.querySelector('.bet-my-prediction');

    if (!bets) {
      // Gọi API để lấy danh sách dự đoán
      const res = await API.getMatchBets(match.id);
      if (res && res.success && res.data) {
        bets = res.data;
      } else {
        bets = [];
      }
    }

    if (bets) {
      badgeCount.textContent = bets.length;

      // Sắp xếp dự đoán theo tỉ số (scores) thay vì theo thời gian đặt (timestamp)
      bets.sort((a, b) => {
        const scoreCompare = a.scores.localeCompare(b.scores);
        if (scoreCompare !== 0) return scoreCompare;
        return (a.displayName || a.email).localeCompare(b.displayName || b.email);
      });

      // Hiển thị dự đoán của cả team theo 3 cột: 90', khô máu, hiệp phụ
      betsListContainer.innerHTML = '';
      if (bets.length === 0) {
        betsListContainer.innerHTML = '<div class="no-data" style="grid-column: 1/-1; padding: 10px; font-size: 0.75rem;">Chưa có ai đặt dự đoán.</div>';
      } else {
        const betsByType = {
          do: [],
          khomau: [],
          hp: []
        };

        bets.forEach(bet => {
          if (betsByType[bet.betType]) {
            betsByType[bet.betType].push(bet);
          }
        });

        const createColumn = (title, typeBets, className) => {
          const col = document.createElement('div');
          col.className = `bets-col ${className}`;
          col.innerHTML = `
            <div class="bets-col__title">${title}</div>
            <div class="bets-col__content"></div>
          `;
          const content = col.querySelector('.bets-col__content');
          const isFinished = this.isMatchFinished(match);
          typeBets.forEach(bet => {
            const isCorrect = isFinished && match.home.score !== null && match.away.score !== null &&
              bet.scores.replace(/\s+/g, '') === `${match.home.score}-${match.away.score}`.replace(/\s+/g, '');

            const chip = document.createElement('div');
            chip.className = `bet-item-chip ${isCorrect ? 'bet-item-chip--correct' : ''}`;
            chip.innerHTML = `
              <span class="bet-chip-score">${bet.scores}</span>
              <span class="bet-chip-user" title="${bet.displayName || bet.email}">${bet.displayName || bet.email.split('@')[0]}</span>
            `;
            content.appendChild(chip);
          });
          return col;
        };

        // Cột 90 phút (luôn hiển thị, kể cả khi rỗng)
        const colDo = createColumn("90 Phút", betsByType.do, "bets-col--do");
        betsListContainer.appendChild(colDo);

        // Cột Khô máu (chỉ hiển thị nếu có dự đoán)
        if (betsByType.khomau.length > 0) {
          const colKhomau = createColumn("🩸 Khô máu", betsByType.khomau, "bets-col--khomau");
          betsListContainer.appendChild(colKhomau);
        }

        // Cột Hiệp phụ (chỉ hiển thị nếu có dự đoán)
        if (betsByType.hp.length > 0) {
          const colHp = createColumn("⭐ Hiệp phụ", betsByType.hp, "bets-col--hp");
          betsListContainer.appendChild(colHp);
        }
      }

      // Hiển thị dự đoán của chính mình
      const myUser = Auth.getUser();
      if (myUser) {
        const myBets = bets.filter(b => b.email === myUser.email);
        myPredContainer.innerHTML = '';
        if (myBets.length > 0) {
          myPredContainer.innerHTML = 'Dự đoán của bạn: ';

          // Nhóm dự đoán của mình theo betType
          const grouped = {};
          myBets.forEach(b => {
            if (!grouped[b.betType]) {
              grouped[b.betType] = [];
            }
            grouped[b.betType].push(b.scores);
          });

          const isFinished = this.isMatchFinished(match);
          Object.keys(grouped).forEach(betType => {
            const scoresStr = grouped[betType].join(', ');

            let hasCorrect = false;
            if (isFinished && match.home.score !== null && match.away.score !== null) {
              const actualScoreStr = `${match.home.score}-${match.away.score}`.replace(/\s+/g, '');
              hasCorrect = grouped[betType].some(score => score.replace(/\s+/g, '') === actualScoreStr);
            }

            const openBetTypes = this.getOpenBetTypes(match);
            const isOpen = openBetTypes.includes(betType);

            const span = document.createElement('span');
            span.className = `my-pred-tag ${isOpen ? 'my-pred-tag--editable' : ''} ${hasCorrect ? 'my-pred-tag--correct' : ''}`;
            span.dataset.score = scoresStr;
            span.dataset.type = betType;

            let typeLabel = '90\'';
            if (betType === 'khomau') typeLabel = '🩸';
            if (betType === 'hp') typeLabel = '⭐';

            if (isOpen) {
              span.title = 'Nhấp để chỉnh sửa dự đoán này';
              span.innerHTML = `${scoresStr} (${typeLabel}) <span class="edit-icon">✏️</span>`;
            } else {
              span.title = 'Dự đoán này đã khóa';
              span.innerHTML = `${scoresStr} (${typeLabel})`;
            }
            myPredContainer.appendChild(span);
          });
        } else {
          myPredContainer.textContent = 'Bạn chưa đặt dự đoán trận này.';
        }
      }
    }
  },

  enterEditMode(card, score, type) {
    card.dataset.mode = 'edit';
    card.dataset.editingScore = score;
    card.dataset.editingType = type;

    const input = card.querySelector('.bet-input');
    const select = card.querySelector('.bet-type-select');
    const btnSave = card.querySelector('.bet-btn');
    const btnCancel = card.querySelector('.bet-cancel-btn');
    const betInputRow = card.querySelector('.bet-input-row');

    if (input && select && btnSave && btnCancel && betInputRow) {
      // Đảm bảo option đang edit có trong select
      let hasOption = false;
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === type) {
          hasOption = true;
          break;
        }
      }
      if (!hasOption) {
        const opt = document.createElement('option');
        opt.value = type;
        const labels = { 'do': "90'", 'khomau': "🩸", 'hp': "⭐" };
        opt.textContent = labels[type] || type;
        select.appendChild(opt);
      }

      input.value = score;
      select.value = type;
      btnSave.textContent = 'Lưu';
      btnCancel.classList.remove('hidden');
      betInputRow.classList.remove('hidden');
      input.focus();
    }
  },

  exitEditMode(card) {
    card.removeAttribute('data-mode');
    card.removeAttribute('data-editing-score');
    card.removeAttribute('data-editing-type');

    const input = card.querySelector('.bet-input');
    const btnSave = card.querySelector('.bet-btn');
    const btnCancel = card.querySelector('.bet-cancel-btn');
    const betInputRow = card.querySelector('.bet-input-row');

    if (input) input.value = '';
    if (btnSave) btnSave.textContent = 'Lưu';
    if (btnCancel) btnCancel.classList.add('hidden');

    // Khôi phục hiển thị hàng input dựa trên trạng thái thực tế
    const matchId = card.dataset.matchId;
    const match = this.allMatches.find(m => m.id === matchId);
    if (match && betInputRow) {
      const openBetTypes = this.getOpenBetTypes(match);
      if (openBetTypes.length > 0) {
        betInputRow.classList.remove('hidden');
        const select = card.querySelector('.bet-type-select');
        if (select) {
          select.innerHTML = '';
          if (openBetTypes.includes('do')) {
            const opt = document.createElement('option');
            opt.value = 'do';
            opt.textContent = "90'";
            select.appendChild(opt);
          }
          if (openBetTypes.includes('khomau')) {
            const opt = document.createElement('option');
            opt.value = 'khomau';
            opt.textContent = "🩸";
            select.appendChild(opt);
          }
          if (openBetTypes.includes('hp')) {
            const opt = document.createElement('option');
            opt.value = 'hp';
            opt.textContent = "⭐";
            select.appendChild(opt);
          }
        }
      } else {
        betInputRow.classList.add('hidden');
      }
    }
  },

  async handlePlaceBet(matchId, matchNumber, input, select, card) {
    const scores = input.value.trim();
    const betType = select.value;

    if (!scores) {
      App.showToast('Vui lòng nhập tỷ số!', 'warning');
      return;
    }

    const parts = scores.split(',').map(s => s.trim());
    const isValid = parts.every(p => /^\d+-\d+$/.test(p));
    if (!isValid) {
      App.showToast('Định dạng tỷ số không đúng! VD: 2-1 hoặc 2-1,3-2', 'warning');
      return;
    }

    const match = this.allMatches.find(m => m.id === matchId);
    if (!match) return;

    const isEdit = card.dataset.mode === 'edit';

    const res = await API.placeBet(
      matchId,
      matchNumber,
      scores,
      betType,
      match.home.name,
      match.away.name,
      match.localDateOnly,
      isEdit // overwrite parameter
    );

    if (res && res.success) {
      App.showToast(res.message, 'success');
      this.exitEditMode(card);
      this.loadMatchBetsAndPredictions(match, card);
    } else {
      App.showToast(res ? res.message : 'Lỗi không xác định khi đặt dự đoán.', 'error');
    }
  },

  getStatusText(status) {
    switch (status) {
      case 0:
      case 10:
        return 'Kết thúc';
      case 1:
        return 'Sắp đá';
      case 3:
      case 4:
        return 'Đang đá';
      case 12:
        return 'Chốt đội hình';
      default:
        return 'Chưa đá';
    }
  },

  getStatusClass(status) {
    switch (status) {
      case 0:
      case 10:
        return 'badge-finished';
      case 1:
        return 'badge-upcoming';
      case 3:
      case 4:
      case 12:
        return 'badge-live';
      default:
        return 'badge-upcoming';
    }
  },

  formatMatchTime(dateStr) {
    try {
      const date = new Date(dateStr);
      const options = { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric' };
      const formatter = new Intl.DateTimeFormat('vi-VN', options);
      const parts = formatter.formatToParts(date);

      let hour = '00', minute = '00', day = '01', month = '01', year = '2026';
      parts.forEach(p => {
        if (p.type === 'hour') hour = p.value;
        if (p.type === 'minute') minute = p.value;
        if (p.type === 'day') day = p.value;
        if (p.type === 'month') month = p.value;
        if (p.type === 'year') year = p.value;
      });
      return `${hour}:${minute} • ${day}/${month}/${year}`;
    } catch (e) {
      console.warn('Lỗi formatMatchTime:', e);
      return dateStr;
    }
  },

  getTodayDateStr() {
    try {
      const date = new Date();
      const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
      return formatter.format(date);
    } catch (e) {
      console.warn('Lỗi getTodayDateStr:', e);
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
};
