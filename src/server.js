import express from 'express';
import cors from 'cors';
import path from 'path';
import { buildWebApp, buildWebAppWithLogs } from './appBuilder.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from generated-apps directory
app.use('/apps', express.static('generated-apps'));

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
                        // Connect to logs stream
                        eventSource = new EventSource(\`/build-stream/\${data.appId}\`);
                        
                        eventSource.onmessage = function(event) {
                            const logData = JSON.parse(event.data);
                            
                            if (logData.type === 'complete') {
                                const completeData = JSON.parse(logData.message);
                                // Load the app in iframe
                                appFrame.src = \`/apps/\${completeData.appId}/\`;
                                appFrame.classList.remove('hidden');
                                placeholder.classList.add('hidden');
                                eventSource.close();
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

// Build web app endpoint with Server-Sent Events for real-time logs
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

  const appId = Date.now().toString();
  
  try {
    const result = await buildWebApp(prompt, appId);
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

  const appId = Date.now().toString();
  
  // Send app ID immediately so client can start listening to logs
  res.json({ success: true, appId, building: true });
  
  // Start building in background
  buildWebAppWithLogs(prompt, appId);
});

app.listen(PORT, () => {
    console.log(`🚀 Webbers server running at http://localhost:${PORT}`);
    if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  Warning: OPENAI_API_KEY not found in environment variables');
    console.log('   Please create a .env file with your API key:');
    console.log('   OPENAI_API_KEY=your_openai_api_key_here');
  }
});