const fs = require('fs');
const { execSync } = require('child_process');
const path = require("path");

async function runCode({ language, code, testcases, limits }) {
  const timeLimit = limits?.time || 2000; 
  const memoryCapKb = (limits?.memory || 256) * 1024;

  const tmp = "/tmp/exec";
  fs.mkdirSync(tmp, { recursive: true });

  function getMemoryUsage(output) {
    const match = output.match(/Maximum resident set size.*?: (\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  function cleanOutput(raw) {
    return raw
      .split("\n")
      .filter(line =>
        !line.includes("Maximum resident") &&
        !line.includes("Command being timed") &&
        !line.startsWith("\t"))
      .join("\n")
      .trim();
  }

  function extractShortError(raw) {
    const lines = raw.split("\n");
    const errLine = lines.find(line => line.includes("error:")) ||
                    lines.find(line => line.includes("Command terminated"));
    return errLine ? errLine.replace(tmp, "").trim() : "Unknown error";
  }

  const isMac = process.platform === 'darwin';
  const timeCommand = isMac ? `gtime -v` : `/usr/bin/time -v`;

  try {
    let binaryPath = "";
    let compileCmd = "";

    if (language === "cpp") {
      fs.writeFileSync(`${tmp}/main.cpp`, code);
      compileCmd = `g++ ${tmp}/main.cpp -o ${tmp}/a.out`;
      binaryPath = `${tmp}/a.out`;
    } else if (language === "java") {
      fs.writeFileSync(`${tmp}/Main.java`, code);
      compileCmd = `javac ${tmp}/Main.java`;
      binaryPath = `java -cp ${tmp} Main`;
    } else if (language === "python") {
      fs.writeFileSync(`${tmp}/main.py`, code);
      binaryPath = `python3 ${tmp}/main.py`;
    } else {
      throw new Error("Unsupported language");
    }

    if (compileCmd) {
      try {
        execSync(compileCmd);
      } catch (compileErr) {
        return {
          status: "Compilation Error",
          failedTestcase: null,
          actualOutput: null,
          totalTimeMs: 0,
          totalMemoryKb: 0,
          error: extractShortError(compileErr.stderr ? compileErr.stderr.toString() : compileErr.message)
        };
      }
    }

    let totalTimeMs = 0;
    let totalMemoryKb = 0;
    let finalVerdict = "Accepted";
    let failedTestcase = null;
    let actualOutput = null;
    let errorMessage = null;

    for (let i = 0; i < testcases.length; i++) {
      const { input, expectedOutput } = testcases[i];
      fs.writeFileSync(`${tmp}/input.txt`, input);

      try {
        const start = Date.now();
        const result = execSync(`${timeCommand} ${binaryPath} < ${tmp}/input.txt`, {
          timeout: timeLimit || 2000,
          shell: true
        }).toString();

        const timeTaken = Date.now() - start;
        const memoryUsed = getMemoryUsage(result);
        const userOutput = cleanOutput(result);

        totalTimeMs += timeTaken;
        totalMemoryKb += memoryUsed;

        if (memoryUsed > memoryCapKb) {
          finalVerdict = "Memory Limit Exceeded";
          failedTestcase = i + 1;
          break;
        }

        if (timeTaken > timeLimit) {
          finalVerdict = "Time Limit Exceeded";
          failedTestcase = i + 1;
          break;
        }

        if (userOutput !== expectedOutput.trim()) {
          finalVerdict = "Wrong Answer";
          failedTestcase = i + 1;
          actualOutput = userOutput;
          break;
        }
      } catch (err) {
        if (err.killed && err.signal === 'SIGKILL') {
          finalVerdict = "Memory Limit Exceeded";
        } else if (err.killed) {
          finalVerdict = "Time Limit Exceeded";
        } else {
          finalVerdict = "Runtime Error";
          errorMessage = extractShortError(err.stderr ? err.stderr.toString() : err.message);
        }
        failedTestcase = i + 1;
        break;
      }
    }

    return {
      status: finalVerdict,
      failedTestcase,
      actualOutput: finalVerdict === "Wrong Answer" ? actualOutput : null,
      totalTimeMs: finalVerdict === "Accepted" ? totalTimeMs : 0,
      totalMemoryKb: finalVerdict === "Accepted" ? totalMemoryKb : 0,
      error: errorMessage
    };
  } catch (e) {
    return {
      status: "Compilation Error",
      failedTestcase: null,
      actualOutput: null,
      totalTimeMs: 0,
      totalMemoryKb: 0,
      error: e.message
    };
  }
}

module.exports = runCode;
