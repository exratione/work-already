/**
 * @fileOverview
 * An example showing the use of Work Already to build a load tester, running
 * many processes that each execute a scripted set of actions. This is a dumb
 * load test script that will continue until killed.
 *
 * Usage:
 *
 * node loadTest processCount rampUpSeconds
 *
 * E.g. for twenty test processes ramping up over ten seconds:
 *
 * node loadTest 20 10
 */

var cluster = require("cluster");
var ScriptedClient = require("work-already").ScriptedClient;

// Configuration for the scripted clients that will be launched - telling it
// which server to hit, and how much to log.
var config = {
  // A client needs an ID, but this will be filled in per thread.
  id: undefined,
  log: {
    level: "debug"
  },
  server: {
    host: "localhost",
    port: "10080"
  }
};

// The script of actions that each client will take.
var script = {
  // All scripts require a name.
  name: "An example script",
  // Optional default time to sleep in milliseconds between each action. Can
  // be a function or a number.
  sleep: function () {
    return (100 + Math.floor(Math.random() + 100));
  },
  // Action definitions that will be executed in the order provided.
  actions: [
    // Load the application main page.
    "/index.html",
    // Connect via Socket.IO.
    {
      // Override the default sleep time.
      sleep: false,
      type: "socket",
      // Assuming that we are using cookies rather than query string tokens
      // to tie the socket authentication to the page authentication.
      namespace: "/",
      // Optional socket configuration could go here.
      socketConfig: {}
    },
    // Emit an event.
    {
      type: "emit",
      namespace: "/",
      args: ["event", { item: "value" }]
    },
    // Disconnect the socket and unload the page.
    {
      type: "unload"
    }
  ]
};

// Is this the master? If so, look at the arguments and launch child processes.
if (cluster.isMaster) {
  if (process.argv.length < 4) {
    console.log("Usage: node loadTest processCount rampUpSeconds");
    process.exit(1);
  }

  var path = require("path");
  var clusterMaster = require("clusterMaster");
  clusterMaster({
    exec: path.join(__dirname, "loadTest.js"),
    size: parseInt(process.argv[2], 10),
    env: process.env
  });
}
// Not the master, so start up a load test thread.
else {
  config.id = process.env.NODE_UNIQUE_ID;
  var client = new ScriptedClient(config);
  client.runScript(script, function (error) {
    // Done. The cluster master will spawn another process once this is
    // ended.
    if (error) {
      client.log.error(error);
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
}
