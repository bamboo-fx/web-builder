import OpenAI from 'openai';
import crypto from 'crypto';

// In-memory storage for generated apps
const apps = new Map();
const APP_EXPIRY_TIME = 60 * 60 * 1000; // 1 hour

// Auto cleanup every 15 minutes
setInterval(() => {
  cleanupExpiredApps();
}, 15 * 60 * 1000);

function sendLog(appId, message, type = 'log') {
  if (global.buildStreams && global.buildStreams[appId]) {
    global.buildStreams[appId].write(`data: ${JSON.stringify({ type, message })}\n\n`);
  }
  console.log(`[${appId}] ${message}`);
}

// Generate proper app ID
function generateAppId() {
  return crypto.randomUUID().slice(0, 8); // Short, unique ID
}

// Get app URL for in-memory stored app
export function getAppUrl(appId) {
  const app = apps.get(appId);
  if (!app) {
    return null;
  }
  
  // Update last accessed time
  app.lastAccessed = Date.now();
  
  // Return the local server URL for this app
  return `/apps/${appId}/`;
}

// Get app files from memory
export function getAppFiles(appId) {
  const app = apps.get(appId);
  if (!app) {
    return null;
  }
  
  // Update last accessed time
  app.lastAccessed = Date.now();
  
  return app.files;
}

// Delete an app from memory
export function deleteApp(appId) {
  const app = apps.get(appId);
  if (!app) {
    return false;
  }
  
  apps.delete(appId);
  console.log(`🗑️ Manually deleted app ${appId}`);
  return true;
}

// Get app details including prompt
export function getAppDetails(appId) {
  const app = apps.get(appId);
  if (!app) {
    return null;
  }
  
  // Update last accessed time
  app.lastAccessed = Date.now();
  
  return {
    appId: app.appId,
    createdAt: app.createdAt,
    lastAccessed: app.lastAccessed,
    userIP: app.userIP,
    prompt: app.prompt,
    files: app.files,
    fileCount: Object.keys(app.files).length
  };
}

// Get stats for debugging
export function getAppStats() {
  return {
    totalApps: apps.size,
    appIds: Array.from(apps.keys()),
    apps: Array.from(apps.entries()).map(([appId, app]) => ({
      appId,
      createdAt: new Date(app.createdAt).toISOString(),
      lastAccessed: new Date(app.lastAccessed).toISOString(),
      fileCount: Object.keys(app.files).length,
      userIP: app.userIP,
      prompt: app.prompt ? app.prompt.substring(0, 100) + (app.prompt.length > 100 ? '...' : '') : 'No prompt'
    }))
  };
}

// Clean up expired apps
function cleanupExpiredApps() {
  const now = Date.now();
  let cleaned = 0;

  for (const [appId, app] of apps.entries()) {
    if (now - app.createdAt > APP_EXPIRY_TIME) {
      apps.delete(appId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired apps. Active: ${apps.size}`);
  }
}

export async function buildWebAppWithLogs(prompt, userIP, predefinedAppId = null) {
  const appId = predefinedAppId || generateAppId();
  
  try {
    sendLog(appId, 'Starting web app generation...');
    sendLog(appId, 'Initializing OpenAI client...');
    
    const result = await buildWebApp(prompt, appId, userIP);
    
    if (result.success) {
      sendLog(appId, 'Storing app in memory...');
      
      // Store app in memory
      const app = {
        appId,
        files: result.files,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        userIP,
        prompt
      };
      
      apps.set(appId, app);
      
      sendLog(appId, 'Web app stored successfully!', 'success');
      sendLog(appId, `App completed with ID: ${appId}`, 'complete');
      
      // Enhanced console logging with clickable URLs
      console.log(`\n🎉 New app created successfully!`);
      console.log(`   📱 App ID: ${appId}`);
      console.log(`   🔗 View App: http://localhost:3000/apps/${appId}/`);
      console.log(`   📝 View Code: http://localhost:3000/debug/apps/${appId}/code`);
      console.log(`   💾 Download: http://localhost:3000/debug/apps/${appId}/download`);
      console.log(`   📊 Dashboard: http://localhost:3000/debug`);
      console.log(`   📄 Files: ${Object.keys(result.files).join(', ')}\n`);
      
      return {
        success: true,
        appId,
        url: `/apps/${appId}/`,
        files: Object.keys(result.files)
      };
    } else {
      sendLog(appId, `Error: ${result.error}`, 'error');
      return result;
    }
    
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
    
    sendLog(appId, 'Code generation completed!');
    
    return {
      success: true,
      appId,
      files: files
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