Work Already
============

Session-Aware Web Tests for Socket.IO Applications
--------------------------------------------------

So you've built a single page application with Express.js and Socket.IO,
wherein user sessions are created and managed by Express.js, and then shared
with Socket.IO. Now you'd like to run automated web tests against your
server, hitting both web pages and Socket.IO connections.

This is where you find that your options are somewhat limited - hence the
existence of this small package.

Work Already is a set of tools for building web tests for mixed HTTP/S and
WebSocket web applications built with Socket.IO, where sessions are managed
by Express.js or some other similar http.Server-based framework, and are
integrated with Socket.IO so that the socket handshake has access to the
session and session ID.

Features:

  * Set the order of HTTP/S requests and examine the responses.
  * Make Socket.IO connections that pass the right session information.
  * Emit on sockets and examine or expect server responses.
  * Run as a standalone test or integrate with Vows test suites.

IMPORTANT NOTE: This works with 0.9.x versions of Socket.IO.

Sharing Sessions Between Express.js and Socket.IO?
--------------------------------------------------

Very quickly, here is an example of a generic way to share sessions between
Express.js and Socket.IO by using cookies:

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
      // Now figure out the session from what was placed inside the token and
      // attach it to the data object.
      // ...
    });

See these pages for more on this:

  * [Socket.IO: Authorizing](https://github.com/LearnBoost/socket.io/wiki/Authorizing)
  * [Issue #344: User client on the server with a cookie](https://github.com/LearnBoost/socket.io-client/issues/344)
  * [With socket.io, how to handle authentication with a non-browser client?](http://stackoverflow.com/questions/13381540/with-socket-io-how-to-handle-authentication-with-a-non-browser-client)

The socket.io-client Package Doesn't Allow Cookies To Be Set
------------------------------------------------------------

The challenge for testing in a Node.js rather than browser environment - only
for the situation in which you are using cookies rather than the query string
to pass session identifiers - is that the socket.io-client package doesn't
permit the setting of cookie data in its requests.

The Work Already package works around this issue, admittedly in a very crude
way, but there is little other option but to hack or rewrite the
socket.io-client package code in order to achieve this goal.

Example of Use
--------------

