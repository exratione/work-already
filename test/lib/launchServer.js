/**
 * @fileOverview
 * Useful for manual testing. Launch the test server so that it can be examined
 * by hand.
 *
 * Usage:
 *
 * node test/lib/launchServer
 */

var tools = require("./tools");

var data = tools.launchApp();
tools.setupExpressRoutes(data.app);
tools.setupSocketResponses(data.socketFactory);
