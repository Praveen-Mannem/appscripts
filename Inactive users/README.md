# Google Workspace App Scripts

This repository contains Google Apps Scripts for auditing and managing Google Workspace users.

## Scripts

### 1. Inactive Users Audit (180 Days) - Auto Run
*   **File:** `Inactive users 180 days - Auto Run.js`
*   **Description:** Audits users with a specific license (e.g., Enterprise Plus) who have been inactive for 180 days.
*   **Automation:** Includes a `setupMonthlyTrigger()` function to run the audit automatically every 30 days.
*   **Output:** Generates a Google Sheet and sends an email report.

### 2. Inactive Users Audit (180 Days) - Manual
*   **File:** `Inactive users 180 days - With Email.js`
*   **Description:** Same functionality as the auto-run version but designed for manual execution.
*   **Output:** Generates a Google Sheet and sends an email report.

### 3. Inactive Users Audit (365 Days)
*   **File:** `Inactive users 365 days - With Email.js`
*   **Description:** Audits users with a specific license who have been inactive for 365 days.
*   **Output:** Generates a Google Sheet and sends an email report.

## Setup & Usage

1.  **Prerequisites:**
    *   Enable "Admin SDK API" in Apps Script Services.
    *   Enable "Admin License Manager API" in Apps Script Services.
    *   Enable "Admin Reports API" in Apps Script Services.
    *   Run with a Super Admin account.

2.  **Configuration:**
    *   Update the `CONFIG` object in each script to set the `TARGET_SKU_ID` and `EMAIL_RECIPIENTS`.
