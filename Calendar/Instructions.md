# Ownerless Calendar Script Setup Instructions

This script requires a Google Cloud Platform (GCP) Service Account with Domain-Wide Delegation to scan all users' calendars.

## Step 1: Google Cloud Project & Service Account

1.  **Create a Project**: Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (e.g., "Calendar Audit").
2.  **Enable APIs**:
    *   Go to **APIs & Services > Library**.
    *   Search for and enable:
        *   **Google Calendar API**
        *   **Admin SDK API**
3.  **Create Service Account**:
    *   Go to **APIs & Services > Credentials**.
    *   Click **Create Credentials > Service Account**.
    *   Name it (e.g., "calendar-auditor").
    *   Click **Done** (no specific IAM roles needed for the account itself, as we use DWD).
4.  **Generate Key**:
    *   Click on the newly created Service Account email.
    *   Go to the **Keys** tab.
    *   Click **Add Key > Create new key > JSON**.
    *   The JSON file will download. **Keep this safe!** You will need its contents later.
5.  **Enable Domain-Wide Delegation**:
    *   In the Service Account details, find **Advanced settings** or "Domain-wide delegation".
    *   Tick **Enable Google Workspace Domain-wide Delegation**.
    *   Enter a product name if asked.
    *   **Copy the "Client ID"** (it is a long number).

## Step 2: Authorize in Admin Console

1.  Go to the [Google Workspace Admin Console](https://admin.google.com/).
2.  Navigate to **Security > Access and data control > API controls**.
3.  Click **Manage Domain Wide Delegation**.
4.  Click **Add new**.
5.  **Client ID**: Paste the Client ID you copied from the Service Account.
6.  **OAuth Scopes** (comma-delimited):
    ```
    https://www.googleapis.com/auth/calendar,
    https://www.googleapis.com/auth/admin.directory.user.readonly
    ```
    *Note: We need full `calendar` scope or `calendar.readonly` to see ACLs.*
7.  Click **Authorize**.

## Step 3: Apps Script Configuration

1.  **Add OAuth2 Library**:
    *   In the script editor, click **Libraries** (+).
    *   Enter Script ID: `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF` (Standard OAuth2 library).
    *   Select the latest version and click **Add**.
2.  **Set Script Properties**:
    *   Open the downloaded JSON key file.
    *   In the Apps Script editor, go to **Project Settings** (gear icon) -> **Script Properties**.
    *   Add the following properties:
        *   `SERVICE_ACCOUNT_PRIVATE_KEY`: Copy the `private_key` value from the JSON (including `-----BEGIN PRIVATE KEY...`).
        *   `SERVICE_ACCOUNT_EMAIL`: Copy the `client_email` value.
        *   `ADMIN_EMAIL`: Enter the email address of a Super Admin user to impersonate for Admin Directory listing (or just use your email).

## Step 4: Run the Script

1.  Open `Code.gs`.
2.  Run the function `listOwnerlessCalendars`.
3.  Grant permissions if prompted (for the script itself to run).
