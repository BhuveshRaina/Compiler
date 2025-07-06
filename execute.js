const fs         = require('fs');
const path       = require('path');
const { execSync } = require('child_process');
const crypto     = require('crypto');

function cleanUp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

module.exports = async function runCode({ language, code, testCases }) {
  const workDir = path.join(process.cwd(), `run_${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(workDir);

  const srcBase = path.join(workDir, 'main');
  try {
    if (language === 'cpp') {
      fs.writeFileSync(`${srcBase}.cpp`, code);
      execSync(`g++ -O2 -std=c++17 "${srcBase}.cpp" -o "${workDir}/a.out"`);
    } else if (language === 'java') {
      fs.writeFileSync(`${workDir}/Main.java`, code);
      execSync(`javac "${workDir}/Main.java"`, { cwd: workDir });
    } else if (language === 'python') {
      fs.writeFileSync(`${srcBase}.py`, code);   
    } else {
      throw new Error('Unsupported language');
    }
  } catch (err) {
    err.isCompile = true;    
    cleanUp(workDir);
    throw err;
  }

  const runner =
        language === 'cpp'  ? `${workDir}/a.out`
      : language === 'java' ? `java -cp ${workDir} Main`
      :                       `python3 ${srcBase}.py`;

  const outputs    = [];
  const TIME_LIMIT = 2000;               
  const MAX_BUF    = 10 * 1024 * 1024;    

  for (const { input } of testCases) {
    try {
      const stdout = execSync(runner, {
        input,
        timeout   : TIME_LIMIT,
        maxBuffer : MAX_BUF,
        shell     : true,
        encoding  : 'utf8',
        stdio     : ['pipe', 'pipe', 'pipe']
      }).trim();

      outputs.push({ output: stdout || '' });

    } catch (err) {
      console.log(err.signal);
      if (
        err.signal === 'SIGTERM' ||              
        err.signal === 'SIGKILL' ||
        err.signal == 'SIGTRAP' ||
        /timed out/i.test(err.message)
      ) {
        outputs.push({ output: 'Time Limit Exceeded' });

      } else if (err.status !== undefined) {
        const firstLine =
          ((err.stderr || '').toString().split('\n').find(l => l.trim())) ||
          err.message;
        outputs.push({
          output: 'Runtime Error',
          error:  firstLine.slice(0, 300)          
        });

      } else {
        cleanUp(workDir);
        throw err;       
      }
    }
  }

  cleanUp(workDir);
  return outputs;        
};
