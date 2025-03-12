const fs = require('fs');
const path = require('path');
const mjml = require('mjml');
const Mailjet = require('node-mailjet');
require('dotenv').config(); // Load environment variables from .env file

// Read command line arguments for placeholders and template
const args = process.argv.slice(2); // Extract arguments passed to script
const placeholders = {};
let templateName = 'defaultTemplate.mjml'; // Default template name

// Example of how placeholders could be passed:
// node processMJML.js --template "customTemplate.mjml" --name "John Doe" --order_id "12345"

args.forEach((arg, index) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const value = args[index + 1];
    if (key === 'template' && value) {
      templateName = value; // Set the template name if specified
    } else if (value && !value.startsWith('--')) {
      placeholders[`{{${key}}}`] = value; // Replace placeholders
    }
  }
});

// Define the path to the MJML template (prepend the directory path)
const mjmlTemplatePath = path.resolve(__dirname, './src/templates', templateName);

// Function to resolve and replace <mj-include>
function resolveIncludes(content, basePath) {
  return content.replace(/<mj-include path="(.*?)"\s*\/>/g, (match, includePath) => {
    const includeFilePath = path.resolve(basePath, includePath);
    if (fs.existsSync(includeFilePath)) {
      return fs.readFileSync(includeFilePath, 'utf8');
    } else {
      console.error(`Error: Included file not found - ${includeFilePath}`);
      return `<!-- Failed to include: ${includeFilePath} -->`;
    }
  });
}

// Read and process the MJML file
fs.readFile(mjmlTemplatePath, 'utf8', (err, mjmlContent) => {
  if (err) {
    console.error('Error reading MJML file:', err);
    return;
  }

  // Resolve all includes before processing MJML
  let processedMjml = resolveIncludes(mjmlContent, path.dirname(mjmlTemplatePath));

  // Replace placeholders dynamically in the processed MJML
  Object.keys(placeholders).forEach((key) => {
    processedMjml = processedMjml.replace(new RegExp(key, 'g'), placeholders[key]);
  });

  // Convert MJML to HTML
  const { html, errors } = mjml(processedMjml);

  if (errors.length > 0) {
    console.error('MJML Conversion Errors:', errors);
    return;
  }

  console.log('Generated HTML:');
  console.log(html);

  // Send the email using Mailjet API
  const mailjet = Mailjet.apiConnect(
    '3e14a321932092bef164b8e368bf2c59',
    'd7f2640fdc0c0af2d4fcbe12243f7341'
  );


  const request = mailjet
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: {
            Email: 'bharmsen@qualco.co.uk',
            Name: 'Test Email'
          },
          To: [
            {
              Email: 'bharmsen@qualco.co.uk',
              Name: 'Test Email'
            }
          ],
          Subject: 'Test email subject',
          TextPart: 'Test Email text part',
          HTMLPart: html // Send the actual HTML content
        }
      ]
    });

  // Handle request response
  request
    .then((result) => {
      console.log('Email sent successfully:', result.body);
    })
    .catch((err) => {
      console.error('Error sending email:', err.statusCode);
    });
});
