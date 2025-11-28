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
  INACTIVITY_DAYS: 365
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
 * Retrives users who haven't logged in since the given date.
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
          if (!user.lastLoginTime) return true;
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
 * Exports the list of users to a new Google Sheet.
 */
function exportToSheet(users) {
  const ss = SpreadsheetApp.create('Inactive Enterprise Plus Users Audit');
  const sheet = ss.getActiveSheet();

  // Headers
  sheet.appendRow(['Name', 'Email', 'Last Login Time', 'Creation Time', 'Suspended', 'Licenses']);

  // Data
  const rows = users.map(user => [
    user.name ? user.name.fullName : 'N/A',
    user.primaryEmail,
    user.lastLoginTime || 'Never',
    user.creationTime,
    user.suspended,
    user.licenseString
  ]);

  // Write in batches
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  Logger.log(`Report generated: ${ss.getUrl()}`);
}

/**
 * Utility to get date N days ago.
 */
function getCutoffDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}
