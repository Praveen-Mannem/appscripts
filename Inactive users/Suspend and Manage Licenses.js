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
 * Google Workspace User Suspension & License Management Script
 * 
 * Purpose:
 * Identifies and SUSPENDS users who:
 * 1. Have a specific Google Workspace license (e.g., Enterprise Plus).
 * 2. Have not logged in for the last 180 days.
 * 
 * Then performs license management:
 * 3. Removes Enterprise Plus license from suspended users.
 * 4. Assigns Cloud Identity Free license to suspended users.
 * 
 * Output:
 * - Generates a Google Sheet with two sheets:
 *   - Sheet 1: All inactive users with license info
 *   - Sheet 2: Suspended users with license change status
 * - Sends email notification with detailed report.
 * 
 * Prerequisites:
 * - Enable "Admin SDK API" in Apps Script Services.
 * - Enable "Admin License Manager API" in Apps Script Services.
 * - Run this script with a Google Workspace Super Admin account.
 * 
 * IMPORTANT:
 * This script will SUSPEND users and CHANGE their licenses. Use with caution!
 * Test with DRY_RUN mode first before actual suspension and license changes.
 */

// Configuration
const CONFIG = {
    // SKU IDs for licenses
    TARGET_SKU_ID: '1010020020', // Enterprise Plus to remove
    CLOUD_IDENTITY_FREE_SKU_ID: '1010010001', // Cloud Identity Free to assign
    PRODUCT_ID: 'Google-Apps',
    INACTIVITY_DAYS: 180,

    // DRY RUN MODE - Set to true to test without actually suspending users or changing licenses
    DRY_RUN: false, // Change to false to actually suspend users and manage licenses

    // License Assignment - Set to false if you don't want to assign Cloud Identity Free
    // (useful if you don't have Cloud Identity Free licenses available)
    ASSIGN_CLOUD_IDENTITY_FREE: false, // Set to true to assign Cloud Identity Free after removing E-plus

    // Email Configuration
    EMAIL_RECIPIENTS: 'email1@example.com, email2@example.com, email3@example.com',
    EMAIL_SUBJECT: 'User Suspension & License Management Report (180 Days)',
    SEND_EMAIL: false, // Set to true to enable email notifications

    // Output Configuration
    SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',

    // Shared Drive Configuration
    SHARED_DRIVE_FOLDER_ID: '0AA7GGQkHedVoUk9PVA',

    // Safety Settings
    // Maximum number of users to process in one run (safety limit)
    MAX_SUSPEND_COUNT: 50,

    // Exclusion Settings
    // Users in these OUs will NOT be suspended (e.g., /Executives, /IT)
    EXCLUDED_OU_PATHS: [
        '/LH - legal hold'
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
 * Main function to suspend inactive Enterprise Plus users and manage their licenses.
 */
function suspendAndManageLicenses() {
    const mode = CONFIG.DRY_RUN ? '🔍 DRY RUN MODE' : '⚠️ LIVE MODE - WILL SUSPEND USERS & CHANGE LICENSES';
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
    const usersToProcess = [];

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

            // Add to processing list if they have target license
            if (hasTarget && !user.suspended) {
                // Apply exclusion rules
                if (shouldExcludeUser(user)) {
                    Logger.log(`Excluding user from processing: ${user.primaryEmail} (${getExclusionReason(user)})`);
                    user.excluded = true;
                    user.exclusionReason = getExclusionReason(user);
                } else {
                    usersToProcess.push(user);
                }
            }
        } else {
            user.licenseString = 'No licenses';
            user.hasTargetLicense = false;
        }
    });

    Logger.log(`Found ${usersToProcess.length} users with Target License to process.`);

    // 4. Apply safety limit
    if (usersToProcess.length > CONFIG.MAX_SUSPEND_COUNT) {
        Logger.log(`⚠️ WARNING: ${usersToProcess.length} users exceed safety limit of ${CONFIG.MAX_SUSPEND_COUNT}`);
        Logger.log(`Only the first ${CONFIG.MAX_SUSPEND_COUNT} users will be processed.`);
        usersToProcess.splice(CONFIG.MAX_SUSPEND_COUNT);
    }

    // 5. Suspend users and manage licenses
    const processingResults = suspendAndChangeLicenses(usersToProcess, customerId);

    // 6. Generate report with both sheets
    exportLicenseManagementReport(inactiveUsers, processingResults);

    Logger.log(`========================================`);
    Logger.log(`PROCESSING COMPLETE`);
    Logger.log(`Total processed: ${processingResults.length}`);
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
 * Suspends users and manages their licenses (remove E-plus, assign Cloud Identity Free)
 */
function suspendAndChangeLicenses(users, customerId) {
    const results = [];

    users.forEach((user, index) => {
        const userEmail = user.primaryEmail;
        const result = {
            email: userEmail,
            name: user.name ? user.name.fullName : 'N/A',
            orgUnitPath: user.orgUnitPath || '/',
            lastLoginTime: user.lastLoginTime || 'Never',
            originalLicenses: user.licenseString,
            suspended: false,
            suspensionStatus: 'Pending',
            licenseRemoved: false,
            licenseRemovalStatus: 'Pending',
            licenseAssigned: false,
            licenseAssignmentStatus: 'Pending',
            newLicenses: '',
            error: null
        };

        if (CONFIG.DRY_RUN) {
            // Dry run mode - don't actually make changes
            result.suspensionStatus = '🔍 DRY RUN - Would suspend';
            result.licenseRemovalStatus = `🔍 DRY RUN - Would remove ${getSkuName(CONFIG.TARGET_SKU_ID)}`;

            if (CONFIG.ASSIGN_CLOUD_IDENTITY_FREE) {
                result.licenseAssignmentStatus = `🔍 DRY RUN - Would assign ${getSkuName(CONFIG.CLOUD_IDENTITY_FREE_SKU_ID)}`;
                result.newLicenses = getSkuName(CONFIG.CLOUD_IDENTITY_FREE_SKU_ID);
            } else {
                result.licenseAssignmentStatus = 'ℹ️ Skipped (disabled in config)';
                result.newLicenses = 'No license assigned';
            }

            Logger.log(`[DRY RUN] Would process: ${userEmail}`);
        } else {
            // STEP 1: Suspend the user
            try {
                AdminDirectory.Users.update(
                    { suspended: true },
                    userEmail
                );
                result.suspended = true;
                result.suspensionStatus = '✅ Successfully suspended';
                Logger.log(`✅ Suspended: ${userEmail}`);
                Utilities.sleep(200);
            } catch (e) {
                result.suspensionStatus = `❌ Failed: ${e.message}`;
                result.error = e.message;
                Logger.log(`❌ Error suspending ${userEmail}: ${e.message}`);
                // If suspension fails, skip license changes
                results.push(result);
                return;
            }

            // STEP 2: Remove Enterprise Plus license
            try {
                AdminLicenseManager.LicenseAssignments.remove(
                    CONFIG.PRODUCT_ID,
                    CONFIG.TARGET_SKU_ID,
                    userEmail
                );
                result.licenseRemoved = true;
                result.licenseRemovalStatus = `✅ Removed ${getSkuName(CONFIG.TARGET_SKU_ID)}`;
                Logger.log(`✅ Removed E-plus license from: ${userEmail}`);
                Utilities.sleep(200);
            } catch (e) {
                result.licenseRemovalStatus = `❌ Failed: ${e.message}`;
                if (!result.error) result.error = e.message;
                Logger.log(`❌ Error removing license from ${userEmail}: ${e.message}`);
            }

            // STEP 3: Assign Cloud Identity Free license (if enabled)
            if (CONFIG.ASSIGN_CLOUD_IDENTITY_FREE) {
                try {
                    AdminLicenseManager.LicenseAssignments.insert(
                        {
                            userId: userEmail
                        },
                        CONFIG.PRODUCT_ID,
                        CONFIG.CLOUD_IDENTITY_FREE_SKU_ID
                    );
                    result.licenseAssigned = true;
                    result.licenseAssignmentStatus = `✅ Assigned ${getSkuName(CONFIG.CLOUD_IDENTITY_FREE_SKU_ID)}`;
                    result.newLicenses = getSkuName(CONFIG.CLOUD_IDENTITY_FREE_SKU_ID);
                    Logger.log(`✅ Assigned Cloud Identity Free to: ${userEmail}`);
                    Utilities.sleep(200);
                } catch (e) {
                    result.licenseAssignmentStatus = `❌ Failed: ${e.message}`;
                    if (!result.error) result.error = e.message;
                    Logger.log(`❌ Error assigning license to ${userEmail}: ${e.message}`);
                    result.newLicenses = 'License assignment failed';
                }
            } else {
                result.licenseAssignmentStatus = 'ℹ️ Skipped (disabled in config)';
                result.newLicenses = 'No license assigned';
                Logger.log(`ℹ️ Skipped license assignment for: ${userEmail} (disabled in config)`);
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
 * Exports the license management report to Google Sheets with TWO sheets:
 * Sheet 1: All Inactive Users (with license info)
 * Sheet 2: Processed Users (with suspension and license change status)
 */
function exportLicenseManagementReport(allInactiveUsers, processingResults) {
    let ss;
    const mode = CONFIG.DRY_RUN ? 'DRY RUN' : 'LIVE';
    const timestamp = Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd HH:mm');

    // Create or open spreadsheet
    if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID_HERE') {
        try {
            ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
        } catch (e) {
            Logger.log(`Error opening spreadsheet with ID ${CONFIG.SPREADSHEET_ID}: ${e.message}`);
            ss = SpreadsheetApp.create(`License Management Report - ${mode} - ${timestamp}`);
            moveToSharedDrive(ss);
        }
    } else {
        ss = SpreadsheetApp.create(`License Management Report - ${mode} - ${timestamp}`);
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
            sheet1.getRange(i, 1, 1, 10).setBackground('#fff3cd');
        }
    }

    Logger.log(`Sheet 1 created: ${sheet1Name} with ${allUsersRows.length} inactive users`);

    // ========================================
    // SHEET 2: License Management Actions
    // ========================================
    const sheet2Name = `License Management - ${mode} - ${timestamp}`;
    const sheet2 = ss.insertSheet(sheet2Name);

    // Headers for Sheet 2
    sheet2.appendRow(['Name', 'Email', 'OU Path', 'Last Login Time', 'Original Licenses', 'Suspension Status', 'License Removal Status', 'License Assignment Status', 'New Licenses', 'Error']);

    // Data for Sheet 2
    const processingRows = processingResults.map(result => [
        result.name,
        result.email,
        result.orgUnitPath,
        result.lastLoginTime,
        result.originalLicenses,
        result.suspensionStatus,
        result.licenseRemovalStatus,
        result.licenseAssignmentStatus,
        result.newLicenses,
        result.error || ''
    ]);

    if (processingRows.length > 0) {
        sheet2.getRange(2, 1, processingRows.length, processingRows[0].length).setValues(processingRows);
    }

    // Format Sheet 2
    sheet2.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#ea4335').setFontColor('#ffffff');
    sheet2.setFrozenRows(1);
    sheet2.autoResizeColumns(1, 10);

    // Color code the status columns
    for (let i = 2; i <= processingRows.length + 1; i++) {
        // Suspension status (column 6)
        const suspensionStatus = sheet2.getRange(i, 6).getValue();
        if (suspensionStatus.includes('Successfully')) {
            sheet2.getRange(i, 6).setBackground('#34a853').setFontColor('#ffffff');
        } else if (suspensionStatus.includes('Failed')) {
            sheet2.getRange(i, 6).setBackground('#ea4335').setFontColor('#ffffff');
        } else if (suspensionStatus.includes('DRY RUN')) {
            sheet2.getRange(i, 6).setBackground('#fbbc04').setFontColor('#000000');
        }

        // License removal status (column 7)
        const removalStatus = sheet2.getRange(i, 7).getValue();
        if (removalStatus.includes('Removed')) {
            sheet2.getRange(i, 7).setBackground('#34a853').setFontColor('#ffffff');
        } else if (removalStatus.includes('Failed')) {
            sheet2.getRange(i, 7).setBackground('#ea4335').setFontColor('#ffffff');
        } else if (removalStatus.includes('DRY RUN')) {
            sheet2.getRange(i, 7).setBackground('#fbbc04').setFontColor('#000000');
        }

        // License assignment status (column 8)
        const assignmentStatus = sheet2.getRange(i, 8).getValue();
        if (assignmentStatus.includes('Assigned')) {
            sheet2.getRange(i, 8).setBackground('#34a853').setFontColor('#ffffff');
        } else if (assignmentStatus.includes('Failed')) {
            sheet2.getRange(i, 8).setBackground('#ea4335').setFontColor('#ffffff');
        } else if (assignmentStatus.includes('DRY RUN')) {
            sheet2.getRange(i, 8).setBackground('#fbbc04').setFontColor('#000000');
        }
    }

    Logger.log(`Sheet 2 created: ${sheet2Name} with ${processingRows.length} processed users`);

    // ========================================
    // Summary
    // ========================================
    const reportUrl = ss.getUrl();
    Logger.log(`========================================`);
    Logger.log(`Report generated: ${reportUrl}`);
    Logger.log(`Sheet 1: ${allUsersRows.length} total inactive users`);
    Logger.log(`Sheet 2: ${processingRows.length} processed users`);
    Logger.log(`========================================`);

    // Send email if configured
    if (CONFIG.SEND_EMAIL && CONFIG.EMAIL_RECIPIENTS) {
        sendLicenseManagementEmailReport(reportUrl, allInactiveUsers.length, processingResults);
    }
}

/**
 * Sends an email report with the license management results.
 */
function sendLicenseManagementEmailReport(reportUrl, totalInactiveCount, processingResults) {
    try {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const targetLicenseName = getSkuName(CONFIG.TARGET_SKU_ID);
        const newLicenseName = getSkuName(CONFIG.CLOUD_IDENTITY_FREE_SKU_ID);
        const mode = CONFIG.DRY_RUN ? 'DRY RUN (No changes were made)' : 'LIVE MODE (Users were suspended and licenses changed)';

        const successfulSuspensions = processingResults.filter(r => r.suspended).length;
        const successfulRemovals = processingResults.filter(r => r.licenseRemoved).length;
        const successfulAssignments = processingResults.filter(r => r.licenseAssigned).length;
        const failCount = processingResults.filter(r => r.error).length;

        const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #ea4335; border-bottom: 2px solid #ea4335; padding-bottom: 10px;">
              ⚠️ User Suspension & License Management Report
            </h2>
            
            <div style="background-color: ${CONFIG.DRY_RUN ? '#fff3cd' : '#f8d7da'}; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid ${CONFIG.DRY_RUN ? '#ffc107' : '#dc3545'};">
              <strong>Mode:</strong> ${mode}
            </div>
            
            <p>The automated user suspension and license management process has completed.</p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #555;">Report Summary</h3>
              <ul style="list-style: none; padding-left: 0;">
                <li><strong>Report Date:</strong> ${currentDate}</li>
                <li><strong>Target License (Removed):</strong> ${targetLicenseName}</li>
                <li><strong>New License (Assigned):</strong> ${newLicenseName}</li>
                <li><strong>Inactivity Period:</strong> ${CONFIG.INACTIVITY_DAYS} days</li>
                <li style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
                  <strong>📊 Sheet 1 - All Inactive Users:</strong> <span style="color: #4285f4; font-weight: bold;">${totalInactiveCount}</span>
                </li>
                <li>
                  <strong>📋 Sheet 2 - Processed Users:</strong> <span style="color: #ea4335; font-weight: bold;">${processingResults.length}</span>
                </li>
                ${!CONFIG.DRY_RUN ? `
                <li style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
                  <strong>✅ Successfully Suspended:</strong> <span style="color: #34a853; font-weight: bold;">${successfulSuspensions}</span>
                </li>
                <li>
                  <strong>🗑️ Licenses Removed:</strong> <span style="color: #34a853; font-weight: bold;">${successfulRemovals}</span>
                </li>
                <li>
                  <strong>➕ Licenses Assigned:</strong> <span style="color: #34a853; font-weight: bold;">${successfulAssignments}</span>
                </li>
                ` : ''}
                ${failCount > 0 ? `<li><strong>❌ Failed:</strong> <span style="color: #ea4335; font-weight: bold;">${failCount}</span></li>` : ''}
              </ul>
            </div>
            
            <div style="background-color: #e8f0fe; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #1967d2;">📑 Report Contains Two Sheets:</h4>
              <ol style="margin: 10px 0;">
                <li><strong>All Inactive Users:</strong> Complete list of all inactive users with license information</li>
                <li><strong>License Management:</strong> Detailed status of suspension and license changes for each processed user</li>
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
              No users were suspended and no licenses were changed. To perform actual changes, set DRY_RUN to false in the script configuration.
            </div>
            ` : ''}
            
            <p style="margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 15px;">
              This report was generated by the automated user suspension and license management script.<br>
              Report generated on: ${currentDate}
            </p>
          </div>
        </body>
      </html>
    `;

        const plainBody = `
User Suspension & License Management Report
============================================

Mode: ${mode}

Report Date: ${currentDate}
Target License (Removed): ${targetLicenseName}
New License (Assigned): ${newLicenseName}
Inactivity Period: ${CONFIG.INACTIVITY_DAYS} days

Sheet 1 - All Inactive Users: ${totalInactiveCount}
Sheet 2 - Processed Users: ${processingResults.length}
${!CONFIG.DRY_RUN ? `
Successfully Suspended: ${successfulSuspensions}
Licenses Removed: ${successfulRemovals}
Licenses Assigned: ${successfulAssignments}
` : ''}
${failCount > 0 ? `Failed: ${failCount}` : ''}

The report contains two sheets:
1. All Inactive Users - Complete list with license information
2. License Management - Detailed status of suspension and license changes

View the full report here: ${reportUrl}

${CONFIG.DRY_RUN ? '⚠️ This was a DRY RUN - No users were suspended and no licenses were changed.' : ''}
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
 * Sets up a trigger to run the license management script monthly.
 */
function setupMonthlyLicenseManagementTrigger() {
    const functionName = 'suspendAndManageLicenses';

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
 * Deletes all triggers for the license management function.
 */
function deleteAllLicenseManagementTriggers() {
    const functionName = 'suspendAndManageLicenses';
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

/**
 * DIAGNOSTIC FUNCTION - Check Cloud Identity Free license availability
 * Run this to verify you have Cloud Identity Free licenses available
 */
function checkCloudIdentityFreeLicenses() {
    Logger.log('=== CHECKING CLOUD IDENTITY FREE LICENSE AVAILABILITY ===');

    try {
        // Get customer ID
        let customerId = 'my_customer';
        try {
            const customer = AdminDirectory.Customers.get('my_customer');
            customerId = customer.id;
            Logger.log(`Customer ID: ${customerId}`);
        } catch (e) {
            Logger.log(`Warning: Could not fetch customer ID: ${e.message}`);
        }

        // Try to get license information for Cloud Identity Free
        Logger.log(`\nChecking for Cloud Identity Free licenses...`);
        Logger.log(`Product ID: ${CONFIG.PRODUCT_ID}`);
        Logger.log(`SKU ID: ${CONFIG.CLOUD_IDENTITY_FREE_SKU_ID}`);

        try {
            const licenseInfo = AdminLicenseManager.LicenseAssignments.listForProductAndSku(
                CONFIG.PRODUCT_ID,
                CONFIG.CLOUD_IDENTITY_FREE_SKU_ID,
                customerId,
                { maxResults: 10 }
            );

            if (licenseInfo.items && licenseInfo.items.length > 0) {
                Logger.log(`\n✅ Cloud Identity Free licenses are available!`);
                Logger.log(`Found ${licenseInfo.items.length} users with this license (showing first 10)`);
                licenseInfo.items.forEach((item, index) => {
                    Logger.log(`  ${index + 1}. ${item.userId}`);
                });
            } else {
                Logger.log(`\n⚠️ No users currently have Cloud Identity Free licenses assigned`);
                Logger.log(`This might mean:`);
                Logger.log(`  1. You have licenses available but none are assigned yet`);
                Logger.log(`  2. The SKU ID might be incorrect`);
            }
        } catch (e) {
            Logger.log(`\n❌ Error checking Cloud Identity Free licenses: ${e.message}`);
            Logger.log(`\nThis could mean:`);
            Logger.log(`  1. The SKU ID '${CONFIG.CLOUD_IDENTITY_FREE_SKU_ID}' is incorrect for your organization`);
            Logger.log(`  2. Cloud Identity Free is not enabled in your Google Workspace`);
            Logger.log(`  3. You don't have any Cloud Identity Free licenses`);
        }

        // List all available product SKUs
        Logger.log(`\n=== LISTING ALL AVAILABLE LICENSE SKUS ===`);
        try {
            const allLicenses = AdminLicenseManager.LicenseAssignments.listForProduct(
                CONFIG.PRODUCT_ID,
                customerId,
                { maxResults: 100 }
            );

            if (allLicenses.items) {
                const uniqueSkus = {};
                allLicenses.items.forEach(item => {
                    if (!uniqueSkus[item.skuId]) {
                        uniqueSkus[item.skuId] = {
                            skuId: item.skuId,
                            skuName: item.skuName || getSkuName(item.skuId),
                            count: 0
                        };
                    }
                    uniqueSkus[item.skuId].count++;
                });

                Logger.log(`\nFound ${Object.keys(uniqueSkus).length} different license types:`);
                Object.values(uniqueSkus).forEach(sku => {
                    Logger.log(`  - ${sku.skuName} (SKU: ${sku.skuId}) - ${sku.count} users`);
                });
            }
        } catch (e) {
            Logger.log(`Error listing all licenses: ${e.message}`);
        }

    } catch (e) {
        Logger.log(`\n❌ Unexpected error: ${e.message}`);
    }

    Logger.log(`\n=== DIAGNOSTIC COMPLETE ===`);
}

