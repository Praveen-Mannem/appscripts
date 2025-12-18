/**
 * @OnlyCurrentDoc false
 */

/**
 * OAuth Scopes - These are required for the script to access Google Workspace APIs
 * Google Apps Script will automatically request these permissions when you run the script
 * 
 * @scope https://www.googleapis.com/auth/admin.directory.group.readonly
 * @scope https://www.googleapis.com/auth/admin.directory.group.member.readonly
 * @scope https://www.googleapis.com/auth/spreadsheets
 * @scope https://www.googleapis.com/auth/script.scriptapp
 */

/**
 * Google Workspace Groups Audit Script - BATCH PROCESSING VERSION
 * 
 * Purpose:
 * Identifies Google Workspace groups that are missing OWNERS and/or MANAGERS.
 * Designed for LARGE organizations with 5,000+ groups.
 * 
 * How It Works:
 * - Processes groups in batches of 500 (configurable)
 * - Uses Script Properties to track progress between runs
 * - Can be run manually multiple times or scheduled with triggers
 * - Combines all results into a single spreadsheet
 * 
 * Prerequisites:
 * - Enable "Admin SDK API" in Apps Script Services.
 * - Run this script with a Google Workspace Super Admin account.
 */

// Configuration
const CONFIG = {
    // Batch processing settings
    BATCH_SIZE: 500,            // Process 500 groups per run (adjust based on your needs)
    DELAY_BETWEEN_GROUPS: 100,  // Milliseconds delay between group checks
    MAX_EXECUTION_TIME: 300,    // Maximum execution time in seconds (5 minutes)

    // Spreadsheet settings
    SPREADSHEET_ID: '',         // Leave empty to create new, or paste existing spreadsheet ID to append

    // Email Configuration
    EMAIL_RECIPIENTS: 'email1@example.com, email2@example.com',
    EMAIL_SUBJECT: 'Groups Without Owners/Managers Audit Report',
    SEND_EMAIL: false,          // Set to true to enable email notifications
    EMAIL_ON_COMPLETE_ONLY: true // Only send email when entire audit is complete
};

/**
 * MAIN FUNCTION - Run this to start or continue the audit
 * Can be run multiple times - it will automatically resume where it left off
 */
function auditGroupsWithoutOwners() {
    const scriptProps = PropertiesService.getScriptProperties();
    const startTime = new Date().getTime();

    Logger.log('=== BATCH PROCESSING GROUP OWNERSHIP AUDIT ===');

    // Get all groups (cached if available)
    const allGroups = getAllGroups();
    const totalGroups = allGroups.length;
    Logger.log(`Total groups in domain: ${totalGroups}`);

    // Get current progress
    let processedIndex = parseInt(scriptProps.getProperty('processedIndex') || '0');
    let allResults = JSON.parse(scriptProps.getProperty('auditResults') || '[]');

    Logger.log(`Resuming from group ${processedIndex + 1}/${totalGroups}`);
    Logger.log(`Previously found ${allResults.length} groups with issues\n`);

    // Calculate batch range
    const batchStart = processedIndex;
    const batchEnd = Math.min(processedIndex + CONFIG.BATCH_SIZE, totalGroups);
    const batchGroups = allGroups.slice(batchStart, batchEnd);

    Logger.log(`Processing batch: Groups ${batchStart + 1} to ${batchEnd}`);
    Logger.log(`Batch size: ${batchGroups.length} groups\n`);

    // Process this batch
    let batchResults = [];
    let currentIndex = 0;

    for (let i = 0; i < batchGroups.length; i++) {
        const group = batchGroups[i];

        // Check execution time limit
        const elapsedTime = (new Date().getTime() - startTime) / 1000;
        if (elapsedTime > CONFIG.MAX_EXECUTION_TIME) {
            Logger.log(`\n⚠️ Time limit reached. Saving progress...`);
            break;
        }

        currentIndex = i + 1;

        // Log progress
        if (currentIndex % 10 === 0) {
            const overallProgress = batchStart + currentIndex;
            Logger.log(`Progress: ${currentIndex}/${batchGroups.length} (Overall: ${overallProgress}/${totalGroups}) - ${elapsedTime.toFixed(0)}s`);
        }

        // Check for both OWNER and MANAGER roles
        const hasOwner = checkGroupHasRole(group.email, 'OWNER');
        const hasManager = checkGroupHasRole(group.email, 'MANAGER');

        // If missing either role, add to results
        if (!hasOwner || !hasManager) {
            const missingRoles = [];
            if (!hasOwner) missingRoles.push('OWNER');
            if (!hasManager) missingRoles.push('MANAGER');

            batchResults.push({
                groupName: group.name,
                groupEmail: group.email,
                description: group.description || 'N/A',
                directMembersCount: group.directMembersCount || 0,
                adminCreated: group.adminCreated || false,
                hasOwner: hasOwner,
                hasManager: hasManager,
                missingRoles: missingRoles.join(', ')
            });
        }

        // Add delay to avoid rate limiting
        Utilities.sleep(CONFIG.DELAY_BETWEEN_GROUPS);
    }

    // Combine with previous results
    allResults = allResults.concat(batchResults);
    processedIndex = batchStart + currentIndex;

    // Save progress
    scriptProps.setProperty('processedIndex', processedIndex.toString());
    scriptProps.setProperty('auditResults', JSON.stringify(allResults));

    const totalTime = ((new Date().getTime() - startTime) / 1000).toFixed(1);
    Logger.log(`\n=== BATCH COMPLETE ===`);
    Logger.log(`Batch time: ${totalTime} seconds`);
    Logger.log(`Processed: ${currentIndex}/${batchGroups.length} groups in this batch`);
    Logger.log(`Overall progress: ${processedIndex}/${totalGroups} groups (${((processedIndex / totalGroups) * 100).toFixed(1)}%)`);
    Logger.log(`Total groups with issues found so far: ${allResults.length}\n`);

    // Check if audit is complete
    if (processedIndex >= totalGroups) {
        Logger.log('🎉 AUDIT COMPLETE! Generating final report...\n');
        generateFinalReport(allResults, totalGroups);

        // Clear progress for next run
        scriptProps.deleteProperty('processedIndex');
        scriptProps.deleteProperty('auditResults');

        Logger.log('✅ Progress cleared. Ready for next audit.');
    } else {
        const remaining = totalGroups - processedIndex;
        const estimatedRuns = Math.ceil(remaining / CONFIG.BATCH_SIZE);
        Logger.log(`📊 STATUS: In Progress`);
        Logger.log(`Remaining: ${remaining} groups`);
        Logger.log(`Estimated runs needed: ${estimatedRuns}`);
        Logger.log(`\n▶️ Run this function again to continue, or set up a time-based trigger.`);
    }
}

/**
 * RESET FUNCTION - Clears all progress and starts fresh
 */
function resetAudit() {
    const scriptProps = PropertiesService.getScriptProperties();
    scriptProps.deleteProperty('processedIndex');
    scriptProps.deleteProperty('auditResults');
    scriptProps.deleteProperty('groupsCache');

    Logger.log('✅ Audit progress reset. Run auditGroupsWithoutOwners() to start fresh.');
}

/**
 * CHECK PROGRESS - View current audit status without processing
 */
function checkAuditProgress() {
    const scriptProps = PropertiesService.getScriptProperties();
    const processedIndex = parseInt(scriptProps.getProperty('processedIndex') || '0');
    const allResults = JSON.parse(scriptProps.getProperty('auditResults') || '[]');

    Logger.log('=== AUDIT PROGRESS ===');

    if (processedIndex === 0) {
        Logger.log('Status: Not started');
        Logger.log('Run auditGroupsWithoutOwners() to begin.');
    } else {
        const allGroups = getAllGroups();
        const totalGroups = allGroups.length;
        const percentComplete = ((processedIndex / totalGroups) * 100).toFixed(1);

        Logger.log(`Status: In Progress`);
        Logger.log(`Processed: ${processedIndex}/${totalGroups} groups (${percentComplete}%)`);
        Logger.log(`Groups with issues found: ${allResults.length}`);
        Logger.log(`Remaining: ${totalGroups - processedIndex} groups`);
        Logger.log(`\nRun auditGroupsWithoutOwners() to continue.`);
    }
}

/**
 * CREATE TRIGGER - Set up automatic batch processing
 * This will run the audit every 10 minutes until complete
 */
function createAutoBatchTrigger() {
    // Delete existing triggers first
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'auditGroupsWithoutOwners') {
            ScriptApp.deleteTrigger(trigger);
        }
    });

    // Create new trigger - runs every 10 minutes
    ScriptApp.newTrigger('auditGroupsWithoutOwners')
        .timeBased()
        .everyMinutes(10)
        .create();

    Logger.log('✅ Auto-batch trigger created!');
    Logger.log('The audit will run automatically every 10 minutes until complete.');
    Logger.log('Run deleteAutoBatchTrigger() to stop automatic processing.');
}

/**
 * DELETE TRIGGER - Stop automatic batch processing
 */
function deleteAutoBatchTrigger() {
    const triggers = ScriptApp.getProjectTriggers();
    let deleted = 0;

    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'auditGroupsWithoutOwners') {
            ScriptApp.deleteTrigger(trigger);
            deleted++;
        }
    });

    Logger.log(`✅ Deleted ${deleted} trigger(s). Automatic processing stopped.`);
}

/**
 * Fetches all groups in the domain (with caching)
 */
function getAllGroups() {
    const scriptProps = PropertiesService.getScriptProperties();

    // Try to get from cache first
    const cachedGroups = scriptProps.getProperty('groupsCache');
    if (cachedGroups) {
        Logger.log('Using cached groups list...');
        return JSON.parse(cachedGroups);
    }

    Logger.log('Fetching all groups from Admin Directory API...');
    const groups = [];
    let pageToken;

    do {
        try {
            const response = AdminDirectory.Groups.list({
                customer: 'my_customer',
                maxResults: 200,
                pageToken: pageToken
            });

            if (response.groups) {
                groups.push(...response.groups);
            }

            pageToken = response.nextPageToken;

            if (pageToken) {
                Utilities.sleep(100);
            }
        } catch (e) {
            Logger.log(`Error fetching groups: ${e.message}`);
            break;
        }
    } while (pageToken);

    // Cache the groups list
    scriptProps.setProperty('groupsCache', JSON.stringify(groups));
    Logger.log(`Fetched and cached ${groups.length} groups.`);

    return groups;
}

/**
 * Checks if a group has at least one member with the specified role
 */
function checkGroupHasRole(groupEmail, role) {
    let pageToken;

    do {
        try {
            const response = AdminDirectory.Members.list(groupEmail, {
                maxResults: 200,
                pageToken: pageToken,
                roles: role
            });

            if (response.members && response.members.length > 0) {
                return true;
            }

            pageToken = response.nextPageToken;
        } catch (e) {
            Logger.log(`Error checking members for ${groupEmail}: ${e.message}`);
            return false;
        }
    } while (pageToken);

    return false;
}

/**
 * Generates the final report when audit is complete
 */
function generateFinalReport(groups, totalGroupsScanned) {
    const timestamp = Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd HH:mm:ss');

    let ss, sheet;

    // Use existing spreadsheet or create new one
    if (CONFIG.SPREADSHEET_ID) {
        try {
            ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
            sheet = ss.getActiveSheet();
            sheet.clear(); // Clear existing data
            Logger.log('Using existing spreadsheet...');
        } catch (e) {
            Logger.log('Could not open existing spreadsheet, creating new one...');
            ss = SpreadsheetApp.create(`Groups Audit - ${Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd')}`);
            sheet = ss.getActiveSheet();
        }
    } else {
        ss = SpreadsheetApp.create(`Groups Audit - ${Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd')}`);
        sheet = ss.getActiveSheet();
    }

    // Add summary rows
    sheet.appendRow(['GROUPS WITHOUT OWNERS/MANAGERS - AUDIT REPORT']);
    sheet.appendRow([`Generated: ${timestamp}`]);
    sheet.appendRow([`Total Groups Scanned: ${totalGroupsScanned}`]);
    sheet.appendRow([`Groups with Issues: ${groups.length}`]);

    const noOwners = groups.filter(g => !g.hasOwner).length;
    const noManagers = groups.filter(g => !g.hasManager).length;
    const noBoth = groups.filter(g => !g.hasOwner && !g.hasManager).length;

    sheet.appendRow([`No Owners: ${noOwners} | No Managers: ${noManagers} | Missing Both: ${noBoth}`]);
    sheet.appendRow([]); // Empty row

    // Headers
    const headers = [
        'Group Name',
        'Group Email',
        'Description',
        'Member Count',
        'Has Owner?',
        'Has Manager?',
        'Missing Roles',
        'Admin Created'
    ];
    sheet.appendRow(headers);

    // Data
    if (groups.length > 0) {
        const rows = groups.map(group => [
            group.groupName,
            group.groupEmail,
            group.description,
            group.directMembersCount,
            group.hasOwner ? 'Yes' : 'No',
            group.hasManager ? 'Yes' : 'No',
            group.missingRoles,
            group.adminCreated ? 'Yes' : 'No'
        ]);

        sheet.getRange(7, 1, rows.length, headers.length).setValues(rows);
    }

    // Format the sheet
    sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
    sheet.getRange(2, 1).setFontStyle('italic');
    sheet.getRange(3, 1, 2, 1).setFontWeight('bold');
    sheet.getRange(5, 1).setFontWeight('bold').setFontColor('#d93025');

    const headerRange = sheet.getRange(6, 1, 1, headers.length);
    headerRange.setFontWeight('bold')
        .setBackground('#4285f4')
        .setFontColor('#ffffff')
        .setHorizontalAlignment('center');

    sheet.setFrozenRows(6);
    sheet.autoResizeColumns(1, headers.length);

    // Conditional formatting
    if (groups.length > 0) {
        const ownerRange = sheet.getRange(7, 5, groups.length, 1);
        const managerRange = sheet.getRange(7, 6, groups.length, 1);

        ownerRange.createTextFinder('No').matchEntireCell(true).findAll().forEach(cell => {
            cell.setFontColor('#d93025').setFontWeight('bold');
        });

        managerRange.createTextFinder('No').matchEntireCell(true).findAll().forEach(cell => {
            cell.setFontColor('#d93025').setFontWeight('bold');
        });
    }

    const reportUrl = ss.getUrl();
    Logger.log(`\n📊 FINAL REPORT: ${reportUrl}`);

    // Send email if configured
    if (CONFIG.SEND_EMAIL && CONFIG.EMAIL_RECIPIENTS) {
        sendEmailReport(reportUrl, groups.length, noOwners, noManagers, noBoth, totalGroupsScanned);
    }

    return reportUrl;
}

/**
 * Sends an email report with the spreadsheet link
 */
function sendEmailReport(reportUrl, totalIssues, noOwners, noManagers, noBoth, totalScanned) {
    try {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #4285f4; border-bottom: 2px solid #4285f4; padding-bottom: 10px;">
              📊 Groups Audit Report - COMPLETE
            </h2>
            
            <p>Hello,</p>
            
            <p>The batch processing audit for groups without proper ownership has been completed.</p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #555;">Report Summary</h3>
              <ul style="list-style: none; padding-left: 0;">
                <li><strong>Report Date:</strong> ${currentDate}</li>
                <li><strong>Total Groups Scanned:</strong> ${totalScanned}</li>
                <li><strong>Groups with Issues:</strong> <span style="color: #d93025; font-weight: bold;">${totalIssues}</span></li>
                <li><strong>Groups without OWNERS:</strong> <span style="color: #d93025;">${noOwners}</span></li>
                <li><strong>Groups without MANAGERS:</strong> <span style="color: #d93025;">${noManagers}</span></li>
                <li><strong>Groups missing BOTH:</strong> <span style="color: #d93025; font-weight: bold;">${noBoth}</span></li>
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
              This report was generated using batch processing for large organizations.<br>
              Report generated on: ${currentDate}
            </p>
          </div>
        </body>
      </html>
    `;

        const plainBody = `
Groups Audit Report - COMPLETE
================================

Report Date: ${currentDate}
Total Groups Scanned: ${totalScanned}
Groups with Issues: ${totalIssues}
Groups without OWNERS: ${noOwners}
Groups without MANAGERS: ${noManagers}
Groups missing BOTH: ${noBoth}

View the full report here: ${reportUrl}

---
This report was generated using batch processing for large organizations.
    `;

        MailApp.sendEmail({
            to: CONFIG.EMAIL_RECIPIENTS,
            subject: CONFIG.EMAIL_SUBJECT,
            body: plainBody,
            htmlBody: htmlBody
        });

        Logger.log(`📧 Email sent successfully to: ${CONFIG.EMAIL_RECIPIENTS}`);
    } catch (e) {
        Logger.log(`Error sending email: ${e.message}`);
    }
}
