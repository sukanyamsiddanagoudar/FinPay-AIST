// Calendar-month window in ONE consistent time zone (design assumption AS4).
// The zone is a fixed offset from UTC in minutes (India = 330). Timestamps are stored in UTC.
function monthBounds(now, offsetMinutes = 330) {
  const local = new Date(now.getTime() + offsetMinutes * 60000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1) - offsetMinutes * 60000),
    end: new Date(Date.UTC(y, m + 1, 1) - offsetMinutes * 60000), // exclusive
  };
}
module.exports = { monthBounds };
