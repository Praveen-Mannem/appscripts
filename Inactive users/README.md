# Google Workspace Inactive Users Audit Scripts

Comprehensive Google Apps Scripts for auditing and managing inactive Google Workspace users with advanced features including OU path tracking, Shared Drive integration, and automated reporting.

## 📋 Table of Contents

- [Features](#features)
- [Scripts Overview](#scripts-overview)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Configuration](#configuration)
- [Usage](#usage)
- [Output](#output)
- [Functions Reference](#functions-reference)
- [Troubleshooting](#troubleshooting)

## ✨ Features

### Core Features
- ✅ **Inactive User Detection** - Identifies users who haven't logged in for 180 or 365 days
- ✅ **License-Based Filtering** - Targets specific license types (e.g., Enterprise Plus)
- ✅ **Hybrid Login Tracking** - Uses both Reports API and Directory API for accurate login data
- ✅ **Automated Email Reports** - Sends formatted HTML email notifications
- ✅ **Google Sheets Export** - Generates detailed spreadsheet reports

### Advanced Features
- ✅ **OU Path Tracking** - Shows organizational unit for each user
- ✅ **Shared Drive Auto-Save** - Automatically saves reports to Shared Drive folders
- ✅ **Automated Scheduling** - Optional monthly trigger for hands-free operation
- ✅ **Batch Processing** - Efficiently handles large user bases
- ✅ **Error Handling** - Comprehensive error logging and recovery

## 📁 Scripts Overview

### 1. Inactive Users Audit (180 Days) - Auto Run
**File:** `Inactive users 180 days - Auto Run.js`

**Description:** 
Audits users with specific licenses who have been inactive for 180+ days. Includes automated monthly trigger functionality.

**Key Functions:**
- `auditInactiveEnterpriseUsers()` - Main audit function
- `setupMonthlyTrigger()` - Sets up automatic monthly execution
- `getAllLicenseAssignments()` - Fetches all license data
- `getInactiveUsers()` - Identifies inactive users using hybrid approach
- `exportToSheet()` - Creates and saves spreadsheet report
- `moveToSharedDrive()` - Moves report to Shared Drive folder

**Best For:** Automated, recurring audits

### 2. Inactive Users Audit (180 Days) - With Email
**File:** `Inactive users 180 days - With Email.js`

**Description:** 
Same functionality as auto-run version but designed for manual execution with email notifications.

**Key Functions:**
- `auditInactiveEnterpriseUsers()` - Main audit function
- `sendEmailReport()` - Sends HTML email with report link
- `getLoginActivityFromReports()` - Fetches login data from Reports API
- `exportToSheet()` - Creates spreadsheet with OU path column

**Best For:** On-demand audits with email notifications

### 3. Inactive Users Audit (365 Days)
**File:** `Inactive users 365 days - With Email.js`

**Description:** 
Audits users with specific licenses who have been inactive for 365+ days (one full year).

**Key Functions:**
- Same as 180-day version but with 365-day threshold
- Useful for identifying severely inactive accounts

**Best For:** Annual reviews and license reclamation

## 🔧 Prerequisites

### Required APIs
Enable these in Google Cloud Console:
1. **Admin SDK API** - For user directory access
2. **Admin License Manager API** - For license information
3. **Admin Reports API** - For login activity tracking
4. **Google Drive API** - For Shared Drive integration

### Required Permissions
- **Super Admin** privileges in Google Workspace
- **Edit access** to target Shared Drive folder (if using auto-save)

### OAuth Scopes
The following scopes are automatically configured in `appsscript.json`:
```
https://www.googleapis.com/auth/admin.directory.user.readonly
https://www.googleapis.com/auth/admin.directory.user
https://www.googleapis.com/auth/admin.directory.customer.readonly
https://www.googleapis.com/auth/apps.licensing
https://www.googleapis.com/auth/admin.reports.audit.readonly
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/script.send_mail
https://www.googleapis.com/auth/drive
```

## 🚀 Setup Instructions

### Step 1: Create GCP Project and Enable APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable the following APIs:
   - Admin SDK API
   - Google Workspace License Manager API
   - Admin Reports API
   - Google Drive API

### Step 2: Link GCP Project to Apps Script

1. Open your Apps Script project
2. Go to **Project Settings** (⚙️ icon)
3. Under **Google Cloud Platform (GCP) Project**, click **Change project**
4. Enter your GCP project number
5. Click **Set project**

### Step 3: Configure the Script

Edit the `CONFIG` object at the top of each script:

```javascript
const CONFIG = {
    // Target license SKU ID
    TARGET_SKU_ID: '1010020020',  // Enterprise Plus
    PRODUCT_ID: 'Google-Apps',
    INACTIVITY_DAYS: 180,  // or 365

    // Email Configuration
    EMAIL_RECIPIENTS: 'admin@example.com, manager@example.com',
    EMAIL_SUBJECT: 'Inactive Users Audit Report',
    SEND_EMAIL: true,

    // Shared Drive Configuration
    SHARED_DRIVE_FOLDER_ID: '0AA7GGQkHedVoUk9PVA'  // Your folder ID
};
```

### Step 4: Authorize the Script

1. Remove old authorizations from [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
2. In Apps Script, run any function
3. Click **Review Permissions**
4. Select your Super Admin account
5. Click **Advanced** → **Go to [project name] (unsafe)**
6. Click **Allow** for all permissions

## ⚙️ Configuration

### License SKU IDs

Common Google Workspace SKU IDs:

| License Type | SKU ID |
|--------------|--------|
| Enterprise Plus | 1010020020 |
| Enterprise Standard | 1010020028 |
| Business Starter | 1010020027 |
| Business Standard | 1010020028 |
| Business Plus | 1010020025 |
| Enterprise Essentials | 1010060003 |

### Shared Drive Setup

To enable auto-save to Shared Drive:

1. Open your Shared Drive folder in Google Drive
2. Copy the folder ID from the URL:
   ```
   https://drive.google.com/drive/folders/[FOLDER_ID]
   ```
3. Paste the folder ID into `SHARED_DRIVE_FOLDER_ID` in CONFIG
4. Ensure you have edit access to the folder

### Email Configuration

Configure multiple recipients:
```javascript
EMAIL_RECIPIENTS: 'admin@example.com, hr@example.com, manager@example.com'
```

Disable email notifications:
```javascript
SEND_EMAIL: false
```

## 📊 Usage

### Manual Execution

1. Open Apps Script editor
2. Select function: `auditInactiveEnterpriseUsers`
3. Click **Run** (▶️)
4. Check **Execution log** for results
5. Open the generated spreadsheet from the log

### Automated Execution (180 Days Auto Run only)

Set up monthly trigger:
```javascript
setupMonthlyTrigger()
```

This creates a trigger that runs the audit automatically every 30 days.

### Expected Execution Log

```
Auditing users inactive since: 2025-06-22T15:54:14.425Z
Fetched Canonical Customer ID: C0157edvu
Fetching all license assignments for SKU: 1010020020...
Found 3 users with licenses.
Fetching login activity from Reports API...
Reports API: Found 422 login activities for 6 unique users
Reports API provided login data for 6 users
Found 4 inactive users.
Found 0 users with Target License and Inactive.
Spreadsheet moved to Shared Drive folder: Audit Reports
Report generated: https://docs.google.com/spreadsheets/d/...
Email sent successfully to: admin@example.com
Execution completed
```

## 📈 Output

### Spreadsheet Columns

The generated spreadsheet includes 7 columns:

| Column | Description | Example |
|--------|-------------|---------|
| **Name** | User's full name | John Doe |
| **Email** | User's email address | john@test.cswg.com |
| **OU Path** | Organizational Unit path | /Sales/APAC |
| **Last Login Time** | When they last logged in | 2024-01-15 |
| **Creation Time** | When account was created | 2020-03-10 |
| **Suspended** | Account suspension status | false |
| **Licenses** | Assigned licenses | Enterprise Plus |

### Email Report

HTML-formatted email includes:
- Report date and time
- License type being audited
- Inactivity period (180 or 365 days)
- Total inactive users found
- Direct link to spreadsheet report

## 🔍 Functions Reference

### Main Functions

#### `auditInactiveEnterpriseUsers()`
Main audit function that orchestrates the entire process.

**Process:**
1. Calculates cutoff date based on inactivity period
2. Fetches canonical customer ID
3. Retrieves all license assignments
4. Gets login activity from Reports API
5. Lists all users and filters inactive ones
6. Matches inactive users with target licenses
7. Exports results to spreadsheet
8. Sends email notification (if enabled)

#### `getAllLicenseAssignments(productId, customerId)`
Fetches all license assignments for a product.

**Parameters:**
- `productId` - Product ID (e.g., 'Google-Apps')
- `customerId` - Customer ID or 'my_customer'

**Returns:** Map of user emails to license arrays

#### `getLoginActivityFromReports(cutoffDate)`
Retrieves login activity from Reports API.

**Parameters:**
- `cutoffDate` - Date threshold for activity

**Returns:** Map of user emails to last login timestamps

**Note:** Reports API only keeps 180 days of data

#### `getInactiveUsers(cutoffDate)`
Identifies inactive users using hybrid approach.

**Process:**
1. Gets login data from Reports API
2. Lists all users from Directory API
3. Checks both sources for recent activity
4. Returns users inactive since cutoff date

**Returns:** Array of inactive user objects

#### `exportToSheet(users)`
Creates spreadsheet and moves to Shared Drive.

**Parameters:**
- `users` - Array of user objects to export

**Actions:**
1. Creates new spreadsheet
2. Adds headers and data
3. Formats the sheet
4. Moves to Shared Drive (if configured)
5. Logs spreadsheet URL

#### `moveToSharedDrive(spreadsheet)`
Moves spreadsheet to configured Shared Drive folder.

**Parameters:**
- `spreadsheet` - Spreadsheet object to move

**Error Handling:**
- Validates folder ID exists
- Checks folder accessibility
- Logs detailed error messages

#### `sendEmailReport(reportUrl, userCount)`
Sends HTML email with report link.

**Parameters:**
- `reportUrl` - URL of generated spreadsheet
- `userCount` - Number of inactive users found

### Utility Functions

#### `getCutoffDate(daysAgo)`
Calculates date N days in the past.

#### `getSkuName(skuId)`
Converts SKU ID to friendly license name.

#### `setupMonthlyTrigger()` (Auto Run only)
Creates time-based trigger for monthly execution.

### Diagnostic Functions

#### `checkAuthorizedScopes()`
Tests API authorization and permissions.

**Tests:**
- OAuth token retrieval
- Admin Directory API (Customer)
- Admin Directory API (Users.list)
- License Manager API

#### `debugSpecificUser(userEmail)`
Checks login data for a specific user.

**Parameters:**
- `userEmail` - Email address to debug

**Outputs:**
- Directory API data
- Reports API login events
- Comparison of data sources

## 🔧 Troubleshooting

### "Not Authorized to access this resource/api"

**Solution:**
1. Verify Super Admin privileges
2. Check APIs are enabled in GCP
3. Remove old authorizations
4. Re-authorize script with all scopes

### "Spreadsheet not moving to Shared Drive"

**Check:**
- Folder ID is correct
- You have edit access to folder
- Drive API scope is authorized
- Execution log for specific error

### "No users returned"

**Possible causes:**
- All users are active
- License filter too restrictive
- OU filtering (if customized)

**Debug:**
- Run `checkAuthorizedScopes()`
- Check execution log for API errors
- Verify license SKU ID is correct

### "Reports API error"

**Note:** Reports API only keeps 180 days of data

**For 365-day audits:**
- Script falls back to Directory API data
- May be less accurate for older logins

## 📝 Notes

- **Performance:** Scripts handle large user bases efficiently with batch processing
- **Rate Limits:** Includes delays to avoid API quota limits
- **Data Accuracy:** Hybrid approach ensures most accurate login data
- **Privacy:** Only accesses data necessary for audit purposes
- **Compatibility:** Works with all Google Workspace editions

## 🔄 Recent Updates

- ✅ Fixed authorization issues by removing `viewType: 'domain_public'` parameter
- ✅ Added OU Path column to spreadsheet output
- ✅ Implemented Shared Drive auto-save feature
- ✅ Added comprehensive error handling and logging
- ✅ Updated to export all inactive users (not just those with target license)

## 📞 Support

For issues or questions:
1. Check execution log for detailed error messages
2. Run diagnostic functions (`checkAuthorizedScopes`, `debugSpecificUser`)
3. Review troubleshooting section above
4. Verify all prerequisites are met

## 📄 License

These scripts are provided as-is for Google Workspace administration purposes.
