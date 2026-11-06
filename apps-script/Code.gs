
const CONFIG = {
  SPREADSHEET_NAME: "Chuka Comrades Hostel Database",
  DRIVE_FOLDER_NAME: "Chuka Comrades Hostel Photos",
  MAX_IMAGES: 3,
  MAX_IMAGE_SIZE: 5 * 1024 * 1024
};

const SHEET_HEADERS = {
  Hostels: [
    "id",
    "name",
    "description",
    "area",
    "landmark",
    "location_url",
    "image_urls",
    "rent_amount",
    "rent_period",
    "room_type",
    "total_rooms",
    "available_rooms",
    "available_from",
    "facilities",
    "contact_name",
    "landlord_contact",
    "verified",
    "status",
    "created_at",
    "updated_at"
  ],

  Feedback: [
    "id",
    "category",
    "message",
    "hostel_id",
    "hostel_name",
    "submitted_by",
    "status",
    "created_at"
  ],

  ActivityLog: [
    "id",
    "admin_email",
    "action",
    "record_id",
    "details",
    "created_at"
  ]
};

/**
 * Run this function once to create the hostel database.
 */
function setupHostelDatabase() {
  const properties = PropertiesService.getScriptProperties();

  let spreadsheet;
  const savedSheetId = properties.getProperty("HOSTEL_SHEET_ID");

  if (savedSheetId) {
    spreadsheet = SpreadsheetApp.openById(savedSheetId);
  } else {
    spreadsheet = SpreadsheetApp.create(
      CONFIG.SPREADSHEET_NAME
    );

    properties.setProperty(
      "HOSTEL_SHEET_ID",
      spreadsheet.getId()
    );
  }

  Object.keys(SHEET_HEADERS).forEach(function(name) {
    let sheet = spreadsheet.getSheetByName(name);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
    }

    if (sheet.getLastRow() === 0) {
      const headers = SHEET_HEADERS[name];

      sheet.getRange(
        1,
        1,
        1,
        headers.length
      ).setValues([headers]);

      sheet.getRange(
        1,
        1,
        1,
        headers.length
      ).setFontWeight("bold");

      sheet.setFrozenRows(1);
    }
  });

  let folderId = properties.getProperty(
    "HOSTEL_DRIVE_FOLDER_ID"
  );

  if (!folderId) {
    const folder = DriveApp.createFolder(
      CONFIG.DRIVE_FOLDER_NAME
    );

    folderId = folder.getId();

    properties.setProperty(
      "HOSTEL_DRIVE_FOLDER_ID",
      folderId
    );
  }

  Logger.log("HOSTEL DATABASE CREATED SUCCESSFULLY");
  Logger.log("Spreadsheet: " + spreadsheet.getUrl());
  Logger.log("Drive folder: " + DriveApp.getFolderById(folderId).getUrl());

  return {
    spreadsheetUrl: spreadsheet.getUrl(),
    driveFolderUrl: DriveApp.getFolderById(folderId).getUrl()
  };
}

/**
 * Saves one hostel image in Google Drive.
 * The app can use the returned imageUrl directly.
 */
function saveHostelImage(base64Data, mimeType, originalName) {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(mimeType)) {
    throw new Error("Only JPG, PNG and WEBP images are allowed.");
  }

  if (!base64Data || !originalName) {
    throw new Error("Image data and filename are required.");
  }

  // Remove a data-URL prefix if the app sends one.
  const cleanBase64 = base64Data.replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    ""
  );

  const imageBytes = Utilities.base64Decode(cleanBase64);

  if (imageBytes.length > CONFIG.MAX_IMAGE_SIZE) {
    throw new Error("Each image must be 5 MB or smaller.");
  }

  const properties = PropertiesService.getScriptProperties();
  const folderId = properties.getProperty("HOSTEL_DRIVE_FOLDER_ID");

  if (!folderId) {
    throw new Error("Hostel Drive folder is not configured. Run setupHostelDatabase first.");
  }

  const folder = DriveApp.getFolderById(folderId);

  const safeName = originalName.replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

  const blob = Utilities.newBlob(
    imageBytes,
    mimeType,
    Date.now() + "_" + safeName
  );

  const file = folder.createFile(blob);

  // Allow the app's visitors to display this image.
  file.setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );

  const fileId = file.getId();

  return {
    fileId: fileId,
    imageUrl: "https://drive.google.com/thumbnail?id=" +
      fileId + "&sz=w1200",
    originalUrl: "https://drive.google.com/uc?export=view&id=" +
      fileId
  };
}


const HOSTEL_SETTINGS = {
  adminWhatsApp: "254180752220",
  landlordGroup: "https://chat.whatsapp.com/JLyKMkmtpvq0mz4WNSRJYt",
  studentFeedbackGroup: "https://chat.whatsapp.com/D2vvu8BwPMI5Fu06F9YsZC",
  maxImagesPerHostel: 3
};

function getHostelSettings() {
  return HOSTEL_SETTINGS;
}


/**
 * Public API entry point.
 * Supported actions:
 * ?action=public_listings
 * ?action=bootstrap
 */
function doGet(e) {
  const action = e && e.parameter
    ? e.parameter.action
    : "";

  let result;

  try {
    if (action === "public_listings") {
      result = {
        success: true,
        hostels: getPublicHostels()
      };
    } else if (action === "bootstrap") {
      result = {
        success: true,
        settings: getHostelSettings()
      };
    } else {
      result = {
        success: false,
        error: "Unknown action. Use public_listings or bootstrap."
      };
    }
  } catch (error) {
    result = {
      success: false,
      error: error.message
    };
  }

  return outputHostelJson(result, e);
}


/**
 * Reads only published hostel listings.
 */
function getPublicHostels() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty("HOSTEL_SHEET_ID");

  if (!spreadsheetId) {
    throw new Error("Hostel database has not been configured.");
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName("Hostels");

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0];

  return values.slice(1)
    .filter(function(row) {
      const statusIndex = headers.indexOf("status");
      return statusIndex !== -1 &&
        row[statusIndex].toLowerCase() === "published";
    })
    .map(function(row) {
      const hostel = {};

      headers.forEach(function(header, index) {
        hostel[header] = row[index];
      });

      // Convert stored image URL JSON into an array.
      try {
        hostel.image_urls = hostel.image_urls
          ? JSON.parse(hostel.image_urls)
          : [];
      } catch (error) {
        hostel.image_urls = hostel.image_urls
          ? [hostel.image_urls]
          : [];
      }

      return hostel;
    });
}


/**
 * Returns JSON or JSONP for browser compatibility.
 */
function outputHostelJson(data, e) {
  const json = JSON.stringify(data);
  const callback = e && e.parameter
    ? e.parameter.callback
    : "";

  if (callback) {
    if (!/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(callback)) {
      throw new Error("Invalid callback name.");
    }

    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * Checks whether the signed-in user is an authorised hostel admin.
 */
function isHostelAdmin(email) {
  const allowedAdmins = [
    "sidneywafula30@gmail.com"
  ];

  if (!email) {
    return false;
  }

  return allowedAdmins.some(function(adminEmail) {
    return adminEmail.toLowerCase() === email.toLowerCase();
  });
}


/**
 * Records an admin action in the ActivityLog sheet.
 */
function logHostelAdminAction(email, action, recordId, details) {
  if (!isHostelAdmin(email)) {
    throw new Error("You are not authorised to perform this action.");
  }

  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty("HOSTEL_SHEET_ID");

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName("ActivityLog");

  sheet.appendRow([
    Utilities.getUuid(),
    email,
    action,
    recordId || "",
    details || "",
    new Date()
  ]);
}


/**
 * Verifies a Firebase ID token and returns the user's account details.
 *
 * Set FIREBASE_WEB_API_KEY in Apps Script Script Properties
 * before using this function.
 */
function verifyFirebaseUser(idToken) {
  if (!idToken) {
    throw new Error("Authentication required. Please sign in.");
  }

  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("FIREBASE_WEB_API_KEY");

  if (!apiKey) {
    throw new Error("Firebase API key has not been configured.");
  }

  const url =
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
    encodeURIComponent(apiKey);

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      idToken: idToken
    }),
    muteHttpExceptions: true
  });

  const result = JSON.parse(response.getContentText());

  if (
    response.getResponseCode() !== 200 ||
    !result.users ||
    !result.users.length
  ) {
    throw new Error("Your sign-in session is invalid or expired.");
  }

  const user = result.users[0];

  return {
    uid: user.localId,
    email: user.email || "",
    emailVerified: user.emailVerified === true
  };
}


/**
 * Requires a verified Firebase account that is on the admin allowlist.
 */
function requireHostelAdmin(idToken) {
  const user = verifyFirebaseUser(idToken);

  if (!user.emailVerified) {
    throw new Error("Please verify your email before continuing.");
  }

  if (!isHostelAdmin(user.email)) {
    throw new Error("You do not have hostel administrator access.");
  }

  return user;
}


/**
 * Handles secure admin requests from the app.
 */


function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No request data received.");
    }

    const request = JSON.parse(e.postData.contents);
    let result;

    // Dashboard request: the dashboard function verifies the admin.
    if (request.action === "admin_dashboard") {
      result = getHostelAdminDashboard(request.idToken);

    } else {
      // All other actions require an authorised admin.
      const admin = requireHostelAdmin(request.idToken);

      if (request.action === "create_listing") {
        result = createHostelListing(request.hostel, admin);

      } else if (request.action === "update_listing") {
        result = updateHostelListing(
          request.hostelId,
          request.updates,
          admin
        );

      } else if (request.action === "delete_listing") {
        result = deleteHostelListing(request.hostelId, admin);

      } else if (request.action === "set_availability") {
        result = setHostelAvailability(
          request.hostelId,
          request.availableRooms,
          admin
        );

      } else {
        throw new Error("Unknown admin action.");
      }
    }

    return outputHostelJson({
      success: true,
      data: result
    });

  } catch (error) {
    return outputHostelJson({
      success: false,
      error: error.message
    });
  }
}


function getHostelAdminDashboard(idToken) {
  const admin = requireHostelAdmin(idToken);

  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty("HOSTEL_SHEET_ID");

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName("Hostels");

  if (!sheet || sheet.getLastRow() < 2) {
    return {
      success: true,
      admin: admin.email,
      hostels: []
    };
  }

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0];

  const hostels = values.slice(1).map(function(row) {
    const hostel = {};

    headers.forEach(function(header, index) {
      hostel[header] = row[index];
    });

    try {
      hostel.image_urls = hostel.image_urls
        ? JSON.parse(hostel.image_urls)
        : [];
    } catch (error) {
      hostel.image_urls = [];
    }

    try {
      hostel.facilities = hostel.facilities
        ? JSON.parse(hostel.facilities)
        : [];
    } catch (error) {
      hostel.facilities = [];
    }

    return hostel;
  });

  return {
    success: true,
    admin: admin.email,
    hostels: hostels
  };
}
function testExternalRequestPermission() {
  const response = UrlFetchApp.fetch("https://www.google.com");
  Logger.log("External request successful: " + response.getResponseCode());
}

/**
 * Creates a hostel listing and saves its photos to Google Drive.
 */
function createHostelListing(hostel, admin) {
  if (!hostel || !String(hostel.name || "").trim() ||
      !String(hostel.area || "").trim()) {
    throw new Error("Hostel name and area are required.");
  }

  if (!admin || !admin.email || !isHostelAdmin(admin.email)) {
    throw new Error("You are not authorised to create hostel listings.");
  }

  const images = Array.isArray(hostel.images) ? hostel.images : [];

  if (images.length > CONFIG.MAX_IMAGES) {
    throw new Error("A hostel can have a maximum of 3 images.");
  }

  const imageUrls = [];

  images.forEach(function(image) {
    const saved = saveHostelImage(
      image.base64,
      image.mimeType,
      image.name
    );
    imageUrls.push(saved.imageUrl);
  });

  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty("HOSTEL_SHEET_ID");

  if (!spreadsheetId) {
    throw new Error("Hostel database is not configured. Run setupHostelDatabase first.");
  }

  const sheet = SpreadsheetApp
    .openById(spreadsheetId)
    .getSheetByName("Hostels");

  if (!sheet) {
    throw new Error("Hostels sheet is missing. Run setupHostelDatabase first.");
  }

  const now = new Date();
  const id = Utilities.getUuid();

  const record = {
    id: id,
    name: String(hostel.name).trim(),
    description: hostel.description || "",
    area: String(hostel.area).trim(),
    landmark: hostel.landmark || "",
    location_url: hostel.location_url || "",
    image_urls: JSON.stringify(imageUrls),
    rent_amount: Number(hostel.rent_amount || 0),
    rent_period: hostel.rent_period === "semester" ? "semester" : "month",
    room_type: hostel.room_type || "",
    total_rooms: hostel.total_rooms == null || hostel.total_rooms === ""
      ? ""
      : Number(hostel.total_rooms),
    available_rooms: Number(hostel.available_rooms || 0),
    available_from: hostel.available_from || "",
    facilities: JSON.stringify(
      Array.isArray(hostel.facilities) ? hostel.facilities : []
    ),
    contact_name: hostel.contact_name || "",
    landlord_contact: hostel.landlord_contact || "",
    verified: false,
    status: "published",
    created_at: now,
    updated_at: now
  };

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(function(header) {
      return String(header).trim();
    });

  sheet.appendRow(headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(record, header)
      ? record[header]
      : "";
  }));

  logHostelAdminAction(
    admin.email,
    "CREATE_HOSTEL",
    id,
    record.name
  );

  return {
    id: id,
    name: record.name,
    image_urls: imageUrls,
    status: "published"
  };
}


/**
 * Updates an existing hostel listing.
 */
function updateHostelListing(hostelId, updates, admin) {
  if (!admin || !admin.email || !isHostelAdmin(admin.email)) {
    throw new Error("You are not authorised to update hostel listings.");
  }

  if (!hostelId || !updates) {
    throw new Error("Hostel ID and updates are required.");
  }

  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty("HOSTEL_SHEET_ID");

  if (!spreadsheetId) {
    throw new Error("Hostel database is not configured.");
  }

  const sheet = SpreadsheetApp
    .openById(spreadsheetId)
    .getSheetByName("Hostels");

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error("Hostel listing not found.");
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(header) {
    return String(header).trim();
  });

  const idColumn = headers.indexOf("id");

  if (idColumn === -1) {
    throw new Error("The Hostels sheet is missing its id column.");
  }

  const rowIndex = values.findIndex(function(row, index) {
    return index > 0 && String(row[idColumn]) === String(hostelId);
  });

  if (rowIndex < 1) {
    throw new Error("Hostel listing not found.");
  }

  // Optional photo replacement. If no new photos are supplied, existing photos remain unchanged.
  if (Object.prototype.hasOwnProperty.call(updates, "images")) {
    const images = Array.isArray(updates.images) ? updates.images : [];
    if (images.length > CONFIG.MAX_IMAGES) {
      throw new Error("A hostel can have a maximum of 3 images.");
    }
    const imageUrls = [];
    images.forEach(function(image) {
      const saved = saveHostelImage(image.base64, image.mimeType, image.name);
      imageUrls.push(saved.imageUrl);
    });
    updates.image_urls = JSON.stringify(imageUrls);
    delete updates.images;
  }

  const totalRooms = Object.prototype.hasOwnProperty.call(updates, "total_rooms")
    ? (updates.total_rooms === "" || updates.total_rooms == null ? "" : Number(updates.total_rooms))
    : values[rowIndex][headers.indexOf("total_rooms")];
  const availableRooms = Object.prototype.hasOwnProperty.call(updates, "available_rooms")
    ? Number(updates.available_rooms)
    : Number(values[rowIndex][headers.indexOf("available_rooms")]);
  if (totalRooms !== "" && (!Number.isInteger(Number(totalRooms)) || Number(totalRooms) < 0)) {
    throw new Error("Total rooms must be a non-negative whole number.");
  }
  if (!Number.isInteger(availableRooms) || availableRooms < 0) {
    throw new Error("Available rooms must be a non-negative whole number.");
  }
  if (totalRooms !== "" && availableRooms > Number(totalRooms)) {
    throw new Error("Available rooms cannot be greater than total rooms.");
  }

  const allowedFields = [
    "name",
    "description",
    "area",
    "landmark",
    "location_url",
    "image_urls",
    "rent_amount",
    "rent_period",
    "room_type",
    "total_rooms",
    "available_rooms",
    "available_from",
    "contact_name",
    "landlord_contact",
    "verified",
    "status"
  ];

  allowedFields.forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      return;
    }

    const column = headers.indexOf(field);

    if (column >= 0) {
      sheet.getRange(rowIndex + 1, column + 1)
        .setValue(updates[field]);
    }
  });

  if (Object.prototype.hasOwnProperty.call(updates, "facilities")) {
    const column = headers.indexOf("facilities");

    if (column >= 0) {
      sheet.getRange(rowIndex + 1, column + 1)
        .setValue(JSON.stringify(updates.facilities || []));
    }
  }

  const updatedColumn = headers.indexOf("updated_at");

  if (updatedColumn >= 0) {
    sheet.getRange(rowIndex + 1, updatedColumn + 1)
      .setValue(new Date());
  }

  logHostelAdminAction(
    admin.email,
    "UPDATE_HOSTEL",
    hostelId,
    JSON.stringify(updates)
  );

  return {
    id: hostelId,
    updated: true
  };
}


/**
 * Permanently deletes a hostel listing after verifying the administrator.
 * The action is recorded before the row is removed.
 */
function deleteHostelListing(hostelId, admin) {
  if (!admin || !admin.email || !isHostelAdmin(admin.email)) {
    throw new Error("You are not authorised to delete hostel listings.");
  }
  if (!hostelId) {
    throw new Error("Hostel ID is required.");
  }

  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("HOSTEL_SHEET_ID");
  if (!spreadsheetId) throw new Error("Hostel database is not configured.");

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName("Hostels");
  if (!sheet || sheet.getLastRow() < 2) throw new Error("Hostel listing not found.");

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(header) { return String(header).trim(); });
  const idColumn = headers.indexOf("id");
  const nameColumn = headers.indexOf("name");
  if (idColumn < 0) throw new Error("The Hostels sheet is missing its id column.");

  const rowIndex = values.findIndex(function(row, index) {
    return index > 0 && String(row[idColumn]) === String(hostelId);
  });
  if (rowIndex < 1) throw new Error("Hostel listing not found.");

  const hostelName = nameColumn >= 0 ? String(values[rowIndex][nameColumn]) : "";
  const imageColumn = headers.indexOf("image_urls");
  const rawImages = imageColumn >= 0 ? String(values[rowIndex][imageColumn] || "") : "";
  logHostelAdminAction(admin.email, "DELETE_HOSTEL", hostelId, hostelName);

  // Remove the listing's own Drive photos where possible. A photo cleanup failure
  // must not prevent removal of the listing itself.
  try {
    const imageUrls = rawImages ? JSON.parse(rawImages) : [];
    (Array.isArray(imageUrls) ? imageUrls : []).forEach(function(url) {
      const match = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        try { DriveApp.getFileById(match[1]).setTrashed(true); } catch (imageError) {}
      }
    });
  } catch (imageParseError) {}

  sheet.deleteRow(rowIndex + 1);

  return { id: hostelId, deleted: true };
}


/**
 * Updates the number of available rooms.
 */
function setHostelAvailability(hostelId, availableRooms, admin) {
  const count = Number(availableRooms);

  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Available rooms must be zero or a positive whole number.");
  }

  return updateHostelListing(
    hostelId,
    {
      available_rooms: count,
      status: count === 0 ? "unavailable" : "published"
    },
    admin
  );
}
