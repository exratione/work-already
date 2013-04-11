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
    },
    sockets: {
      defaultNamespace: "",
      defaultTimeout: function () {
        return 500;
      }
    }
  }
};

/**
 * Launch a minimal test Express.js/Socket.IO application.
 *
 * @return {object}
 *   A object containing the app, server, and socket.io instances.
 */
exports.launchApp = function () {
  // Set up a minimal Express application.
  var app = express();
  var cookieParser = express.cookieParser(exports.config.expressSession.secret);
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
 * Add necessary routes for testing.
 *
 * @param {object} app
 *   An Express.js application.
 */
exports.setupExpressRoutes = function (app) {
  app.post("/post", function (req, res, next) {
    res.redirect("/index.html");
  });
  app.all("*", function (req, res, next) {
    res.send(404, "404 Response");
  });
};

/**
 * Set up the server Socket.IO behavior for testing.
 *
 * @param {object} socketFactory
 *   The Socket.IO instance.
 * @param {array} namespaces
 *   Namespace strings.
 */
exports.setupSocketResponses = function (socketFactory, namespaces) {
  namespaces = namespaces || [exports.config.workAlreadyClient.sockets.defaultNamespace];
  namespaces.forEach(function (namespace, index, array) {
    socketFactory.of(namespace).on("connection", function (socket) {
      console.log("Connection: " + socket.id);
      // Immediately send down a response.
      socket.emit("immediateResponseOnConnect", {
        data: "immediateResponseOnConnect"
      });

      // And a more delayed response.
      setTimeout(function () {
        socket.emit("responseOnConnect", {
          data: "responseOnConnect"
        });
      }, 100);

      // Set up an echo.
      socket.on("test", function (data) {
        socket.emit("responseOnTest", data);
      });
    });
  });
};

/**
 * Obtain a Vows test suite which launches and sets up a server.
 *
 * @return {object}
 *   A Vows test suite that launches a server as the first batch.
 */
exports.serverTestSuite = function (name) {
  var suite = vows.describe(name);
  suite.addBatch({
    "Launch test server": {
      topic: function () {
        var data = exports.launchApp();
        exports.setupExpressRoutes(data.app);
        exports.setupSocketResponses(data.socketFactory);
        return data;
      },
      "launch complete": function (data) {
        suite.app = data.app;
        suite.server = data.server;
        suite.socketFactory = data.socketFactory;
      }
    }
  });

  return suite;
};
