/**
 * Google Workspace User Audit Script (WITH EMAIL NOTIFICATIONS)
 * 
 * Purpose:
 * Identifies users who:
 * 1. Have a specific Google Workspace license (e.g., Enterprise Plus).
 * 2. Have not logged in for the last 365 days OR have never logged in.
 * 
 * Output:
 * Generates a Google Sheet with the list of matching users, INCLUDING their license type.
 * AUTOMATICALLY SENDS EMAIL with the report link.
 * 
 * Prerequisites:
 * - Enable "Admin SDK API" in Apps Script Services.
 * - Enable "Admin License Manager API" in Apps Script Services.
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
    INACTIVITY_DAYS: 365,

    // Email Configuration
    EMAIL_RECIPIENTS: 'praveenmannem5@gmail.com',
    EMAIL_SUBJECT: 'Inactive Enterprise Plus Users Audit Report',
    SEND_EMAIL: true // Set to false to disable email
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

    // 3. Filter for users who are BOTH inactive AND have the target license
    const targetUsers = [];

    inactiveUsers.forEach(user => {
        const userEmail = user.primaryEmail.toLowerCase();

        // Check if this user has licenses
        if (licenseMap[userEmail]) {
            const userLicenses = licenseMap[userEmail];

            // Check if they have the target SKU
            const hasTarget = userLicenses.some(l => l.skuId === CONFIG.TARGET_SKU_ID);

            if (hasTarget) {
                const licenseString = userLicenses.map(l => getSkuName(l.skuId)).join(', ');
                targetUsers.push({
                    ...user,
                    licenseString: licenseString
                });
            }
        }
    });

    Logger.log(`Found ${targetUsers.length} users with Target License and Inactive.`);

    // 4. Output to Spreadsheet
    if (targetUsers.length > 0) {
        exportToSheet(targetUsers);
    } else {
        Logger.log('No matching users found.');
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
 * Retrieves users who haven't logged in since the given date.
 * Includes BOTH inactive users AND users who have never logged in.
 */
function getInactiveUsers(cutoffDate) {
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
                const filtered = response.users.filter(user => {
                    // Include users who have NEVER logged in
                    if (!user.lastLoginTime) return true;
                    // Include users who haven't logged in for the specified period
                    const lastLogin = new Date(user.lastLoginTime);
                    return lastLogin.getTime() < cutoffDate.getTime();
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

    // Write in batches
    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }

    // Format the sheet for better readability
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

        // Create HTML email body
        const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #4285f4; border-bottom: 2px solid #4285f4; padding-bottom: 10px;">
              📊 Inactive Users Audit Report
            </h2>
            
            <p>Hello,</p>
            
            <p>The automated audit for inactive users has been completed.</p>
            
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
              This is an automated report generated by Google Apps Script.<br>
              Report generated on: ${currentDate}
            </p>
          </div>
        </body>
      </html>
    `;

        // Plain text version for email clients that don't support HTML
        const plainBody = `
Inactive Users Audit Report
===========================

Report Date: ${currentDate}
License Type: ${licenseName}
Inactivity Period: ${CONFIG.INACTIVITY_DAYS} days
Total Inactive Users Found: ${userCount}

View the full report here: ${reportUrl}

---
This is an automated report generated by Google Apps Script.
    `;

        // Send the email
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
 * Utility to get date N days ago.
 */
function getCutoffDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
}

/**
 * Formats a date string to a readable format.
 * @param {string} dateString - ISO date string from Google API
 * @returns {string} Formatted date string (e.g., "Nov 28, 2024, 10:30 PM")
 */
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
        return dateString; // Return original if formatting fails
    }
}
