/**
 * @fileOverview
 * Vows test putting the Client class through its paces - test all actions.
 */

var assert = require("assert");
var tools = require("../lib/tools");
var workAlready = require("work-already");

var suite = tools.serverTestSuite("Client Functions");
var client = new workAlready.Client(tools.config.workAlreadyClient);

var checkIndexPage = function (error, page) {
  assert.isNull(error);
  assert.isObject(page);
  // Page is also stashed in the client, so check that as well.
  assert.isObject(client.page);
  assert.strictEqual(200, page.statusCode);
  assert.include(page.body, "Socket.IO / Express.js Test");
};

suite.addBatch({
  "get": {
    topic: function () {
      client.action({
        type: "get",
        path: "/index.html"
      }, this.callback);
    },
    "page fetched": checkIndexPage
  }
});
// Socket testing.
suite.addBatch({
  "connect": {
    topic: function () {
      client.action({
        type: "connect"
      }, this.callback);
    },
    "socket connected": function (error) {
      assert.isUndefined(error);
      assert.isObject(client.page.sockets);
      assert.isObject(client.page.sockets[client.config.sockets.defaultNamespace]);
    }
  }
});
// There is a 100-ms delayed response on connection. If it was immediate,
// we'd miss it. Use connectAndAwaitEmit to catch immediate responses.
suite.addBatch({
  "awaitEmit": {
    topic: function () {
      client.action({
        type: "awaitEmit",
        eventType: "responseOnConnect"
      }, this.callback);
    },
    "event emitted": function (error, eventData) {
      assert.isNull(error);
      assert.isObject(client.socketEvent);
      assert.strictEqual(client.socketEvent.namespace, client.config.sockets.defaultNamespace);
      assert.strictEqual(client.socketEvent.eventType, "responseOnConnect");
    }
  }
});
// Load static content referenced in the index page.
suite.addBatch({
  "getStatic": {
    topic: function () {
      client.action({
        type: "getStatic"
      }, this.callback);
    },
    "stored page is still /index.html": function () {
      checkIndexPage(null, client.page);
    },
    "static pages loaded": function (error) {
      assert.isUndefined(error);
      assert.isString(client.staticData["/style.css"]);
      assert.isString(client.staticData["/socket.io/socket.io.js"]);
    }
  }
});
// Test the page unload function.
suite.addBatch({
  "unload": {
    topic: function () {
      client.action({
        type: "unload"
      }, this.callback);
    },
    "contents cleared": function (error) {
      assert.isUndefined(error);
      assert.isUndefined(client.page);
      assert.isUndefined(client.socketEvent);
    }
  }
});
// Refetch the index page.
suite.addBatch({
  "get shortcut": {
    topic: function () {
      client.action("/index.html", this.callback);
    },
    "page fetched": checkIndexPage
  }
});
// Test the connect and await thing, and try to catch the immediate response.
suite.addBatch({
  "connectAndAwaitEmit": {
    topic: function () {
      client.action({
        type: "connectAndAwaitEmit",
        eventType: "immediateResponseOnConnect"
      }, this.callback);
    },
    "event emitted": function (error, eventData) {
      assert.isNull(error);
      assert.isObject(client.socketEvent);
      assert.strictEqual(client.socketEvent.namespace, client.config.sockets.defaultNamespace);
      assert.strictEqual(client.socketEvent.eventType, "immediateResponseOnConnect");
    }
  }
});

// Tests for confirmNoEmit.
suite.addBatch({
  "confirmNoEmit with no event": {
    topic: function () {
      client.action({
        type: "confirmNoEmit",
        eventType: "responseOnTest"
      }, this.callback);
    },
    "event not emitted": function (error, eventData) {
      assert.isNull(error);
      assert.isUndefined(eventData);
    }
  }
});
suite.addBatch({
  "confirmNoEmit with event": {
    topic: function () {
      client.action({
        type: "emit",
        args: ["test"]
      }, function () {
        // Ignore this callback.
      });
      client.action({
        type: "confirmNoEmit",
        eventType: "responseOnTest"
      }, this.callback);
    },
    "event emitted": function (error, eventData) {
      assert.isNotNull(error);
      assert.isObject(client.socketEvent);
      assert.strictEqual(client.socketEvent.namespace, client.config.sockets.defaultNamespace);
      assert.strictEqual(client.socketEvent.eventType, "responseOnTest");
    }
  }
});
suite.addBatch({
  "confirmNoMatchingEmit with ignored event": {
    topic: function () {
      client.action({
        type: "emit",
        args: ["test"]
      }, function () {
        // Ignore this callback.
      });
      client.action({
        type: "confirmNoMatchingEmit",
        eventType: "responseOnTest",
        match: function () {
          // Ignore all events.
          return false;
        }
      }, this.callback);
    },
    "event emitted but ignored": function (error, eventData) {
      assert.isNull(error);
      assert.isUndefined(eventData);
    }
  }
});

exports.suite = suite;
