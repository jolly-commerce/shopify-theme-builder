#!/usr/bin/env node

const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

async function main() {
    // Get commit message file path from command line argument
    const commitMsgFile = process.argv[2];

    if (!commitMsgFile) {
        console.error('❌ Error: No commit message file provided');
        process.exit(1);
    }

    // Check if commit message file exists
    if (!fs.existsSync(commitMsgFile)) {
        console.error(`❌ Error: Commit message file not found: ${commitMsgFile}`);
        process.exit(1);
    }

    // Read commit message and description
    let commitContent = '';
    try {
        commitContent = fs.readFileSync(commitMsgFile, 'utf8');
    } catch (error) {
        console.error(`❌ Error reading commit message file: ${error.message}`);
        process.exit(1);
    }

    // Display commit message
    console.log('📝 Commit message and description:');
    console.log('────────────────────────────────────────');
    console.log(commitContent.trim());
    console.log('────────────────────────────────────────');

    // Check for skip flags in commit message/description
    const hasSkipFlag = commitContent.includes('--skip-theme-check') || commitContent.includes('--no-verify');

    if (hasSkipFlag) {
        console.log('🚫 Found skip flag in commit message (--skip-theme-check or --no-verify)');
        console.log('⚠️  WARNING: Theme validation will be SKIPPED!');
        console.log('✅ Creating skip flag for pre-commit hook...');
        
        // Create flag file to tell pre-commit to skip
        const fs = require('fs');
        fs.writeFileSync('.git/SKIP_THEME_CHECK', 'skip');
        
        console.log('✅ Proceeding without theme development check...');
        process.exit(0);
    }

    // No skip flag found, run theme validation
    console.log('✅ No skip flag found, running theme validation...');

// Kill any existing Shopify theme dev processes before starting (cross-platform)
function killExistingShopifyProcesses() {
    return new Promise((resolve) => {
        const { exec } = require('child_process');
        
        if (process.platform === 'win32') {
            // Windows: Enhanced port killing - be more thorough
            console.log('🔄 Checking for processes on port 9292 (Windows)...');
            
            exec('netstat -ano | findstr :9292', (err, portOutput) => {
                if (portOutput && portOutput.trim()) {
                    console.log('🔄 Found processes on port 9292, killing them...');
                    const lines = portOutput.split('\n').filter(line => line.trim());
                    let killCount = 0;
                    
                    lines.forEach(line => {
                        const match = line.match(/\s+(\d+)\s*$/);
                        if (match && match[1]) {
                            killCount++;
                            exec(`taskkill /F /PID ${match[1]} 2>nul`, (killErr) => {
                                if (!killErr) {
                                    console.log(`✅ Killed process PID ${match[1]}`);
                                }
                            });
                        }
                    });
                    
                    // Wait longer for Windows cleanup
                    setTimeout(() => {
                        console.log(`🔄 Killed ${killCount} processes, waiting for cleanup...`);
                        resolve();
                    }, 3000);
                } else {
                    console.log('✅ Port 9292 is free');
                    resolve();
                }
            });
        } else {
            // Mac/Linux: Kill by port and process name
            exec('lsof -ti:9292', (err, portOutput) => {
                if (portOutput && portOutput.trim()) {
                    console.log('🔄 Killing existing process on port 9292 (Mac/Linux)...');
                    exec('lsof -ti:9292 | xargs kill -9 2>/dev/null', () => {
                        exec('pkill -f "shopify theme dev" 2>/dev/null', () => {
                            setTimeout(resolve, 1000);
                        });
                    });
                } else {
                    exec('pkill -f "shopify theme dev" 2>/dev/null', () => {
                        resolve();
                    });
                }
            });
        }
    });
}

// Kill existing processes first
console.log('🔄 Checking for existing Shopify processes...');
await killExistingShopifyProcesses();

// Run npm run dev2
console.log('🔍 Running npm run dev2 to check for errors...');

// Start npm run dev2 with proper Windows compatibility
let devProcess;
if (process.platform === 'win32') {
    // Windows: Use cmd.exe to run npm properly
    devProcess = spawn('cmd.exe', ['/c', 'npm', 'run', 'dev2'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
    });
} else {
    // Unix/Mac: Direct npm command
    devProcess = spawn('npm', ['run', 'dev2'], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
}

let output = '';
let hasError = false;
let timeoutKilled = false;

// Check for errors immediately when data arrives
function checkForErrors() {
    if (output.match(/error|To run this command, log in to Shopify|EADDRINUSE|address already in use/i)) {
        if (!hasError) {  // Only show error once
            hasError = true;
            clearInterval(errorCheckInterval);
            clearTimeout(timeout);
            
            console.log('❌ Error detected during startup:');
            console.log('────────────────────────────────────────');
            // Show only error lines
            const errorLines = output.split('\n').filter(line => 
                line.match(/error|To run this command, log in to Shopify|EADDRINUSE|address already in use/i)
            );
            errorLines.forEach(line => console.log(line.trim()));
            console.log('────────────────────────────────────────');
            console.log('❌ Theme development check failed. Commit aborted.');
            console.log('💡 Tip: Make sure no other development server is running on port 9292');
            console.log('⚠️ To bypass the check, add --skip-theme-check or --no-verify to your commit message');
            
            // Force kill process immediately
            console.log('🔄 Killing npm run dev2 process...');
            try {
                devProcess.kill('SIGKILL');  // Force kill
                console.log('✅ Process killed with SIGKILL');
            } catch (err) {
                console.log('⚠️ Process already terminated');
            }
            
            // Also kill by port as backup
            const { exec } = require('child_process');
            if (process.platform === 'win32') {
                console.log('🔄 Killing Windows processes on port 9292...');
                exec('netstat -ano | findstr :9292', (err, output) => {
                    if (output) {
                        const lines = output.split('\n').filter(line => line.trim());
                        lines.forEach(line => {
                            const match = line.match(/\s+(\d+)\s*$/);
                            if (match && match[1]) {
                                exec(`taskkill /F /PID ${match[1]} 2>nul`, (killErr) => {
                                    if (!killErr) {
                                        console.log(`✅ Killed Windows process PID ${match[1]}`);
                                    }
                                });
                            }
                        });
                    }
                });
            } else {
                console.log('🔄 Killing Unix/Mac processes on port 9292...');
                exec('lsof -ti:9292 | xargs kill -9 2>/dev/null', (err) => {
                    if (!err) {
                        console.log('✅ Killed Unix/Mac processes on port 9292');
                    }
                });
                exec('pkill -f "shopify theme dev" 2>/dev/null', (err) => {
                    if (!err) {
                        console.log('✅ Killed shopify theme dev processes');
                    }
                });
            }
            
            // Give more time for cleanup, then exit with error
            setTimeout(() => {
                console.log('🔄 Final cleanup complete, exiting...');
                process.exit(1);
            }, 2000);
        }
    }
}

// Collect output and check for errors immediately
devProcess.stdout.on('data', (data) => {
    output += data.toString();
    checkForErrors();  // Check immediately when new data arrives
});

devProcess.stderr.on('data', (data) => {
    output += data.toString();
    checkForErrors();  // Check immediately when new data arrives
});

// Set timeout to kill process after monitoring period
const timeout = setTimeout(() => {
    const { exec } = require('child_process');
    console.log('⏱️  30-second timeout reached, stopping dev server...');
    timeoutKilled = true;
    try {
        devProcess.kill('SIGKILL');  // Force kill on timeout
    } catch (err) {
        console.log('⚠️ Process already terminated');
    }
    
    // Also kill by port as backup on Windows
    if (process.platform === 'win32') {
        exec('netstat -ano | findstr :9292 | for /f "tokens=5" %a in (\'more\') do taskkill /F /PID %a 2>nul', () => {});
    } else {
        exec('lsof -ti:9292 | xargs kill -9 2>/dev/null', () => {});
    }
}, 30000); // 30 seconds timeout

// Monitor output for errors every 200ms as backup (faster detection)
const errorCheckInterval = setInterval(checkForErrors, 200);

devProcess.on('close', (code) => {
    clearInterval(errorCheckInterval);
    clearTimeout(timeout);
    
    if (!hasError) {
        if (code === 0 || code === null || timeoutKilled) {
            // Success cases: clean exit, null exit, or timeout kill without errors
            if (timeoutKilled) {
                console.log('✅ No errors detected during 30-second monitoring period!');
            } else {
                console.log('✅ Theme development check completed successfully!');
            }
            
            // Run shopify theme check
            console.log('🔍 Running shopify theme check...');
            let themeCheckProcess;
            if (process.platform === 'win32') {
                // Windows: Use cmd.exe to run shopify properly
                themeCheckProcess = spawn('cmd.exe', ['/c', 'shopify', 'theme', 'check'], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true
                });
            } else {
                // Unix/Mac: Direct shopify command
                themeCheckProcess = spawn('shopify', ['theme', 'check'], {
                    stdio: ['pipe', 'pipe', 'pipe']
                });
            }
            
            let themeCheckOutput = '';
            
            themeCheckProcess.stdout.on('data', (data) => {
                themeCheckOutput += data.toString();
            });
            
            themeCheckProcess.stderr.on('data', (data) => {
                themeCheckOutput += data.toString();
            });
            
            themeCheckProcess.on('close', (themeCheckCode) => {
                if (themeCheckCode === 0) {
                    console.log('✅ Theme check passed!');
                    console.log('🚀 Commit proceeding...');
                    process.exit(0);
                } else {
                    console.log('❌ Theme check failed:');
                    console.log('────────────────────────────────────────');
                    console.log(themeCheckOutput.trim());
                    console.log('────────────────────────────────────────');
                    console.log('❌ Commit aborted due to theme check errors.');
                    console.log('⚠️ To bypass the check, add --skip-theme-check or --no-verify to your commit message');
                    process.exit(1);
                }
            });
            
            themeCheckProcess.on('error', (error) => {
                console.error(`❌ Failed to run shopify theme check: ${error.message}`);
                console.log('❌ Commit aborted.');
                process.exit(1);
            });
            
        } else {
            console.log(`❌ npm run dev2 exited with code ${code}`);
            console.log('❌ Theme development check failed. Commit aborted.');
            console.log('⚠️ To bypass the check, add --skip-theme-check or --no-verify to your commit message');
            process.exit(1);
        }
    }
});

    devProcess.on('error', (error) => {
        clearInterval(errorCheckInterval);
        clearTimeout(timeout);
        console.error(`❌ Failed to start npm run dev2: ${error.message}`);
        console.log('❌ Theme development check failed. Commit aborted.');
        console.log('⚠️ To bypass the check, add --skip-theme-check or --no-verify to your commit message');
        process.exit(1);
    });
}

// Run the main function
main().catch((error) => {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
});