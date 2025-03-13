const mjml = require('mjml');
const fs = require('fs');
const path = require('path');

const templatesDir = path.resolve('./src/templates'); // Ensure correct absolute path

console.log('Resolved footer path:', path.resolve('./src/components/footer.mjml'));

// Read all MJML files and convert them to HTML
fs.readdirSync(templatesDir).forEach((file) => {
  if (file.endsWith('.mjml')) {
    const filePath = path.join(templatesDir, file);
    const mjmlTemplate = fs.readFileSync(filePath, 'utf8');

    // Convert MJML to HTML
    const { html, errors } = mjml(mjmlTemplate, { filePath }); // Important: filePath ensures includes work!

    // Check if there are MJML errors
    if (errors.length > 0) {
      console.error(`MJML errors in ${filePath}:`, errors);
      return;
    }

    // Write to an HTML file
    const outputFilePath = filePath.replace('.mjml', '.html');
    fs.writeFileSync(outputFilePath, html);
    console.log(`✅ Generated: ${outputFilePath}`);
  }
});
