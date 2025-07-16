/*  ===============================
    Google Apps Script ‑ Back‑end
    v2  (14 Jul 2025)
    • แก้บั๊กเวลาไม่แสดงบน FullCalendar (ส่ง ISO‑string)
    • ป้องกันช่องเวลาซ้ำ + โยน error กลับฝั่ง UI
    • เพิ่ม log ช่วยดีบั๊ก (testListEvents)
    =============================== */

/* ------------ CONST ------------ */
const SHEET_NAME = 'Sheet1';
const TZ = 'Asia/Bangkok';

/* -------------------------------------------------- */
/*  WEB‑APP ENTRY                                     */
/* -------------------------------------------------- */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Meeting Room')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* -------------------------------------------------- */
/*  CALENDAR API  (→ FullCalendar)                    */
/* -------------------------------------------------- */
function listEvents() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const rows = sh.getDataRange().getValues();
  const events = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const [id, date, startT, endT, name, department, company, purpose, email, timestamp, status] =
      [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10]];

    const startObj = mergeDateTime(date, startT);
    const endObj = mergeDateTime(date, endT);
    if (!startObj || !endObj) continue;            // skip broken rows

    const start = startObj.toISOString();          // ← FullCalendar expects ISO string
    const end = endObj.toISOString();

    const stat = String(status || '').toLowerCase();
    const color = stat === 'cancelled' ? '#e57373' : '#81c784';

    events.push({
      id,
      title: `${(purpose || 'ประชุม').substring(0, 17)}`,
      start,
      end,
      backgroundColor: color,
      borderColor: color,
      extendedProps: {
        booker: name,
        department,
        company,
        purpose,
        email,
        timestamp: convertTimestamp(timestamp),
        status: status || ''
      }
    });
  }
  return events;               // usable by google.script.run
}

/* -------------------------------------------------- */
/*  BOOKING API                                       */
/* -------------------------------------------------- */
function submitBooking(data) {
  const clash = isDuplicate(data.date, data.start, data.end);
  if (clash.dup) throw new Error(clash.msg);

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const id = sh.getLastRow();
  const now = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy, HH:mm:ss');

  sh.appendRow([
    id,
    data.date,
    data.start,
    data.end,
    data.name,
    data.department,
    data.company,
    data.purpose,
    data.email,
    now,
    ''
  ]);
  return { status: 'ok' };
}

/* -------------------------------------------------- */
/*  DUPLICATE CHECK                                   */
/* -------------------------------------------------- */
function isDuplicate(dateISO, tStart, tEnd) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const rows = sh.getDataRange().getValues().slice(1);

  const reqStart = new Date(`${dateISO}T${padTime(tStart)}:00`).getTime();
  const reqEnd = new Date(`${dateISO}T${padTime(tEnd)}:00`).getTime();

  for (const r of rows) {
    const [, d, st, et, booker] = r;
    if (!d || !st || !et) continue;

    const dISO = (d instanceof Date)
      ? Utilities.formatDate(d, TZ, 'yyyy-MM-dd')
      : (String(d).includes('-') ? d : Utilities.formatDate(parseDDMMYYYY(d), TZ, 'yyyy-MM-dd'));
    if (dISO !== dateISO) continue;

    const slotStart = new Date(`${dISO}T${padTime(st)}:00`).getTime();
    const slotEnd = new Date(`${dISO}T${padTime(et)}:00`).getTime();

    if (reqStart < slotEnd && reqEnd > slotStart) {
      return {
        dup: true,
        msg: `ช่วง ${padTime(tStart)}‑${padTime(tEnd)} ถูกจองแล้วโดย “${booker}”\nกรุณาเลือกเวลาอื่นหรือติดต่อผู้ดูแล`
      };
    }
  }
  return { dup: false };
}
function padTime(t) {
  if (t instanceof Date) return t.toTimeString().slice(0, 5);
  if (typeof t === 'number') {
    const mins = Math.round(t * 1440); return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const s = String(t).trim();
  if (s.includes(':')) {
    const [h, m = '00'] = s.split(':'); return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  }
  return `${s.padStart(2, '0')}:00`;
}

/* -------------------------------------------------- */
/*  DATE‑TIME HELPERS                                 */
/* -------------------------------------------------- */
function mergeDateTime(dateVal, timeVal) {
  if (!dateVal || !timeVal) return null;
  const dObj = (dateVal instanceof Date)
    ? new Date(dateVal)
    : (String(dateVal).includes('-') ? new Date(dateVal) : parseDDMMYYYY(dateVal));
  if (isNaN(dObj)) return null;
  const [h, m] = padTime(timeVal).split(':').map(Number);
  dObj.setHours(h, m, 0, 0);
  return dObj;                   //  ← คืน Date object (ไป toISOString ภายหลัง)
}
function parseDDMMYYYY(s) {
  const [dd, mm, yy] = String(s).split('/');
  const yyyy = (+yy > 2500) ? +yy - 543 : +yy;
  return new Date(`${yyyy}-${mm}-${dd}`);
}
function convertTimestamp(ts) {
  if (!ts) return '';
  if (ts instanceof Date) return Utilities.formatDate(ts, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  const [dPart, tPart = '00:00:00'] = String(ts).split(', ');
  const d = parseDDMMYYYY(dPart);
  if (isNaN(d)) return '';
  const [h = '00', m = '00', s = '00'] = tPart.split(':');
  d.setHours(+h, +m, +s);
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

/* ========== AUTH CONFIG ========== */
const USER_SHEET = 'Users';

/* แปลง plain password → hash (SHA-256 → base64) */
function hash(pwd) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pwd)
  );
}

/* ดึงข้อมูลผู้ใช้จาก email */
function findUser(email) {
  const sh = SpreadsheetApp.getActive().getSheetByName(USER_SHEET);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() === email.toLowerCase()) {
      return {
        row: i + 1,
        id: data[i][0],
        name: data[i][1],
        email: data[i][2],
        hash: data[i][3],
        role: data[i][4],
        created: data[i][5]
      };
    }
  }
  return null;
}

/* เข้าสู่ระบบ */
function loginUser(obj) {
  const u = findUser(obj.email);
  if (!u) throw new Error('ไม่พบบัญชีนี้ในระบบ');
  if (u.hash !== hash(obj.pwd)) throw new Error('รหัสผ่านไม่ถูกต้อง');

  const prop = PropertiesService.getUserProperties();
  prop.setProperty('email', u.email);
  prop.setProperty('name', u.name);
  prop.setProperty('role', u.role);
  return { ok: true };
}

/* สมัครผู้ใช้ใหม่ */
function registerUser(obj) {
  const u = findUser(obj.email);
  if (u) throw new Error('อีเมลนี้มีอยู่ในระบบแล้ว');

  const sh = SpreadsheetApp.getActive().getSheetByName(USER_SHEET);
  const id = sh.getLastRow(); // ใช้ row เป็น id (auto increment)
  const now = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy, HH:mm:ss');

  sh.appendRow([
    id,
    obj.name,
    obj.email,
    hash(obj.pwd),
    'user',   // default role
    now
  ]);

  return loginUser(obj); // auto login after register
}

/* ดึง session ปัจจุบัน */
function getSessionUser() {
  const prop = PropertiesService.getUserProperties();
  const email = prop.getProperty('email');
  const name = prop.getProperty('name');
  const role = prop.getProperty('role');
  return email ? { email, name, role } : null;
}

/* ลบ session */
function logoutUser() {
  PropertiesService.getUserProperties().deleteAllProperties();
}



/* ---------- DEV TEST ---------- */
function testListEvents() {
  const ev = listEvents();
  Logger.log(`👉 events=${ev.length}`);
  Logger.log(JSON.stringify(ev.slice(0, 3), null, 2));
}
