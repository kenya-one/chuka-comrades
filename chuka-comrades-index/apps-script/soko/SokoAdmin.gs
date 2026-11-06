/**
 * Chuka Soko protected admin API  (REPLACES your existing admin file that contains doPost).
 * Keep the existing doGet(e) public API and setup file unchanged.
 * Requires Script Property CHUKA_SOKO_SERVER_SECRET.
 *
 * Fixes vs the previous version:
 *  - rows are appended to the first EMPTY row (appendRow lands below the pre-filled commission formulas)
 *  - a script lock stops double-verification and duplicate IDs
 *  - payment verification validates everything BEFORE writing, so it cannot half-complete
 *  - AdminLogs is written for every admin action
 *  - cell values are written as text where needed (M-Pesa reference, phones)
 */
var SOKO_ADMIN_EMAIL = "sidneywafula30@gmail.com";

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var expected = PropertiesService.getScriptProperties().getProperty("CHUKA_SOKO_SERVER_SECRET");
    if (!expected || !body.secret || body.secret !== expected) {
      return sokoAdminJson_({ success: false, error: "Unauthorized server request." });
    }
    var action = String(body.action || "");
    var payload = body.payload || {};
    var readOnly = action === "adminData";
    if (!readOnly) lock.waitLock(20000);
    var data;
    switch (action) {
      case "adminData": data = sokoAdminData_(); break;
      case "createSeller": data = sokoAdminCreateSeller_(payload); break;
      case "createProduct": data = sokoAdminCreateProduct_(payload); break;
      case "verifyCommission": data = sokoAdminVerifyCommission_(payload); break;
      case "updateAvailability": data = sokoAdminUpdateAvailability_(payload); break;
      case "setFeatured": data = sokoAdminSetFeatured_(payload); break;
      default: throw new Error("Unknown admin action.");
    }
    SpreadsheetApp.flush();
    return sokoAdminJson_({ success: true, data: data });
  } catch (error) {
    return sokoAdminJson_({ success: false, error: error && error.message ? error.message : "Admin request failed." });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function sokoAdminJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function sokoAdminSheet_(name) {
  var sheet = getSokoSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error("Missing spreadsheet tab: " + name);
  return sheet;
}
function sokoAdminHeaders_(sheet) {
  if (sheet.getLastColumn() < 1) throw new Error("No columns found in " + sheet.getName());
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (v) { return String(v).trim(); });
}
function sokoAdminRead_(name) {
  var sheet = sokoAdminSheet_(name);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (v) { return String(v).trim(); });
  return values.slice(1)
    .filter(function (row) { return row[0] !== "" && row[0] !== null; })
    .map(function (row) {
      var item = {};
      headers.forEach(function (header, index) {
        var value = row[index];
        item[header] = value instanceof Date ? value.toISOString() : value;
      });
      return item;
    });
}

/** First row whose ID column (column A) is empty. appendRow() would skip past pre-filled formula columns. */
function sokoAdminNextRow_(sheet) {
  var last = sheet.getMaxRows();
  if (last < 2) return 2;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === "" || ids[i][0] === null) return i + 2;
  sheet.insertRowsAfter(last, 20);
  return last + 1;
}

/** Returns the row number written. */
function sokoAdminAppend_(name, object) {
  var sheet = sokoAdminSheet_(name);
  var headers = sokoAdminHeaders_(sheet);
  var row = sokoAdminNextRow_(sheet);
  var range = sheet.getRange(row, 1, 1, headers.length);
  var existingFormulas = range.getFormulas()[0];
  range.setValues([headers.map(function (header, i) {
    if (object[header] !== undefined) return object[header];
    return existingFormulas[i] ? existingFormulas[i] : ""; // keep any pre-filled formula
  })]);
  return row;
}

function sokoAdminUpdate_(name, idHeader, idValue, changes) {
  var sheet = sokoAdminSheet_(name);
  var headers = sokoAdminHeaders_(sheet);
  var idColumn = headers.indexOf(idHeader);
  if (idColumn < 0) throw new Error("Missing " + idHeader + " column in " + name);
  var ids = sheet.getRange(2, idColumn + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).getValues();
  var rowNumber = -1;
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(idValue)) { rowNumber = i + 2; break; }
  if (rowNumber < 0) throw new Error("Record not found: " + idValue);
  Object.keys(changes).forEach(function (key) {
    var column = headers.indexOf(key);
    if (column >= 0) sheet.getRange(rowNumber, column + 1).setValue(changes[key]);
  });
  return rowNumber;
}

function sokoAdminId_(prefix) { return prefix + "-" + Utilities.getUuid().replace(/-/g, "").substring(0, 12).toUpperCase(); }
function sokoAdminSetting_(key) {
  var match = sokoAdminRead_("Settings").filter(function (row) { return String(row.key) === key; })[0];
  return match ? String(match.value || "") : "";
}
function sokoAdminBool_(value) { return value === true || String(value).toLowerCase() === "true"; }
function sokoAdminNow_() { return new Date(); }
function sokoAdminLog_(action, entityType, entityId, details) {
  try {
    sokoAdminAppend_("AdminLogs", {
      logId: sokoAdminId_("LOG"), adminEmail: SOKO_ADMIN_EMAIL, action: action,
      entityType: entityType, entityId: entityId, details: details || "", timestamp: sokoAdminNow_()
    });
  } catch (ignore) { /* logging must never block an admin action */ }
}

function sokoAdminData_() {
  var images = sokoAdminRead_("ProductImages");
  var products = sokoAdminRead_("Products");
  products.forEach(function (product) {
    product.images = images
      .filter(function (image) { return String(image.productId) === String(product.productId); })
      .sort(function (a, b) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); });
  });
  return {
    sellers: sokoAdminRead_("Sellers"),
    products: products,
    commissions: sokoAdminRead_("Commissions"),
    payments: sokoAdminRead_("Payments")
  };
}

function sokoAdminCreateSeller_(payload) {
  var fullName = String(payload.fullName || "").trim();
  var phone = String(payload.phone || "").trim();
  var location = String(payload.location || "").trim();
  var whatsappNumber = String(payload.whatsappNumber || "").trim();
  if (fullName.length < 2 || !phone || location.length < 2) throw new Error("Enter seller name, phone number and location.");
  var sellerId = sokoAdminId_("SEL");
  var now = sokoAdminNow_();
  sokoAdminAppend_("Sellers", {
    sellerId: sellerId, submittedAt: now, fullName: fullName, phone: "'" + phone.replace(/^'/, ""),
    location: location, whatsappNumber: whatsappNumber ? "'" + whatsappNumber.replace(/^'/, "") : "",
    status: "approved", reviewedBy: SOKO_ADMIN_EMAIL, reviewedAt: now,
    rejectionReason: "", notes: "Added and approved by Chuka Soko admin"
  });
  sokoAdminLog_("createSeller", "Seller", sellerId, fullName);
  return { sellerId: sellerId, status: "approved" };
}

function sokoAdminCreateProduct_(payload) {
  var sellerId = String(payload.sellerId || "").trim();
  var title = String(payload.title || "").trim();
  var category = String(payload.category || "").trim();
  var description = String(payload.description || "").trim();
  var price = Number(payload.price);
  var location = String(payload.location || "").trim();
  var images = Array.isArray(payload.images) ? payload.images : [];
  if (!sellerId || !title || !category || !description || !location || !isFinite(price) || price <= 0) throw new Error("Complete all required product fields and enter a valid price.");
  if (!images.length) throw new Error("At least one product image is required before a listing can be created.");
  if (images.length > 6) throw new Error("A maximum of six product images is allowed.");
  var seller = sokoAdminRead_("Sellers").filter(function (row) { return String(row.sellerId) === sellerId; })[0];
  if (!seller || String(seller.status).toLowerCase() !== "approved") throw new Error("Select an approved seller.");

  var folderId = sokoAdminSetting_("PRODUCT_IMAGES_FOLDER_ID");
  if (!folderId) throw new Error("Product Images Drive folder is not configured in Settings.");
  var folder = DriveApp.getFolderById(folderId);
  var allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  // Validate every image first so nothing is half-saved.
  var decoded = images.map(function (image, index) {
    var mimeType = String(image.mimeType || "");
    var base64 = String(image.data || "");
    if (allowedTypes.indexOf(mimeType) < 0 || !base64) throw new Error("Use JPG, PNG or WEBP product photos.");
    var bytes = Utilities.base64Decode(base64);
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Each product image must be 5 MB or smaller.");
    return { bytes: bytes, mimeType: mimeType, name: String(image.name || ("product-" + (index + 1))) };
  });

  var productId = sokoAdminId_("PRD");
  var commissionId = sokoAdminId_("COM");
  var rate = 0.10;
  var commissionAmount = Math.round(price * rate * 100) / 100;
  var now = sokoAdminNow_();

  var savedImages = decoded.map(function (img, index) {
    var file = folder.createFile(Utilities.newBlob(img.bytes, img.mimeType, img.name));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return {
      productId: productId, driveFileId: file.getId(), fileName: file.getName(), mimeType: img.mimeType,
      driveUrl: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200",
      sortOrder: index + 1, uploadedAt: now
    };
  });

  var preferredContact = String(payload.preferredContact || "both").toLowerCase();
  if (["whatsapp", "call", "both"].indexOf(preferredContact) < 0) preferredContact = "both";

  sokoAdminAppend_("Products", {
    productId: productId, sellerId: sellerId, title: title, category: category, description: description,
    price: price, currency: "KES", condition: String(payload.condition || "New"), location: location,
    deliveryOptions: String(payload.deliveryOptions || ""), preferredContact: preferredContact,
    whatsappConsent: sokoAdminBool_(payload.whatsappConsent), callConsent: sokoAdminBool_(payload.callConsent),
    status: "pending_payment", commissionId: commissionId, createdAt: now, updatedAt: now,
    soldAt: "", archivedAt: "", featured: false,
    adminNotes: "Awaiting one-time 10% listing commission verification",
    availability: "In Stock", commissionRate: rate, commissionAmount: commissionAmount
  });
  savedImages.forEach(function (image) { sokoAdminAppend_("ProductImages", image); });
  sokoAdminAppend_("Commissions", {
    commissionId: commissionId, productId: productId, sellerId: sellerId, amount: commissionAmount,
    currency: "KES", paymentStatus: "Awaiting Payment", setBy: SOKO_ADMIN_EMAIL, setAt: now,
    verifiedBy: "", verifiedAt: "", listingPrice: price, commissionRate: rate, commissionType: "ONE_TIME_LISTING"
  });
  sokoAdminLog_("createProduct", "Product", productId, title + " · commission " + commissionAmount);
  return { productId: productId, commissionId: commissionId, commissionAmount: commissionAmount, status: "pending_payment", imageCount: savedImages.length };
}

function sokoAdminVerifyCommission_(payload) {
  var commissionId = String(payload.commissionId || "").trim();
  var mpesaReference = String(payload.mpesaReference || "").trim().toUpperCase();
  var amount = Number(payload.amount);
  if (!commissionId || mpesaReference.length < 6 || !isFinite(amount) || amount <= 0) throw new Error("Enter a valid M-Pesa reference and amount received.");

  // ---- validate everything BEFORE writing anything ----
  var commission = sokoAdminRead_("Commissions").filter(function (row) { return String(row.commissionId) === commissionId; })[0];
  if (!commission) throw new Error("Commission record not found.");
  if (["verified", "paid"].indexOf(String(commission.paymentStatus).trim().toLowerCase()) >= 0) throw new Error("This commission has already been verified.");
  var expected = Number(commission.amount || 0);
  if (Math.abs(amount - expected) > 0.01) throw new Error("Amount does not match the commission due: KSh " + expected.toFixed(2));
  var duplicate = sokoAdminRead_("Payments").some(function (row) { return String(row.mpesaReference || "").toUpperCase() === mpesaReference; });
  if (duplicate) throw new Error("This M-Pesa reference has already been recorded.");
  var product = sokoAdminRead_("Products").filter(function (row) { return String(row.productId) === String(commission.productId); })[0];
  if (!product) throw new Error("The product for this commission no longer exists.");
  var till = sokoAdminSetting_("OFFICIAL_TILL_NUMBER");
  if (!till) throw new Error("Set OFFICIAL_TILL_NUMBER in Settings before verifying payments.");

  // ---- write ----
  var now = sokoAdminNow_();
  var paymentId = sokoAdminId_("PAY");
  sokoAdminAppend_("Payments", {
    paymentId: paymentId, commissionId: commissionId, productId: commission.productId, sellerId: commission.sellerId,
    tillNumber: till, mpesaReference: mpesaReference, amount: amount, currency: "KES", paidAt: now, submittedAt: now,
    verificationStatus: "verified", verifiedBy: SOKO_ADMIN_EMAIL, verifiedAt: now, rejectionReason: "",
    paymentPurpose: "Listing Commission"
  });
  sokoAdminUpdate_("Commissions", "commissionId", commissionId, { paymentStatus: "Verified", verifiedBy: SOKO_ADMIN_EMAIL, verifiedAt: now });
  sokoAdminUpdate_("Products", "productId", commission.productId, { status: "active", updatedAt: now, adminNotes: "Listing commission verified. Product activated." });
  sokoAdminLog_("verifyCommission", "Commission", commissionId, "M-Pesa " + mpesaReference + " · KSh " + amount);
  return { paymentId: paymentId, productId: commission.productId, status: "verified", productStatus: "active" };
}

function sokoAdminUpdateAvailability_(payload) {
  var productId = String(payload.productId || "").trim();
  var availability = String(payload.availability || "").trim();
  if (["In Stock", "Sold Out", "Paused", "Removed"].indexOf(availability) < 0) throw new Error("Invalid availability status.");
  var product = sokoAdminRead_("Products").filter(function (row) { return String(row.productId) === productId; })[0];
  if (!product) throw new Error("Product not found.");
  var changes = { availability: availability, updatedAt: sokoAdminNow_() };
  if (availability === "Removed") changes.status = "removed";
  else if (String(product.status).toLowerCase() === "pending_payment") { /* stays hidden until commission is verified */ }
  else if (availability !== "Paused") changes.status = "active";
  sokoAdminUpdate_("Products", "productId", productId, changes);
  sokoAdminLog_("updateAvailability", "Product", productId, availability);
  return { productId: productId, availability: availability };
}

function sokoAdminSetFeatured_(payload) {
  var productId = String(payload.productId || "").trim();
  var featured = sokoAdminBool_(payload.featured);
  sokoAdminUpdate_("Products", "productId", productId, { featured: featured, updatedAt: sokoAdminNow_() });
  sokoAdminLog_("setFeatured", "Product", productId, String(featured));
  return { productId: productId, featured: featured };
}
