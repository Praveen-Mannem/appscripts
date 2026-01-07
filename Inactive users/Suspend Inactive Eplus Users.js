/**
 * @OnlyCurrentDoc false
 */

/**
 * OAuth Scopes - These are required for the script to access Google Workspace APIs
 * Google Apps Script will automatically request these permissions when you run the script
 * 
 * @scope https://www.googleapis.com/auth/admin.directory.user
 * @scope https://www.googleapis.com/auth/admin.directory.customer.readonly
 * @scope https://www.googleapis.com/auth/apps.licensing
 * @scope https://www.googleapis.com/auth/spreadsheets
 * @scope https://www.googleapis.com/auth/admin.reports.audit.readonly
 * @scope https://www.googleapis.com/auth/script.send_mail
 * @scope https://www.googleapis.com/auth/drive
 * @scope https://www.googleapis.com/auth/script.scriptapp
 */

/**
 * Google Workspace User Suspension Script
 * 
 * Purpose:
 * Identifies and SUSPENDS users who:
 * 1. Have a specific Google Workspace license (e.g., Enterprise Plus).
 * 2. Have not logged in for the last 180 days.
 * 
 * Output:
 * - Generates a Google Sheet with the list of suspended users.
 * - Sends email notification with suspension report.
 * 
 * Prerequisites:
 * - Enable "Admin SDK API" in Apps Script Services.
 * - Enable "Admin License Manager API" in Apps Script Services.
 * - Run this script with a Google Workspace Super Admin account.
 * 
 * IMPORTANT:
 * This script will SUSPEND users. Use with caution!
 * Test with DRY_RUN mode first before actual suspension.
 */

// Configuration
const CONFIG = {
    // SKU ID for Google Workspace Enterprise Plus.
    TARGET_SKU_ID: '1010020020',
    PRODUCT_ID: 'Google-Apps',
    INACTIVITY_DAYS: 180,

    // DRY RUN MODE - Set to true to test without actually suspending users
    DRY_RUN: true, // Change to false to actually suspend users

    // Email Configuration
    EMAIL_RECIPIENTS: 'email1@example.com, email2@example.com, email3@example.com',
    EMAIL_SUBJECT: 'User Suspension Report - Inactive Enterprise Plus Users (180 Days)',
    SEND_EMAIL: false, // Set to true to enable email notifications

    // Output Configuration
    SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',

    // Shared Drive Configuration
    SHARED_DRIVE_FOLDER_ID: '0AA7GGQkHedVoUk9PVA',

    // Safety Settings
    // Maximum number of users to suspend in one run (safety limit)
    MAX_SUSPEND_COUNT: 50,

    // Exclusion Settings
    // Users in these OUs will NOT be suspended (e.g., /Executives, /IT)
    EXCLUDED_OU_PATHS: [
        // '/Executives',
        // '/IT',
        // '/Management'
    ],

    // Exclude admin users from suspension
    EXCLUDE_ADMINS: true
};

/**
 * Catalog of Google Workspace SKU IDs.
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
 * Main function to suspend inactive Enterprise Plus users.
 */
function suspendInactiveEnterpriseUsers() {
    const mode = CONFIG.DRY_RUN ? '🔍 DRY RUN MODE' : '⚠️ LIVE MODE - WILL SUSPEND USERS';
    Logger.log(`========================================`);
    Logger.log(mode);
    Logger.log(`========================================`);

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

    // 1. Fetch ALL license assignments for the target SKU
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

    // 3. Add license information and filter for target license
    const usersToSuspend = [];

    inactiveUsers.forEach(user => {
        const userEmail = user.primaryEmail.toLowerCase();

        // Check if this user has licenses
        if (licenseMap[userEmail]) {
            const userLicenses = licenseMap[userEmail];
            const licenseString = userLicenses.map(l => getSkuName(l.skuId)).join(', ');
            user.licenseString = licenseString;

            // Check if they have the target license
            const hasTarget = userLicenses.some(l => l.skuId === CONFIG.TARGET_SKU_ID);
            user.hasTargetLicense = hasTarget;

            // Add to suspension list if they have target license
            if (hasTarget && !user.suspended) {
                // Apply exclusion rules
                if (shouldExcludeUser(user)) {
                    Logger.log(`Excluding user from suspension: ${user.primaryEmail} (${getExclusionReason(user)})`);
                    user.excluded = true;
                    user.exclusionReason = getExclusionReason(user);
                } else {
                    usersToSuspend.push(user);
                }
            }
        } else {
            user.licenseString = 'No licenses';
            user.hasTargetLicense = false;
        }
    });

    Logger.log(`Found ${usersToSuspend.length} users with Target License to suspend.`);

    // 4. Apply safety limit
    if (usersToSuspend.length > CONFIG.MAX_SUSPEND_COUNT) {
        Logger.log(`⚠️ WARNING: ${usersToSuspend.length} users exceed safety limit of ${CONFIG.MAX_SUSPEND_COUNT}`);
        Logger.log(`Only the first ${CONFIG.MAX_SUSPEND_COUNT} users will be processed.`);
        usersToSuspend.splice(CONFIG.MAX_SUSPEND_COUNT);
    }

    // 5. Suspend users (or simulate in dry run mode)
    const suspensionResults = suspendUsers(usersToSuspend);

    // 6. Generate report with both sheets
    exportSuspensionReport(inactiveUsers, suspensionResults);

    Logger.log(`========================================`);
    Logger.log(`SUSPENSION COMPLETE`);
    Logger.log(`Total processed: ${suspensionResults.length}`);
    Logger.log(`========================================`);
}

/**
 * Checks if a user should be excluded from suspension
 */
function shouldExcludeUser(user) {
    // Exclude admins if configured
    if (CONFIG.EXCLUDE_ADMINS && (user.isAdmin || user.isDelegatedAdmin)) {
        return true;
    }

    // Exclude users in specific OUs
    if (CONFIG.EXCLUDED_OU_PATHS.length > 0) {
        const userOU = user.orgUnitPath || '/';
        if (CONFIG.EXCLUDED_OU_PATHS.some(excludedOU => userOU.startsWith(excludedOU))) {
            return true;
        }
    }

    return false;
}

/**
 * Gets the reason why a user is excluded
 */
function getExclusionReason(user) {
    if (CONFIG.EXCLUDE_ADMINS && (user.isAdmin || user.isDelegatedAdmin)) {
        return 'Admin user';
    }

    if (CONFIG.EXCLUDED_OU_PATHS.length > 0) {
        const userOU = user.orgUnitPath || '/';
        const matchedOU = CONFIG.EXCLUDED_OU_PATHS.find(excludedOU => userOU.startsWith(excludedOU));
        if (matchedOU) {
            return `In excluded OU: ${matchedOU}`;
        }
    }

    return 'Unknown';
}

/**
 * Suspends users and returns results
 */
function suspendUsers(users) {
    const results = [];

    users.forEach((user, index) => {
        const userEmail = user.primaryEmail;
        const result = {
            email: userEmail,
            name: user.name ? user.name.fullName : 'N/A',
            orgUnitPath: user.orgUnitPath || '/',
            lastLoginTime: user.lastLoginTime || 'Never',
            licenseString: user.licenseString,
            suspended: false,
            status: 'Pending',
            error: null
        };

        if (CONFIG.DRY_RUN) {
            // Dry run mode - don't actually suspend
            result.status = '🔍 DRY RUN - Would suspend';
            result.suspended = false;
            Logger.log(`[DRY RUN] Would suspend: ${userEmail}`);
        } else {
            // Actually suspend the user
            try {
                AdminDirectory.Users.update(
                    { suspended: true },
                    userEmail
                );
                result.status = '✅ Successfully suspended';
                result.suspended = true;
                Logger.log(`✅ Suspended: ${userEmail}`);

                // Add a small delay to avoid rate limiting
                Utilities.sleep(200);
            } catch (e) {
                result.status = '❌ Failed to suspend';
                result.error = e.message;
                Logger.log(`❌ Error suspending ${userEmail}: ${e.message}`);
            }
        }

        results.push(result);
    });

    return results;
}

/**
 * Fetches ALL license assignments for a product.
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
 */
function getLoginActivityFromReports(cutoffDate) {
    const loginMap = {};

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
                    if (!activity.actor || !activity.actor.email) {
                        return;
                    }

                    const email = activity.actor.email.toLowerCase();
                    const activityTime = activity.id.time;

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
 */
function getInactiveUsers(cutoffDate) {
    let users = [];
    let pageToken;

    const reportsLoginData = getLoginActivityFromReports(cutoffDate);
    Logger.log(`Reports API provided login data for ${Object.keys(reportsLoginData).length} users`);

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

                    // Check Reports API data first
                    if (reportsLoginData[userEmail]) {
                        const reportsLastLogin = new Date(reportsLoginData[userEmail]);
                        if (reportsLastLogin.getTime() >= cutoffDate.getTime()) {
                            return false; // User is ACTIVE
                        }
                    }

                    // Fall back to Directory API lastLoginTime
                    if (user.lastLoginTime) {
                        const directoryLastLogin = new Date(user.lastLoginTime);
                        if (directoryLastLogin.getTime() >= cutoffDate.getTime()) {
                            return false; // User is ACTIVE
                        }
                    }

                    // Store the most recent login time
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
 * Exports the suspension report to Google Sheets with TWO sheets:
 * Sheet 1: All Inactive Users (with license info)
 * Sheet 2: Users to Suspend (filtered list with suspension status)
 */
function exportSuspensionReport(allInactiveUsers, suspensionResults) {
    let ss;
    const mode = CONFIG.DRY_RUN ? 'DRY RUN' : 'LIVE';
    const timestamp = Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd HH:mm');

    // Create or open spreadsheet
    if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID_HERE') {
        try {
            ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
        } catch (e) {
            Logger.log(`Error opening spreadsheet with ID ${CONFIG.SPREADSHEET_ID}: ${e.message}`);
            ss = SpreadsheetApp.create(`User Suspension Report - ${mode} - ${timestamp}`);
            moveToSharedDrive(ss);
        }
    } else {
        ss = SpreadsheetApp.create(`User Suspension Report - ${mode} - ${timestamp}`);
        moveToSharedDrive(ss);
    }

    // ========================================
    // SHEET 1: All Inactive Users
    // ========================================
    const sheet1Name = `All Inactive Users - ${timestamp}`;
    let sheet1;

    try {
        sheet1 = ss.insertSheet(sheet1Name);
    } catch (e) {
        // If we can't insert, use active sheet
        sheet1 = ss.getActiveSheet();
        sheet1.setName(sheet1Name);
    }

    // Headers for Sheet 1
    sheet1.appendRow(['Name', 'Email', 'OU Path', 'Last Login Time', 'Creation Time', 'Suspended', 'Licenses', 'Has Target License', 'Excluded', 'Exclusion Reason']);

    // Data for Sheet 1
    const allUsersRows = allInactiveUsers.map(user => [
        user.name ? user.name.fullName : 'N/A',
        user.primaryEmail,
        user.orgUnitPath || '/',
        user.lastLoginTime || 'Never',
        user.creationTime,
        user.suspended ? 'Yes' : 'No',
        user.licenseString || 'No licenses',
        user.hasTargetLicense ? 'Yes' : 'No',
        user.excluded ? 'Yes' : 'No',
        user.exclusionReason || ''
    ]);

    // Write data to Sheet 1
    if (allUsersRows.length > 0) {
        sheet1.getRange(2, 1, allUsersRows.length, allUsersRows[0].length).setValues(allUsersRows);
    }

    // Format Sheet 1
    sheet1.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    sheet1.setFrozenRows(1);
    sheet1.autoResizeColumns(1, 10);

    // Highlight users with target license
    for (let i = 2; i <= allUsersRows.length + 1; i++) {
        const hasTargetLicense = sheet1.getRange(i, 8).getValue();
        if (hasTargetLicense === 'Yes') {
            sheet1.getRange(i, 1, 1, 10).setBackground('#fff3cd'); // Light yellow
        }
    }

    Logger.log(`Sheet 1 created: ${sheet1Name} with ${allUsersRows.length} inactive users`);

    // ========================================
    // SHEET 2: Users to Suspend
    // ========================================
    const sheet2Name = `Users to Suspend - ${mode} - ${timestamp}`;
    const sheet2 = ss.insertSheet(sheet2Name);

    // Headers for Sheet 2
    sheet2.appendRow(['Name', 'Email', 'OU Path', 'Last Login Time', 'Licenses', 'Status', 'Error']);

    // Data for Sheet 2
    const suspensionRows = suspensionResults.map(result => [
        result.name,
        result.email,
        result.orgUnitPath,
        result.lastLoginTime,
        result.licenseString,
        result.status,
        result.error || ''
    ]);

    // Write data to Sheet 2
    if (suspensionRows.length > 0) {
        sheet2.getRange(2, 1, suspensionRows.length, suspensionRows[0].length).setValues(suspensionRows);
    }

    // Format Sheet 2
    sheet2.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#ea4335').setFontColor('#ffffff');
    sheet2.setFrozenRows(1);
    sheet2.autoResizeColumns(1, 7);

    // Color code the status column in Sheet 2
    const statusColumn = 6;
    for (let i = 2; i <= suspensionRows.length + 1; i++) {
        const status = sheet2.getRange(i, statusColumn).getValue();
        if (status.includes('Successfully')) {
            sheet2.getRange(i, statusColumn).setBackground('#34a853').setFontColor('#ffffff');
        } else if (status.includes('Failed')) {
            sheet2.getRange(i, statusColumn).setBackground('#ea4335').setFontColor('#ffffff');
        } else if (status.includes('DRY RUN')) {
            sheet2.getRange(i, statusColumn).setBackground('#fbbc04').setFontColor('#000000');
        }
    }

    Logger.log(`Sheet 2 created: ${sheet2Name} with ${suspensionRows.length} users to suspend`);

    // ========================================
    // Summary
    // ========================================
    const reportUrl = ss.getUrl();
    Logger.log(`========================================`);
    Logger.log(`Report generated: ${reportUrl}`);
    Logger.log(`Sheet 1: ${allUsersRows.length} total inactive users`);
    Logger.log(`Sheet 2: ${suspensionRows.length} users to suspend`);
    Logger.log(`========================================`);

    // Send email if configured
    if (CONFIG.SEND_EMAIL && CONFIG.EMAIL_RECIPIENTS) {
        sendSuspensionEmailReport(reportUrl, allInactiveUsers.length, suspensionResults);
    }
}


/**
 * Sends an email report with the suspension results.
 */
function sendSuspensionEmailReport(reportUrl, totalInactiveCount, suspensionResults) {
    try {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const licenseName = getSkuName(CONFIG.TARGET_SKU_ID);
        const mode = CONFIG.DRY_RUN ? 'DRY RUN (No users were actually suspended)' : 'LIVE MODE (Users were suspended)';
        const successCount = suspensionResults.filter(r => r.suspended).length;
        const failCount = suspensionResults.filter(r => r.error).length;

        const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #ea4335; border-bottom: 2px solid #ea4335; padding-bottom: 10px;">
              ⚠️ User Suspension Report
            </h2>
            
            <div style="background-color: ${CONFIG.DRY_RUN ? '#fff3cd' : '#f8d7da'}; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid ${CONFIG.DRY_RUN ? '#ffc107' : '#dc3545'};">
              <strong>Mode:</strong> ${mode}
            </div>
            
            <p>The automated user suspension process has completed.</p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #555;">Report Summary</h3>
              <ul style="list-style: none; padding-left: 0;">
                <li><strong>Report Date:</strong> ${currentDate}</li>
                <li><strong>License Type:</strong> ${licenseName}</li>
                <li><strong>Inactivity Period:</strong> ${CONFIG.INACTIVITY_DAYS} days</li>
                <li style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
                  <strong>📊 Sheet 1 - All Inactive Users:</strong> <span style="color: #4285f4; font-weight: bold;">${totalInactiveCount}</span>
                </li>
                <li>
                  <strong>📋 Sheet 2 - Users to Suspend:</strong> <span style="color: #ea4335; font-weight: bold;">${suspensionResults.length}</span>
                </li>
                ${!CONFIG.DRY_RUN ? `<li><strong>Successfully Suspended:</strong> <span style="color: #34a853; font-weight: bold;">${successCount}</span></li>` : ''}
                ${failCount > 0 ? `<li><strong>Failed:</strong> <span style="color: #ea4335; font-weight: bold;">${failCount}</span></li>` : ''}
              </ul>
            </div>
            
            <div style="background-color: #e8f0fe; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #1967d2;">📑 Report Contains Two Sheets:</h4>
              <ol style="margin: 10px 0;">
                <li><strong>All Inactive Users:</strong> Complete list of all inactive users with license information</li>
                <li><strong>Users to Suspend:</strong> Filtered list showing only users with Enterprise Plus licenses and their suspension status</li>
              </ol>
            </div>
            
            <p>
              <a href="${reportUrl}" 
                 style="display: inline-block; background-color: #ea4335; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 5px; font-weight: bold;">
                📄 View Full Report
              </a>
            </p>
            
            ${CONFIG.DRY_RUN ? `
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>⚠️ This was a DRY RUN</strong><br>
              No users were actually suspended. To perform actual suspensions, set DRY_RUN to false in the script configuration.
            </div>
            ` : ''}
            
            <p style="margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 15px;">
              This report was generated by the automated user suspension script.<br>
              Report generated on: ${currentDate}
            </p>
          </div>
        </body>
      </html>
    `;

        const plainBody = `
User Suspension Report
======================

Mode: ${mode}

Report Date: ${currentDate}
License Type: ${licenseName}
Inactivity Period: ${CONFIG.INACTIVITY_DAYS} days

Sheet 1 - All Inactive Users: ${totalInactiveCount}
Sheet 2 - Users to Suspend: ${suspensionResults.length}
${!CONFIG.DRY_RUN ? `Successfully Suspended: ${successCount}` : ''}
${failCount > 0 ? `Failed: ${failCount}` : ''}

The report contains two sheets:
1. All Inactive Users - Complete list with license information
2. Users to Suspend - Filtered list with suspension status

View the full report here: ${reportUrl}

${CONFIG.DRY_RUN ? '⚠️ This was a DRY RUN - No users were actually suspended.' : ''}
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
 */
function moveToSharedDrive(spreadsheet) {
    if (!CONFIG.SHARED_DRIVE_FOLDER_ID || CONFIG.SHARED_DRIVE_FOLDER_ID === '') {
        Logger.log('No Shared Drive folder configured. Spreadsheet created in My Drive.');
        return;
    }

    try {
        const file = DriveApp.getFileById(spreadsheet.getId());
        const targetFolder = DriveApp.getFolderById(CONFIG.SHARED_DRIVE_FOLDER_ID);
        file.moveTo(targetFolder);
        Logger.log(`Spreadsheet moved to Shared Drive folder: ${targetFolder.getName()}`);
    } catch (e) {
        Logger.log(`Error moving spreadsheet to Shared Drive: ${e.message}`);
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
 * Sets up a trigger to run the suspension script monthly.
 * Run this function manually once to initialize the schedule.
 */
function setupMonthlySuspensionTrigger() {
    const functionName = 'suspendInactiveEnterpriseUsers';

    const triggers = ScriptApp.getProjectTriggers();
    const exists = triggers.some(trigger => trigger.getHandlerFunction() === functionName);

    if (exists) {
        Logger.log(`Trigger for ${functionName} already exists.`);
        return;
    }

    ScriptApp.newTrigger(functionName)
        .timeBased()
        .everyDays(30)
        .create();

    Logger.log(`Successfully created trigger to run ${functionName} every 30 days.`);
}

/**
 * Deletes all triggers for the suspension function.
 */
function deleteAllSuspensionTriggers() {
    const functionName = 'suspendInactiveEnterpriseUsers';
    const triggers = ScriptApp.getProjectTriggers();
    let deletedCount = 0;

    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === functionName) {
            ScriptApp.deleteTrigger(trigger);
            deletedCount++;
        }
    });

    if (deletedCount > 0) {
        Logger.log(`✅ Deleted ${deletedCount} trigger(s) for ${functionName}`);
    } else {
        Logger.log('ℹ️ No triggers found to delete.');
    }
}
