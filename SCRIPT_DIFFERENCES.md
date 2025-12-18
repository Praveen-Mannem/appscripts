# Script Differences: 180 Days vs 365 Days

This document outlines the key differences between the two inactive user audit scripts.

## Overview

Both scripts identify Google Workspace users with specific licenses who haven't logged in for a specified period. They use the same **hybrid approach** combining Reports API (most accurate) and Directory API (fallback) for login tracking.

## Key Differences

### 1. Inactivity Period ⏰

| Script | Inactivity Days |
|--------|----------------|
| **180 Days** | `INACTIVITY_DAYS: 180` |
| **365 Days** | `INACTIVITY_DAYS: 365` |

This is the **primary functional difference** - the 365-day script looks for users inactive for a full year, while the 180-day script looks for 6 months of inactivity.

---

### 2. Email Configuration 📧

**180-Day Script:**
```javascript
EMAIL_SUBJECT: 'Inactive Enterprise Plus Users Audit Report (180 Days)'
```

**365-Day Script:**
```javascript
EMAIL_SUBJECT: 'Inactive Enterprise Plus Users Audit Report (365 Days)'
```

---

### 3. Spreadsheet Title 📊

**180-Day Script:**
```javascript
SpreadsheetApp.create('Inactive Enterprise Plus Users Audit (180 Days)')
```

**365-Day Script:**
```javascript
SpreadsheetApp.create('Inactive Enterprise Plus Users Audit (365 Days)')
```

---

### 4. OAuth Scopes Documentation

**365-Day Script** includes an additional scope in the header comments:
```javascript
@scope https://www.googleapis.com/auth/admin.reports.audit.readonly
```

Both scripts use the Reports API, but the 365-day version explicitly documents this scope requirement.

---

### 5. Configuration Options

**180-Day Script Only:**
```javascript
// Output Configuration
// If set, the script will append a new tab to this spreadsheet.
// If empty or default, it will create a new spreadsheet file each time.
SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE'
```

The 180-day script has an unused `SPREADSHEET_ID` configuration option that the 365-day script doesn't include.

---

### 6. Documentation Comments

**365-Day Script** has enhanced documentation:
- Title includes "(365 Days Inactivity)"
- Prerequisites explicitly mention "Enable Admin Reports API"
- Optimization notes mention "HYBRID approach: Reports API (most accurate) + Directory API (fallback)"

**180-Day Script** has simpler documentation without these specific details.

---

## Functional Similarities

Both scripts share the same core functionality:

✅ Fetch all license assignments efficiently (single API call)  
✅ Use hybrid approach: Reports API + Directory API  
✅ Filter users by target SKU (e.g., Enterprise Plus)  
✅ Generate Google Sheets report  
✅ Send formatted HTML email notifications  
✅ Include diagnostic functions for troubleshooting  

---

## Which Script to Use?

| Use Case | Recommended Script |
|----------|-------------------|
| **Quarterly audits** | 180 Days |
| **Annual compliance reviews** | 365 Days |
| **License optimization** | 180 Days (more aggressive) |
| **Long-term inactive users** | 365 Days |

---

## Important Notes

⚠️ **Reports API Limitation**: The Google Admin Reports API only retains data for **180 days maximum**. This means:

- **180-day script**: Can use Reports API for the entire period ✅
- **365-day script**: Uses Reports API for recent 180 days, then falls back to Directory API for older data ⚠️

The 365-day script may have less accurate data for users who last logged in between 180-365 days ago, as it relies on Directory API's `lastLoginTime` field for that period.

---

*Last Updated: 2025-12-18*
