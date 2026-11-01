/* Keep waiting images protected; prioritize visible work without polling. */
(function () {
  'use strict';
  var queue = window.__atlasNsfwWork.create(2), jobs = new Set();
  function priority(img) {
    if (!img.isConnected) return 3;
    if (document.hidden) return 2;
    var r = img.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0 ? 0 : 1;
  }
  function enqueue(img, run) {
    var job = queue.push(function (done) {
      if (!img.isConnected) { jobs.delete(job); done(); return; }
      run(function () { jobs.delete(job); done(); }, priority(img));
    }, function () { return priority(img); });
    jobs.add(job);
    return function () { jobs.delete(job); job.done(); };
  }
  window.__atlasNsfwImageWork = { enqueue: enqueue };
  window.addEventListener('scroll', queue.wake, true);
  window.addEventListener('pagehide', function () { jobs.forEach(function (job) { job.done(); }); jobs.clear(); });
})();
