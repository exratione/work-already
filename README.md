Work Already
============

Work Already is a set of tools for building web tests for mixed HTTP/S and
WebSocket web applications that are built on Socket.IO, and where sessions are
shared between Socket.IO and Express.js or some other similar http.Server-based
framework.

Session-Aware Web Tests for Socket.IO Applications
--------------------------------------------------

So you've built a single page application with Express.js and Socket.IO,
wherein user sessions are created and managed by Express.js, and then shared
with Socket.IO. A client first hits a page served by Express.js, which
generates a session, and then passes on identifiers for that session when
connecting to one or more sockets as specified in the page Javascript.

Those identifiers can be cookies (as is often the case) or query parameters
on the namespace path for the Socket.IO connect call (as is preferred by
the Socket.IO developers).

With your application up and running, you'd like to run automated web tests
against your server, hitting both web pages and Socket.IO connections. This
is where you'll find that your options are actually somewhat limited - there
are not that many tools out there that can do this. Hence the existence of
this small package, Work Already.

Features worth noting in Work Already:

  * Set the order of HTTP/S requests and examine the responses.
  * Make Socket.IO connections that pass the right session information.
  * Emit on sockets and examine or expect server responses.
  * Run as a standalone test or integrate with Vows test suites.

IMPORTANT NOTE: This package works with 0.9.x versions of Socket.IO. It won't
do much for earlier or later version in its present form, as some hacking of
socket.io-client is required to make it play ball with sessions in a Node.js
environment.

Sharing Sessions Between Express.js and Socket.IO?
--------------------------------------------------

Very quickly, here is an example of a generic way to share sessions between
Express.js and Socket.IO by using cookies to pass around the session ID:

    var express = require("express");
    var io = require("socket.io");
    var SessionMemoryStore = require("connect/lib/middleware/session/memory");
    // Set up a minimal Express application, but ensure that the session store,
    // cookie parser, and session key are exposed and accessible.
    var app = express();
    var store = new SessionMemoryStore();
    var sessionKey = "sid";
    var cookieSecret = "cookieSecret";
    var cookieParser = express.cookieParser(cookieSecret);
    app.use(cookieParser);
    app.use(express.session({
      key: sessionKey,
      secret: cookieSecret,
      store: store
    }));
    var server = http.createServer(app).listen(10080);
    // Now set up Socket.IO.
    var socketFactory = io.listen(server);
    // And use the authorization hook to attach the session to the socket
    // handshake by reading the cookie and loading the session when a
    // socket connects. Using the authorization hook means that we can
    // deny access to socket connections that arrive without a session - i.e.
    // where the user didn't load a site page through Express first.
    socketFactory.set("authorization", function (data, callback) {
      if (data && data.headers && data.headers.cookie) {
        cookieParser(data, {}, function (error) {
          if (error) {
            callback("COOKIE_PARSE_ERROR", false);
            return;
          }
          var sessionId = data.signedCookies[sessionKey];
          store.get(sessionId, function (error, session) {
            // Add the sessionId. This will show up in
            // socket.handshake.sessionId.
            //
            // It's useful to set the ID and session separately because of
            // those fun times when you have an ID but no session - it makes
            // debugging that much easier.
            data.sessionId = sessionId;
            if (error) {
              callback("ERROR", false);
            } else if (!session) {
              callback("NO_SESSION", false);
            } else {
              // Add the session. This will show up in
              // socket.handshake.session.
              data.session = session;
              callback(null, true);
            }
          });
        });
      } else {
        callback("NO_COOKIE", false);
      }
    });

This is not, however, the recommended way of doing things. At present the
Socket.IO folk are leaning towards requiring authentication or identification
tokens (such as the session ID in some encrypted form) to be appended to the
namespace for the connection.

On the client:

    io.connect("/namespace?token=encryptedString");

On the server:

    socketFactory.set("authorization", function (data, callback) {
      var token = data.query.token;
      // Now figure out the session based on what was placed inside the token
      // and attach it to the data object.
      // ...
    });

See these pages for more on this topic:

  * [Socket.IO: Authorizing](https://github.com/LearnBoost/socket.io/wiki/Authorizing)
  * [Issue #344: User client on the server with a cookie](https://github.com/LearnBoost/socket.io-client/issues/344)
  * [With socket.io, how to handle authentication with a non-browser client?](http://stackoverflow.com/questions/13381540/with-socket-io-how-to-handle-authentication-with-a-non-browser-client)

The socket.io-client Package Doesn't Allow Cookies To Be Set
------------------------------------------------------------

The challenge for testing in a Node.js rather than browser environment - only
for the situation in which you are using cookies rather than the query string
to pass session identifiers - is that the socket.io-client package doesn't
permit the setting of cookie data in its requests.

The Work Already package works around this issue in a very crude way, but there
is little other option but to hack or rewrite the socket.io-client package code
in order to achieve this goal.

Example of Use
--------------

See /examples for examples of use, for both simple load tests, and Vows web tests like this one:

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
            type: "connect",
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

Client Configuration
--------------------

The client configuration options object passed to the constructor has the
following parameters:

    {
      // Optional ID, which defaults to something random. Useful when running
      // load tests, as it is prepended to log messages.
      id: "client-3423",
      // Optional log parameters.
      log: {
        level: "debug"
      },
      // Required parameters that tell the client which server to connect to.
      server: {
        host: "localhost",
        port: 10080,
        protocol: "http"
      },
      // Optional parameters to provide defaults for socket actions.
      sockets: {
        // If namespace is not specified in an action, then this is the namespace
        // used.
        defaultNamespace: ""
        // If timeout is not specified in a socket action, then this value is
        // used. The timeout is in milliseconds.
        defaultTimeout: 500
        // defaultTimeout can be a function, e.g.
        // defaultTimeout: function () { return 500; }
      }
    }

List of Actions
---------------

The following actions are available.

1) http

    // A general HTTP request action, defaulting to GET. By default the
    // response is written to client.page.
    client.action({
      type: "http",
      path: "/index.html",
      method: "GET",
      // An AJAX request requires client.page to exist, and the response is
      // stored to client.ajax.
      ajax: false,
      // Applied to the query string or POST body, depending on method.
      params: {
        name: "value"
      },
      // If true, then don't record the response.
      discardResponse: false
    }, function (error, page) {});

2) ajax

    // An alias to the http action for AJAX requests. An AJAX request requires
    // client.page to exist, i.e. that a page request precedes it. The
    // response to the AJAX request is stored to client.ajax.
    client.action({
      type: "ajax",
      path: "/index.html",
      method: "GET",
      // Applied to the query string or POST body, depending on method.
      params: {
        name: "value"
      }
    }, function (error, ajax) {});

3) get

    // An alias to a GET http action. The response is stored to client.page.
    client.action({
      type: "http",
      path: "/index.html",
      // Applied to the query string.
      params: {
        name: "value"
      }
    }, function (error, page) {});

4) post

    // An alias to a POST http action. Redirect to GET is followed and the
    // response is stored to client.page.
    client.action({
      type: "http",
      path: "/index.html",
      // Applied to the POST body.
      params: {
        name: "value"
      }
    }, function (error, page) {});

5) getStatic

    // Load all the static content linked in the the most recently loaded
    // page, currently stored to client.page. Useful for load testing.
    client.action({
      type: "loadStatic",
      // If true, cache loaded files.
      cache: true,
      // Only load URLs with these file extensions.
      extensions: [".js", ".css", ".jpg", ".png", ".gif"]
    }, function (error) {});

6) unload

    // Clear stored client.page, client.ajax, and client.socketEvent values.
    // Disconnect connected sockets.
    //
    // This action is called implicitly before a new page is loaded and
    // stored to client.page.
    client.action({
      type: "unload"
    }, function (error) {});

7) connect

    // Connect a Socket.IO instance. A page request must precede this, and
    // client.page must exist.
    client.action({
      type: "connect",
      // An optional connection namespace.
      namespace: "/namespace",
      // Optional timeout in milliseconds. This can be a function.
      timeout: 500,
      // Optional client socket configuration.
      socketConfig: {
        "reconnect": true
      }
    }, function (error) {});

8) emit

    // Emit on a connected client Socket.IO namespace.
    client.action({
      type: "emit",
      // An optional connection namespace.
      namespace: "/namespace",
      // Arguments for the emit() function call.
      args: ["eventType", data1, data2, ... ]
    }, function (error) {});

9) awaitEmit

    // Wait for an event from the server to be emitted by a connected
    // client Socket.IO namespace. Data for the emitted event is stored to
    // client.socketEvent.
    client.action({
      type: "awaitEmit",
      // An optional connection namespace.
      namespace: "/namespace",
      // The event type.
      eventType: "someEvent",
      // Optional timeout in milliseconds. This can be a function.
      timeout: 2000
    }, function (error, socketEvent) {});

10) connectAndAwaitEmit

    // If the server emits immediately on connection, this is the way to catch
    // that event. It is stored to client.socketEvent.
    client.action({
      type: "connectAndAwaitEmit",
      // An optional connection namespace.
      namespace: "/namespace"
      // The event type.
      eventType: "someEvent",
      // Optional timeout in milliseconds. This can be a function.
      connectTimeout: 500,
      // Optional timeout in milliseconds. This can be a function.
      awaitEmitTimeout: 500,
      // Optional client socket configuration.
      socketConfig: {
        "reconnect": true
      }
    }, function (error, socketEvent) {});
