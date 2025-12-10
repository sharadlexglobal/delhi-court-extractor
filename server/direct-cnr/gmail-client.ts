// Gmail Integration for Direct CNR Daily Digest
// Using Replit's native Gmail connection

import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  // Check cached token validity
  if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  if (!hostname) {
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not configured');
  }
  
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  try {
    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch connection: ${response.status}`);
    }
    
    const data = await response.json();
    connectionSettings = data?.items?.[0];
  } catch (error) {
    console.error('[Gmail] Connection fetch error:', error);
    throw new Error('Failed to fetch Gmail connection settings');
  }

  const accessToken = connectionSettings?.settings?.access_token 
    || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected - please connect Gmail in the integrations panel');
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const gmail = await getUncachableGmailClient();
    
    const emailContent = [
      `To: ${options.to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${options.subject}`,
      '',
      options.htmlBody
    ].join('\r\n');

    const encodedMessage = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log(`[Gmail] Email sent to ${options.to}`);
    return true;
  } catch (error) {
    console.error('[Gmail] Failed to send email:', error);
    return false;
  }
}

export async function isGmailConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
