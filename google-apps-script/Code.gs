// ============================================================
// FWC 2026 BETTING WEBAPP - GOOGLE APPS SCRIPT BACKEND
// ============================================================
// Tệp này xử lý toàn bộ logic backend cho ứng dụng cá dự đoán
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
  'Schedule': ['matchId', 'matchNumber', 'date', 'localDate', 'localDateOnly', 'stage', 'group', 'homeName', 'homeAbbr', 'homeFlag', 'homeScore', 'awayName', 'awayAbbr', 'awayFlag', 'awayScore', 'stadium', 'city', 'status', 'resultType', 'homePenaltyScore', 'awayPenaltyScore', 'matchTime', 'lastUpdated'],
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
        var bulk = e.parameter.bulk === 'true';
        if (!matchId) return createCorsOutput({ success: false, message: 'Thiếu matchId', data: null });
        result = getMatchBets(matchId, bulk);
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
      var lastUpdated = allData[1][22]; // Cột lastUpdated
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
        AwayTeamPenaltyScore: row[20] !== '' ? parseInt(row[20]) : null,
        MatchTime: row[21] || ''
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
        m.MatchTime || '',
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
    updateResultsSheet(apiResponse.Results);
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
 * Cập nhật kết quả các trận đấu đã kết thúc vào sheet Results.
 */
function updateResultsSheet(results) {
  try {
    var sheet = getOrCreateSheet('Results', SHEET_HEADERS['Results']);
    var allData = sheet.getDataRange().getValues();
    
    // Tạo map các matchId đã tồn tại trong sheet Results để tránh trùng lặp
    var existingRows = {}; // matchId -> row index (1-indexed)
    for (var i = 1; i < allData.length; i++) {
      existingRows[String(allData[i][0])] = i + 1;
    }
    
    var updatedCount = 0;
    var addedCount = 0;
    
    for (var j = 0; j < results.length; j++) {
      var m = results[j];
      
      // Chỉ xử lý các trận đấu đã kết thúc (MatchStatus === 10)
      if (m.MatchStatus === 10 || m.MatchStatus === 0) {
        var matchId = String(m.IdMatch);
        var matchNumber = m.MatchNumber;
        
        var homeScore = m.HomeTeamScore !== null ? m.HomeTeamScore : '';
        var awayScore = m.AwayTeamScore !== null ? m.AwayTeamScore : '';
        var extraHomeScore = '';
        var extraAwayScore = '';
        var penaltyHome = m.HomeTeamPenaltyScore !== null ? m.HomeTeamPenaltyScore : '';
        var penaltyAway = m.AwayTeamPenaltyScore !== null ? m.AwayTeamPenaltyScore : '';
        var status = 'completed';
        
        // Kiểm tra nếu trận đấu có hiệp phụ (ResultType === 2) hoặc penalty
        var isExtraTime = (m.ResultType === 2 || m.HomeTeamPenaltyScore !== null || m.AwayTeamPenaltyScore !== null);
        if (isExtraTime) {
          extraHomeScore = homeScore;
          extraAwayScore = awayScore;
          
          // Ước lượng tỷ số 90 phút (bắt buộc phải hòa để vào hiệp phụ)
          var drawScore = Math.min(Number(homeScore), Number(awayScore));
          homeScore = drawScore;
          awayScore = drawScore;
        }
        
        var rowData = [
          matchId,
          matchNumber,
          homeScore,
          awayScore,
          extraHomeScore,
          extraAwayScore,
          penaltyHome,
          penaltyAway,
          status
        ];
        
        if (existingRows[matchId]) {
          var rowIndex = existingRows[matchId];
          // Kiểm tra xem dữ liệu có thay đổi hay không trước khi ghi đè
          var currentRow = allData[rowIndex - 1];
          var needsUpdate = false;
          for (var c = 0; c < rowData.length; c++) {
            if (String(currentRow[c]) !== String(rowData[c])) {
              needsUpdate = true;
              break;
            }
          }
          if (needsUpdate) {
            sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
            updatedCount++;
          }
        } else {
          sheet.appendRow(rowData);
          addedCount++;
        }
      }
    }
    
    Logger.log('Cập nhật sheet Results thành công: Thêm mới ' + addedCount + ', Cập nhật ' + updatedCount);
    
  } catch (error) {
    Logger.log('Lỗi khi cập nhật sheet Results: ' + error.message);
  }
}

/**
 * Hàm chạy định kỳ từ trigger để đồng bộ lịch thi đấu và kết quả.
 */
function triggerSyncMatchesAndResults() {
  Logger.log('Bắt đầu đồng bộ định kỳ...');
  var apiResponse = fetchFifaApiRaw();
  if (apiResponse && apiResponse.Results) {
    saveMatchesToSheet(apiResponse.Results);
    updateResultsSheet(apiResponse.Results);
    Logger.log('Đồng bộ định kỳ hoàn tất.');
  } else {
    Logger.log('Đồng bộ định kỳ thất bại: Không lấy được dữ liệu từ FIFA API.');
  }
}

/**
 * Thiết lập trigger chạy định kỳ mỗi 10 phút.
 * Chạy hàm này một lần từ Script Editor để cài đặt.
 */
function setupSyncTrigger() {
  // Xóa các trigger cũ cùng tên để tránh trùng lặp
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'triggerSyncMatchesAndResults') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Tạo trigger mới chạy mỗi 10 phút
  ScriptApp.newTrigger('triggerSyncMatchesAndResults')
    .timeBased()
    .everyMinutes(10)
    .create();
  
  Logger.log('✅ Đã thiết lập trigger chạy triggerSyncMatchesAndResults mỗi 10 phút.');
}


/**
 * Lấy danh sách dự đoán ngoài (Special Bets) của tất cả người chơi.
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
    
    return { success: true, message: 'Lấy danh sách dự đoán ngoài thành công', data: list };
    
  } catch (error) {
    return { success: false, message: 'Lỗi lấy dự đoán ngoài: ' + error.message, data: null };
  }
}

/**
 * Đặt dự đoán ngoài (Special Bets) cho người chơi.
 */
function placeSpecialBet(data) {
  try {
    if (!data.email) {
      return { success: false, message: 'Thiếu email', data: null };
    }

    // Kiểm tra thời gian khóa dự đoán ngoài (trước khi trận đầu tiên bắt đầu)
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
        return { success: false, message: '❌ Giải đấu đã chính thức khởi tranh. Bạn không thể đặt hoặc sửa dự đoán ngoài!', data: null };
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
      return { success: true, message: '✅ Đã cập nhật dự đoán ngoài giải thành công!', data: null };
    } else {
      sheet.appendRow(rowData);
      return { success: true, message: '✅ Đã lưu dự đoán ngoài giải thành công!', data: null };
    }
    
  } catch (error) {
    return { success: false, message: 'Lỗi lưu dự đoán ngoài: ' + error.message, data: null };
  }
}

/**
 * Xóa một dòng dự đoán dự đoán ngoài (Special Bet) của user theo timestamp.
 */
function deleteSpecialBet(data) {
  try {
    if (!data.email || !data.timestamp) {
      return { success: false, message: 'Thiếu thông tin bắt buộc (email, timestamp)', data: null };
    }
    
    // Kiểm tra thời gian khóa dự đoán ngoài (trước khi trận đầu tiên bắt đầu)
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
        return { success: false, message: '❌ Giải đấu đã chính thức khởi tranh. Bạn không thể xóa dự đoán ngoài!', data: null };
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
      return { success: true, message: '✅ Đã xóa dự đoán dự đoán ngoài thành công!', data: null };
    } else {
      return { success: false, message: '❌ Không tìm thấy dự đoán ngoài cần xóa hoặc dự đoán không thuộc về bạn!', data: null };
    }
    
  } catch (error) {
    return { success: false, message: 'Lỗi khi xóa dự đoán ngoài: ' + error.message, data: null };
  }
}

/**
 * Kiểm tra xem hiệp 2 đã bắt đầu hay chưa.
 */
function isSecondHalfStarted(matchStartTimeStr, matchStatus, matchTime) {
  var now = new Date();
  var matchStartTime = new Date(matchStartTimeStr);
  var elapsedMs = now.getTime() - matchStartTime.getTime();
  
  if (matchStatus === 10) {
    return true;
  }
  
  if (matchStatus === 3 || matchStatus === 4) {
    if (matchTime) {
      var minutes = parseInt(matchTime.split('+')[0].replace(/[^0-9]/g, ''), 10);
      if (!isNaN(minutes) && minutes > 45) {
        return true;
      }
    }
    if (elapsedMs >= 60 * 60 * 1000) {
      return true;
    }
  }
  
  return false;
}

/**
 * Đặt dự đoán cho một trận đấu.
 * Nếu đã tồn tại dự đoán cho cùng user + match + betType, sẽ cập nhật.
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
      return { success: false, message: 'Loại dự đoán không hợp lệ. Chỉ chấp nhận: do, khomau, hp', data: null };
    }

    // Validate định dạng scores (n-n hoặc n-n,n-n,...)
    var scoresArr = data.scores.split(',').map(function(s) { return s.trim(); });
    for (var i = 0; i < scoresArr.length; i++) {
      var s = scoresArr[i];
      if (!/^\d+-\d+$/.test(s)) {
        return { success: false, message: 'Định dạng tỷ số không hợp lệ: "' + s + '". Đúng format: n-n', data: null };
      }
    }

    // 0. Kiểm tra thời gian khóa dự đoán từ sheet Schedule
    var scheduleSheet = getOrCreateSheet('Schedule', SHEET_HEADERS['Schedule']);
    var scheduleData = scheduleSheet.getDataRange().getValues();
    var matchStartStr = null;
    var matchStatus = 0;
    var matchNumber = 0;
    var matchTime = '';

    for (var i = 1; i < scheduleData.length; i++) {
      if (String(scheduleData[i][0]) === String(data.matchId)) {
        matchStartStr = scheduleData[i][2]; // Cột date
        matchStatus = parseInt(scheduleData[i][17]); // Cột status
        matchNumber = parseInt(scheduleData[i][1]); // Cột matchNumber
        matchTime = scheduleData[i][21]; // Cột matchTime
        break;
      }
    }

    if (matchStartStr) {
      var now = new Date();
      var matchStartTime = new Date(matchStartStr);
      var isStarted = matchStatus === 3 || matchStatus === 4 || matchStatus === 10 || now > matchStartTime;

      if (data.betType === 'do') {
        if (isStarted) {
          return { success: false, message: '❌ Trận đấu đã bắt đầu hoặc đã kết thúc. Bạn không thể đặt hoặc sửa dự đoán 90 phút!', data: null };
        }
      } else if (data.betType === 'khomau') {
        if (matchStatus === 10) {
          return { success: false, message: '❌ Trận đấu đã kết thúc. Bạn không thể đặt hoặc sửa dự đoán khô máu!', data: null };
        }
        if (!isSecondHalfStarted(matchStartStr, matchStatus, matchTime)) {
          return { success: false, message: '❌ Dự đoán Khô máu chỉ mở khi trận đấu bắt đầu hiệp 2!', data: null };
        }
      } else if (data.betType === 'hp') {
        if (matchNumber < 73) {
          return { success: false, message: '❌ Dự đoán Hiệp phụ chỉ áp dụng cho các trận đấu từ vòng Knockout (vòng 32) trở đi!', data: null };
        }
        if (matchStatus === 10) {
          return { success: false, message: '❌ Trận đấu đã kết thúc. Bạn không thể đặt hoặc sửa dự đoán hiệp phụ!', data: null };
        }
        if (!isSecondHalfStarted(matchStartStr, matchStatus, matchTime)) {
          return { success: false, message: '❌ Dự đoán Hiệp phụ chỉ mở khi trận đấu bắt đầu hiệp 2!', data: null };
        }
      }
    }

    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    
    var overwrite = data.overwrite !== false; // default to true if not specified
    
    if (overwrite) {
      // 1. Xóa tất cả các dự đoán cũ cùng matchId + betType của user này
      deleteBetRows(data.email, data.matchId, data.betType);
    } else {
      // 1. Lấy danh sách dự đoán hiện tại của user này cho trận đấu và loại dự đoán này để tránh thêm trùng
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
    
    // 2. Thêm từng dự đoán mới làm một dòng riêng biệt với dấu nháy đơn để ép kiểu plain text
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
    return { success: false, message: 'Lỗi khi đặt dự đoán: ' + error.message, data: null };
  }
}

/**
 * Xóa tất cả dòng dự đoán của user cụ thể cho một trận đấu và loại dự đoán.
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
    Logger.log('Lỗi khi xóa dòng dự đoán cũ: ' + e.message);
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

    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();
    var foundRow = -1;
    var betType = '';

    for (var i = 1; i < allData.length; i++) {
      var rowEmail = allData[i][1];    // email
      var rowMatchId = String(allData[i][3]);  // matchId
      var rowScore = String(allData[i][6]);   // scores

      if (rowEmail === data.email && rowMatchId === String(data.matchId) && rowScore === data.oldScore) {
        foundRow = i + 1;
        betType = allData[i][5]; // betType
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

    // 0. Kiểm tra thời gian khóa dự đoán từ sheet Schedule
    var scheduleSheet = getOrCreateSheet('Schedule', SHEET_HEADERS['Schedule']);
    var scheduleData = scheduleSheet.getDataRange().getValues();
    var matchStartStr = null;
    var matchStatus = 0;
    var matchNumber = 0;
    var matchTime = '';

    for (var i = 1; i < scheduleData.length; i++) {
      if (String(scheduleData[i][0]) === String(data.matchId)) {
        matchStartStr = scheduleData[i][2]; // Cột date
        matchStatus = parseInt(scheduleData[i][17]); // Cột status
        matchNumber = parseInt(scheduleData[i][1]); // Cột matchNumber
        matchTime = scheduleData[i][21]; // Cột matchTime
        break;
      }
    }

    if (matchStartStr) {
      var now = new Date();
      var matchStartTime = new Date(matchStartStr);
      var isStarted = matchStatus === 3 || matchStatus === 4 || matchStatus === 10 || now > matchStartTime;

      if (betType === 'do') {
        if (isStarted) {
          return { success: false, message: '❌ Trận đấu đã bắt đầu hoặc đã kết thúc. Bạn không thể sửa dự đoán 90 phút!', data: null };
        }
      } else if (betType === 'khomau') {
        if (matchStatus === 10) {
          return { success: false, message: '❌ Trận đấu đã kết thúc. Bạn không thể sửa dự đoán khô máu!', data: null };
        }
        if (!isSecondHalfStarted(matchStartStr, matchStatus, matchTime)) {
          return { success: false, message: '❌ Dự đoán Khô máu chỉ mở khi trận đấu bắt đầu hiệp 2!', data: null };
        }
      } else if (betType === 'hp') {
        if (matchNumber < 73) {
          return { success: false, message: '❌ Dự đoán Hiệp phụ chỉ áp dụng cho các trận đấu từ vòng Knockout (vòng 32) trở đi!', data: null };
        }
        if (matchStatus === 10) {
          return { success: false, message: '❌ Trận đấu đã kết thúc. Bạn không thể sửa dự đoán hiệp phụ!', data: null };
        }
        if (!isSecondHalfStarted(matchStartStr, matchStatus, matchTime)) {
          return { success: false, message: '❌ Dự đoán Hiệp phụ chỉ mở khi trận đấu bắt đầu hiệp 2!', data: null };
        }
      }
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
 * Lấy danh sách dự đoán của người dùng.
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
 * Lấy tất cả dự đoán cho một trận đấu cụ thể.
 *
 * @param {string} matchId - ID trận đấu
 * @returns {Object} {success, message, data}
 */
function getMatchBets(matchId, bulk) {
  try {
    var sheet = getOrCreateSheet('Bets', SHEET_HEADERS['Bets']);
    var allData = sheet.getDataRange().getValues();

    if (bulk) {
      var matchIds = String(matchId).split(',').map(function(id) { return id.trim(); });
      var bulkBets = {};
      for (var k = 0; k < matchIds.length; k++) {
        bulkBets[matchIds[k]] = [];
      }

      for (var i = 1; i < allData.length; i++) {
        var rowMatchId = String(allData[i][3]);
        if (bulkBets.hasOwnProperty(rowMatchId)) {
          bulkBets[rowMatchId].push({
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
        message: 'Lấy danh sách dự đoán gộp thành công',
        data: bulkBets
      };
    }

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
 * Lấy tất cả dự đoán (dùng cho trang tổng quan).
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
// XỬ LÝ LỆNH CHAT (COMMANDS) - ĐÃ CHUYỂN SANG Discord.gs
// ============================================================


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
    var typeNames = { 'do': '🏆 90\' nhiều nhất', 'win': '🥇 Thắng nhiều nhất', 'lost': '💀 Thua nhiều nhất', 'khomau': '🔥 Khô máu nhiều nhất', 'hp': '⏱️ Hiệp phụ nhiều nhất' };
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
      // Kiểm tra xem World Cup đã bắt đầu chưa (lấy thời gian của trận khai mạc)
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
        var currentTime = new Date();
        if (currentTime >= firstMatchStartTime) {
          return {
            success: false,
            message: '❌ Giải đấu đã chính thức khởi tranh. Hệ thống đã đóng đăng ký cho tài khoản mới!',
            data: null
          };
        }
      }

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

    // Thống kê cá dự đoán
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
 * Tìm hàng dự đoán đã tồn tại cho user + match + betType.
 *
 * @param {string} email - Email người dùng
 * @param {string} matchId - ID trận đấu
 * @param {string} betType - Loại dự đoán (do/khomau/hp)
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
        stadiumName: m.Stadium ? (m.Stadium.Name ? (m.Stadium.Name[0] ? m.Stadium.Name[0].Description : '') : '') : '',
        matchTime: m.MatchTime || ''
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
    { cmd: '/do #5 2-1 3-0', desc: 'Đặt dự đoán' },
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
