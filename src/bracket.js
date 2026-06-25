import { Matches } from './matches.js';

/**
 * WC 2026 Knockout bracket
 * matchNumber 73-88  : Round of 32  (16 matches, 8 pairs)
 * matchNumber 89-96  : Round of 16  (8 matches,  4 pairs)
 * matchNumber 97-100 : Quarter-finals (4 matches, 2 pairs)
 * matchNumber 101-102: Semi-finals    (2 matches, 1 pair )
 * matchNumber 103    : 3rd place
 * matchNumber 104    : Final
 *
 * Bracket pairing (consecutive pairs):
 *   (73,74)→89  (75,76)→90  (77,78)→91  (79,80)→92
 *   (81,82)→93  (83,84)→94  (85,86)→95  (87,88)→96
 *   (89,90)→97  (91,92)→98  (93,94)→99  (95,96)→100
 *   (97,98)→101  (99,100)→102
 *   (101,102)→104
 */

export const Bracket = {

  async init() {
    await this.render();
  },

  /* ── layout math ─────────────────────────────────────────── */
  calcLayout(cardH, pairSep, groupSep) {
    const pairH = 2 * cardH + pairSep;   // height of one 2-match pair
    const step  = pairH + groupSep;       // vertical distance between pair tops

    // R32: 8 pairs × 2 matches = 16 positions
    const r32 = [];
    for (let i = 0; i < 8; i++) {
      r32.push({ top: i * step,                       center: i * step + cardH / 2 });
      r32.push({ top: i * step + cardH + pairSep,     center: i * step + cardH + pairSep + cardH / 2 });
    }

    const derive = (src, n) =>
      Array.from({ length: n }, (_, i) => {
        const c = (src[i * 2].center + src[i * 2 + 1].center) / 2;
        return { top: c - cardH / 2, center: c };
      });

    const r16 = derive(r32, 8);
    const qf  = derive(r16, 4);
    const sf  = derive(qf,  2);
    const fin = derive(sf,  1);

    const totalH = r32[15].top + cardH + 16;
    return { r32, r16, qf, sf, fin, totalH };
  },

  /* ── placeholder conversion (FIFA API → short code) ─────── */
  // "Winner Group A"   → "1A"
  // "Runner-up Group B"→ "2B"
  // "Best third-placed"→ "3rd"
  // "Winner Match 89"  → "W89"
  formatPlaceholder(ph) {
    if (!ph) return 'TBD';
    let m;
    m = ph.match(/[Ww]inner\s+[Gg]roup\s+([A-La-l])/);
    if (m) return `1${m[1].toUpperCase()}`;
    m = ph.match(/[Rr]unner.?[Uu]p\s+[Gg]roup\s+([A-La-l])/);
    if (m) return `2${m[1].toUpperCase()}`;
    if (/third|3rd/i.test(ph)) return '3rd';
    m = ph.match(/[Ww]inner\s+[Mm]atch\s+(\d+)/);
    if (m) return `W${m[1]}`;
    m = ph.match(/[Ll]oser\s+[Mm]atch\s+(\d+)/);
    if (m) return `L${m[1]}`;
    // Fallback: keep first 5 non-space chars
    return (ph.replace(/\s+/g, '').substring(0, 5)) || 'TBD';
  },

  /* ── match date & time in Vietnam timezone ───────────────── */
  formatDateTime(dateStr) {
    try {
      const dateObj = new Date(dateStr);
      const time = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(dateObj);
      const date = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
      }).format(dateObj);
      return `${time} ${date}`;
    } catch { return ''; }
  },

  /* ── match status info ───────────────────────────────────── */
  statusOf(match) {
    if (!match) return { isFinished: false, isLive: false, hs: '-', as: '-', winner: null, extra: '' };
    const now = new Date(), t0 = new Date(match.date), dt = now - t0;
    const isFinished = match.status === 0 || (dt > 130 * 60000 && now > t0);
    const isLive     = !isFinished && (match.status === 3 || match.status === 4 || now > t0);

    const hs = match.home.score !== null ? String(match.home.score) : '-';
    const as = match.away.score !== null ? String(match.away.score) : '-';

    let winner = null;
    if (isFinished && match.home.score !== null && match.away.score !== null) {
      if (match.homePenaltyScore !== null && match.awayPenaltyScore !== null) {
        winner = match.homePenaltyScore > match.awayPenaltyScore ? 'home' : 'away';
      } else if (match.home.score !== match.away.score) {
        winner = match.home.score > match.away.score ? 'home' : 'away';
      }
    }

    let extra = '';
    if (match.homePenaltyScore !== null && match.awayPenaltyScore !== null)
      extra = `PKS ${match.homePenaltyScore}–${match.awayPenaltyScore}`;
    else if (match.resultType === 2) extra = 'AET';

    return { isFinished, isLive, hs, as, winner, extra };
  },

  /* ── render a single match card ─────────────────────────── */
  cardHtml(match, pos, colW, cardH) {
    // No data at all → fully unknown slot
    if (!match) {
      return `<div class="bmc bmc--tbd" style="top:${pos.top}px;height:${cardH}px;right:0">
        <div class="bmc-head"><span class="bmc-num">?</span></div>
        <div class="bmc-team"><span class="bmc-ph">TBD</span><span class="bmc-s">-</span></div>
        <div class="bmc-team"><span class="bmc-ph">TBD</span><span class="bmc-s">-</span></div>
      </div>`;
    }

    const { isFinished, isLive, hs, as, winner, extra } = this.statusOf(match);
    const hw = winner === 'home', aw = winner === 'away';
    const fb = `onerror="this.src='https://api.fifa.com/api/v3/picture/flags-sq-2/TBD'"`;

    const homeIsTbd = match.home.abbr === 'TBD';
    const awayIsTbd = match.away.abbr === 'TBD';

    // Team display: if confirmed → flag + abbr; if TBD → placeholder code (e.g. "1A")
    const homeName = homeIsTbd
      ? this.formatPlaceholder(match.homePlaceholder || match.home.name)
      : (match.home.abbr || match.home.name);
    const awayName = awayIsTbd
      ? this.formatPlaceholder(match.awayPlaceholder || match.away.name)
      : (match.away.abbr || match.away.name);

    const homeHtml = homeIsTbd
      ? `<span class="bmc-ph">${homeName}</span>`
      : `<img class="bmc-flag" src="${match.home.flag}" alt="" ${fb}><span class="bmc-n">${homeName}</span>`;

    const awayHtml = awayIsTbd
      ? `<span class="bmc-ph">${awayName}</span>`
      : `<img class="bmc-flag" src="${match.away.flag}" alt="" ${fb}><span class="bmc-n">${awayName}</span>`;

    const timeStr = this.formatDateTime(match.date);

    let badge = '';
    if (isLive)     badge = `<span class="bmc-badge bmc-badge--live">LIVE</span>`;
    else if (isFinished) badge = `<span class="bmc-badge bmc-badge--ft">FT</span>`;

    const allTbd = homeIsTbd && awayIsTbd;

    let labelHtml = '';
    if (match && parseInt(match.matchNumber, 10) === 103) {
      labelHtml = `<div class="bmc-card-label" style="position:absolute;top:${pos.top - 16}px;left:0;font-size:0.6rem;font-weight:700;color:var(--primary);display:flex;align-items:center;gap:3px">
        <span>🥉</span> Tranh Hạng Ba
      </div>`;
    }

    return `${labelHtml}<div class="bmc ${isLive ? 'bmc--live' : ''} ${isFinished ? 'bmc--done' : ''} ${allTbd ? 'bmc--tbd' : ''}"
                 style="top:${pos.top}px;height:${cardH}px;right:0" title="#${match.matchNumber}">
      <div class="bmc-head">
        <span class="bmc-num">#${match.matchNumber}</span>
        ${timeStr ? `<span class="bmc-time">${timeStr}</span>` : ''}
        ${badge}
      </div>
      <div class="bmc-team ${hw ? 'bmc-w' : ''} ${aw && isFinished ? 'bmc-l' : ''}">
        ${homeHtml}
        <span class="bmc-s ${hw ? 'bmc-sw' : ''}">${hs}</span>
      </div>
      <div class="bmc-team ${aw ? 'bmc-w' : ''} ${hw && isFinished ? 'bmc-l' : ''}">
        ${awayHtml}
        <span class="bmc-s ${aw ? 'bmc-sw' : ''}">${as}</span>
      </div>
      ${extra ? `<div class="bmc-extra">${extra}</div>` : ''}
    </div>`;
  },

  /* ── SVG connector lines between rounds ──────────────────── */
  connectorLines(srcPos, dstPos, x1, x2) {
    const mid = Math.round((x1 + x2) / 2);
    return dstPos.map((dst, i) => {
      const s1 = srcPos[i * 2], s2 = srcPos[i * 2 + 1];
      return (
        `<line x1="${x1}" y1="${s1.center}" x2="${mid}" y2="${s1.center}"/>` +
        `<line x1="${x1}" y1="${s2.center}" x2="${mid}" y2="${s2.center}"/>` +
        `<line x1="${mid}" y1="${s1.center}" x2="${mid}" y2="${s2.center}"/>` +
        `<line x1="${mid}" y1="${dst.center}" x2="${x2}" y2="${dst.center}"/>`
      );
    }).join('');
  },

  /* ── main render ─────────────────────────────────────────── */
  async render() {
    const container = document.getElementById('bracket-container');
    if (!container) return;

    // Prefer knockoutMatches (includes TBD); fallback to filtering allMatches
    const src = (Matches.knockoutMatches && Matches.knockoutMatches.length > 0)
      ? Matches.knockoutMatches
      : Matches.allMatches.filter(m => parseInt(m.matchNumber, 10) >= 73);

    if (Matches.allMatches.length === 0 && src.length === 0) {
      container.innerHTML = `<div class="no-data" style="margin:32px">Chưa có dữ liệu trận đấu.</div>`;
      return;
    }

    const get = (n) => src.find(m => parseInt(m.matchNumber, 10) === n) || null;

    /* ── dynamic sizing: fill container width ── */
    const cardH    = 58;
    const pairSep  = 4;
    const groupSep = 14;
    const colGap   = 12; // connector zone between columns

    // Available inner width of bracket-container
    // bracket-scroll has padding: 0 12px → subtract 24px
    const innerW   = Math.max(0, (container.clientWidth || 360) - 24);
    const minColW  = 110;
    const colW     = Math.max(minColW, Math.floor((innerW - 4 * colGap) / 5));
    const boardW   = 5 * colW + 4 * colGap;
    const step     = colW + colGap;

    const layout   = this.calcLayout(cardH, pairSep, groupSep);
    const { totalH } = layout;

    const rounds = [
      { label: '1/32',       pos: layout.r32, nums: [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88] },
      { label: '1/16',       pos: layout.r16, nums: [89,90,91,92,93,94,95,96] },
      { label: 'Tứ Kết',     pos: layout.qf,  nums: [97,98,99,100] },
      { label: 'Bán Kết',    pos: layout.sf,  nums: [101,102] },
      { 
        label: 'Chung Kết & Hạng 3',  
        pos: [
          layout.fin[0],
          { top: layout.fin[0].top + cardH + 55, center: layout.fin[0].center + cardH + 55 }
        ], 
        nums: [104, 103] 
      },
    ];

    /* columns */
    const colsHtml = rounds.map((r, ri) => {
      const cards = r.nums.map((n, i) => this.cardHtml(get(n), r.pos[i], colW, cardH)).join('');
      return `<div class="bmc-col" style="left:${ri*step}px;width:${colW}px;height:${totalH}px">${cards}</div>`;
    }).join('');

    /* SVG connectors */
    const svgLines = [
      [layout.r32, layout.r16],
      [layout.r16, layout.qf],
      [layout.qf,  layout.sf],
      [layout.sf,  layout.fin],
    ].map(([src2, dst], ri) =>
      this.connectorLines(src2, dst, ri * step + colW, (ri + 1) * step)
    ).join('');

    /* champion banner */
    let champHtml = '';
    const finalM = get(104);
    if (finalM) {
      const { isFinished, winner } = this.statusOf(finalM);
      if (isFinished && winner) {
        const ch = winner === 'home' ? finalM.home : finalM.away;
        const fb = `onerror="this.src='https://api.fifa.com/api/v3/picture/flags-sq-2/TBD'"`;
        champHtml = `<div class="bm-champ">
          <span class="bm-champ__icon">👑</span>
          <img class="bm-champ__flag" src="${ch.flag}" alt="" ${fb}>
          <div>
            <div class="bm-champ__label">🏆 Vô Địch FIFA World Cup 2026</div>
            <div class="bm-champ__name">${ch.name}</div>
          </div>
        </div>`;
      }
    }

    const standingsHtml = this.renderStandingsHtml(this.calculateStandings(Matches.allMatches));

    container.innerHTML = `
      <div class="bracket-wrapper">
        <div class="bracket-title-bar">
          <h2 class="bracket-title">🏟️ Sơ Đồ Thi Đấu Knockout</h2>
          <p class="bracket-subtitle">FIFA World Cup 2026 • Cuộn để xem đầy đủ</p>
        </div>
        ${champHtml}
        <div class="bracket-scroll">
          <div class="bm-headers" style="width:${boardW}px">
            ${rounds.map((r, ri) =>
              `<div class="bm-hdr" style="left:${ri*step}px;width:${colW}px">${r.label}</div>`
            ).join('')}
          </div>
          <div class="bm-board" style="width:${boardW}px;height:${totalH}px">
            ${colsHtml}
            <svg class="bm-svg" width="${boardW}" height="${totalH}" viewBox="0 0 ${boardW} ${totalH}">
              <g stroke="rgba(213,168,72,0.32)" stroke-width="1.5" fill="none" stroke-linecap="round">
                ${svgLines}
              </g>
            </svg>
          </div>
        </div>
        ${standingsHtml}
      </div>
    `;
  },

  /* ── calculate standings dynamically from matches ───────── */
  calculateStandings(allMatches) {
    const groupStageMatches = allMatches.filter(m => parseInt(m.matchNumber, 10) <= 72);
    const groups = {};

    groupStageMatches.forEach(m => {
      const gName = m.group || 'Group A';
      let gLabel = gName;
      const match = gName.match(/[Gg]roup\s+([A-La-l])/);
      if (match) {
        gLabel = `Bảng ${match[1].toUpperCase()}`;
      }

      if (!groups[gLabel]) {
        groups[gLabel] = {};
      }

      const grp = groups[gLabel];

      // Home team
      if (m.home && m.home.abbr && m.home.abbr !== 'TBD') {
        if (!grp[m.home.abbr]) {
          grp[m.home.abbr] = {
            abbr: m.home.abbr,
            name: m.home.name,
            flag: m.home.flag,
            mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0
          };
        }
        if (m.home.score !== null && m.away.score !== null) {
          const stats = grp[m.home.abbr];
          stats.mp += 1;
          stats.gf += m.home.score;
          stats.ga += m.away.score;
          if (m.home.score > m.away.score) {
            stats.w += 1;
            stats.pts += 3;
          } else if (m.home.score < m.away.score) {
            stats.l += 1;
          } else {
            stats.d += 1;
            stats.pts += 1;
          }
          stats.gd = stats.gf - stats.ga;
        }
      }

      // Away team
      if (m.away && m.away.abbr && m.away.abbr !== 'TBD') {
        if (!grp[m.away.abbr]) {
          grp[m.away.abbr] = {
            abbr: m.away.abbr,
            name: m.away.name,
            flag: m.away.flag,
            mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0
          };
        }
        if (m.home.score !== null && m.away.score !== null) {
          const stats = grp[m.away.abbr];
          stats.mp += 1;
          stats.gf += m.away.score;
          stats.ga += m.home.score;
          if (m.away.score > m.home.score) {
            stats.w += 1;
            stats.pts += 3;
          } else if (m.away.score < m.home.score) {
            stats.l += 1;
          } else {
            stats.d += 1;
            stats.pts += 1;
          }
          stats.gd = stats.gf - stats.ga;
        }
      }
    });

    const sortedGroups = {};
    for (const [gLabel, grp] of Object.entries(groups)) {
      sortedGroups[gLabel] = Object.values(grp).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.abbr.localeCompare(b.abbr);
      });
    }

    return sortedGroups;
  },

  /* ── render standings grid HTML ──────────────────────────── */
  renderStandingsHtml(sortedGroups) {
    const groupKeys = Object.keys(sortedGroups).sort();
    if (groupKeys.length === 0) return '';

    const cardsHtml = groupKeys.map(groupKey => {
      const teams = sortedGroups[groupKey];
      const rowsHtml = teams.map((t, idx) => {
        const rank = idx + 1;
        let rowClass = '';
        if (rank <= 2) rowClass = 'standings-row-qualify';
        else if (rank === 3) rowClass = 'standings-row-playoff';

        const gdStr = t.gd > 0 ? `+${t.gd}` : `${t.gd}`;

        return `<tr class="${rowClass}">
          <td class="standings-rank">${rank}</td>
          <td>
            <div class="standings-team-cell">
              <img class="standings-flag" src="${t.flag}" onerror="this.src='https://api.fifa.com/api/v3/picture/flags-sq-2/TBD'" alt="">
              <span class="standings-team-abbr" title="${t.name}">${t.abbr}</span>
            </div>
          </td>
          <td>${t.mp}</td>
          <td>${gdStr}</td>
          <td style="font-weight: 700;">${t.pts}</td>
        </tr>`;
      }).join('');

      return `<div class="standings-card">
        <div class="standings-card__title">${groupKey}</div>
        <table class="standings-table">
          <thead>
            <tr>
              <th style="width: 10%">#</th>
              <th style="width: 50%; text-align: left;">Đội</th>
              <th style="width: 10%">T</th>
              <th style="width: 15%">HS</th>
              <th style="width: 15%">Đ</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>`;
    }).join('');

    return `
      <div class="standings-section">
        <div class="standings-header">
          <h3 class="standings-title">📊 Bảng Xếp Hạng Vòng Bảng</h3>
          <p class="standings-subtitle">Hai đội đứng đầu mỗi bảng & 8 đội hạng 3 tốt nhất sẽ lọt vào Vòng Knockout</p>
        </div>
        <div class="standings-grid">
          ${cardsHtml}
        </div>
      </div>
    `;
  },
};
