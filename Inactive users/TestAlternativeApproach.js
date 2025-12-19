/**
 * Test function to try alternative parameters for Users.list API
 * This tests if using 'domain' parameter works instead of 'customer'
 */
function testAlternativeUsersListApproach() {
    Logger.log('=== TESTING ALTERNATIVE APPROACHES ===');

    // Test 1: Try with domain parameter
    Logger.log('\n--- Test 1: Using domain parameter ---');
    try {
        const response1 = AdminDirectory.Users.list({
            domain: 'test.cswg.com',  // Replace with your actual domain
            maxResults: 1
        });

        if (response1.users && response1.users.length > 0) {
            Logger.log('✅ SUCCESS with domain parameter!');
            Logger.log('   Found user: ' + response1.users[0].primaryEmail);
        } else {
            Logger.log('⚠️ API call succeeded but no users returned');
        }
    } catch (e) {
        Logger.log('❌ FAILED with domain parameter');
        Logger.log('   Error: ' + e.message);
    }

    // Test 2: Try with customer parameter (current approach)
    Logger.log('\n--- Test 2: Using customer parameter ---');
    try {
        const response2 = AdminDirectory.Users.list({
            customer: 'my_customer',
            maxResults: 1
        });

        if (response2.users && response2.users.length > 0) {
            Logger.log('✅ SUCCESS with customer parameter!');
            Logger.log('   Found user: ' + response2.users[0].primaryEmail);
        } else {
            Logger.log('⚠️ API call succeeded but no users returned');
        }
    } catch (e) {
        Logger.log('❌ FAILED with customer parameter');
        Logger.log('   Error: ' + e.message);
    }

    // Test 3: Try with viewType parameter variations
    Logger.log('\n--- Test 3: Using admin_view instead of domain_public ---');
    try {
        const response3 = AdminDirectory.Users.list({
            customer: 'my_customer',
            maxResults: 1,
            viewType: 'admin_view'  // Try admin_view instead of domain_public
        });

        if (response3.users && response3.users.length > 0) {
            Logger.log('✅ SUCCESS with admin_view!');
            Logger.log('   Found user: ' + response3.users[0].primaryEmail);
        } else {
            Logger.log('⚠️ API call succeeded but no users returned');
        }
    } catch (e) {
        Logger.log('❌ FAILED with admin_view');
        Logger.log('   Error: ' + e.message);
    }

    // Test 4: Try getting a specific user instead of listing
    Logger.log('\n--- Test 4: Getting specific user instead of listing ---');
    try {
        // Try to get your own user account
        const response4 = AdminDirectory.Users.get('pmannem@test.cswg.com');  // Replace with your email

        Logger.log('✅ SUCCESS getting specific user!');
        Logger.log('   User: ' + response4.primaryEmail);
        Logger.log('   Last Login: ' + (response4.lastLoginTime || 'Not provided'));
    } catch (e) {
        Logger.log('❌ FAILED getting specific user');
        Logger.log('   Error: ' + e.message);
    }

    Logger.log('\n=== TEST COMPLETE ===');
}

/**
 * Check what scopes are currently authorized
 */
function checkCurrentScopes() {
    try {
        const token = ScriptApp.getOAuthToken();
        Logger.log('OAuth Token obtained (first 30 chars): ' + token.substring(0, 30) + '...');

        // Try to introspect the token (this won't work directly, but we can try)
        Logger.log('\nCurrent script requires these scopes:');
        Logger.log('- https://www.googleapis.com/auth/admin.directory.user.readonly');
        Logger.log('- https://www.googleapis.com/auth/admin.directory.user');
        Logger.log('- https://www.googleapis.com/auth/admin.directory.customer.readonly');
        Logger.log('- https://www.googleapis.com/auth/apps.licensing');
        Logger.log('- https://www.googleapis.com/auth/admin.reports.audit.readonly');

    } catch (e) {
        Logger.log('Error getting OAuth token: ' + e.message);
    }
}
