/**
 * @fileOverview
 * Vows tests for the Client class methods for confirming that no event was
 * emitted. This needs a server that accepts connections but sends nothing
 * to the client.
 */

var assert = require("assert");
var tools = require("../lib/tools");
var workAlready = require("work-already");

var suite = tools.serverTestSuite("Client Functions");
var client = new workAlready.Client(tools.config.workAlreadyClient);

suite.addBatch({
  "get": {
    topic: function () {
      client.action({
        type: "get",
        path: "/index.html"
      }, this.callback);
    },
    "page fetched": function (error, page) {
      assert.isNull(error);
      assert.isObject(page);
      // Page is also stashed in the client, so check that as well.
      assert.isObject(client.page);
      assert.strictEqual(200, page.statusCode);
      assert.include(page.body, "Socket.IO / Express.js Test");
    }
  }
});

// Tests for confirmNoEmit.
suite.addBatch({
  "connectAndConfirmNoEmit with no event": {
    topic: function () {
      client.action({
        type: "connectAndConfirmNoEmit",
        eventType: "responseOnTest"
      }, this.callback);
    },
    "event not emitted": function (error, eventData) {
      assert.isNull(error);
      assert.isUndefined(eventData);
    }
  }
});

exports.suite = suite;
