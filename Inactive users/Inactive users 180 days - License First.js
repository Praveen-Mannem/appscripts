/**
 * @OnlyCurrentDoc false
 */

/**
 * OAuth Scopes - These are required for the script to access Google Workspace APIs
 * Google Apps Script will automatically request these permissions when you run the script
 * 
 * @scope https://www.googleapis.com/auth/admin.directory.user.readonly
 * @scope https://www.googleapis.com/auth/admin.directory.customer.readonly
 * @scope https://www.googleapis.com/auth/apps.licensing
 * @scope https://www.googleapis.com/auth/spreadsheets
 * @scope https://www.googleapis.com/auth/admin.reports.audit.readonly
 * @scope https://www.googleapis.com/auth/script.send_mail
 * @scope https://www.googleapis.com/auth/drive
 */

/**
 * Google Workspace User Audit Script - LICENSE FIRST APPROACH
 * 
 * Purpose:
 * This script uses an optimized approach:
 * 1. First fetches ONLY users with the target license (e.g., Enterprise Plus)
 * 2. Then checks if those licensed users are inactive
 * 
 * This is more efficient than checking all users first, then filtering by license.
 * 
 * Output:
 * Generates a Google Sheet with ONLY users who have the target license AND are inactive.
 * 
 * Prerequisites:
 * - Enable "Admin SDK API" in Apps Script Services
 * - Enable "Admin License Manager API" in Apps Script Services
 * - Enable "Admin Reports API" in Apps Script Services
 * - Run this script with a Google Workspace Super Admin account
 */

// Configuration
const CONFIG = {
    // SKU ID for Google Workspace Enterprise Plus
    // See SKU_CATALOG below for more options
    TARGET_SKU_ID: '1010020020',
    PRODUCT_ID: 'Google-Apps',
    INACTIVITY_DAYS: 180,

    // Email Configuration
    EMAIL_RECIPIENTS: 'email1@example.com, email2@example.com, email3@example.com',
    EMAIL_SUBJECT: 'Inactive Licensed Users Report (180 Days)',
    SEND_EMAIL: true, // Set to false to disable email notifications

    // Shared Drive Configuration
    // To save reports to a Shared Drive folder:
    // 1. Open the Shared Drive folder in Google Drive
    // 2. Copy the folder ID from the URL (the part after /folders/)
    // 3. Paste it here
    // If empty, the spreadsheet will be created in "My Drive"
    SHARED_DRIVE_FOLDER_ID: '0AA7GGQkHedVoUk9PVA'
};

/**
 * Catalog of Google Workspace SKU IDs
 * Source: https://developers.google.com/workspace/admin/licensing/v1/how-tos/products
 */
const SKU_CATALOG = {
    'Google-Apps': {
        'Enterprise Plus': '1010020020',
        'Enterprise Standard': '1010020028',
        'Business Starter': '1010020027',
        'Business Standard': '1010020028',
        'Business Plus': '1010020025',
        'Enterprise Essentials': '1010060003',
        'Essentials Starter': '1010060001',
        'Cloud Identity Free': '1010010001',
        'Cloud Identity Premium': '1010050001',
        'Education Plus Legacy (Student)': '1010310003',
        'Google-Apps-For-Education': '101031',
        'Google-Vault': '1010330003',
        'Google-Vault-Former-Employee': '1010330004'
    }
};

/**
 * Helper to get friendly name from SKU ID
 */
function getSkuName(skuId) {
    for (const [product, skus] of Object.entries(SKU_CATALOG)) {
        for (const [name, id] of Object.entries(skus)) {
            if (id === skuId) return name;
        }
    }
    return skuId;
}

/**
 * Main function to run the audit - LICENSE FIRST APPROACH
 */
function auditInactiveLicensedUsers() {
    const inactiveDate = getCutoffDate(CONFIG.INACTIVITY_DAYS);
    Logger.log(`Auditing users with license ${CONFIG.TARGET_SKU_ID} inactive since: ${inactiveDate.toISOString()}`);

    // 0. Get Canonical Customer ID
    let customerId = 'my_customer';
    try {
        const customer = AdminDirectory.Customers.get('my_customer');
        customerId = customer.id;
        Logger.log(`Fetched Canonical Customer ID: ${customerId}`);
    } catch (e) {
        Logger.log(`Warning: Could not fetch canonical customer ID. Error: ${e.message}`);
    }

    // STEP 1: Get ONLY users with the target license
    Logger.log(`Fetching users with target license SKU: ${CONFIG.TARGET_SKU_ID}...`);
    const licensedUserEmails = getLicensedUsers(CONFIG.PRODUCT_ID, CONFIG.TARGET_SKU_ID, customerId);
    Logger.log(`Found ${licensedUserEmails.length} users with target license.`);

    if (licensedUserEmails.length === 0) {
        Logger.log('No users found with the target license.');
        return;
    }

    // STEP 2: Get login activity data from Reports API
    const reportsLoginData = getLoginActivityFromReports(inactiveDate);
    Logger.log(`Reports API provided login data for ${Object.keys(reportsLoginData).length} users`);

    // STEP 3: Check each licensed user for inactivity
    const inactiveLicensedUsers = [];

    for (const userEmail of licensedUserEmails) {
        try {
            // Fetch user details from Directory API
            const user = AdminDirectory.Users.get(userEmail, { projection: 'full' });

            // Check if user is inactive using hybrid approach
            const isInactive = checkIfUserInactive(user, reportsLoginData, inactiveDate);

            if (isInactive) {
                // Add manager information
                user.managerEmail = getManager(userEmail) || 'N/A';
                user.licenseString = getSkuName(CONFIG.TARGET_SKU_ID);

                // Store the most recent login time from either source
                if (reportsLoginData[userEmail.toLowerCase()]) {
                    user.lastLoginTime = reportsLoginData[userEmail.toLowerCase()];
                }

                inactiveLicensedUsers.push(user);
            }

            // Small delay to avoid rate limiting
            Utilities.sleep(50);

        } catch (e) {
            Logger.log(`Error processing user ${userEmail}: ${e.message}`);
        }
    }

    Logger.log(`Found ${inactiveLicensedUsers.length} inactive users with target license.`);

    // STEP 4: Export to spreadsheet
    if (inactiveLicensedUsers.length > 0) {
        exportToSheet(inactiveLicensedUsers);
    } else {
        Logger.log('No inactive users with target license found.');
    }
}

/**
 * Gets all users who have a specific license SKU
 * Returns an array of user email addresses
 */
function getLicensedUsers(productId, targetSkuId, customerId) {
    const licensedUsers = [];
    let pageToken;

    do {
        try {
            const response = AdminLicenseManager.LicenseAssignments.listForProduct(
                productId,
                customerId,
                {
                    maxResults: 1000,
                    pageToken: pageToken
                }
            );

            if (response.items) {
                response.items.forEach(item => {
                    // Only include users with the target SKU
                    if (item.skuId === targetSkuId) {
                        licensedUsers.push(item.userId);
                    }
                });
            }

            pageToken = response.nextPageToken;

            // Add a small delay to avoid rate limiting
            if (pageToken) {
                Utilities.sleep(100);
            }
        } catch (e) {
            Logger.log(`Error fetching license assignments: ${e.message}`);
            break;
        }
    } while (pageToken);

    return licensedUsers;
}

/**
 * Checks if a user is inactive using hybrid approach
 * Returns true if user is inactive, false if active
 */
function checkIfUserInactive(user, reportsLoginData, cutoffDate) {
    const userEmail = user.primaryEmail.toLowerCase();

    // HYBRID APPROACH:
    // 1. First check Reports API data (most accurate)
    if (reportsLoginData[userEmail]) {
        const reportsLastLogin = new Date(reportsLoginData[userEmail]);
        // User has logged in recently according to Reports API
        if (reportsLastLogin.getTime() >= cutoffDate.getTime()) {
            return false; // User is ACTIVE
        }
    }

    // 2. Fall back to Directory API lastLoginTime
    if (user.lastLoginTime) {
        const directoryLastLogin = new Date(user.lastLoginTime);
        // If Directory API shows recent login, user is active
        if (directoryLastLogin.getTime() >= cutoffDate.getTime()) {
            return false; // User is ACTIVE
        }
    }

    // 3. If neither API shows recent login, user is inactive
    return true;
}

/**
 * Gets login activity from Reports API for the last 180 days
 * Returns a map of email -> last login time
 * 
 * NOTE: Reports API only keeps data for 180 days maximum
 */
function getLoginActivityFromReports(cutoffDate) {
    const loginMap = {};

    // Reports API only keeps 180 days of data, so adjust if needed
    const now = new Date();
    const maxReportsHistory = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
    const startDate = cutoffDate > maxReportsHistory ? cutoffDate : maxReportsHistory;

    const startDateStr = Utilities.formatDate(startDate, 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const endDateStr = Utilities.formatDate(now, 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");

    Logger.log(`Fetching login activity from Reports API (${startDateStr} to ${endDateStr})...`);

    try {
        let pageToken;
        let totalActivities = 0;

        do {
            const response = AdminReports.Activities.list('all', 'login', {
                startTime: startDateStr,
                endTime: endDateStr,
                maxResults: 1000,
                pageToken: pageToken
            });

            if (response.items) {
                totalActivities += response.items.length;
                response.items.forEach(activity => {
                    // Skip activities without actor email (e.g., system events)
                    if (!activity.actor || !activity.actor.email) {
                        return;
                    }

                    const email = activity.actor.email.toLowerCase();
                    const activityTime = activity.id.time;

                    // Keep the most recent login time
                    if (!loginMap[email] || new Date(activityTime) > new Date(loginMap[email])) {
                        loginMap[email] = activityTime;
                    }
                });
            }

            pageToken = response.nextPageToken;
            if (pageToken) Utilities.sleep(200);
        } while (pageToken);

        Logger.log(`Reports API: Found ${totalActivities} login activities for ${Object.keys(loginMap).length} unique users`);
    } catch (e) {
        Logger.log(`⚠️ Error fetching login reports: ${e.message}`);
        Logger.log('Will fall back to Directory API lastLoginTime data');
    }

    return loginMap;
}

/**
 * Gets the manager's email for a specific user
 * Returns null if no manager is found
 */
function getManager(userEmail) {
    try {
        const user = AdminDirectory.Users.get(userEmail, { projection: 'full' });

        if (user.relations) {
            const managerRelation = user.relations.find(r => r.type === 'manager');
            if (managerRelation) {
                return managerRelation.value;
            }
        }
    } catch (e) {
        // Suppress errors for standard users
    }
    return null;
}

/**
 * Exports the list of users to a new Google Sheet and sends email notification
 */
function exportToSheet(users) {
    const licenseName = getSkuName(CONFIG.TARGET_SKU_ID);
    const ss = SpreadsheetApp.create(`Inactive ${licenseName} Users (180 Days)`);
    const sheet = ss.getActiveSheet();

    // Move to Shared Drive if configured
    moveToSharedDrive(ss);

    // Headers
    sheet.appendRow(['Name', 'Email', 'OU Path', 'Manager Email', 'Last Login Time', 'Creation Time', 'Suspended', 'License']);

    // Data
    const rows = users.map(user => [
        user.name ? user.name.fullName : 'N/A',
        user.primaryEmail,
        user.orgUnitPath || '/',
        user.managerEmail || 'N/A',
        user.lastLoginTime || 'Never',
        user.creationTime,
        user.suspended,
        user.licenseString
    ]);

    // Write in batches
    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }

    // Format the sheet
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 8);

    const reportUrl = ss.getUrl();
    Logger.log(`Report generated: ${reportUrl}`);

    // Send email if configured
    if (CONFIG.SEND_EMAIL && CONFIG.EMAIL_RECIPIENTS) {
        sendEmailReport(reportUrl, users.length);
    }
}

/**
 * Sends an email report with the spreadsheet link to multiple recipients
 */
function sendEmailReport(reportUrl, userCount) {
    try {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const licenseName = getSkuName(CONFIG.TARGET_SKU_ID);

        const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #4285f4; border-bottom: 2px solid #4285f4; padding-bottom: 10px;">
              📊 Inactive Licensed Users Report
            </h2>
            
            <p>Hello,</p>
            
            <p>The automated audit for inactive <strong>${licenseName}</strong> users has been completed.</p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #555;">Report Summary</h3>
              <ul style="list-style: none; padding-left: 0;">
                <li><strong>Report Date:</strong> ${currentDate}</li>
                <li><strong>License Type:</strong> ${licenseName}</li>
                <li><strong>Inactivity Period:</strong> ${CONFIG.INACTIVITY_DAYS} days</li>
                <li><strong>Inactive Licensed Users Found:</strong> <span style="color: #d93025; font-weight: bold;">${userCount}</span></li>
              </ul>
            </div>
            
            <p>
              <a href="${reportUrl}" 
                 style="display: inline-block; background-color: #4285f4; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 5px; font-weight: bold;">
                📄 View Full Report
              </a>
            </p>
            
            <p style="margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 15px;">
              This report uses a license-first approach with Reports API for accurate login tracking.<br>
              Only users with the target license who are inactive are included in this report.<br>
              Report generated on: ${currentDate}
            </p>
          </div>
        </body>
      </html>
    `;

        const plainBody = `
Inactive Licensed Users Report
==============================

Report Date: ${currentDate}
License Type: ${licenseName}
Inactivity Period: ${CONFIG.INACTIVITY_DAYS} days
Inactive Licensed Users Found: ${userCount}

View the full report here: ${reportUrl}

---
This report uses a license-first approach with Reports API for accurate login tracking.
Only users with the target license who are inactive are included in this report.
    `;

        MailApp.sendEmail({
            to: CONFIG.EMAIL_RECIPIENTS,
            subject: CONFIG.EMAIL_SUBJECT,
            body: plainBody,
            htmlBody: htmlBody
        });

        Logger.log(`Email sent successfully to: ${CONFIG.EMAIL_RECIPIENTS}`);
    } catch (e) {
        Logger.log(`Error sending email: ${e.message}`);
    }
}

/**
 * Moves a spreadsheet to the configured Shared Drive folder
 * @param {Spreadsheet} spreadsheet - The spreadsheet object to move
 */
function moveToSharedDrive(spreadsheet) {
    // Check if Shared Drive folder is configured
    if (!CONFIG.SHARED_DRIVE_FOLDER_ID || CONFIG.SHARED_DRIVE_FOLDER_ID === '') {
        Logger.log('No Shared Drive folder configured. Spreadsheet created in My Drive.');
        return;
    }

    try {
        // Get the spreadsheet file
        const file = DriveApp.getFileById(spreadsheet.getId());

        // Get the target folder
        const targetFolder = DriveApp.getFolderById(CONFIG.SHARED_DRIVE_FOLDER_ID);

        // Move the file to the Shared Drive folder
        file.moveTo(targetFolder);

        Logger.log(`Spreadsheet moved to Shared Drive folder: ${targetFolder.getName()}`);
    } catch (e) {
        Logger.log(`Error moving spreadsheet to Shared Drive: ${e.message}`);
        Logger.log('Please check that:');
        Logger.log('1. The folder ID is correct');
        Logger.log('2. You have edit access to the Shared Drive folder');
        Logger.log('3. The folder exists and is accessible');
    }
}

/**
 * Utility to get date N days ago
 */
function getCutoffDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
}
