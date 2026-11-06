/**
 * CHUKA COMRADES — Games backend (eFootball + Pool)
 * Google Apps Script + Google Sheets + Google Drive.
 *
 * SETUP (once):
 *  1. script.google.com → New project → paste this file as Code.gs.
 *  2. Project Settings → Script properties, add:
 *       FIREBASE_API_KEY = your Firebase web API key (same as VITE_FIREBASE_API_KEY)
 *       ADMIN_EMAILS     = comma separated admin Google emails
 *  3. Run setup() once and approve permissions. It creates the spreadsheet, Drive folders and triggers.
 *  4. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone.
 *  5. Put the /exec URL in .env as VITE_GAMES_API_URL.
 */

var TABLES = {
  USERS: ['user_id','firebase_uid','email','course','year_of_study','whatsapp','free_note','profile_status','activation_status','created_at','updated_at'],
  EFOOTBALL_PROFILES: ['profile_id','user_id','efootball_username','account_image_file_id','account_image_url','active','created_at','updated_at'],
  POOL_PROFILES: ['profile_id','user_id','pool_name','preferred_points','active','created_at','updated_at'],
  AVAILABILITY: ['availability_id','user_id','day','start_time','end_time','active'],
  TOURNAMENTS: ['tournament_id','game','name','target_course','target_year','event_date','start_time','max_players','description','poster_file_id','poster_url','organizer_user_id','organizer_name','organizer_whatsapp','room_number','pool_point_id','status','winner_name','created_at','completed_at','expires_at'],
  TOURNAMENT_PARTICIPANTS: ['participant_id','tournament_id','participant_name','participant_whatsapp','added_at'],
  TOURNAMENT_WINNERS: ['tournament_id','game','tournament_name','winner_name','organizer_name','completed_at'],
  EFOOTBALL_ACCOUNTS: ['listing_id','seller_user_id','efootball_username','account_image_file_id','account_image_url','description','price','whatsapp','status','created_at','updated_at','sold_at'],
  POOL_POINTS: ['point_id','name','image_file_id','image_url','location','maps_url','description','status','created_at','updated_at','manager_name','manager_whatsapp'],
  PAYMENTS: ['payment_id','user_id','email','mpesa_code','amount','status','submitted_at','reviewed_at','reviewed_by'],
  ADMIN_LOGS: ['log_id','admin_email','action','target','at'],
  SETTINGS: ['key','value']
};

var DEFAULT_SETTINGS = {
  activation_fee: '20',
  mpesa_till: '6817863',
  admin_whatsapp: '254180752220',
  completed_expiry_days: '3'
};

var DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

/* ───────────── setup ───────────── */

function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  var id = props.getProperty('SHEET_ID');
  ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('CHUKA COMRADES DATABASE');
  props.setProperty('SHEET_ID', ss.getId());

  Object.keys(TABLES).forEach(function (name) {
    var s = ss.getSheetByName(name) || ss.insertSheet(name);
    var h = TABLES[name];
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#1d4f91').setFontColor('#ffffff');
    s.getRange(1, 1, s.getMaxRows(), h.length).setNumberFormat('@'); // keep dates/times as text
    s.setFrozenRows(1);
  });
  var extra = ss.getSheetByName('Sheet1');
  if (extra && ss.getSheets().length > 1) ss.deleteSheet(extra);

  var settings = ss.getSheetByName('SETTINGS');
  var existing = rows('SETTINGS').map(function (r) { return r.key; });
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (existing.indexOf(k) < 0) settings.appendRow([k, DEFAULT_SETTINGS[k]]);
  });

  // Drive folders
  var root = getOrCreateFolder(DriveApp.getRootFolder(), 'CHUKA COMRADES');
  var ef = getOrCreateFolder(root, 'Efootball');
  var folders = {
    players: getOrCreateFolder(ef, 'Player Accounts'),
    market: getOrCreateFolder(ef, 'Account Marketplace'),
    tournaments: getOrCreateFolder(ef, 'Tournament Posters'),
    pool: getOrCreateFolder(getOrCreateFolder(root, 'Pool'), 'Pool Points')
  };
  Object.keys(folders).forEach(function (k) { props.setProperty('FOLDER_' + k.toUpperCase(), folders[k].getId()); });

  installTriggers();
  Logger.log('Database: ' + ss.getUrl());
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'expireTournaments') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('expireTournaments').timeBased().everyHours(1).create();
}

function getOrCreateFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* ───────────── sheet helpers ───────────── */

function ss_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')); }

var TZ_ = null;

/** Normalise cell values: Sheets may auto-convert "18:00" to a 1899 Date or "TRUE" to a boolean. */
function cell(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (!TZ_) TZ_ = ss_().getSpreadsheetTimeZone();
    if (Number(Utilities.formatDate(v, TZ_, 'yyyy')) < 1950) return Utilities.formatDate(v, TZ_, 'HH:mm');
    return Utilities.formatDate(v, TZ_, 'HH:mm:ss') === '00:00:00' ? Utilities.formatDate(v, TZ_, 'yyyy-MM-dd') : v.toISOString();
  }
  return String(v);
}

function rows(name) {
  var s = ss_().getSheetByName(name);
  var v = s.getDataRange().getValues();
  var h = v.shift();
  var out = [];
  v.forEach(function (r, i) {
    if (r[0] === '' || r[0] === null) return;
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = cell(r[j]); });
    out.push(o);
  });
  return out;
}

function add(name, obj) {
  var h = TABLES[name];
  var s = ss_().getSheetByName(name);
  var rg = s.getRange(s.getLastRow() + 1, 1, 1, h.length);
  rg.setNumberFormat('@'); // force plain text so times/booleans are not converted
  rg.setValues([h.map(function (k) { return obj[k] === undefined ? '' : String(obj[k]); })]);
}

function upd(name, rowNum, obj) {
  var h = TABLES[name];
  var s = ss_().getSheetByName(name);
  Object.keys(obj).forEach(function (k) {
    var c = h.indexOf(k);
    if (c < 0) return;
    var rg = s.getRange(rowNum, c + 1);
    rg.setNumberFormat('@');
    rg.setValue(String(obj[k]));
  });
}

function remove(name, rowNum) { ss_().getSheetByName(name).deleteRow(rowNum); }

function setting(key) {
  var r = rows('SETTINGS').filter(function (x) { return x.key === key; })[0];
  return r ? r.value : DEFAULT_SETTINGS[key];
}

function yes(v) { return String(v).toLowerCase() === 'true'; }

function now() { return new Date().toISOString(); }

function nextId(prefix, table, idCol) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var year = new Date().getFullYear();
    var n = rows(table).filter(function (r) { return String(r[idCol]).indexOf(prefix + '-' + year) === 0; }).length + 1;
    return prefix + '-' + year + '-' + ('000' + n).slice(-3);
  } finally { lock.releaseLock(); }
}

function shortId(prefix) { return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }

/* ───────────── auth ───────────── */

function verifyUser(idToken) {
  if (!idToken) throw new Error('Please sign in first.');
  var key = PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY');
  var res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + key, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ idToken: idToken })
  });
  if (res.getResponseCode() !== 200) throw new Error('Your session expired. Please sign in again.');
  var u = JSON.parse(res.getContentText()).users[0];
  return { uid: u.localId, email: (u.email || '').toLowerCase() };
}

function isAdmin(email) {
  var list = (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '').toLowerCase().split(',');
  return list.map(function (x) { return x.trim(); }).indexOf(email) > -1;
}

function requireAdmin(auth) { if (!isAdmin(auth.email)) throw new Error('Admin access required.'); }

function getOrCreateUser(auth) {
  var u = rows('USERS').filter(function (r) { return r.firebase_uid === auth.uid; })[0];
  if (u) return u;
  var o = { user_id: shortId('U'), firebase_uid: auth.uid, email: auth.email, profile_status: 'incomplete', activation_status: 'inactive', created_at: now(), updated_at: now() };
  add('USERS', o);
  return rows('USERS').filter(function (r) { return r.firebase_uid === auth.uid; })[0];
}

function requireActive(user) {
  if (user.activation_status !== 'active') throw new Error('Activate your profile (KSh ' + setting('activation_fee') + ') to use this feature.');
}

/* ───────────── HTTP ───────────── */

function out(data, cb) {
  var text = JSON.stringify(data);
  if (cb) return ContentService.createTextOutput(cb + '(' + text + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = e.parameter || {};
  try {
    var data;
    switch (p.action) {
      case 'bootstrap': data = { settings: publicSettings() }; break;
      case 'players': data = { players: publicPlayers() }; break;
      case 'pool_players': data = { players: publicPoolPlayers() }; break;
      case 'tournaments': data = { tournaments: publicTournaments(p.game) }; break;
      case 'tournament': data = { tournament: publicTournaments().filter(function (t) { return t.id === p.id; })[0] || null }; break;
      case 'market': data = { listings: publicMarket(), settings: publicSettings() }; break;
      case 'market_item': data = { listing: publicMarket().filter(function (l) { return l.id === p.id; })[0] || null }; break;
      case 'pool_points': data = { points: publicPoolPoints() }; break;
      default: throw new Error('Unknown action');
    }
    data.success = true;
    return out(data, p.callback);
  } catch (err) { return out({ success: false, error: String(err.message || err) }, p.callback); }
}

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    var auth = verifyUser(b.idToken);
    var fn = ACTIONS[b.action];
    if (!fn) throw new Error('Unknown action');
    var result = fn(auth, b) || {};
    result.success = true;
    return out(result);
  } catch (err) { return out({ success: false, error: String(err.message || err) }); }
}

/* ───────────── public readers ───────────── */

function publicSettings() {
  return { activationFee: Number(setting('activation_fee')), mpesaTill: setting('mpesa_till'), adminWhatsApp: setting('admin_whatsapp') };
}

function availabilityFor(userId, all) {
  return all.filter(function (a) { return a.user_id === userId && yes(a.active); })
    .map(function (a) { return { day: a.day, start: a.start_time, end: a.end_time }; });
}

function activeUsers() {
  var m = {};
  rows('USERS').forEach(function (u) { if (String(u.activation_status).toLowerCase() === 'active') m[u.user_id] = u; });
  return m;
}

function publicPlayers() {
  var users = activeUsers(), av = rows('AVAILABILITY');
  return rows('EFOOTBALL_PROFILES').filter(function (p) { return yes(p.active) && users[p.user_id]; }).map(function (p) {
    var u = users[p.user_id];
    return { id: p.profile_id, username: p.efootball_username, image: p.account_image_url, imageId: p.account_image_file_id, course: u.course, year: u.year_of_study, availability: availabilityFor(p.user_id, av) };
  });
}

function publicPoolPlayers() {
  var users = activeUsers(), av = rows('AVAILABILITY');
  return rows('POOL_PROFILES').filter(function (p) { return yes(p.active) && users[p.user_id]; }).map(function (p) {
    var u = users[p.user_id];
    return { id: p.profile_id, name: p.pool_name, points: p.preferred_points, course: u.course, year: u.year_of_study, availability: availabilityFor(p.user_id, av) };
  });
}

function publicTournaments(game) {
  var parts = rows('TOURNAMENT_PARTICIPANTS'), t = Date.now();
  return rows('TOURNAMENTS').filter(function (r) {
    if (game && r.game !== game) return false;
    if (r.status === 'archived') return false;
    if (r.status === 'completed' && r.expires_at && new Date(r.expires_at).getTime() < t) return false;
    return true;
  }).map(function (r) {
    return {
      id: r.tournament_id, game: r.game, name: r.name, course: r.target_course, year: r.target_year,
      date: r.event_date, time: r.start_time, max: Number(r.max_players) || 0,
      registered: parts.filter(function (p) { return p.tournament_id === r.tournament_id; }).length,
      description: r.description, poster: r.poster_url, posterId: r.poster_file_id, organizer: r.organizer_name, organizerWhatsApp: r.organizer_whatsapp,
      hasRoom: !!r.room_number, poolPointId: r.pool_point_id, status: r.status, winner: r.winner_name, expiresAt: r.expires_at
    };
  }).reverse();
}

function publicMarket() {
  return rows('EFOOTBALL_ACCOUNTS').filter(function (l) { return l.status === 'available'; }).map(function (l) {
    return { id: l.listing_id, username: l.efootball_username, image: l.account_image_url, imageId: l.account_image_file_id, description: l.description, price: Number(l.price) || 0, status: l.status, created: l.created_at };
  }).reverse();
}

function publicPoolPoints() {
  return rows('POOL_POINTS').filter(function (p) { return p.status === 'active'; }).map(function (p) {
    return { id: p.point_id, name: p.name, image: p.image_url, imageId: p.image_file_id, location: p.location, mapsUrl: p.maps_url, description: p.description, managerName: p.manager_name, managerWhatsApp: p.manager_whatsapp };
  });
}

/* ───────────── signed-in actions ───────────── */

var ACTIONS = {

  get_me: function (auth) {
    var u = getOrCreateUser(auth);
    var ef = rows('EFOOTBALL_PROFILES').filter(function (p) { return p.user_id === u.user_id; })[0];
    var pool = rows('POOL_PROFILES').filter(function (p) { return p.user_id === u.user_id; })[0];
    var pay = rows('PAYMENTS').filter(function (p) { return p.user_id === u.user_id; }).pop();
    return {
      isAdmin: isAdmin(auth.email),
      user: { course: u.course, year: u.year_of_study, whatsapp: u.whatsapp, activation: u.activation_status, profile: u.profile_status },
      efootball: ef ? { username: ef.efootball_username, image: ef.account_image_url } : null,
      pool: pool ? { name: pool.pool_name, points: pool.preferred_points } : null,
      availability: availabilityFor(u.user_id, rows('AVAILABILITY')),
      lastPayment: pay ? { status: pay.status, code: pay.mpesa_code } : null
    };
  },

  upload_image: function (auth, b) {
    var u = getOrCreateUser(auth);
    var folderKey = { players: 'PLAYERS', market: 'MARKET', tournaments: 'TOURNAMENTS', pool: 'POOL' }[b.folder];
    if (!folderKey) throw new Error('Invalid folder.');
    if (b.folder === 'pool') requireAdmin(auth); else if (b.folder !== 'players') requireActive(u);
    if (!/^image\/(jpeg|png|webp)$/.test(b.mime || '')) throw new Error('Only JPG, PNG or WebP images are allowed.');
    if ((b.data || '').length > 4000000) throw new Error('Image is too large. Max about 3 MB.');
    var blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mime, shortId('IMG') + '.' + b.mime.split('/')[1]);
    var folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_' + folderKey));
    var f = folder.createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { fileId: f.getId(), url: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1200' };
  },

  save_profile: function (auth, b) {
    var u = getOrCreateUser(auth);
    var course = String(b.course || '').trim().slice(0, 80);
    var year = String(b.year || '').trim().slice(0, 10);
    var wa = normalizePhone(b.whatsapp);
    if (!course || !year || !wa) throw new Error('Course, year of study and a valid WhatsApp number are required.');
    upd('USERS', u._row, { course: course, year_of_study: year, whatsapp: wa, profile_status: 'complete', updated_at: now() });

    if (b.efootball) {
      var name = String(b.efootball.username || '').trim().slice(0, 30);
      if (!/^[A-Za-z0-9_.-]{3,30}$/.test(name)) throw new Error('eFootball username must be 3–30 letters, numbers, _ . or -');
      var taken = rows('EFOOTBALL_PROFILES').filter(function (p) { return p.efootball_username.toLowerCase() === name.toLowerCase() && p.user_id !== u.user_id; })[0];
      if (taken) throw new Error('That eFootball username is already taken.');
      var cur = rows('EFOOTBALL_PROFILES').filter(function (p) { return p.user_id === u.user_id; })[0];
      var fields = { efootball_username: name, updated_at: now(), active: 'TRUE' };
      if (b.efootball.imageFileId) { fields.account_image_file_id = b.efootball.imageFileId; fields.account_image_url = b.efootball.imageUrl; }
      if (cur) upd('EFOOTBALL_PROFILES', cur._row, fields);
      else { fields.profile_id = shortId('EP'); fields.user_id = u.user_id; fields.created_at = now(); add('EFOOTBALL_PROFILES', fields); }
    }
    if (b.pool) {
      var pn = String(b.pool.name || '').trim().slice(0, 30);
      if (pn.length < 2) throw new Error('Enter a pool name.');
      var pc = rows('POOL_PROFILES').filter(function (p) { return p.user_id === u.user_id; })[0];
      var pf = { pool_name: pn, preferred_points: String(b.pool.points || '').slice(0, 200), updated_at: now(), active: 'TRUE' };
      if (pc) upd('POOL_PROFILES', pc._row, pf);
      else { pf.profile_id = shortId('PP'); pf.user_id = u.user_id; pf.created_at = now(); add('POOL_PROFILES', pf); }
    }
    if (Array.isArray(b.availability)) {
      rows('AVAILABILITY').filter(function (a) { return a.user_id === u.user_id; }).reverse().forEach(function (a) { remove('AVAILABILITY', a._row); });
      b.availability.slice(0, 14).forEach(function (a) {
        if (DAYS.indexOf(a.day) < 0 || !a.start || !a.end) return;
        add('AVAILABILITY', { availability_id: shortId('AV'), user_id: u.user_id, day: a.day, start_time: a.start, end_time: a.end, active: 'TRUE' });
      });
    }
    return {};
  },

  submit_activation: function (auth, b) {
    var u = getOrCreateUser(auth);
    if (u.profile_status !== 'complete') throw new Error('Complete your profile first.');
    if (u.activation_status === 'active') throw new Error('Your profile is already active.');
    var code = String(b.mpesaCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(code)) throw new Error('Enter the 10-character M-Pesa transaction code.');
    if (rows('PAYMENTS').some(function (p) { return p.mpesa_code === code; })) throw new Error('That M-Pesa code has already been submitted.');
    add('PAYMENTS', { payment_id: shortId('PAY'), user_id: u.user_id, email: u.email, mpesa_code: code, amount: setting('activation_fee'), status: 'pending', submitted_at: now() });
    upd('USERS', u._row, { activation_status: 'pending', updated_at: now() });
    return {};
  },

  get_contact: function (auth, b) {
    requireActive(getOrCreateUser(auth));
    var map = { player: ['EFOOTBALL_PROFILES', 'profile_id'], pool: ['POOL_PROFILES', 'profile_id'], market: ['EFOOTBALL_ACCOUNTS', 'listing_id'] }[b.kind];
    if (!map) throw new Error('Invalid request.');
    var rec = rows(map[0]).filter(function (r) { return r[map[1]] === b.id; })[0];
    if (!rec) throw new Error('Not found.');
    var uid = rec.user_id || rec.seller_user_id;
    var owner = rows('USERS').filter(function (x) { return x.user_id === uid; })[0];
    if (!owner || !owner.whatsapp) throw new Error('No contact available.');
    return { whatsapp: owner.whatsapp };
  },

  /* tournaments (eFootball + Pool) */

  create_tournament: function (auth, b) {
    var u = getOrCreateUser(auth);
    requireActive(u);
    var game = b.game === 'Pool' ? 'Pool' : 'eFootball';
    var name = String(b.name || '').trim().slice(0, 80);
    var max = parseInt(b.max, 10);
    if (!name || !b.date || !b.time) throw new Error('Name, date and start time are required.');
    if (!(max >= 2 && max <= 256)) throw new Error('Maximum players must be between 2 and 256.');
    var prof = game === 'Pool'
      ? rows('POOL_PROFILES').filter(function (p) { return p.user_id === u.user_id; })[0]
      : rows('EFOOTBALL_PROFILES').filter(function (p) { return p.user_id === u.user_id; })[0];
    var organizer = prof ? (prof.pool_name || prof.efootball_username) : null;
    if (!organizer) throw new Error('Create your ' + game + ' profile before organising a tournament.');
    var id = nextId(game === 'Pool' ? 'PL' : 'EF', 'TOURNAMENTS', 'tournament_id');
    add('TOURNAMENTS', {
      tournament_id: id, game: game, name: name, target_course: String(b.course || 'All courses').slice(0, 80), target_year: String(b.year || 'All years').slice(0, 20),
      event_date: b.date, start_time: b.time, max_players: max, description: String(b.description || '').slice(0, 600),
      poster_file_id: b.posterFileId || '', poster_url: b.posterUrl || '', organizer_user_id: u.user_id, organizer_name: organizer,
      organizer_whatsapp: u.whatsapp, room_number: game === 'eFootball' ? String(b.room || '').slice(0, 30) : '', pool_point_id: b.poolPointId || '',
      status: 'open', created_at: now()
    });
    return { id: id };
  },

  my_tournaments: function (auth) {
    var u = getOrCreateUser(auth);
    var parts = rows('TOURNAMENT_PARTICIPANTS');
    return {
      tournaments: rows('TOURNAMENTS').filter(function (t) { return t.organizer_user_id === u.user_id && t.status !== 'archived'; }).map(function (t) {
        return { id: t.tournament_id, name: t.name, game: t.game, status: t.status, room: t.room_number, winner: t.winner_name,
          participants: parts.filter(function (p) { return p.tournament_id === t.tournament_id; }).map(function (p) { return { id: p.participant_id, name: p.participant_name, whatsapp: p.participant_whatsapp }; }) };
      })
    };
  },

  get_room: function (auth, b) {
    requireActive(getOrCreateUser(auth));
    var t = findTournament(b.id);
    if (!t.room_number) throw new Error('No room number has been added yet.');
    return { room: t.room_number };
  },

  add_participant: function (auth, b) {
    var t = organizerTournament(auth, b.id);
    if (t.status === 'completed' || t.status === 'archived') throw new Error('This tournament is finished.');
    var parts = rows('TOURNAMENT_PARTICIPANTS').filter(function (p) { return p.tournament_id === t.tournament_id; });
    if (parts.length >= Number(t.max_players)) throw new Error('Tournament is full.');
    var name = String(b.name || '').trim().slice(0, 40);
    if (!name) throw new Error('Enter the participant name.');
    add('TOURNAMENT_PARTICIPANTS', { participant_id: shortId('TP'), tournament_id: t.tournament_id, participant_name: name, participant_whatsapp: normalizePhone(b.whatsapp) || '', added_at: now() });
    if (parts.length + 1 >= Number(t.max_players)) upd('TOURNAMENTS', t._row, { status: 'full' });
    return {};
  },

  remove_participant: function (auth, b) {
    var t = organizerTournament(auth, b.id);
    var p = rows('TOURNAMENT_PARTICIPANTS').filter(function (x) { return x.participant_id === b.participantId && x.tournament_id === t.tournament_id; })[0];
    if (p) remove('TOURNAMENT_PARTICIPANTS', p._row);
    if (t.status === 'full') upd('TOURNAMENTS', t._row, { status: 'open' });
    return {};
  },

  set_room: function (auth, b) {
    var t = organizerTournament(auth, b.id);
    upd('TOURNAMENTS', t._row, { room_number: String(b.room || '').trim().slice(0, 30) });
    return {};
  },

  declare_winner: function (auth, b) {
    var t = organizerTournament(auth, b.id);
    var winner = String(b.winner || '').trim().slice(0, 40);
    if (!winner) throw new Error('Choose the winner.');
    var days = Number(setting('completed_expiry_days')) || 3;
    var done = new Date();
    var exp = new Date(done.getTime() + days * 86400000);
    upd('TOURNAMENTS', t._row, { status: 'completed', winner_name: winner, completed_at: done.toISOString(), expires_at: exp.toISOString() });
    if (!rows('TOURNAMENT_WINNERS').some(function (w) { return w.tournament_id === t.tournament_id; })) {
      add('TOURNAMENT_WINNERS', { tournament_id: t.tournament_id, game: t.game, tournament_name: t.name, winner_name: winner, organizer_name: t.organizer_name, completed_at: done.toISOString() });
    }
    return {};
  },

  set_registration: function (auth, b) {
    var t = organizerTournament(auth, b.id);
    if (t.status === 'completed' || t.status === 'archived') throw new Error('This tournament is finished.');
    upd('TOURNAMENTS', t._row, { status: b.open ? 'open' : 'full' });
    return {};
  },

  /* eFootball account marketplace */

  create_listing: function (auth, b) {
    var u = getOrCreateUser(auth);
    requireActive(u);
    var ef = rows('EFOOTBALL_PROFILES').filter(function (p) { return p.user_id === u.user_id; })[0];
    if (!ef) throw new Error('Create your eFootball profile first.');
    var price = Number(b.price);
    if (!(price >= 0) || !isFinite(price)) throw new Error('Enter a valid price.');
    if (!String(b.description || '').trim()) throw new Error('Describe the account.');
    var id = nextId('AC', 'EFOOTBALL_ACCOUNTS', 'listing_id');
    add('EFOOTBALL_ACCOUNTS', { listing_id: id, seller_user_id: u.user_id, efootball_username: ef.efootball_username, account_image_file_id: b.imageFileId || '', account_image_url: b.imageUrl || '',
      description: String(b.description).slice(0, 800), price: price, whatsapp: u.whatsapp, status: 'available', created_at: now(), updated_at: now() });
    return { id: id };
  },

  my_listings: function (auth) {
    var u = getOrCreateUser(auth);
    return { listings: rows('EFOOTBALL_ACCOUNTS').filter(function (l) { return l.seller_user_id === u.user_id; }).map(function (l) { return { id: l.listing_id, price: Number(l.price), status: l.status, description: l.description }; }) };
  },

  mark_sold: function (auth, b) {
    var u = getOrCreateUser(auth);
    var l = rows('EFOOTBALL_ACCOUNTS').filter(function (x) { return x.listing_id === b.id && x.seller_user_id === u.user_id; })[0];
    if (!l) throw new Error('Listing not found.');
    upd('EFOOTBALL_ACCOUNTS', l._row, { status: 'sold', sold_at: now(), updated_at: now() });
    return {};
  },

  /* admin */

  admin_payments: function (auth) {
    requireAdmin(auth);
    return { payments: rows('PAYMENTS').filter(function (p) { return p.status === 'pending'; }).map(function (p) { return { id: p.payment_id, email: p.email, code: p.mpesa_code, amount: p.amount, at: p.submitted_at }; }) };
  },

  admin_review_payment: function (auth, b) {
    requireAdmin(auth);
    var p = rows('PAYMENTS').filter(function (x) { return x.payment_id === b.id; })[0];
    if (!p) throw new Error('Payment not found.');
    var approve = !!b.approve;
    upd('PAYMENTS', p._row, { status: approve ? 'approved' : 'rejected', reviewed_at: now(), reviewed_by: auth.email });
    var u = rows('USERS').filter(function (x) { return x.user_id === p.user_id; })[0];
    if (u) upd('USERS', u._row, { activation_status: approve ? 'active' : 'inactive', updated_at: now() });
    log(auth, approve ? 'approve_payment' : 'reject_payment', p.mpesa_code);
    return {};
  },

  admin_save_pool_point: function (auth, b) {
    requireAdmin(auth);
    var name = String(b.name || '').trim().slice(0, 80);
    var loc = String(b.location || '').trim().slice(0, 120);
    if (!name || !loc) throw new Error('Pool point name and location are required.');
    var mgr = String(b.managerWhatsApp || '').trim() ? normalizePhone(b.managerWhatsApp) : '';
    if (String(b.managerWhatsApp || '').trim() && !mgr) throw new Error('Enter a valid manager WhatsApp number, e.g. 0712345678.');
    var f = { manager_name: String(b.managerName || '').trim().slice(0, 60), manager_whatsapp: mgr, name: name, location: loc, maps_url: String(b.mapsUrl || '').slice(0, 400), description: String(b.description || '').slice(0, 500), status: b.status === 'inactive' ? 'inactive' : 'active', updated_at: now() };
    if (b.imageFileId) { f.image_file_id = b.imageFileId; f.image_url = b.imageUrl; }
    if (b.id) {
      var p = rows('POOL_POINTS').filter(function (x) { return x.point_id === b.id; })[0];
      if (!p) throw new Error('Pool point not found.');
      upd('POOL_POINTS', p._row, f);
    } else { f.point_id = shortId('PP'); f.created_at = now(); add('POOL_POINTS', f); }
    log(auth, 'save_pool_point', name);
    return {};
  },

  admin_pool_points: function (auth) {
    requireAdmin(auth);
    return { points: rows('POOL_POINTS').map(function (p) { return { id: p.point_id, name: p.name, image: p.image_url, imageId: p.image_file_id, location: p.location, mapsUrl: p.maps_url, description: p.description, status: p.status, managerName: p.manager_name, managerWhatsApp: p.manager_whatsapp }; }) };
  },

  admin_remove_listing: function (auth, b) {
    requireAdmin(auth);
    var l = rows('EFOOTBALL_ACCOUNTS').filter(function (x) { return x.listing_id === b.id; })[0];
    if (l) upd('EFOOTBALL_ACCOUNTS', l._row, { status: 'removed', updated_at: now() });
    log(auth, 'remove_listing', b.id);
    return {};
  },

  admin_remove_tournament: function (auth, b) {
    requireAdmin(auth);
    var t = findTournament(b.id);
    upd('TOURNAMENTS', t._row, { status: 'archived' });
    log(auth, 'archive_tournament', b.id);
    return {};
  }
};

/* ───────────── internals ───────────── */

function findTournament(id) {
  var t = rows('TOURNAMENTS').filter(function (x) { return x.tournament_id === id; })[0];
  if (!t) throw new Error('Tournament not found.');
  return t;
}

function organizerTournament(auth, id) {
  var u = getOrCreateUser(auth);
  var t = findTournament(id);
  if (t.organizer_user_id !== u.user_id) throw new Error('Only the organizer can do this.');
  return t;
}

function log(auth, action, target) {
  add('ADMIN_LOGS', { log_id: shortId('LOG'), admin_email: auth.email, action: action, target: target, at: now() });
}

function normalizePhone(v) {
  var n = String(v || '').replace(/\D/g, '');
  if (n.indexOf('0') === 0) n = '254' + n.slice(1);
  if (n.length === 9 && (n[0] === '7' || n[0] === '1')) n = '254' + n;
  return /^254[17]\d{8}$/.test(n) ? n : '';
}

/** Hourly trigger: completed tournaments past expires_at leave public view (record kept, status = archived). */
function expireTournaments() {
  var t = Date.now();
  rows('TOURNAMENTS').forEach(function (r) {
    if (r.status === 'completed' && r.expires_at && new Date(r.expires_at).getTime() < t) {
      upd('TOURNAMENTS', r._row, { status: 'archived' });
    }
  });
}
