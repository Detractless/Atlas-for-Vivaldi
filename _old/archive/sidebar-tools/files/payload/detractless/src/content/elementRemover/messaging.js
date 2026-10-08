export const background = (function () {
  let tmp = {};
  chrome.runtime.onMessage.addListener(function (request) {
    for (let id in tmp) {
      if (tmp[id] && typeof tmp[id] === 'function') {
        if (request.path === 'background-to-page') {
          if (request.method === id) tmp[id](request.data);
        }
      }
    }
  });
  return {
    receive: function (id, callback) { tmp[id] = callback; },
    send: function (id, data) {
      chrome.runtime.sendMessage({ method: id, data: data, path: 'page-to-background' }, function () {
        return chrome.runtime.lastError;
      });
    }
  };
})();
