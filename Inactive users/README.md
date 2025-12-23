# Inactive Users Audit Scripts

This folder contains Google Apps Scripts for auditing inactive users in Google Workspace.

## 📁 File Organization

### Main Scripts

#### 1. **Inactive users 180 days - With Email.js**
- **Main audit script** with full features
- Checks ALL users first, then filters by license
- Includes email notifications and Shared Drive integration
- **Main function:** `auditInactiveEnterpriseUsers()`
- **Best for:** General audits where you want to see all inactive users

#### 2. **Inactive users 180 days - License First.js**
- **Optimized version** using license-first approach
- Checks ONLY users with target license, then checks inactivity
- More efficient for large organizations
- **Main function:** `auditInactiveLicensedUsers()`
- **Best for:** When you only care about users with specific licenses

### Supporting Files

#### 3. **Diagnostic Functions.js**
- **Optional debugging tools** (not required for normal operation)
- Contains functions for troubleshooting and testing
- **Functions included:**
  - `debugSpecificUser(userEmail)` - Check login data for a specific user
  - `checkAuthorizedScopes()` - Test API authorization
  - `debugUserLicense(userEmail)` - Check license assignments
  - `compareLoginDataSources(userEmail)` - Compare API data sources

## 🚀 Quick Start

### For Google Apps Script

1. Open [Google Apps Script](https://script.google.com/)
2. Create a new project
3. Copy the contents of your chosen main script
4. (Optional) Add `Diagnostic Functions.js` as a separate file
5. Enable required APIs in Services:
   - Admin SDK API
   - Admin License Manager API
   - Admin Reports API
6. Configure the `CONFIG` object with your settings
7. Run the main function

### Configuration

Edit the `CONFIG` object in your chosen script:

```javascript
const CONFIG = {
    TARGET_SKU_ID: '1010020020',        // License SKU to target
    INACTIVITY_DAYS: 180,               // Days of inactivity threshold
    EMAIL_RECIPIENTS: 'email@example.com',
    SEND_EMAIL: true,
    SHARED_DRIVE_FOLDER_ID: 'your-folder-id'
};
```

## 📊 Output

Both scripts generate:
- **Google Sheet** with inactive user details
- **Email notification** (if enabled) with report summary
- **Execution logs** showing audit progress

### Report Columns

| Column | Description |
|--------|-------------|
| Name | User's full name |
| Email | User's primary email |
| OU Path | Organizational unit path |
| Manager Email | Manager's email (if set) |
| Last Login Time | Last login timestamp or "Never" |
| Creation Time | Account creation date |
| Suspended | Account suspension status |
| Licenses | Assigned license(s) |

## 🔍 When to Use Which Script

### Use "With Email.js" when:
- You want to see ALL inactive users regardless of license
- You need a comprehensive audit report
- You want to compare licensed vs unlicensed inactive users

### Use "License First.js" when:
- You only care about users with specific licenses
- You have a large organization (more efficient)
- You want faster execution time
- You want a focused report on licensed users only

## 🛠️ Troubleshooting

If you encounter issues:

1. **Run diagnostic functions** from `Diagnostic Functions.js`
2. **Check API authorization** using `checkAuthorizedScopes()`
3. **Debug specific users** using `debugSpecificUser('user@example.com')`
4. **Compare data sources** using `compareLoginDataSources('user@example.com')`

## 📚 Additional Resources

- [Code Structure Guide](../../../.gemini/antigravity/brain/68a1ae3d-31d9-4d87-bc96-b24c6ef97b17/code_structure_guide.md) - Detailed guide on where to add features
- [Google Workspace Admin SDK](https://developers.google.com/admin-sdk)
- [Apps Script Documentation](https://developers.google.com/apps-script)

## 🔐 Required Permissions

The scripts require the following OAuth scopes:
- `https://www.googleapis.com/auth/admin.directory.user.readonly`
- `https://www.googleapis.com/auth/admin.directory.customer.readonly`
- `https://www.googleapis.com/auth/apps.licensing`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/admin.reports.audit.readonly`
- `https://www.googleapis.com/auth/script.send_mail`
- `https://www.googleapis.com/auth/drive`

## 📝 Notes

- Reports API only keeps 180 days of login history
- Scripts use a hybrid approach (Reports API + Directory API) for accuracy
- Execution time varies based on organization size
- Large organizations may need to adjust API quota limits
