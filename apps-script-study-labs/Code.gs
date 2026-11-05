/**
 * Chuka Comrades — Study Labs API
 * Google Apps Script Web App backend.
 * Configure Script Properties before deployment; see README.md.
 */
const DEFAULT_ADMIN_EMAIL = 'sidneywafula30@gmail.com';
const CONFIG = {
  SHEET_ID: 'SHEET_ID',
  DRIVE_FOLDER_ID: 'DRIVE_FOLDER_ID',
  FIREBASE_API_KEY: 'FIREBASE_API_KEY',
  ADMIN_EMAILS: 'ADMIN_EMAILS',
  WHATSAPP_COMMUNITY_URL: 'WHATSAPP_COMMUNITY_URL',
  COVERS_FOLDER_ID: 'COVERS_FOLDER_ID',
  MPESA_NUMBER: 'MPESA_NUMBER',
  MPESA_NAME: 'MPESA_NAME'
};

const TABLES = {
  Resources: ['id','title','description','category','faculty','course','unit_code','unit_name','year_of_study','semester','file_id','file_url','file_name','mime_type','uploader_uid','uploader_email','status','downloads','created_at','rejection_reason','reviewed_by','reviewed_at'],
  Products: ['id','title','description','category','price_kes','preview_url','file_id','file_url','seller_uid','seller_email','status','created_at','rejection_reason','reviewed_by','reviewed_at','type','course','tags','cover_id','cover_url','demo_url','sales_count'],
  Orders: ['id','product_id','buyer_uid','buyer_email','amount_kes','payment_method','payment_reference','status','created_at','verified_by','verified_at','access_granted','product_title','seller_email'],
  StudyPartners: ['id','uid','email','display_name','course','year_of_study','units','study_mode','availability','intro','whatsapp_contact','status','created_at'],
  Opportunities: ['id','title','organisation','type','description','eligibility','location','application_url','deadline','status','created_at','suggested_by'],
  Events: ['id','title','organiser','event_type','description','event_date','location','registration_url','status','created_at','suggested_by'],
  WhatsAppGroups: ['id','title','course','year_of_study','unit_code','description','invite_url','status','created_at','updated_at'],
  Reports: ['id','item_type','item_id','reason','reporter_uid','reporter_email','status','created_at','resolved_by'],
  PartnerRequests: ['id','from_uid','from_email','from_name','from_contact','to_profile_id','to_uid','to_name','message','status','created_at','responded_at'],
  OfficialLinks: ['id','title','description','url','status','updated_at']
};

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = params.callback;
  let result;
  try {
    const action = params.action || 'bootstrap';
    if (action === 'bootstrap') result = bootstrap();
    else if (action === 'list') result = listItems(params.table, params);
    else if (action === 'download') result = registerDownload(params.id, null);
    else throw new Error('Unknown action');
  } catch (err) { result = { ok: false, error: safeMessage(err) }; }
  const output = JSON.stringify(result);
  if (callback && /^[A-Za-z_$][\w$.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + output + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result;
  try {
    const payload = parsePayload(e);
    const user = verifyFirebaseToken(payload.idToken);
    result = routePost(payload, user);
  } catch (err) { result = { ok: false, error: safeMessage(err) }; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function setupStudyLabs() {
  const props = PropertiesService.getScriptProperties();

  // --- Admin + defaults (only set if not already configured) ---
  if (!props.getProperty(CONFIG.ADMIN_EMAILS)) props.setProperty(CONFIG.ADMIN_EMAILS, DEFAULT_ADMIN_EMAIL);
  const adminEmails = props.getProperty(CONFIG.ADMIN_EMAILS).split(',').map(s => s.trim()).filter(Boolean);

  // --- Spreadsheet database ---
  let spreadsheet;
  const existingId = props.getProperty(CONFIG.SHEET_ID);
  if (existingId) spreadsheet = SpreadsheetApp.openById(existingId);
  else {
    spreadsheet = SpreadsheetApp.create('Chuka Comrades — Study Labs Database');
    props.setProperty(CONFIG.SHEET_ID, spreadsheet.getId());
  }

  const statusValues = {
    Resources: ['pending','active','rejected'],
    Products: ['pending','active','rejected'],
    Orders: ['pending','verified','rejected'],
    StudyPartners: ['pending','active','rejected'],
    Opportunities: ['active','closed','pending','rejected'],
    Events: ['active','closed','pending','rejected'],
    PartnerRequests: ['pending','accepted','declined'],
    WhatsAppGroups: ['active','disabled'],
    Reports: ['open','resolved'],
    OfficialLinks: ['active','disabled']
  };

  Object.keys(TABLES).forEach(name => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const headers = TABLES[name];
    // Write/refresh header row (adds any newly introduced columns without touching data rows)
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0b3d2e').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    // Status dropdown to prevent typos when you edit the Sheet by hand
    const statusCol = headers.indexOf('status') + 1;
    if (statusCol > 0 && statusValues[name]) {
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(statusValues[name], true).setAllowInvalid(false).build();
      sheet.getRange(2, statusCol, 1000, 1).setDataValidation(rule);
    }
  });

  // Remove the blank default tab
  const blank = spreadsheet.getSheetByName('Sheet1');
  if (blank && spreadsheet.getSheets().length > 1 && blank.getLastRow() === 0) spreadsheet.deleteSheet(blank);

  // Default official links
  const defaultLinks = [
    ['library','Chuka University Library','Official library portal','https://library.chuka.ac.ke/','active',new Date()],
    ['elearning','Chuka University E-learning','Official e-learning portal','https://odel.chuka.ac.ke/','active',new Date()],
    ['students','Current Student Resources','Official student information and resources','https://www.chuka.ac.ke/current-students/','active',new Date()]
  ];
  const linkSheet = spreadsheet.getSheetByName('OfficialLinks');
  if (linkSheet.getLastRow() < 2) linkSheet.getRange(2,1,defaultLinks.length,defaultLinks[0].length).setValues(defaultLinks);

  // Give admin(s) edit access to the database Sheet
  adminEmails.forEach(email => { try { spreadsheet.addEditor(email); } catch (e) { Logger.log('Could not add editor ' + email + ': ' + e.message); } });

  // --- Drive folder (private; files are only opened through the app after approval) ---
  let folderId = props.getProperty(CONFIG.DRIVE_FOLDER_ID);
  let folder;
  if (folderId) folder = DriveApp.getFolderById(folderId);
  else {
    folder = DriveApp.createFolder('Chuka Comrades Study Labs Uploads');
    folderId = folder.getId();
    props.setProperty(CONFIG.DRIVE_FOLDER_ID, folderId);
  }
  // Covers subfolder (cover images become public only after approval)
  let coversId = props.getProperty(CONFIG.COVERS_FOLDER_ID);
  let coversFolder = null;
  if (coversId) { try { coversFolder = DriveApp.getFolderById(coversId); } catch (e) { coversFolder = null; } }
  if (!coversFolder) { coversFolder = folder.createFolder('Covers'); props.setProperty(CONFIG.COVERS_FOLDER_ID, coversFolder.getId()); }
  adminEmails.forEach(email => { try { folder.addEditor(email); } catch (e) { Logger.log('Could not add editor ' + email + ': ' + e.message); } });

  const summary = {
    ok: true,
    spreadsheetUrl: spreadsheet.getUrl(),
    spreadsheetId: spreadsheet.getId(),
    driveFolderUrl: folder.getUrl(),
    driveFolderId: folderId,
    coversFolderId: coversFolder.getId(),
    mpesaSet: !!props.getProperty(CONFIG.MPESA_NUMBER),
    admins: adminEmails,
    tabs: Object.keys(TABLES),
    whatsappCommunityUrlSet: !!props.getProperty(CONFIG.WHATSAPP_COMMUNITY_URL),
    firebaseKeySet: !!props.getProperty(CONFIG.FIREBASE_API_KEY)
  };
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

/** Run this any time to confirm everything is wired up. Read the Execution log. */
function checkSetup() {
  const props = PropertiesService.getScriptProperties();
  const report = {};
  try { const ss = SpreadsheetApp.openById(props.getProperty(CONFIG.SHEET_ID)); report.sheet = 'OK: ' + ss.getUrl(); report.tabsMissing = Object.keys(TABLES).filter(t => !ss.getSheetByName(t)); } catch (e) { report.sheet = 'MISSING - run setupStudyLabs()'; }
  try { report.driveFolder = 'OK: ' + DriveApp.getFolderById(props.getProperty(CONFIG.DRIVE_FOLDER_ID)).getUrl(); } catch (e) { report.driveFolder = 'MISSING - run setupStudyLabs()'; }
  report.adminEmails = props.getProperty(CONFIG.ADMIN_EMAILS) || 'NOT SET';
  report.firebaseApiKey = props.getProperty(CONFIG.FIREBASE_API_KEY) ? 'set' : 'NOT SET (needed for uploads/admin)';
  report.coversFolder = props.getProperty(CONFIG.COVERS_FOLDER_ID) ? 'OK' : 'MISSING - run setupStudyLabs()';
  report.mpesa = props.getProperty(CONFIG.MPESA_NUMBER) ? 'set' : 'NOT SET (add it in the app: Admin > Settings)';
  report.whatsappCommunityUrl = props.getProperty(CONFIG.WHATSAPP_COMMUNITY_URL) || 'NOT SET (add the group link)';
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/** Call this to set/update the main WhatsApp community link from the editor. */
function setWhatsappCommunityUrl() {
  const url = 'PASTE_YOUR_WHATSAPP_GROUP_LINK_HERE';
  if (!/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(url)) throw new Error('Paste a valid WhatsApp link first (https://chat.whatsapp.com/...).');
  PropertiesService.getScriptProperties().setProperty(CONFIG.WHATSAPP_COMMUNITY_URL, url);
  Logger.log('WhatsApp community link saved.');
}

function bootstrap() {
  const props = PropertiesService.getScriptProperties();
  return {
    ok: true,
    module: 'Study Labs',
    whatsappCommunityUrl: props.getProperty(CONFIG.WHATSAPP_COMMUNITY_URL) || '',
    mpesaNumber: props.getProperty(CONFIG.MPESA_NUMBER) || '',
    mpesaName: props.getProperty(CONFIG.MPESA_NAME) || '',
    officialLinks: listItems('OfficialLinks', { limit: 20 }).items,
    sections: ['Resources','Products','StudyPartners','Opportunities','Events']
  };
}

function listItems(table, params) {
  if (!TABLES[table]) throw new Error('Invalid table');
  const sheet = getSheet(table);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { ok: true, items: [] };
  const headers = values[0];
  const rows = values.slice(1).map(row => Object.fromEntries(headers.map((h,i) => [h, row[i] instanceof Date ? row[i].toISOString() : row[i]])));
  const publicStatuses = ['active','published','approved'];
  let items = rows.filter(row => publicStatuses.includes(String(row.status || 'active').toLowerCase()));
  // Never expose account identifiers, email addresses, private WhatsApp contacts, or Drive IDs.
  const publicFields = {
    Resources: ['id','title','description','category','faculty','course','unit_code','unit_name','year_of_study','semester','file_name','mime_type','status','downloads','created_at'],
    Products: ['id','title','description','category','type','course','tags','price_kes','cover_url','demo_url','sales_count','status','created_at'],
    StudyPartners: ['id','display_name','course','year_of_study','units','study_mode','availability','intro','status','created_at'],
    Opportunities: ['id','title','organisation','type','description','eligibility','location','application_url','deadline','status','created_at'],
    Events: ['id','title','organiser','event_type','description','event_date','location','registration_url','status','created_at'],
    WhatsAppGroups: ['id','title','course','year_of_study','unit_code','description','invite_url','status','created_at','updated_at'],
    OfficialLinks: ['id','title','description','url','status','updated_at']
  };
  items = items.map(row => Object.fromEntries((publicFields[table] || []).filter(field => field in row).map(field => [field, row[field]])));
  if (params.q) {
    const q = String(params.q).toLowerCase();
    items = items.filter(row => Object.values(row).some(v => String(v || '').toLowerCase().includes(q)));
  }
  if (params.category) items = items.filter(row => String(row.category || row.type || '').toLowerCase() === String(params.category).toLowerCase());
  if (params.course) items = items.filter(row => String(row.course || '').toLowerCase().includes(String(params.course).toLowerCase()));
  items.reverse();
  const limit = Math.min(Math.max(Number(params.limit || 50), 1), 100);
  return { ok: true, items: items.slice(0, limit) };
}

function routePost(p, user) {
  const action = p.action;
  if (action === 'uploadResource') return uploadResource(p, user);
  if (action === 'createProduct') return createProduct(p, user);
  if (action === 'createOrder') return createOrder(p, user);
  if (action === 'saveStudyPartner') return saveStudyPartner(p, user);
  if (action === 'createReport') return createReport(p, user);
  if (action === 'downloadProduct') return registerDownload(p.id, user);
  if (action === 'myOrders') return myOrders(user);
  if (action === 'myPartnerProfile') return myPartnerProfile(user);
  if (action === 'requestPartner') return requestPartner(p, user);
  if (action === 'myPartnerRequests') return myPartnerRequests(user);
  if (action === 'respondPartnerRequest') return respondPartnerRequest(p, user);
  if (action === 'suggestListing') return suggestListing(p, user);
  if (action === 'adminVerifyOrder') { requireAdmin(user); return adminVerifyOrder(p, user); }
  if (action === 'adminSaveSettings') { requireAdmin(user); return adminSaveSettings(p); }
  if (action === 'whoami') return { ok: true, admin: isAdmin(user) };
  if (action === 'myUploads') return myUploads(user);
  if (action === 'adminList') { requireAdmin(user); return adminList(p); }
  if (action === 'adminReview') { requireAdmin(user); return adminReview(p, user); }
  if (action === 'adminUpdate') { requireAdmin(user); return adminUpdate(p); }
  if (action === 'adminCreateGroup') { requireAdmin(user); return adminCreateGroup(p); }
  if (action === 'adminPublish') { requireAdmin(user); return adminPublish(p); }
  throw new Error('Unknown action');
}

function uploadResource(p, user) {
  requireFields(p, ['title','category','fileName','mimeType','fileBase64']);
  checkUploadAllowed(user, p.fileName);
  const file = saveDriveFile(p.fileName, p.mimeType, p.fileBase64, user.email);
  const id = Utilities.getUuid();
  append('Resources', [id,p.title,p.description || '',p.category,p.faculty || '',p.course || '',p.unitCode || '',p.unitName || '',p.yearOfStudy || '',p.semester || '',file.getId(),file.getUrl(),p.fileName,p.mimeType,user.uid,user.email,'pending',0,new Date(),'','','']);
  return { ok: true, id, status: 'pending', message: 'Upload received and awaiting moderation.' };
}

const PRODUCT_TYPES = ['Project','Digital product','Template'];
const COVER_MIMES = ['image/jpeg','image/png','image/webp'];

function isHttpUrl(v) { return /^https?:\/\/[^\s]+$/i.test(String(v)); }
function cleanPhone(v) {
  const d = String(v || '').replace(/[^\d+]/g, '');
  if (d.replace(/\D/g, '').length < 9 || d.replace(/\D/g, '').length > 15) throw new Error('Enter a valid WhatsApp number, e.g. 0712345678.');
  return d;
}

function saveCover(base64, mime, ownerEmail) {
  if (COVER_MIMES.indexOf(mime) < 0) throw new Error('Cover image must be JPG, PNG or WebP.');
  const bytes = Utilities.base64Decode(String(base64).split(',').pop());
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Cover image must be under 2 MB.');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty(CONFIG.COVERS_FOLDER_ID) || props.getProperty(CONFIG.DRIVE_FOLDER_ID);
  if (!folderId) throw new Error('Run setupStudyLabs() first.');
  const file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, mime, 'cover-' + Utilities.getUuid() + '.' + ext));
  file.setDescription('Study Labs cover by ' + ownerEmail);
  return file;
}
function coverUrl(fileId) { return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800'; }

function createProduct(p, user) {
  requireFields(p, ['title','description','type','priceKes','fileName','mimeType','fileBase64','coverBase64','coverMime']);
  checkUploadAllowed(user, p.fileName);
  if (PRODUCT_TYPES.indexOf(p.type) < 0) throw new Error('Choose Project, Digital product or Template.');
  const price = Number(p.priceKes);
  if (isNaN(price) || price < 0 || price > 100000) throw new Error('Enter a valid price in KSh (0 for free).');
  if (p.demoUrl && !isHttpUrl(p.demoUrl)) throw new Error('Demo link must start with http:// or https://');
  const cover = saveCover(p.coverBase64, p.coverMime, user.email);
  const file = saveDriveFile(p.fileName, p.mimeType, p.fileBase64, user.email);
  const id = Utilities.getUuid();
  append('Products', [id,p.title,p.description,p.type,price,'',file.getId(),file.getUrl(),user.uid,user.email,'pending',new Date(),'','','',p.type,p.course || '',String(p.tags || '').slice(0,150),cover.getId(),coverUrl(cover.getId()),p.demoUrl || '',0]);
  return { ok: true, id, status: 'pending', message: 'Submitted for admin approval.' };
}

function createOrder(p, user) {
  requireFields(p, ['productId','paymentReference']);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const product = findById('Products', p.productId);
    if (!product || product.status !== 'active') throw new Error('This product is not available.');
    if (Number(product.price_kes) <= 0) throw new Error('This item is free. Use Download instead.');
    if (String(product.seller_uid) === String(user.uid)) throw new Error('You cannot buy your own product.');
    const ref = String(p.paymentReference).trim().toUpperCase();
    if (!/^[A-Z0-9]{8,12}$/.test(ref)) throw new Error('Enter the M-Pesa transaction code from your confirmation SMS (e.g. SBK1ABC2DE).');
    if (findByField('Orders', 'payment_reference', ref)) throw new Error('That M-Pesa code has already been submitted.');
    const orders = rowsAsObjects('Orders');
    if (orders.some(o => String(o.buyer_uid) === String(user.uid) && String(o.product_id) === String(p.productId) && ['pending','verified'].indexOf(String(o.status)) >= 0)) throw new Error('You already have an order for this product.');
    const id = Utilities.getUuid();
    append('Orders', [id,p.productId,user.uid,user.email,Number(product.price_kes),'M-Pesa',ref,'pending',new Date(),'','','',product.title,product.seller_email]);
    return { ok: true, id, status: 'pending', message: 'Payment submitted. The admin will verify it and unlock your download.' };
  } finally { lock.releaseLock(); }
}

function myOrders(user) {
  const items = rowsAsObjects('Orders').filter(o => String(o.buyer_uid) === String(user.uid))
    .map(o => ({ id: o.id, product_id: o.product_id, product_title: o.product_title, amount_kes: o.amount_kes, status: o.status, created_at: o.created_at }));
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { ok: true, items };
}

function adminVerifyOrder(p, user) {
  requireFields(p, ['id','decision']);
  const order = findById('Orders', p.id);
  if (!order) throw new Error('Order not found.');
  const product = findById('Products', order.product_id);
  if (p.decision === 'approve') {
    if (String(order.status) === 'verified') return { ok: true, status: 'verified' };
    if (!product || !product.file_id) throw new Error('Product file not found.');
    DriveApp.getFileById(product.file_id).addViewer(String(order.buyer_email));
    updateCellById('Orders', p.id, 'status', 'verified');
    updateCellById('Orders', p.id, 'access_granted', 'yes');
    updateCellById('Orders', p.id, 'verified_by', user.email);
    updateCellById('Orders', p.id, 'verified_at', new Date());
    updateCellById('Products', product.id, 'sales_count', Number(product.sales_count || 0) + 1);
    return { ok: true, status: 'verified' };
  }
  if (p.decision !== 'reject') throw new Error('Decision must be approve or reject.');
  if (String(order.access_granted) === 'yes' && product && product.file_id) { try { DriveApp.getFileById(product.file_id).removeViewer(String(order.buyer_email)); } catch (e) {} }
  updateCellById('Orders', p.id, 'status', 'rejected');
  updateCellById('Orders', p.id, 'access_granted', '');
  updateCellById('Orders', p.id, 'verified_by', user.email);
  updateCellById('Orders', p.id, 'verified_at', new Date());
  return { ok: true, status: 'rejected' };
}

function saveStudyPartner(p, user) {
  requireFields(p, ['displayName','course','yearOfStudy','whatsappContact']);
  const contact = cleanPhone(p.whatsappContact);
  const existing = findByField('StudyPartners', 'uid', user.uid);
  const id = existing ? existing.id : Utilities.getUuid();
  const row = [id,user.uid,user.email,String(p.displayName).slice(0,60),String(p.course).slice(0,80),p.yearOfStudy,String(p.units || '').slice(0,150),p.studyMode || 'In person',String(p.availability || '').slice(0,120),String(p.intro || '').slice(0,300),contact,'pending',existing ? existing.created_at : new Date()];
  if (existing) updateById('StudyPartners', id, row); else append('StudyPartners', row);
  return { ok: true, id, status: 'pending', message: 'Profile submitted for review.' };
}

function myPartnerProfile(user) {
  const profile = findByField('StudyPartners', 'uid', user.uid);
  if (!profile) return { ok: true, profile: null };
  const out = Object.assign({}, profile); delete out.uid;
  if (out.created_at instanceof Date) out.created_at = out.created_at.toISOString();
  return { ok: true, profile: out };
}

function requestPartner(p, user) {
  requireFields(p, ['profileId','message','contact']);
  const profile = findById('StudyPartners', p.profileId);
  if (!profile || profile.status !== 'active') throw new Error('This profile is not available.');
  if (String(profile.uid) === String(user.uid)) throw new Error('You cannot send a request to yourself.');
  const contact = cleanPhone(p.contact);
  const reqs = rowsAsObjects('PartnerRequests');
  if (reqs.some(r => String(r.from_uid) === String(user.uid) && String(r.to_profile_id) === String(p.profileId) && ['pending','accepted'].indexOf(String(r.status)) >= 0)) throw new Error('You already sent a request to this person.');
  const since = Date.now() - 24 * 60 * 60 * 1000;
  if (reqs.filter(r => String(r.from_uid) === String(user.uid) && new Date(r.created_at).getTime() > since).length >= 5) throw new Error('Daily request limit reached. Try again tomorrow.');
  const id = Utilities.getUuid();
  append('PartnerRequests', [id,user.uid,user.email,user.name || user.email.split('@')[0],contact,profile.id,profile.uid,profile.display_name,String(p.message).slice(0,300),'pending',new Date(),'']);
  return { ok: true, id, message: 'Request sent. If they accept, you will both see each other’s WhatsApp number.' };
}

function myPartnerRequests(user) {
  const all = rowsAsObjects('PartnerRequests');
  const incoming = all.filter(r => String(r.to_uid) === String(user.uid)).map(r => ({ id: r.id, from_name: r.from_name, message: r.message, status: r.status, created_at: r.created_at, contact: r.status === 'accepted' ? r.from_contact : '' }));
  const outgoing = all.filter(r => String(r.from_uid) === String(user.uid)).map(r => {
    let contact = '';
    if (r.status === 'accepted') { const prof = findById('StudyPartners', r.to_profile_id); contact = prof ? prof.whatsapp_contact : ''; }
    return { id: r.id, to_name: r.to_name, message: r.message, status: r.status, created_at: r.created_at, contact };
  });
  incoming.reverse(); outgoing.reverse();
  return { ok: true, incoming, outgoing };
}

function respondPartnerRequest(p, user) {
  requireFields(p, ['id','decision']);
  const r = findById('PartnerRequests', p.id);
  if (!r || String(r.to_uid) !== String(user.uid)) throw new Error('Request not found.');
  if (String(r.status) !== 'pending') throw new Error('This request was already answered.');
  if (['accept','decline'].indexOf(p.decision) < 0) throw new Error('Decision must be accept or decline.');
  updateCellById('PartnerRequests', p.id, 'status', p.decision === 'accept' ? 'accepted' : 'declined');
  updateCellById('PartnerRequests', p.id, 'responded_at', new Date());
  return { ok: true, status: p.decision === 'accept' ? 'accepted' : 'declined' };
}

function suggestListing(p, user) {
  requireFields(p, ['table','record']);
  const r = p.record || {};
  if (!r.title) throw new Error('Missing required field: title');
  const url = r.applicationUrl || r.registrationUrl || '';
  if (url && !isHttpUrl(url)) throw new Error('The link must start with http:// or https://');
  const pendingMine = rowsAsObjects(p.table === 'Events' ? 'Events' : 'Opportunities').filter(o => String(o.suggested_by) === user.email && String(o.status) === 'pending').length;
  if (pendingMine >= 5) throw new Error('You already have 5 suggestions awaiting review.');
  const id = Utilities.getUuid(), t = (v, n) => String(v || '').slice(0, n);
  if (p.table === 'Opportunities') append('Opportunities', [id,t(r.title,120),t(r.organisation,80),t(r.type,40),t(r.description,500),t(r.eligibility,200),t(r.location,80),url,t(r.deadline,20),'pending',new Date(),user.email]);
  else if (p.table === 'Events') append('Events', [id,t(r.title,120),t(r.organiser,80),t(r.eventType,40),t(r.description,500),t(r.eventDate,20),t(r.location,80),url,'pending',new Date(),user.email]);
  else throw new Error('Invalid destination.');
  return { ok: true, id, message: 'Thanks! Your suggestion will appear once the admin approves it.' };
}

function adminSaveSettings(p) {
  const props = PropertiesService.getScriptProperties();
  if (p.whatsappCommunityUrl !== undefined && p.whatsappCommunityUrl !== '') {
    if (!/^https:\/\/(chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel)\//i.test(String(p.whatsappCommunityUrl))) throw new Error('Enter a valid WhatsApp link (https://chat.whatsapp.com/…).');
    props.setProperty(CONFIG.WHATSAPP_COMMUNITY_URL, String(p.whatsappCommunityUrl).trim());
  }
  if (p.mpesaNumber !== undefined) props.setProperty(CONFIG.MPESA_NUMBER, String(p.mpesaNumber).trim().slice(0, 30));
  if (p.mpesaName !== undefined) props.setProperty(CONFIG.MPESA_NAME, String(p.mpesaName).trim().slice(0, 60));
  return { ok: true, settings: { whatsappCommunityUrl: props.getProperty(CONFIG.WHATSAPP_COMMUNITY_URL) || '', mpesaNumber: props.getProperty(CONFIG.MPESA_NUMBER) || '', mpesaName: props.getProperty(CONFIG.MPESA_NAME) || '' } };
}

function createReport(p, user) {
  requireFields(p, ['itemType','itemId','reason']);
  const id = Utilities.getUuid();
  append('Reports', [id,p.itemType,p.itemId,p.reason,user.uid,user.email,'open',new Date(),'']);
  return { ok: true, id };
}

function adminUpdate(p) {
  requireFields(p, ['table','id','field','value']);
  const allowed = { Resources: ['status'], Products: ['status'], Orders: ['status'], StudyPartners: ['status'], Opportunities: ['status'], Events: ['status'], WhatsAppGroups: ['status'] };
  if (!allowed[p.table] || !allowed[p.table].includes(p.field)) throw new Error('This admin update is not allowed.');
  const sheet = getSheet(p.table), data = sheet.getDataRange().getValues(), headers = data[0];
  const idCol = headers.indexOf('id'), fieldCol = headers.indexOf(p.field);
  for (let r=1; r<data.length; r++) if (String(data[r][idCol]) === String(p.id)) {
    sheet.getRange(r+1,fieldCol+1).setValue(p.value);
    if (p.table === 'Resources' && p.field === 'status' && p.value === 'active') {
      const resource = findById('Resources', p.id);
      if (resource && resource.file_id) DriveApp.getFileById(resource.file_id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    if (p.table === 'Orders' && p.field === 'status' && ['verified','paid'].includes(String(p.value).toLowerCase())) {
      const order = findById('Orders', p.id);
      const product = order && findById('Products', order.product_id);
      if (!order || !product || !product.file_id) throw new Error('Order or product file not found.');
      DriveApp.getFileById(product.file_id).addViewer(order.buyer_email);
      updateCellById('Orders', p.id, 'verified_by', Session.getActiveUser().getEmail() || 'Study Labs admin');
      updateCellById('Orders', p.id, 'verified_at', new Date());
    }
    return { ok: true };
  }
  throw new Error('Record not found.');
}

function adminCreateGroup(p) {
  requireFields(p, ['title','inviteUrl']);
  if (!/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(p.inviteUrl)) throw new Error('Enter a valid WhatsApp invite or wa.me link.');
  const id = Utilities.getUuid();
  append('WhatsAppGroups', [id,p.title,p.course || '',p.yearOfStudy || '',p.unitCode || '',p.description || '',p.inviteUrl,'active',new Date(),new Date()]);
  return { ok: true, id };
}

function adminPublish(p) {
  requireFields(p, ['table','record']);
  const map = { Opportunities: ['title','organisation','type','description','eligibility','location','applicationUrl','deadline'], Events: ['title','organiser','eventType','description','eventDate','location','registrationUrl'] };
  if (!map[p.table]) throw new Error('Invalid publishing destination.');
  const r = p.record, id = Utilities.getUuid();
  if (p.table === 'Opportunities') append('Opportunities',[id,r.title,r.organisation || '',r.type || '',r.description || '',r.eligibility || '',r.location || '',r.applicationUrl || '',r.deadline || '','active',new Date(),'admin']);
  else append('Events',[id,r.title,r.organiser || '',r.eventType || '',r.description || '',r.eventDate || '',r.location || '',r.registrationUrl || '','active',new Date(),'admin']);
  return { ok: true, id };
}

function registerDownload(id, user) {
  const resource = findById('Resources', id);
  if (resource) {
    if (resource.status !== 'active') throw new Error('File is not available.');
    updateCellById('Resources',id,'downloads',Number(resource.downloads || 0)+1);
    return { ok: true, url: DriveApp.getFileById(resource.file_id).getUrl(), fileName: resource.file_name };
  }
  const product = findById('Products', id);
  if (!product || product.status !== 'active') throw new Error('Product is not available.');
  if (Number(product.price_kes) === 0) return { ok: true, url: DriveApp.getFileById(product.file_id).getUrl(), fileName: product.title };
  if (!user) throw new Error('Sign in to access purchased products.');
  const orders = getSheet('Orders').getDataRange().getValues();
  const h = orders[0];
  const productCol = h.indexOf('product_id'), buyerCol = h.indexOf('buyer_uid'), statusCol = h.indexOf('status');
  const owns = orders.slice(1).some(row => String(row[productCol]) === String(id) && String(row[buyerCol]) === String(user.uid) && ['verified','paid'].includes(String(row[statusCol]).toLowerCase()));
  if (!owns) throw new Error('A verified purchase is required to download this product.');
  return { ok: true, url: DriveApp.getFileById(product.file_id).getUrl(), fileName: product.title };
}

function verifyFirebaseToken(idToken) {
  if (!idToken) throw new Error('Sign in with Google to continue.');
  const key = PropertiesService.getScriptProperties().getProperty(CONFIG.FIREBASE_API_KEY);
  if (!key) throw new Error('Firebase API key is not configured in Apps Script properties.');
  const response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken }), muteHttpExceptions: true
  });
  const data = JSON.parse(response.getContentText());
  if (response.getResponseCode() !== 200 || !data.users || !data.users.length) throw new Error('Your sign-in session is invalid. Please sign in again.');
  const u = data.users[0];
  return { uid: u.localId, email: String(u.email || '').toLowerCase(), name: u.displayName || '' };
}

function isAdmin(user) {
  const list = (PropertiesService.getScriptProperties().getProperty(CONFIG.ADMIN_EMAILS) || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  return list.includes(user.email);
}
function requireAdmin(user) { if (!isAdmin(user)) throw new Error('Admin access required.'); }

const ALLOWED_EXTENSIONS = ['pdf','doc','docx','ppt','pptx','xls','xlsx','txt','png','jpg','jpeg'];
const MAX_UPLOADS_PER_DAY = 10;
function checkUploadAllowed(user, fileName) {
  const ext = String(fileName).split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error('File type not allowed. Use: ' + ALLOWED_EXTENSIONS.join(', ') + '.');
  const since = Date.now() - 24 * 60 * 60 * 1000;
  let count = 0;
  [['Resources','uploader_uid'],['Products','seller_uid']].forEach(([t, f]) => {
    const d = getSheet(t).getDataRange().getValues(); if (d.length < 2) return;
    const uc = d[0].indexOf(f), cc = d[0].indexOf('created_at');
    d.slice(1).forEach(r => { if (String(r[uc]) === String(user.uid) && r[cc] instanceof Date && r[cc].getTime() > since) count++; });
  });
  if (count >= MAX_UPLOADS_PER_DAY) throw new Error('Daily upload limit reached. Please try again tomorrow.');
}

function rowsAsObjects(table) {
  const d = getSheet(table).getDataRange().getValues();
  if (d.length < 2) return [];
  const h = d[0];
  return d.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] instanceof Date ? r[i].toISOString() : r[i]])));
}

function myUploads(user) {
  const items = [];
  rowsAsObjects('Resources').filter(o => String(o.uploader_uid) === String(user.uid)).forEach(o => items.push({ id: o.id, type: 'Material', title: o.title, category: o.category, status: o.status, rejection_reason: o.rejection_reason || '', created_at: o.created_at }));
  rowsAsObjects('Products').filter(o => String(o.seller_uid) === String(user.uid)).forEach(o => items.push({ id: o.id, type: 'Product', title: o.title, category: o.category, status: o.status, rejection_reason: o.rejection_reason || '', created_at: o.created_at }));
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { ok: true, items };
}

function adminList(p) {
  const allowed = ['Resources','Products','Orders','StudyPartners','Reports','Opportunities','Events','WhatsAppGroups'];
  if (!allowed.includes(p.table)) throw new Error('Invalid table.');
  const hide = ['file_id','uploader_uid','seller_uid','buyer_uid','uid','whatsapp_contact','reporter_uid','from_uid','to_uid'];
  let items = rowsAsObjects(p.table).map(o => { hide.forEach(k => delete o[k]); return o; });
  if (p.status) items = items.filter(o => String(o.status) === String(p.status));
  items.reverse();
  return { ok: true, items: items.slice(0, 200) };
}

function adminReview(p, user) {
  requireFields(p, ['table','id','decision']);
  if (!['Resources','Products','StudyPartners','Opportunities','Events'].includes(p.table)) throw new Error('This table cannot be reviewed.');
  const approve = p.decision === 'approve';
  if (!approve && p.decision !== 'reject') throw new Error('Decision must be approve or reject.');
  if (!approve) requireFields(p, ['reason']);
  const rec = findById(p.table, p.id);
  if (!rec) throw new Error('Record not found.');
  updateCellById(p.table, p.id, 'status', approve ? 'active' : 'rejected');
  const sheet = getSheet(p.table);
  const cols = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (cols.includes('rejection_reason')) {
    updateCellById(p.table, p.id, 'rejection_reason', approve ? '' : String(p.reason).slice(0, 300));
    updateCellById(p.table, p.id, 'reviewed_by', user.email);
    updateCellById(p.table, p.id, 'reviewed_at', new Date());
  }
  // Free materials become downloadable on approval; rejected ones go private again.
  // Paid products stay private until a verified purchase.
  if (p.table === 'Resources' && rec.file_id) {
    DriveApp.getFileById(rec.file_id).setSharing(approve ? DriveApp.Access.ANYONE_WITH_LINK : DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  }
  if (p.table === 'Products') {
    const access = approve ? DriveApp.Access.ANYONE_WITH_LINK : DriveApp.Access.PRIVATE;
    if (rec.cover_id) { try { DriveApp.getFileById(rec.cover_id).setSharing(access, DriveApp.Permission.VIEW); } catch (e) {} }
    // Free items are downloadable by anyone; paid items stay private until a purchase is verified.
    if (rec.file_id && (Number(rec.price_kes) === 0 || !approve)) DriveApp.getFileById(rec.file_id).setSharing(access, DriveApp.Permission.VIEW);
  }
  return { ok: true, status: approve ? 'active' : 'rejected' };
}
function saveDriveFile(name, mime, base64, ownerEmail) {
  const bytes = Utilities.base64Decode(String(base64).split(',').pop());
  if (bytes.length > 12 * 1024 * 1024) throw new Error('Files must be 12 MB or smaller for this upload endpoint.');
  const blob = Utilities.newBlob(bytes, mime, name);
  const folderId = PropertiesService.getScriptProperties().getProperty(CONFIG.DRIVE_FOLDER_ID);
  if (!folderId) throw new Error('Run setupStudyLabs() first.');
  const file = DriveApp.getFolderById(folderId).createFile(blob);
  file.setDescription('Study Labs upload by ' + ownerEmail + '. Access is controlled by the Study Labs application.');
  return file;
}
function parsePayload(e) {
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (_) {}
  }
  return (e && e.parameter) || {};
}
function getSheet(name) {
  const id = PropertiesService.getScriptProperties().getProperty(CONFIG.SHEET_ID);
  if (!id) throw new Error('Run setupStudyLabs() first.');
  const sheet = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sheet) throw new Error('Missing table: ' + name);
  return sheet;
}
function append(table,row) { getSheet(table).appendRow(row); }
function findById(table,id) { return findByField(table,'id',id); }
function findByField(table,field,value) {
  const data = getSheet(table).getDataRange().getValues(); if (data.length < 2) return null;
  const h=data[0], c=h.indexOf(field); if(c<0) return null;
  for(let i=1;i<data.length;i++) if(String(data[i][c])===String(value)) return Object.fromEntries(h.map((k,j)=>[k,data[i][j]]));
  return null;
}
function updateById(table,id,row) {
  const s=getSheet(table), d=s.getDataRange().getValues(), c=d[0].indexOf('id');
  for(let i=1;i<d.length;i++) if(String(d[i][c])===String(id)){s.getRange(i+1,1,1,row.length).setValues([row]);return;}
}
function updateCellById(table,id,field,value) {
  const s=getSheet(table), d=s.getDataRange().getValues(), idc=d[0].indexOf('id'), fc=d[0].indexOf(field);
  for(let i=1;i<d.length;i++) if(String(d[i][idc])===String(id)){s.getRange(i+1,fc+1).setValue(value);return;}
}
function requireFields(p,fields){fields.forEach(f=>{if(p[f]===undefined || p[f]===null || p[f]==='') throw new Error('Missing required field: '+f);});}
function safeMessage(err){return err && err.message ? err.message : 'Something went wrong.';}
