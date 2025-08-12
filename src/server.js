import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { buildWebApp, buildWebAppWithLogs, getAppUrl, getAppFiles, getAppStats, deleteApp, getAppDetails } from './appBuilder.js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Load design config and expose theme CSS helper
const DESIGN_PATH = path.resolve(process.cwd(), 'design.json');
let designConfig = null;
try {
  const raw = fs.readFileSync(DESIGN_PATH, 'utf-8');
  designConfig = JSON.parse(raw);
} catch (e) {
  designConfig = null;
}

function themeCSS() {
  const palette = designConfig?.design_style?.color_palette || {};
  const spacing = designConfig?.spacing || {};
  const primary = palette.primary || '#000000';
  const secondary = palette.secondary || '#FFFFFF';
  const accent = palette.accent || '#00FF85';
  const neutral1 = (palette.neutral_tones && palette.neutral_tones[0]) || '#F7F7F7';
  const neutral2 = (palette.neutral_tones && palette.neutral_tones[1]) || '#EAEAEA';
  const contentMax = spacing.content_max_width || '1200px';
  const gridGap = spacing.grid_gap || '24px';

  return `
:root{--color-primary:${primary};--color-secondary:${secondary};--color-accent:${accent};--color-neutral-1:${neutral1};--color-neutral-2:${neutral2};--content-max:${contentMax};--grid-gap:${gridGap}}
*{box-sizing:border-box}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,system-ui,sans-serif;color:var(--color-primary);background:var(--color-neutral-1);line-height:1.5}
a{color:var(--color-accent);text-decoration:none}
a:hover{text-decoration:underline}
 .container{max-width:min(98vw,2000px);margin:0 auto;padding:0 16px}
.card{background:var(--color-secondary);border:1px solid var(--color-neutral-2);border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.06)}
.btn{display:inline-block;border-radius:12px;padding:12px 20px;font-weight:600;border:1px solid var(--color-primary);background:transparent;color:var(--color-primary);cursor:pointer;transition:transform .15s ease, box-shadow .15s ease}
.btn:hover{transform:translateY(-1px)}
.btn-primary{background:var(--color-accent);color:#000;border-color:var(--color-accent)}
.btn-secondary{background:var(--color-secondary);color:var(--color-primary);border-color:var(--color-neutral-2)}
.btn-danger{background:#e11d48;color:#fff;border-color:#e11d48}
.input, textarea{background:var(--color-secondary);color:var(--color-primary);border:1px solid var(--color-neutral-2);border-radius:12px;padding:16px}
.header{position:fixed;top:0;left:0;right:0;background:var(--color-secondary);border-bottom:1px solid var(--color-neutral-2);z-index:10}
.header-inner{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-weight:800}
.nav{display:flex;gap:24px;align-items:center}
.page{padding-top:80px}
.hero{display:flex;gap:48px;align-items:center;padding:80px 0}
.headline{font-weight:800;font-size:clamp(40px,8vw,72px);line-height:1.1;letter-spacing:-0.02em}
.headline-italic{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:400}
.subtext{color:#555;margin-top:12px;font-size:16px}
.reveal{opacity:0;transform:translateY(8px);transition:all .4s ease}
.reveal.visible{opacity:1;transform:none}
.spinner{border:3px solid #f3f3f3;border-top:3px solid var(--color-accent);border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite}
.hidden{display:none!important}
@keyframes spin{to{transform:rotate(360deg)}}
`;
}

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
            ${themeCSS()}
            .container { max-width: min(99vw, 2000px); }
            .hero { flex-direction: column; text-align: center; padding: 96px 0 64px; gap: 28px; }
            .brand-hero { font-weight: 900; font-size: clamp(56px, 11vw, 104px); letter-spacing: -0.04em; line-height: 1.05; display: inline-block; padding-right: 0.08em; background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
            .headline { font-size: clamp(24px, 4vw, 36px); font-weight: 800; letter-spacing: -0.01em; }
            .hero-form { margin-top: 8px; }
            .input-shell { background: var(--color-secondary); border: 1px solid var(--color-neutral-2); border-radius: 16px; padding: 18px 64px 18px 18px; position: relative; box-shadow: 0 6px 26px rgba(0,0,0,.06); }
            .prompt-row { display: block; }
            .textarea-compact { width: 100%; resize: none; min-height: 3.6em; max-height: 6.4em; line-height: 1.35; padding: 2px 0 4px; border: none; outline: none; background: transparent; }
            .btn-icon { width: 48px; height: 48px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--color-accent); background: var(--color-accent); color: #000; font-size: 20px; padding: 0; position: absolute; right: 8px; bottom: 8px; }
            .btn-icon:hover { box-shadow: 0 10px 24px rgba(0,0,0,.08); }
            .examples { margin-top: 28px; text-align: left; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
            .example { background: var(--color-neutral-1); border: 1px solid var(--color-neutral-2); padding: 12px 16px; border-radius: 12px; font-size: 14px; color: #555; cursor: pointer; transition: transform .15s ease, background-color .2s ease; }
            .example:hover { background: #f0f0f0; transform: translateY(-1px); }
            /* Hide header bar on home and remove top spacing */
            .header { display: none !important; }
            .page { padding-top: 0; }
        </style>
    </head>
    <body>
        <header class="header">
          <div class="container header-inner">
            <div class="brand">Webbers</div>
            <nav class="nav"></nav>
            <div class="actions"></div>
          </div>
        </header>
        <main class="page">
          <div class="container">
            <section class="hero reveal">
              <div class="brand-hero">Webbers</div>
              <p class="headline">What will you build today?</p>
              <p class="subtext">Describe your idea and watch it come to life.</p>
              <div class="hero-form">
                <form id="promptForm">
                  <div class="input-shell">
                    <div class="prompt-row">
                      <textarea id="prompt" class="textarea-compact" rows="3" placeholder="Describe the web app you want to build..." required></textarea>
                    </div>
                    <button type="submit" id="generateBtn" class="btn btn-icon" aria-label="Generate">→</button>
                  </div>
                </form>
              </div>
              <div class="examples reveal">
                <div class="example" onclick="fillExample('Create a simple calculator app with basic arithmetic operations')">Create a simple calculator app with basic arithmetic operations</div>
                <div class="example" onclick="fillExample('Build a to-do list app with add, delete, and mark complete functionality')">Build a to-do list app with add, delete, and mark complete functionality</div>
                <div class="example" onclick="fillExample('Make a weather app that shows current conditions for a city')">Make a weather app that shows current conditions for a city</div>
                <div class="example" onclick="fillExample('Create a simple color picker tool with hex and RGB values')">Create a simple color picker tool with hex and RGB values</div>
              </div>
            </section>
          </div>
        </main>

        <script>
            function fillExample(text) { document.getElementById('prompt').value = text; }
            document.getElementById('promptForm').addEventListener('submit', (e) => {
                e.preventDefault();
                const prompt = document.getElementById('prompt').value.trim();
                if (prompt) { window.location.href = \`/build?prompt=\${encodeURIComponent(prompt)}\`; }
            });
            const onIntersect = (entries) => { entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }); };
            const observer = new IntersectionObserver(onIntersect, { threshold: 0.1 });
            document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
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
            ${themeCSS()}
            body { background: var(--color-neutral-1); }
            .header { position: static; }
            .main-container { display: flex; height: calc(100vh - 64px); overflow: hidden; }
            .left-panel { width: 420px; background: var(--color-secondary); border-right: 1px solid var(--color-neutral-2); display: flex; flex-direction: column; }
            .prompt-section { padding: 16px; border-bottom: 1px solid var(--color-neutral-2); background: var(--color-secondary); }
            .prompt-text { font-size: 14px; color: #333; line-height: 1.4; margin: 0; }
            .logs-section { flex: 1; overflow-y: auto; padding: 16px; background: var(--color-secondary); }
            .log-entry { margin-bottom: 12px; padding: 10px 12px; border-radius: 10px; font-size: 14px; line-height: 1.4; }
            .log-info { background: #e6fffb; color: #0f766e; border-left: 4px solid #2dd4bf; }
            .log-success { background: #ecfdf5; color: #065f46; border-left: 4px solid #10b981; }
            .log-error { background: #fef2f2; color: #b91c1c; border-left: 4px solid #ef4444; }
            .log-time { font-size: 12px; opacity: 0.7; margin-bottom: 4px; }
            .right-panel { flex: 1; background: var(--color-secondary); position: relative; }
            .app-preview { width: 100%; height: 100%; border: none; }
            .preview-placeholder { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#666; font-size:1.2rem; text-align:center; padding:2rem; flex-direction:column; background: var(--color-secondary); }
        </style>
    </head>
    <body>
        <div class="header">
          <div class="header-inner" style="padding: 0 24px;">
            <h1 style="font-size:18px;">Webbers</h1>
            <a href="/" class="btn btn-secondary">← New App</a>
          </div>
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
                    <div class="spinner" style="margin-bottom:12px;"></div>
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
                placeholder.classList.remove('hidden');
                appFrame.classList.add('hidden');
                
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
                                appFrame.onload = () => {
                                  appFrame.classList.remove('hidden');
                                  placeholder.classList.add('hidden');
                                  appFrame.contentWindow?.focus?.();
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                };
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
            ${themeCSS()}
            body { background: var(--color-neutral-1); }
            .header { position: static; }
            .stats { display: flex; gap: 12px; margin: 12px 0; }
            .stat { background: var(--color-secondary); color: var(--color-primary); padding: 8px 12px; border-radius: 10px; border: 1px solid var(--color-neutral-2); font-size: 14px; }
            .apps-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--grid-gap); margin-top: 24px; }
            .app-card { background: var(--color-secondary); border: 1px solid var(--color-neutral-2); border-radius: 12px; padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,.06); transition: transform .15s ease, box-shadow .15s ease; }
            .app-card:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,.08); }
            .app-id { font-family: 'Monaco', 'Menlo', monospace; font-size: 18px; font-weight: 600; margin-bottom: 6px; }
            .app-meta { font-size: 12px; color: #666; margin-bottom: 12px; }
            .app-actions { display: flex; gap: 8px; flex-wrap: wrap; }
            .refresh-btn { margin-left: 8px; }
            .empty-state { text-align: center; padding: 48px 24px; color: #666; }
        </style>
    </head>
    <body>
        <div class="header">
          <div class="container header-inner">
            <div class="brand">🚀 Webbers Dashboard</div>
            <div><a href="/" class="btn btn-primary">Create New App</a></div>
          </div>
        </div>
        
        <div class="container">
            <p class="subtext">Manage your generated web apps</p>
            <div class="stats">
                <div class="stat">📱 ${stats.totalApps} Active Apps</div>
                <div class="stat">📊 ${Object.keys(global.buildStreams || {}).length} Building</div>
                <div class="stat">🕐 Auto-cleanup: 1 hour</div>
            </div>
            <div style="margin-top: 12px;">
                <a href="/" class="btn btn-primary">Create New App</a>
                <button onclick="location.reload()" class="btn btn-secondary refresh-btn">Refresh</button>
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
            ${themeCSS()}
            body { background: var(--color-neutral-1); }
            .header { position: static; }
            .header-left h1 { font-size: 20px; margin: 0; }
            .header-left .subtitle { color: #666; font-size: 14px; }
            .header-actions { display: flex; gap: 8px; }
            .container { max-width: clamp(1200px, 92vw, 1400px); margin: 0 auto; padding: 24px; }
            .prompt-section { background: var(--color-secondary); padding: 16px; border-radius: 12px; margin-bottom: 24px; border: 1px solid var(--color-neutral-2); box-shadow: 0 2px 12px rgba(0,0,0,.05); }
            .prompt-section h3 { margin: 0 0 8px; font-size: 16px; }
            .prompt-text { color: #555; font-style: italic; line-height: 1.5; }
            .files-section { display: grid; gap: 24px; }
            .file-card { background: var(--color-secondary); border-radius: 12px; overflow: hidden; border: 1px solid var(--color-neutral-2); box-shadow: 0 2px 12px rgba(0,0,0,.05); }
            .file-header { background: #fafafa; padding: 12px 16px; border-bottom: 1px solid var(--color-neutral-2); display: flex; align-items: center; justify-content: space-between; }
            .file-name { font-family: 'Monaco', 'Menlo', monospace; font-weight: 600; }
            .copy-btn { background: var(--color-accent); color: #000; border: 1px solid var(--color-accent); padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; }
            .file-content { max-height: 500px; overflow-y: auto; }
            .file-content pre { margin: 0 !important; padding: 16px !important; background: #fafafa !important; }
            .file-content code { font-size: 13px; line-height: 1.5; }
        </style>
    </head>
    <body>
        <div class="header">
          <div class="container header-inner">
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
                    btn.style.background = 'var(--color-accent)';
                    btn.style.color = '#000';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = 'var(--color-accent)';
                        btn.style.color = '#000';
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
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    res.status(500).send('Error creating ZIP file');
  });
  
  archive.pipe(res);
  
  Object.entries(appDetails.files).forEach(([filename, content]) => {
    archive.append(content, { name: filename });
  });
  
  const metadata = {
    appId: appDetails.appId,
    createdAt: new Date(appDetails.createdAt).toISOString(),
    prompt: appDetails.prompt,
    generatedBy: "Webbers - AI Web App Builder",
    files: Object.keys(appDetails.files)
  };
  archive.append(JSON.stringify(metadata, null, 2), { name: 'webbers-metadata.json' });
  
  const readme = `# ${appId} - Generated Web App\n\n## About\nThis web app was generated by Webbers, an AI-powered web app builder.\n\n**Created:** ${new Date(appDetails.createdAt).toLocaleString()}\n**Prompt:** "${appDetails.prompt}"\n\n## Files\n${Object.keys(appDetails.files).map(file => `- ${file}`).join('\n')}\n\n## Usage\n1. Open \`index.html\` in a web browser\n2. Or serve with any HTTP server (e.g., \`python -m http.server\`)\n\n## Generated by\nWebbers - AI Web App Builder\n`;
  archive.append(readme, { name: 'README.md' });
  
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
  const appId = crypto.randomUUID().slice(0, 8);
  res.json({ success: true, appId, building: true });
  setTimeout(() => { buildWebAppWithLogs(prompt, userIP, appId); }, 100);
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