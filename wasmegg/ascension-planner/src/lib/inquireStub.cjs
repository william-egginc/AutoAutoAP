// @protobufjs/inquire without its eval (vite.config.ts resolve.alias): in a browser the real one's
// require lookup always fails and returns null, so this returns null at once.
'use strict';
module.exports = function inquire() {
  return null;
};
