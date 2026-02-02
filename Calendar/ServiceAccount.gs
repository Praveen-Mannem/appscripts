/**
 * Configures the OAuth2 service for the Service Account.
 * @param {string} userEmail The email of the user to impersonate.
 * @return {OAuth2.Service} The configured OAuth2 service.
 */
function getOAuthService(userEmail) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const privateKey = scriptProperties.getProperty('SERVICE_ACCOUNT_PRIVATE_KEY');
  const serviceAccountEmail = scriptProperties.getProperty('SERVICE_ACCOUNT_EMAIL');

  if (!privateKey || !serviceAccountEmail) {
    throw new Error('Service Account properties not set. Please check Instructions.md.');
  }

  // Adjust key format if necessary (replace escaped newlines)
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  return OAuth2.createService('ServiceAccount:' + userEmail)
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setPrivateKey(formattedKey)
    .setIssuer(serviceAccountEmail)
    .setSubject(userEmail)
    .setPropertyStore(PropertiesService.getScriptProperties())
    .setScope([
      'https://www.googleapis.com/auth/calendar.readonly',
       // Add other scopes if needed for that specific user context
    ]);
}

/**
 * Resets the OAuth2 service.
 */
function resetOAuthService() {
  OAuth2.createService('ServiceAccount').reset();
}
