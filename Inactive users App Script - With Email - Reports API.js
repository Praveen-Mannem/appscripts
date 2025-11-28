/**
 * Google Workspace User Audit Script (WITH EMAIL NOTIFICATIONS + REPORTS API)
 * 
 * Purpose:
 * Identifies users who:
 * 1. Have a specific Google Workspace license (e.g., Enterprise Plus).
 * 2. Have not logged in for the last 365 days OR have never logged in.
 * 
 * This version uses the Reports API for more accurate login data.
 * 
 * Output:
 * Generates a Google Sheet with the list of matching users, INCLUDING their license type.
 * AUTOMATICALLY SENDS EMAIL with the report link.
 * 
 * Prerequisites:
 * - Enable "Admin SDK API" in Apps Script Services.
 * - Enable "Admin License Manager API" in Apps Script Services.
 * - Enable "Admin Reports API" in Apps Script Services (NEW!)
 * 
 * OPTIMIZATION:
 * This script fetches ALL license assignments ONCE, then matches them to users.
 * Uses Reports API to get accurate last login times.
 */

// Configuration
const CONFIG = {
    // SKU ID for Google Workspace Enterprise Plus.
    // See SKU_CATALOG below for more options.
    TARGET_SKU_ID: '1010020020',
    PRODUCT_ID: 'Google-Apps',
    INACTIVITY_DAYS: 365,

    // Email Configuration
    EMAIL_RECIPIENTS: 'praveenmannem5@gmail.com',
    EMAIL_SUBJECT: 'Inactive Enterprise Plus Users Audit Report',
    SEND_EMAIL: true // Set to false to disable email
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
 * Main function to run the audit using Reports API.
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

    // 1. Fetch ALL license assignments
    Logger.log(`Fetching all license assignments for SKU: ${CONFIG.TARGET_SKU_ID}...`);
    const licenseMap = getAllLicenseAssignments(CONFIG.PRODUCT_ID, customerId);
    Logger.log(`Found ${Object.keys(licenseMap).length} users with licenses.`);

    // 2. Get all users with the target license
    const allUsers = getAllUsers();
    Logger.log(`Found ${allUsers.length} total users.`);

    // 3. Get login activity from Reports API
    Logger.log('Fetching login activity from Reports API...');
    const loginActivity = getLoginActivityFromReports(inactiveDate);
    Logger.log(`Fetched login data for analysis.`);

    // 4. Filter for inactive users with target license
    const targetUsers = [];

    allUsers.forEach(user => {
        const userEmail = user.primaryEmail.toLowerCase();

        // Check if user has the target license
        if (licenseMap[userEmail]) {
            const userLicenses = licenseMap[userEmail];
            const hasTarget = userLicenses.some(l => l.skuId === CONFIG.TARGET_SKU_ID);

            if (hasTarget) {
                // Check if user is inactive
                const lastLogin = loginActivity[userEmail];
                const isInactive = !lastLogin || new Date(lastLogin).getTime() < inactiveDate.getTime();

                if (isInactive) {
                    const licenseString = userLicenses.map(l => getSkuName(l.skuId)).join(', ');
                    targetUsers.push({
                        ...user,
                        lastLoginTime: lastLogin || null,
                        licenseString: licenseString
                    });
                }
            }
        }
    });

    Logger.log(`Found ${targetUsers.length} inactive users with Target License.`);

    // 5. Output to Spreadsheet
    if (targetUsers.length > 0) {
        exportToSheet(targetUsers);
    } else {
        Logger.log('No matching users found.');
    }
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
            if (pageToken) Utilities.sleep(100);
        } catch (e) {
            Logger.log(`Error fetching license assignments: ${e.message}`);
            break;
        }
    } while (pageToken);

    return licenseMap;
}

/**
 * Gets all users from the directory.
 */
function getAllUsers() {
    let users = [];
    let pageToken;

    do {
        try {
            const response = AdminDirectory.Users.list({
                customer: 'my_customer',
                maxResults: 500,
                pageToken: pageToken,
                viewType: 'domain_public'
            });

            if (response.users) {
                users = users.concat(response.users);
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
 * Gets login activity from Reports API.
 * Returns a map of email -> last login time.
 */
function getLoginActivityFromReports(cutoffDate) {
    const loginMap = {};
    const startDate = formatDateForReports(cutoffDate);
    const endDate = formatDateForReports(new Date());

    try {
        let pageToken;
        do {
            const response = AdminReports.Activities.list('all', 'login', {
                startTime: startDate,
                endTime: endDate,
                maxResults: 1000,
                pageToken: pageToken
            });

            if (response.items) {
                response.items.forEach(activity => {
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
    } catch (e) {
        Logger.log(`Error fetching login reports: ${e.message}`);
        Logger.log('Falling back to user.lastLoginTime from Directory API');
    }

    return loginMap;
}

/**
 * Formats date for Reports API (RFC 3339 format).
 */
function formatDateForReports(date) {
    return Utilities.formatDate(date, 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

/**
 * Exports the list of users to a new Google Sheet and sends email.
 */
function exportToSheet(users) {
    const ss = SpreadsheetApp.create('Inactive Enterprise Plus Users Audit');
    const sheet = ss.getActiveSheet();

    // Headers
    sheet.appendRow(['Name', 'Email', 'Last Login Time', 'Creation Time', 'Suspended', 'Licenses']);

    // Data with formatted dates
    const rows = users.map(user => [
        user.name ? user.name.fullName : 'N/A',
        user.primaryEmail,
        formatDate(user.lastLoginTime),
        formatDate(user.creationTime),
        user.suspended,
        user.licenseString
    ]);

    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }

    // Format the sheet
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 6);

    const reportUrl = ss.getUrl();
    Logger.log(`Report generated: ${reportUrl}`);

    // Send email if configured
    if (CONFIG.SEND_EMAIL && CONFIG.EMAIL_RECIPIENTS) {
        sendEmailReport(reportUrl, users.length);
    }
}

/**
 * Sends an email report with the spreadsheet link.
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

function getCutoffDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
}

function formatDate(dateString) {
    if (!dateString) return 'Never';

    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        Logger.log(`Error formatting date: ${dateString}, Error: ${e.message}`);
        return dateString;
    }
}
