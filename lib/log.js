/**
 * @fileOverview
 * Adjust the log package so that it can deal with Error instances.
 */

var util = require("util");
var Log = require("log");

var ClientLog = function (id, levelStr) {
  this.id = id;
  var args = [];
  for (var index = 0, length = arguments.length; index < length; index++) {
    args.push(arguments[index]);
  }
  args.shift();
  ClientLog.super_.apply(this, args);
};
util.inherits(ClientLog, Log);

/**
 * Override to stop it blowing up if given an Error, object, etc, instead of a
 * string.
 */
ClientLog.prototype.log = function (levelStr, args) {
  if (args[0] instanceof Error) {
    args[0] = args[0].stack;
  } else {
    args[0] = args[0].toString();
  }
  args[0] = this.id + ": " + args[0];
  ClientLog.super_.prototype.log.call(this, levelStr, args);
};

module.exports = ClientLog;
