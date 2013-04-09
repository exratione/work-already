/**
 * @fileOverview
 * An example of the use of Work Already in conjunction with Vows test suites.
 */

var assert = require("assert");
var vows = require("vows");
var workAlready = require("work-already");

var suite = vows.describe("Testing an Express / Socket.IO server.");
var client = new workAlready.Client({
  server: {
    host: "localhost",
    port: 10080,
    protocol: "http"
  },
  sockets: {
    // If namespace is not specified in an action, then this is the namespace
    // used.
    defaultNamespace: ""
  }
});

// Load the main application page, which also obtains the necessary cookies
// to pass along with the Socket.IO connection that follows.
suite.addBatch({
  "Load main page via GET request": {
    topic: function () {
      client.action("/index.html", this.callback);
    },
    "page fetched": function (error, page) {
      // The last retrieved page is stored at client.page for perusal, as well
      // as being passed to this function.
      assert.isNull(error);
      assert.isObject(page);
      assert.isObject(client.page);
      assert.strictEqual(200, page.statusCode);
      assert.include(page.body, "some distinctive string");
    }
  }
});
// Establish a Socket.IO connection with the default namespace, passing over
// the right cookies obtained in the prior request.
suite.addBatch({
  "Connect via Socket.IO": {
    topic: function () {
      client.action({
        type: "socket",
        timeout: 500,
        // Optionally, set Socket.IO connection parameters.
        socketConfig: {
          "reconnect": true
        }
      }, this.callback);
    },
    "socket connected": function (error) {
      assert.isUndefined(error);
      assert.isObject(client.page.sockets);
      assert.isObject(client.page.sockets[client.config.sockets.defaultNamespace]);
    }
  }
});
// Perhaps the server sends an immediate response message via the socket
// connection. If so, the next step is to wait on it.
suite.addBatch({
  "Await emitted server response to connection": {
    topic: function () {
      client.action({
        type: "awaitEmit",
        eventType: "responseOnConnect",
        timeout: 500
      }, this.callback);
    },
    "event emitted": function (error, socketEvent) {
      assert.isNull(error);
      // The socketEvent is stashed in the client as well as being passed
      // to this function.
      assert.isObject(client.socketEvent);
      assert.strictEqual(client.socketEvent.namespace, client.config.sockets.defaultNamespace);
      assert.strictEqual(client.socketEvent.eventType, "responseOnConnect");
    }
  }
});

exports.suite = suite;
