// ============================================================
// FWC 2026 BETTING WEBAPP - GOOGLE APPS SCRIPT BACKEND
// ============================================================
// Tệp này xử lý toàn bộ logic backend cho ứng dụng cá cược
// World Cup 2026. Sử dụng Google Sheets làm cơ sở dữ liệu.
// ============================================================

// --- CẤU HÌNH ---
var SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
var FIFA_API_URL = 'https://api.fifa.com/api/v3/calendar/matches?from=2026-06-11T00%3A00%3A00Z&to=2026-07-21T14%3A59%3A59Z&language=en&count=500&idCompetition=17';

// --- CẤU TRÚC HEADERS CHO CÁC SHEET ---
var SHEET_HEADERS = {
  'Bets': ['timestamp', 'email', 'displayName', 'matchId', 'matchNumber', 'betType', 'scores', 'homeTeam', 'awayTeam', 'matchDate'],
  'Users': ['email', 'displayName', 'photoUrl', 'joinDate', 'lastActive'],
  'Results': ['matchId', 'matchNumber', 'homeScore', 'awayScore', 'extraHomeScore', 'extraAwayScore', 'penaltyHome', 'penaltyAway', 'status'],
  'Schedule': ['matchId', 'matchNumber', 'date', 'localDate', 'localDateOnly', 'stage', 'group', 'homeName', 'homeAbbr', 'homeFlag', 'homeScore', 'awayName', 'awayAbbr', 'awayFlag', 'awayScore', 'stadium', 'city', 'status', 'resultType', 'homePenaltyScore', 'awayPenaltyScore', 'lastUpdated'],
  'SpecialBets': ['timestamp', 'email', 'displayName', 'semifinals', 'finals', 'champion', 'topScorer']
};

// ============================================================
// ENTRY POINTS - ĐIỂM VÀO CHÍNH
// ============================================================

/**
 * Xử lý các yêu cầu GET với CORS headers.
 * Các action hỗ trợ: getMatches, getBets, getMatchBets, getChat,
 * getLeaderboard, getUserProfile, getMyBets
 */
function doGet(e) {
  try {
    var action = e.parameter.action;
    var result;

    switch (action) {
      case 'getMatches':
        result = proxyFifaApi();
        break;

      case 'getBets':
        result = getAllBets();
        break;

      case 'getMatchBets':
        var matchId = e.parameter.matchId;
        if (!matchId) return createCorsOutput({ success: false, message: 'Thiếu matchId', data: null });
        result = getMatchBets(matchId);
        break;

      case 'getSpecialBets':
        result = getSpecialBets();
        break;



      case 'getLeaderboard':
        var type = e.parameter.type || 'do';
        result = getLeaderboard(type);
        break;

      case 'getUserProfile':
        var email = e.parameter.email;
        if (!email) return createCorsOutput({ success: false, message: 'Thiếu email', data: null });
        result = getUserProfile(email);
        break;

      case 'getMyBets':
        var myEmail = e.parameter.email;
        var filter = e.parameter.filter || 'all';
        if (!myEmail) return createCorsOutput({ success: false, message: 'Thiếu email', data: null });
        result = getMyBets(myEmail, filter);
        break;

      default:
        result = { success: false, message: 'Action không hợp lệ: ' + action, data: null };
    }

    return createCorsOutput(result);

  } catch (error) {
    return createCorsOutput({ success: false, message: 'Lỗi server: ' + error.message, data: null });
  }
}

/**
 * Xử lý các yêu cầu POST với CORS headers.
 * Các action hỗ trợ: placeBet, changeBet, postChat, processCommand, registerUser
 */
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var result;

    switch (action) {
      case 'placeBet':
        result = placeBet(payload.data);
        break;

      case 'changeBet':
        result = changeBet(payload.data);
        break;

      case 'placeSpecialBet':
        result = placeSpecialBet(payload.data);
        break;

      case 'deleteSpecialBet':
        result = deleteSpecialBet(payload.data);
        break;



      case 'processCommand':
        result = processCommand(payload.data.message, payload.data.email, payload.data.displayName);
        break;

      case 'registerUser':
        result = registerUser(payload.data);
        break;

      default:
        result = { success: false, message: 'Action không hợp lệ: ' + action, data: null };
    }

    return createCorsOutput(result);

  } catch (error) {
    return createCorsOutput({ success: false, message: 'Lỗi server: ' + error.message, data: null });
  }
}


// ============================================================
// CÁC HÀM CỐT LÕI (CORE FUNCTIONS)
// ============================================================

/**
 * Gọi API FIFA để lấy danh sách trận đấu World Cup 2026.
 * Trả về dữ liệu JSON thô từ FIFA API.
 */
function proxyFifaApi() {
  return getMatchesCachedOrSync();
}

/**
 * Gọi FIFA API thô để lấy danh sách trận đấu.
 */
function fetchFifaApiRaw() {
  try {
    var response = UrlFetchApp.fetch(FIFA_API_URL, {
      muteHttpExceptions: true,
      headers: {
        'Accept': 'application/json'
      }
    });

    var statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      Logger.log('FIFA API trả về mã lỗi: ' + statusCode);
      return null;
    }

    return JSON.parse(response.getContentText());
  } catch (error) {
    Logger.log('Không thể kết nối FIFA API: ' + error.message);
    return null;
  }
}

/**
 * Đọc Schedule từ sheet 'Schedule'.
 * Nếu checkExpiry = true, kiểm tra xem cache đã quá 10 phút chưa.
 */
function getMatchesFromSheet(checkExpiry) {
  try {
    var sheet = getOrCreateSheet('Schedule', SHEET_HEADERS['Schedule']);
    var allData = sheet.getDataRange().getValues();
    if (allData.length <= 1) {
      return null;
    }

    if (checkExpiry) {
      var lastUpdated = allData[1][21]; // Cột lastUpdated
      if (lastUpdated) {
        var lastUpdatedTime = new Date(lastUpdated).getTime();
        var nowTime = new Date().getTime();
        if (nowTime - lastUpdatedTime > 600000) { // 10 phút
          return null; // Trả về null để trigger sync
        }
      }
    }

    var results = [];
    for (var i = 1; i < allData.length; i++) {
      var row = allData[i];
      results.push({
        IdMatch: String(row[0]),
        MatchNumber: parseInt(row[1]),
        Date: row[2],
        LocalDate: row[3],
        StageName: [{ Locale: 'en-GB', Description: row[5] }],
        GroupName: [{ Locale: 'en-GB', Description: row[6] }],
        Home: {
          TeamName: [{ Locale: 'en-GB', Description: row[7] }],
          Abbreviation: row[8],
          PictureUrl: row[9] ? row[9].replace('sq', '{format}').replace('2', '{size}') : null,
          Score: row[10] !== '' ? parseInt(row[10]) : null
        },
        Away: {
          TeamName: [{ Locale: 'en-GB', Description: row[11] }],
          Abbreviation: row[12],
          PictureUrl: row[13] ? row[13].replace('sq', '{format}').replace('2', '{size}') : null,
          Score: row[14] !== '' ? parseInt(row[14]) : null
        },
        HomeTeamScore: row[10] !== '' ? parseInt(row[10]) : null,
        AwayTeamScore: row[14] !== '' ? parseInt(row[14]) : null,
        Stadium: {
          Name: [{ Locale: 'en-GB', Description: row[15] }],
          CityName: [{ Locale: 'en-GB', Description: row[16] }]
        },
        MatchStatus: parseInt(row[17]),
        ResultType: parseInt(row[18]),
        HomeTeamPenaltyScore: row[19] !== '' ? parseInt(row[19]) : null,
        AwayTeamPenaltyScore: row[20] !== '' ? parseInt(row[20]) : null
      });
    }

    return { Results: results };

  } catch (error) {
    Logger.log('Lỗi khi đọc Schedule từ sheet: ' + error.message);
    return null;
  }
}

/**
 * Lưu Schedule trận đấu từ API vào sheet.
 */
function saveMatchesToSheet(results) {
  try {
    var sheet = getOrCreateSheet('Schedule', SHEET_HEADERS['Schedule']);
    sheet.clearContents();
    
    // Ghi header
    sheet.appendRow(SHEET_HEADERS['Schedule']);
    
    var timestamp = new Date().toISOString();
    var rows = [];
    
    for (var i = 0; i < results.length; i++) {
      var m = results[i];
      
      var homeName = m.Home && m.Home.TeamName && m.Home.TeamName[0] ? m.Home.TeamName[0].Description : '';
      var homeAbbr = m.Home ? m.Home.Abbreviation : '';
      var homeFlag = m.Home && m.Home.PictureUrl ? m.Home.PictureUrl.replace('{format}', 'sq').replace('{size}', '2') : '';
      var homeScore = m.HomeTeamScore !== null ? m.HomeTeamScore : '';
      
      var awayName = m.Away && m.Away.TeamName && m.Away.TeamName[0] ? m.Away.TeamName[0].Description : '';
      var awayAbbr = m.Away ? m.Away.Abbreviation : '';
      var awayFlag = m.Away && m.Away.PictureUrl ? m.Away.PictureUrl.replace('{format}', 'sq').replace('{size}', '2') : '';
      var awayScore = m.AwayTeamScore !== null ? m.AwayTeamScore : '';
      
      var stadiumName = m.Stadium && m.Stadium.Name && m.Stadium.Name[0] ? m.Stadium.Name[0].Description : '';
      var cityName = m.Stadium && m.Stadium.CityName && m.Stadium.CityName[0] ? m.Stadium.CityName[0].Description : '';
      
      rows.push([
        m.IdMatch,
        m.MatchNumber,
        m.Date,
        m.LocalDate || m.Date,
        (m.LocalDate || m.Date).substring(0, 10),
        m.StageName && m.StageName[0] ? m.StageName[0].Description : 'Vòng bảng',
        m.GroupName && m.GroupName[0] ? m.GroupName[0].Description : '',
        homeName,
        homeAbbr,
        homeFlag,
        homeScore,
        awayName,
        awayAbbr,
        awayFlag,
        awayScore,
        stadiumName,
        cityName,
        m.MatchStatus,
        m.ResultType,
        m.HomeTeamPenaltyScore !== null ? m.HomeTeamPenaltyScore : '',
        m.AwayTeamPenaltyScore !== null ? m.AwayTeamPenaltyScore : '',
        timestamp
      ]);
    }
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
    
  } catch (error) {
    Logger.log('Lỗi khi lưu Schedule vào sheet: ' + error.message);
  }
}

/**
 * Quản lý lấy danh sách trận đấu có cache & chống sập.
 */
function getMatchesCachedOrSync() {
  // 1. Thử lấy cache còn hạn
  var cached = getMatchesFromSheet(true);
  if (cached) {
    return { success: true, message: 'Lấy dữ liệu từ cache Sheet', data: cached };
  }
  
  // 2. Cache hết hạn hoặc trống, gọi API FIFA để sync
  var apiResponse = fetchFifaApiRaw();
  if (apiResponse && apiResponse.Results) {
    saveMatchesToSheet(apiResponse.Results);
    return { success: true, message: 'Đồng bộ từ FIFA API thành công', data: apiResponse };
  }
  
  // 3. Nếu gọi FIFA API lỗi, đọc cache cũ (chấp nhận hết hạn) để chống sập
  var staleCached = getMatchesFromSheet(false);
  if (staleCached) {
    return { success: true, message: 'FIFA API lỗi, dùng cache Sheet cũ', data: staleCached };
  }
  
  return { success: false, message: 'Không có dữ liệu trận đấu và không thể gọi FIFA API', data: null };
}

/**
 * Lấy danh sách cược ngoài (Special Bets) của tất cả người chơi.
 */
function getSpecialBets() {
  try {
    var sheet = getOrCreateSheet('SpecialBets', SHEET_HEADERS['SpecialBets']);
    var allData = sheet.getDataRange().getValues();
    var list = [];
    
    for (var i = 1; i < allData.length; i++) {
      list.push({
        timestamp: allData[i][0],
        email: allData[i][1],
        displayName: allData[i][2],
        semifinals: allData[i][3],
        finals: allData[i][4],
        champion: allData[i][5],
        topScorer: allData[i][6]
      });
    }
    
    return { success: true, message: 'Lấy danh sách cược ngoài thành công', data: list };
    
  } catch (error) {
    return { success: false, message: 'Lỗi lấy cược ngoài: ' + error.message, data: null };
  }
}

/**
 * Đặt cược ngoài (Special Bets) cho người chơi.
 */
function placeSpecialBet(data) {
  try {
    if (!data.email) {
      return { success: false, message: 'Thiếu email', data: null };
    }

    // Kiểm tra thời gian khóa cược ngoài (trước khi trận đầu tiên bắt đầu)
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
    
    if (firstMatchStartTime) {
      var now = new Date();
      if (now > firstMatchStartTime) {
        return { success: false, message: '❌ Giải đấu đã chính thức khởi tranh. Bạn không thể đặt hoặc sửa cược ngoài!', data: null };
      }
    }
    
    var sheet = getOrCreateSheet('SpecialBets', SHEET_HEADERS['SpecialBets']);
    var allData = sheet.getDataRange().getValues();
    var foundRow = -1;
    
    if (data.timestamp) {
      for (var i = 1; i < allData.length; i++) {
        var rowEmail = allData[i][1];
        var rowTimestamp = String(allData[i][0]);
        if (rowEmail === data.email && rowTimestamp === String(data.timestamp)) {
          foundRow = i + 1;
          break;
        }
      }
    }
    
    var timestamp = data.timestamp || new Date().toISOString();
    var rowData = [
      timestamp,
      data.email,
      data.displayName || '',
      data.semifinals || '',
      data.finals || '',
      data.champion || '',
      data.topScorer || ''
    ];
    
    if (foundRow > 0) {
      sheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
      return { success: true, message: '✅ Đã cập nhật cược ngoài giải thành công!', data: null };
    } else {
      sheet.appendRow(rowData);
      return { success: true, message: '✅ Đã lưu cược ngoài giải thành công!', data: null };
    }
    
  } catch (error) {
    return { success: false, message: 'Lỗi lưu cược ngoài: ' + error.message, data: null };
  }
}

/**
 * Xóa một dòng dự đoán cược ngoài (Special Bet) của user theo timestamp.
 */
function deleteSpecialBet(data) {
  try {
    if (!data.email || !data.timestamp) {
      return { success: false, message: 'Thiếu thông tin bắt buộc (email, timestamp)', data: null };
    }
    
    // Kiểm tra thời gian khóa cược ngoài (trước khi trận đầu tiên bắt đầu)
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
    
    if (firstMatchStartTime) {
      var now = new Date();
      if (now > firstMatchStartTime) {
        return { success: false, message: '❌ Giải đấu đã chính thức khởi tranh. Bạn không thể xóa cược ngoài!', data: null };
      }
    }
    
    var sheet = getOrCreateSheet('SpecialBets', SHEET_HEADERS['SpecialBets']);
    var allData = sheet.getDataRange().getValues();
    var foundRow = -1;
    
    for (var i = 1; i < allData.length; i++) {
      var rowEmail = allData[i][1];
      var rowTimestamp = String(allData[i][0]);
      
      if (rowEmail === data.email && rowTimestamp === String(data.timestamp)) {
        foundRow = i + 1;
        break;
      }
    }
    
    if (foundRow > 0) {
      sheet.deleteRow(foundRow);
      return { success: true, message: '✅ Đã xóa dự đoán cược ngoài thành công!', data: null };
    } else {
      return { success: false, message: '❌ Không tìm thấy cược ngoài cần xóa hoặc cược không thuộc về bạn!', data: null };
    }
    
  } catch (error) {
    return { success: false, message: 'Lỗi khi xóa cược ngoài: ' + error.message, data: null };
  }
}

/**
 * Đặt cược cho một trận đấu.
 * Nếu đã tồn tại cược cho cùng user + match + betType, sẽ cập nhật.
 *
 * @param {Object} data - {email, displayName, matchId, matchNumber, betType, scores, homeTeam, awayTeam, matchDate}
 * @returns {Object} {success, message, data}
 */
function placeBet(data) {
  try {
    // Validate dữ liệu đầu vào
    if (!data.email || !data.matchId || !data.betType || !data.scores) {
      return { success: false, message: 'Thiếu thông tin bắt buộc (email, matchId, betType, scores)', data: null };
    }

    // Validate betType
    var validTypes = ['do', 'khomau', 'hp'];
    if (validTypes.indexOf(data.betType) === -1) {
      return { success: false, message: 'Loại cược không hợp lệ. Chỉ chấp nhận: do, khomau, hp', data: null };
    }

    // Validate định dạng scores (n-n hoặc n-n,n-n,...)
    var scoresArr = data.scores.split(',').map(function(s) { return s.trim(); });
    for (var i = 0; i < scoresArr.length; i++) {
      var s = scoresArr[i];
      if (!/^\d+-\d+$/.test(s)) {
        return { success: false, message: 'Định dạng tỷ số không hợp lệ: "' + s + '". Đúng format: n-n', data: null };
      }
    }

    // 0. Kiểm tra thời gian khóa cược từ sheet Schedule
    var scheduleSheet = getOrCreateSheet('Schedule', SHEET_HEADERS['Schedule']);
    var scheduleData = scheduleSheet.getDataRange().getValues();
    var matchStartStr = null;
    var matchStatus = 0;

    for (var i = 1; i < scheduleData.length; i++) {
      if (String(scheduleData[i][0]) === String(data.matchId)) {
        matchStartStr = scheduleData[i][2]; // Cột date
        matchStatus = parseInt(scheduleData[i][17]); // Cột status
        break;
      }
    }

    if (matchStartStr) {
      var now = new Date();
      var matchStartTime = new Date(matchStartStr);
      // Nếu status là 3, 4, 12, 10 hoặc đã quá giờ bắt đầu
      if (matchStatus === 3 || matchStatus === 4 || matchStatus === 12 || matchStatus === 10 || now > matchStartTime) {
        return { success: false, message: '❌ Trận đấu đã bắt đầu hoặc đã kết thúc. Bạn không thể đặt hoặc sửa cược!', data: null };
      }
    }

    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    
    var overwrite = data.overwrite !== false; // default to true if not specified
    
    if (overwrite) {
      // 1. Xóa tất cả các cược cũ cùng matchId + betType của user này
      deleteBetRows(data.email, data.matchId, data.betType);
    } else {
      // 1. Lấy danh sách cược hiện tại của user này cho trận đấu và loại cược này để tránh thêm trùng
      var allData = sheet.getDataRange().getValues();
      var existingScores = [];
      for (var i = 1; i < allData.length; i++) {
        var rowEmail = allData[i][1];
        var rowMatchId = String(allData[i][3]);
        var rowBetType = allData[i][5];
        var rowScore = String(allData[i][6]);
        if (rowEmail === data.email && rowMatchId === String(data.matchId) && rowBetType === data.betType) {
          existingScores.push(rowScore);
        }
      }
      
      // Lọc các tỉ số chưa tồn tại
      var newScoresArr = [];
      for (var j = 0; j < scoresArr.length; j++) {
        if (existingScores.indexOf(scoresArr[j]) === -1) {
          newScoresArr.push(scoresArr[j]);
        }
      }
      
      if (newScoresArr.length === 0) {
        return {
          success: true,
          message: 'ℹ️ Bạn đã đặt các tỷ số này trước đó rồi.',
          data: { action: 'skipped', matchId: data.matchId, betType: data.betType }
        };
      }
      scoresArr = newScoresArr; // Chỉ thêm các tỉ số mới
    }
    
    // 2. Thêm từng cược mới làm một dòng riêng biệt với dấu nháy đơn để ép kiểu plain text
    var timestamp = new Date().toISOString();
    for (var j = 0; j < scoresArr.length; j++) {
      var rowData = [
        timestamp,
        data.email,
        data.displayName || '',
        data.matchId,
        data.matchNumber || '',
        data.betType,
        "'" + scoresArr[j], // Thêm nháy đơn trước tỉ số để Google Sheets lưu định dạng text
        data.homeTeam || '',
        data.awayTeam || '',
        data.matchDate || ''
      ];
      sheet.appendRow(rowData);
    }

    return {
      success: true,
      message: '✅ Đã lưu dự đoán trận #' + data.matchId + ' (' + data.betType + '): ' + scoresArr.join(', '),
      data: { action: 'saved', matchId: data.matchId, betType: data.betType, scores: scoresArr.join(', ') }
    };

  } catch (error) {
    return { success: false, message: 'Lỗi khi đặt cược: ' + error.message, data: null };
  }
}

/**
 * Xóa tất cả dòng cược của user cụ thể cho một trận đấu và loại cược.
 */
function deleteBetRows(email, matchId, betType) {
  try {
    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();
    
    // Quét từ dưới lên để việc xóa dòng không bị lệch index
    for (var i = allData.length - 1; i >= 1; i--) {
      var rowEmail = allData[i][1];
      var rowMatchId = String(allData[i][3]);
      var rowBetType = allData[i][5];
      
      if (rowEmail === email && rowMatchId === String(matchId) && rowBetType === betType) {
        sheet.deleteRow(i + 1);
      }
    }
  } catch (e) {
    Logger.log('Lỗi khi xóa dòng cược cũ: ' + e.message);
  }
}

/**
 * Thay đổi tỷ số dự đoán đã đặt.
 *
 * @param {Object} data - {email, matchId, oldScore, newScore}
 * @returns {Object} {success, message, data}
 */
function changeBet(data) {
  try {
    if (!data.email || !data.matchId || !data.oldScore || !data.newScore) {
      return { success: false, message: 'Thiếu thông tin (email, matchId, oldScore, newScore)', data: null };
    }

    // Validate định dạng tỷ số
    if (!/^\d+-\d+$/.test(data.oldScore) || !/^\d+-\d+$/.test(data.newScore)) {
      return { success: false, message: 'Định dạng tỷ số không hợp lệ. Đúng format: n-n', data: null };
    }

    // 0. Kiểm tra thời gian khóa cược từ sheet Schedule
    var scheduleSheet = getOrCreateSheet('Schedule', SHEET_HEADERS['Schedule']);
    var scheduleData = scheduleSheet.getDataRange().getValues();
    var matchStartStr = null;
    var matchStatus = 0;

    for (var i = 1; i < scheduleData.length; i++) {
      if (String(scheduleData[i][0]) === String(data.matchId)) {
        matchStartStr = scheduleData[i][2]; // Cột date
        matchStatus = parseInt(scheduleData[i][17]); // Cột status
        break;
      }
    }

    if (matchStartStr) {
      var now = new Date();
      var matchStartTime = new Date(matchStartStr);
      // Nếu status là 3, 4, 12, 10 hoặc đã quá giờ bắt đầu
      if (matchStatus === 3 || matchStatus === 4 || matchStatus === 12 || matchStatus === 10 || now > matchStartTime) {
        return { success: false, message: '❌ Trận đấu đã bắt đầu hoặc đã kết thúc. Bạn không thể đặt hoặc sửa cược!', data: null };
      }
    }

    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();
    var foundRow = -1;

    for (var i = 1; i < allData.length; i++) {
      var rowEmail = allData[i][1];    // email
      var rowMatchId = String(allData[i][3]);  // matchId
      var rowScore = String(allData[i][6]);   // scores

      if (rowEmail === data.email && rowMatchId === String(data.matchId) && rowScore === data.oldScore) {
        foundRow = i + 1;
        break;
      }
    }

    if (foundRow === -1) {
      return {
        success: false,
        message: '❌ Không tìm thấy tỷ số "' + data.oldScore + '" trong dự đoán trận #' + data.matchId,
        data: null
      };
    }

    // Cập nhật tỉ số mới
    sheet.getRange(foundRow, 1).setValue(new Date().toISOString()); // timestamp
    sheet.getRange(foundRow, 7).setValue("'" + data.newScore);             // scores

    return {
      success: true,
      message: '✅ Đã sửa dự đoán trận #' + data.matchId + ' từ ' + data.oldScore + ' thành ' + data.newScore,
      data: { matchId: data.matchId, oldScore: data.oldScore, newScore: data.newScore }
    };

  } catch (error) {
    return { success: false, message: 'Lỗi khi sửa dự đoán: ' + error.message, data: null };
  }
}

/**
 * Lấy danh sách cược của người dùng.
 *
 * @param {string} email - Email người dùng
 * @param {string} filter - 'all', matchId cụ thể, hoặc ngày 'M/d'
 * @returns {Object} {success, message, data}
 */
function getMyBets(email, filter) {
  try {
    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();
    var groupedBets = {};

    for (var i = 1; i < allData.length; i++) {
      if (allData[i][1] !== email) continue;

      var matchId = String(allData[i][3]);
      var betType = allData[i][5];
      var key = matchId + '_' + betType;

      if (!groupedBets[key]) {
        groupedBets[key] = {
          timestamp: allData[i][0],
          email: allData[i][1],
          displayName: allData[i][2],
          matchId: matchId,
          matchNumber: allData[i][4],
          betType: betType,
          scoresArray: [],
          homeTeam: allData[i][7],
          awayTeam: allData[i][8],
          matchDate: allData[i][9]
        };
      }
      groupedBets[key].scoresArray.push(allData[i][6]);
    }

    var myBets = [];
    for (var key in groupedBets) {
      var item = groupedBets[key];
      // Ghép các tỉ số thành chuỗi cách nhau bởi dấu phẩy
      item.scores = item.scoresArray.join(', ');
      delete item.scoresArray; // Dọn dẹp key phụ

      // Áp dụng bộ lọc
      if (filter === 'all') {
        myBets.push(item);
      } else if (/^\d+$/.test(filter)) {
        if (String(item.matchId) === filter) {
          myBets.push(item);
        }
      } else if (/^\d+\/\d+$/.test(filter)) {
        var matchDateStr = String(item.matchDate);
        if (matchDateStr.indexOf(filter) !== -1) {
          myBets.push(item);
        }
      }
    }

    // Sắp xếp theo timestamp mới nhất
    myBets.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    var betTypeName = { 'do': 'Dự đoán', 'khomau': 'Khô máu', 'hp': 'Hiệp phụ' };
    var summaryLines = myBets.map(function(b) {
      var typeName = betTypeName[b.betType] || b.betType;
      return '⚽ Trận #' + b.matchId + ' (' + b.homeTeam + ' vs ' + b.awayTeam + ') - ' + typeName + ': ' + b.scores;
    });

    return {
      success: true,
      message: myBets.length > 0
        ? '📋 Dự đoán của bạn (' + myBets.length + '):\n' + summaryLines.join('\n')
        : '📋 Bạn chưa có dự đoán nào.',
      data: myBets
    };

  } catch (error) {
    return { success: false, message: 'Lỗi khi lấy dự đoán: ' + error.message, data: null };
  }
}

/**
 * Lấy tất cả cược cho một trận đấu cụ thể.
 *
 * @param {string} matchId - ID trận đấu
 * @returns {Object} {success, message, data}
 */
function getMatchBets(matchId) {
  try {
    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();
    var matchBets = [];

    for (var i = 1; i < allData.length; i++) {
      if (String(allData[i][3]) === String(matchId)) {
        matchBets.push({
          timestamp: allData[i][0],
          email: allData[i][1],
          displayName: allData[i][2],
          betType: allData[i][5],
          scores: allData[i][6]
        });
      }
    }

    return {
      success: true,
      message: 'Tìm thấy ' + matchBets.length + ' dự đoán cho trận #' + matchId,
      data: matchBets
    };

  } catch (error) {
    return { success: false, message: 'Lỗi khi lấy dự đoán trận: ' + error.message, data: null };
  }
}

/**
 * Lấy tất cả cược (dùng cho trang tổng quan).
 *
 * @returns {Object} {success, message, data}
 */
function getAllBets() {
  try {
    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();
    var bets = [];

    for (var i = 1; i < allData.length; i++) {
      bets.push({
        timestamp: allData[i][0],
        email: allData[i][1],
        displayName: allData[i][2],
        matchId: allData[i][3],
        matchNumber: allData[i][4],
        betType: allData[i][5],
        scores: allData[i][6],
        homeTeam: allData[i][7],
        awayTeam: allData[i][8],
        matchDate: allData[i][9]
      });
    }

    return { success: true, message: 'Tổng cộng ' + bets.length + ' dự đoán', data: bets };

  } catch (error) {
    return { success: false, message: 'Lỗi khi lấy tất cả dự đoán: ' + error.message, data: null };
  }
}



// ============================================================
// XỬ LÝ LỆNH CHAT (COMMANDS)
// ============================================================

/**
 * Phân tích và thực thi lệnh chat.
 * Hỗ trợ các lệnh: /do, /change, /khomau, /hp, /today, /M/d,
 * /upcoming, /me, /top, /bet
 *
 * @param {string} message - Nội dung tin nhắn (bắt đầu bằng /)
 * @param {string} email - Email người gửi
 * @param {string} displayName - Tên hiển thị người gửi
 * @returns {Object} {success, message, data}
 */
function processCommand(message, email, displayName) {
  try {
    var msg = message.trim();
    var parts = msg.split(/\s+/);
    var command = parts[0].toLowerCase();

    // --- /do #matchId n1-n1 [n2-n2],... ---
    if (command === '/do') {
      return handleBetCommand(parts, email, displayName, 'do');
    }

    // --- /khomau #matchId n1-n1 [n2-n2],... ---
    if (command === '/khomau') {
      return handleBetCommand(parts, email, displayName, 'khomau');
    }

    // --- /hp #matchId n1-n1 [n2-n2],... ---
    if (command === '/hp') {
      return handleBetCommand(parts, email, displayName, 'hp');
    }

    // --- /change #matchId n-nOld n-nNew ---
    if (command === '/change') {
      return handleChangeCommand(parts, email);
    }

    // --- /today ---
    if (command === '/today') {
      return handleTodayCommand();
    }

    // --- /upcoming ---
    if (command === '/upcoming') {
      return handleUpcomingCommand();
    }

    // --- /me [all/#matchId/M/d] ---
    if (command === '/me') {
      var filter = parts.length > 1 ? parts[1] : 'all';
      // Loại bỏ # nếu có
      filter = filter.replace('#', '');
      return getMyBets(email, filter);
    }

    // --- /top [do/win/lost/khomau/hp] ---
    if (command === '/top') {
      var topType = parts.length > 1 ? parts[1].toLowerCase() : 'do';
      return getLeaderboard(topType);
    }

    // --- /bet [all] ---
    if (command === '/bet') {
      return handleBetInfoCommand(email, parts);
    }

    // --- /bk đội 1, đội 2, đội 3, đội 4 ---
    if (command === '/bk') {
      var val = parts.slice(1).join(' ').trim();
      return handleSpecialBetCommand(email, displayName, 'semifinals', val);
    }

    // --- /ck đội 1, đội 2 ---
    if (command === '/ck') {
      var val = parts.slice(1).join(' ').trim();
      return handleSpecialBetCommand(email, displayName, 'finals', val);
    }

    // --- /vd or /vđ tên đội ---
    if (command === '/vd' || command === '/vđ') {
      var val = parts.slice(1).join(' ').trim();
      return handleSpecialBetCommand(email, displayName, 'champion', val);
    }

    // --- /vpl tên cầu thủ ---
    if (command === '/vpl') {
      var val = parts.slice(1).join(' ').trim();
      return handleSpecialBetCommand(email, displayName, 'topScorer', val);
    }

    // --- /M/d (ví dụ: /6/15) - Trận đấu theo ngày ---
    var dateMatch = msg.match(/^\/(\d{1,2}\/\d{1,2})$/);
    if (dateMatch) {
      return handleDateCommand(dateMatch[1]);
    }

    // --- Lệnh không hợp lệ ---
    return {
      success: false,
      message: '❓ Lệnh không hợp lệ: "' + command + '"\n\n' +
        '📖 Danh sách lệnh:\n' +
        '/do #<trận> <tỷ số> - Đăng ký cược 90\' (Ví dụ: /do #1 2-1)\n' +
        '/change #<trận> <cũ> <mới> - Sửa tỷ số (Ví dụ: /change #1 2-1 1-1)\n' +
        '/khomau #<trận> <tỷ số> - Đặt cược Khô máu\n' +
        '/hp #<trận> <tỷ số> - Đặt cược Hiệp phụ\n' +
        '/today - Xem lịch đấu hôm nay\n' +
        '/M/d - Xem lịch đấu ngày cụ thể (Ví dụ: /6/12)\n' +
        '/upcoming - Xem các trận sắp tới\n' +
        '/me [all/#<trận>/M/d] - Xem đăng ký cược của bạn\n' +
        '/top [do/win/lost/khomau/hp] - Xem bảng xếp hạng\n' +
        '/bet - Xem tài khoản\n' +
        '/bk <đội 1>, <đội 2>, <đội 3>, <đội 4> - Dự đoán 4 đội Bán kết\n' +
        '/ck <đội 1>, <đội 2> - Dự đoán 2 đội Chung kết\n' +
        '/vd <đội> - Dự đoán đội Vô địch\n' +
        '/vpl <cầu thủ> - Dự đoán Vua phá lưới',
      data: null
    };

  } catch (error) {
    return { success: false, message: '❌ Lỗi xử lý lệnh: ' + error.message, data: null };
  }
}

/**
 * Xử lý các lệnh cược đặc biệt (Special Bets) từ chat/Discord.
 */
function handleSpecialBetCommand(email, displayName, field, value) {
  try {
    if (!value) {
      return { success: false, message: '❌ Vui lòng nhập thông tin cược đặc biệt!', data: null };
    }

    // Kiểm tra thời gian khóa cược ngoài (trước khi trận khai mạc bắt đầu)
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
      return { success: false, message: '❌ Giải đấu đã chính thức khởi tranh. Bạn không thể đặt hoặc sửa cược ngoài!', data: null };
    }

    // Validate số lượng đội đối với bán kết / chung kết
    if (field === 'semifinals') {
      var teams = value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (teams.length !== 4) {
        return { success: false, message: '❌ Lệnh cược bán kết yêu cầu nhập đúng 4 đội cách nhau bằng dấu phẩy!\nVí dụ: /bk Đức, Pháp, Anh, Ý', data: null };
      }
      value = teams.join(', ');
    } else if (field === 'finals') {
      var teams = value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (teams.length !== 2) {
        return { success: false, message: '❌ Lệnh cược chung kết yêu cầu nhập đúng 2 đội cách nhau bằng dấu phẩy!\nVí dụ: /ck Đức, Pháp', data: null };
      }
      value = teams.join(', ');
    }

    var sheet = getOrCreateSheet('SpecialBets', SHEET_HEADERS['SpecialBets']);
    var allData = sheet.getDataRange().getValues();
    var latestRowIndex = -1;
    var latestRowData = null;

    // Tìm dòng cược gần nhất của user này
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
      // Cập nhật dòng cược ngoài hiện tại
      data.timestamp = String(latestRowData[0]);
      data.semifinals = latestRowData[3];
      data.finals = latestRowData[4];
      data.champion = latestRowData[5];
      data.topScorer = latestRowData[6];
      
      // Ghi đè trường tương ứng
      data[field] = value;
    } else {
      // Tạo cược ngoài mới
      data.semifinals = '';
      data.finals = '';
      data.champion = '';
      data.topScorer = '';
      data[field] = value;
    }

    // Gọi hàm placeSpecialBet hiện tại
    return placeSpecialBet(data);

  } catch (error) {
    return { success: false, message: '❌ Lỗi cược ngoài: ' + error.message, data: null };
  }
}

/**
 * Xử lý lệnh đặt cược: /do, /khomau, /hp
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
 * Xử lý lệnh /bet - Thông tin tài khoản cá cược
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

    var message = '🎰 Thông tin cá cược - ' + displayName + '\n' +
      '━━━━━━━━━━━━━━━\n' +
      '📊 Tổng dự đoán: ' + stats.total + '\n' +
      '⚽ Dự đoán thường (đô): ' + stats.do + '\n' +
      '🔥 Khô máu: ' + stats.khomau + '\n' +
      '⏱️ Hiệp phụ: ' + stats.hp + '\n' +
      '🏟️ Số trận đã đặt: ' + matchCount;

    return { success: true, message: message, data: stats };

  } catch (error) {
    return { success: false, message: '❌ Lỗi: ' + error.message, data: null };
  }
}


// ============================================================
// BẢNG XẾP HẠNG (LEADERBOARD)
// ============================================================

/**
 * Lấy bảng xếp hạng theo loại.
 *
 * @param {string} type - 'do', 'win', 'lost', 'khomau', 'hp'
 * @returns {Object} {success, message, data}
 */
function getLeaderboard(type) {
  try {
    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();
    var resultsSheet = getOrCreateSheet('Results', SHEET_HEADERS['Results']);
    var resultsData = resultsSheet.getDataRange().getValues();

    // Xây dựng map kết quả {matchId: {homeScore, awayScore}}
    var resultsMap = {};
    for (var r = 1; r < resultsData.length; r++) {
      resultsMap[String(resultsData[r][0])] = {
        homeScore: parseInt(resultsData[r][2]),
        awayScore: parseInt(resultsData[r][3]),
        status: resultsData[r][8]
      };
    }

    // Đếm theo từng loại
    var userStats = {}; // {email: {displayName, count}}

    for (var i = 1; i < allData.length; i++) {
      var email = allData[i][1];
      var displayName = allData[i][2];
      var betType = allData[i][5];
      var scores = String(allData[i][6]);
      var matchId = String(allData[i][3]);

      if (!userStats[email]) {
        userStats[email] = { email: email, displayName: displayName, count: 0 };
      }

      switch (type) {
        case 'do':
          // Đếm tổng số dự đoán thường
          if (betType === 'do') {
            userStats[email].count += scores.split(',').length;
          }
          break;

        case 'khomau':
          // Đếm tổng số dự đoán khô máu
          if (betType === 'khomau') {
            userStats[email].count += scores.split(',').length;
          }
          break;

        case 'hp':
          // Đếm tổng số dự đoán hiệp phụ
          if (betType === 'hp') {
            userStats[email].count += scores.split(',').length;
          }
          break;

        case 'win':
          // Đếm số dự đoán đúng (so với kết quả)
          if (resultsMap[matchId] && resultsMap[matchId].status === 'completed') {
            var actualScore = resultsMap[matchId].homeScore + '-' + resultsMap[matchId].awayScore;
            var scoresList = scores.split(',').map(function(s) { return s.trim(); });
            for (var s = 0; s < scoresList.length; s++) {
              if (scoresList[s] === actualScore) {
                userStats[email].count++;
              }
            }
          }
          break;

        case 'lost':
          // Đếm số dự đoán sai
          if (resultsMap[matchId] && resultsMap[matchId].status === 'completed') {
            var actualScoreLost = resultsMap[matchId].homeScore + '-' + resultsMap[matchId].awayScore;
            var scoresListLost = scores.split(',').map(function(s) { return s.trim(); });
            var allWrong = true;
            for (var sl = 0; sl < scoresListLost.length; sl++) {
              if (scoresListLost[sl] === actualScoreLost) {
                allWrong = false;
                break;
              }
            }
            if (allWrong) {
              userStats[email].count++;
            }
          }
          break;
      }
    }

    // Chuyển thành mảng và sắp xếp giảm dần
    var leaderboard = Object.keys(userStats).map(function(key) {
      return userStats[key];
    });

    leaderboard.sort(function(a, b) {
      return b.count - a.count;
    });

    // Tạo tin nhắn hiển thị
    var typeNames = { 'do': '🏆 Đô nhiều nhất', 'win': '🥇 Thắng nhiều nhất', 'lost': '💀 Thua nhiều nhất', 'khomau': '🔥 Khô máu nhiều nhất', 'hp': '⏱️ Hiệp phụ nhiều nhất' };
    var title = typeNames[type] || '🏆 Bảng xếp hạng';

    var medalEmojis = ['🥇', '🥈', '🥉'];
    var lines = leaderboard.slice(0, 20).map(function(u, idx) {
      var medal = idx < 3 ? medalEmojis[idx] : (idx + 1) + '.';
      return medal + ' ' + u.displayName + ' - ' + u.count;
    });

    return {
      success: true,
      message: title + '\n━━━━━━━━━━━━━━━\n' + (lines.length > 0 ? lines.join('\n') : 'Chưa có dữ liệu'),
      data: leaderboard
    };

  } catch (error) {
    return { success: false, message: 'Lỗi khi lấy bảng xếp hạng: ' + error.message, data: null };
  }
}


// ============================================================
// QUẢN LÝ NGƯỜI DÙNG (USER MANAGEMENT)
// ============================================================

/**
 * Đăng ký hoặc cập nhật thông tin người dùng.
 *
 * @param {Object} data - {email, displayName, photoUrl}
 * @returns {Object} {success, message, data}
 */
function registerUser(data) {
  try {
    if (!data.email) {
      return { success: false, message: 'Thiếu email', data: null };
    }

    var sheet = getOrCreateSheet('Users', SHEET_HEADERS['Users']);
    var allData = sheet.getDataRange().getValues();
    var now = new Date().toISOString();
    var existingRow = -1;

    // Tìm user hiện có
    for (var i = 1; i < allData.length; i++) {
      if (allData[i][0] === data.email) {
        existingRow = i + 1;
        break;
      }
    }

    if (existingRow > 0) {
      // Cập nhật user hiện có
      sheet.getRange(existingRow, 2).setValue(data.displayName || allData[existingRow - 1][1]);
      sheet.getRange(existingRow, 3).setValue(data.photoUrl || allData[existingRow - 1][2]);
      sheet.getRange(existingRow, 5).setValue(now); // lastActive

      return {
        success: true,
        message: 'Chào mừng trở lại, ' + (data.displayName || data.email) + '! 👋',
        data: { email: data.email, isNew: false }
      };
    } else {
      // Đăng ký user mới
      sheet.appendRow([data.email, data.displayName || '', data.photoUrl || '', now, now]);

      return {
        success: true,
        message: 'Chào mừng ' + (data.displayName || data.email) + ' đến với FWC 2026! 🎉⚽',
        data: { email: data.email, isNew: true }
      };
    }

  } catch (error) {
    return { success: false, message: 'Lỗi đăng ký: ' + error.message, data: null };
  }
}

/**
 * Lấy thông tin hồ sơ và thống kê người dùng.
 *
 * @param {string} email - Email người dùng
 * @returns {Object} {success, message, data}
 */
function getUserProfile(email) {
  try {
    var userSheet = getOrCreateSheet('Users', SHEET_HEADERS['Users']);
    var userData = userSheet.getDataRange().getValues();
    var userInfo = null;

    for (var i = 1; i < userData.length; i++) {
      if (userData[i][0] === email) {
        userInfo = {
          email: userData[i][0],
          displayName: userData[i][1],
          photoUrl: userData[i][2],
          joinDate: userData[i][3],
          lastActive: userData[i][4]
        };
        break;
      }
    }

    if (!userInfo) {
      return { success: false, message: 'Không tìm thấy người dùng', data: null };
    }

    // Thống kê cá cược
    var betsSheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var betsData = betsSheet.getDataRange().getValues();
    var stats = { totalBets: 0, doCount: 0, khomauCount: 0, hpCount: 0, matchesCount: 0 };
    var matchesSet = {};

    for (var j = 1; j < betsData.length; j++) {
      if (betsData[j][1] === email) {
        stats.totalBets++;
        var bt = betsData[j][5];
        if (bt === 'do') stats.doCount++;
        else if (bt === 'khomau') stats.khomauCount++;
        else if (bt === 'hp') stats.hpCount++;
        matchesSet[String(betsData[j][3])] = true;
      }
    }
    stats.matchesCount = Object.keys(matchesSet).length;

    userInfo.stats = stats;

    return { success: true, message: 'Thông tin người dùng', data: userInfo };

  } catch (error) {
    return { success: false, message: 'Lỗi lấy hồ sơ: ' + error.message, data: null };
  }
}


// ============================================================
// HÀM HỖ TRỢ (HELPER FUNCTIONS)
// ============================================================

/**
 * Lấy sheet theo tên. Nếu chưa tồn tại, tạo mới với headers.
 *
 * @param {string} name - Tên sheet
 * @param {Array} headers - Mảng tên cột headers
 * @returns {Sheet} Google Sheets Sheet object
 */
function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      // Định dạng header
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4285F4');
      headerRange.setFontColor('#FFFFFF');

      // Đóng băng hàng header
      sheet.setFrozenRows(1);
    }
  }

  return sheet;
}

/**
 * Tạo response JSON với CORS headers cho Google Apps Script.
 * Lưu ý: Google Apps Script Web App tự động xử lý CORS khi deploy
 * dưới dạng "Execute as me" + "Anyone can access".
 *
 * @param {Object} data - Dữ liệu trả về
 * @returns {TextOutput} ContentService TextOutput với JSON MIME type
 */
function createCorsOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Alias cho createCorsOutput (để tương thích ngược)
 */
function createJsonResponse(data) {
  return createCorsOutput(data);
}

/**
 * Tìm hàng cược đã tồn tại cho user + match + betType.
 *
 * @param {string} email - Email người dùng
 * @param {string} matchId - ID trận đấu
 * @param {string} betType - Loại cược (do/khomau/hp)
 * @returns {number} Số hàng (1-indexed) nếu tìm thấy, -1 nếu không
 */
function findBetRow(email, matchId, betType) {
  var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
  var allData = sheet.getDataRange().getValues();

  for (var i = 1; i < allData.length; i++) {
    if (allData[i][1] === email &&
        String(allData[i][3]) === String(matchId) &&
        allData[i][5] === betType) {
      return i + 1; // 1-indexed row number
    }
  }

  return -1; // Không tìm thấy
}

/**
 * Trích xuất danh sách trận đấu từ dữ liệu FIFA API.
 * Xử lý cấu trúc response của FIFA API.
 *
 * @param {Object} apiData - Dữ liệu thô từ FIFA API
 * @returns {Array} Mảng đối tượng trận đấu đã chuẩn hóa
 */
function extractMatchesFromApi(apiData) {
  var matches = [];

  try {
    var rawMatches = apiData.Results || apiData.results || apiData;

    if (!Array.isArray(rawMatches)) {
      // Thử truy cập theo cấu trúc khác
      if (apiData.Results && Array.isArray(apiData.Results)) {
        rawMatches = apiData.Results;
      } else {
        return matches;
      }
    }

    for (var i = 0; i < rawMatches.length; i++) {
      var m = rawMatches[i];
      var homeTeam = '???';
      var awayTeam = '???';

      // Lấy tên đội nhà
      if (m.Home && m.Home.TeamName) {
        homeTeam = m.Home.TeamName[0] ? m.Home.TeamName[0].Description : (m.Home.ShortClubName || 'TBD');
      } else if (m.HomeTeam && m.HomeTeam.TeamName) {
        homeTeam = m.HomeTeam.TeamName[0] ? m.HomeTeam.TeamName[0].Description : (m.HomeTeam.ShortClubName || 'TBD');
      }

      // Lấy tên đội khách
      if (m.Away && m.Away.TeamName) {
        awayTeam = m.Away.TeamName[0] ? m.Away.TeamName[0].Description : (m.Away.ShortClubName || 'TBD');
      } else if (m.AwayTeam && m.AwayTeam.TeamName) {
        awayTeam = m.AwayTeam.TeamName[0] ? m.AwayTeam.TeamName[0].Description : (m.AwayTeam.ShortClubName || 'TBD');
      }

      matches.push({
        matchId: m.IdMatch || m.MatchId || '',
        matchNumber: m.MatchNumber || (i + 1),
        date: m.Date || m.LocalDate || '',
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        homeScore: m.HomeTeamScore || (m.Home ? m.Home.Score : null),
        awayScore: m.AwayTeamScore || (m.Away ? m.Away.Score : null),
        status: m.MatchStatus || m.Status || '',
        stageName: m.StageName ? (m.StageName[0] ? m.StageName[0].Description : '') : '',
        groupName: m.GroupName ? (m.GroupName[0] ? m.GroupName[0].Description : '') : '',
        stadiumName: m.Stadium ? (m.Stadium.Name ? (m.Stadium.Name[0] ? m.Stadium.Name[0].Description : '') : '') : ''
      });
    }

  } catch (err) {
    Logger.log('Lỗi extractMatchesFromApi: ' + err.message);
  }

  return matches;
}

/**
 * Thêm số 0 phía trước nếu số < 10.
 *
 * @param {number} n - Số cần pad
 * @returns {string} Chuỗi số đã pad
 */
function padZero(n) {
  return n < 10 ? '0' + n : String(n);
}


// ============================================================
// HÀM TIỆN ÍCH BỔ SUNG
// ============================================================

/**
 * Hàm khởi tạo - Tạo tất cả sheet khi chạy lần đầu.
 * Người dùng có thể chạy hàm này thủ công từ Script Editor.
 */
function initializeSheets() {
  var sheetNames = Object.keys(SHEET_HEADERS);
  for (var i = 0; i < sheetNames.length; i++) {
    var name = sheetNames[i];
    getOrCreateSheet(name, SHEET_HEADERS[name]);
  }
  Logger.log('✅ Đã khởi tạo tất cả sheet: ' + sheetNames.join(', '));
}

/**
 * Hàm test - Kiểm tra kết nối FIFA API.
 * Chạy từ Script Editor để verify API hoạt động.
 */
function testFifaApi() {
  var result = proxyFifaApi();
  Logger.log('FIFA API Result: ' + JSON.stringify(result).substring(0, 500));
  return result;
}

/**
 * Hàm test - Kiểm tra xử lý lệnh.
 */
function testProcessCommand() {
  var tests = [
    { cmd: '/do #5 2-1 3-0', desc: 'Đặt cược' },
    { cmd: '/me all', desc: 'Xem dự đoán' },
    { cmd: '/today', desc: 'Trận hôm nay' },
    { cmd: '/top do', desc: 'Bảng xếp hạng' },
    { cmd: '/bet', desc: 'Thông tin tài khoản' },
    { cmd: '/xyz', desc: 'Lệnh không hợp lệ' }
  ];

  for (var i = 0; i < tests.length; i++) {
    var result = processCommand(tests[i].cmd, 'test@example.com', 'TestUser');
    Logger.log('[' + tests[i].desc + '] ' + tests[i].cmd + ' → ' + result.message);
  }
}
