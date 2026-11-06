/**
 * CHUKA SOKO — one-time repair + self-test.
 * Add as a NEW file (SokoRepair.gs) in the existing Chuka Soko Apps Script project, then run:
 *   1) repairChukaSokoSheets()   — fixes the dropdown rules that were blocking payment verification
 *   2) selfTestSokoWrites()      — proves the admin script can now write each row type
 *
 * ROOT CAUSE: the sheet dropdowns were set to "reject invalid input" with exact, case-sensitive lists
 * (e.g. "Verified", "Approved", "Active", "Both"), but the admin script writes "verified", "approved",
 * "active", "pending_payment", "both". Apps Script enforces those rules, so the write threw an error.
 */
function repairChukaSokoSheets() {
  var ss = getSokoSpreadsheet_();

  // Canonical values — these MUST match what SokoAdmin.gs writes and what doGet compares against (lower-case).
  var rules = {
    Sellers:     { status: ['approved', 'pending', 'rejected', 'suspended'] },
    Products:    {
      status: ['pending_payment', 'active', 'paused', 'sold', 'suspended', 'archived', 'removed', 'rejected'],
      condition: ['New', 'Used', 'Refurbished'],
      preferredContact: ['whatsapp', 'call', 'both'],
      availability: ['In Stock', 'Sold Out', 'Paused', 'Removed']
    },
    Commissions: { paymentStatus: ['Awaiting Payment', 'Verification Pending', 'Verified', 'Rejected'] },
    Payments:    { verificationStatus: ['pending', 'verified', 'rejected'], paymentPurpose: ['Listing Commission'] },
    Reports:     { status: ['New', 'Under Review', 'Resolved', 'Dismissed'] }
  };

  // Columns that must stay plain text (M-Pesa references, phone numbers).
  var textColumns = {
    Payments: ['mpesaReference', 'tillNumber'],
    Sellers: ['phone', 'whatsappNumber']
  };

  Object.keys(rules).forEach(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastCol = sheet.getLastColumn();
    var rows = Math.max(sheet.getMaxRows() - 1, 1);
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });

    // 1. Remove every old validation (also clears any stray rule, e.g. on the mpesaReference column).
    sheet.getRange(2, 1, rows, lastCol).clearDataValidations();

    // 2. Re-apply by HEADER NAME (not column number) so column order can never break it again.
    Object.keys(rules[sheetName]).forEach(function (header) {
      var col = headers.indexOf(header) + 1;
      if (col < 1) return;
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(rules[sheetName][header], true)
        .setAllowInvalid(true) // warn, never reject — scripts and admins can't be blocked by a typo
        .build();
      sheet.getRange(2, col, rows, 1).setDataValidation(rule);
    });

    // 3. Normalise existing values to the canonical spelling (e.g. "Approved" -> "approved").
    Object.keys(rules[sheetName]).forEach(function (header) {
      var col = headers.indexOf(header) + 1;
      if (col < 1 || sheet.getLastRow() < 2) return;
      var range = sheet.getRange(2, col, sheet.getLastRow() - 1, 1);
      var values = range.getValues();
      var allowed = rules[sheetName][header];
      var changed = false;
      values.forEach(function (r) {
        var match = allowed.filter(function (a) { return a.toLowerCase() === String(r[0]).trim().toLowerCase(); })[0];
        if (match && match !== r[0]) { r[0] = match; changed = true; }
      });
      if (changed) range.setValues(values);
    });
  });

  Object.keys(textColumns).forEach(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    textColumns[sheetName].forEach(function (header) {
      var col = headers.indexOf(header) + 1;
      if (col > 0) sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
  });

  SpreadsheetApp.flush();
  Logger.log('Chuka Soko sheets repaired. Now run selfTestSokoWrites().');
}

/** Writes and removes a throw-away row in each tab the admin API writes to. Throws if anything is still blocked. */
function selfTestSokoWrites() {
  var tests = {
    Sellers: { sellerId: 'TEST-SEL', fullName: 'Test', status: 'approved' },
    Products: { productId: 'TEST-PRD', status: 'pending_payment', preferredContact: 'both', availability: 'In Stock', condition: 'New' },
    Commissions: { commissionId: 'TEST-COM', paymentStatus: 'Awaiting Payment' },
    Payments: { paymentId: 'TEST-PAY', mpesaReference: 'TEST123456', verificationStatus: 'verified', paymentPurpose: 'Listing Commission' },
    ProductImages: { productId: 'TEST-PRD', driveFileId: 'x' }
  };
  Object.keys(tests).forEach(function (name) {
    var row = sokoAdminAppend_(name, tests[name]);       // throws if validation still rejects
    sokoAdminUpdate_(name, Object.keys(tests[name])[0], tests[name][Object.keys(tests[name])[0]], { updatedAt: new Date() });
    sokoAdminSheet_(name).getRange(row, 1, 1, sokoAdminHeaders_(sokoAdminSheet_(name)).length).clearContent();
    Logger.log('OK  ' + name + ' (row ' + row + ')');
  });
  Logger.log('All writes succeeded. Payment verification is unblocked.');
}
