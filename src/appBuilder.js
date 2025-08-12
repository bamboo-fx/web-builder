import OpenAI from 'openai';
import crypto from 'crypto';

// In-memory storage for apps (much more scalable)
const apps = new Map();
const APP_EXPIRY_TIME = 60 * 60 * 1000; // 1 hour
const MAX_APPS_TOTAL = 1000; // Global limit
const MAX_APPS_PER_IP = 10; // Per IP limit

function sendLog(appId, message, type = 'log') {
  if (global.buildStreams && global.buildStreams[appId]) {
    global.buildStreams[appId].write(`data: ${JSON.stringify({ type, message })}\n\n`);
  }
  console.log(`[${appId}] ${message}`);
}

// Cleanup expired apps
function cleanupExpiredApps() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [appId, appData] of apps.entries()) {
    if (now - appData.createdAt > APP_EXPIRY_TIME) {
      apps.delete(appId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired apps. Active apps: ${apps.size}`);
  }
}

// Auto cleanup every 10 minutes
setInterval(cleanupExpiredApps, 10 * 60 * 1000);

// Generate proper app ID
function generateAppId() {
  return crypto.randomUUID().slice(0, 8); // Short, unique ID
}

// Store app in memory
function storeApp(appId, files, prompt, userIP) {
  const appData = {
    appId,
    files,
    prompt,
    userIP,
    createdAt: Date.now(),
    lastAccessed: Date.now()
  };
  
  apps.set(appId, appData);
  console.log(`📱 Stored app ${appId}. Total apps: ${apps.size}`);
  return appData;
}

// Get app from memory
export function getApp(appId) {
  const app = apps.get(appId);
  if (app) {
    app.lastAccessed = Date.now(); // Update access time
    return app;
  }
  return null;
}

// Check limits before creating app
function checkLimits(userIP) {
  // Cleanup first
  cleanupExpiredApps();
  
  // Check global limit
  if (apps.size >= MAX_APPS_TOTAL) {
    throw new Error('Server capacity reached. Please try again later.');
  }
  
  // Check per-IP limit
  const userApps = Array.from(apps.values()).filter(app => app.userIP === userIP);
  if (userApps.length >= MAX_APPS_PER_IP) {
    throw new Error(`You have reached the limit of ${MAX_APPS_PER_IP} apps. Please wait for them to expire.`);
  }
}

export async function buildWebAppWithLogs(prompt, userIP, predefinedAppId = null) {
  const appId = predefinedAppId || generateAppId();
  
  try {
    sendLog(appId, 'Checking resource limits...');
    checkLimits(userIP);
    
    sendLog(appId, 'Initializing OpenAI client...');
    
    const result = await buildWebApp(prompt, appId, userIP);
    
    if (result.success) {
      sendLog(appId, 'Web app built successfully!', 'success');
      sendLog(appId, `App completed with ID: ${appId}`, 'complete');
    } else {
      sendLog(appId, `Error: ${result.error}`, 'error');
    }
    
    return result;
  } catch (error) {
    sendLog(appId, `Build failed: ${error.message}`, 'error');
    return { success: false, error: error.message, appId };
  }
}

export async function buildWebApp(prompt, appId, userIP) {
  const systemPrompt = `You are a web development expert. Build a complete web application based on the user's requirements.

Create clean, modern HTML, CSS, and JavaScript code. Structure your response with clear file separations:

**index.html**
[HTML code here]

**style.css**
[CSS code here]

**script.js**
[JavaScript code here]

Make the app fully functional and ready to run. Use modern web standards and ensure responsive design.`;

  try {
    sendLog(appId, `Building web app for prompt: "${prompt}"`);
    
    sendLog(appId, 'Connecting to OpenAI...');
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    sendLog(appId, 'Sending request to GPT-4o...');
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Build a web application: ${prompt}` }
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    sendLog(appId, 'Received response from OpenAI, processing files...');
    const response = completion.choices[0].message.content;

    // Extract files from response
    const files = extractFiles(response);
    sendLog(appId, `Extracted ${Object.keys(files).length} files from response`);
    
    sendLog(appId, 'Storing app in memory...');
    storeApp(appId, files, prompt, userIP);
    
    sendLog(appId, 'App generation completed!');
    
    return {
      success: true,
      appId,
      files: Object.keys(files)
    };

  } catch (error) {
    const errorMsg = `Error building web app: ${error.message}`;
    sendLog(appId, errorMsg, 'error');
    return {
      success: false,
      error: error.message,
      prompt,
      appId
    };
  }
}

function extractFiles(response) {
  const files = {};
  
  // Extract files using **filename** markers
  const fileRegex = /\*\*([^*]+)\*\*\s*\n([\s\S]*?)(?=\*\*[^*]+\*\*|\n\n---|\n\nThat's|\n\nThe|\n\nHere|\n\nThis|\n\nI've|\Z)/g;
  
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    const filename = match[1].trim();
    let content = match[2].trim();
    
    // Clean up code blocks
    content = content.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    
    if (filename && content) {
      files[filename] = content;
    }
  }

  // Fallback: create basic structure if no files extracted
  if (Object.keys(files).length === 0) {
    files['index.html'] = generateBasicHTML(response);
    files['style.css'] = generateBasicCSS();
    files['script.js'] = generateBasicJS();
  }

  return files;
}

function generateBasicHTML(response) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated App</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>Generated Web App</h1>
        <div id="app">
            <!-- App content will be added by JavaScript -->
        </div>
    </div>
    <script src="script.js"></script>
</body>
</html>`;
}

function generateBasicCSS() {
  return `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f5f5f5;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
}`;
}

function generateBasicJS() {
  return `document.addEventListener('DOMContentLoaded', function() {
    console.log('Generated app loaded!');
});`;
}