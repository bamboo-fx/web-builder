import express from 'express';
import cors from 'cors';
import path from 'path';
import { buildWebApp } from './appBuilder.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from generated-apps directory
app.use('/apps', express.static('generated-apps'));

// Simple HTML interface
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Webbers - Web App Builder</title>
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 800px; 
                margin: 2rem auto; 
                padding: 2rem;
                background: #f5f5f5;
            }
            .container {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { color: #333; margin-bottom: 1rem; }
            textarea { 
                width: 100%; 
                height: 120px; 
                padding: 1rem;
                border: 2px solid #ddd;
                border-radius: 4px;
                font-size: 16px;
                resize: vertical;
            }
            button { 
                background: #007AFF; 
                color: white; 
                border: none; 
                padding: 12px 24px; 
                border-radius: 4px;
                font-size: 16px;
                cursor: pointer;
                margin-top: 1rem;
            }
            button:hover { background: #0056CC; }
            button:disabled { background: #ccc; cursor: not-allowed; }
            .result {
                margin-top: 2rem;
                padding: 1rem;
                border-radius: 4px;
            }
            .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
            .loading { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Webbers - Web App Builder</h1>
            <p>Describe the web app you want to build, and I'll create it for you using Claude Code SDK!</p>
            
            <form id="appForm">
                <textarea 
                    id="prompt" 
                    placeholder="Example: Create a simple calculator app with basic arithmetic operations..."
                    required
                ></textarea>
                <br>
                <button type="submit" id="buildBtn">Build Web App</button>
            </form>
            
            <div id="result"></div>
        </div>

        <script>
            document.getElementById('appForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const prompt = document.getElementById('prompt').value;
                const buildBtn = document.getElementById('buildBtn');
                const result = document.getElementById('result');
                
                buildBtn.disabled = true;
                buildBtn.textContent = 'Building...';
                result.innerHTML = '<div class="result loading">🔨 Building your web app... This may take a moment.</div>';
                
                try {
                    const response = await fetch('/build', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        result.innerHTML = \`
                            <div class="result success">
                                <h3>✅ Web app created successfully!</h3>
                                <p><strong>App ID:</strong> \${data.appId}</p>
                                <p><strong>Files created:</strong> \${data.files.join(', ')}</p>
                                <p><strong>View your app:</strong> <a href="/apps/\${data.appId}/" target="_blank">Open App</a></p>
                            </div>
                        \`;
                    } else {
                        result.innerHTML = \`
                            <div class="result error">
                                <h3>❌ Failed to create app</h3>
                                <p>\${data.error}</p>
                            </div>
                        \`;
                    }
                } catch (error) {
                    result.innerHTML = \`
                        <div class="result error">
                            <h3>❌ Error</h3>
                            <p>\${error.message}</p>
                        </div>
                    \`;
                } finally {
                    buildBtn.disabled = false;
                    buildBtn.textContent = 'Build Web App';
                }
            });
        </script>
    </body>
    </html>
  `);
});

// Build web app endpoint
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

app.listen(PORT, () => {
    console.log(`🚀 Webbers server running at http://localhost:${PORT}`);
    if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  Warning: OPENAI_API_KEY not found in environment variables');
    console.log('   Please create a .env file with your API key:');
    console.log('   OPENAI_API_KEY=your_openai_api_key_here');
  }
});