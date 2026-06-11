// ============================================================
// FWC 2026 BETTING WEBAPP - DISCORD BOT COMMAND HANDLERS
// ============================================================
// Tệp này chứa logic xử lý lệnh nhận được từ Bot Discord.
// ============================================================

/**
 * Phân tích và thực thi lệnh chat.
 * Hỗ trợ các lệnh: do, change, khomau, hp, today, M/d,
 * upcoming, me, top, bet, bk, ck, vd, vpl và các lệnh hashtag #
 *
 * @param {string} message - Nội dung tin nhắn (bắt đầu bằng / hoặc # hoặc không có tiền tố)
 * @param {string} email - Email người gửi
 * @param {string} displayName - Tên hiển thị người gửi
 * @returns {Object} {success, message, data}
 */
function processCommand(message, email, displayName) {
  try {
    var msg = message.trim();
    var parts = msg.split(/\s+/);
    var command = parts[0].toLowerCase();

    // --- Xử lý các lệnh xem dự đoán bắt đầu bằng dấu # ---
    if (command.startsWith('#')) {
      if (command === '#bk') return handleViewSpecialBets('semifinals');
      if (command === '#ck') return handleViewSpecialBets('finals');
      if (command === '#vd' || command === '#vđ') return handleViewSpecialBets('champion');
      if (command === '#vpl') return handleViewSpecialBets('topScorer');
      
      var matchIdMatch = command.match(/^#(\d+)$/);
      if (matchIdMatch) {
        return handleViewMatchBets(matchIdMatch[1]);
      }
    }

    // --- Loại bỏ dấu slash ở đầu lệnh nếu có ---
    if (command.startsWith('/')) {
      command = command.slice(1);
    }

    // --- do #matchId n1-n1 [n2-n2],... ---
    if (command === 'do') {
      return handleBetCommand(parts, email, displayName, 'do');
    }

    // --- khomau #matchId n1-n1 [n2-n2],... ---
    if (command === 'khomau') {
      return handleBetCommand(parts, email, displayName, 'khomau');
    }

    // --- hp #matchId n1-n1 [n2-n2],... ---
    if (command === 'hp') {
      return handleBetCommand(parts, email, displayName, 'hp');
    }

    // --- change #matchId n-nOld n-nNew ---
    if (command === 'change') {
      return handleChangeCommand(parts, email);
    }

    // --- today ---
    if (command === 'today') {
      return handleTodayCommand();
    }

    // --- upcoming ---
    if (command === 'upcoming') {
      return handleUpcomingCommand();
    }

    // --- me [all/#matchId/M/d] ---
    if (command === 'me') {
      var filter = parts.length > 1 ? parts[1] : 'all';
      // Loại bỏ # nếu có
      filter = filter.replace('#', '');
      return getMyBets(email, filter);
    }

    // --- top [do/win/lost/khomau/hp] ---
    if (command === 'top') {
      var topType = parts.length > 1 ? parts[1].toLowerCase() : 'do';
      return getLeaderboard(topType);
    }

    // --- bet [all] ---
    if (command === 'bet') {
      return handleBetInfoCommand(email, parts);
    }

    // --- bk đội 1, đội 2, đội 3, đội 4 ---
    if (command === 'bk') {
      var val = parts.slice(1).join(' ').trim();
      return handleSpecialBetCommand(email, displayName, 'semifinals', val);
    }

    // --- ck đội 1, đội 2 ---
    if (command === 'ck') {
      var val = parts.slice(1).join(' ').trim();
      return handleSpecialBetCommand(email, displayName, 'finals', val);
    }

    // --- vd or vđ tên đội ---
    if (command === 'vd' || command === 'vđ') {
      var val = parts.slice(1).join(' ').trim();
      return handleSpecialBetCommand(email, displayName, 'champion', val);
    }

    // --- vpl tên cầu thủ ---
    if (command === 'vpl') {
      var val = parts.slice(1).join(' ').trim();
      return handleSpecialBetCommand(email, displayName, 'topScorer', val);
    }

    // --- M/d (ví dụ: 6/15) - Trận đấu theo ngày ---
    var dateMatch = command.match(/^(\d{1,2}\/\d{1,2})$/);
    if (dateMatch) {
      return handleDateCommand(dateMatch[1]);
    }

    // --- Lệnh không hợp lệ ---
    return {
      success: false,
      message: '❓ Lệnh không hợp lệ: "' + parts[0] + '"\n\n' +
        '📖 Danh sách lệnh:\n' +
        'do #<trận> <tỷ số> - Đăng ký dự đoán 90\' (Ví dụ: do #1 2-1)\n' +
        'change #<trận> <cũ> <mới> - Sửa tỷ số (Ví dụ: change #1 2-1 1-1)\n' +
        'khomau #<trận> <tỷ số> - Đặt dự đoán Khô máu\n' +
        'hp #<trận> <tỷ số> - Đặt dự đoán Hiệp phụ\n' +
        'today - Xem lịch đấu hôm nay\n' +
        'M/d - Xem lịch đấu ngày cụ thể (Ví dụ: 6/12)\n' +
        'upcoming - Xem các trận sắp tới\n' +
        'me [all/#<trận>/M/d] - Xem đăng ký dự đoán của bạn\n' +
        'top [do/win/lost/khomau/hp] - Xem bảng xếp hạng\n' +
        'bet - Xem tài khoản\n' +
        'bk <đội 1>, <đội 2>, <đội 3>, <đội 4> - Dự đoán Bán kết\n' +
        'ck <đội 1>, <đội 2> - Dự đoán Chung kết\n' +
        'vd <đội> - Dự đoán đội Vô địch\n' +
        'vpl <cầu thủ> - Dự đoán Vua phá lưới\n\n' +
        '🔍 Xem dự đoán của mọi người:\n' +
        '#<trận> - Xem tất cả dự đoán của trận đấu đó (Ví dụ: #5)\n' +
        '#bk - Xem tất cả dự đoán Bán kết\n' +
        '#ck - Xem tất cả dự đoán Chung kết\n' +
        '#vd - Xem tất cả dự đoán Vô địch\n' +
        '#vpl - Xem tất cả dự đoán Vua phá lưới',
      data: null
    };

  } catch (error) {
    return { success: false, message: '❌ Lỗi xử lý lệnh: ' + error.message, data: null };
  }
}

/**
 * Lấy danh sách dự đoán cho Bán kết, Chung kết, Vô địch hoặc Vua phá lưới của tất cả người chơi.
 */
function handleViewSpecialBets(field) {
  var result = getSpecialBets();
  if (!result.success || !result.data) {
    return { success: false, message: '❌ Không thể lấy danh sách dự đoán ngoài.', data: null };
  }
  
  var list = result.data;
  var fieldNames = {
    'semifinals': 'Top 4 Bán Kết 🏆',
    'finals': 'Top 2 Chung Kết 🏆',
    'champion': 'Đội Vô Địch 🥇',
    'topScorer': 'Vua Phá Lưới ⚽'
  };
  
  var lines = [];
  for (var i = 0; i < list.length; i++) {
    var user = list[i];
    var value = user[field];
    if (value) {
      lines.push('• **' + (user.displayName || user.email) + '**: ' + value);
    }
  }
  
  var title = fieldNames[field] || field;
  if (lines.length === 0) {
    return { success: true, message: '📋 Chưa có dự đoán nào cho **' + title + '**.', data: null };
  }
  
  return {
    success: true,
    message: '📋 **Danh sách dự đoán ' + title + ':**\n' + lines.join('\n'),
    data: null
  };
}

/**
 * Lấy tất cả dự đoán của trận đấu cụ thể cho tất cả người chơi theo matchNumber.
 */
function handleViewMatchBets(matchNumber) {
  try {
    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();
    var matchBets = [];
    
    for (var i = 1; i < allData.length; i++) {
      // allData[i][4] chính là matchNumber
      if (String(allData[i][4]) === String(matchNumber)) {
        matchBets.push({
          timestamp: allData[i][0],
          email: allData[i][1],
          displayName: allData[i][2],
          betType: allData[i][5],
          scores: allData[i][6]
        });
      }
    }
    
    if (matchBets.length === 0) {
      return { success: true, message: '📋 Chưa có dự đoán nào cho trận #' + matchNumber, data: null };
    }
    
    // Lấy thêm thông tin trận đấu để hiển thị tên 2 đội đấu
    var homeTeam = '';
    var awayTeam = '';
    var scheduleSheet = getOrCreateSheet('Schedule', SHEET_HEADERS['Schedule']);
    var scheduleData = scheduleSheet.getDataRange().getValues();
    for (var i = 1; i < scheduleData.length; i++) {
      // scheduleData[i][1] chính là matchNumber
      if (String(scheduleData[i][1]) === String(matchNumber)) {
        homeTeam = scheduleData[i][7]; // homeName
        awayTeam = scheduleData[i][11]; // awayName
        break;
      }
    }
    
    var matchHeader = 'Trận #' + matchNumber;
    if (homeTeam && awayTeam) {
      matchHeader += ' (' + homeTeam + ' vs ' + awayTeam + ')';
    }
    
    // Nhóm dự đoán theo loại: do, khomau, hp
    var betTypeName = { 'do': '90\'', 'khomau': '🩸', 'hp': '⭐' };
    var grouped = {};
    
    for (var j = 0; j < matchBets.length; j++) {
      var b = matchBets[j];
      var userName = b.displayName || b.email;
      var type = b.betType;
      var score = b.scores;
      
      if (!grouped[userName]) {
        grouped[userName] = [];
      }
      grouped[userName].push((betTypeName[type] || type) + ': `' + score + '`');
    }
    
    var lines = [];
    for (var user in grouped) {
      lines.push('• **' + user + '**: ' + grouped[user].join(' | '));
    }
    
    return {
      success: true,
      message: '📋 **Tất cả dự đoán ' + matchHeader + ':**\n' + lines.join('\n'),
      data: null
    };
  } catch (error) {
    return { success: false, message: '❌ Lỗi khi lấy danh sách dự đoán trận #' + matchNumber + ': ' + error.message, data: null };
  }
}

/**
 * Xử lý các lệnh dự đoán đặc biệt (Special Bets) từ chat/Discord.
 */
function handleSpecialBetCommand(email, displayName, field, value) {
  try {
    if (!value) {
      return { success: false, message: '❌ Vui lòng nhập thông tin dự đoán đặc biệt!', data: null };
    }

    // Kiểm tra thời gian khóa dự đoán ngoài (trước khi trận khai mạc bắt đầu)
    var scheduleSheet = getOrCreateSheet('Schedule', SHEET_HEADERS['Schedule']);
    var scheduleData = scheduleSheet.getDataRange().getValues();
    var firstMatchStartTime = null;
    
    for (var i = 1; i < scheduleData.length; i++) {
      var matchDateStr = scheduleData[i][2]; // Cột date
      if (matchDateStr) {
        var matchTime = new Date(matchDateStr);
        if (!firstMatchStartTime || matchTime < firstMatchStartTime) {
          firstMatchStartTime = matchTime;
        }
      }
    }
    
    if (firstMatchStartTime && new Date() > firstMatchStartTime) {
      return { success: false, message: '❌ Giải đấu đã chính thức khởi tranh. Bạn không thể đặt hoặc sửa dự đoán ngoài!', data: null };
    }

    // Validate số lượng đội đối với bán kết / chung kết
    if (field === 'semifinals') {
      var teams = value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (teams.length !== 4) {
        return { success: false, message: '❌ Lệnh dự đoán bán kết yêu cầu nhập đúng 4 đội cách nhau bằng dấu phẩy!\nVí dụ: /bk Đức, Pháp, Anh, Ý', data: null };
      }
      value = teams.join(', ');
    } else if (field === 'finals') {
      var teams = value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (teams.length !== 2) {
        return { success: false, message: '❌ Lệnh dự đoán chung kết yêu cầu nhập đúng 2 đội cách nhau bằng dấu phẩy!\nVí dụ: /ck Đức, Pháp', data: null };
      }
      value = teams.join(', ');
    }

    var sheet = getOrCreateSheet('SpecialBets', SHEET_HEADERS['SpecialBets']);
    var allData = sheet.getDataRange().getValues();
    var latestRowIndex = -1;
    var latestRowData = null;

    // Tìm dòng dự đoán gần nhất của user này
    for (var i = allData.length - 1; i >= 1; i--) {
      if (allData[i][1] === email) {
        latestRowIndex = i + 1;
        latestRowData = allData[i];
        break;
      }
    }

    var data = {
      email: email,
      displayName: displayName
    };

    if (latestRowIndex > 0) {
      // Cập nhật dòng dự đoán ngoài hiện tại
      data.timestamp = String(latestRowData[0]);
      data.semifinals = latestRowData[3];
      data.finals = latestRowData[4];
      data.champion = latestRowData[5];
      data.topScorer = latestRowData[6];
      
      // Ghi đè trường tương ứng
      data[field] = value;
    } else {
      // Tạo dự đoán ngoài mới
      data.semifinals = '';
      data.finals = '';
      data.champion = '';
      data.topScorer = '';
      data[field] = value;
    }

    // Gọi hàm placeSpecialBet hiện tại
    return placeSpecialBet(data);

  } catch (error) {
    return { success: false, message: '❌ Lỗi dự đoán ngoài: ' + error.message, data: null };
  }
}

/**
 * Xử lý lệnh đặt dự đoán: /do, /khomau, /hp
 * Format: /do #matchId n1-n1 [n2-n2 n3-n3 ...]
 */
function handleBetCommand(parts, email, displayName, betType) {
  // Cần ít nhất 3 phần: /do #matchId score
  if (parts.length < 3) {
    var typeName = { 'do': 'Dự đoán', 'khomau': 'Khô máu', 'hp': 'Hiệp phụ' };
    return {
      success: false,
      message: '❌ Sai cú pháp!\nĐúng: /' + betType + ' #<số trận> <tỷ số>\nVí dụ: /' + betType + ' #5 2-1 3-0',
      data: null
    };
  }

  // Lấy matchId (bỏ ký tự #)
  var matchIdRaw = parts[1].replace('#', '');
  if (!/^\d+$/.test(matchIdRaw)) {
    return { success: false, message: '❌ Số trận không hợp lệ: ' + parts[1], data: null };
  }

  // Thu thập tất cả tỷ số (phần còn lại)
  var scores = [];
  for (var i = 2; i < parts.length; i++) {
    // Hỗ trợ cả "2-1,3-0" và "2-1 3-0"
    var subScores = parts[i].split(',');
    for (var j = 0; j < subScores.length; j++) {
      var s = subScores[j].trim();
      if (s.length === 0) continue;
      if (!/^\d+-\d+$/.test(s)) {
        return { success: false, message: '❌ Tỷ số không hợp lệ: "' + s + '". Đúng format: n-n', data: null };
      }
      scores.push(s);
    }
  }

  if (scores.length === 0) {
    return { success: false, message: '❌ Chưa nhập tỷ số dự đoán!', data: null };
  }

  // Gọi placeBet
  var betData = {
    email: email,
    displayName: displayName,
    matchId: matchIdRaw,
    matchNumber: matchIdRaw,
    betType: betType,
    scores: scores.join(','),
    homeTeam: '',
    awayTeam: '',
    matchDate: ''
  };

  return placeBet(betData);
}

/**
 * Xử lý lệnh đổi tỷ số: /change #matchId oldScore newScore
 */
function handleChangeCommand(parts, email) {
  if (parts.length < 4) {
    return {
      success: false,
      message: '❌ Sai cú pháp!\nĐúng: /change #<số trận> <tỷ số cũ> <tỷ số mới>\nVí dụ: /change #5 2-1 3-2',
      data: null
    };
  }

  var matchId = parts[1].replace('#', '');
  var oldScore = parts[2];
  var newScore = parts[3];

  return changeBet({
    email: email,
    matchId: matchId,
    oldScore: oldScore,
    newScore: newScore
  });
}

/**
 * Xử lý lệnh /today - Trả về trận đấu hôm nay
 */
function handleTodayCommand() {
  try {
    var result = proxyFifaApi();
    if (!result.success) {
      return { success: false, message: '❌ Không thể lấy dữ liệu trận đấu', data: null };
    }

    var today = new Date();
    var todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var matches = extractMatchesFromApi(result.data);
    var todayMatches = [];

    for (var i = 0; i < matches.length; i++) {
      var matchDate = matches[i].date.substring(0, 10); // yyyy-MM-dd
      if (matchDate === todayStr) {
        todayMatches.push(matches[i]);
      }
    }

    if (todayMatches.length === 0) {
      return { success: true, message: '📅 Hôm nay không có trận đấu nào.', data: [] };
    }

    var lines = todayMatches.map(function(m) {
      var time = m.date.substring(11, 16); // HH:mm
      return '⚽ #' + m.matchNumber + ' ' + m.homeTeam + ' vs ' + m.awayTeam + ' - ' + time;
    });

    return {
      success: true,
      message: '📅 Trận đấu hôm nay (' + todayStr + '):\n' + lines.join('\n'),
      data: todayMatches
    };

  } catch (error) {
    return { success: false, message: '❌ Lỗi: ' + error.message, data: null };
  }
}

/**
 * Xử lý lệnh /M/d - Trả về trận đấu theo ngày cụ thể
 * Ví dụ: /6/15 → trận ngày 15 tháng 6
 */
function handleDateCommand(dateStr) {
  try {
    var result = proxyFifaApi();
    if (!result.success) {
      return { success: false, message: '❌ Không thể lấy dữ liệu trận đấu', data: null };
    }

    var dateParts = dateStr.split('/');
    var month = parseInt(dateParts[0]);
    var day = parseInt(dateParts[1]);

    // Xây dựng chuỗi ngày target (năm 2026)
    var targetDate = '2026-' + padZero(month) + '-' + padZero(day);
    var matches = extractMatchesFromApi(result.data);
    var dateMatches = [];

    for (var i = 0; i < matches.length; i++) {
      var matchDate = matches[i].date.substring(0, 10);
      if (matchDate === targetDate) {
        dateMatches.push(matches[i]);
      }
    }

    if (dateMatches.length === 0) {
      return { success: true, message: '📅 Không có trận đấu ngày ' + dateStr, data: [] };
    }

    var lines = dateMatches.map(function(m) {
      var time = m.date.substring(11, 16);
      return '⚽ #' + m.matchNumber + ' ' + m.homeTeam + ' vs ' + m.awayTeam + ' - ' + time;
    });

    return {
      success: true,
      message: '📅 Trận đấu ngày ' + dateStr + ':\n' + lines.join('\n'),
      data: dateMatches
    };

  } catch (error) {
    return { success: false, message: '❌ Lỗi: ' + error.message, data: null };
  }
}

/**
 * Xử lý lệnh /upcoming - Trả về các trận đấu sắp tới
 */
function handleUpcomingCommand() {
  try {
    var result = proxyFifaApi();
    if (!result.success) {
      return { success: false, message: '❌ Không thể lấy dữ liệu trận đấu', data: null };
    }

    var now = new Date();
    var matches = extractMatchesFromApi(result.data);
    var upcoming = [];

    for (var i = 0; i < matches.length; i++) {
      var matchTime = new Date(matches[i].date);
      if (matchTime > now) {
        upcoming.push(matches[i]);
      }
    }

    // Sắp xếp theo thời gian
    upcoming.sort(function(a, b) {
      return new Date(a.date) - new Date(b.date);
    });

    // Lấy tối đa 10 trận sắp tới
    upcoming = upcoming.slice(0, 10);

    if (upcoming.length === 0) {
      return { success: true, message: '📅 Không có trận đấu sắp tới.', data: [] };
    }

    var lines = upcoming.map(function(m) {
      var dateFormatted = m.date.substring(5, 10) + ' ' + m.date.substring(11, 16);
      return '⚽ #' + m.matchNumber + ' ' + m.homeTeam + ' vs ' + m.awayTeam + ' - ' + dateFormatted;
    });

    return {
      success: true,
      message: '🔜 Các trận sắp tới:\n' + lines.join('\n'),
      data: upcoming
    };

  } catch (error) {
    return { success: false, message: '❌ Lỗi: ' + error.message, data: null };
  }
}

/**
 * Xử lý lệnh /bet - Thông tin tài khoản cá dự đoán
 */
function handleBetInfoCommand(email, parts) {
  try {
    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();

    var stats = { total: 0, do: 0, khomau: 0, hp: 0, matches: {} };

    for (var i = 1; i < allData.length; i++) {
      if (allData[i][1] !== email) continue;

      stats.total++;
      var betType = allData[i][5];
      if (stats[betType] !== undefined) stats[betType]++;

      var matchId = String(allData[i][3]);
      stats.matches[matchId] = true;
    }

    var matchCount = Object.keys(stats.matches).length;

    // Lấy thông tin user
    var profile = getUserProfile(email);
    var displayName = profile.success && profile.data ? profile.data.displayName : email;

    var message = '🎰 Thông tin cá dự đoán - ' + displayName + '\n' +
      '━━━━━━━━━━━━━━━\n' +
      '📊 Tổng dự đoán: ' + stats.total + '\n' +
      '⚽ Dự đoán 90\': ' + stats.do + '\n' +
      '🩸 Khô máu: ' + stats.khomau + '\n' +
      '⭐ Hiệp phụ: ' + stats.hp + '\n' +
      '🏟️ Số trận đã đặt: ' + matchCount;

    return { success: true, message: message, data: stats };

  } catch (error) {
    return { success: false, message: '❌ Lỗi: ' + error.message, data: null };
  }
}
