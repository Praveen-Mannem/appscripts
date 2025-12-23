/**
 * @OnlyCurrentDoc false
 */

/**
 * DIAGNOSTIC & DEBUGGING FUNCTIONS
 * 
 * This file contains helper functions for troubleshooting and debugging
 * the Inactive Users Audit script.
 * 
 * These functions are NOT required for normal operation.
 * Use them when you need to:
 * - Debug why a specific user shows incorrect login data
 * - Test API authorization and permissions
 * - Investigate data discrepancies
 * 
 * OAuth Scopes Required:
 * @scope https://www.googleapis.com/auth/admin.directory.user.readonly
 * @scope https://www.googleapis.com/auth/admin.reports.audit.readonly
 */

/**
 * DIAGNOSTIC FUNCTION - Check specific user's login data
 * This helps debug why certain users show incorrect login times
 * 
 * HOW TO USE:
 * 1. Open the Apps Script editor
 * 2. Select this function from the dropdown
 * 3. Click Run
 * 4. When prompted, enter the user's email address
 * 
 * EXAMPLE:
 * debugSpecificUser('john.doe@company.com')
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
 * 
 * HOW TO USE:
 * 1. Open the Apps Script editor
 * 2. Select this function from the dropdown
 * 3. Click Run
 * 4. Check the logs for API status
 * 
 * WHAT IT CHECKS:
 * - OAuth token validity
 * - Admin Directory API (Customer)
 * - Admin Directory API (Users.list)
 * - License Manager API
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

    // Test Reports API
    try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        const activities = AdminReports.Activities.list('all', 'login', {
            startTime: yesterday.toISOString(),
            endTime: now.toISOString(),
            maxResults: 1
        });

        Logger.log('✅ Admin Reports API is working!');
        if (activities.items && activities.items.length > 0) {
            Logger.log('   Found recent login activities');
        }
    } catch (e) {
        Logger.log('❌ Admin Reports API failed: ' + e.message);
    }

    Logger.log('=== DIAGNOSTIC COMPLETE ===');
    Logger.log('');
    Logger.log('NEXT STEPS:');
    Logger.log('1. If any API failed: Check that it\'s enabled in Apps Script Services');
    Logger.log('2. Remove old authorization from myaccount.google.com/permissions');
    Logger.log('3. Enable APIs in Google Cloud Console if needed');
    Logger.log('4. Re-authorize the script');
}

/**
 * DIAGNOSTIC FUNCTION - Test license lookup for a specific user
 * 
 * @param {string} userEmail - Email address of the user to check
 */
function debugUserLicense(userEmail) {
    Logger.log(`=== CHECKING LICENSE FOR: ${userEmail} ===`);

    try {
        const customer = AdminDirectory.Customers.get('my_customer');
        const customerId = customer.id;

        Logger.log(`Customer ID: ${customerId}`);

        // Get all licenses for this user
        const licenses = AdminLicenseManager.LicenseAssignments.listForProduct(
            'Google-Apps',
            customerId,
            { maxResults: 1000 }
        );

        const userLicenses = licenses.items.filter(item =>
            item.userId.toLowerCase() === userEmail.toLowerCase()
        );

        if (userLicenses.length > 0) {
            Logger.log(`\n✅ Found ${userLicenses.length} license(s):`);
            userLicenses.forEach((license, index) => {
                Logger.log(`\n${index + 1}. SKU ID: ${license.skuId}`);
                Logger.log(`   SKU Name: ${license.skuName || 'N/A'}`);
                Logger.log(`   Product ID: ${license.productId}`);
            });
        } else {
            Logger.log('\n⚠️ No licenses found for this user');
        }

    } catch (e) {
        Logger.log(`❌ Error: ${e.message}`);
    }

    Logger.log('\n=== DIAGNOSTIC COMPLETE ===');
}

/**
 * DIAGNOSTIC FUNCTION - Compare Directory API vs Reports API login data
 * This helps understand discrepancies between the two data sources
 * 
 * @param {string} userEmail - Email address of the user to check
 */
function compareLoginDataSources(userEmail) {
    Logger.log(`=== COMPARING LOGIN DATA SOURCES FOR: ${userEmail} ===`);

    let directoryLastLogin = null;
    let reportsLastLogin = null;

    // 1. Get Directory API data
    try {
        const user = AdminDirectory.Users.get(userEmail);
        directoryLastLogin = user.lastLoginTime;
        Logger.log('\n--- Directory API ---');
        Logger.log(`Last Login Time: ${directoryLastLogin || 'NOT PROVIDED'}`);
    } catch (e) {
        Logger.log(`❌ Directory API Error: ${e.message}`);
    }

    // 2. Get Reports API data (last 30 days)
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

        const activities = AdminReports.Activities.list('user', 'login', {
            userKey: userEmail,
            startTime: thirtyDaysAgo.toISOString(),
            endTime: now.toISOString(),
            maxResults: 1
        });

        Logger.log('\n--- Reports API (Last 30 Days) ---');
        if (activities.items && activities.items.length > 0) {
            reportsLastLogin = activities.items[0].id.time;
            Logger.log(`Last Login Time: ${reportsLastLogin}`);
        } else {
            Logger.log('No login events found in last 30 days');
        }
    } catch (e) {
        Logger.log(`❌ Reports API Error: ${e.message}`);
    }

    // 3. Compare results
    Logger.log('\n--- COMPARISON ---');
    if (directoryLastLogin && reportsLastLogin) {
        const dirDate = new Date(directoryLastLogin);
        const repDate = new Date(reportsLastLogin);
        const diffMs = Math.abs(dirDate - repDate);
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        Logger.log(`Time difference: ${diffHours} hours`);

        if (diffHours > 24) {
            Logger.log('⚠️ WARNING: Significant difference detected!');
            Logger.log('   Reports API is more accurate for recent logins.');
        } else {
            Logger.log('✅ Data sources are consistent');
        }
    } else if (!directoryLastLogin && !reportsLastLogin) {
        Logger.log('⚠️ Both sources show no login data');
    } else {
        Logger.log('⚠️ Data sources have different availability');
    }

    Logger.log('\n=== DIAGNOSTIC COMPLETE ===');
}
