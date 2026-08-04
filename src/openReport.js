const { execFile } = require('child_process');
const path = require('path');

function openReportInBrowser(filePath) {
  const normalizedPath = path.resolve(filePath);

  let command;
  let args;

  if (process.platform === 'win32') {
    // Use cmd.exe explicitly with the start command
    command = 'cmd.exe';
    args = ['/c', 'start', '', normalizedPath];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [normalizedPath];
  } else {
    command = 'xdg-open';
    args = [normalizedPath];
  }

  execFile(command, args, (error) => {
    if (error) {
      console.warn(`⚠️ Could not open the report automatically: ${error.message}`);
      console.warn(`You can open it manually here: ${normalizedPath}`);
    } else {
      console.log(`🌐 Opening HTML report in your browser...`);
    }
  });
}

module.exports = { openReportInBrowser };
