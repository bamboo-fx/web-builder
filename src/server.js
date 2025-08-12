import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { buildWebApp, buildWebAppWithLogs, getAppUrl, getAppFiles, getAppStats, deleteApp, getAppDetails } from './appBuilder.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Get user IP helper
function getUserIP(req) {
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
}

// Get MIME type for files
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return mimeTypes[ext] || 'text/plain';
}

// Direct file serving from memory storage
app.get('/apps/:appId/*', (req, res) => {
  const { appId } = req.params;
  const requestedFile = req.params[0] || 'index.html';
  
  try {
    const appFiles = getAppFiles(appId);
    
    if (!appFiles) {
      return res.status(404).send(`
        <div style="font-family: system-ui; text-align: center; margin-top: 50px;">
          <h2>App Not Found</h2>
          <p>This app may have expired or doesn't exist.</p>
          <a href="/" style="color: #007AFF;">← Create New App</a>
        </div>
      `);
    }
    
    // Handle root request - serve index.html
    let filename = requestedFile;
    if (filename === '' || filename === '/') {
      filename = 'index.html';
    }
    
    // Check if file exists in memory
    if (!appFiles[filename]) {
      return res.status(404).send(`
        <div style="font-family: system-ui; text-align: center; margin-top: 50px;">
          <h2>File Not Found</h2>
          <p>The requested file "${filename}" doesn't exist in this app.</p>
          <p>Available files: ${Object.keys(appFiles).join(', ')}</p>
          <a href="/apps/${appId}/" style="color: #007AFF;">← Back to App</a>
        </div>
      `);
    }
    
    // Serve the file content with proper MIME type
    const mimeType = getMimeType(filename);
    const content = appFiles[filename];
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'no-cache'); // Prevent caching during development
    res.send(content);
    
  } catch (error) {
    console.error(`Error serving file ${requestedFile} for app ${appId}:`, error);
    res.status(500).send(`
      <div style="font-family: system-ui; text-align: center; margin-top: 50px;">
        <h2>Server Error</h2>
        <p>Unable to load the requested file.</p>
        <a href="/" style="color: #007AFF;">← Create New App</a>
      </div>
    `);
  }
});

// Front page with prompt input
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Webbers - Web App Builder</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                background: white;
                padding: 3rem;
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.1);
                max-width: 600px;
                width: 90%;
                text-align: center;
            }
            h1 { 
                color: #333; 
                font-size: 2.5rem; 
                margin-bottom: 0.5rem;
                font-weight: 700;
            }
            .subtitle {
                color: #666;
                font-size: 1.1rem;
                margin-bottom: 2rem;
            }
            textarea { 
                width: 100%; 
                height: 150px; 
                padding: 1.5rem;
                border: 2px solid #e1e5e9;
                border-radius: 12px;
                font-size: 16px;
                resize: vertical;
                font-family: inherit;
                margin-bottom: 1.5rem;
                transition: border-color 0.3s ease;
            }
            textarea:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            button { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; 
                border: none; 
                padding: 16px 32px; 
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                width: 100%;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            button:hover { 
                transform: translateY(-2px);
                box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
            }
            button:disabled { 
                background: #ccc; 
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }
            .examples {
                margin-top: 2rem;
                text-align: left;
            }
            .examples h3 {
                color: #333;
                margin-bottom: 1rem;
                font-size: 1.1rem;
            }
            .example {
                background: #f8f9fa;
                padding: 0.75rem 1rem;
                border-radius: 8px;
                margin-bottom: 0.5rem;
                font-size: 14px;
                color: #555;
                cursor: pointer;
                transition: background-color 0.2s ease;
            }
            .example:hover {
                background: #e9ecef;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Webbers</h1>
            <p class="subtitle">AI-powered web app builder. Describe your idea and watch it come to life!</p>
            
            <form id="promptForm">
                <textarea 
                    id="prompt" 
                    placeholder="Describe the web app you want to build..."
                    required
                ></textarea>
                <button type="submit" id="generateBtn">Generate Web App</button>
            </form>
            
            <div class="examples">
                <h3>💡 Example ideas:</h3>
                <div class="example" onclick="fillExample('Create a simple calculator app with basic arithmetic operations')">
                    Create a simple calculator app with basic arithmetic operations
                </div>
                <div class="example" onclick="fillExample('Build a to-do list app with add, delete, and mark complete functionality')">
                    Build a to-do list app with add, delete, and mark complete functionality
                </div>
                <div class="example" onclick="fillExample('Make a weather app that shows current conditions for a city')">
                    Make a weather app that shows current conditions for a city
                </div>
                <div class="example" onclick="fillExample('Create a simple color picker tool with hex and RGB values')">
                    Create a simple color picker tool with hex and RGB values
                </div>
            </div>
        </div>

        <script>
            function fillExample(text) {
                document.getElementById('prompt').value = text;
            }
            
            document.getElementById('promptForm').addEventListener('submit', (e) => {
                e.preventDefault();
                const prompt = document.getElementById('prompt').value.trim();
                
                if (prompt) {
                    // Redirect to build page with prompt as URL parameter
                    window.location.href = \`/build?prompt=\${encodeURIComponent(prompt)}\`;
                }
            });
        </script>
    </body>
    </html>
  `);
});

// Build page with split view
app.get('/build', (req, res) => {
  const prompt = req.query.prompt || '';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Building App - Webbers</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                height: 100vh;
                background: #f5f5f5;
            }
            .header {
                background: white;
                padding: 1rem 2rem;
                border-bottom: 1px solid #ddd;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            h1 { color: #333; font-size: 1.5rem; }
            .back-btn {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                color: #333;
                padding: 8px 16px;
                border-radius: 6px;
                text-decoration: none;
                font-size: 14px;
                transition: background-color 0.2s ease;
            }
            .back-btn:hover {
                background: #e9ecef;
            }
            .main-container {
                display: flex;
                height: calc(100vh - 80px);
            }
            .left-panel {
                width: 400px;
                background: white;
                border-right: 1px solid #ddd;
                display: flex;
                flex-direction: column;
            }
            .prompt-section {
                padding: 1.5rem;
                border-bottom: 1px solid #ddd;
                background: #f8f9fa;
            }
            .prompt-text {
                font-size: 14px;
                color: #333;
                line-height: 1.4;
                margin: 0;
            }
            .logs-section {
                flex: 1;
                overflow-y: auto;
                padding: 1.5rem;
                background: white;
            }
            .log-entry {
                margin-bottom: 1rem;
                padding: 0.75rem 1rem;
                border-radius: 8px;
                font-size: 14px;
                line-height: 1.4;
            }
            .log-info { 
                background: #e3f2fd; 
                color: #1565c0;
                border-left: 4px solid #2196f3;
            }
            .log-success { 
                background: #e8f5e8; 
                color: #2e7d32;
                border-left: 4px solid #4caf50;
            }
            .log-error { 
                background: #ffebee; 
                color: #c62828;
                border-left: 4px solid #f44336;
            }
            .log-time {
                font-size: 12px;
                opacity: 0.7;
                margin-bottom: 0.25rem;
            }
            .right-panel {
                flex: 1;
                background: white;
                position: relative;
            }
            .app-preview {
                width: 100%;
                height: 100%;
                border: none;
            }
            .preview-placeholder {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: #666;
                font-size: 1.2rem;
                text-align: center;
                padding: 2rem;
                flex-direction: column;
            }
            .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #667eea;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-bottom: 1rem;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .hidden { display: none; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🚀 Webbers</h1>
            <a href="/" class="back-btn">← New App</a>
        </div>
        
        <div class="main-container">
            <div class="left-panel">
                <div class="prompt-section">
                    <p class="prompt-text">"${prompt.replace(/"/g, '&quot;')}"</p>
                </div>
                
                <div class="logs-section" id="logs">
                    <div style="color: #666; text-align: center; margin-top: 2rem;">
                        Preparing to build your app...
                    </div>
                </div>
            </div>
            
            <div class="right-panel">
                <div class="preview-placeholder" id="placeholder">
                    <div class="spinner"></div>
                    <div>Building your web app...</div>
                </div>
                <iframe class="app-preview hidden" id="appFrame"></iframe>
            </div>
        </div>

        <script>
            let eventSource = null;
            const prompt = "${prompt.replace(/"/g, '\\"').replace(/\\/g, '\\\\')}";
            
            function addLog(message, type = 'info') {
                const logs = document.getElementById('logs');
                const entry = document.createElement('div');
                entry.className = \`log-entry log-\${type}\`;
                
                const timeDiv = document.createElement('div');
                timeDiv.className = 'log-time';
                timeDiv.textContent = new Date().toLocaleTimeString();
                
                const messageDiv = document.createElement('div');
                messageDiv.textContent = message;
                
                entry.appendChild(timeDiv);
                entry.appendChild(messageDiv);
                logs.appendChild(entry);
                logs.scrollTop = logs.scrollHeight;
            }
            
            function clearLogs() {
                document.getElementById('logs').innerHTML = '';
            }
            
            // Auto-start building when page loads
            window.addEventListener('load', async () => {
                if (!prompt) {
                    window.location.href = '/';
                    return;
                }
                
                const placeholder = document.getElementById('placeholder');
                const appFrame = document.getElementById('appFrame');
                
                clearLogs();
                
                try {
                    // Start build process
                    const response = await fetch('/build-with-logs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success && data.building) {
                        const currentAppId = data.appId;
                        
                        // Connect to logs stream
                        eventSource = new EventSource(\`/build-stream/\${currentAppId}\`);
                        
                        eventSource.onmessage = function(event) {
                            const logData = JSON.parse(event.data);
                            
                            if (logData.type === 'complete') {
                                // Load the app in iframe
                                appFrame.src = \`/apps/\${currentAppId}/\`;
                                appFrame.classList.remove('hidden');
                                placeholder.classList.add('hidden');
                                eventSource.close();
                                addLog(logData.message, logData.type);
                            } else {
                                addLog(logData.message, logData.type);
                            }
                        };
                        
                        eventSource.onerror = function() {
                            addLog('Connection to build logs lost', 'error');
                            eventSource.close();
                        };
                    } else {
                        addLog(\`Failed to start build: \${data.error || 'Unknown error'}\`, 'error');
                    }
                } catch (error) {
                    addLog(\`Error: \${error.message}\`, 'error');
                }
            });
        </script>
    </body>
    </html>
  `);
});

// Legacy build endpoint (kept for compatibility)
app.post('/build', async (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Prompt is required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ 
      success: false, 
      error: 'OPENAI_API_KEY not configured. Please add it to your .env file.' 
    });
  }

  const userIP = getUserIP(req);
  
  try {
    const result = await buildWebAppWithLogs(prompt, userIP);
    res.json(result);
  } catch (error) {
    console.error('Build error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Server-Sent Events endpoint for real-time logs
app.get('/build-stream/:appId', (req, res) => {
  const { appId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Store the response object to send logs later
  global.buildStreams = global.buildStreams || {};
  global.buildStreams[appId] = res;

  // Send initial message
  res.write(`data: ${JSON.stringify({ type: 'log', message: 'Starting to build your web app...' })}\n\n`);

  // Clean up on client disconnect
  req.on('close', () => {
    delete global.buildStreams[appId];
  });
});

// Apps Dashboard - Main debug page
app.get('/debug', (req, res) => {
  const stats = getAppStats();
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Webbers - Apps Dashboard</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f5f5f5;
                min-height: 100vh;
            }
            .header {
                background: white;
                padding: 2rem;
                border-bottom: 1px solid #ddd;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 { color: #333; font-size: 2rem; margin-bottom: 0.5rem; }
            .subtitle { color: #666; font-size: 1.1rem; }
            .stats {
                display: flex;
                gap: 1rem;
                margin: 1rem 0;
            }
            .stat {
                background: #e3f2fd;
                color: #1565c0;
                padding: 0.5rem 1rem;
                border-radius: 8px;
                font-size: 14px;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 2rem;
            }
            .apps-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 1.5rem;
                margin-top: 2rem;
            }
            .app-card {
                background: white;
                border-radius: 12px;
                padding: 1.5rem;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .app-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            }
            .app-id {
                font-family: 'Monaco', 'Menlo', monospace;
                font-size: 18px;
                font-weight: 600;
                color: #333;
                margin-bottom: 0.5rem;
            }
            .app-meta {
                font-size: 12px;
                color: #666;
                margin-bottom: 1rem;
            }
            .app-actions {
                display: flex;
                gap: 0.5rem;
                flex-wrap: wrap;
            }
            .btn {
                padding: 6px 12px;
                border: none;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                transition: background-color 0.2s ease;
            }
            .btn-primary { background: #007AFF; color: white; }
            .btn-secondary { background: #f8f9fa; color: #333; border: 1px solid #dee2e6; }
            .btn-danger { background: #dc3545; color: white; }
            .btn:hover { opacity: 0.8; }
            .empty-state {
                text-align: center;
                padding: 4rem 2rem;
                color: #666;
            }
            .refresh-btn {
                background: #28a745;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                margin-left: 1rem;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="container">
                <h1>🚀 Webbers Dashboard</h1>
                <p class="subtitle">Manage your generated web apps</p>
                <div class="stats">
                    <div class="stat">📱 ${stats.totalApps} Active Apps</div>
                    <div class="stat">📊 ${Object.keys(global.buildStreams || {}).length} Building</div>
                    <div class="stat">🕐 Auto-cleanup: 1 hour</div>
                </div>
                <div style="margin-top: 1rem;">
                    <a href="/" class="btn btn-primary">Create New App</a>
                    <button onclick="location.reload()" class="refresh-btn">Refresh</button>
                </div>
            </div>
        </div>
        
        <div class="container">
            ${stats.totalApps === 0 ? `
                <div class="empty-state">
                    <h3>No apps created yet</h3>
                    <p>Create your first web app to see it here</p>
                    <a href="/" class="btn btn-primary" style="margin-top: 1rem;">Create App</a>
                </div>
            ` : `
                <div class="apps-grid">
                    ${stats.apps.map(app => `
                        <div class="app-card">
                            <div class="app-id">${app.appId}</div>
                            <div class="app-meta">
                                <strong>Prompt:</strong> "${app.prompt}"<br>
                                Created: ${new Date(app.createdAt).toLocaleString()}<br>
                                Files: ${app.fileCount} | Last accessed: ${new Date(app.lastAccessed).toLocaleString()}
                            </div>
                            <div class="app-actions">
                                <a href="/apps/${app.appId}/" class="btn btn-primary" target="_blank">View App</a>
                                <a href="/debug/apps/${app.appId}/code" class="btn btn-secondary">View Code</a>
                                <a href="/debug/apps/${app.appId}/download" class="btn btn-secondary">Download</a>
                                <button onclick="deleteApp('${app.appId}')" class="btn btn-danger">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        </div>
        
        <script>
            async function deleteApp(appId) {
                if (confirm(\`Delete app \${appId}? This cannot be undone.\`)) {
                    try {
                        const response = await fetch(\`/debug/apps/\${appId}\`, { method: 'DELETE' });
                        if (response.ok) {
                            location.reload();
                        } else {
                            alert('Failed to delete app');
                        }
                    } catch (error) {
                        alert('Error deleting app: ' + error.message);
                    }
                }
            }
        </script>
    </body>
    </html>
  `);
});

// JSON API endpoint for apps list
app.get('/debug/apps', (req, res) => {
  const stats = getAppStats();
  res.json({
    message: "In-memory stored apps",
    totalStreams: Object.keys(global.buildStreams || {}).length,
    activeStreams: Object.keys(global.buildStreams || {}),
    serverTime: new Date().toISOString(),
    appStats: stats,
    instructions: "Each app is stored in server memory and auto-cleaned after 1 hour"
  });
});

// Get app details
app.get('/debug/apps/:appId', (req, res) => {
  const { appId } = req.params;
  const appUrl = getAppUrl(appId);
  const appFiles = getAppFiles(appId);
  
  if (!appFiles) {
    return res.json({ error: 'App not found', appId });
  }
  
  res.json({
    appId,
    url: appUrl,
    status: 'active',
    files: Object.keys(appFiles),
    accessUrl: `/apps/${appId}/`
  });
});

// Get app files as JSON
app.get('/debug/apps/:appId/files', (req, res) => {
  const { appId } = req.params;
  const appFiles = getAppFiles(appId);
  
  if (!appFiles) {
    return res.status(404).json({ error: 'App not found', appId });
  }
  
  res.json({
    appId,
    files: appFiles
  });
});

// Delete an app
app.delete('/debug/apps/:appId', (req, res) => {
  const { appId } = req.params;
  
  const deleted = deleteApp(appId);
  
  if (!deleted) {
    return res.status(404).json({ error: 'App not found', appId });
  }
  
  res.json({ message: 'App deleted successfully', appId });
});

// Code viewer page
app.get('/debug/apps/:appId/code', (req, res) => {
  const { appId } = req.params;
  const appDetails = getAppDetails(appId);
  
  if (!appDetails) {
    return res.status(404).send(`
      <div style="font-family: system-ui; text-align: center; margin-top: 50px;">
        <h2>App Not Found</h2>
        <p>App ${appId} may have expired or doesn't exist.</p>
        <a href="/debug" style="color: #007AFF;">← Back to Dashboard</a>
      </div>
    `);
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Code Viewer - ${appId}</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f5f5f5;
                min-height: 100vh;
            }
            .header {
                background: white;
                padding: 1.5rem 2rem;
                border-bottom: 1px solid #ddd;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .header-left h1 {
                color: #333;
                font-size: 1.5rem;
                margin-bottom: 0.25rem;
            }
            .header-left .subtitle {
                color: #666;
                font-size: 14px;
            }
            .header-actions {
                display: flex;
                gap: 0.5rem;
            }
            .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                transition: background-color 0.2s ease;
            }
            .btn-primary { background: #007AFF; color: white; }
            .btn-secondary { background: #f8f9fa; color: #333; border: 1px solid #dee2e6; }
            .btn:hover { opacity: 0.8; }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 2rem;
            }
            .prompt-section {
                background: white;
                padding: 1.5rem;
                border-radius: 8px;
                margin-bottom: 2rem;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .prompt-section h3 {
                color: #333;
                margin-bottom: 0.5rem;
                font-size: 1.1rem;
            }
            .prompt-text {
                color: #555;
                font-style: italic;
                line-height: 1.5;
            }
            .files-section {
                display: grid;
                gap: 2rem;
            }
            .file-card {
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .file-header {
                background: #f8f9fa;
                padding: 1rem 1.5rem;
                border-bottom: 1px solid #dee2e6;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .file-name {
                font-family: 'Monaco', 'Menlo', monospace;
                font-weight: 600;
                color: #333;
            }
            .copy-btn {
                background: #28a745;
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
            }
            .file-content {
                max-height: 500px;
                overflow-y: auto;
            }
            .file-content pre {
                margin: 0 !important;
                padding: 1.5rem !important;
                background: #fafafa !important;
            }
            .file-content code {
                font-size: 13px;
                line-height: 1.5;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="header-left">
                <h1>📝 Code Viewer</h1>
                <div class="subtitle">App ID: ${appId} | Created: ${new Date(appDetails.createdAt).toLocaleString()}</div>
            </div>
            <div class="header-actions">
                <a href="/apps/${appId}/" class="btn btn-primary" target="_blank">View App</a>
                <a href="/debug/apps/${appId}/download" class="btn btn-secondary">Download</a>
                <a href="/debug" class="btn btn-secondary">← Dashboard</a>
            </div>
        </div>
        
        <div class="container">
            <div class="prompt-section">
                <h3>Original Prompt</h3>
                <div class="prompt-text">"${appDetails.prompt || 'No prompt available'}"</div>
            </div>
            
            <div class="files-section">
                ${Object.entries(appDetails.files).map(([filename, content]) => {
                  const language = filename.endsWith('.html') ? 'html' : 
                                 filename.endsWith('.css') ? 'css' : 
                                 filename.endsWith('.js') ? 'javascript' : 'text';
                  
                  return `
                    <div class="file-card">
                        <div class="file-header">
                            <div class="file-name">${filename}</div>
                            <button class="copy-btn" onclick="copyToClipboard('${filename}', \`${content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">Copy</button>
                        </div>
                        <div class="file-content">
                            <pre><code class="language-${language}">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                        </div>
                    </div>
                  `;
                }).join('')}
            </div>
        </div>
        
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
        
        <script>
            function copyToClipboard(filename, content) {
                navigator.clipboard.writeText(content).then(() => {
                    const btn = event.target;
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied!';
                    btn.style.background = '#28a745';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = '#28a745';
                    }, 2000);
                }).catch(err => {
                    alert('Failed to copy to clipboard');
                });
            }
        </script>
    </body>
    </html>
  `);
});

// Download app as ZIP
app.get('/debug/apps/:appId/download', (req, res) => {
  const { appId } = req.params;
  const appDetails = getAppDetails(appId);
  
  if (!appDetails) {
    return res.status(404).json({ error: 'App not found', appId });
  }
  
  // Set headers for ZIP download
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="webbers-app-${appId}.zip"`);
  
  // Create ZIP archive
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });
  
  // Handle archive errors
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    res.status(500).send('Error creating ZIP file');
  });
  
  // Pipe archive to response
  archive.pipe(res);
  
  // Add app files to archive
  Object.entries(appDetails.files).forEach(([filename, content]) => {
    archive.append(content, { name: filename });
  });
  
  // Add metadata file
  const metadata = {
    appId: appDetails.appId,
    createdAt: new Date(appDetails.createdAt).toISOString(),
    prompt: appDetails.prompt,
    generatedBy: "Webbers - AI Web App Builder",
    files: Object.keys(appDetails.files)
  };
  
  archive.append(JSON.stringify(metadata, null, 2), { name: 'webbers-metadata.json' });
  
  // Add README
  const readme = `# ${appId} - Generated Web App

## About
This web app was generated by Webbers, an AI-powered web app builder.

**Created:** ${new Date(appDetails.createdAt).toLocaleString()}
**Prompt:** "${appDetails.prompt}"

## Files
${Object.keys(appDetails.files).map(file => `- ${file}`).join('\n')}

## Usage
1. Open \`index.html\` in a web browser
2. Or serve with any HTTP server (e.g., \`python -m http.server\`)

## Generated by
🚀 Webbers - AI Web App Builder
`;
  
  archive.append(readme, { name: 'README.md' });
  
  // Finalize the archive
  archive.finalize();
});

// Build web app with streaming logs
app.post('/build-with-logs', async (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Prompt is required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ 
      success: false, 
      error: 'OPENAI_API_KEY not configured. Please add it to your .env file.' 
    });
  }

  const userIP = getUserIP(req);
  
  // Generate app ID immediately and return it
  const appId = crypto.randomUUID().slice(0, 8);
  
  // Return the app ID immediately so client can connect to stream
  res.json({ success: true, appId, building: true });
  
  // Start building in background
  setTimeout(() => {
    buildWebAppWithLogs(prompt, userIP, appId);
  }, 100); // Small delay to ensure client connects to stream first
});

app.listen(PORT, () => {
    console.log(`🚀 Webbers server running at http://localhost:${PORT}`);
    console.log('💾 Using in-memory storage (simple & fast)');
    console.log('🧹 Auto-cleanup: Apps expire after 1 hour');
    console.log('⚡ Apps served directly from server memory');
    console.log('📊 Debug: /debug/apps');
    
    if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️  Warning: OPENAI_API_KEY not found in environment variables');
        console.log('   Please create a .env file with your API key:');
        console.log('   OPENAI_API_KEY=your_openai_api_key_here');
    }
});