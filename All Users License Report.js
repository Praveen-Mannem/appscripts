/**
 * Google Apps Script to list ALL users and their license types.
 *
 * INSTRUCTIONS:
 * 1. Create a new Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this code.
 * 4. Add Services (left sidebar):
 *    - AdminDirectory
 *    - AdminLicenseManager
 * 5. Run the 'exportAllUsersLicenses' function.
 */

const CONFIG = {
  customerId: 'my_customer', 
  productId: 'Google-Apps' 
};

// Map of common Google Workspace SKU IDs to Names
const SKU_MAP = {
  '1010020020': 'Google Workspace Enterprise Plus',
  '1010020026': 'Google Workspace Enterprise Standard',
  '1010020027': 'Google Workspace Business Starter',
  '1010020028': 'Google Workspace Business Standard',
  '1010020025': 'Google Workspace Business Plus',
  '1010060001': 'Google Workspace Essentials',
  '1010060003': 'Google Workspace Enterprise Essentials',
  '1010020029': 'Google Workspace Enterprise Essentials Plus',
  '1010020010': 'Google Workspace Frontline',
  '1010010001': 'G Suite Basic',
  '1010050001': 'G Suite Business',
  '1010310002': 'Cloud Identity Free',
  '1010310003': 'Cloud Identity Premium'
};

function exportAllUsersLicenses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'All Users Licenses';
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }
  
  // Set Headers
  sheet.appendRow([
    'Email', 
    'Full Name', 
    'Status', 
    'License Name', 
    'License SKU ID'
  ]);
  
  // Format header row
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e6f7ff');
  
  Logger.log('Starting export of all users...');
  
  let pageToken;
  let totalProcessed = 0;
  
  do {
    // List users
    const response = AdminDirectory.Users.list({
      customer: CONFIG.customerId,
      maxResults: 200,
      pageToken: pageToken,
      orderBy: 'email',
      projection: 'full'
    });
    
    const users = response.users;
    
    if (users && users.length > 0) {
      const rows = [];
      
      for (const user of users) {
        totalProcessed++;
        
        const status = user.suspended ? 'SUSPENDED' : 'ACTIVE';
        
        // Fetch License
        const licenseInfo = getUserLicense(user.primaryEmail);
        
        rows.push([
          user.primaryEmail,
          user.name ? user.name.fullName : '',
          status,
          licenseInfo.name,
          licenseInfo.skuId
        ]);
      }
      
      // Write batch to sheet
      if (rows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      }
    }
    
    pageToken = response.nextPageToken;
  } while (pageToken);
  
  Logger.log(`Finished. Processed ${totalProcessed} users.`);
  Browser.msgBox(`Process Complete. Listed ${totalProcessed} users.`);
}

/**
 * Helper to get the license for a specific user.
 */
function getUserLicense(userEmail) {
  try {
    const response = AdminLicenseManager.LicenseAssignments.listForProduct(
      CONFIG.productId, 
      CONFIG.customerId, 
      {
        userId: userEmail
      }
    );
    
    if (response.items && response.items.length > 0) {
      const skuId = response.items[0].skuId;
      const name = SKU_MAP[skuId] || 'Unknown SKU (' + skuId + ')';
      return { skuId: skuId, name: name };
    }
    
    return { skuId: 'None', name: 'No License Assigned' };
    
  } catch (e) {
    Logger.log(`Error fetching license for ${userEmail}: ${e.message}`);
    return { skuId: 'Error', name: 'Error: ' + e.message };
  }
}
