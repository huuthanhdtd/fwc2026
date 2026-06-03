export const CONFIG = {
  GAS_WEB_APP_URL: import.meta.env.VITE_GAS_WEB_APP_URL || '',
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  FIFA_API_URL: 'https://api.fifa.com/api/v3/calendar/matches?from=2026-06-11T00%3A00%3A00Z&to=2026-07-21T14%3A59%3A59Z&language=en&count=500&idCompetition=17',
  COMPETITION_ID: '17',
  TOURNAMENT_START: '2026-06-11',
  TOURNAMENT_END: '2026-07-19',
};
