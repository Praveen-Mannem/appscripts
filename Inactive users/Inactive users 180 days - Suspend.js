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
 * Google Workspace Inactive User Suspension Script
 * 
 * Purpose:
 * Identifies users who:
 * 1. Have a specific Google Workspace license.
 * 2. Have not logged in for the last 180 days.
 * 
 * Action:
 * SUSPENDS the identified users.
 * 
 * Output:
 * Generates a Google Sheet with the list of SUSPENDED users.
 * Sends an email report.
 */

// Configuration
const CONFIG = {
    // SKU ID for Google Workspace Enterprise Plus.
    TARGET_SKU_ID: '1010020020',
    PRODUCT_ID: 'Google-Apps',
    INACTIVITY_DAYS: 180,

    // Safety: Set to true to actually suspend users. Set to false for a dry run (reporting only).
    PERFORM_SUSPENSION: true,

    // Drive Transfer Configuration
    TRANSFER_TO_MANAGER: true, // If true, transfers Drive files to manager
    DRIVE_APPLICATION_ID: '55656082996', // Application ID for Drive and Docs

    // Email Configuration
    EMAIL_RECIPIENTS: 'email1@example.com, email2@example.com, email3@example.com',
    EMAIL_SUBJECT: 'SUSPENDED: Inactive Enterprise Plus Users Report (180 Days)',
    SEND_EMAIL: true,

    // Excel/Sheet Configuration
    SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE', // If empty, creates new
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

function getSkuName(skuId) {
    for (const [product, skus] of Object.entries(SKU_CATALOG)) {
        for (const [name, id] of Object.entries(skus)) {
            if (id === skuId) return name;
        }
    }
    return skuId;
}

/**
 * Main function to run the suspension audit.
 */
function suspendInactiveUsers() {
    const inactiveDate = getCutoffDate(CONFIG.INACTIVITY_DAYS);
    Logger.log(`Auditing and Suspending users inactive since: ${inactiveDate.toISOString()}`);

    if (CONFIG.PERFORM_SUSPENSION) {
        Logger.log('⚠️ WARNING: SUSPENSION IS ENABLED. Users will be suspended.');
    } else {
        Logger.log('ℹ️ DRY RUN MODE. Users will NOT be suspended.');
    }

    // 0. Get Canonical Customer ID
    let customerId = 'my_customer';
    try {
        const customer = AdminDirectory.Customers.get('my_customer');
        customerId = customer.id;
    } catch (e) {
        Logger.log(`Warning: Could not fetch canonical customer ID. Error: ${e.message}`);
    }

    // 1. Fetch license assignments
    Logger.log(`Fetching license assignments for SKU: ${CONFIG.TARGET_SKU_ID}...`);
    const licenseMap = getAllLicenseAssignments(CONFIG.PRODUCT_ID, customerId);

    // 2. Find inactive users
    const inactiveUsers = getInactiveUsers(inactiveDate);
    Logger.log(`Found ${inactiveUsers.length} inactive users.`);

    if (inactiveUsers.length === 0) {
        Logger.log('No inactive users found.');
        return;
    }

    // 3. Filter for target license and SUSPEND
    const suspendedUsers = [];

    inactiveUsers.forEach(user => {
        const userEmail = user.primaryEmail.toLowerCase();

        // Check license
        if (licenseMap[userEmail]) {
            const userLicenses = licenseMap[userEmail];
            // Format license string for report
            user.licenseString = userLicenses.map(l => getSkuName(l.skuId)).join(', ');

            // Check if they have the target license
            const hasTarget = userLicenses.some(l => l.skuId === CONFIG.TARGET_SKU_ID);

            if (hasTarget) {
                // User matches criteria (Inactive + Target License)

                // Perform Suspension if enabled
                let actionStatus = 'Dry Run - Would Suspend';
                let transferStatus = 'N/A';

                if (CONFIG.PERFORM_SUSPENSION) {
                    try {
                        // Only suspend if not already suspended
                        if (!user.suspended) {
                            AdminDirectory.Users.update({ suspended: true }, userEmail);
                            actionStatus = 'SUSPENDED';
                            user.suspended = true; // Update local object for report
                            Logger.log(`SUSPENDED User: ${userEmail}`);

                            // Transfer Drive Files to Manager
                            if (CONFIG.TRANSFER_TO_MANAGER) {
                                transferStatus = transferFilesToManager(userEmail);
                            }
                        } else {
                            actionStatus = 'Already Suspended';
                            Logger.log(`Skipping User: ${userEmail} (Already Suspended)`);
                        }
                    } catch (e) {
                        actionStatus = `Error: ${e.message}`;
                        Logger.log(`Failed to suspend ${userEmail}: ${e.message}`);
                    }
                }

                user.actionStatus = actionStatus;
                user.transferStatus = transferStatus;
                suspendedUsers.push(user);
            }
        }
    });

    Logger.log(`Processed ${suspendedUsers.length} users for suspension.`);

    // 4. Output to Sheet
    if (suspendedUsers.length > 0) {
        exportToSheet(suspendedUsers);
    } else {
        Logger.log('No users met the criteria for suspension.');
    }
}

/**
 * Exports the list of users to a new Google Sheet and sends email notification.
 */
function exportToSheet(users) {
    const title = `SUSPENDED Users Report (${CONFIG.INACTIVITY_DAYS} Days) - ${new Date().toLocaleDateString()}`;
    const ss = SpreadsheetApp.create(title);
    const sheet = ss.getActiveSheet();

    moveToSharedDrive(ss);

    // Headers
    sheet.appendRow(['Name', 'Email', 'OU Path', 'Last Login Time', 'Suspended', 'Licenses', 'Action Status', 'Transfer Status']);

    // Data
    const rows = users.map(user => [
        user.name ? user.name.fullName : 'N/A',
        user.primaryEmail,
        user.orgUnitPath || '/',
        user.lastLoginTime || 'Never',
        user.suspended,
        user.licenseString,
        user.actionStatus,
        user.transferStatus || 'N/A'
    ]);

    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }

    // Format
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#d93025').setFontColor('#ffffff'); // Red header for Suspension
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 8);

    const reportUrl = ss.getUrl();
    Logger.log(`Report generated: ${reportUrl}`);

    if (CONFIG.SEND_EMAIL && CONFIG.EMAIL_RECIPIENTS) {
        sendEmailReport(reportUrl, users.length);
    }
}

/**
 * Transfers Drive files to the user's manager.
 * Returns a status string for the report.
 */
function transferFilesToManager(userEmail) {
    try {
        const managerEmail = getManager(userEmail);

        if (!managerEmail) {
            Logger.log(`No manager found for ${userEmail}. Skipping transfer.`);
            return 'Skipped - No Manager Found';
        }

        Logger.log(`Initiating Drive transfer from ${userEmail} to ${managerEmail}...`);

        const transfer = AdminDataTransfer.Transfers.insert(
            {
                oldOwnerUserId: userEmail,
                newOwnerUserId: managerEmail,
                applicationDataTransfers: [
                    {
                        applicationId: CONFIG.DRIVE_APPLICATION_ID,
                        applicationTransferParams: [{ key: 'PRIVACY_LEVEL', value: ['PRIVATE', 'SHARED'] }]
                    }
                ]
            }
        );

        Logger.log(`Transfer initiated. ID: ${transfer.id}`);
        return `Initiated (To: ${managerEmail})`;

    } catch (e) {
        Logger.log(`Transfer failed for ${userEmail}: ${e.message}`);
        return `Failed: ${e.message}`;
    }
}

/**
 * Gets the manager's email for a specific user.
 * Returns null if no manager is found.
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
        Logger.log(`Error fetching manager for ${userEmail}: ${e.message}`);
    }
    return null;
}


// ---------------------------------------------------------------------------
// SHARED HELPER FUNCTIONS (Same as original script)
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
        } catch (e) {
            Logger.log(`Error fetching licenses: ${e.message}`);
            break;
        }
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
                    if (!loginMap[email] || new Date(time) > new Date(loginMap[email])) {
                        loginMap[email] = time;
                    }
                });
            }
            pageToken = response.nextPageToken;
            if (pageToken) Utilities.sleep(200);
        } while (pageToken);
    } catch (e) {
        Logger.log(`Error fetching login reports: ${e.message}`);
    }
    return loginMap;
}

function getInactiveUsers(cutoffDate) {
    let users = [];
    let pageToken;
    const reportsLoginData = getLoginActivityFromReports(cutoffDate);

    do {
        try {
            const response = AdminDirectory.Users.list({
                customer: 'my_customer', maxResults: 500, pageToken: pageToken
            });
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
        } catch (e) {
            Logger.log('Error listing users: ' + e.message);
            break;
        }
    } while (pageToken);
    return users;
}

function sendEmailReport(reportUrl, userCount) {
    try {
        const currentDate = new Date().toLocaleDateString();
        const htmlBody = `
            <h2>⚠️ Inactive Users Suspension Report</h2>
            <p><strong>Action Taken:</strong> ${CONFIG.PERFORM_SUSPENSION ? 'Suspension' : 'Dry Run (Simulation)'}</p>
            <p><strong>Total Users Processed:</strong> ${userCount}</p>
            <p><a href="${reportUrl}">View Full Report</a></p>
        `;
        MailApp.sendEmail({
            to: CONFIG.EMAIL_RECIPIENTS,
            subject: CONFIG.EMAIL_SUBJECT,
            htmlBody: htmlBody
        });
    } catch (e) {
        Logger.log(`Error sending email: ${e.message}`);
    }
}

function moveToSharedDrive(spreadsheet) {
    if (!CONFIG.SHARED_DRIVE_FOLDER_ID) return;
    try {
        const file = DriveApp.getFileById(spreadsheet.getId());
        const folder = DriveApp.getFolderById(CONFIG.SHARED_DRIVE_FOLDER_ID);
        file.moveTo(folder);
    } catch (e) {
        Logger.log(`Error moving file: ${e.message}`);
    }
}

function getCutoffDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
}
