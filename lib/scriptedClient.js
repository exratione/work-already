/**
 * @fileOverview
 * Client class definition.
 */

var util = require("util");
var async = require("async");
var Client = require("./client");

// ------------------------------------------------
// Class definition.
// ------------------------------------------------

/**
 * @class
 * A client that can run actions as defined in a script, suited for load tests or
 * similar activities.
 *
 * Constructor configuration is the same as for the Client class.
 *
 * @see Client
 */
function ScriptedClient (config) {
  ScriptedClient.super_.call(this, config);
}
util.inherits(ScriptedClient, Client);
var p = ScriptedClient.prototype;

// ---------------------------------------
// Methods
// ---------------------------------------

/**
 * Start the process of running a set of scripted actions. Only one script can
 * run on a single instance; if you want to run multiple scripts, create
 * multiple instances of this class.
 *
 * A script has the following format:
 *
 * {
 *   // A required identifier.
 *   name: "a script",
 *   // Optional default time to sleep before executing an action. Can be a
 *   // function or a number.
 *   sleep: 500,
 *   // Action definitions that are executed in the order provided.
 *   actions: [
 *     "/index.html",
 *     {
 *       type: "socket"
 *       namespace: "/"
 *     },
 *     {
 *       // Override the default sleep time before running this action.
 *       sleep: 250
 *       type: "emit",
 *       args: ["event", { item: "value" }]
 *     }
 *     // etc
 *   ]
 * }
 *
 * @param {object} script
 *   The script to run.
 * @param {function} [callback]
 *   Optional callback function, invoked on error or at the end of the script.
 *   Of the form function (error).
 */
p.runScript = function (script, callback) {
  if (this.scriptInProgress) {
    callback(new Error("Script already underway: " + this.script.name));
    return;
  }

  // Check the script.
  if (!script || typeof script !== "object") {
    callback(new Error("Invalid script definition."));
    return;
  }
  if (typeof script.name !== "string") {
    callback(new Error("Script name must be a string."));
    return;
  }
  if (!Array.isArray(script.actions)) {
    callback(new Error("Script actions must be an array."));
    return;
  }

  var self = this;
  this.script = script;
  this.scriptInProgress = true;
  this.log.info("Starting script: " + this.script.name);

  async.forEachSeries(
    script.actions,
    // Pause before undertaking each action, per the action or script
    // settings.
    function (action, asyncCallback) {
      self.sleep(action, function () {
        self.action(action, asyncCallback);
      });
    },
    function (error) {
      if (error) {
        self.log.error(error);
      } else {
        self.log.info("Completed script with no errors: " + self.script.name);
      }
      self.clear();
      if (typeof callback === "function") {
        callback(error);
      }
    }
  );
};

/**
 * Delay as shown for this action.
 *
 * @param {mixed} action
 *   An action definition.
 * @param {function} callback
 *   Of the form function (error).
 */
p.sleep = function (action, callback) {
  var sleep;
  if (typeof action.sleep === "number") {
    sleep = action.sleep;
  } else if (typeof action.sleep === "function") {
    sleep = action.sleep();
  } else if (typeof this.script.sleep === "number") {
    sleep = this.script.sleep;
  } else if (typeof this.script.sleep === "function") {
    sleep = this.script.sleep();
  }

  if (typeof sleep === "number") {
    setTimeout(callback, sleep);
  } else {
    callback();
  }
};


/**
 * @see Client#clear
 */
p.clear = function () {
  ScriptedClient.super_.prototype.clear.call(this);
  delete this.script;
  delete this.scriptInProgress;
};

// ---------------------------------------
// Exports: Class constructor.
// ---------------------------------------

module.exports = ScriptedClient;
