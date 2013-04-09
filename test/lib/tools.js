/**
 * @fileOverview
 * Common code for tests.
 */

var http = require("http");
var path = require("path");
var express = require("express");
var io = require("socket.io");
var vows = require("vows");
var SocketIoMemoryStore = require("socket.io/lib/stores/memory");
var SessionMemoryStore = require("connect/lib/middleware/session/memory");

exports.config = {
  expressSession: {
    cookie: {
      httpOnly: true
    },
    key: "sid",
    secret: "cookieSecret",
    store: new SessionMemoryStore()
  },
  socketIo: {
    "browser client minification": true,
    "browser client etag": true,
    // A comparatively low level of logging. If trying to debug whether or
    // not websockets are working at all, setting log level to 3 is
    // helpful.
    "log level": 1,
    // Match origin protocol MUST be true - when Node.js is operating
    // behind an SSL proxy, which is the default Thywill setup, the
    // difference between ws: and wss: websocket protocols becomes
    // important. This ensures that Socket.IO does the right thing.
    "match origin protocol": true,
    // This MUST match the value of the socketClientConfig.resource value,
    // but with the addition of a leading /.
    "resource": "/socket.io",
    "store": new SocketIoMemoryStore(),
    // The transports to use. We're trying to be modern here and stick with
    // websockets only.
    "transports": ["websocket"]
  },
  workAlreadyClient: {
    log: {
      level: "debug"
    },
    server: {
      host: "localhost",
      port: 10080,
      protocol: "http"
    }
  }
};

/**
 * Launch a minimal test Express.js/Socket.IO application.
 *
 * The configuration options are far more than is used here, but make this code
 * a more helpful starting point for your own test code.
 *
 * @return {object}
 *   A object containing the app, server, and socket.io instances.
 */
exports.launchApp = function () {
  // Set up a minimal Express application.
  var app = express();
  var cookieParser = express.cookieParser(exports.config.expressSession.cookieSecret);
  app.use(express.bodyParser());
  app.use(cookieParser);
  app.use(express.session(exports.config.expressSession));
  // Static file serving from ../expressPublic.
  app.use(express.static(path.join(__dirname, "../expressPublic")));

  // Launch the server.
  var server = http.createServer(app).listen(exports.config.workAlreadyClient.server.port);

  // Start up Socket.IO.
  var socketFactory = io.listen(server);
  // Global configuration.
  socketFactory.configure(function () {
    for (var property in exports.config.socketIo) {
      socketFactory.set(property, exports.config.socketIo[property]);
    }
  });

  // Use the authorization hook to attach the session to the socket
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
        var sessionId = data.signedCookies[exports.config.expressSession.key];
        exports.config.expressSession.store.get(sessionId, function (error, session) {
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

  return {
    app: app,
    server: server,
    socketFactory: socketFactory
  };
};

/**
 * Obtain a Vows test suite.
 *
 * @return {object}
 *   A Vows test suite that launches a server as the first batch.
 */
exports.serverTestSuite = function (name) {
  var suite = vows.describe(name);
  suite.addBatch({
    "Lauch test server": {
      topic: function () {
        return exports.launchApp();
      },
      "launch complete": function (data) {
        suite.app = data.app;
        suite.server = data.server;
        suite.socketFactor = data.socketFactory;
      }
    }
  });

  return suite;
};
