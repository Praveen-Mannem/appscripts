/**
 * Main function to identify and list ownerless calendars.
 */
function listOwnerlessCalendars() {
  const users = getAllUsers();
  const ownerlessCalendars = [];
  const processedCalendarIds = new Set(); // To avoid duplicates if multiple users have the same shared calendar

  Logger.log(`Found ${users.length} users. Starting scan...`);

  // Limit for testing? Remove slice for full run.
  // const usersToScan = users.slice(0, 50); 
  const usersToScan = users;

  for (const user of usersToScan) {
    try {
      Logger.log(`Scanning user: ${user.primaryEmail}`);
      const calendars = getUserCalendars(user.primaryEmail);
      
      if (!calendars) continue;

      for (const cal of calendars) {
        // We are looking for secondary calendars mostly, or primary ones if the user is deleted/suspended but we are scanning via a service account check.
        // Actually, if we are impersonating User A, their primary calendar DEFINITELY has an owner (User A).
        // So we are primarily looking for calendars appearing in their list where NO ONE has 'owner' role.
        
        if (processedCalendarIds.has(cal.id)) continue;
        processedCalendarIds.add(cal.id);

        const isOwnerless = checkCalendarOwnership(cal.id, user.primaryEmail);
        if (isOwnerless) {
          ownerlessCalendars.push({
            id: cal.id,
            summary: cal.summary,
            foundVia: user.primaryEmail,
            description: cal.description || 'N/A'
          });
          Logger.log(`Found ownerless calendar: ${cal.summary} (${cal.id})`);
        }
      }
    } catch (e) {
      Logger.log(`Error processing user ${user.primaryEmail}: ${e.message}`);
    }
  }

  exportToSheet(ownerlessCalendars);
}

/**
 * Retrieves all users (Active, Suspended, Archived) from the domain.
 * NOTE: This runs as the script user (admin) OR we can impersonate an Admin.
 * Let's assume the script user has Admin Directory access, or we impersonate the ADMIN_EMAIL.
 */
function getAllUsers() {
  let users = [];
  let pageToken;
  
  // We use the Service Account to impersonate the Admin for the Directory API call as well, 
  // ensuring the script doesn't fail if the running user lacks permissions.
  const adminEmail = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
  if (!adminEmail) throw new Error("ADMIN_EMAIL property not set.");

  do {
    // We need a separate service for Directory API with matching scope
    const service = getOAuthServiceForAdmin(adminEmail); 
    if (!service.hasAccess()) {
      Logger.log('Admin Directory Auth failed: ' + service.getLastError());
      throw new Error('Admin Directory Auth failed. Check scopes and DWD.');
    }

    const url = `https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=500&viewType=admin_view&showDeleted=true&pageToken=${pageToken || ''}`;
    const response = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: 'Bearer ' + service.getAccessToken()
      }
    });
    
    const result = JSON.parse(response.getContentText());
    if (result.users) {
      users = users.concat(result.users);
    }
    pageToken = result.nextPageToken;
  } while (pageToken);

  return users;
}

/**
 * Gets the CalendarList for a specific user via Impersonation.
 */
function getUserCalendars(userEmail) {
  const service = getOAuthService(userEmail);
  if (!service.hasAccess()) {
    Logger.log(`Could not impersonate ${userEmail}: ${service.getLastError()}`);
    return null;
  }

  try {
    const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + service.getAccessToken() }
    });
    const result = JSON.parse(response.getContentText());
    return result.items;
  } catch (e) {
    Logger.log(`Failed to fetch calendar list for ${userEmail}: ${e.message}`);
    return null;
  }
}

/**
 * Checks if a calendar has ANY owner.
 * Uses the impersonated user's token to check ACLs.
 */
function checkCalendarOwnership(calendarId, userEmail) {
  const service = getOAuthService(userEmail);
  // Re-use token, likely valid.
  
  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/acl`;
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + service.getAccessToken() }
    });
    const acl = JSON.parse(response.getContentText());
    
    // Look for ANY entry with role 'owner'
    const hasOwner = acl.items.some(entry => entry.role === 'owner');
    return !hasOwner;
  } catch (e) {
    Logger.log(`Failed to check ACL for calendar ${calendarId}: ${e.message}`);
    // If we can't read ACL, we can't determine. Safest is to assume not ownerless or log as error.
    // However, if the user sees the calendar but can't read ACL, they might just have reader access.
    // This doesn't mean it's ownerless. 
    return false; 
  }
}

/**
 * exports data to a Google Sheet.
 */
function exportToSheet(data) {
  if (data.length === 0) {
    Logger.log("No ownerless calendars found.");
    return;
  }

  const ss = SpreadsheetApp.create("Ownerless Calendars Report " + new Date().toISOString());
  const sheet = ss.getActiveSheet();
  
  sheet.appendRow(["Calendar ID", "Summary", "Description", "Found Via User", "Status"]);
  
  const rows = data.map(item => [
    item.id,
    item.summary,
    item.description,
    item.foundVia,
    "Ownerless"
  ]);
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  
  Logger.log(`Report generated: ${ss.getUrl()}`);
}

/**
 * Specialized helper for Admin Directory API Access
 * Scopes differ from Calendar.
 */
function getOAuthServiceForAdmin(userEmail) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const privateKey = scriptProperties.getProperty('SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n');
  const serviceAccountEmail = scriptProperties.getProperty('SERVICE_ACCOUNT_EMAIL');

  return OAuth2.createService('ServiceAccountAdmin:' + userEmail)
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setPrivateKey(privateKey)
    .setIssuer(serviceAccountEmail)
    .setSubject(userEmail)
    .setPropertyStore(PropertiesService.getScriptProperties())
    .setScope(['https://www.googleapis.com/auth/admin.directory.user.readonly']);
}
