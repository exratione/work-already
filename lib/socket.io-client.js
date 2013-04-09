/**
 * @fileOverview
 * Adjust the socket.io-client package as needed for test purposes.
 */

var io = require("socket.io-client");
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

// Replace this function such that the XMLHttpRequest implementation
// that can be told to accept cookies is always used.
io.util._request = io.util.request;
io.util.request = function () {
  return new XMLHttpRequest();
};

module.exports = io;
