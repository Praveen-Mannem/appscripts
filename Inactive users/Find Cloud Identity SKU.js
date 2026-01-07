/**
 * DIAGNOSTIC SCRIPT - Find the correct Cloud Identity Free SKU ID
 * 
 * This script helps you find the exact SKU ID for Cloud Identity Free
 * in your Google Workspace organization.
 * 
 * Run the function: findCloudIdentitySKU()
 */

/**
 * Main diagnostic function to find Cloud Identity SKU
 */
function findCloudIdentitySKU() {
    Logger.log('=== FINDING CLOUD IDENTITY FREE SKU ID ===');

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

        Logger.log(`\n=== METHOD 1: TRYING COMMON CLOUD IDENTITY SKU IDS ===`);

        // Common Cloud Identity SKU IDs to try
        const cloudIdentitySKUs = {
            '1010010001': 'Cloud Identity Free (standard)',
            '1010050001': 'Cloud Identity Premium',
            '1010010002': 'Cloud Identity Free (alternate)',
            '101001': 'Cloud Identity Free (short form)',
            '1010020034': 'Cloud Identity Free (new)',
        };

        Logger.log(`\nTrying to assign each SKU to find which one works...`);

        for (const [skuId, skuName] of Object.entries(cloudIdentitySKUs)) {
            Logger.log(`\nTesting SKU: ${skuId} (${skuName})`);

            // Try to list users with this SKU
            try {
                const result = AdminLicenseManager.LicenseAssignments.listForProductAndSku(
                    'Google-Apps',
                    skuId,
                    customerId,
                    { maxResults: 1 }
                );

                if (result.items && result.items.length > 0) {
                    Logger.log(`  ✅ FOUND! This SKU exists and is assigned to users!`);
                    Logger.log(`  SKU ID: ${skuId}`);
                    Logger.log(`  SKU Name: ${result.items[0].skuName || skuName}`);
                    Logger.log(`  Sample User: ${result.items[0].userId}`);
                    Logger.log(`\n  >>> USE THIS SKU ID: ${skuId} <<<`);
                } else {
                    Logger.log(`  ⚠️ SKU exists but no users assigned yet`);
                }
            } catch (e) {
                Logger.log(`  ❌ SKU not found or not available: ${e.message}`);
            }
        }

        Logger.log(`\n=== METHOD 2: MANUAL ASSIGNMENT TEST ===`);
        Logger.log(`\nTo find the correct SKU ID:`);
        Logger.log(`1. Go to Google Admin Console > Directory > Users`);
        Logger.log(`2. Select a test user`);
        Logger.log(`3. Click "Licenses" and assign "Cloud Identity Free"`);
        Logger.log(`4. Run checkCloudIdentityFreeLicenses() again`);
        Logger.log(`5. The SKU ID will appear in the output`);

        Logger.log(`\n=== METHOD 3: CHECK GOOGLE DOCUMENTATION ===`);
        Logger.log(`Visit: https://developers.google.com/admin-sdk/licensing/v1/how-tos/products`);
        Logger.log(`Look for "Cloud Identity" products and their SKU IDs`);

    } catch (e) {
        Logger.log(`\n❌ Unexpected error: ${e.message}`);
    }

    Logger.log(`\n=== DIAGNOSTIC COMPLETE ===`);
}

/**
 * Helper function to test a specific SKU ID
 * Usage: testSpecificSKU('1010010001')
 */
function testSpecificSKU(skuId) {
    Logger.log(`=== TESTING SKU ID: ${skuId} ===`);

    try {
        let customerId = 'my_customer';
        try {
            const customer = AdminDirectory.Customers.get('my_customer');
            customerId = customer.id;
        } catch (e) {
            Logger.log(`Warning: ${e.message}`);
        }

        // Try to list assignments
        const result = AdminLicenseManager.LicenseAssignments.listForProductAndSku(
            'Google-Apps',
            skuId,
            customerId,
            { maxResults: 5 }
        );

        if (result.items && result.items.length > 0) {
            Logger.log(`\n✅ SKU ${skuId} is valid!`);
            Logger.log(`SKU Name: ${result.items[0].skuName}`);
            Logger.log(`Users with this license: ${result.items.length}`);
            result.items.forEach((item, i) => {
                Logger.log(`  ${i + 1}. ${item.userId}`);
            });
        } else {
            Logger.log(`\n⚠️ SKU ${skuId} exists but no users assigned`);
        }
    } catch (e) {
        Logger.log(`\n❌ SKU ${skuId} not found: ${e.message}`);
    }
}
