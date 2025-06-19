const submissionQueue = require('./config/redisQueue');
const Submission = require('./models/submission');
const runCode = require('./runCode');
submissionQueue.process(async (job, done) => {
  const { submissionId, code, language, testcases, limits } = job.data;

  try {
    const verdict = await runCode({ code, language, testcases, limits });

    const update = {
      verdict: verdict.status,
      endedAt: new Date()
    };

    if (verdict.status === "Accepted") {
      update.totalTimeMs = verdict.totalTimeMs;
      update.totalMemoryKb = verdict.totalMemoryKb;
    }

    if (verdict.error) {
      update.errorMessage = verdict.error;
    }

    if (verdict.failedTestcase) {
      const failed = testcases[verdict.failedTestcase - 1];
      update.failedTestCase = {
        input: failed.input,
        expectedOutput: failed.expectedOutput,
        actualOutput: verdict.actualOutput,
        errorType: verdict.status
      };
    }

    await Submission.findByIdAndUpdate(submissionId, update);
    done();
  } catch (err) {
    await Submission.findByIdAndUpdate(submissionId, {
      verdict: "System Error",
      errorMessage: err.message,
      endedAt: new Date(),
      expireAt: new Date(Date.now() + 10 * 60 * 1000) 
    });
    done(new Error("Job failed permanently"));
  }
});
