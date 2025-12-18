# Google Workspace Inactive User Audit Script - Logic Explanation

This document explains the logic and workflow of the script `Inactive users 180 days - Auto Run.js`.

## Overview
This script is designed to automatically audit your Google Workspace environment. Its goal is to identify users who hold a specific, expensive license (e.g., "Enterprise Plus") but have not logged in for a set period (e.g., 180 days). It generates a report in Google Sheets and emails it to administrators.

## Step-by-Step Logic

### 1. Configuration & Setup
**Location:** Lines 1-87
- **Permissions:** The script requests OAuth scopes to read User, Customer, and License data, and to manage Spreadsheets.
- **`CONFIG` Object:** Centralized settings:
  - `TARGET_SKU_ID`: The license ID to hunt for (default: Enterprise Plus).
  - `INACTIVITY_DAYS`: The threshold for inactivity (180 days).
  - `EMAIL_RECIPIENTS`: List of admins to receive the report.
- **`SKU_CATALOG`:** Maps human-readable names (e.g., "Enterprise Standard") to Google's internal SKU IDs.

### 2. Main Execution: `auditInactiveEnterpriseUsers`
**Location:** Lines 92-151
This function orchestrates the entire workflow:
1.  **Calculate Date:** Determines the cutoff date (Today - 180 days).
2.  **Get Customer ID:** Fetches the organization's unique ID.
3.  **Fetch Licenses (Optimized):** Instead of checking users one by one (slow), it downloads **ALL** license assignments at once into a "License Map" for fast lookup.
4.  **Find Inactive Users:** calls `getInactiveUsers` to identify who hasn't logged in.
5.  **Filter Results:** Cross-references the "Inactive Users" list with the "License Map". It filters for users who are **BOTH** inactive AND have the target license.
6.  **Action:**
    - If matches are found, it generates the spreadsheet via `exportToSheet`.
    - It logs the progress for debugging.

### 3. Fetching Licenses: `getAllLicenseAssignments`
**Location:** Lines 158-201
- **Purpose:** Performance optimization.
- **Logic:** Queries Google for every user with the "Google-Apps" product. It iterates through pages of results and builds a map: `User Email -> List of Licenses`.

### 4. Identifying Inactive Users (The Hybrid Approach)
This is the critical logic to ensure accuracy, split into two functions:

**A. `getLoginActivityFromReports` (Lines 209-263)**
- **Why:** The standard Directory API sometimes shows stale login dates. The **Reports API** is accurate but only retains data for 180 days.
- **Logic:** Searches the Reports API for "login" events in the last 180 days and records the most recent timestamp for each user.

**B. `getInactiveUsers` (Lines 269-328)**
- **Logic:** Checks two sources to decide if a user is truly inactive:
  1.  **Check Reports API:** If the Reports API sees a recent login, the user is **Active**.
  2.  **Check Directory API:** If the standard profile (`lastLoginTime`) shows a recent login, the user is **Active**.
  3.  **Verdict:** If *neither* API shows a login after the cutoff date, the user is marked **Inactive**.

### 5. Reporting: `exportToSheet`
**Location:** Lines 333-384
- **Sheet Logic:** Checks if a `SPREADSHEET_ID` is configured.
  - **If Yes:** Opens that sheet and creates a new tab with a timestamp.
  - **If No:** Creates a completely new Spreadsheet file.
- **Formatting:** Adds headers and styles them (bold, blue background).
- **Data:** Writes the list of target users.

### 6. Notification: `sendEmailReport`
**Location:** Lines 389-466
- Constructs an HTML email summary.
- Includes statistics (count of inactive users, inactivity period) and a direct link to the Google Sheet.
- Sends to `CONFIG.EMAIL_RECIPIENTS`.

### 7. Automation: `setupMonthlyTrigger`
**Location:** Lines 605-624
- **Usage:** Run this function **once** manually.
- **Logic:**
  - Checks if a trigger already exists (to prevent duplicates).
  - If not, creates a time-based trigger to run `auditInactiveEnterpriseUsers` automatically every 30 days.

### 8. Diagnostics
**Location:** Lines 461-599
- **`debugSpecificUser`:** Debugging tool. detailed login data from all APIs for a specific email.
- **`checkAuthorizedScopes`:** Verifies that the script has the correct permissions to access Google APIs.
