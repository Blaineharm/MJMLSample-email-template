const fs = require('fs');
const path = require('path');
const mjml = require('mjml');

// Logging setup
const logDir = path.resolve(__dirname, './logs');
const logFile = path.join(logDir, 'mjml_conversion.log');

// Ensure logs directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Function to log messages
function logMessage(message, isError = false) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;

  // Write to file
  fs.appendFileSync(logFile, logEntry, 'utf8');

  // Also log to console
  isError ? console.error(logEntry) : console.log(logEntry);
}

// Read command line arguments
const args = process.argv.slice(2);
const placeholders = {};
let templateName = 'defaultTemplate.mjml';

logMessage('🚀 Script started');

args.forEach((arg, index) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const value = args[index + 1];
    if (key === 'template' && value) {
      templateName = value.trim(); // Ensure no leading/trailing spaces
    } else if (value && !value.startsWith('--')) {
      placeholders[`{{${key}}}`] = value;
    }
  }
});

logMessage(`📌 Using template: ${templateName}`);

// Function to find the template file
function findTemplateFile(baseDir, fileName) {
  let files = fs.readdirSync(baseDir, { withFileTypes: true });
  for (let file of files) {
    let fullPath = path.join(baseDir, file.name);
    if (file.isDirectory()) {
      let found = findTemplateFile(fullPath, fileName);
      if (found) return found;
    } else if (file.name === fileName) {
      return fullPath;
    }
  }
  return null;
}

const streamsDir = path.resolve(__dirname, './src/streams');
const mjmlTemplatePath = findTemplateFile(streamsDir, templateName);

if (!mjmlTemplatePath) {
  logMessage(`❌ Error: Template '${templateName}' not found in src/streams`, true);
  process.exit(1);
}

logMessage(`📄 Template found: ${mjmlTemplatePath}`);

// Function to resolve <mj-include>
function resolveIncludes(content, basePath) {
  return content.replace(/<mj-include path="(.*?)"\s*\/?>/g, (match, includePath) => {
    const includeFilePath = path.resolve(basePath, includePath);
    if (fs.existsSync(includeFilePath)) {
      logMessage(`✅ Included file: ${includeFilePath}`);
      return fs.readFileSync(includeFilePath, 'utf8');
    } else {
      logMessage(`❌ Error: Included file not found - ${includeFilePath}`, true);
      return `<!-- Failed to include: ${includeFilePath} -->`;
    }
  });
}

// Read and process the MJML file
fs.readFile(mjmlTemplatePath, 'utf8', (err, mjmlContent) => {
  if (err) {
    logMessage(`❌ Error reading MJML file: ${err.message}`, true);
    return;
  }

  // Resolve includes
  let processedMjml = resolveIncludes(mjmlContent, path.dirname(mjmlTemplatePath));

  // Replace placeholders
  Object.keys(placeholders).forEach((key) => {
    processedMjml = processedMjml.replace(new RegExp(key, 'g'), placeholders[key]);
  });

  // Convert MJML to HTML
  const { html, errors } = mjml(processedMjml, { filePath: mjmlTemplatePath });

  if (errors.length > 0) {
    logMessage(`❌ MJML Conversion Errors: ${JSON.stringify(errors, null, 2)}`, true);
    return;
  }

  logMessage('✅ MJML conversion successful');

  // Write to an HTML file in the same folder as the MJML template, replacing if it exists
  const outputFilePath = mjmlTemplatePath.replace('.mjml', '.html');
  fs.writeFileSync(outputFilePath, html, { flag: 'w' });

  logMessage(`✅ Generated HTML: ${outputFilePath}`);
});
