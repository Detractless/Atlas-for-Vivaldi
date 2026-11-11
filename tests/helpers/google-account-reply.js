function googleAccountListReply(accounts) {
  const entries = accounts.map((account) => {
    const entry = ["gaia.l.a", 1, account.name, account.email, "", 1, 1, account.index];
    while (entry.length < (account.signedOut ? 15 : 16)) entry.push(0);
    return entry;
  });
  const message = JSON.stringify(["gaia.l.a.r", entries]).replace(/"/g, "\\x22").replace(/\//g, "\\/");
  return `<html><head><script>window.parent.postMessage('${message}', 'x');</script></head></html>`;
}

module.exports = { googleAccountListReply };
