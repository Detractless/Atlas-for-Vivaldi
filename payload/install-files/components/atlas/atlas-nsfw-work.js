/* Small cancellable queue, shared by the page scheduler and detector host. */
(function () {
  'use strict';
  window.__atlasNsfwWork = {
    create: function (limit) {
      var pending = [], active = 0, sequence = 0, timer = null;
      function schedule() {
        if (timer === null && pending.length) timer = setTimeout(pump, 0);
      }
      function pump() {
        timer = null;
        pending.forEach(function (job) { job.rank = job.priority(); });
        pending.sort(function (a, b) { return a.rank - b.rank || a.order - b.order; });
        while (active < limit) {
          var index = pending.findIndex(function (job) { return !job.ready || job.ready(); });
          if (index < 0) break;
          var job = pending.splice(index, 1)[0];
          active++; job.started = true;
          job.run(job.done);
        }
      }
      function push(run, priority, ready) {
        var job = { run: run, priority: priority || function () { return 0; }, ready: ready,
          order: sequence++, started: false, finished: false };
        job.done = function () {
          if (job.finished) return;
          job.finished = true;
          if (job.started) active--;
          else pending = pending.filter(function (entry) { return entry !== job; });
          schedule();
        };
        pending.push(job); schedule();
        return job;
      }
      return { push: push, wake: schedule };
    }
  };
})();
