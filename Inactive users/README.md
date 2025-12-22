# Google Workspace Inactive Users Audit Scripts

Automatically identify and report on inactive Google Workspace users with specific licenses.

## What This Script Does

This script helps you find users who:
- Have a specific Google Workspace license (like Enterprise Plus)
- Haven't logged in for 180 or 365 days
- Are taking up valuable licenses that could be reclaimed

**Output:**
- Creates a Google Spreadsheet with inactive user details
- Automatically saves to your Shared Drive
- Sends email notification with the report link

## Available Scripts

1. **Inactive users 180 days - Auto Run.js** - Runs automatically every month
2. **Inactive users 180 days - With Email.js** - Run manually when needed
3. **Inactive users 365 days - With Email.js** - For annual audits

## What You Need

### 1. Google Workspace Permissions
- **Super Admin** access to your Google Workspace domain

### 2. APIs to Enable (in Google Cloud Console)
1. Admin SDK API
2. Admin License Manager API
3. Admin Reports API
4. Google Drive API

### 3. OAuth Permissions
The script needs these permissions:
- Read user directory information
- Read user login activity
- Read license assignments
- Create and manage spreadsheets
- Move files to Shared Drive
- Send emails

## Setup Steps

### Step 1: Enable APIs
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable these APIs:
   - Admin SDK API
   - Admin License Manager API
   - Admin Reports API
   - Google Drive API

### Step 2: Link Project to Apps Script
1. Open your Apps Script
2. Go to Project Settings (⚙️)
3. Under "Google Cloud Platform (GCP) Project", click "Change project"
4. Enter your project number
5. Click "Set project"

### Step 3: Configure the Script
Edit the `CONFIG` section at the top of the script:

```javascript
const CONFIG = {
    TARGET_SKU_ID: '1010020020',  // License to check (Enterprise Plus)
    INACTIVITY_DAYS: 180,          // Days of inactivity
    
    EMAIL_RECIPIENTS: 'admin@yourcompany.com',
    SEND_EMAIL: true,
    
    SHARED_DRIVE_FOLDER_ID: '0AA7GGQkHedVoUk9PVA'  // Your Shared Drive folder
};
```

### Step 4: Authorize
1. Run the script
2. Click "Review Permissions"
3. Select your admin account
4. Click "Advanced" → "Go to [project name]"
5. Click "Allow"

## How to Use

### Run Manually
1. Open Apps Script editor
2. Select function: `auditInactiveEnterpriseUsers`
3. Click Run (▶️)
4. Check your Shared Drive for the report

### Run Automatically (Auto Run script only)
Run this function once to set up monthly automation:
```javascript
setupMonthlyTrigger()
```

## What's in the Report

The spreadsheet includes:

| Column | What It Shows |
|--------|---------------|
| Name | User's full name |
| Email | User's email address |
| OU Path | Which department/OU they're in |
| Last Login Time | When they last logged in |
| Creation Time | When the account was created |
| Suspended | If account is suspended |
| Licenses | What licenses they have |

## Common License SKU IDs

| License | SKU ID |
|---------|--------|
| Enterprise Plus | 1010020020 |
| Enterprise Standard | 1010020028 |
| Business Starter | 1010020027 |
| Business Standard | 1010020028 |
| Business Plus | 1010020025 |

## Troubleshooting

### "Not Authorized" Error
- Make sure you're a Super Admin
- Check all APIs are enabled
- Remove old permissions at myaccount.google.com/permissions
- Re-authorize the script

### Report Not in Shared Drive
- Check the folder ID is correct
- Make sure you have edit access to the folder
- Verify Drive API is enabled

### No Users Found
- Check if the license SKU ID is correct
- Verify users actually have that license
- Check the inactivity days setting

## Support

Check the execution log for detailed error messages. The log will tell you exactly what went wrong.

---

**Note:** This script only reads data - it doesn't delete users or remove licenses. It just creates a report for you to review.
