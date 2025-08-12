import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

export async function buildWebApp(prompt, appId) {
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
    console.log(`Building web app for prompt: "${prompt}"`);
    
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Build a web application: ${prompt}` }
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    const response = completion.choices[0].message.content;

    // Extract files from response
    const files = extractFiles(response);
    
    // Create app directory
    const appDir = path.join('generated-apps', appId);
    if (!fs.existsSync('generated-apps')) {
      fs.mkdirSync('generated-apps');
    }
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir);
    }

    // Write files
    for (const [filename, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(appDir, filename), content);
    }
    
    return {
      success: true,
      appId,
      files: Object.keys(files),
      response
    };

  } catch (error) {
    console.error("Error building web app:", error.message);
    return {
      success: false,
      error: error.message,
      prompt
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