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
 */

/**
 * Google Workspace User Audit Script
 * 
 * Purpose:
 * Identifies users who:
 * 1. Have a specific Google Workspace license (e.g., Enterprise Plus).
 * 2. Have not logged in for the last 365 days.
 * 
 * Output:
 * Generates a Google Sheet with the list of matching users, INCLUDING their license type.
 * 
 * Prerequisites:
 * - Enable "Admin SDK API" in Apps Script Services.
 * - Enable "Admin License Manager API" in Apps Script Services.
 * - Run this script with a Google Workspace Super Admin account.
 * 
 * OPTIMIZATION:
 * This script fetches ALL license assignments ONCE, then matches them to users.
 * This avoids hitting API quota limits when checking many users.
 */

// Configuration
const CONFIG = {
    // SKU ID for Google Workspace Enterprise Plus.
    // See SKU_CATALOG below for more options.
    TARGET_SKU_ID: '1010020020',
    PRODUCT_ID: 'Google-Apps',
    INACTIVITY_DAYS: 180,

    // Email Configuration
    EMAIL_RECIPIENTS: 'email1@example.com, email2@example.com, email3@example.com',
    EMAIL_SUBJECT: 'Inactive Enterprise Plus Users Audit Report (180 Days)',
    SEND_EMAIL: true, // Set to false to disable email notifications

    // Output Configuration
    // If set, the script will append a new tab to this spreadsheet.
    // If empty or default, it will create a new spreadsheet file each time.
    SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',

    // Shared Drive Configuration
    // To save reports to a Shared Drive folder:
    // 1. Open the Shared Drive folder in Google Drive
    // 2. Copy the folder ID from the URL (the part after /folders/)
    // 3. Paste it here
    // Example URL: https://drive.google.com/drive/folders/1ABC123xyz...
    // If empty, the spreadsheet will be created in "My Drive"
    SHARED_DRIVE_FOLDER_ID: '0AA7GGQkHedVoUk9PVA'
};

/**
 * Catalog of Google Workspace SKU IDs.
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
 * Main function to run the audit.
 */
function auditInactiveEnterpriseUsers() {
    const inactiveDate = getCutoffDate(CONFIG.INACTIVITY_DAYS);
    Logger.log(`Auditing users inactive since: ${inactiveDate.toISOString()}`);

    // 0. Get Canonical Customer ID
    let customerId = 'my_customer';
    try {
        const customer = AdminDirectory.Customers.get('my_customer');
        customerId = customer.id;
        Logger.log(`Fetched Canonical Customer ID: ${customerId}`);
    } catch (e) {
        Logger.log(`Warning: Could not fetch canonical customer ID. Error: ${e.message}`);
    }

    // 1. Fetch ALL license assignments for the target SKU ONCE
    Logger.log(`Fetching all license assignments for SKU: ${CONFIG.TARGET_SKU_ID}...`);
    const licenseMap = getAllLicenseAssignments(CONFIG.PRODUCT_ID, customerId);
    Logger.log(`Found ${Object.keys(licenseMap).length} users with licenses.`);

    // 2. Find all users inactive since the cutoff date
    const inactiveUsers = getInactiveUsers(inactiveDate);
    Logger.log(`Found ${inactiveUsers.length} inactive users.`);

    if (inactiveUsers.length === 0) {
        Logger.log('No inactive users found.');
        return;
    }

    // 3. Add license information to ALL inactive users
    inactiveUsers.forEach(user => {
        const userEmail = user.primaryEmail.toLowerCase();

        // Check if this user has licenses
        if (licenseMap[userEmail]) {
            const userLicenses = licenseMap[userEmail];
            const licenseString = userLicenses.map(l => getSkuName(l.skuId)).join(', ');
            user.licenseString = licenseString;

            // Mark if they have the target license
            const hasTarget = userLicenses.some(l => l.skuId === CONFIG.TARGET_SKU_ID);
            user.hasTargetLicense = hasTarget;
        } else {
            user.licenseString = 'No licenses';
            user.hasTargetLicense = false;
        }
    });

    // Count users with target license
    const targetUsers = inactiveUsers.filter(u => u.hasTargetLicense);
    Logger.log(`Found ${targetUsers.length} users with Target License and Inactive.`);

    // 4. Output ALL inactive users to Spreadsheet
    if (inactiveUsers.length > 0) {
        exportToSheet(inactiveUsers);
    } else {
        Logger.log('No inactive users found.');
    }
}

/**
 * Fetches ALL license assignments for a product.
 * Returns a map: { 'user@domain.com': [{skuId: '...', skuName: '...'}] }
 * This is much more efficient than querying per user.
 */
function getAllLicenseAssignments(productId, customerId) {
    const licenseMap = {};
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
                    const userEmail = item.userId.toLowerCase();

                    if (!licenseMap[userEmail]) {
                        licenseMap[userEmail] = [];
                    }

                    licenseMap[userEmail].push({
                        skuId: item.skuId,
                        skuName: item.skuName || getSkuName(item.skuId)
                    });
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

    return licenseMap;
}

/**
 * Gets login activity from Reports API for the last 180 days.
 * Returns a map of email -> last login time.
 * 
 * NOTE: Reports API only keeps data for 180 days maximum.
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
 * Retrieves users who haven't logged in since the given date.
 * Uses HYBRID approach: Reports API for recent data + Directory API for fallback.
 */
function getInactiveUsers(cutoffDate) {
    let users = [];
    let pageToken;

    // Step 1: Get login activity from Reports API (more accurate for recent logins)
    const reportsLoginData = getLoginActivityFromReports(cutoffDate);
    Logger.log(`Reports API provided login data for ${Object.keys(reportsLoginData).length} users`);

    // Step 2: Get all users from Directory API
    do {
        try {
            const response = AdminDirectory.Users.list({
                customer: 'my_customer',
                maxResults: 500,
                pageToken: pageToken
            });

            if (response.users) {
                const filtered = response.users.filter(user => {
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
                    // Store the most recent login time from either source
                    if (reportsLoginData[userEmail]) {
                        user.lastLoginTime = reportsLoginData[userEmail];
                    }

                    return true; // User is INACTIVE
                });
                users = users.concat(filtered);
            }
            pageToken = response.nextPageToken;
        } catch (e) {
            Logger.log('Error listing users: ' + e.message);
            break;
        }
    } while (pageToken);

    return users;
}

/**
 * Exports the list of users to the configured Google Sheet and sends email notification.
 */
function exportToSheet(users) {
    let ss;
    let sheet;
    const sheetName = `Audit ${Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd HH:mm')}`;

    if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID_HERE') {
        try {
            ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
            sheet = ss.insertSheet(sheetName);
        } catch (e) {
            Logger.log(`Error opening spreadsheet with ID ${CONFIG.SPREADSHEET_ID}: ${e.message}`);
            // Fallback to creating a new sheet if ID is invalid
            ss = SpreadsheetApp.create(`Inactive Enterprise Plus Users Audit (180 Days) - ${sheetName}`);
            sheet = ss.getActiveSheet();

            // Move to Shared Drive if configured
            moveToSharedDrive(ss);
        }
    } else {
        // Create new spreadsheet
        ss = SpreadsheetApp.create(`Inactive Enterprise Plus Users Audit (180 Days) - ${sheetName}`);
        sheet = ss.getActiveSheet();

        // Move to Shared Drive if configured
        moveToSharedDrive(ss);
    }

    // Headers
    sheet.appendRow(['Name', 'Email', 'OU Path', 'Last Login Time', 'Creation Time', 'Suspended', 'Licenses']);

    // Data
    const rows = users.map(user => [
        user.name ? user.name.fullName : 'N/A',
        user.primaryEmail,
        user.orgUnitPath || '/',
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
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 7);

    const reportUrl = ss.getUrl();
    Logger.log(`Report generated: ${reportUrl} (Sheet: ${sheetName})`);

    // Send email if configured
    if (CONFIG.SEND_EMAIL && CONFIG.EMAIL_RECIPIENTS) {
        sendEmailReport(reportUrl, users.length);
    }
}

/**
 * Sends an email report with the spreadsheet link to multiple recipients.
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
              📊 Inactive Users Audit Report
            </h2>
            
            <p>Hello,</p>
            
            <p>The automated audit for inactive users has been completed using the Reports API for accurate login data.</p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #555;">Report Summary</h3>
              <ul style="list-style: none; padding-left: 0;">
                <li><strong>Report Date:</strong> ${currentDate}</li>
                <li><strong>License Type:</strong> ${licenseName}</li>
                <li><strong>Inactivity Period:</strong> ${CONFIG.INACTIVITY_DAYS} days</li>
                <li><strong>Total Inactive Users Found:</strong> <span style="color: #d93025; font-weight: bold;">${userCount}</span></li>
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
              This report uses the Admin Reports API for accurate login tracking.<br>
              Report generated on: ${currentDate}
            </p>
          </div>
        </body>
      </html>
    `;

        const plainBody = `
Inactive Users Audit Report
===========================

Report Date: ${currentDate}
License Type: ${licenseName}
Inactivity Period: ${CONFIG.INACTIVITY_DAYS} days
Total Inactive Users Found: ${userCount}

View the full report here: ${reportUrl}

---
This report uses the Admin Reports API for accurate login tracking.
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
 * Utility to get date N days ago.
 */
function getCutoffDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
}

/**
 * DIAGNOSTIC FUNCTION - Check specific user's login data
 * This helps debug why certain users show incorrect login times
 * 
 * @param {string} userEmail - Email address of the user to check
 */
function debugSpecificUser(userEmail) {
    Logger.log(`=== DEBUGGING USER: ${userEmail} ===`);

    // 1. Check Admin Directory API data
    try {
        const user = AdminDirectory.Users.get(userEmail);
        Logger.log('\n--- Admin Directory API Data ---');
        Logger.log(`Primary Email: ${user.primaryEmail}`);
        Logger.log(`Name: ${user.name ? user.name.fullName : 'N/A'}`);
        Logger.log(`Last Login Time: ${user.lastLoginTime || 'NOT PROVIDED BY API'}`);
        Logger.log(`Creation Time: ${user.creationTime}`);
        Logger.log(`Suspended: ${user.suspended}`);
        Logger.log(`Is Admin: ${user.isAdmin}`);
        Logger.log(`Is Delegated Admin: ${user.isDelegatedAdmin}`);
    } catch (e) {
        Logger.log(`❌ Error fetching user from Directory API: ${e.message}`);
    }

    // 2. Check Reports API for actual login activity
    try {
        Logger.log('\n--- Checking Reports API for Login Activity ---');
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

        const activities = AdminReports.Activities.list(
            'user',
            'login',
            {
                userKey: userEmail,
                startTime: thirtyDaysAgo.toISOString(),
                endTime: now.toISOString(),
                maxResults: 10
            }
        );

        if (activities.items && activities.items.length > 0) {
            Logger.log(`✅ Found ${activities.items.length} login events in last 30 days`);
            Logger.log('Most recent login events:');
            activities.items.slice(0, 5).forEach((activity, index) => {
                Logger.log(`  ${index + 1}. ${activity.id.time} - ${activity.events[0].name}`);
            });
        } else {
            Logger.log('⚠️ No login events found in last 30 days via Reports API');
        }
    } catch (e) {
        Logger.log(`❌ Error fetching from Reports API: ${e.message}`);
        Logger.log('   You may need to enable the Admin Reports API');
    }

    Logger.log('\n=== DIAGNOSTIC COMPLETE ===');
}

/**
 * DIAGNOSTIC FUNCTION - Run this to check which APIs are authorized
 * This helps identify authorization issues
 */
function checkAuthorizedScopes() {
    Logger.log('=== CHECKING API AUTHORIZATION ===');

    // Check OAuth Token
    try {
        const token = ScriptApp.getOAuthToken();
        Logger.log('✅ OAuth Token obtained: ' + token.substring(0, 20) + '...');
    } catch (e) {
        Logger.log('❌ Failed to get OAuth token: ' + e.message);
    }

    // Test Admin Directory API - Customer
    try {
        const customer = AdminDirectory.Customers.get('my_customer');
        Logger.log('✅ Admin Directory API (Customer) is working!');
        Logger.log('   Customer ID: ' + customer.id);
    } catch (e) {
        Logger.log('❌ Admin Directory API (Customer) failed: ' + e.message);
    }

    // Test Admin Directory API - Users List
    try {
        const users = AdminDirectory.Users.list({
            customer: 'my_customer',
            maxResults: 1
        });
        Logger.log('✅ Admin Directory API (Users.list) is working!');
        if (users.users && users.users.length > 0) {
            Logger.log('   Sample user: ' + users.users[0].primaryEmail);
        } else {
            Logger.log('   No users returned (but API call succeeded)');
        }
    } catch (e) {
        Logger.log('❌ Admin Directory API (Users.list) failed: ' + e.message);
        Logger.log('   This is the error you\'re experiencing!');
    }

    // Test License Manager API
    try {
        const licenses = AdminLicenseManager.LicenseAssignments.listForProduct(
            'Google-Apps',
            'my_customer',
            { maxResults: 1 }
        );
        Logger.log('✅ License Manager API is working!');
        if (licenses.items && licenses.items.length > 0) {
            Logger.log('   Sample license: ' + licenses.items[0].userId);
        }
    } catch (e) {
        Logger.log('❌ License Manager API failed: ' + e.message);
    }

    Logger.log('=== DIAGNOSTIC COMPLETE ===');
    Logger.log('');
    Logger.log('NEXT STEPS:');
    Logger.log('1. If Users.list failed: Follow the authorization fix guide');
    Logger.log('2. Remove old authorization from myaccount.google.com/permissions');
    Logger.log('3. Enable Admin SDK API in Google Cloud Console');
    Logger.log('4. Re-authorize the script');
}

/**
 * Sets up a trigger to run the audit every 30 days.
 * Run this function manually once to initialize the schedule.
 */
function setupMonthlyTrigger() {
    const functionName = 'auditInactiveEnterpriseUsers';

    // Check if trigger already exists
    const triggers = ScriptApp.getProjectTriggers();
    const exists = triggers.some(trigger => trigger.getHandlerFunction() === functionName);

    if (exists) {
        Logger.log(`Trigger for ${functionName} already exists.`);
        return;
    }

    // Create 30-day interval trigger
    ScriptApp.newTrigger(functionName)
        .timeBased()
        .everyDays(30)
        .create();

    Logger.log(`Successfully created trigger to run ${functionName} every 30 days.`);
}
