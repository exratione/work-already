/**
 * @fileOverview
 * Client class definition.
 */

var async = require("async");
var clone = require("clone");
var request = require("request");
var Log = require("./log");
var io = require("./socket.io-client");

// ------------------------------------------------
// Class definition.
// ------------------------------------------------

/**
 * @class
 * A superclass for clients that can make HTTP/S requests and connections via
 * Socket.IO.
 *
 * Configuration has the following form:
 *
 * {
 *   // Optional ID for this client instance.
 *   id: "unique ID",
 *   // Optional log level setting.
 *   log: {
 *     level: "debug"
 *   },
 *   // Required settings for the server used by the client..
 *   server: {
 *     host: "localhost",
 *     port: 10080,
 *     protocol: "http"
 *   },
 *   // Required settings for socket connections.
 *   sockets: {
 *     defaultNamespace: ""
 *   }
 * }
 *
 * @param {Object} config
 *   The configuration information.
 */
function Client (config) {
  this.config = clone(config) || {};

  // Sort out defaults.
  this.config.id = this.config.id || "client-" + Math.floor(Math.random() * 100000);
  this.config.log = this.config.log || {};
  this.config.log.level = this.config.log.level || "debug";

  // Default and necessary client socket configuration. These values must
  // override whatever (if anything) is supplied in a socket connect
  // action.
  //
  // Suppressing autoconnect is necessary to give time to alter the client
  // socket instance before the connection occurs.
  //
  // The first socket connection on a page should force a new connection,
  // which is what would happen in a browser, but here the sockets are by
  // default kept around, which is an issue.
  this.socketConfig = {
    "auto connect": false,
    "force new connection": false
  };
  this.firstSocketConfig = {
    "auto connect": false,
    "force new connection": true
  };

  // Create a log.
  this.log = new Log(this.config.id, this.config.log.level);

  // Set up cookies, data, etc.
  this.clear();
}
var p = Client.prototype;


// ---------------------------------------
// Methods: action processing
// ---------------------------------------

/**
 * Run an action: e.g. load a page over HTTP/S, or open sockets, etc.
 *
 * @param {mixed} action
 *   The action definition.
 * @param {function} callback
 *   Of the form function (error, resultData).
 */
p.action = function (action, callback) {
  // A string is taken to be a path for loading a page via get.
  if (typeof action === "string") {
    action = {
      type: "get",
      path: action
    };
  }
  // If the type is not set, then default to loading a page.
  action.type = action.type || "get";

  // Call the right method for the action.
  var methodName = "_" + action.type;
  var fn = this[methodName];
  if (fn && typeof fn === "function") {
    fn.call(this, action, callback);
  } else {
    callback("No such action type: " + action.type);
  }
};

// ---------------------------------------
// Methods: actions
// ---------------------------------------

/**
 * Make an HTTP request.
 *
 * The action definition follows this format:
 *
 * {
 *   type: "http",
 *   // Is this an AJAX request?
 *   ajax: false,
 *   // Do not record the response if true. Used for things such as static
 *   // content requests in load testing.
 *   discardResponse: false,
 *   // Request method.
 *   method: "GET",
 *   // Parameters for the query string or form fields of a POST request. These
 *   // can be functions.
 *   params: {
 *     name: "value",
 *     other: function () { return 1; }
 *   },
 *   path: "/somePath"
 * }
 *
 * But most of these values have defaults. e.g. a non-AJAX GET request is as
 * follows:
 *
 * {
 *   type: "http",
 *   path: "/somePath"
 * }
 *
 * @param {object} action
 *   The action definition.
 * @param {function} callback
 *   Of the form function (error).
 */
p._http = function (action, callback) {
  if (action.ajax && !this.page) {
    callback(new Error("Action: http: a page must be loaded before making an AJAX request."));
    return;
  }
  else if (action.method === "POST" && !this.page) {
    callback(new Error("Action: http: Cannot submit a form unless a page is loaded."));
    return;
  }

  action.method = action.method || "GET";
  if (!action.path) {
    callback(new Error("Action: http: missing path parameter in action description."));
  }

  var self = this;
  var result = {
    statusCode: undefined,
    body: undefined
  };

  var settings = {
    // Needed to switch a POST redirect to GET.
    followAllRedirects: true,
    jar: this.jar,
    method: action.method,
    url: this.getUrl(action.path)
  };
  if (action.params && typeof action.params === "object") {
    var p = {};
    for (var key in action.params) {
      if (typeof action.params[key] === "function") {
        p[key] = action.params[key]();
      } else {
        p[key] = action.params[key];
      }
    }
    if (action.method === "POST") {
      settings.form = p;
    } else {
      settings.qs = p;
    }
  }
  request(settings, function (error, response, body) {
    if (!response) {
      error = new Error("Response is empty: the target server is probably not running. Path:" + action.path);
      self.log.error(error);
      callback(error, result);
      return;
    }

    result.statusCode = response.statusCode;
    result.body = body;

    if (!action.discardResponse) {
      if (action.ajax) {
        self.ajax = result;
      } else {
        self.page = result;
      }
    }

    // So this should follow redirects before we get to here, so
    // even if a 302 is received, then the redirect is done to the
    // end result which should be a 200.
    if (!error && response.statusCode !== 200) {
      self.log.error("Status code " + response.statusCode + " for " + action.path);
    }
    callback(error, result);
  });
};


/**
 * Make an AJAX request, which requires a page to be loaded already. The
 * results are written to this.ajax in this instance.
 *
 * @see Client#_http
 */
p._ajax = function (action, callback) {
  action.type = "http";
  action.ajax = true;
  this._http(action, callback);
};

/**
 * Load a page via a GET request. The results are written to this.page in this
 * instance.
 *
 * @see Client#_http
 */
p._get = function (action, callback) {
  action.type = "http";
  action.method = "GET";
  action.ajax = false;
  this._http(action, callback);
};

/**
 * Make a POST request, following any redirect. The resulting loaded page is
 * written to this.page in this instance.
 *
 * @see Client#_http
 */
p._post = function (action, callback) {
  action.type = "http";
  action.method = "POST";
  action.ajax = false;
  this._http(action, callback);
};

/**
 * Unload a page: primarily a matter of disconnecting any open sockets, and
 * clearing the stored data.
 *
 * The action definition follows this format:
 *
 * {
 *   type: "unload"
 * }
 *
 * @param {mixed} action
 *   The action definition.
 * @param {function} callback
 *   Of the form function (error, pageData).
 */
p._unload = function (action, callback) {
  if (!this.page) {
    callback();
    return;
  }

  var self = this;
  // Disconnect the socket namespaces - if we have any.
  //
  // TODO: do we actually have to disconnect all of them, since they are
  // multiplexed through a single connection?
  //
  if (this.page.sockets) {
    Object.keys(this.page.sockets).forEach(function (namespace, index, array) {
      self.log.info("Disconnecting socket namespace: " + namespace);
      self.page.sockets[namespace].disconnect();
    });
  }

  delete this.page;
  delete this.ajax;
  delete this.socketEvent;
  callback();
};

/**
 * Load any static content from the current page that hasn't already been
 * loaded in an earlier run of this action. This is useful for checking links
 * or in load testing, otherwise can be skipped.
 *
 * The action definition follows this format:
 *
 * {
 *   type: "getStatic",
 *   // Cache the loaded content. Defaults true.
 *   cache: true,
 *   // Only load URLs with these extensions. Defaults to the value below.
 *   extensions: [".js", ".css", ".jpg", ".png", ".gif"]
 * }
 *
 * @param {object} action
 *   The action definition.
 * @param {function} callback
 *   Of the form function (error).
 */
p._getStatic = function (action, callback) {
  if (!this.page || !this.page.body) {
    this.log.warning("Action: getStatic: no page currently loaded.");
    callback();
    return;
  }

  var self = this;
  var matches = this.page.body.match(/(href|src)=["][^"]+["]/ig);
  if (!matches) {
    callback();
    return;
  }

  // Set the cache default.
  if (action.cache !== false) {
    action.cache = true;
  }
  // Set the extension default.
  var defaultExtensions = [".js", ".css", ".jpg", ".png", ".gif"];
  if (!Array.isArray(action.extensions) || !action.extensions.length) {
    action.extensions = defaultExtensions;
  }
  // Strip the dots.
  action.extensions = action.extensions.map(function (extension, index, array) {
    return extension.replace(/^\./, "");
  });

  matches = matches.map(function (match, index, array) {
    // Extract the URI from the match.
    var innerMatches = match.match(/["]([^"]+)["]/);
    match = innerMatches[1];

    // Local paths only.
    if (match.match(/:\/\//)) {
      return null;
    }
    // Make sure we're matching the right extensions.
    if (!match.match(new RegExp("\\.(" + action.extensions.join("|") + ")"))) {
      return null;
    }
    // If we've loaded it already, skip it.
    if (self.staticData[match]) {
      return null;
    }
    return match;
  }).filter(function (match, index, array) {
    // Remove the nulls created above, and also duplicates.
    if (!match) {
      return false;
    } else {
      return (index === array.lastIndexOf(match));
    }
  });

  if (!matches.length) {
    callback();
    return;
  }

  // Get the files in parallel.
  async.forEach(matches, function (match, asyncCallback) {
    self.action({
      type: "get",
      discardResponse: true,
      path: match
    }, function (error, result) {
      if (!error && result && action.cache) {
        self.staticData[match] = result.body;
      }
      asyncCallback(error);
    });
  }, callback);
};

/**
 * Open a socket connection.
 *
 * The action definition follows this format:
 *
 * {
 *   type: "socket",
 *   // An optional connection namespace. If omitted no namespace is used.
 *   namespace: "/namespace",
 *   // Milliseconds after which the test is timed out.
 *   timeout: 500,
 *   // Optional client socket configuration.
 *   socketConfig: {}
 * }
 *
 * @param {object} action
 *   The action definition.
 * @param {function} callback
 *   Of the form function (error).
 */
p._socket = function (action, callback) {
  if (!this.page) {
    callback(new Error("Action: socket: a page must be loaded before connecting with Socket.IO."));
    return;
  }

  action.namespace = action.namespace || this.config.sockets.defaultNamespace;

  this.log.info("Connecting socket for namespace: '" + action.namespace + "'");

  var self = this;
  var socketUrl = this.getUrl(action.namespace);
  // Is this the first socket connection for this page?
  var first = (!this.page.sockets || Object.keys(this.page.sockets).length === 0);
  // Create the client socket configuration, overriding the necessary values.
  var socketConfig = clone(action.socketConfig) || {};
  var overrides;
  if (first) {
    overrides = this.firstSocketConfig;
  } else {
    overrides = this.socketConfig;
  }
  for (var prop in overrides) {
    socketConfig[prop] = overrides[prop];
  }

  // Get on with actually connecting.
  var namespace = io.connect(socketUrl, socketConfig);
  this.ensureSocketUsesCookies(namespace.socket);
  this.page.sockets = this.page.sockets || {};
  this.page.sockets[action.namespace] = namespace;
  namespace.socket.connect();

  // Wait for connection to complete before continuing. It might already
  // be complete (unlikely, but vaguely possible), so check that.
  if (namespace.socket.connected) {
    callback();
    return;
  }
  // Otherwise set up a listener and timeout.
  var timeoutId;
  var listener = function (error) {
    clearTimeout(timeoutId);
    callback(error);
  };
  namespace.once("connect", listener);
  namespace.once("error", listener);
  timeoutId = setTimeout(function () {
    namespace.removeListener("connect", listener);
    namespace.removeListener("error", listener);
    callback(new Error("Timed out waiting on connection for socket on namespace '" + action.namespace + "'"));
  }, action.timeout);
};

/**
 * Emit an event on one of the sockets.
 *
 * The action definition follows this format:
 *
 * {
 *   type: "emit",
 *   // This can be omitted and defaults to config.sockets.defaultNamespace.
 *   namespace: "/namespace"
 *   // Arguments for the emit function.
 *   args: ["eventType", data1, data2, ... ]
 * }
 *
 * @param {object} action
 *   The action definition.
 * @param {function} callback
 *   Of the form function (error).
 */
p._emit = function (action, callback) {
  if (!this.page) {
    callback(new Error("Cannot emit unless a page is loaded."));
    return;
  }

  if (!Array.isArray(action.args) || !action.args.length) {
    callback(new Error("For emit actions, action.args must be an array that at least includes the event type string."));
    return;
  }

  action.namespace = action.namespace || this.config.sockets.defaultNamespace;
  var namespace = this.page.sockets[action.namespace];
  if (!namespace) {
    callback(new Error("No connected socket for namespace: '" + action.namespace + "'"));
    return;
  }

  this.log.info("Emit for namespace: '" + action.namespace + "' with event: " + action.args[0]);
  namespace.emit.apply(namespace, action.args);
  callback();
};

/**
 * Wait for an event to be emitted by one of the sockets.
 *
 * The action definition follows this format:
 *
 * {
 *   type: "awaitEmit",
 *   // This can be omitted and defaults to config.sockets.defaultNamespace.
 *   namespace: "/namespace"
 *   // The event type.
 *   eventType: "someEvent",
 *   // Milliseconds to wait before timing out.
 *   timeout: 2000
 * }
 *
 * @param {object} action
 *   The action definition.
 * @param {function} callback
 *   Of the form function (error, eventData).
 */
p._awaitEmit = function (action, callback) {
  if (!this.page) {
    callback(new Error("Cannot emit unless a page is loaded."));
    return;
  }

  action.namespace = action.namespace || this.config.sockets.defaultNamespace;
  var namespace = this.page.sockets[action.namespace];
  if (!namespace) {
    callback(new Error("No connected socket for namespace: '" + action.namespace + "'"));
    return;
  }

  var self = this;
  var timeoutId;
  // Listener function to add to the socket connection.
  var listener = function () {
    clearTimeout(timeoutId);
    var args = [];
    for (var index = 0, length = arguments.length; index < length; index++) {
      args.push(arguments[index]);
    }
    self.socketEvent = {
      namespace: action.namespace,
      eventType: action.eventType,
      args: args
    };
    callback(null, self.socketEvent);
  };

  timeoutId = setTimeout(function () {
    namespace.removeListener(action.eventType, listener);
    callback(new Error("Timed out waiting on event " + action.eventType + " from socket namespace '" + action.namespace + "'"));
  }, action.timeout);

  namespace.once(action.eventType, listener);
};

// ---------------------------------------
// Methods: utility
// ---------------------------------------

/**
 * Clear caches, cookies, sockets, etc., gathered by this client during
 * actions.
 */
p.clear = function () {
  // Reset the cookie jar.
  this.jar = request.jar();
  // Data for the last loaded page.
  delete this.page;
  // Data for the last loaded AJAX request.
  delete this.ajax;
  // Data for the last socket event received via the awaitEmit action.
  delete this.socketEvent;
  // Cache for static content loaded when referenced in a page.
  this.staticData = {};
};

/**
 * Flesh out the path into a full URL.
 *
 * @param {string} path
 *   E.g. "/somePath".
 * @return {string}
 *   E.g. "http://localhost:10080/somePath".
 */
p.getUrl = function (path) {
  var s = this.config.server;
  return s.protocol + "://" + s.host + ":" + s.port + path;
};

/**
 * Add the current set of cookies to the specified request.
 *
 * @param {XMLHttpRequest} xhr
 */
p.addCookiesToXMLHttpRequest = function (xhr) {
  // This is only possible using the NPM package XMLHttpRequest, which is not
  // what Socket.IO uses unless hacked to use it.
  xhr.setDisableHeaderCheck(true);
  xhr.withCredentials = true;
  // Obtain the cookie as a string and attach it to the XMLHttpRequest
  // instance.
  var cookieString = this.jar.cookieString({ url: "/" });
  xhr.setRequestHeader("Cookie", cookieString);
};

/**
 * Hack the provided socket instance so that cookies from this.jar are passed
 * to the socket handshake.
 *
 * @param {object} socket
 *   A socket.io-client socket instance.
 */
p.ensureSocketUsesCookies = function (socket) {
  var thisRunner = this;

  function empty () { }

  socket.handshake = function (fn) {

    var self = this
      , options = this.options;

    function complete (data) {
      if (data instanceof Error) {
        self.connecting = false;
        self.onError(data.message);
      } else {
        fn.apply(null, data.split(':'));
      }
    };

    var url = [
          'http' + (options.secure ? 's' : '') + ':/'
        , options.host + ':' + options.port
        , options.resource
        , io.protocol
        , io.util.query(this.options.query, 't=' + +new Date)
      ].join('/');

    if (this.isXDomain() && !io.util.ua.hasCORS) {
      var insertAt = document.getElementsByTagName('script')[0]
        , script = document.createElement('script');

      script.src = url + '&jsonp=' + io.j.length;
      insertAt.parentNode.insertBefore(script, insertAt);

      io.j.push(function (data) {
        complete(data);
        script.parentNode.removeChild(script);
      });
    } else {
      var xhr = io.util.request();
      xhr.open('GET', url, true);

      //
      //
      // Whole function copied, just so we can add this.
      //
      thisRunner.addCookiesToXMLHttpRequest(xhr);
      //
      //
      //
      //

      if (this.isXDomain()) {
        xhr.withCredentials = true;
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
          xhr.onreadystatechange = empty;

          if (xhr.status == 200) {
            complete(xhr.responseText);
          } else if (xhr.status == 403) {
            self.onError(xhr.responseText);
          } else {
            self.connecting = false;
            !self.reconnecting && self.onError(xhr.responseText);
          }
        }
      };
      xhr.send(null);
    }
  };
};

// ---------------------------------------
// Exports: Class constructor.
// ---------------------------------------

module.exports = Client;
