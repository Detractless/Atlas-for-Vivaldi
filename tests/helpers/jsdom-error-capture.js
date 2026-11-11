function captureJsdomErrors(virtualConsole, errors) {
  virtualConsole.on("jsdomError", (error) => {
    if (error.type === "css-parsing" || error.type === "not-implemented") return;
    errors.push(`${error.type}: ${(error.cause && error.cause.stack) || error.message}`);
  });
  virtualConsole.on("error", (...args) => errors.push("console.error: " + args.map(String).join(" ")));
}

module.exports = { captureJsdomErrors };
