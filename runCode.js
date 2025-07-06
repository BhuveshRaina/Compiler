const fs         = require("fs");
const { execSync } = require("child_process");
const path       = require("path");

async function runCode({ language, code, testcases = [], limits = {} }) {
  const timeLimitMs   = limits.time   || 2000;   // per-test
  const memoryCapKb   = (limits.memory || 256) * 1024;

  const tmp = "/tmp/exec";
  fs.mkdirSync(tmp, { recursive: true });

  const isMac      = process.platform === "darwin";
  const timeCmd    = isMac ? "gtime -v" : "/usr/bin/time -v";

  /* helpers */
  const getMem = (out) => {
    const m = out.match(/Maximum resident set size.*?: (\d+)/);
    return m ? +m[1] : 0;
  };
  const stripNoise = (raw) =>
    raw
      .split("\n")
      .filter(
        (l) =>
          !l.includes("Maximum resident") &&
          !l.includes("Command being timed") &&
          !l.startsWith("\t")
      )
      .join("\n")
      .trim();
  const shortErr = (raw) => {
    const l =
      raw.split("\n").find((x) => x.includes("error:")) ||
      raw.split("\n").find((x) => x.includes("Command terminated"));
    return l ? l.replace(tmp, "").trim() : "Unknown error";
  };

  /* ─── prepare source & compile ─── */
  let binary = "";
  let compile = "";

  switch (language) {
    case "cpp":
      fs.writeFileSync(`${tmp}/main.cpp`, code);
      compile = `g++ ${tmp}/main.cpp -o ${tmp}/a.out`;
      binary  = `${tmp}/a.out`;
      break;
    case "java":
      fs.writeFileSync(`${tmp}/Main.java`, code);
      compile = `javac ${tmp}/Main.java`;
      binary  = `java -cp ${tmp} Main`;
      break;
    case "python":
      fs.writeFileSync(`${tmp}/main.py`, code);
      binary  = `python3 ${tmp}/main.py`;
      break;
    default:
      throw new Error("Unsupported language");
  }

  if (compile) {
    try {
      execSync(compile, { timeout: 10_000 });
    } catch (e) {
      return {
        status: "Compilation Error",
        failedTestcase: null,
        actualOutput: null,
        totalTimeMs: 0,
        totalMemoryKb: 0,
        error: shortErr(e.stderr?.toString() || e.message),
      };
    }
  }

  /* ─── run each test ─── */
  let totalTime = 0;
  let totalMem  = 0;
  let verdict   = "Accepted";
  let failed    = null;
  let actualOut = null;
  let errMsg    = null;

  for (let i = 0; i < testcases.length; ++i) {
    const { input, expectedOutput = "" } = testcases[i];
    fs.writeFileSync(`${tmp}/input.txt`, input);

    try {
      const start = Date.now();
      const raw   = execSync(`${timeCmd} ${binary} < ${tmp}/input.txt`, {
        shell: true,
        timeout: timeLimitMs,
      }).toString();
      const elapsed = Date.now() - start;

      const memKb = getMem(raw);
      const out   = stripNoise(raw);

      totalTime += elapsed;
      totalMem  += memKb;

      if (memKb > memoryCapKb) {
        verdict  = "Memory Limit Exceeded";
        errMsg   = errMsg.message;
        failed   = i + 1;
        break;
      }
      if (elapsed > timeLimitMs) {
        verdict  = "Time Limit Exceeded";
        errMsg   = errMsg.message;
        failed   = i + 1;
        break;
      }
      if (out !== expectedOutput.trim()) {
        verdict  = "Wrong Answer";
        actualOut = out;
        failed   = i + 1;
        break;
      }
    } catch (e) {
      /* node killed (timeout) → SIGTERM ; OOM-killer → SIGKILL */
      if (e.signal === "SIGTERM") {
        verdict = "Time Limit Exceeded";
        errMsg  = "Time Limit Exceeded";
      } else if (e.signal === "SIGKILL") {
        verdict = "Memory Limit Exceeded";
        errMsg  = "Memory Limit Exceeded";
      } else {
        verdict = "Runtime Error";
        errMsg  = shortErr(e.stderr?.toString() || e.message);
      }
      failed = i + 1;
      break;
    }
  }

  return {
    status          : verdict,
    failedTestcase  : failed,
    actualOutput    : verdict === "Wrong Answer" ? actualOut : null,
    totalTimeMs     : verdict === "Accepted" ? totalTime : 0,
    totalMemoryKb   : verdict === "Accepted" ? totalMem  : 0,
    error           : errMsg,
  };
}

module.exports = runCode;
