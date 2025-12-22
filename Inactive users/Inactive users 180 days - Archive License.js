/**
 * @OnlyCurrentDoc false
 */

/**
 * OAuth Scopes
 * @scope https://www.googleapis.com/auth/admin.directory.user
 * @scope https://www.googleapis.com/auth/admin.directory.customer.readonly
 * @scope https://www.googleapis.com/auth/apps.licensing
 * @scope https://www.googleapis.com/auth/spreadsheets
 */

/**
 * Google Workspace Inactive User Archive Script
 * 
 * Purpose:
 * Identifies users who:
 * 1. Have 'Enterprise Plus' license.
 * 2. Have not logged in for the last 180 days.
 * 
 * Action:
 * 1. REMOVES 'Enterprise Plus' license.
 * 2. ASSIGNS 'Archive User' license.
 * 
 * Output:
 * Generates a Google Sheet with the list of ARCHIVED users.
 * Sends an email report.
 */

// Configuration
const CONFIG = {
    // SKU ID for Google Workspace Enterprise Plus (License to Remove).
    REMOVE_SKU_ID: '1010020020',

    // SKU ID for Archive User License (License to Add).
    // IMPORTANT: UPDATE THIS ID WITH YOUR SPECIFIC ARCHIVE SKU ID.
    // Common Archive SKUs:
    // - Enterprise Plus Archive: Check your billing/admin console
    ADD_SKU_ID: '1010340001', // Google Workspace Enterprise Plus - Archived User

    PRODUCT_ID: 'Google-Apps',
    INACTIVITY_DAYS: 180,

    // Safety: Set to true to actually swap licenses.
    PERFORM_ARCHIVE: true,

    // Email Configuration
    EMAIL_RECIPIENTS: 'email1@example.com, email2@example.com, email3@example.com',
    EMAIL_SUBJECT: 'ARCHIVED: Inactive Enterprise Plus Users Report (180 Days)',
    SEND_EMAIL: true,

    // Excel/Sheet Configuration
    SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',
    SHARED_DRIVE_FOLDER_ID: '0AA7GGQkHedVoUk9PVA'
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
        'Archive User': CONFIG.ADD_SKU_ID // Dynamic placeholder
    }
};

function getSkuName(skuId) {
    // Add custom check for our config var
    if (skuId === CONFIG.ADD_SKU_ID) return 'Archive User (Target)';

    for (const [product, skus] of Object.entries(SKU_CATALOG)) {
        for (const [name, id] of Object.entries(skus)) {
            if (id === skuId) return name;
        }
    }
    return skuId;
}

/**
 * Main function to run the archive audit.
 */
function archiveInactiveUsers() {
    // Warning check
    if (CONFIG.ADD_SKU_ID === 'REPLACE_WITH_ACTUAL_ARCHIVE_SKU_ID') {
        Logger.log('❌ ERROR: You must update CONFIG.ADD_SKU_ID with the correct Archive User SKU ID before running this script.');
        return;
    }

    const inactiveDate = getCutoffDate(CONFIG.INACTIVITY_DAYS);
    Logger.log(`Auditing and Archiving users inactive since: ${inactiveDate.toISOString()}`);

    if (CONFIG.PERFORM_ARCHIVE) {
        Logger.log('⚠️ WARNING: ARCHIVING ENABLED. Licenses will be swapped.');
    } else {
        Logger.log('ℹ️ DRY RUN MODE. Licenses will matched but NOT swapped.');
    }

    let customerId = 'my_customer';
    try {
        const customer = AdminDirectory.Customers.get('my_customer');
        customerId = customer.id;
    } catch (e) {
        Logger.log(`Warning: Could not fetch canonical customer ID. Error: ${e.message}`);
    }

    Logger.log(`Fetching license assignments...`);
    // Ensure we fetch assignments for the SKU we want to REMOVE
    const licenseMap = getAllLicenseAssignments(CONFIG.PRODUCT_ID, customerId);

    const inactiveUsers = getInactiveUsers(inactiveDate);
    Logger.log(`Found ${inactiveUsers.length} inactive users.`);

    if (inactiveUsers.length === 0) {
        Logger.log('No inactive users found.');
        return;
    }

    const archivedUsers = [];

    inactiveUsers.forEach(user => {
        const userEmail = user.primaryEmail.toLowerCase();

        if (licenseMap[userEmail]) {
            const userLicenses = licenseMap[userEmail];
            user.licenseString = userLicenses.map(l => getSkuName(l.skuId)).join(', ');

            // Check if they have the license we want to REMOVE
            const hasTarget = userLicenses.some(l => l.skuId === CONFIG.REMOVE_SKU_ID);

            // Check if they ALREADY have the Archive license
            const alreadyArchived = userLicenses.some(l => l.skuId === CONFIG.ADD_SKU_ID);

            if (hasTarget && !alreadyArchived) {
                // Perform Archive Swap
                let actionStatus = 'Dry Run - Would Archive';

                if (CONFIG.PERFORM_ARCHIVE) {
                    try {
                        // 1. Remove Old License
                        AdminLicenseManager.LicenseAssignments.remove(
                            CONFIG.PRODUCT_ID,
                            CONFIG.REMOVE_SKU_ID,
                            userEmail
                        );
                        Utilities.sleep(500); // Sleep for safety

                        // 2. Add Archive License
                        AdminLicenseManager.LicenseAssignments.insert(
                            { skuId: CONFIG.ADD_SKU_ID },
                            CONFIG.PRODUCT_ID,
                            CONFIG.ADD_SKU_ID,
                            userEmail
                        );

                        actionStatus = 'ARCHIVED (Swapped Licenses)';
                        Logger.log(`Successfully archived user: ${userEmail}`);
                    } catch (e) {
                        actionStatus = `Error: ${e.message}`;
                        Logger.log(`Failed to archive ${userEmail}: ${e.message}`);
                    }
                }

                user.actionStatus = actionStatus;
                archivedUsers.push(user);
            }
        }
    });

    Logger.log(`Processed ${archivedUsers.length} users for archiving.`);

    if (archivedUsers.length > 0) {
        exportToSheet(archivedUsers);
    } else {
        Logger.log('No users met the criteria for archiving.');
    }
}

function exportToSheet(users) {
    const title = `ARCHIVED Users Report (${CONFIG.INACTIVITY_DAYS} Days) - ${new Date().toLocaleDateString()}`;
    const ss = SpreadsheetApp.create(title);
    const sheet = ss.getActiveSheet();
    moveToSharedDrive(ss);

    sheet.appendRow(['Name', 'Email', 'OU Path', 'Last Login Time', 'Original Licenses', 'Action Status']);

    const rows = users.map(user => [
        user.name ? user.name.fullName : 'N/A',
        user.primaryEmail,
        user.orgUnitPath || '/',
        user.lastLoginTime || 'Never',
        user.licenseString,
        user.actionStatus
    ]);

    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#fbbc04').setFontColor('#000000');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 6);

    const reportUrl = ss.getUrl();
    if (CONFIG.SEND_EMAIL && CONFIG.EMAIL_RECIPIENTS) sendEmailReport(reportUrl, users.length);
}

// ---------------------------------------------------------------------------
// SHARED HELPER FUNCTIONS
// ---------------------------------------------------------------------------

function getAllLicenseAssignments(productId, customerId) {
    const licenseMap = {};
    let pageToken;
    do {
        try {
            const response = AdminLicenseManager.LicenseAssignments.listForProduct(
                productId, customerId, { maxResults: 1000, pageToken: pageToken }
            );
            if (response.items) {
                response.items.forEach(item => {
                    const email = item.userId.toLowerCase();
                    if (!licenseMap[email]) licenseMap[email] = [];
                    licenseMap[email].push({ skuId: item.skuId, skuName: item.skuName || getSkuName(item.skuId) });
                });
            }
            pageToken = response.nextPageToken;
            if (pageToken) Utilities.sleep(100);
        } catch (e) { break; }
    } while (pageToken);
    return licenseMap;
}

function getLoginActivityFromReports(cutoffDate) {
    const loginMap = {};
    const now = new Date();
    const maxReportsHistory = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
    const startDate = cutoffDate > maxReportsHistory ? cutoffDate : maxReportsHistory;
    const startDateStr = Utilities.formatDate(startDate, 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const endDateStr = Utilities.formatDate(now, 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");

    try {
        let pageToken;
        do {
            const response = AdminReports.Activities.list('all', 'login', {
                startTime: startDateStr, endTime: endDateStr, maxResults: 1000, pageToken: pageToken
            });
            if (response.items) {
                response.items.forEach(activity => {
                    if (!activity.actor || !activity.actor.email) return;
                    const email = activity.actor.email.toLowerCase();
                    const time = activity.id.time;
                    if (!loginMap[email] || new Date(time) > new Date(loginMap[email])) loginMap[email] = time;
                });
            }
            pageToken = response.nextPageToken;
            if (pageToken) Utilities.sleep(200);
        } while (pageToken);
    } catch (e) { }
    return loginMap;
}

function getInactiveUsers(cutoffDate) {
    let users = [];
    let pageToken;
    const reportsLoginData = getLoginActivityFromReports(cutoffDate);

    do {
        try {
            const response = AdminDirectory.Users.list({ customer: 'my_customer', maxResults: 500, pageToken: pageToken });
            if (response.users) {
                const filtered = response.users.filter(user => {
                    const email = user.primaryEmail.toLowerCase();
                    if (reportsLoginData[email]) {
                        if (new Date(reportsLoginData[email]).getTime() >= cutoffDate.getTime()) return false;
                        user.lastLoginTime = reportsLoginData[email];
                    } else if (user.lastLoginTime) {
                        if (new Date(user.lastLoginTime).getTime() >= cutoffDate.getTime()) return false;
                    }
                    return true;
                });
                users = users.concat(filtered);
            }
            pageToken = response.nextPageToken;
        } catch (e) { break; }
    } while (pageToken);
    return users;
}

function sendEmailReport(reportUrl, userCount) {
    try {
        const htmlBody = `
            <h2>⚠️ Inactive Users Archive Report</h2>
            <p><strong>Action Taken:</strong> ${CONFIG.PERFORM_ARCHIVE ? 'Archived (License Swap)' : 'Dry Run'}</p>
            <p><strong>Total Users:</strong> ${userCount}</p>
            <p><a href="${reportUrl}">View Report</a></p>
        `;
        MailApp.sendEmail({ to: CONFIG.EMAIL_RECIPIENTS, subject: CONFIG.EMAIL_SUBJECT, htmlBody: htmlBody });
    } catch (e) { }
}

function moveToSharedDrive(spreadsheet) {
    if (!CONFIG.SHARED_DRIVE_FOLDER_ID) return;
    try {
        const file = DriveApp.getFileById(spreadsheet.getId());
        const folder = DriveApp.getFolderById(CONFIG.SHARED_DRIVE_FOLDER_ID);
        file.moveTo(folder);
    } catch (e) { }
}

function getCutoffDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
}
