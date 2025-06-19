const Queue = require('bull');

const submissionQueue = new Queue('submission', {
  redis: {
    host: 'localhost', 
    port: 6379
  }
});

module.exports = submissionQueue;