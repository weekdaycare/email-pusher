/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 2764:
/***/ ((module) => {

"use strict";


// expose to the world
module.exports = addressparser;

/**
 * Parses structured e-mail addresses from an address field
 *
 * Example:
 *
 *    'Name <address@domain>'
 *
 * will be converted to
 *
 *     [{name: 'Name', address: 'address@domain'}]
 *
 * @param {String} str Address field
 * @return {Array} An array of address objects
 */
function addressparser(str) {
    var tokenizer = new Tokenizer(str);
    var tokens = tokenizer.tokenize();

    var addresses = [];
    var address = [];
    var parsedAddresses = [];

    tokens.forEach(function (token) {
        if (token.type === 'operator' && (token.value === ',' || token.value === ';')) {
            if (address.length) {
                addresses.push(address);
            }
            address = [];
        } else {
            address.push(token);
        }
    });

    if (address.length) {
        addresses.push(address);
    }

    addresses.forEach(function (address) {
        address = _handleAddress(address);
        if (address.length) {
            parsedAddresses = parsedAddresses.concat(address);
        }
    });

    return parsedAddresses;
}

/**
 * Converts tokens for a single address into an address object
 *
 * @param {Array} tokens Tokens object
 * @return {Object} Address object
 */
function _handleAddress(tokens) {
    var token;
    var isGroup = false;
    var state = 'text';
    var address;
    var addresses = [];
    var data = {
        address: [],
        comment: [],
        group: [],
        text: []
    };
    var i;
    var len;

    // Filter out <addresses>, (comments) and regular text
    for (i = 0, len = tokens.length; i < len; i++) {
        token = tokens[i];
        if (token.type === 'operator') {
            switch (token.value) {
                case '<':
                    state = 'address';
                    break;
                case '(':
                    state = 'comment';
                    break;
                case ':':
                    state = 'group';
                    isGroup = true;
                    break;
                default:
                    state = 'text';
            }
        } else if (token.value) {
            if (state === 'address') {
                // handle use case where unquoted name includes a "<"
                // Apple Mail truncates everything between an unexpected < and an address
                // and so will we
                token.value = token.value.replace(/^[^<]*<\s*/, '');
            }
            data[state].push(token.value);
        }
    }

    // If there is no text but a comment, replace the two
    if (!data.text.length && data.comment.length) {
        data.text = data.comment;
        data.comment = [];
    }

    if (isGroup) {
        // http://tools.ietf.org/html/rfc2822#appendix-A.1.3
        data.text = data.text.join(' ');
        addresses.push({
            name: data.text || (address && address.name),
            group: data.group.length ? addressparser(data.group.join(',')) : []
        });
    } else {
        // If no address was found, try to detect one from regular text
        if (!data.address.length && data.text.length) {
            for (i = data.text.length - 1; i >= 0; i--) {
                if (data.text[i].match(/^[^@\s]+@[^@\s]+$/)) {
                    data.address = data.text.splice(i, 1);
                    break;
                }
            }

            var _regexHandler = function (address) {
                if (!data.address.length) {
                    data.address = [address.trim()];
                    return ' ';
                } else {
                    return address;
                }
            };

            // still no address
            if (!data.address.length) {
                for (i = data.text.length - 1; i >= 0; i--) {
                    // fixed the regex to parse email address correctly when email address has more than one @
                    data.text[i] = data.text[i].replace(/\s*\b[^@\s]+@[^\s]+\b\s*/, _regexHandler).trim();
                    if (data.address.length) {
                        break;
                    }
                }
            }
        }

        // If there's still is no text but a comment exixts, replace the two
        if (!data.text.length && data.comment.length) {
            data.text = data.comment;
            data.comment = [];
        }

        // Keep only the first address occurence, push others to regular text
        if (data.address.length > 1) {
            data.text = data.text.concat(data.address.splice(1));
        }

        // Join values with spaces
        data.text = data.text.join(' ');
        data.address = data.address.join(' ');

        if (!data.address && isGroup) {
            return [];
        } else {
            address = {
                address: data.address || data.text || '',
                name: data.text || data.address || ''
            };

            if (address.address === address.name) {
                if ((address.address || '').match(/@/)) {
                    address.name = '';
                } else {
                    address.address = '';
                }

            }

            addresses.push(address);
        }
    }

    return addresses;
}

/**
 * Creates a Tokenizer object for tokenizing address field strings
 *
 * @constructor
 * @param {String} str Address field string
 */
function Tokenizer(str) {
    this.str = (str || '').toString();
    this.operatorCurrent = '';
    this.operatorExpecting = '';
    this.node = null;
    this.escaped = false;

    this.list = [];
}

/**
 * Operator tokens and which tokens are expected to end the sequence
 */
Tokenizer.prototype.operators = {
    '"': '"',
    '(': ')',
    '<': '>',
    ',': '',
    ':': ';',
    // Semicolons are not a legal delimiter per the RFC2822 grammar other
    // than for terminating a group, but they are also not valid for any
    // other use in this context.  Given that some mail clients have
    // historically allowed the semicolon as a delimiter equivalent to the
    // comma in their UI, it makes sense to treat them the same as a comma
    // when used outside of a group.
    ';': ''
};

/**
 * Tokenizes the original input string
 *
 * @return {Array} An array of operator|text tokens
 */
Tokenizer.prototype.tokenize = function () {
    var chr, list = [];
    for (var i = 0, len = this.str.length; i < len; i++) {
        chr = this.str.charAt(i);
        this.checkChar(chr);
    }

    this.list.forEach(function (node) {
        node.value = (node.value || '').toString().trim();
        if (node.value) {
            list.push(node);
        }
    });

    return list;
};

/**
 * Checks if a character is an operator or text and acts accordingly
 *
 * @param {String} chr Character from the address field
 */
Tokenizer.prototype.checkChar = function (chr) {
    if ((chr in this.operators || chr === '\\') && this.escaped) {
        this.escaped = false;
    } else if (this.operatorExpecting && chr === this.operatorExpecting) {
        this.node = {
            type: 'operator',
            value: chr
        };
        this.list.push(this.node);
        this.node = null;
        this.operatorExpecting = '';
        this.escaped = false;
        return;
    } else if (!this.operatorExpecting && chr in this.operators) {
        this.node = {
            type: 'operator',
            value: chr
        };
        this.list.push(this.node);
        this.node = null;
        this.operatorExpecting = this.operators[chr];
        this.escaped = false;
        return;
    }

    if (!this.escaped && chr === '\\') {
        this.escaped = true;
        return;
    }

    if (!this.node) {
        this.node = {
            type: 'text',
            value: ''
        };
        this.list.push(this.node);
    }

    if (this.escaped && chr !== '\\') {
        this.node.value += '\\';
    }

    this.node.value += chr;
    this.escaped = false;
};


/***/ }),

/***/ 8909:
/***/ ((module) => {

/**
 * Like Array#indexOf but for objects used like hashes
 *
 * Example:
 *    var arr = [];
 *    var obj = { a: 1, b: 2, c: 'a b c'};
 *    var obj2 = { a: 1, b: 2, c: 'a b c'}; // same key/value pairs
 *    arr.push(obj);
 *    arr.indexOf(obj); // 0
 *    arr.indexOf(obj2); // -1
 *    indexOfObject = require('array-indexofobject');
 *    indexOfObject(arr, obj); // 0
 *    indexOfObject(arr, obj2); // 0
 *
 * @param {Array}
 * @param {Object}
 * @param {Sting|Array} (optional)
 * @return {Number}
 */
module.exports = function indexOfObject (array, object, keys) {
  if (!keys) {
    keys = Object.keys(object);
  }
  if (!Array.isArray(keys)) {
    keys = [keys];
  }

  var i = 0, len = array.length;
  for (; i < len; i++) {
    if (keys.every(matches.bind(null, array[i], object))) {
      return i;
    }
  }
  return -1;
};

function matches (item, object, key) {
  return has(item, key) && has(object, key) && item[key] === object[key];
}

/**
 * Safe hasOwnProperty
 * See: http://www.devthought.com/2012/01/18/an-object-is-not-a-hash/
 */
function has (obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}


/***/ }),

/***/ 5898:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.

function isArray(arg) {
  if (Array.isArray) {
    return Array.isArray(arg);
  }
  return objectToString(arg) === '[object Array]';
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = __nccwpck_require__(4300).Buffer.isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


/***/ }),

/***/ 9155:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

module.exports = __nccwpck_require__(9039);


/***/ }),

/***/ 9039:
/***/ ((module, exports, __nccwpck_require__) => {

/**********************************************************************
 node-feedparser - A robust RSS, Atom, RDF parser for node.
 http://github.com/danmactough/node-feedparser
 Copyright (c) 2011-2018 Dan MacTough and contributors
 http://mact.me

**********************************************************************/

/**
 * Module dependencies.
 */
var sax = __nccwpck_require__(2043)
  , addressparser = __nccwpck_require__(2764)
  , indexOfObject = __nccwpck_require__(8909)
  , util = __nccwpck_require__(3837)
  , TransformStream = (__nccwpck_require__(1642).Transform)
  , _ = __nccwpck_require__(6954);

/**
 * FeedParser constructor.
 *
 * Exposes a duplex (transform) stream to parse a feed.
 *
 * Each article/post in the feed will have the following keys:
 *   - title {String}
 *   - description {String}
 *   - summary {String}
 *   - date {Date} (or null)
 *   - pubdate {Date} (or null)
 *   - link {String}
 *   - origlink {String}
 *   - author {String}
 *   - guid {String}
 *   - comments {String}
 *   - image {Object}
 *   - categories {Array}
 *   - source {Object}
 *   - enclosures {Array}
 *   - meta {Object}
 *   - Object.keys(meta):
 *     - #ns {Array} key,value pairs of each namespace declared for the feed
 *     - #type {String} one of 'atom', 'rss', 'rdf'
 *     - #version {String}
 *     - title {String}
 *     - description {String}
 *     - date {Date} (or null)
 *     - pubdate {Date} (or null)
 *     - link {String} i.e., to the website, not the feed
 *     - xmlurl {String} the canonical URL of the feed, as declared by the feed
 *     - author {String}
 *     - language {String}
 *     - image {Object}
 *     - favicon {String}
 *     - copyright {String}
 *     - generator {String}
 *     - categories {Array}
 *
 * @param {Object} options
 * @api public
 */
function FeedParser (options) {
  if (!(this instanceof FeedParser)) return new FeedParser(options);
  TransformStream.call(this);
  this._readableState.objectMode = true;
  this._readableState.highWaterMark = 16; // max. # of output nodes buffered

  this.init();

  // Parse options
  this.options = _.assign({}, options);
  if (!('strict' in this.options)) this.options.strict = false;
  if (!('normalize' in this.options)) this.options.normalize = true;
  if (!('addmeta' in this.options)) this.options.addmeta = true;
  if (!('resume_saxerror' in this.options)) this.options.resume_saxerror = true;
  if ('MAX_BUFFER_LENGTH' in this.options) {
    sax.MAX_BUFFER_LENGTH = this.options.MAX_BUFFER_LENGTH; // set to Infinity to have unlimited buffers
  } else {
    sax.MAX_BUFFER_LENGTH = 16 * 1024 * 1024; // 16M versus the 64K default
  }
  if (this.options.feedurl) this.xmlbase.unshift({ '#name': 'xml', '#': this.options.feedurl});

  // See https://github.com/isaacs/sax-js for more info
  this.stream = sax.createStream(this.options.strict /* strict mode - no by default */, {lowercase: true, xmlns: true });
  this.stream.on('error', this.handleSaxError.bind(this));
  this.stream.on('processinginstruction', this.handleProcessingInstruction.bind(this));
  this.stream.on('opentag', this.handleOpenTag.bind(this));
  this.stream.on('closetag',this.handleCloseTag.bind(this));
  this.stream.on('text', this.handleText.bind(this));
  this.stream.on('cdata', this.handleText.bind(this));
  this.stream.on('end', this.handleEnd.bind(this));
}
util.inherits(FeedParser, TransformStream);

/*
 * Initializes the SAX stream
 *
 * Initializes the class-variables
 */
FeedParser.prototype.init = function (){
  this.meta = {
    '#ns': [],
    '@': [],
    '#xml': {}
  };
  this._namespaces = {};
  this._emitted_meta = false;
  this.stack = [];
  this.xmlbase = [];
  this.in_xhtml = false;
  this.xhtml = {}; /* Where to store xhtml elements as associative
                      array with keys: '#' (containing the text)
                      and '#name' (containing the XML element name) */
  this.errors = [];
};

FeedParser.prototype.handleEnd = function (){
  // We made it to the end without throwing, but let's make sure we were actually
  // parsing a feed
  if (!(this.meta && this.meta['#type'])) {
    var e = new Error('Not a feed');
    return this.handleError(e);
  }
  this.push(null);
};

FeedParser.prototype.handleSaxError = function (e) {
  this.emit('error', e);
  if (this.options.resume_saxerror) {
    this.resumeSaxError();
  }
};

FeedParser.prototype.resumeSaxError = function () {
  if (this.stream._parser) {
    this.stream._parser.error = null;
    this.stream._parser.resume();
  }
};

FeedParser.prototype.handleError = function (e){
  this.emit('error', e);
};

// parses the xml declaration, which looks like:
// <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
FeedParser.prototype.handleProcessingInstruction = function (node) {
  if (node.name === 'xml') {
    this.meta['#xml'] = node.body.trim().split(/\s+/).reduce(function (map, attr) {
      if (attr.indexOf('=') >= 0) {
        var parts = attr.split('=');
        map[parts[0]] = parts[1] && parts[1].length > 2 && parts[1].match(/^.(.*?).$/)[1];
      }
      return map;
    }, this.meta['#xml']);
  }
};

FeedParser.prototype.handleOpenTag = function (node){
  var n = {};
  n['#name'] = node.name; // Avoid namespace collissions later...
  n['#prefix'] = node.prefix; // The current ns prefix
  n['#local'] = node.local; // The current element name, sans prefix
  n['#uri'] = node.uri; // The current ns uri
  n['@'] = {};
  n['#'] = '';

  if (Object.keys(node.attributes).length) {
    n['@'] = this.handleAttributes(node.attributes, n['#name']);
  }

  if (this.in_xhtml && this.xhtml['#name'] != n['#name']) { // We are in an xhtml node
    // This builds the opening tag, e.g., <div id='foo' class='bar'>
    this.xhtml['#'] += '<'+n['#name'];
    Object.keys(n['@']).forEach(function(name){
      this.xhtml['#'] += ' '+ name +'="'+ n['@'][name] + '"';
    }, this);
    this.xhtml['#'] += '>';
  } else if ( this.stack.length === 0 &&
              (n['#name'] === 'rss' ||
              (n['#local'] === 'rdf' && _.nslookup([n['#uri']], 'rdf')) ||
              (n['#local'] === 'feed'&& _.nslookup([n['#uri']], 'atom')) ) ) {
    Object.keys(n['@']).forEach(function(name) {
      var o = {};
      if (name != 'version') {
        o[name] = n['@'][name];
        this.meta['@'].push(o);
      }
    }, this);
    switch(n['#local']) {
    case 'rss':
      this.meta['#type'] = 'rss';
      this.meta['#version'] = n['@']['version'];
      break;
    case 'rdf':
      this.meta['#type'] = 'rdf';
      this.meta['#version'] = n['@']['version'] || '1.0';
      break;
    case 'feed':
      this.meta['#type'] = 'atom';
      this.meta['#version'] = n['@']['version'] || '1.0';
      break;
    }
  }
  this.stack.unshift(n);
};

FeedParser.prototype.handleCloseTag = function (el){
  var node = {
      '#name': el,
      '#prefix': '',
      '#local' : ''
    }
    , stdEl
    , item
    , baseurl
    , isIllegallyNested = false
    ;
  var n = this.stack.shift();
  el = el.split(':');

  if (el.length > 1 && el[0] === n['#prefix']) {
    if (_.nslookup(n['#uri'], 'atom')) {
      node['#prefix'] = el[0];
      node['#local'] = el.slice(1).join(':');
      node['#type'] = 'atom';
    } else if (_.nslookup(n['#uri'], 'rdf')) {
      node['#prefix'] = el[0];
      node['#local'] = el.slice(1).join(':');
      node['#type'] = 'rdf';
    } else {
      node['#prefix'] = _.nsprefix(n['#uri']) || n['#prefix'];
      node['#local'] = el.slice(1).join(':');
    }
  } else {
    node['#local'] = node['#name'];
    node['#type'] = _.nsprefix(n['#uri']) || n['#prefix'];
  }
  delete n['#name'];
  delete n['#local'];
  delete n['#prefix'];
  delete n['#uri'];

  if (this.xmlbase && this.xmlbase.length) {
    baseurl = this.xmlbase[0]['#'];
  }

  var mayHaveResolvableUrl = (
    (
      (node['#local'] === 'logo' || node['#local'] === 'icon') && node['#type'] === 'atom'
    ) ||
    (
      node['#local'] === 'link' // include rss:link, even though it should _never_ be a relative URL
    )
  );
  if (baseurl && mayHaveResolvableUrl) {
    // Apply xml:base to these elements as they appear
    // rather than leaving it to the ultimate parser
    n['#'] = _.resolve(baseurl, n['#']);
  }

  if (this.xmlbase.length && (el == this.xmlbase[0]['#name'])) {
    void this.xmlbase.shift();
  }

  if (this.in_xhtml) {
    if (node['#name'] == this.xhtml['#name']) { // The end of the XHTML

      // Add xhtml data to the container element
      n['#'] += this.xhtml['#'].trim();
      // Clear xhtml nodes from the tree
      for (var key in n) {
        if (key != '@' && key != '#') {
          delete n[key];
        }
      }
      this.xhtml = {};
      this.in_xhtml = false;
    } else { // Somewhere in the middle of the XHTML
      this.xhtml['#'] += '</' + node['#name'] + '>';
    }
  }

  if ('#' in n) {
    if (n['#'].match(/^\s*$/)) {
      // Delete text nodes with nothing by whitespace
      delete n['#'];
    } else {
      n['#'] = n['#'].trim();
      if (Object.keys(n).length === 1) {
        // If there is only one text node, hoist it
        n = n['#'];
      }
    }
  }

  if (node['#name'] === 'item' ||
      node['#name'] === 'entry' ||
      (node['#local'] === 'item' && (node['#prefix'] === '' || node['#type'] === 'rdf')) ||
      (node['#local'] == 'entry' && (node['#prefix'] === '' || node['#type'] === 'atom'))) { // We have an article!

    isIllegallyNested = (
      ( node['#name'] === 'item' && this.stack[0]['#name'] === 'item' ) ||
      ( node['#name'] === 'entry' && this.stack[0]['#name'] === 'entry' ) ||
      ( (node['#local'] === 'item' && (node['#prefix'] === '' || node['#type'] === 'rdf')) && this.stack[0]['#name'] === 'item' ) ||
      ( (node['#local'] == 'entry' && (node['#prefix'] === '' || node['#type'] === 'atom')) && this.stack[0]['#name'] === 'entry' )
    );

    if (isIllegallyNested) {
      return;
    }

    if (!this.meta.title) { // We haven't yet parsed all the metadata
      _.assign(this.meta, this.handleMeta(this.stack[0], this.meta['#type'], this.options));
      if (!this._emitted_meta) {
        this.emit('meta', this.meta);
        this._emitted_meta = true;
      }
    }
    if (!baseurl && this.xmlbase && this.xmlbase.length) { // handleMeta was able to infer a baseurl without xml:base or options.feedurl
      n = _.reresolve(n, this.xmlbase[0]['#']);
    }
    item = this.handleItem(n, this.meta['#type'], this.options);
    if (this.options.addmeta) {
      item.meta = this.meta;
    }
    if (this.meta.author && !item.author) item.author = this.meta.author;
    this.push(item);
  } else if (!this.meta.title && // We haven't yet parsed all the metadata
              (node['#name'] === 'channel' ||
               node['#name'] === 'feed' ||
               (node['#local'] === 'channel' && (node['#prefix'] === '' || node['#type'] === 'rdf')) ||
               (node['#local'] === 'feed' && (node['#prefix'] === '' || node['#type'] === 'atom')) ) ) {
    _.assign(this.meta, this.handleMeta(n, this.meta['#type'], this.options));
    if (!this._emitted_meta) {
      this.emit('meta', this.meta);
      this._emitted_meta = true;
    }
  }

  if (this.stack.length > 0) {
    if (node['#prefix'] && node['#local'] && !node['#type']) {
      stdEl = node['#prefix'] + ':' + node['#local'];
    } else if (node['#name'] && node['#type'] && node['#type'] !== this.meta['#type']) {
      stdEl = node['#name'];
    } else {
      stdEl = node['#local'] || node['#name'];
    }
    if (!Object.prototype.hasOwnProperty.call(this.stack[0], stdEl)) {
      this.stack[0][stdEl] = n;
    } else if (this.stack[0][stdEl] instanceof Array) {
      this.stack[0][stdEl].push(n);
    } else {
      this.stack[0][stdEl] = [this.stack[0][stdEl], n];
    }
  }
};

FeedParser.prototype.handleText = function (text){
  if (this.in_xhtml) {
    this.xhtml['#'] += text;
  } else {
    if (this.stack.length) {
      if (this.stack[0] && '#' in this.stack[0]) {
        this.stack[0]['#'] += text;
      } else {
        this.stack[0]['#'] = text;
      }
    }
  }
};

FeedParser.prototype.handleAttributes = function handleAttributes (attrs, el) {
  /*
   * Using the sax.js option { xmlns: true }
   * attrs is an array of objects (not strings) having the following properties
   * name - e.g., xmlns:dc or href
   * value
   * prefix - the first part of the name of the attribute (before the colon)
   * local - the second part of the name of the attribute (after the colon)
   * uri - the uri of the namespace
   *
   */

  var basepath = ''
    , simplifiedAttributes = {}
    ;

  if (this.xmlbase && this.xmlbase.length) {
    basepath = this.xmlbase[0]['#'];
  }

  Object.keys(attrs).forEach(function(key){
    var attr = attrs[key]
      , ns = {}
      , prefix = ''
      ;
    if (attr.prefix === 'xmlns') {
      if (!(attr.name in this._namespaces)) {
        ns[attr.name] = attr.value;
        this.meta['#ns'].push(ns);
        _.assign(this._namespaces, ns);
      }
    }
    // If the feed is using a non-default prefix, we'll use it, too
    // But we force the use of the 'xml' prefix
    if (attr.uri && attr.prefix && !_.nslookup(attr.uri, attr.prefix) || _.nslookup(attr.uri, 'xml')) {
      prefix = ( _.nsprefix(attr.uri) || attr.prefix ) + ( attr.local ? ':' : '' );
    }
    if (basepath && (attr.local == 'href' || attr.local == 'src' || attr.local == 'uri')) {
      // Apply xml:base to these elements as they appear
      // rather than leaving it to the ultimate parser
      attr.value = _.resolve(basepath, attr.value);
    } else if (attr.local === 'base' && _.nslookup(attr.uri, 'xml')) {
      // Keep track of the xml:base for the current node
      if (basepath) {
        attr.value = _.resolve(basepath, attr.value);
      }
      this.xmlbase.unshift({ '#name': el, '#': attr.value});
    } else if (attr.name === 'type' && attr.value === 'xhtml') {
      this.in_xhtml = true;
      this.xhtml = {'#name': el, '#': ''};
    }
    simplifiedAttributes[prefix + attr.local] = attr.value ? attr.value.trim() : '';
  }, this);
  return simplifiedAttributes;
};

FeedParser.prototype.handleMeta = function handleMeta (node, type, options) {
  if (!type || !node) return {};

  var meta = {}
    , normalize = !options || (options && options.normalize)
    ;

  if (normalize) {
    ['title','description','date', 'pubdate', 'pubDate','link', 'xmlurl', 'xmlUrl','author','language','favicon','copyright','generator'].forEach(function (property){
      meta[property] = null;
    });
    meta.cloud = {};
    meta.image = {};
    meta.categories = [];
  }

  Object.keys(node).forEach(function(name){
    var el = node[name];

    if (normalize) {
      switch(name){
      case('title'):
        meta.title = _.get(el);
        break;
      case('description'):
      case('subtitle'):
        meta.description = _.get(el);
        break;
      case('pubdate'):
      case('lastbuilddate'):
      case('published'):
      case('modified'):
      case('updated'):
      case('dc:date'):
        var date = _.get(el) ? new Date(_.get(el)) : null;
        if (!date) break;
        if (meta.pubdate === null || name == 'pubdate' || name == 'published')
          meta.pubdate = meta.pubDate = date;
        if (meta.date === null || name == 'lastbuilddate' || name == 'modified' || name == 'updated')
          meta.date = date;
        break;
      case('link'):
      case('atom:link'):
      case('atom10:link'):
        if (Array.isArray(el)) {
          el.forEach(function (link){
            if (link['@']['href']) { // Atom
              if (_.get(link['@'], 'rel')) {
                if (link['@']['rel'] == 'alternate') {
                  if (!meta.link) meta.link = link['@']['href'];
                }
                else if (link['@']['rel'] == 'self') {
                  meta.xmlurl = meta.xmlUrl = link['@']['href'];
                  if (_.isAbsoluteUrl(meta.xmlurl) && this.xmlbase && this.xmlbase.length === 0) {
                    this.xmlbase.unshift({ '#name': 'xml', '#': meta.xmlurl });
                    this.stack[0] = _.reresolve(this.stack[0], meta.xmlurl);
                  }
                  else if (this.xmlbase && this.xmlbase.length > 0) {
                    meta.xmlurl = meta.xmlUrl = _.resolve(_.get(this.xmlbase[0], '#'), meta.xmlurl);
                  }
                }
                else if (link['@']['rel'] == 'hub' && !(meta.cloud.href || meta.cloud.domain)) {
                  meta.cloud.type = 'hub';
                  meta.cloud.href = link['@']['href'];
                }
              } else {
                if (!meta.link) meta.link = link['@']['href'];
              }
            } else if (Object.keys(link['@']).length === 0) { // RSS
              meta.link = _.get(link);
            }
            if (_.isAbsoluteUrl(meta.link) && this.xmlbase && this.xmlbase.length === 0) {
              this.xmlbase.unshift({ '#name': 'xml', '#': meta.link});
              this.stack[0] = _.reresolve(this.stack[0], meta.link);
            }
            else if (this.xmlbase && this.xmlbase.length > 0) {
              meta.link = _.resolve(_.get(this.xmlbase[0], '#'), meta.link);
            }
          }, this);
        } else {
          if (el['@']['href']) { // Atom
            if (_.get(el['@'], 'rel')) {
              if (el['@']['rel'] == 'alternate') {
                if (!meta.link) meta.link = el['@']['href'];
              }
              else if (el['@']['rel'] == 'self') {
                meta.xmlurl = meta.xmlUrl = el['@']['href'];
                if (_.isAbsoluteUrl(meta.xmlurl) && this.xmlbase && this.xmlbase.length === 0) {
                  this.xmlbase.unshift({ '#name': 'xml', '#': meta.xmlurl});
                  this.stack[0] = _.reresolve(this.stack[0], meta.xmlurl);
                }
                else if (this.xmlbase && this.xmlbase.length > 0) {
                  meta.xmlurl = meta.xmlUrl = _.resolve(_.get(this.xmlbase[0], '#'), meta.xmlurl);
                }
              }
              else if (el['@']['rel'] == 'hub' && !(meta.cloud.href || meta.cloud.domain)) {
                meta.cloud.type = 'hub';
                meta.cloud.href = el['@']['href'];
              }
            } else {
              meta.link = el['@']['href'];
            }
          } else if (Object.keys(el['@']).length === 0) { // RSS
            if (!meta.link) meta.link = _.get(el);
          }
          if (_.isAbsoluteUrl(meta.link) && this.xmlbase && this.xmlbase.length === 0) {
            this.xmlbase.unshift({ '#name': 'xml', '#': meta.link});
            this.stack[0] = _.reresolve(this.stack[0], meta.link);
          }
          else if (this.xmlbase && this.xmlbase.length > 0) {
            meta.link = _.resolve(_.get(this.xmlbase[0], '#'), meta.link);
          }
        }
        break;
      case('managingeditor'):
      case('webmaster'):
      case('author'):
        var author = {};
        if (name == 'author') {
          meta.author = _.get(el.name) || _.get(el.email) || _.get(el.uri);
        }
        else if (_.get(el)) {
          author = addressparser(_.get(el))[0];
          if (author) {
            el['name'] = author.name;
            el['email'] = author.address;
          }
          if (meta.author === null || name == 'managingeditor') {
            meta.author = author.name || author.address || _.get(el);
          }
        }
        break;
      case('cloud'):
        // I can't believe someone actually would put two cloud elements in their channel
        // but it happened
        // Nevertheless, there can be only one
        // This will ensure that rssCloud "wins" here.
        // If pubsubhubbub is also declared, it's still available in the link elements
        meta.cloud = {};
        if (Array.isArray(el)) {
          Object.keys(el[0]['@']).forEach(function (attr) {
            if (_.has(el[0]['@'], attr)) {
              meta.cloud[attr] = el[0]['@'][attr];
            }
          });
        }
        else {
          Object.keys(el['@']).forEach(function (attr) {
            if (_.has(el['@'], attr)) {
              meta.cloud[attr] = el['@'][attr];
            }
          });
        }
        meta.cloud.type = 'rsscloud';
        break;
      case('language'):
        meta.language = _.get(el);
        break;
      case('image'):
      case('logo'):
        if (el.url)
          meta.image.url = _.get(el.url);
        if (el.title)
          meta.image.title = _.get(el.title);
        if (!meta.image.url && _.get(el))
          meta.image.url = _.get(el);
        break;
      case('icon'):
        meta.favicon = _.get(el);
        break;
      case('copyright'):
      case('rights'):
      case('dc:rights'):
        meta.copyright = _.get(el);
        break;
      case('generator'):
        meta.generator = _.get(el);
        if (_.get(el['@'], 'version'))
          meta.generator += (meta.generator ? ' ' : '') + 'v' + el['@'].version;
        if (_.get(el['@'], 'uri'))
          meta.generator += meta.generator ? ' (' + el['@'].uri + ')' : el['@'].uri;
        break;
      case('category'):
      case('dc:subject'):
      case('itunes:category'):
      case('media:category'):
        /* We handle all the kinds of categories within the switch loop because meta.categories
         * is an array, unlike the other properties, and therefore can handle multiple values
         */
        var _category = ''
          , _categories = []
          ;
        if (Array.isArray(el)) {
          el.forEach(function (category){
            var _categoryValue;
            if ('category' == name && 'atom' == type) {
              if (category['@'] && (_categoryValue = _.safeTrim(_.get(category['@'], 'term')))) {
                meta.categories.push(_categoryValue);
              }
            }
            else if ('category' == name && 'rss' == type){
              if ((_categoryValue = _.safeTrim(_.get(category)))) {
                meta.categories.push(_categoryValue);
              }
            }
            else if ('dc:subject' == name && (_categoryValue = _.safeTrim(_.get(category)))) {
              _categories = _categoryValue.split(' ').map(function (cat){ return cat.trim(); });
              if (_categories.length) {
                meta.categories = meta.categories.concat(_categories);
              }
            }
            else if ('itunes:category' == name) {
              if (category['@'] && _.safeTrim(_.get(category['@'], 'text'))) _category = _.safeTrim(_.get(category['@'], 'text'));
              if (category[name]) {
                if (Array.isArray(category[name])) {
                  category[name].forEach(function (subcategory){
                    var _subcategoryValue;
                    if (subcategory['@'] && (_subcategoryValue = _.safeTrim(_.get(subcategory['@'], 'text')))) {
                      meta.categories.push(_category + '/' + _subcategoryValue);
                    }
                  });
                }
                else if (category[name]['@'] && (_categoryValue = _.safeTrim(_.get(category[name]['@'], 'text')))) {
                  meta.categories.push(_category + '/' + _categoryValue);
                }
              }
              else if (_category) {
                meta.categories.push(_category);
              }
            }
            else if ('media:category' == name && (_categoryValue = _.safeTrim(_.get(category)))) {
              meta.categories.push(_categoryValue);
            }
          });
        } else {
          if ('category' == name && 'atom' == type) {
            if ((_category = _.safeTrim(_.get(el['@'], 'term')))) {
              meta.categories.push(_category);
            }
          }
          else if ('category' == name && 'rss' == type) {
            if ((_category = _.safeTrim(_.get(el)))) {
              meta.categories.push(_category);
            }
          }
          else if ('dc:subject' == name && (_category = _.safeTrim(_.get(el)))) {
            _categories = _category.split(' ').map(function (cat){ return cat.trim(); });
            if (_categories.length) {
              meta.categories = meta.categories.concat(_categories);
            }
          }
          else if ('itunes:category' == name) {
            if (el['@'] && _.safeTrim(_.get(el['@'], 'text'))) _category = _.safeTrim(_.get(el['@'], 'text'));
            if (el[name]) {
              if (Array.isArray(el[name])) {
                el[name].forEach(function (subcategory){
                  var _subcategoryValue;
                  if (subcategory['@'] && (_subcategoryValue = _.safeTrim(_.get(subcategory['@'], 'text')))) {
                    meta.categories.push(_category + '/' + _subcategoryValue);
                  }
                });
              }
              else if (el[name]['@'] && (_category = _.safeTrim(_.get(el[name]['@'], 'text')))) {
                meta.categories.push(_category + '/' + _category);
              }
            }
            else if (_category) {
              meta.categories.push(_category);
            }
          }
          else if ('media:category' == name && (_category = _.safeTrim(_.get(el)))) {
            meta.categories.push(_.get(el));
          }
        }
        break;
      } // switch end
    }
    // Fill with all native other namespaced properties
    if (name.indexOf('#') !== 0) {
      if (~name.indexOf(':')) meta[name] = el;
      else meta[type + ':' + name] = el;
    }
  }, this); // forEach end

  if (normalize) {
    if (!meta.description) {
      if (node['itunes:summary']) meta.description = _.get(node['itunes:summary']);
      else if (node['tagline']) meta.description = _.get(node['tagline']);
    }
    if (!meta.author) {
      if (node['itunes:author']) meta.author = _.get(node['itunes:author']);
      else if (node['itunes:owner'] && node['itunes:owner']['itunes:name']) meta.author = _.get(node['itunes:owner']['itunes:name']);
      else if (node['dc:creator']) meta.author = _.get(node['dc:creator']);
      else if (node['dc:publisher']) meta.author = _.get(node['dc:publisher']);
    }
    if (!meta.language) {
      if (node['@'] && node['@']['xml:lang']) meta.language = _.get(node['@'], 'xml:lang');
      else if (node['dc:language']) meta.language = _.get(node['dc:language']);
    }
    if (!meta.image.url) {
      if (node['itunes:image']) meta.image.url = _.get(node['itunes:image']['@'], 'href');
      else if (node['media:thumbnail']) {
        if (Array.isArray(node['media:thumbnail'])) {
          node['media:thumbnail'] = node['media:thumbnail'][0];
        }
        meta.image.url = _.get(node['media:thumbnail']['@'], 'url');
      }
    }
    if (!meta.copyright) {
      if (node['media:copyright']) meta.copyright = _.get(node['media:copyright']);
      else if (node['dc:rights']) meta.copyright = _.get(node['dc:rights']);
      else if (node['creativecommons:license']) meta.copyright = _.get(node['creativecommons:license']);
      else if (node['cc:license']) {
        if (Array.isArray(node['cc:license']) && node['cc:license'][0]['@'] && node['cc:license'][0]['@']['rdf:resource']) {
          meta.copyright = _.get(node['cc:license'][0]['@'], 'rdf:resource');
        } else if (node['cc:license']['@'] && node['cc:license']['@']['rdf:resource']) {
          meta.copyright = _.get(node['cc:license']['@'], 'rdf:resource');
        }
      }
    }
    if (!meta.generator) {
      if (node['admin:generatoragent']) {
        if (Array.isArray(node['admin:generatoragent']) && node['admin:generatoragent'][0]['@'] && node['admin:generatoragent'][0]['@']['rdf:resource']) {
          meta.generator = _.get(node['admin:generatoragent'][0]['@'], 'rdf:resource');
        } else if (node['admin:generatoragent']['@'] && node['admin:generatoragent']['@']['rdf:resource']) {
          meta.generator = _.get(node['admin:generatoragent']['@'], 'rdf:resource');
        }
      }
    }
    if (meta.categories.length) {
      meta.categories = _.uniq(meta.categories);
    }
    if (!meta.link) {
      if (meta['atom:id'] && _.get(meta['atom:id']) && /^https?:/.test(_.get(meta['atom:id']))) {
        meta.link = _.get(meta['atom:id']);
      }
    }
    if (!meta.xmlurl && this.options.feedurl) {
      meta.xmlurl = meta.xmlUrl = this.options.feedurl;
    }
    meta.title = meta.title && _.stripHtml(meta.title);
    meta.description = meta.description && _.stripHtml(meta.description);
  }

  return meta;
};

FeedParser.prototype.handleItem = function handleItem (node, type, options){
  if (!type || !node) return {};

  var item = {}
    , normalize = !options || (options && options.normalize)
    ;

  if (normalize) {
    ['title','description','summary','date','pubdate','pubDate','link','guid','author','comments', 'origlink'].forEach(function (property){
      item[property] = null;
    });
    item.image = {};
    item.source = {};
    item.categories = [];
    item.enclosures = [];
  }

  Object.keys(node).forEach(function(name){
    var el = node[name]
      , attrs = _.get(el, '@')
      , enclosure;
    if (normalize) {
      switch(name){
      case('title'):
        item.title = _.get(el);
        break;
      case('description'):
      case('summary'):
        item.summary = _.get(el);
        if (!item.description) item.description = _.get(el);
        break;
      case('content'):
      case('content:encoded'):
        item.description = _.get(el);
        break;
      case('pubdate'):
      case('published'):
      case('issued'):
      case('modified'):
      case('updated'):
      case('dc:date'):
        var date = _.get(el) ? new Date(_.get(el)) : null;
        if (!date) break;
        if (item.pubdate === null || name == 'pubdate' || name == 'published' || name == 'issued')
          item.pubdate = item.pubDate = date;
        if (item.date === null || name == 'modified' || name == 'updated')
          item.date = date;
        break;
      case('link'):
        if (Array.isArray(el)) {
          el.forEach(function (link){
            if (link['@']['href']) { // Atom
              if (_.get(link['@'], 'rel')) {
                if (link['@']['rel'] == 'canonical') item.origlink = link['@']['href'];
                if (link['@']['rel'] == 'alternate') item.link = link['@']['href'];
                if (link['@']['rel'] == 'self' && !item.link) item.link = link['@']['href'];
                if (link['@']['rel'] == 'replies') item.comments = link['@']['href'];
                if (link['@']['rel'] == 'enclosure') {
                  enclosure = {};
                  enclosure.url = link['@']['href'];
                  enclosure.type = _.get(link['@'], 'type');
                  enclosure.length = _.get(link['@'], 'length');
                  if (indexOfObject(item.enclosures, enclosure, ['url', 'type']) === -1) {
                    item.enclosures.push(enclosure);
                  }
                }
              } else {
                item.link = link['@']['href'];
              }
            } else if (Object.keys(link['@']).length === 0) { // RSS
              if (!item.link) item.link = _.get(link);
            }
          });
        } else {
          if (el['@']['href']) { // Atom
            if (_.get(el['@'], 'rel')) {
              if (el['@']['rel'] == 'canonical') item.origlink = el['@']['href'];
              if (el['@']['rel'] == 'alternate') item.link = el['@']['href'];
              if (el['@']['rel'] == 'self' && !item.link) item.link = el['@']['href'];
              if (el['@']['rel'] == 'replies') item.comments = el['@']['href'];
              if (el['@']['rel'] == 'enclosure') {
                enclosure = {};
                enclosure.url = el['@']['href'];
                enclosure.type = _.get(el['@'], 'type');
                enclosure.length = _.get(el['@'], 'length');
                if (indexOfObject(item.enclosures, enclosure, ['url', 'type']) === -1) {
                  item.enclosures.push(enclosure);
                }
              }
            } else {
              item.link = el['@']['href'];
            }
          } else if (Object.keys(el['@']).length === 0) { // RSS
            if (!item.link) item.link = _.get(el);
          }
        }
        if (!item.guid) item.guid = item.link;
        break;
      case('guid'):
      case('id'):
        item.guid = _.get(el);
        // http://cyber.law.harvard.edu/rss/rss.html#ltguidgtSubelementOfLtitemgt
        // If the guid element has an attribute named "isPermaLink" with a value
        // of true, the reader may assume that it is a permalink to the item,
        // that is, a url that can be opened in a Web browser, that points to
        // the full item described by the <item> element.
        // isPermaLink is optional, its default value is true. If its value is
        // false, the guid may not be assumed to be a url, or a url to anything
        // in particular.
        if (item.guid && type == 'rss' && name == 'guid' && !(attrs.ispermalink && attrs.ispermalink.match(/false/i))) {
          item.permalink = item.guid;
        }
        break;
      case('author'):
        var author = {};
        if (_.get(el)) { // RSS
          author = addressparser(_.get(el))[0];
          if (author) {
            el['name'] = author.name;
            el['email'] = author.address;
            item.author = author.name || author.address;
          }
          // addressparser failed
          else {
            item.author = _.get(el);
          }
        } else {
          item.author = _.get(el.name) || _.get(el.email) || _.get(el.uri);
        }
        break;
      case('dc:creator'):
        item.author = _.get(el);
        break;
      case('comments'):
        item.comments = _.get(el);
        break;
      case('source'):
        if ('rss' == type) {
          item.source['title'] = _.get(el);
          item.source['url'] = _.get(el['@'], 'url');
        } else if ('atom' == type) {
          if (el.title && _.get(el.title))
            item.source['title'] = _.get(el.title);
          if (el.link && _.get(el.link['@'], 'href'))
            item.source['url'] = _.get(el.link['@'], 'href');
        }
        if (item.source['url'] && !this.meta.xmlurl) {
          this.meta.xmlurl = this.meta.xmlUrl = item.source['url'];
          if (_.isAbsoluteUrl(item.source['url']) && this.xmlbase && this.xmlbase.length === 0) {
            this.xmlbase.unshift({ '#name': 'xml', '#': item.source['url']});
            this.stack[0] = _.reresolve(this.stack[0], item.source['url']);
          }
          else if (this.xmlbase && this.xmlbase.length > 0) {
            this.meta.xmlurl = this.meta.xmlUrl = item.source['url'] = _.resolve(_.get(this.xmlbase[0], '#'), item.source['url']);
          }
        }
        break;
      case('enclosure'):
        if (Array.isArray(el)) {
          el.forEach(function (enc){
            enclosure = {};
            enclosure.url = _.get(enc['@'], 'url');
            enclosure.type = _.get(enc['@'], 'type');
            enclosure.length = _.get(enc['@'], 'length');
            if (~indexOfObject(item.enclosures, enclosure, ['url', 'type'])) {
              item.enclosures.splice(indexOfObject(item.enclosures, enclosure, ['url', 'type']), 1, enclosure);
            } else {
              item.enclosures.push(enclosure);
            }
          });
        } else {
          enclosure = {};
          enclosure.url = _.get(el['@'], 'url');
          enclosure.type = _.get(el['@'], 'type');
          enclosure.length = _.get(el['@'], 'length');
          if (~indexOfObject(item.enclosures, enclosure, ['url', 'type'])) {
            item.enclosures.splice(indexOfObject(item.enclosures, enclosure, ['url', 'type']), 1, enclosure);
          } else {
            item.enclosures.push(enclosure);
          }
        }
        break;
      case('media:content'):
        var optionalAttributes = ['bitrate', 'framerate', 'samplingrate', 'duration', 'height', 'width'];
        if (Array.isArray(el)) {
          el.forEach(function (enc){
            enclosure = {};
            enclosure.url = _.get(enc['@'], 'url');
            enclosure.type = _.get(enc['@'], 'type') || _.get(enc['@'], 'medium');
            enclosure.length = _.get(enc['@'], 'filesize');
            var index = indexOfObject(item.enclosures, enclosure, ['url', 'type']);
            if (index !== -1) {
              enclosure = item.enclosures[index];
            }
            optionalAttributes.forEach(function (attribute) {
              if (!enclosure[attribute] && _.get(enc['@'], attribute)) {
                enclosure[attribute] = _.get(enc['@'], attribute);
              }
            });
            if (index === -1) {
              item.enclosures.push(enclosure);
            }
          });
        } else {
          enclosure = {};
          enclosure.url = _.get(el['@'], 'url');
          enclosure.type = _.get(el['@'], 'type') || _.get(el['@'], 'medium');
          enclosure.length = _.get(el['@'], 'filesize');
          var index = indexOfObject(item.enclosures, enclosure, ['url', 'type']);
          if (index !== -1) {
            enclosure = item.enclosures[index];
          }
          optionalAttributes.forEach(function (attribute) {
            if (!enclosure[attribute] && _.get(el['@'], attribute)) {
              enclosure[attribute] = _.get(el['@'], attribute);
            }
          });
          if (index === -1) {
            item.enclosures.push(enclosure);
          }
        }
        break;
      case('enc:enclosure'): // Can't find this in use for an example to debug. Only example found does not comply with the spec -- can't code THAT!
        break;
      case('category'):
      case('dc:subject'):
      case('itunes:category'):
      case('media:category'):
        /* We handle all the kinds of categories within the switch loop because item.categories
         * is an array, unlike the other properties, and therefore can handle multiple values
         */
        var _category = ''
          , _categories = []
          ;
        if (Array.isArray(el)) {
          el.forEach(function (category){
            if ('category' == name && 'atom' == type) {
              if (category['@'] && _.get(category['@'], 'term')) item.categories.push(_.get(category['@'], 'term'));
            } else if ('category' == name && _.get(category) && 'rss' == type) {
              item.categories.push(_.get(category).trim());
            } else if ('dc:subject' == name && _.get(category)) {
              _categories = _.get(category).split(' ').map(function (cat){ return cat.trim(); });
              if (_categories.length) item.categories = item.categories.concat(_categories);
            } else if ('itunes:category' == name) {
              if (category['@'] && _.get(category['@'], 'text')) _category = _.get(category['@'], 'text');
              if (category[name]) {
                if (Array.isArray(category[name])) {
                  category[name].forEach(function (subcategory){
                    if (subcategory['@'] && _.get(subcategory['@'], 'text')) item.categories.push(_category + '/' + _.get(subcategory['@'], 'text'));
                  });
                } else {
                  if (category[name]['@'] && _.get(category[name]['@'], 'text'))
                    item.categories.push(_category + '/' + _.get(category[name]['@'], 'text'));
                }
              } else {
                item.categories.push(_category);
              }
            } else if ('media:category' == name) {
              item.categories.push(_.get(category));
            }
          });
        } else {
          if ('category' == name && 'atom' == type) {
            if (_.get(el['@'], 'term')) item.categories.push(_.get(el['@'], 'term'));
          } else if ('category' == name && _.get(el) && 'rss' == type) {
            item.categories.push(_.get(el).trim());
          } else if ('dc:subject' == name && _.get(el)) {
            _categories = _.get(el).split(' ').map(function (cat){ return cat.trim(); });
            if (_categories.length) item.categories = item.categories.concat(_categories);
          } else if ('itunes:category' == name) {
            if (el['@'] && _.get(el['@'], 'text')) _category = _.get(el['@'], 'text');
            if (el[name]) {
              if (Array.isArray(el[name])) {
                el[name].forEach(function (subcategory){
                  if (subcategory['@'] && _.get(subcategory['@'], 'text')) item.categories.push(_category + '/' + _.get(subcategory['@'], 'text'));
                });
              } else {
                if (el[name]['@'] && _.get(el[name]['@'], 'text'))
                  item.categories.push(_category + '/' + _.get(el[name]['@'], 'text'));
              }
            } else {
              item.categories.push(_category);
            }
          } else if ('media:category' == name) {
            item.categories.push(_.get(el));
          }
        }
        break;
      case('feedburner:origlink'):
      case('pheedo:origlink'):
        if (!item.origlink) {
          item.origlink = _.get(el);
        }
        break;
      } // switch end
    }
    // Fill with all native other namespaced properties
    if (name.indexOf('#') !== 0) {
      if (~name.indexOf(':')) item[name] = el;
      else item[type + ':' + name] = el;
    }
  }, this); // forEach end

  if (normalize) {
    if (!item.description) {
      if (node['itunes:summary']) item.description = _.get(node['itunes:summary']);
    }
    if (!item.author) {
      if (node['itunes:author']) item.author = _.get(node['itunes:author']);
      else if (node['itunes:owner'] && node['itunes:owner']['itunes:name']) item.author = _.get(node['itunes:owner']['itunes:name']);
      else if (node['dc:publisher']) item.author = _.get(node['dc:publisher']);
    }
    if (!item.image.url) {
      if (node['itunes:image']) item.image.url = _.get(node['itunes:image']['@'], 'href');
      else if (node['media:thumbnail']) {
        if (Array.isArray(node['media:thumbnail'])) {
          item.image.url = _.get(node['media:thumbnail'][0]['@'], 'url');
        } else {
          item.image.url = _.get(node['media:thumbnail']['@'], 'url');
        }
      }
      else if (node['media:content'] && node['media:content']['media:thumbnail']) item.image.url = _.get(node['media:content']['media:thumbnail']['@'], 'url');
      else if (node['media:group'] && node['media:group']['media:thumbnail']) item.image.url = _.get(node['media:group']['media:thumbnail']['@'], 'url');
      else if (node['media:group'] && node['media:group']['media:content'] && node['media:group']['media:content']['media:thumbnail']) item.image.url = _.get(node['media:group']['media:content']['media:thumbnail']['@'], 'url');
      else if (node['g:image_link']) item.image.url = _.get(node['g:image_link']);
    }
    if (item.categories.length) {
      item.categories = _.uniq(item.categories);
    }
    if (!item.link) {
      if (item.guid && /^https?:/.test(item.guid)) {
        item.link = item.guid;
      }
    }
    item.title = item.title && _.stripHtml(item.title);
  }
  return item;
};

// Naive Stream API
FeedParser.prototype._transform = function (data, encoding, done) {
  try {
    this.stream.write(data);
    done();
  }
  catch (e) {
    done(e);
    this.push(null); // Manually trigger and end, since we can't reliably do any more parsing
  }
};

FeedParser.prototype._flush = function (done) {
  try {
    this.stream.end();
    done();
  }
  catch (e) {
    done(e);
  }
};

exports = module.exports = FeedParser;


/***/ }),

/***/ 6460:
/***/ ((module) => {

/*
 * Default namespaces
 *
 * Lookup by URI
 */
module.exports = {
  'http://www.w3.org/2005/Atom'                                    :'atom', // v1.0
  'http://purl.org/atom/ns#'                                       :'atom', // v0.3
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#'                    :'rdf',
  'http://purl.org/rss/1.0/'                                       :'rdf', // rss v1.0
  'http://my.netscape.com/rdf/simple/0.9/'                         :'rdf', // rss v0.90
  'http://webns.net/mvcb/'                                         :'admin',
  'http://creativecommons.org/ns#'                                 :'cc',
  'http://web.resource.org/cc/'                                    :'cc',
  'http://purl.org/rss/1.0/modules/content/'                       :'content',
  'http://backend.userland.com/creativeCommonsRSSModule'           :'creativecommons',
  'http://cyber.law.harvard.edu/rss/creativeCommonsRssModule.html' :'creativecommons',
  'http://purl.org/dc/elements/1.1/'                               :'dc',
  'http://purl.org/dc/elements/1.0/'                               :'dc',
  'http://purl.oclc.org/net/rss_2.0/enc#'                          :'enc',
  'http://rssnamespace.org/feedburner/ext/1.0'                     :'feedburner',
  'http://www.bradsoft.com/feeddemon/xmlns/1.0/'                   :'fd', // FeedDemon
  'http://www.itunes.com/dtds/podcast-1.0.dtd'                     :'itunes',
  'http://www.w3.org/2003/01/geo/wgs84_pos#'                       :'geo',
  'http://www.georss.org/georss'                                   :'georss',
  'http://search.yahoo.com/mrss/'                                  :'media',
  'http://search.yahoo.com/mrss'                                   :'media', // commonly-used but wrong
  'http://newsgator.com/schema/extensions'                         :'ng', // NewsGator
  'http://opml.org/spec2'                                          :'opml', // OPML 2.0
  'http://www.pheedo.com/namespace/pheedo'                         :'pheedo',
  'http://purl.org/rss/1.0/modules/syndication/'                   :'syn',
  'http://feedsync.org/2007/feedsync'                              :'sx', // feedsync (Simple Sharing Extensions) http://feedsyncsamples.codeplex.com/
  'http://purl.org/rss/1.0/modules/taxonomy/'                      :'taxo',
  'http://purl.org/syndication/thread/1.0'                         :'thr',
  'http://www.w3.org/1999/xhtml'                                   :'xhtml',
  'http://www.w3.org/XML/1998/namespace'                           :'xml'
};


/***/ }),

/***/ 6954:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

var URL = __nccwpck_require__(7310)
  , namespaces = __nccwpck_require__(6460)
  ;

exports.has = __nccwpck_require__(8925);
exports.assign = __nccwpck_require__(8696);
exports.uniq = __nccwpck_require__(8216);

var _get = __nccwpck_require__(9197);
/**
 * lodash.get, but wrapped to provide a default subkey (a/k/a path) of "#"
 * and defaultValue of "null"
 *
 * var obj = { '#': 'foo', 'bar': 'baz' };
 *
 * get(obj);
 * // => 'foo'
 *
 * get(obj, 'bar');
 * // => 'baz'
 *
 * @param {Object} obj
 * @param {String} [subkey="#"] By default, use the '#' key, but you may pass any key you like
 * @return Returns the value of the selected key or 'null' if undefined.
 * @private
 */
function get(obj, subkey, defaultValue) {
  if (!subkey) {
    subkey = '#';
  }

  if (!defaultValue) {
    defaultValue = null;
  }

  if (Array.isArray(obj)) {
    return _get(obj[0], subkey, defaultValue);
  }
  else {
    return _get(obj, subkey, defaultValue);
  }
}
exports.get = get;

/**
 * Safely trim a value if it's a String
 * @private
 */
function safeTrim (val) {
  if (typeof val === 'string') {
    return val.trim();
  }
  return val;
}
exports.safeTrim = safeTrim;

/*
 * Expose require('url').resolve, safely returning if either parameter
 * isn't provided
 * @private
 */
function resolve (baseUrl, pathUrl) {
  if (!baseUrl || !pathUrl) return pathUrl;
  return URL.resolve(baseUrl, pathUrl);
}
exports.resolve = resolve;

/*
 * Check whether a given uri is an absolute URL
 * @param {String} uri
 * @private
 */
function isAbsoluteUrl (uri) {
  if (!uri || typeof uri !== 'string') return false;
  var parts = URL.parse(uri);
  return Boolean(parts.host);
}
exports.isAbsoluteUrl = isAbsoluteUrl;

/*
 * Check whether a given namespace URI matches the given default
 *
 * @param {String} URI
 * @param {String} default, e.g., 'atom'
 * @return {Boolean}
 * @private
 */
function nslookup (uri, def) {
  return namespaces[uri] === def;
}
exports.nslookup = nslookup;

/*
 * Return the "default" namespace prefix for a given namespace URI
 *
 * @param {String} URI
 * @return {String}
 * @private
 */
function nsprefix (uri) {
  return namespaces[uri];
}
exports.nsprefix = nsprefix;

/*
 * Walk a node and re-resolve the urls using the given baseurl
 *
 * @param {Object} node
 * @param {String} baseurl
 * @return {Object} modified node
 * @private
 */
function reresolve (node, baseurl) {
  if (!node || !baseurl) {
    return false; // Nothing to do.
  }

  function resolveLevel (level) {
    var els = Object.keys(level);
    els.forEach(function(el){
      if (Array.isArray(level[el])) {
        // The shape of the array of element items is different than if the element is not an array.
        // We need it to be the same shape to enable using the same function for recursion.
        var levelFromArray = {};
        level[el].forEach(function (attrs) {
          levelFromArray[el] = attrs;
          resolveLevel(levelFromArray);
        });
      } else {
        if (level[el].constructor.name === 'Object') {
          if (el == 'logo' || el == 'icon' || el == 'link') {
            if ('#' in level[el]) {
              level[el]['#'] = URL.resolve(baseurl, level[el]['#']);
            }
          } else if (el == 'image') {
            if ('url' in level[el] && level[el]['url'].constructor.name === 'Object' && '#' in level[el]['url']) {
              level[el]['url']['#'] = URL.resolve(baseurl, level[el]['url']['#']);
            }
            if ('link' in level[el] && level[el]['link'].constructor.name === 'Object' && '#' in level[el]['link']) {
              level[el]['link']['#'] = URL.resolve(baseurl, level[el]['link']['#']);
            }
          }
          if ('@' in level[el]) {
            var attrs = Object.keys(level[el]['@']);
            attrs.forEach(function (name) {
              if (name == 'href' || name == 'src' || name == 'uri') {
                if ('string' === typeof level[el]['@'][name]) {
                  level[el]['@'][name] = URL.resolve(baseurl, level[el]['@'][name]);
                }
              }
            });
          }
        }
      }
    });
    return level;
  }

  return resolveLevel(node);
}
exports.reresolve = reresolve;

/*
 * Aggressivly strip HTML tags
 * Pulled out of node-resanitize because it was all that was being used
 * and it's way lighter...
 *
 * @param {String} str
 * @private
 */
function stripHtml (str) {
  return str.replace(/<.*?>/g, '');
}

exports.stripHtml = stripHtml;


/***/ }),

/***/ 4124:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

try {
  var util = __nccwpck_require__(3837);
  /* istanbul ignore next */
  if (typeof util.inherits !== 'function') throw '';
  module.exports = util.inherits;
} catch (e) {
  /* istanbul ignore next */
  module.exports = __nccwpck_require__(8544);
}


/***/ }),

/***/ 8544:
/***/ ((module) => {

if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}


/***/ }),

/***/ 893:
/***/ ((module) => {

var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};


/***/ }),

/***/ 8696:
/***/ ((module) => {

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]';

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/**
 * A faster alternative to `Function#apply`, this function invokes `func`
 * with the `this` binding of `thisArg` and the arguments of `args`.
 *
 * @private
 * @param {Function} func The function to invoke.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {Array} args The arguments to invoke `func` with.
 * @returns {*} Returns the result of `func`.
 */
function apply(func, thisArg, args) {
  switch (args.length) {
    case 0: return func.call(thisArg);
    case 1: return func.call(thisArg, args[0]);
    case 2: return func.call(thisArg, args[0], args[1]);
    case 3: return func.call(thisArg, args[0], args[1], args[2]);
  }
  return func.apply(thisArg, args);
}

/**
 * The base implementation of `_.times` without support for iteratee shorthands
 * or max array length checks.
 *
 * @private
 * @param {number} n The number of times to invoke `iteratee`.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the array of results.
 */
function baseTimes(n, iteratee) {
  var index = -1,
      result = Array(n);

  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}

/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */
function overArg(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Built-in value references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeKeys = overArg(Object.keys, Object),
    nativeMax = Math.max;

/** Detect if properties shadowing those on `Object.prototype` are non-enumerable. */
var nonEnumShadows = !propertyIsEnumerable.call({ 'valueOf': 1 }, 'valueOf');

/**
 * Creates an array of the enumerable property names of the array-like `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @param {boolean} inherited Specify returning inherited property names.
 * @returns {Array} Returns the array of property names.
 */
function arrayLikeKeys(value, inherited) {
  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  // Safari 9 makes `arguments.length` enumerable in strict mode.
  var result = (isArray(value) || isArguments(value))
    ? baseTimes(value.length, String)
    : [];

  var length = result.length,
      skipIndexes = !!length;

  for (var key in value) {
    if ((inherited || hasOwnProperty.call(value, key)) &&
        !(skipIndexes && (key == 'length' || isIndex(key, length)))) {
      result.push(key);
    }
  }
  return result;
}

/**
 * Assigns `value` to `key` of `object` if the existing value is not equivalent
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @private
 * @param {Object} object The object to modify.
 * @param {string} key The key of the property to assign.
 * @param {*} value The value to assign.
 */
function assignValue(object, key, value) {
  var objValue = object[key];
  if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) ||
      (value === undefined && !(key in object))) {
    object[key] = value;
  }
}

/**
 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeys(object) {
  if (!isPrototype(object)) {
    return nativeKeys(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty.call(object, key) && key != 'constructor') {
      result.push(key);
    }
  }
  return result;
}

/**
 * The base implementation of `_.rest` which doesn't validate or coerce arguments.
 *
 * @private
 * @param {Function} func The function to apply a rest parameter to.
 * @param {number} [start=func.length-1] The start position of the rest parameter.
 * @returns {Function} Returns the new function.
 */
function baseRest(func, start) {
  start = nativeMax(start === undefined ? (func.length - 1) : start, 0);
  return function() {
    var args = arguments,
        index = -1,
        length = nativeMax(args.length - start, 0),
        array = Array(length);

    while (++index < length) {
      array[index] = args[start + index];
    }
    index = -1;
    var otherArgs = Array(start + 1);
    while (++index < start) {
      otherArgs[index] = args[index];
    }
    otherArgs[start] = array;
    return apply(func, this, otherArgs);
  };
}

/**
 * Copies properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy properties from.
 * @param {Array} props The property identifiers to copy.
 * @param {Object} [object={}] The object to copy properties to.
 * @param {Function} [customizer] The function to customize copied values.
 * @returns {Object} Returns `object`.
 */
function copyObject(source, props, object, customizer) {
  object || (object = {});

  var index = -1,
      length = props.length;

  while (++index < length) {
    var key = props[index];

    var newValue = customizer
      ? customizer(object[key], source[key], key, object, source)
      : undefined;

    assignValue(object, key, newValue === undefined ? source[key] : newValue);
  }
  return object;
}

/**
 * Creates a function like `_.assign`.
 *
 * @private
 * @param {Function} assigner The function to assign values.
 * @returns {Function} Returns the new assigner function.
 */
function createAssigner(assigner) {
  return baseRest(function(object, sources) {
    var index = -1,
        length = sources.length,
        customizer = length > 1 ? sources[length - 1] : undefined,
        guard = length > 2 ? sources[2] : undefined;

    customizer = (assigner.length > 3 && typeof customizer == 'function')
      ? (length--, customizer)
      : undefined;

    if (guard && isIterateeCall(sources[0], sources[1], guard)) {
      customizer = length < 3 ? undefined : customizer;
      length = 1;
    }
    object = Object(object);
    while (++index < length) {
      var source = sources[index];
      if (source) {
        assigner(object, source, index, customizer);
      }
    }
    return object;
  });
}

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  length = length == null ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value == 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 == 0 && value < length);
}

/**
 * Checks if the given arguments are from an iteratee call.
 *
 * @private
 * @param {*} value The potential iteratee value argument.
 * @param {*} index The potential iteratee index or key argument.
 * @param {*} object The potential iteratee object argument.
 * @returns {boolean} Returns `true` if the arguments are from an iteratee call,
 *  else `false`.
 */
function isIterateeCall(value, index, object) {
  if (!isObject(object)) {
    return false;
  }
  var type = typeof index;
  if (type == 'number'
        ? (isArrayLike(object) && isIndex(index, object.length))
        : (type == 'string' && index in object)
      ) {
    return eq(object[index], value);
  }
  return false;
}

/**
 * Checks if `value` is likely a prototype object.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
 */
function isPrototype(value) {
  var Ctor = value && value.constructor,
      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

  return value === proto;
}

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

/**
 * This method is like `_.isArrayLike` except that it also checks if `value`
 * is an object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array-like object,
 *  else `false`.
 * @example
 *
 * _.isArrayLikeObject([1, 2, 3]);
 * // => true
 *
 * _.isArrayLikeObject(document.body.children);
 * // => true
 *
 * _.isArrayLikeObject('abc');
 * // => false
 *
 * _.isArrayLikeObject(_.noop);
 * // => false
 */
function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Assigns own enumerable string keyed properties of source objects to the
 * destination object. Source objects are applied from left to right.
 * Subsequent sources overwrite property assignments of previous sources.
 *
 * **Note:** This method mutates `object` and is loosely based on
 * [`Object.assign`](https://mdn.io/Object/assign).
 *
 * @static
 * @memberOf _
 * @since 0.10.0
 * @category Object
 * @param {Object} object The destination object.
 * @param {...Object} [sources] The source objects.
 * @returns {Object} Returns `object`.
 * @see _.assignIn
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 * }
 *
 * function Bar() {
 *   this.c = 3;
 * }
 *
 * Foo.prototype.b = 2;
 * Bar.prototype.d = 4;
 *
 * _.assign({ 'a': 0 }, new Foo, new Bar);
 * // => { 'a': 1, 'c': 3 }
 */
var assign = createAssigner(function(object, source) {
  if (nonEnumShadows || isPrototype(source) || isArrayLike(source)) {
    copyObject(source, keys(source), object);
    return;
  }
  for (var key in source) {
    if (hasOwnProperty.call(source, key)) {
      assignValue(object, key, source[key]);
    }
  }
});

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

module.exports = assign;


/***/ }),

/***/ 9197:
/***/ ((module) => {

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** `Object#toString` result references. */
var funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    symbolTag = '[object Symbol]';

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/,
    reLeadingDot = /^\./,
    rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
function isHostObject(value) {
  // Many host objects are `Object` objects that can coerce to strings
  // despite having improperly defined `toString` methods.
  var result = false;
  if (value != null && typeof value.toString != 'function') {
    try {
      result = !!(value + '');
    } catch (e) {}
  }
  return result;
}

/** Used for built-in method references. */
var arrayProto = Array.prototype,
    funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/** Built-in value references. */
var Symbol = root.Symbol,
    splice = arrayProto.splice;

/* Built-in method references that are verified to be native. */
var Map = getNative(root, 'Map'),
    nativeCreate = getNative(Object, 'create');

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolToString = symbolProto ? symbolProto.toString : undefined;

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
}

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  return this.has(key) && delete this.__data__[key];
}

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
}

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
}

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  return true;
}

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map || ListCache),
    'string': new Hash
  };
}

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  return getMapData(this, key)['delete'](key);
}

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  getMapData(this, key).set(key, value);
  return this;
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.get` without support for default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path) {
  path = isKey(path, object) ? [path] : castPath(path);

  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = object[toKey(path[index++])];
  }
  return (index && index == length) ? object : undefined;
}

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

/**
 * The base implementation of `_.toString` which doesn't convert nullish
 * values to empty strings.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Casts `value` to a path array if it's not one.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {Array} Returns the cast property path array.
 */
function castPath(value) {
  return isArray(value) ? value : stringToPath(value);
}

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  if (isArray(value)) {
    return false;
  }
  var type = typeof value;
  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
      value == null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

/**
 * Converts `string` to a property path array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the property path array.
 */
var stringToPath = memoize(function(string) {
  string = toString(string);

  var result = [];
  if (reLeadingDot.test(string)) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
});

/**
 * Converts `value` to a string key if it's not a string or symbol.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {string|symbol} Returns the key.
 */
function toKey(value) {
  if (typeof value == 'string' || isSymbol(value)) {
    return value;
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to process.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

/**
 * Creates a function that memoizes the result of `func`. If `resolver` is
 * provided, it determines the cache key for storing the result based on the
 * arguments provided to the memoized function. By default, the first argument
 * provided to the memoized function is used as the map cache key. The `func`
 * is invoked with the `this` binding of the memoized function.
 *
 * **Note:** The cache is exposed as the `cache` property on the memoized
 * function. Its creation may be customized by replacing the `_.memoize.Cache`
 * constructor with one whose instances implement the
 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
 * method interface of `delete`, `get`, `has`, and `set`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to have its output memoized.
 * @param {Function} [resolver] The function to resolve the cache key.
 * @returns {Function} Returns the new memoized function.
 * @example
 *
 * var object = { 'a': 1, 'b': 2 };
 * var other = { 'c': 3, 'd': 4 };
 *
 * var values = _.memoize(_.values);
 * values(object);
 * // => [1, 2]
 *
 * values(other);
 * // => [3, 4]
 *
 * object.a = 2;
 * values(object);
 * // => [1, 2]
 *
 * // Modify the result cache.
 * values.cache.set(object, ['a', 'b']);
 * values(object);
 * // => ['a', 'b']
 *
 * // Replace `_.memoize.Cache`.
 * _.memoize.Cache = WeakMap;
 */
function memoize(func, resolver) {
  if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments,
        key = resolver ? resolver.apply(this, args) : args[0],
        cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result);
    return result;
  };
  memoized.cache = new (memoize.Cache || MapCache);
  return memoized;
}

// Assign cache to `_.memoize`.
memoize.Cache = MapCache;

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a string. An empty string is returned for `null`
 * and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  return value == null ? '' : baseToString(value);
}

/**
 * Gets the value at `path` of `object`. If the resolved value is
 * `undefined`, the `defaultValue` is returned in its place.
 *
 * @static
 * @memberOf _
 * @since 3.7.0
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
 * @returns {*} Returns the resolved value.
 * @example
 *
 * var object = { 'a': [{ 'b': { 'c': 3 } }] };
 *
 * _.get(object, 'a[0].b.c');
 * // => 3
 *
 * _.get(object, ['a', '0', 'b', 'c']);
 * // => 3
 *
 * _.get(object, 'a.b.c', 'default');
 * // => 'default'
 */
function get(object, path, defaultValue) {
  var result = object == null ? undefined : baseGet(object, path);
  return result === undefined ? defaultValue : result;
}

module.exports = get;


/***/ }),

/***/ 8925:
/***/ ((module) => {

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0,
    MAX_SAFE_INTEGER = 9007199254740991;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    symbolTag = '[object Symbol]';

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/,
    reLeadingDot = /^\./,
    rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
function isHostObject(value) {
  // Many host objects are `Object` objects that can coerce to strings
  // despite having improperly defined `toString` methods.
  var result = false;
  if (value != null && typeof value.toString != 'function') {
    try {
      result = !!(value + '');
    } catch (e) {}
  }
  return result;
}

/** Used for built-in method references. */
var arrayProto = Array.prototype,
    funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/** Built-in value references. */
var Symbol = root.Symbol,
    propertyIsEnumerable = objectProto.propertyIsEnumerable,
    splice = arrayProto.splice;

/* Built-in method references that are verified to be native. */
var Map = getNative(root, 'Map'),
    nativeCreate = getNative(Object, 'create');

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolToString = symbolProto ? symbolProto.toString : undefined;

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
}

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  return this.has(key) && delete this.__data__[key];
}

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
}

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
}

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  return true;
}

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map || ListCache),
    'string': new Hash
  };
}

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  return getMapData(this, key)['delete'](key);
}

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  getMapData(this, key).set(key, value);
  return this;
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.has` without support for deep paths.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {Array|string} key The key to check.
 * @returns {boolean} Returns `true` if `key` exists, else `false`.
 */
function baseHas(object, key) {
  return object != null && hasOwnProperty.call(object, key);
}

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

/**
 * The base implementation of `_.toString` which doesn't convert nullish
 * values to empty strings.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Casts `value` to a path array if it's not one.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {Array} Returns the cast property path array.
 */
function castPath(value) {
  return isArray(value) ? value : stringToPath(value);
}

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

/**
 * Checks if `path` exists on `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array|string} path The path to check.
 * @param {Function} hasFunc The function to check properties.
 * @returns {boolean} Returns `true` if `path` exists, else `false`.
 */
function hasPath(object, path, hasFunc) {
  path = isKey(path, object) ? [path] : castPath(path);

  var result,
      index = -1,
      length = path.length;

  while (++index < length) {
    var key = toKey(path[index]);
    if (!(result = object != null && hasFunc(object, key))) {
      break;
    }
    object = object[key];
  }
  if (result) {
    return result;
  }
  var length = object ? object.length : 0;
  return !!length && isLength(length) && isIndex(key, length) &&
    (isArray(object) || isArguments(object));
}

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  length = length == null ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value == 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 == 0 && value < length);
}

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  if (isArray(value)) {
    return false;
  }
  var type = typeof value;
  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
      value == null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

/**
 * Converts `string` to a property path array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the property path array.
 */
var stringToPath = memoize(function(string) {
  string = toString(string);

  var result = [];
  if (reLeadingDot.test(string)) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
});

/**
 * Converts `value` to a string key if it's not a string or symbol.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {string|symbol} Returns the key.
 */
function toKey(value) {
  if (typeof value == 'string' || isSymbol(value)) {
    return value;
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to process.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

/**
 * Creates a function that memoizes the result of `func`. If `resolver` is
 * provided, it determines the cache key for storing the result based on the
 * arguments provided to the memoized function. By default, the first argument
 * provided to the memoized function is used as the map cache key. The `func`
 * is invoked with the `this` binding of the memoized function.
 *
 * **Note:** The cache is exposed as the `cache` property on the memoized
 * function. Its creation may be customized by replacing the `_.memoize.Cache`
 * constructor with one whose instances implement the
 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
 * method interface of `delete`, `get`, `has`, and `set`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to have its output memoized.
 * @param {Function} [resolver] The function to resolve the cache key.
 * @returns {Function} Returns the new memoized function.
 * @example
 *
 * var object = { 'a': 1, 'b': 2 };
 * var other = { 'c': 3, 'd': 4 };
 *
 * var values = _.memoize(_.values);
 * values(object);
 * // => [1, 2]
 *
 * values(other);
 * // => [3, 4]
 *
 * object.a = 2;
 * values(object);
 * // => [1, 2]
 *
 * // Modify the result cache.
 * values.cache.set(object, ['a', 'b']);
 * values(object);
 * // => ['a', 'b']
 *
 * // Replace `_.memoize.Cache`.
 * _.memoize.Cache = WeakMap;
 */
function memoize(func, resolver) {
  if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments,
        key = resolver ? resolver.apply(this, args) : args[0],
        cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result);
    return result;
  };
  memoized.cache = new (memoize.Cache || MapCache);
  return memoized;
}

// Assign cache to `_.memoize`.
memoize.Cache = MapCache;

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

/**
 * This method is like `_.isArrayLike` except that it also checks if `value`
 * is an object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array-like object,
 *  else `false`.
 * @example
 *
 * _.isArrayLikeObject([1, 2, 3]);
 * // => true
 *
 * _.isArrayLikeObject(document.body.children);
 * // => true
 *
 * _.isArrayLikeObject('abc');
 * // => false
 *
 * _.isArrayLikeObject(_.noop);
 * // => false
 */
function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a string. An empty string is returned for `null`
 * and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  return value == null ? '' : baseToString(value);
}

/**
 * Checks if `path` is a direct property of `object`.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path to check.
 * @returns {boolean} Returns `true` if `path` exists, else `false`.
 * @example
 *
 * var object = { 'a': { 'b': 2 } };
 * var other = _.create({ 'a': _.create({ 'b': 2 }) });
 *
 * _.has(object, 'a');
 * // => true
 *
 * _.has(object, 'a.b');
 * // => true
 *
 * _.has(object, ['a', 'b']);
 * // => true
 *
 * _.has(other, 'a');
 * // => false
 */
function has(object, path) {
  return object != null && hasPath(object, path, baseHas);
}

module.exports = has;


/***/ }),

/***/ 8216:
/***/ ((module) => {

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** `Object#toString` result references. */
var funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]';

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/**
 * A specialized version of `_.includes` for arrays without support for
 * specifying an index to search from.
 *
 * @private
 * @param {Array} [array] The array to inspect.
 * @param {*} target The value to search for.
 * @returns {boolean} Returns `true` if `target` is found, else `false`.
 */
function arrayIncludes(array, value) {
  var length = array ? array.length : 0;
  return !!length && baseIndexOf(array, value, 0) > -1;
}

/**
 * This function is like `arrayIncludes` except that it accepts a comparator.
 *
 * @private
 * @param {Array} [array] The array to inspect.
 * @param {*} target The value to search for.
 * @param {Function} comparator The comparator invoked per element.
 * @returns {boolean} Returns `true` if `target` is found, else `false`.
 */
function arrayIncludesWith(array, value, comparator) {
  var index = -1,
      length = array ? array.length : 0;

  while (++index < length) {
    if (comparator(value, array[index])) {
      return true;
    }
  }
  return false;
}

/**
 * The base implementation of `_.findIndex` and `_.findLastIndex` without
 * support for iteratee shorthands.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} predicate The function invoked per iteration.
 * @param {number} fromIndex The index to search from.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseFindIndex(array, predicate, fromIndex, fromRight) {
  var length = array.length,
      index = fromIndex + (fromRight ? 1 : -1);

  while ((fromRight ? index-- : ++index < length)) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.indexOf` without `fromIndex` bounds checks.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} value The value to search for.
 * @param {number} fromIndex The index to search from.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  if (value !== value) {
    return baseFindIndex(array, baseIsNaN, fromIndex);
  }
  var index = fromIndex - 1,
      length = array.length;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.isNaN` without support for number objects.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
 */
function baseIsNaN(value) {
  return value !== value;
}

/**
 * Checks if a cache value for `key` exists.
 *
 * @private
 * @param {Object} cache The cache to query.
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function cacheHas(cache, key) {
  return cache.has(key);
}

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
function isHostObject(value) {
  // Many host objects are `Object` objects that can coerce to strings
  // despite having improperly defined `toString` methods.
  var result = false;
  if (value != null && typeof value.toString != 'function') {
    try {
      result = !!(value + '');
    } catch (e) {}
  }
  return result;
}

/**
 * Converts `set` to an array of its values.
 *
 * @private
 * @param {Object} set The set to convert.
 * @returns {Array} Returns the values.
 */
function setToArray(set) {
  var index = -1,
      result = Array(set.size);

  set.forEach(function(value) {
    result[++index] = value;
  });
  return result;
}

/** Used for built-in method references. */
var arrayProto = Array.prototype,
    funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/** Built-in value references. */
var splice = arrayProto.splice;

/* Built-in method references that are verified to be native. */
var Map = getNative(root, 'Map'),
    Set = getNative(root, 'Set'),
    nativeCreate = getNative(Object, 'create');

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
}

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  return this.has(key) && delete this.__data__[key];
}

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
}

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
}

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  return true;
}

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map || ListCache),
    'string': new Hash
  };
}

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  return getMapData(this, key)['delete'](key);
}

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  getMapData(this, key).set(key, value);
  return this;
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

/**
 *
 * Creates an array cache object to store unique values.
 *
 * @private
 * @constructor
 * @param {Array} [values] The values to cache.
 */
function SetCache(values) {
  var index = -1,
      length = values ? values.length : 0;

  this.__data__ = new MapCache;
  while (++index < length) {
    this.add(values[index]);
  }
}

/**
 * Adds `value` to the array cache.
 *
 * @private
 * @name add
 * @memberOf SetCache
 * @alias push
 * @param {*} value The value to cache.
 * @returns {Object} Returns the cache instance.
 */
function setCacheAdd(value) {
  this.__data__.set(value, HASH_UNDEFINED);
  return this;
}

/**
 * Checks if `value` is in the array cache.
 *
 * @private
 * @name has
 * @memberOf SetCache
 * @param {*} value The value to search for.
 * @returns {number} Returns `true` if `value` is found, else `false`.
 */
function setCacheHas(value) {
  return this.__data__.has(value);
}

// Add methods to `SetCache`.
SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
SetCache.prototype.has = setCacheHas;

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

/**
 * The base implementation of `_.uniqBy` without support for iteratee shorthands.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} [iteratee] The iteratee invoked per element.
 * @param {Function} [comparator] The comparator invoked per element.
 * @returns {Array} Returns the new duplicate free array.
 */
function baseUniq(array, iteratee, comparator) {
  var index = -1,
      includes = arrayIncludes,
      length = array.length,
      isCommon = true,
      result = [],
      seen = result;

  if (comparator) {
    isCommon = false;
    includes = arrayIncludesWith;
  }
  else if (length >= LARGE_ARRAY_SIZE) {
    var set = iteratee ? null : createSet(array);
    if (set) {
      return setToArray(set);
    }
    isCommon = false;
    includes = cacheHas;
    seen = new SetCache;
  }
  else {
    seen = iteratee ? [] : result;
  }
  outer:
  while (++index < length) {
    var value = array[index],
        computed = iteratee ? iteratee(value) : value;

    value = (comparator || value !== 0) ? value : 0;
    if (isCommon && computed === computed) {
      var seenIndex = seen.length;
      while (seenIndex--) {
        if (seen[seenIndex] === computed) {
          continue outer;
        }
      }
      if (iteratee) {
        seen.push(computed);
      }
      result.push(value);
    }
    else if (!includes(seen, computed, comparator)) {
      if (seen !== result) {
        seen.push(computed);
      }
      result.push(value);
    }
  }
  return result;
}

/**
 * Creates a set object of `values`.
 *
 * @private
 * @param {Array} values The values to add to the set.
 * @returns {Object} Returns the new set.
 */
var createSet = !(Set && (1 / setToArray(new Set([,-0]))[1]) == INFINITY) ? noop : function(values) {
  return new Set(values);
};

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to process.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

/**
 * Creates a duplicate-free version of an array, using
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * for equality comparisons, in which only the first occurrence of each
 * element is kept.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Array
 * @param {Array} array The array to inspect.
 * @returns {Array} Returns the new duplicate free array.
 * @example
 *
 * _.uniq([2, 1, 2]);
 * // => [2, 1]
 */
function uniq(array) {
  return (array && array.length)
    ? baseUniq(array)
    : [];
}

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * This method returns `undefined`.
 *
 * @static
 * @memberOf _
 * @since 2.3.0
 * @category Util
 * @example
 *
 * _.times(2, _.noop);
 * // => [undefined, undefined]
 */
function noop() {
  // No operation performed.
}

module.exports = uniq;


/***/ }),

/***/ 7382:
/***/ ((module) => {

"use strict";


/**
 * Converts tokens for a single address into an address object
 *
 * @param {Array} tokens Tokens object
 * @return {Object} Address object
 */
function _handleAddress(tokens) {
    let isGroup = false;
    let state = 'text';
    let address;
    let addresses = [];
    let data = {
        address: [],
        comment: [],
        group: [],
        text: []
    };
    let i;
    let len;

    // Filter out <addresses>, (comments) and regular text
    for (i = 0, len = tokens.length; i < len; i++) {
        let token = tokens[i];
        let prevToken = i ? tokens[i - 1] : null;
        if (token.type === 'operator') {
            switch (token.value) {
                case '<':
                    state = 'address';
                    break;
                case '(':
                    state = 'comment';
                    break;
                case ':':
                    state = 'group';
                    isGroup = true;
                    break;
                default:
                    state = 'text';
                    break;
            }
        } else if (token.value) {
            if (state === 'address') {
                // handle use case where unquoted name includes a "<"
                // Apple Mail truncates everything between an unexpected < and an address
                // and so will we
                token.value = token.value.replace(/^[^<]*<\s*/, '');
            }

            if (prevToken && prevToken.noBreak && data[state].length) {
                // join values
                data[state][data[state].length - 1] += token.value;
            } else {
                data[state].push(token.value);
            }
        }
    }

    // If there is no text but a comment, replace the two
    if (!data.text.length && data.comment.length) {
        data.text = data.comment;
        data.comment = [];
    }

    if (isGroup) {
        // http://tools.ietf.org/html/rfc2822#appendix-A.1.3
        data.text = data.text.join(' ');
        addresses.push({
            name: data.text || (address && address.name),
            group: data.group.length ? addressparser(data.group.join(',')) : []
        });
    } else {
        // If no address was found, try to detect one from regular text
        if (!data.address.length && data.text.length) {
            for (i = data.text.length - 1; i >= 0; i--) {
                if (data.text[i].match(/^[^@\s]+@[^@\s]+$/)) {
                    data.address = data.text.splice(i, 1);
                    break;
                }
            }

            let _regexHandler = function (address) {
                if (!data.address.length) {
                    data.address = [address.trim()];
                    return ' ';
                } else {
                    return address;
                }
            };

            // still no address
            if (!data.address.length) {
                for (i = data.text.length - 1; i >= 0; i--) {
                    // fixed the regex to parse email address correctly when email address has more than one @
                    data.text[i] = data.text[i].replace(/\s*\b[^@\s]+@[^\s]+\b\s*/, _regexHandler).trim();
                    if (data.address.length) {
                        break;
                    }
                }
            }
        }

        // If there's still is no text but a comment exixts, replace the two
        if (!data.text.length && data.comment.length) {
            data.text = data.comment;
            data.comment = [];
        }

        // Keep only the first address occurence, push others to regular text
        if (data.address.length > 1) {
            data.text = data.text.concat(data.address.splice(1));
        }

        // Join values with spaces
        data.text = data.text.join(' ');
        data.address = data.address.join(' ');

        if (!data.address && isGroup) {
            return [];
        } else {
            address = {
                address: data.address || data.text || '',
                name: data.text || data.address || ''
            };

            if (address.address === address.name) {
                if ((address.address || '').match(/@/)) {
                    address.name = '';
                } else {
                    address.address = '';
                }
            }

            addresses.push(address);
        }
    }

    return addresses;
}

/**
 * Creates a Tokenizer object for tokenizing address field strings
 *
 * @constructor
 * @param {String} str Address field string
 */
class Tokenizer {
    constructor(str) {
        this.str = (str || '').toString();
        this.operatorCurrent = '';
        this.operatorExpecting = '';
        this.node = null;
        this.escaped = false;

        this.list = [];
        /**
         * Operator tokens and which tokens are expected to end the sequence
         */
        this.operators = {
            '"': '"',
            '(': ')',
            '<': '>',
            ',': '',
            ':': ';',
            // Semicolons are not a legal delimiter per the RFC2822 grammar other
            // than for terminating a group, but they are also not valid for any
            // other use in this context.  Given that some mail clients have
            // historically allowed the semicolon as a delimiter equivalent to the
            // comma in their UI, it makes sense to treat them the same as a comma
            // when used outside of a group.
            ';': ''
        };
    }

    /**
     * Tokenizes the original input string
     *
     * @return {Array} An array of operator|text tokens
     */
    tokenize() {
        let list = [];

        for (let i = 0, len = this.str.length; i < len; i++) {
            let chr = this.str.charAt(i);
            let nextChr = i < len - 1 ? this.str.charAt(i + 1) : null;
            this.checkChar(chr, nextChr);
        }

        this.list.forEach(node => {
            node.value = (node.value || '').toString().trim();
            if (node.value) {
                list.push(node);
            }
        });

        return list;
    }

    /**
     * Checks if a character is an operator or text and acts accordingly
     *
     * @param {String} chr Character from the address field
     */
    checkChar(chr, nextChr) {
        if (this.escaped) {
            // ignore next condition blocks
        } else if (chr === this.operatorExpecting) {
            this.node = {
                type: 'operator',
                value: chr
            };

            if (nextChr && ![' ', '\t', '\r', '\n', ',', ';'].includes(nextChr)) {
                this.node.noBreak = true;
            }

            this.list.push(this.node);
            this.node = null;
            this.operatorExpecting = '';
            this.escaped = false;

            return;
        } else if (!this.operatorExpecting && chr in this.operators) {
            this.node = {
                type: 'operator',
                value: chr
            };
            this.list.push(this.node);
            this.node = null;
            this.operatorExpecting = this.operators[chr];
            this.escaped = false;
            return;
        } else if (['"', "'"].includes(this.operatorExpecting) && chr === '\\') {
            this.escaped = true;
            return;
        }

        if (!this.node) {
            this.node = {
                type: 'text',
                value: ''
            };
            this.list.push(this.node);
        }

        if (chr === '\n') {
            // Convert newlines to spaces. Carriage return is ignored as \r and \n usually
            // go together anyway and there already is a WS for \n. Lone \r means something is fishy.
            chr = ' ';
        }

        if (chr.charCodeAt(0) >= 0x21 || [' ', '\t'].includes(chr)) {
            // skip command bytes
            this.node.value += chr;
        }

        this.escaped = false;
    }
}

/**
 * Parses structured e-mail addresses from an address field
 *
 * Example:
 *
 *    'Name <address@domain>'
 *
 * will be converted to
 *
 *     [{name: 'Name', address: 'address@domain'}]
 *
 * @param {String} str Address field
 * @return {Array} An array of address objects
 */
function addressparser(str, options) {
    options = options || {};

    let tokenizer = new Tokenizer(str);
    let tokens = tokenizer.tokenize();

    let addresses = [];
    let address = [];
    let parsedAddresses = [];

    tokens.forEach(token => {
        if (token.type === 'operator' && (token.value === ',' || token.value === ';')) {
            if (address.length) {
                addresses.push(address);
            }
            address = [];
        } else {
            address.push(token);
        }
    });

    if (address.length) {
        addresses.push(address);
    }

    addresses.forEach(address => {
        address = _handleAddress(address);
        if (address.length) {
            parsedAddresses = parsedAddresses.concat(address);
        }
    });

    if (options.flatten) {
        let addresses = [];
        let walkAddressList = list => {
            list.forEach(address => {
                if (address.group) {
                    return walkAddressList(address.group);
                } else {
                    addresses.push(address);
                }
            });
        };
        walkAddressList(parsedAddresses);
        return addresses;
    }

    return parsedAddresses;
}

// expose to the world
module.exports = addressparser;


/***/ }),

/***/ 4017:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const Transform = (__nccwpck_require__(2781).Transform);

/**
 * Encodes a Buffer into a base64 encoded string
 *
 * @param {Buffer} buffer Buffer to convert
 * @returns {String} base64 encoded string
 */
function encode(buffer) {
    if (typeof buffer === 'string') {
        buffer = Buffer.from(buffer, 'utf-8');
    }

    return buffer.toString('base64');
}

/**
 * Adds soft line breaks to a base64 string
 *
 * @param {String} str base64 encoded string that might need line wrapping
 * @param {Number} [lineLength=76] Maximum allowed length for a line
 * @returns {String} Soft-wrapped base64 encoded string
 */
function wrap(str, lineLength) {
    str = (str || '').toString();
    lineLength = lineLength || 76;

    if (str.length <= lineLength) {
        return str;
    }

    let result = [];
    let pos = 0;
    let chunkLength = lineLength * 1024;
    while (pos < str.length) {
        let wrappedLines = str
            .substr(pos, chunkLength)
            .replace(new RegExp('.{' + lineLength + '}', 'g'), '$&\r\n')
            .trim();
        result.push(wrappedLines);
        pos += chunkLength;
    }

    return result.join('\r\n').trim();
}

/**
 * Creates a transform stream for encoding data to base64 encoding
 *
 * @constructor
 * @param {Object} options Stream options
 * @param {Number} [options.lineLength=76] Maximum length for lines, set to false to disable wrapping
 */
class Encoder extends Transform {
    constructor(options) {
        super();
        // init Transform
        this.options = options || {};

        if (this.options.lineLength !== false) {
            this.options.lineLength = this.options.lineLength || 76;
        }

        this._curLine = '';
        this._remainingBytes = false;

        this.inputBytes = 0;
        this.outputBytes = 0;
    }

    _transform(chunk, encoding, done) {
        if (encoding !== 'buffer') {
            chunk = Buffer.from(chunk, encoding);
        }

        if (!chunk || !chunk.length) {
            return setImmediate(done);
        }

        this.inputBytes += chunk.length;

        if (this._remainingBytes && this._remainingBytes.length) {
            chunk = Buffer.concat([this._remainingBytes, chunk], this._remainingBytes.length + chunk.length);
            this._remainingBytes = false;
        }

        if (chunk.length % 3) {
            this._remainingBytes = chunk.slice(chunk.length - (chunk.length % 3));
            chunk = chunk.slice(0, chunk.length - (chunk.length % 3));
        } else {
            this._remainingBytes = false;
        }

        let b64 = this._curLine + encode(chunk);

        if (this.options.lineLength) {
            b64 = wrap(b64, this.options.lineLength);

            // remove last line as it is still most probably incomplete
            let lastLF = b64.lastIndexOf('\n');
            if (lastLF < 0) {
                this._curLine = b64;
                b64 = '';
            } else if (lastLF === b64.length - 1) {
                this._curLine = '';
            } else {
                this._curLine = b64.substr(lastLF + 1);
                b64 = b64.substr(0, lastLF + 1);
            }
        }

        if (b64) {
            this.outputBytes += b64.length;
            this.push(Buffer.from(b64, 'ascii'));
        }

        setImmediate(done);
    }

    _flush(done) {
        if (this._remainingBytes && this._remainingBytes.length) {
            this._curLine += encode(this._remainingBytes);
        }

        if (this._curLine) {
            this._curLine = wrap(this._curLine, this.options.lineLength);
            this.outputBytes += this._curLine.length;
            this.push(this._curLine, 'ascii');
            this._curLine = '';
        }
        done();
    }
}

// expose to the world
module.exports = {
    encode,
    wrap,
    Encoder
};


/***/ }),

/***/ 7757:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


// FIXME:
// replace this Transform mess with a method that pipes input argument to output argument

const MessageParser = __nccwpck_require__(6196);
const RelaxedBody = __nccwpck_require__(1412);
const sign = __nccwpck_require__(9475);
const PassThrough = (__nccwpck_require__(2781).PassThrough);
const fs = __nccwpck_require__(7147);
const path = __nccwpck_require__(1017);
const crypto = __nccwpck_require__(6113);

const DKIM_ALGO = 'sha256';
const MAX_MESSAGE_SIZE = 128 * 1024; // buffer messages larger than this to disk

/*
// Usage:

let dkim = new DKIM({
    domainName: 'example.com',
    keySelector: 'key-selector',
    privateKey,
    cacheDir: '/tmp'
});
dkim.sign(input).pipe(process.stdout);

// Where inputStream is a rfc822 message (either a stream, string or Buffer)
// and outputStream is a DKIM signed rfc822 message
*/

class DKIMSigner {
    constructor(options, keys, input, output) {
        this.options = options || {};
        this.keys = keys;

        this.cacheTreshold = Number(this.options.cacheTreshold) || MAX_MESSAGE_SIZE;
        this.hashAlgo = this.options.hashAlgo || DKIM_ALGO;

        this.cacheDir = this.options.cacheDir || false;

        this.chunks = [];
        this.chunklen = 0;
        this.readPos = 0;
        this.cachePath = this.cacheDir ? path.join(this.cacheDir, 'message.' + Date.now() + '-' + crypto.randomBytes(14).toString('hex')) : false;
        this.cache = false;

        this.headers = false;
        this.bodyHash = false;
        this.parser = false;
        this.relaxedBody = false;

        this.input = input;
        this.output = output;
        this.output.usingCache = false;

        this.hasErrored = false;

        this.input.on('error', err => {
            this.hasErrored = true;
            this.cleanup();
            output.emit('error', err);
        });
    }

    cleanup() {
        if (!this.cache || !this.cachePath) {
            return;
        }
        fs.unlink(this.cachePath, () => false);
    }

    createReadCache() {
        // pipe remainings to cache file
        this.cache = fs.createReadStream(this.cachePath);
        this.cache.once('error', err => {
            this.cleanup();
            this.output.emit('error', err);
        });
        this.cache.once('close', () => {
            this.cleanup();
        });
        this.cache.pipe(this.output);
    }

    sendNextChunk() {
        if (this.hasErrored) {
            return;
        }

        if (this.readPos >= this.chunks.length) {
            if (!this.cache) {
                return this.output.end();
            }
            return this.createReadCache();
        }
        let chunk = this.chunks[this.readPos++];
        if (this.output.write(chunk) === false) {
            return this.output.once('drain', () => {
                this.sendNextChunk();
            });
        }
        setImmediate(() => this.sendNextChunk());
    }

    sendSignedOutput() {
        let keyPos = 0;
        let signNextKey = () => {
            if (keyPos >= this.keys.length) {
                this.output.write(this.parser.rawHeaders);
                return setImmediate(() => this.sendNextChunk());
            }
            let key = this.keys[keyPos++];
            let dkimField = sign(this.headers, this.hashAlgo, this.bodyHash, {
                domainName: key.domainName,
                keySelector: key.keySelector,
                privateKey: key.privateKey,
                headerFieldNames: this.options.headerFieldNames,
                skipFields: this.options.skipFields
            });
            if (dkimField) {
                this.output.write(Buffer.from(dkimField + '\r\n'));
            }
            return setImmediate(signNextKey);
        };

        if (this.bodyHash && this.headers) {
            return signNextKey();
        }

        this.output.write(this.parser.rawHeaders);
        this.sendNextChunk();
    }

    createWriteCache() {
        this.output.usingCache = true;
        // pipe remainings to cache file
        this.cache = fs.createWriteStream(this.cachePath);
        this.cache.once('error', err => {
            this.cleanup();
            // drain input
            this.relaxedBody.unpipe(this.cache);
            this.relaxedBody.on('readable', () => {
                while (this.relaxedBody.read() !== null) {
                    // do nothing
                }
            });
            this.hasErrored = true;
            // emit error
            this.output.emit('error', err);
        });
        this.cache.once('close', () => {
            this.sendSignedOutput();
        });
        this.relaxedBody.removeAllListeners('readable');
        this.relaxedBody.pipe(this.cache);
    }

    signStream() {
        this.parser = new MessageParser();
        this.relaxedBody = new RelaxedBody({
            hashAlgo: this.hashAlgo
        });

        this.parser.on('headers', value => {
            this.headers = value;
        });

        this.relaxedBody.on('hash', value => {
            this.bodyHash = value;
        });

        this.relaxedBody.on('readable', () => {
            let chunk;
            if (this.cache) {
                return;
            }
            while ((chunk = this.relaxedBody.read()) !== null) {
                this.chunks.push(chunk);
                this.chunklen += chunk.length;
                if (this.chunklen >= this.cacheTreshold && this.cachePath) {
                    return this.createWriteCache();
                }
            }
        });

        this.relaxedBody.on('end', () => {
            if (this.cache) {
                return;
            }
            this.sendSignedOutput();
        });

        this.parser.pipe(this.relaxedBody);
        setImmediate(() => this.input.pipe(this.parser));
    }
}

class DKIM {
    constructor(options) {
        this.options = options || {};
        this.keys = [].concat(
            this.options.keys || {
                domainName: options.domainName,
                keySelector: options.keySelector,
                privateKey: options.privateKey
            }
        );
    }

    sign(input, extraOptions) {
        let output = new PassThrough();
        let inputStream = input;
        let writeValue = false;

        if (Buffer.isBuffer(input)) {
            writeValue = input;
            inputStream = new PassThrough();
        } else if (typeof input === 'string') {
            writeValue = Buffer.from(input);
            inputStream = new PassThrough();
        }

        let options = this.options;
        if (extraOptions && Object.keys(extraOptions).length) {
            options = {};
            Object.keys(this.options || {}).forEach(key => {
                options[key] = this.options[key];
            });
            Object.keys(extraOptions || {}).forEach(key => {
                if (!(key in options)) {
                    options[key] = extraOptions[key];
                }
            });
        }

        let signer = new DKIMSigner(options, this.keys, inputStream, output);
        setImmediate(() => {
            signer.signStream();
            if (writeValue) {
                setImmediate(() => {
                    inputStream.end(writeValue);
                });
            }
        });

        return output;
    }
}

module.exports = DKIM;


/***/ }),

/***/ 6196:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const Transform = (__nccwpck_require__(2781).Transform);

/**
 * MessageParser instance is a transform stream that separates message headers
 * from the rest of the body. Headers are emitted with the 'headers' event. Message
 * body is passed on as the resulting stream.
 */
class MessageParser extends Transform {
    constructor(options) {
        super(options);
        this.lastBytes = Buffer.alloc(4);
        this.headersParsed = false;
        this.headerBytes = 0;
        this.headerChunks = [];
        this.rawHeaders = false;
        this.bodySize = 0;
    }

    /**
     * Keeps count of the last 4 bytes in order to detect line breaks on chunk boundaries
     *
     * @param {Buffer} data Next data chunk from the stream
     */
    updateLastBytes(data) {
        let lblen = this.lastBytes.length;
        let nblen = Math.min(data.length, lblen);

        // shift existing bytes
        for (let i = 0, len = lblen - nblen; i < len; i++) {
            this.lastBytes[i] = this.lastBytes[i + nblen];
        }

        // add new bytes
        for (let i = 1; i <= nblen; i++) {
            this.lastBytes[lblen - i] = data[data.length - i];
        }
    }

    /**
     * Finds and removes message headers from the remaining body. We want to keep
     * headers separated until final delivery to be able to modify these
     *
     * @param {Buffer} data Next chunk of data
     * @return {Boolean} Returns true if headers are already found or false otherwise
     */
    checkHeaders(data) {
        if (this.headersParsed) {
            return true;
        }

        let lblen = this.lastBytes.length;
        let headerPos = 0;
        this.curLinePos = 0;
        for (let i = 0, len = this.lastBytes.length + data.length; i < len; i++) {
            let chr;
            if (i < lblen) {
                chr = this.lastBytes[i];
            } else {
                chr = data[i - lblen];
            }
            if (chr === 0x0a && i) {
                let pr1 = i - 1 < lblen ? this.lastBytes[i - 1] : data[i - 1 - lblen];
                let pr2 = i > 1 ? (i - 2 < lblen ? this.lastBytes[i - 2] : data[i - 2 - lblen]) : false;
                if (pr1 === 0x0a) {
                    this.headersParsed = true;
                    headerPos = i - lblen + 1;
                    this.headerBytes += headerPos;
                    break;
                } else if (pr1 === 0x0d && pr2 === 0x0a) {
                    this.headersParsed = true;
                    headerPos = i - lblen + 1;
                    this.headerBytes += headerPos;
                    break;
                }
            }
        }

        if (this.headersParsed) {
            this.headerChunks.push(data.slice(0, headerPos));
            this.rawHeaders = Buffer.concat(this.headerChunks, this.headerBytes);
            this.headerChunks = null;
            this.emit('headers', this.parseHeaders());
            if (data.length - 1 > headerPos) {
                let chunk = data.slice(headerPos);
                this.bodySize += chunk.length;
                // this would be the first chunk of data sent downstream
                setImmediate(() => this.push(chunk));
            }
            return false;
        } else {
            this.headerBytes += data.length;
            this.headerChunks.push(data);
        }

        // store last 4 bytes to catch header break
        this.updateLastBytes(data);

        return false;
    }

    _transform(chunk, encoding, callback) {
        if (!chunk || !chunk.length) {
            return callback();
        }

        if (typeof chunk === 'string') {
            chunk = Buffer.from(chunk, encoding);
        }

        let headersFound;

        try {
            headersFound = this.checkHeaders(chunk);
        } catch (E) {
            return callback(E);
        }

        if (headersFound) {
            this.bodySize += chunk.length;
            this.push(chunk);
        }

        setImmediate(callback);
    }

    _flush(callback) {
        if (this.headerChunks) {
            let chunk = Buffer.concat(this.headerChunks, this.headerBytes);
            this.bodySize += chunk.length;
            this.push(chunk);
            this.headerChunks = null;
        }
        callback();
    }

    parseHeaders() {
        let lines = (this.rawHeaders || '').toString().split(/\r?\n/);
        for (let i = lines.length - 1; i > 0; i--) {
            if (/^\s/.test(lines[i])) {
                lines[i - 1] += '\n' + lines[i];
                lines.splice(i, 1);
            }
        }
        return lines
            .filter(line => line.trim())
            .map(line => ({
                key: line.substr(0, line.indexOf(':')).trim().toLowerCase(),
                line
            }));
    }
}

module.exports = MessageParser;


/***/ }),

/***/ 1412:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


// streams through a message body and calculates relaxed body hash

const Transform = (__nccwpck_require__(2781).Transform);
const crypto = __nccwpck_require__(6113);

class RelaxedBody extends Transform {
    constructor(options) {
        super();
        options = options || {};
        this.chunkBuffer = [];
        this.chunkBufferLen = 0;
        this.bodyHash = crypto.createHash(options.hashAlgo || 'sha1');
        this.remainder = '';
        this.byteLength = 0;

        this.debug = options.debug;
        this._debugBody = options.debug ? [] : false;
    }

    updateHash(chunk) {
        let bodyStr;

        // find next remainder
        let nextRemainder = '';

        // This crux finds and removes the spaces from the last line and the newline characters after the last non-empty line
        // If we get another chunk that does not match this description then we can restore the previously processed data
        let state = 'file';
        for (let i = chunk.length - 1; i >= 0; i--) {
            let c = chunk[i];

            if (state === 'file' && (c === 0x0a || c === 0x0d)) {
                // do nothing, found \n or \r at the end of chunk, stil end of file
            } else if (state === 'file' && (c === 0x09 || c === 0x20)) {
                // switch to line ending mode, this is the last non-empty line
                state = 'line';
            } else if (state === 'line' && (c === 0x09 || c === 0x20)) {
                // do nothing, found ' ' or \t at the end of line, keep processing the last non-empty line
            } else if (state === 'file' || state === 'line') {
                // non line/file ending character found, switch to body mode
                state = 'body';
                if (i === chunk.length - 1) {
                    // final char is not part of line end or file end, so do nothing
                    break;
                }
            }

            if (i === 0) {
                // reached to the beginning of the chunk, check if it is still about the ending
                // and if the remainder also matches
                if (
                    (state === 'file' && (!this.remainder || /[\r\n]$/.test(this.remainder))) ||
                    (state === 'line' && (!this.remainder || /[ \t]$/.test(this.remainder)))
                ) {
                    // keep everything
                    this.remainder += chunk.toString('binary');
                    return;
                } else if (state === 'line' || state === 'file') {
                    // process existing remainder as normal line but store the current chunk
                    nextRemainder = chunk.toString('binary');
                    chunk = false;
                    break;
                }
            }

            if (state !== 'body') {
                continue;
            }

            // reached first non ending byte
            nextRemainder = chunk.slice(i + 1).toString('binary');
            chunk = chunk.slice(0, i + 1);
            break;
        }

        let needsFixing = !!this.remainder;
        if (chunk && !needsFixing) {
            // check if we even need to change anything
            for (let i = 0, len = chunk.length; i < len; i++) {
                if (i && chunk[i] === 0x0a && chunk[i - 1] !== 0x0d) {
                    // missing \r before \n
                    needsFixing = true;
                    break;
                } else if (i && chunk[i] === 0x0d && chunk[i - 1] === 0x20) {
                    // trailing WSP found
                    needsFixing = true;
                    break;
                } else if (i && chunk[i] === 0x20 && chunk[i - 1] === 0x20) {
                    // multiple spaces found, needs to be replaced with just one
                    needsFixing = true;
                    break;
                } else if (chunk[i] === 0x09) {
                    // TAB found, needs to be replaced with a space
                    needsFixing = true;
                    break;
                }
            }
        }

        if (needsFixing) {
            bodyStr = this.remainder + (chunk ? chunk.toString('binary') : '');
            this.remainder = nextRemainder;
            bodyStr = bodyStr
                .replace(/\r?\n/g, '\n') // use js line endings
                .replace(/[ \t]*$/gm, '') // remove line endings, rtrim
                .replace(/[ \t]+/gm, ' ') // single spaces
                .replace(/\n/g, '\r\n'); // restore rfc822 line endings
            chunk = Buffer.from(bodyStr, 'binary');
        } else if (nextRemainder) {
            this.remainder = nextRemainder;
        }

        if (this.debug) {
            this._debugBody.push(chunk);
        }
        this.bodyHash.update(chunk);
    }

    _transform(chunk, encoding, callback) {
        if (!chunk || !chunk.length) {
            return callback();
        }

        if (typeof chunk === 'string') {
            chunk = Buffer.from(chunk, encoding);
        }

        this.updateHash(chunk);

        this.byteLength += chunk.length;
        this.push(chunk);
        callback();
    }

    _flush(callback) {
        // generate final hash and emit it
        if (/[\r\n]$/.test(this.remainder) && this.byteLength > 2) {
            // add terminating line end
            this.bodyHash.update(Buffer.from('\r\n'));
        }
        if (!this.byteLength) {
            // emit empty line buffer to keep the stream flowing
            this.push(Buffer.from('\r\n'));
            // this.bodyHash.update(Buffer.from('\r\n'));
        }

        this.emit('hash', this.bodyHash.digest('base64'), this.debug ? Buffer.concat(this._debugBody) : false);
        callback();
    }
}

module.exports = RelaxedBody;


/***/ }),

/***/ 9475:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const punycode = __nccwpck_require__(4317);
const mimeFuncs = __nccwpck_require__(994);
const crypto = __nccwpck_require__(6113);

/**
 * Returns DKIM signature header line
 *
 * @param {Object} headers Parsed headers object from MessageParser
 * @param {String} bodyHash Base64 encoded hash of the message
 * @param {Object} options DKIM options
 * @param {String} options.domainName Domain name to be signed for
 * @param {String} options.keySelector DKIM key selector to use
 * @param {String} options.privateKey DKIM private key to use
 * @return {String} Complete header line
 */

module.exports = (headers, hashAlgo, bodyHash, options) => {
    options = options || {};

    // all listed fields from RFC4871 #5.5
    let defaultFieldNames =
        'From:Sender:Reply-To:Subject:Date:Message-ID:To:' +
        'Cc:MIME-Version:Content-Type:Content-Transfer-Encoding:Content-ID:' +
        'Content-Description:Resent-Date:Resent-From:Resent-Sender:' +
        'Resent-To:Resent-Cc:Resent-Message-ID:In-Reply-To:References:' +
        'List-Id:List-Help:List-Unsubscribe:List-Subscribe:List-Post:' +
        'List-Owner:List-Archive';

    let fieldNames = options.headerFieldNames || defaultFieldNames;

    let canonicalizedHeaderData = relaxedHeaders(headers, fieldNames, options.skipFields);
    let dkimHeader = generateDKIMHeader(options.domainName, options.keySelector, canonicalizedHeaderData.fieldNames, hashAlgo, bodyHash);

    let signer, signature;

    canonicalizedHeaderData.headers += 'dkim-signature:' + relaxedHeaderLine(dkimHeader);

    signer = crypto.createSign(('rsa-' + hashAlgo).toUpperCase());
    signer.update(canonicalizedHeaderData.headers);
    try {
        signature = signer.sign(options.privateKey, 'base64');
    } catch (E) {
        return false;
    }

    return dkimHeader + signature.replace(/(^.{73}|.{75}(?!\r?\n|\r))/g, '$&\r\n ').trim();
};

module.exports.relaxedHeaders = relaxedHeaders;

function generateDKIMHeader(domainName, keySelector, fieldNames, hashAlgo, bodyHash) {
    let dkim = [
        'v=1',
        'a=rsa-' + hashAlgo,
        'c=relaxed/relaxed',
        'd=' + punycode.toASCII(domainName),
        'q=dns/txt',
        's=' + keySelector,
        'bh=' + bodyHash,
        'h=' + fieldNames
    ].join('; ');

    return mimeFuncs.foldLines('DKIM-Signature: ' + dkim, 76) + ';\r\n b=';
}

function relaxedHeaders(headers, fieldNames, skipFields) {
    let includedFields = new Set();
    let skip = new Set();
    let headerFields = new Map();

    (skipFields || '')
        .toLowerCase()
        .split(':')
        .forEach(field => {
            skip.add(field.trim());
        });

    (fieldNames || '')
        .toLowerCase()
        .split(':')
        .filter(field => !skip.has(field.trim()))
        .forEach(field => {
            includedFields.add(field.trim());
        });

    for (let i = headers.length - 1; i >= 0; i--) {
        let line = headers[i];
        // only include the first value from bottom to top
        if (includedFields.has(line.key) && !headerFields.has(line.key)) {
            headerFields.set(line.key, relaxedHeaderLine(line.line));
        }
    }

    let headersList = [];
    let fields = [];
    includedFields.forEach(field => {
        if (headerFields.has(field)) {
            fields.push(field);
            headersList.push(field + ':' + headerFields.get(field));
        }
    });

    return {
        headers: headersList.join('\r\n') + '\r\n',
        fieldNames: fields.join(':')
    };
}

function relaxedHeaderLine(line) {
    return line
        .substr(line.indexOf(':') + 1)
        .replace(/\r?\n/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}


/***/ }),

/***/ 322:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


// module to handle cookies

const urllib = __nccwpck_require__(7310);

const SESSION_TIMEOUT = 1800; // 30 min

/**
 * Creates a biskviit cookie jar for managing cookie values in memory
 *
 * @constructor
 * @param {Object} [options] Optional options object
 */
class Cookies {
    constructor(options) {
        this.options = options || {};
        this.cookies = [];
    }

    /**
     * Stores a cookie string to the cookie storage
     *
     * @param {String} cookieStr Value from the 'Set-Cookie:' header
     * @param {String} url Current URL
     */
    set(cookieStr, url) {
        let urlparts = urllib.parse(url || '');
        let cookie = this.parse(cookieStr);
        let domain;

        if (cookie.domain) {
            domain = cookie.domain.replace(/^\./, '');

            // do not allow cross origin cookies
            if (
                // can't be valid if the requested domain is shorter than current hostname
                urlparts.hostname.length < domain.length ||
                // prefix domains with dot to be sure that partial matches are not used
                ('.' + urlparts.hostname).substr(-domain.length + 1) !== '.' + domain
            ) {
                cookie.domain = urlparts.hostname;
            }
        } else {
            cookie.domain = urlparts.hostname;
        }

        if (!cookie.path) {
            cookie.path = this.getPath(urlparts.pathname);
        }

        // if no expire date, then use sessionTimeout value
        if (!cookie.expires) {
            cookie.expires = new Date(Date.now() + (Number(this.options.sessionTimeout || SESSION_TIMEOUT) || SESSION_TIMEOUT) * 1000);
        }

        return this.add(cookie);
    }

    /**
     * Returns cookie string for the 'Cookie:' header.
     *
     * @param {String} url URL to check for
     * @returns {String} Cookie header or empty string if no matches were found
     */
    get(url) {
        return this.list(url)
            .map(cookie => cookie.name + '=' + cookie.value)
            .join('; ');
    }

    /**
     * Lists all valied cookie objects for the specified URL
     *
     * @param {String} url URL to check for
     * @returns {Array} An array of cookie objects
     */
    list(url) {
        let result = [];
        let i;
        let cookie;

        for (i = this.cookies.length - 1; i >= 0; i--) {
            cookie = this.cookies[i];

            if (this.isExpired(cookie)) {
                this.cookies.splice(i, i);
                continue;
            }

            if (this.match(cookie, url)) {
                result.unshift(cookie);
            }
        }

        return result;
    }

    /**
     * Parses cookie string from the 'Set-Cookie:' header
     *
     * @param {String} cookieStr String from the 'Set-Cookie:' header
     * @returns {Object} Cookie object
     */
    parse(cookieStr) {
        let cookie = {};

        (cookieStr || '')
            .toString()
            .split(';')
            .forEach(cookiePart => {
                let valueParts = cookiePart.split('=');
                let key = valueParts.shift().trim().toLowerCase();
                let value = valueParts.join('=').trim();
                let domain;

                if (!key) {
                    // skip empty parts
                    return;
                }

                switch (key) {
                    case 'expires':
                        value = new Date(value);
                        // ignore date if can not parse it
                        if (value.toString() !== 'Invalid Date') {
                            cookie.expires = value;
                        }
                        break;

                    case 'path':
                        cookie.path = value;
                        break;

                    case 'domain':
                        domain = value.toLowerCase();
                        if (domain.length && domain.charAt(0) !== '.') {
                            domain = '.' + domain; // ensure preceeding dot for user set domains
                        }
                        cookie.domain = domain;
                        break;

                    case 'max-age':
                        cookie.expires = new Date(Date.now() + (Number(value) || 0) * 1000);
                        break;

                    case 'secure':
                        cookie.secure = true;
                        break;

                    case 'httponly':
                        cookie.httponly = true;
                        break;

                    default:
                        if (!cookie.name) {
                            cookie.name = key;
                            cookie.value = value;
                        }
                }
            });

        return cookie;
    }

    /**
     * Checks if a cookie object is valid for a specified URL
     *
     * @param {Object} cookie Cookie object
     * @param {String} url URL to check for
     * @returns {Boolean} true if cookie is valid for specifiec URL
     */
    match(cookie, url) {
        let urlparts = urllib.parse(url || '');

        // check if hostname matches
        // .foo.com also matches subdomains, foo.com does not
        if (
            urlparts.hostname !== cookie.domain &&
            (cookie.domain.charAt(0) !== '.' || ('.' + urlparts.hostname).substr(-cookie.domain.length) !== cookie.domain)
        ) {
            return false;
        }

        // check if path matches
        let path = this.getPath(urlparts.pathname);
        if (path.substr(0, cookie.path.length) !== cookie.path) {
            return false;
        }

        // check secure argument
        if (cookie.secure && urlparts.protocol !== 'https:') {
            return false;
        }

        return true;
    }

    /**
     * Adds (or updates/removes if needed) a cookie object to the cookie storage
     *
     * @param {Object} cookie Cookie value to be stored
     */
    add(cookie) {
        let i;
        let len;

        // nothing to do here
        if (!cookie || !cookie.name) {
            return false;
        }

        // overwrite if has same params
        for (i = 0, len = this.cookies.length; i < len; i++) {
            if (this.compare(this.cookies[i], cookie)) {
                // check if the cookie needs to be removed instead
                if (this.isExpired(cookie)) {
                    this.cookies.splice(i, 1); // remove expired/unset cookie
                    return false;
                }

                this.cookies[i] = cookie;
                return true;
            }
        }

        // add as new if not already expired
        if (!this.isExpired(cookie)) {
            this.cookies.push(cookie);
        }

        return true;
    }

    /**
     * Checks if two cookie objects are the same
     *
     * @param {Object} a Cookie to check against
     * @param {Object} b Cookie to check against
     * @returns {Boolean} True, if the cookies are the same
     */
    compare(a, b) {
        return a.name === b.name && a.path === b.path && a.domain === b.domain && a.secure === b.secure && a.httponly === a.httponly;
    }

    /**
     * Checks if a cookie is expired
     *
     * @param {Object} cookie Cookie object to check against
     * @returns {Boolean} True, if the cookie is expired
     */
    isExpired(cookie) {
        return (cookie.expires && cookie.expires < new Date()) || !cookie.value;
    }

    /**
     * Returns normalized cookie path for an URL path argument
     *
     * @param {String} pathname
     * @returns {String} Normalized path
     */
    getPath(pathname) {
        let path = (pathname || '/').split('/');
        path.pop(); // remove filename part
        path = path.join('/').trim();

        // ensure path prefix /
        if (path.charAt(0) !== '/') {
            path = '/' + path;
        }

        // ensure path suffix /
        if (path.substr(-1) !== '/') {
            path += '/';
        }

        return path;
    }
}

module.exports = Cookies;


/***/ }),

/***/ 9106:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const http = __nccwpck_require__(3685);
const https = __nccwpck_require__(5687);
const urllib = __nccwpck_require__(7310);
const zlib = __nccwpck_require__(9796);
const PassThrough = (__nccwpck_require__(2781).PassThrough);
const Cookies = __nccwpck_require__(322);
const packageData = __nccwpck_require__(4129);
const net = __nccwpck_require__(1808);

const MAX_REDIRECTS = 5;

module.exports = function (url, options) {
    return nmfetch(url, options);
};

module.exports.Cookies = Cookies;

function nmfetch(url, options) {
    options = options || {};

    options.fetchRes = options.fetchRes || new PassThrough();
    options.cookies = options.cookies || new Cookies();
    options.redirects = options.redirects || 0;
    options.maxRedirects = isNaN(options.maxRedirects) ? MAX_REDIRECTS : options.maxRedirects;

    if (options.cookie) {
        [].concat(options.cookie || []).forEach(cookie => {
            options.cookies.set(cookie, url);
        });
        options.cookie = false;
    }

    let fetchRes = options.fetchRes;
    let parsed = urllib.parse(url);
    let method = (options.method || '').toString().trim().toUpperCase() || 'GET';
    let finished = false;
    let cookies;
    let body;

    let handler = parsed.protocol === 'https:' ? https : http;

    let headers = {
        'accept-encoding': 'gzip,deflate',
        'user-agent': 'nodemailer/' + packageData.version
    };

    Object.keys(options.headers || {}).forEach(key => {
        headers[key.toLowerCase().trim()] = options.headers[key];
    });

    if (options.userAgent) {
        headers['user-agent'] = options.userAgent;
    }

    if (parsed.auth) {
        headers.Authorization = 'Basic ' + Buffer.from(parsed.auth).toString('base64');
    }

    if ((cookies = options.cookies.get(url))) {
        headers.cookie = cookies;
    }

    if (options.body) {
        if (options.contentType !== false) {
            headers['Content-Type'] = options.contentType || 'application/x-www-form-urlencoded';
        }

        if (typeof options.body.pipe === 'function') {
            // it's a stream
            headers['Transfer-Encoding'] = 'chunked';
            body = options.body;
            body.on('error', err => {
                if (finished) {
                    return;
                }
                finished = true;
                err.type = 'FETCH';
                err.sourceUrl = url;
                fetchRes.emit('error', err);
            });
        } else {
            if (options.body instanceof Buffer) {
                body = options.body;
            } else if (typeof options.body === 'object') {
                try {
                    // encodeURIComponent can fail on invalid input (partial emoji etc.)
                    body = Buffer.from(
                        Object.keys(options.body)
                            .map(key => {
                                let value = options.body[key].toString().trim();
                                return encodeURIComponent(key) + '=' + encodeURIComponent(value);
                            })
                            .join('&')
                    );
                } catch (E) {
                    if (finished) {
                        return;
                    }
                    finished = true;
                    E.type = 'FETCH';
                    E.sourceUrl = url;
                    fetchRes.emit('error', E);
                    return;
                }
            } else {
                body = Buffer.from(options.body.toString().trim());
            }

            headers['Content-Type'] = options.contentType || 'application/x-www-form-urlencoded';
            headers['Content-Length'] = body.length;
        }
        // if method is not provided, use POST instead of GET
        method = (options.method || '').toString().trim().toUpperCase() || 'POST';
    }

    let req;
    let reqOptions = {
        method,
        host: parsed.hostname,
        path: parsed.path,
        port: parsed.port ? parsed.port : parsed.protocol === 'https:' ? 443 : 80,
        headers,
        rejectUnauthorized: false,
        agent: false
    };

    if (options.tls) {
        Object.keys(options.tls).forEach(key => {
            reqOptions[key] = options.tls[key];
        });
    }

    if (parsed.protocol === 'https:' && parsed.hostname && parsed.hostname !== reqOptions.host && !net.isIP(parsed.hostname) && !reqOptions.servername) {
        reqOptions.servername = parsed.hostname;
    }

    try {
        req = handler.request(reqOptions);
    } catch (E) {
        finished = true;
        setImmediate(() => {
            E.type = 'FETCH';
            E.sourceUrl = url;
            fetchRes.emit('error', E);
        });
        return fetchRes;
    }

    if (options.timeout) {
        req.setTimeout(options.timeout, () => {
            if (finished) {
                return;
            }
            finished = true;
            req.abort();
            let err = new Error('Request Timeout');
            err.type = 'FETCH';
            err.sourceUrl = url;
            fetchRes.emit('error', err);
        });
    }

    req.on('error', err => {
        if (finished) {
            return;
        }
        finished = true;
        err.type = 'FETCH';
        err.sourceUrl = url;
        fetchRes.emit('error', err);
    });

    req.on('response', res => {
        let inflate;

        if (finished) {
            return;
        }

        switch (res.headers['content-encoding']) {
            case 'gzip':
            case 'deflate':
                inflate = zlib.createUnzip();
                break;
        }

        if (res.headers['set-cookie']) {
            [].concat(res.headers['set-cookie'] || []).forEach(cookie => {
                options.cookies.set(cookie, url);
            });
        }

        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            // redirect
            options.redirects++;
            if (options.redirects > options.maxRedirects) {
                finished = true;
                let err = new Error('Maximum redirect count exceeded');
                err.type = 'FETCH';
                err.sourceUrl = url;
                fetchRes.emit('error', err);
                req.abort();
                return;
            }
            // redirect does not include POST body
            options.method = 'GET';
            options.body = false;
            return nmfetch(urllib.resolve(url, res.headers.location), options);
        }

        fetchRes.statusCode = res.statusCode;
        fetchRes.headers = res.headers;

        if (res.statusCode >= 300 && !options.allowErrorResponse) {
            finished = true;
            let err = new Error('Invalid status code ' + res.statusCode);
            err.type = 'FETCH';
            err.sourceUrl = url;
            fetchRes.emit('error', err);
            req.abort();
            return;
        }

        res.on('error', err => {
            if (finished) {
                return;
            }
            finished = true;
            err.type = 'FETCH';
            err.sourceUrl = url;
            fetchRes.emit('error', err);
            req.abort();
        });

        if (inflate) {
            res.pipe(inflate).pipe(fetchRes);
            inflate.on('error', err => {
                if (finished) {
                    return;
                }
                finished = true;
                err.type = 'FETCH';
                err.sourceUrl = url;
                fetchRes.emit('error', err);
                req.abort();
            });
        } else {
            res.pipe(fetchRes);
        }
    });

    setImmediate(() => {
        if (body) {
            try {
                if (typeof body.pipe === 'function') {
                    return body.pipe(req);
                } else {
                    req.write(body);
                }
            } catch (err) {
                finished = true;
                err.type = 'FETCH';
                err.sourceUrl = url;
                fetchRes.emit('error', err);
                return;
            }
        }
        req.end();
    });

    return fetchRes;
}


/***/ }),

/***/ 3819:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const packageData = __nccwpck_require__(4129);
const shared = __nccwpck_require__(2673);

/**
 * Generates a Transport object to generate JSON output
 *
 * @constructor
 * @param {Object} optional config parameter
 */
class JSONTransport {
    constructor(options) {
        options = options || {};

        this.options = options || {};

        this.name = 'JSONTransport';
        this.version = packageData.version;

        this.logger = shared.getLogger(this.options, {
            component: this.options.component || 'json-transport'
        });
    }

    /**
     * <p>Compiles a mailcomposer message and forwards it to handler that sends it.</p>
     *
     * @param {Object} emailMessage MailComposer object
     * @param {Function} callback Callback function to run when the sending is completed
     */
    send(mail, done) {
        // Sendmail strips this header line by itself
        mail.message.keepBcc = true;

        let envelope = mail.data.envelope || mail.message.getEnvelope();
        let messageId = mail.message.messageId();

        let recipients = [].concat(envelope.to || []);
        if (recipients.length > 3) {
            recipients.push('...and ' + recipients.splice(2).length + ' more');
        }
        this.logger.info(
            {
                tnx: 'send',
                messageId
            },
            'Composing JSON structure of %s to <%s>',
            messageId,
            recipients.join(', ')
        );

        setImmediate(() => {
            mail.normalize((err, data) => {
                if (err) {
                    this.logger.error(
                        {
                            err,
                            tnx: 'send',
                            messageId
                        },
                        'Failed building JSON structure for %s. %s',
                        messageId,
                        err.message
                    );
                    return done(err);
                }

                delete data.envelope;
                delete data.normalizedHeaders;

                return done(null, {
                    envelope,
                    messageId,
                    message: this.options.skipEncoding ? data : JSON.stringify(data)
                });
            });
        });
    }
}

module.exports = JSONTransport;


/***/ }),

/***/ 1694:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/* eslint no-undefined: 0 */



const MimeNode = __nccwpck_require__(8509);
const mimeFuncs = __nccwpck_require__(994);
const parseDataURI = (__nccwpck_require__(2673).parseDataURI);

/**
 * Creates the object for composing a MimeNode instance out from the mail options
 *
 * @constructor
 * @param {Object} mail Mail options
 */
class MailComposer {
    constructor(mail) {
        this.mail = mail || {};
        this.message = false;
    }

    /**
     * Builds MimeNode instance
     */
    compile() {
        this._alternatives = this.getAlternatives();
        this._htmlNode = this._alternatives.filter(alternative => /^text\/html\b/i.test(alternative.contentType)).pop();
        this._attachments = this.getAttachments(!!this._htmlNode);

        this._useRelated = !!(this._htmlNode && this._attachments.related.length);
        this._useAlternative = this._alternatives.length > 1;
        this._useMixed = this._attachments.attached.length > 1 || (this._alternatives.length && this._attachments.attached.length === 1);

        // Compose MIME tree
        if (this.mail.raw) {
            this.message = new MimeNode('message/rfc822', { newline: this.mail.newline }).setRaw(this.mail.raw);
        } else if (this._useMixed) {
            this.message = this._createMixed();
        } else if (this._useAlternative) {
            this.message = this._createAlternative();
        } else if (this._useRelated) {
            this.message = this._createRelated();
        } else {
            this.message = this._createContentNode(
                false,
                []
                    .concat(this._alternatives || [])
                    .concat(this._attachments.attached || [])
                    .shift() || {
                    contentType: 'text/plain',
                    content: ''
                }
            );
        }

        // Add custom headers
        if (this.mail.headers) {
            this.message.addHeader(this.mail.headers);
        }

        // Add headers to the root node, always overrides custom headers
        ['from', 'sender', 'to', 'cc', 'bcc', 'reply-to', 'in-reply-to', 'references', 'subject', 'message-id', 'date'].forEach(header => {
            let key = header.replace(/-(\w)/g, (o, c) => c.toUpperCase());
            if (this.mail[key]) {
                this.message.setHeader(header, this.mail[key]);
            }
        });

        // Sets custom envelope
        if (this.mail.envelope) {
            this.message.setEnvelope(this.mail.envelope);
        }

        // ensure Message-Id value
        this.message.messageId();

        return this.message;
    }

    /**
     * List all attachments. Resulting attachment objects can be used as input for MimeNode nodes
     *
     * @param {Boolean} findRelated If true separate related attachments from attached ones
     * @returns {Object} An object of arrays (`related` and `attached`)
     */
    getAttachments(findRelated) {
        let icalEvent, eventObject;
        let attachments = [].concat(this.mail.attachments || []).map((attachment, i) => {
            let data;
            let isMessageNode = /^message\//i.test(attachment.contentType);

            if (/^data:/i.test(attachment.path || attachment.href)) {
                attachment = this._processDataUrl(attachment);
            }

            let contentType = attachment.contentType || mimeFuncs.detectMimeType(attachment.filename || attachment.path || attachment.href || 'bin');
            let isImage = /^image\//i.test(contentType);
            let contentDisposition = attachment.contentDisposition || (isMessageNode || (isImage && attachment.cid) ? 'inline' : 'attachment');

            data = {
                contentType,
                contentDisposition,
                contentTransferEncoding: 'contentTransferEncoding' in attachment ? attachment.contentTransferEncoding : 'base64'
            };

            if (attachment.filename) {
                data.filename = attachment.filename;
            } else if (!isMessageNode && attachment.filename !== false) {
                data.filename = (attachment.path || attachment.href || '').split('/').pop().split('?').shift() || 'attachment-' + (i + 1);
                if (data.filename.indexOf('.') < 0) {
                    data.filename += '.' + mimeFuncs.detectExtension(data.contentType);
                }
            }

            if (/^https?:\/\//i.test(attachment.path)) {
                attachment.href = attachment.path;
                attachment.path = undefined;
            }

            if (attachment.cid) {
                data.cid = attachment.cid;
            }

            if (attachment.raw) {
                data.raw = attachment.raw;
            } else if (attachment.path) {
                data.content = {
                    path: attachment.path
                };
            } else if (attachment.href) {
                data.content = {
                    href: attachment.href,
                    httpHeaders: attachment.httpHeaders
                };
            } else {
                data.content = attachment.content || '';
            }

            if (attachment.encoding) {
                data.encoding = attachment.encoding;
            }

            if (attachment.headers) {
                data.headers = attachment.headers;
            }

            return data;
        });

        if (this.mail.icalEvent) {
            if (
                typeof this.mail.icalEvent === 'object' &&
                (this.mail.icalEvent.content || this.mail.icalEvent.path || this.mail.icalEvent.href || this.mail.icalEvent.raw)
            ) {
                icalEvent = this.mail.icalEvent;
            } else {
                icalEvent = {
                    content: this.mail.icalEvent
                };
            }

            eventObject = {};
            Object.keys(icalEvent).forEach(key => {
                eventObject[key] = icalEvent[key];
            });

            eventObject.contentType = 'application/ics';
            if (!eventObject.headers) {
                eventObject.headers = {};
            }
            eventObject.filename = eventObject.filename || 'invite.ics';
            eventObject.headers['Content-Disposition'] = 'attachment';
            eventObject.headers['Content-Transfer-Encoding'] = 'base64';
        }

        if (!findRelated) {
            return {
                attached: attachments.concat(eventObject || []),
                related: []
            };
        } else {
            return {
                attached: attachments.filter(attachment => !attachment.cid).concat(eventObject || []),
                related: attachments.filter(attachment => !!attachment.cid)
            };
        }
    }

    /**
     * List alternatives. Resulting objects can be used as input for MimeNode nodes
     *
     * @returns {Array} An array of alternative elements. Includes the `text` and `html` values as well
     */
    getAlternatives() {
        let alternatives = [],
            text,
            html,
            watchHtml,
            amp,
            icalEvent,
            eventObject;

        if (this.mail.text) {
            if (typeof this.mail.text === 'object' && (this.mail.text.content || this.mail.text.path || this.mail.text.href || this.mail.text.raw)) {
                text = this.mail.text;
            } else {
                text = {
                    content: this.mail.text
                };
            }
            text.contentType = 'text/plain; charset=utf-8';
        }

        if (this.mail.watchHtml) {
            if (
                typeof this.mail.watchHtml === 'object' &&
                (this.mail.watchHtml.content || this.mail.watchHtml.path || this.mail.watchHtml.href || this.mail.watchHtml.raw)
            ) {
                watchHtml = this.mail.watchHtml;
            } else {
                watchHtml = {
                    content: this.mail.watchHtml
                };
            }
            watchHtml.contentType = 'text/watch-html; charset=utf-8';
        }

        if (this.mail.amp) {
            if (typeof this.mail.amp === 'object' && (this.mail.amp.content || this.mail.amp.path || this.mail.amp.href || this.mail.amp.raw)) {
                amp = this.mail.amp;
            } else {
                amp = {
                    content: this.mail.amp
                };
            }
            amp.contentType = 'text/x-amp-html; charset=utf-8';
        }

        // NB! when including attachments with a calendar alternative you might end up in a blank screen on some clients
        if (this.mail.icalEvent) {
            if (
                typeof this.mail.icalEvent === 'object' &&
                (this.mail.icalEvent.content || this.mail.icalEvent.path || this.mail.icalEvent.href || this.mail.icalEvent.raw)
            ) {
                icalEvent = this.mail.icalEvent;
            } else {
                icalEvent = {
                    content: this.mail.icalEvent
                };
            }

            eventObject = {};
            Object.keys(icalEvent).forEach(key => {
                eventObject[key] = icalEvent[key];
            });

            if (eventObject.content && typeof eventObject.content === 'object') {
                // we are going to have the same attachment twice, so mark this to be
                // resolved just once
                eventObject.content._resolve = true;
            }

            eventObject.filename = false;
            eventObject.contentType = 'text/calendar; charset=utf-8; method=' + (eventObject.method || 'PUBLISH').toString().trim().toUpperCase();
            if (!eventObject.headers) {
                eventObject.headers = {};
            }
        }

        if (this.mail.html) {
            if (typeof this.mail.html === 'object' && (this.mail.html.content || this.mail.html.path || this.mail.html.href || this.mail.html.raw)) {
                html = this.mail.html;
            } else {
                html = {
                    content: this.mail.html
                };
            }
            html.contentType = 'text/html; charset=utf-8';
        }

        []
            .concat(text || [])
            .concat(watchHtml || [])
            .concat(amp || [])
            .concat(html || [])
            .concat(eventObject || [])
            .concat(this.mail.alternatives || [])
            .forEach(alternative => {
                let data;

                if (/^data:/i.test(alternative.path || alternative.href)) {
                    alternative = this._processDataUrl(alternative);
                }

                data = {
                    contentType: alternative.contentType || mimeFuncs.detectMimeType(alternative.filename || alternative.path || alternative.href || 'txt'),
                    contentTransferEncoding: alternative.contentTransferEncoding
                };

                if (alternative.filename) {
                    data.filename = alternative.filename;
                }

                if (/^https?:\/\//i.test(alternative.path)) {
                    alternative.href = alternative.path;
                    alternative.path = undefined;
                }

                if (alternative.raw) {
                    data.raw = alternative.raw;
                } else if (alternative.path) {
                    data.content = {
                        path: alternative.path
                    };
                } else if (alternative.href) {
                    data.content = {
                        href: alternative.href
                    };
                } else {
                    data.content = alternative.content || '';
                }

                if (alternative.encoding) {
                    data.encoding = alternative.encoding;
                }

                if (alternative.headers) {
                    data.headers = alternative.headers;
                }

                alternatives.push(data);
            });

        return alternatives;
    }

    /**
     * Builds multipart/mixed node. It should always contain different type of elements on the same level
     * eg. text + attachments
     *
     * @param {Object} parentNode Parent for this note. If it does not exist, a root node is created
     * @returns {Object} MimeNode node element
     */
    _createMixed(parentNode) {
        let node;

        if (!parentNode) {
            node = new MimeNode('multipart/mixed', {
                baseBoundary: this.mail.baseBoundary,
                textEncoding: this.mail.textEncoding,
                boundaryPrefix: this.mail.boundaryPrefix,
                disableUrlAccess: this.mail.disableUrlAccess,
                disableFileAccess: this.mail.disableFileAccess,
                normalizeHeaderKey: this.mail.normalizeHeaderKey,
                newline: this.mail.newline
            });
        } else {
            node = parentNode.createChild('multipart/mixed', {
                disableUrlAccess: this.mail.disableUrlAccess,
                disableFileAccess: this.mail.disableFileAccess,
                normalizeHeaderKey: this.mail.normalizeHeaderKey,
                newline: this.mail.newline
            });
        }

        if (this._useAlternative) {
            this._createAlternative(node);
        } else if (this._useRelated) {
            this._createRelated(node);
        }

        []
            .concat((!this._useAlternative && this._alternatives) || [])
            .concat(this._attachments.attached || [])
            .forEach(element => {
                // if the element is a html node from related subpart then ignore it
                if (!this._useRelated || element !== this._htmlNode) {
                    this._createContentNode(node, element);
                }
            });

        return node;
    }

    /**
     * Builds multipart/alternative node. It should always contain same type of elements on the same level
     * eg. text + html view of the same data
     *
     * @param {Object} parentNode Parent for this note. If it does not exist, a root node is created
     * @returns {Object} MimeNode node element
     */
    _createAlternative(parentNode) {
        let node;

        if (!parentNode) {
            node = new MimeNode('multipart/alternative', {
                baseBoundary: this.mail.baseBoundary,
                textEncoding: this.mail.textEncoding,
                boundaryPrefix: this.mail.boundaryPrefix,
                disableUrlAccess: this.mail.disableUrlAccess,
                disableFileAccess: this.mail.disableFileAccess,
                normalizeHeaderKey: this.mail.normalizeHeaderKey,
                newline: this.mail.newline
            });
        } else {
            node = parentNode.createChild('multipart/alternative', {
                disableUrlAccess: this.mail.disableUrlAccess,
                disableFileAccess: this.mail.disableFileAccess,
                normalizeHeaderKey: this.mail.normalizeHeaderKey,
                newline: this.mail.newline
            });
        }

        this._alternatives.forEach(alternative => {
            if (this._useRelated && this._htmlNode === alternative) {
                this._createRelated(node);
            } else {
                this._createContentNode(node, alternative);
            }
        });

        return node;
    }

    /**
     * Builds multipart/related node. It should always contain html node with related attachments
     *
     * @param {Object} parentNode Parent for this note. If it does not exist, a root node is created
     * @returns {Object} MimeNode node element
     */
    _createRelated(parentNode) {
        let node;

        if (!parentNode) {
            node = new MimeNode('multipart/related; type="text/html"', {
                baseBoundary: this.mail.baseBoundary,
                textEncoding: this.mail.textEncoding,
                boundaryPrefix: this.mail.boundaryPrefix,
                disableUrlAccess: this.mail.disableUrlAccess,
                disableFileAccess: this.mail.disableFileAccess,
                normalizeHeaderKey: this.mail.normalizeHeaderKey,
                newline: this.mail.newline
            });
        } else {
            node = parentNode.createChild('multipart/related; type="text/html"', {
                disableUrlAccess: this.mail.disableUrlAccess,
                disableFileAccess: this.mail.disableFileAccess,
                normalizeHeaderKey: this.mail.normalizeHeaderKey,
                newline: this.mail.newline
            });
        }

        this._createContentNode(node, this._htmlNode);

        this._attachments.related.forEach(alternative => this._createContentNode(node, alternative));

        return node;
    }

    /**
     * Creates a regular node with contents
     *
     * @param {Object} parentNode Parent for this note. If it does not exist, a root node is created
     * @param {Object} element Node data
     * @returns {Object} MimeNode node element
     */
    _createContentNode(parentNode, element) {
        element = element || {};
        element.content = element.content || '';

        let node;
        let encoding = (element.encoding || 'utf8')
            .toString()
            .toLowerCase()
            .replace(/[-_\s]/g, '');

        if (!parentNode) {
            node = new MimeNode(element.contentType, {
                filename: element.filename,
                baseBoundary: this.mail.baseBoundary,
                textEncoding: this.mail.textEncoding,
                boundaryPrefix: this.mail.boundaryPrefix,
                disableUrlAccess: this.mail.disableUrlAccess,
                disableFileAccess: this.mail.disableFileAccess,
                normalizeHeaderKey: this.mail.normalizeHeaderKey,
                newline: this.mail.newline
            });
        } else {
            node = parentNode.createChild(element.contentType, {
                filename: element.filename,
                textEncoding: this.mail.textEncoding,
                disableUrlAccess: this.mail.disableUrlAccess,
                disableFileAccess: this.mail.disableFileAccess,
                normalizeHeaderKey: this.mail.normalizeHeaderKey,
                newline: this.mail.newline
            });
        }

        // add custom headers
        if (element.headers) {
            node.addHeader(element.headers);
        }

        if (element.cid) {
            node.setHeader('Content-Id', '<' + element.cid.replace(/[<>]/g, '') + '>');
        }

        if (element.contentTransferEncoding) {
            node.setHeader('Content-Transfer-Encoding', element.contentTransferEncoding);
        } else if (this.mail.encoding && /^text\//i.test(element.contentType)) {
            node.setHeader('Content-Transfer-Encoding', this.mail.encoding);
        }

        if (!/^text\//i.test(element.contentType) || element.contentDisposition) {
            node.setHeader(
                'Content-Disposition',
                element.contentDisposition || (element.cid && /^image\//i.test(element.contentType) ? 'inline' : 'attachment')
            );
        }

        if (typeof element.content === 'string' && !['utf8', 'usascii', 'ascii'].includes(encoding)) {
            element.content = Buffer.from(element.content, encoding);
        }

        // prefer pregenerated raw content
        if (element.raw) {
            node.setRaw(element.raw);
        } else {
            node.setContent(element.content);
        }

        return node;
    }

    /**
     * Parses data uri and converts it to a Buffer
     *
     * @param {Object} element Content element
     * @return {Object} Parsed element
     */
    _processDataUrl(element) {
        let parsedDataUri;
        if ((element.path || element.href).match(/^data:/)) {
            parsedDataUri = parseDataURI(element.path || element.href);
        }

        if (!parsedDataUri) {
            return element;
        }

        element.content = parsedDataUri.data;
        element.contentType = element.contentType || parsedDataUri.contentType;

        if ('path' in element) {
            element.path = false;
        }

        if ('href' in element) {
            element.href = false;
        }

        return element;
    }
}

module.exports = MailComposer;


/***/ }),

/***/ 833:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const EventEmitter = __nccwpck_require__(2361);
const shared = __nccwpck_require__(2673);
const mimeTypes = __nccwpck_require__(7730);
const MailComposer = __nccwpck_require__(1694);
const DKIM = __nccwpck_require__(7757);
const httpProxyClient = __nccwpck_require__(7643);
const util = __nccwpck_require__(3837);
const urllib = __nccwpck_require__(7310);
const packageData = __nccwpck_require__(4129);
const MailMessage = __nccwpck_require__(5399);
const net = __nccwpck_require__(1808);
const dns = __nccwpck_require__(9523);
const crypto = __nccwpck_require__(6113);

/**
 * Creates an object for exposing the Mail API
 *
 * @constructor
 * @param {Object} transporter Transport object instance to pass the mails to
 */
class Mail extends EventEmitter {
    constructor(transporter, options, defaults) {
        super();

        this.options = options || {};
        this._defaults = defaults || {};

        this._defaultPlugins = {
            compile: [(...args) => this._convertDataImages(...args)],
            stream: []
        };

        this._userPlugins = {
            compile: [],
            stream: []
        };

        this.meta = new Map();

        this.dkim = this.options.dkim ? new DKIM(this.options.dkim) : false;

        this.transporter = transporter;
        this.transporter.mailer = this;

        this.logger = shared.getLogger(this.options, {
            component: this.options.component || 'mail'
        });

        this.logger.debug(
            {
                tnx: 'create'
            },
            'Creating transport: %s',
            this.getVersionString()
        );

        // setup emit handlers for the transporter
        if (typeof this.transporter.on === 'function') {
            // deprecated log interface
            this.transporter.on('log', log => {
                this.logger.debug(
                    {
                        tnx: 'transport'
                    },
                    '%s: %s',
                    log.type,
                    log.message
                );
            });

            // transporter errors
            this.transporter.on('error', err => {
                this.logger.error(
                    {
                        err,
                        tnx: 'transport'
                    },
                    'Transport Error: %s',
                    err.message
                );
                this.emit('error', err);
            });

            // indicates if the sender has became idle
            this.transporter.on('idle', (...args) => {
                this.emit('idle', ...args);
            });
        }

        /**
         * Optional methods passed to the underlying transport object
         */
        ['close', 'isIdle', 'verify'].forEach(method => {
            this[method] = (...args) => {
                if (typeof this.transporter[method] === 'function') {
                    if (method === 'verify' && typeof this.getSocket === 'function') {
                        this.transporter.getSocket = this.getSocket;
                        this.getSocket = false;
                    }
                    return this.transporter[method](...args);
                } else {
                    this.logger.warn(
                        {
                            tnx: 'transport',
                            methodName: method
                        },
                        'Non existing method %s called for transport',
                        method
                    );
                    return false;
                }
            };
        });

        // setup proxy handling
        if (this.options.proxy && typeof this.options.proxy === 'string') {
            this.setupProxy(this.options.proxy);
        }
    }

    use(step, plugin) {
        step = (step || '').toString();
        if (!this._userPlugins.hasOwnProperty(step)) {
            this._userPlugins[step] = [plugin];
        } else {
            this._userPlugins[step].push(plugin);
        }

        return this;
    }

    /**
     * Sends an email using the preselected transport object
     *
     * @param {Object} data E-data description
     * @param {Function?} callback Callback to run once the sending succeeded or failed
     */
    sendMail(data, callback = null) {
        let promise;

        if (!callback) {
            promise = new Promise((resolve, reject) => {
                callback = shared.callbackPromise(resolve, reject);
            });
        }

        if (typeof this.getSocket === 'function') {
            this.transporter.getSocket = this.getSocket;
            this.getSocket = false;
        }

        let mail = new MailMessage(this, data);

        this.logger.debug(
            {
                tnx: 'transport',
                name: this.transporter.name,
                version: this.transporter.version,
                action: 'send'
            },
            'Sending mail using %s/%s',
            this.transporter.name,
            this.transporter.version
        );

        this._processPlugins('compile', mail, err => {
            if (err) {
                this.logger.error(
                    {
                        err,
                        tnx: 'plugin',
                        action: 'compile'
                    },
                    'PluginCompile Error: %s',
                    err.message
                );
                return callback(err);
            }

            mail.message = new MailComposer(mail.data).compile();

            mail.setMailerHeader();
            mail.setPriorityHeaders();
            mail.setListHeaders();

            this._processPlugins('stream', mail, err => {
                if (err) {
                    this.logger.error(
                        {
                            err,
                            tnx: 'plugin',
                            action: 'stream'
                        },
                        'PluginStream Error: %s',
                        err.message
                    );
                    return callback(err);
                }

                if (mail.data.dkim || this.dkim) {
                    mail.message.processFunc(input => {
                        let dkim = mail.data.dkim ? new DKIM(mail.data.dkim) : this.dkim;
                        this.logger.debug(
                            {
                                tnx: 'DKIM',
                                messageId: mail.message.messageId(),
                                dkimDomains: dkim.keys.map(key => key.keySelector + '.' + key.domainName).join(', ')
                            },
                            'Signing outgoing message with %s keys',
                            dkim.keys.length
                        );
                        return dkim.sign(input, mail.data._dkim);
                    });
                }

                this.transporter.send(mail, (...args) => {
                    if (args[0]) {
                        this.logger.error(
                            {
                                err: args[0],
                                tnx: 'transport',
                                action: 'send'
                            },
                            'Send Error: %s',
                            args[0].message
                        );
                    }
                    callback(...args);
                });
            });
        });

        return promise;
    }

    getVersionString() {
        return util.format('%s (%s; +%s; %s/%s)', packageData.name, packageData.version, packageData.homepage, this.transporter.name, this.transporter.version);
    }

    _processPlugins(step, mail, callback) {
        step = (step || '').toString();

        if (!this._userPlugins.hasOwnProperty(step)) {
            return callback();
        }

        let userPlugins = this._userPlugins[step] || [];
        let defaultPlugins = this._defaultPlugins[step] || [];

        if (userPlugins.length) {
            this.logger.debug(
                {
                    tnx: 'transaction',
                    pluginCount: userPlugins.length,
                    step
                },
                'Using %s plugins for %s',
                userPlugins.length,
                step
            );
        }

        if (userPlugins.length + defaultPlugins.length === 0) {
            return callback();
        }

        let pos = 0;
        let block = 'default';
        let processPlugins = () => {
            let curplugins = block === 'default' ? defaultPlugins : userPlugins;
            if (pos >= curplugins.length) {
                if (block === 'default' && userPlugins.length) {
                    block = 'user';
                    pos = 0;
                    curplugins = userPlugins;
                } else {
                    return callback();
                }
            }
            let plugin = curplugins[pos++];
            plugin(mail, err => {
                if (err) {
                    return callback(err);
                }
                processPlugins();
            });
        };

        processPlugins();
    }

    /**
     * Sets up proxy handler for a Nodemailer object
     *
     * @param {String} proxyUrl Proxy configuration url
     */
    setupProxy(proxyUrl) {
        let proxy = urllib.parse(proxyUrl);

        // setup socket handler for the mailer object
        this.getSocket = (options, callback) => {
            let protocol = proxy.protocol.replace(/:$/, '').toLowerCase();

            if (this.meta.has('proxy_handler_' + protocol)) {
                return this.meta.get('proxy_handler_' + protocol)(proxy, options, callback);
            }

            switch (protocol) {
                // Connect using a HTTP CONNECT method
                case 'http':
                case 'https':
                    httpProxyClient(proxy.href, options.port, options.host, (err, socket) => {
                        if (err) {
                            return callback(err);
                        }
                        return callback(null, {
                            connection: socket
                        });
                    });
                    return;
                case 'socks':
                case 'socks5':
                case 'socks4':
                case 'socks4a': {
                    if (!this.meta.has('proxy_socks_module')) {
                        return callback(new Error('Socks module not loaded'));
                    }
                    let connect = ipaddress => {
                        let proxyV2 = !!this.meta.get('proxy_socks_module').SocksClient;
                        let socksClient = proxyV2 ? this.meta.get('proxy_socks_module').SocksClient : this.meta.get('proxy_socks_module');
                        let proxyType = Number(proxy.protocol.replace(/\D/g, '')) || 5;
                        let connectionOpts = {
                            proxy: {
                                ipaddress,
                                port: Number(proxy.port),
                                type: proxyType
                            },
                            [proxyV2 ? 'destination' : 'target']: {
                                host: options.host,
                                port: options.port
                            },
                            command: 'connect'
                        };

                        if (proxy.auth) {
                            let username = decodeURIComponent(proxy.auth.split(':').shift());
                            let password = decodeURIComponent(proxy.auth.split(':').pop());
                            if (proxyV2) {
                                connectionOpts.proxy.userId = username;
                                connectionOpts.proxy.password = password;
                            } else if (proxyType === 4) {
                                connectionOpts.userid = username;
                            } else {
                                connectionOpts.authentication = {
                                    username,
                                    password
                                };
                            }
                        }

                        socksClient.createConnection(connectionOpts, (err, info) => {
                            if (err) {
                                return callback(err);
                            }
                            return callback(null, {
                                connection: info.socket || info
                            });
                        });
                    };

                    if (net.isIP(proxy.hostname)) {
                        return connect(proxy.hostname);
                    }

                    return dns.resolve(proxy.hostname, (err, address) => {
                        if (err) {
                            return callback(err);
                        }
                        connect(Array.isArray(address) ? address[0] : address);
                    });
                }
            }
            callback(new Error('Unknown proxy configuration'));
        };
    }

    _convertDataImages(mail, callback) {
        if ((!this.options.attachDataUrls && !mail.data.attachDataUrls) || !mail.data.html) {
            return callback();
        }
        mail.resolveContent(mail.data, 'html', (err, html) => {
            if (err) {
                return callback(err);
            }
            let cidCounter = 0;
            html = (html || '')
                .toString()
                .replace(/(<img\b[^<>]{0,1024} src\s{0,20}=[\s"']{0,20})(data:([^;]+);[^"'>\s]+)/gi, (match, prefix, dataUri, mimeType) => {
                    let cid = crypto.randomBytes(10).toString('hex') + '@localhost';
                    if (!mail.data.attachments) {
                        mail.data.attachments = [];
                    }
                    if (!Array.isArray(mail.data.attachments)) {
                        mail.data.attachments = [].concat(mail.data.attachments || []);
                    }
                    mail.data.attachments.push({
                        path: dataUri,
                        cid,
                        filename: 'image-' + ++cidCounter + '.' + mimeTypes.detectExtension(mimeType)
                    });
                    return prefix + 'cid:' + cid;
                });
            mail.data.html = html;
            callback();
        });
    }

    set(key, value) {
        return this.meta.set(key, value);
    }

    get(key) {
        return this.meta.get(key);
    }
}

module.exports = Mail;


/***/ }),

/***/ 5399:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const shared = __nccwpck_require__(2673);
const MimeNode = __nccwpck_require__(8509);
const mimeFuncs = __nccwpck_require__(994);

class MailMessage {
    constructor(mailer, data) {
        this.mailer = mailer;
        this.data = {};
        this.message = null;

        data = data || {};
        let options = mailer.options || {};
        let defaults = mailer._defaults || {};

        Object.keys(data).forEach(key => {
            this.data[key] = data[key];
        });

        this.data.headers = this.data.headers || {};

        // apply defaults
        Object.keys(defaults).forEach(key => {
            if (!(key in this.data)) {
                this.data[key] = defaults[key];
            } else if (key === 'headers') {
                // headers is a special case. Allow setting individual default headers
                Object.keys(defaults.headers).forEach(key => {
                    if (!(key in this.data.headers)) {
                        this.data.headers[key] = defaults.headers[key];
                    }
                });
            }
        });

        // force specific keys from transporter options
        ['disableFileAccess', 'disableUrlAccess', 'normalizeHeaderKey'].forEach(key => {
            if (key in options) {
                this.data[key] = options[key];
            }
        });
    }

    resolveContent(...args) {
        return shared.resolveContent(...args);
    }

    resolveAll(callback) {
        let keys = [
            [this.data, 'html'],
            [this.data, 'text'],
            [this.data, 'watchHtml'],
            [this.data, 'amp'],
            [this.data, 'icalEvent']
        ];

        if (this.data.alternatives && this.data.alternatives.length) {
            this.data.alternatives.forEach((alternative, i) => {
                keys.push([this.data.alternatives, i]);
            });
        }

        if (this.data.attachments && this.data.attachments.length) {
            this.data.attachments.forEach((attachment, i) => {
                if (!attachment.filename) {
                    attachment.filename = (attachment.path || attachment.href || '').split('/').pop().split('?').shift() || 'attachment-' + (i + 1);
                    if (attachment.filename.indexOf('.') < 0) {
                        attachment.filename += '.' + mimeFuncs.detectExtension(attachment.contentType);
                    }
                }

                if (!attachment.contentType) {
                    attachment.contentType = mimeFuncs.detectMimeType(attachment.filename || attachment.path || attachment.href || 'bin');
                }

                keys.push([this.data.attachments, i]);
            });
        }

        let mimeNode = new MimeNode();

        let addressKeys = ['from', 'to', 'cc', 'bcc', 'sender', 'replyTo'];

        addressKeys.forEach(address => {
            let value;
            if (this.message) {
                value = [].concat(mimeNode._parseAddresses(this.message.getHeader(address === 'replyTo' ? 'reply-to' : address)) || []);
            } else if (this.data[address]) {
                value = [].concat(mimeNode._parseAddresses(this.data[address]) || []);
            }
            if (value && value.length) {
                this.data[address] = value;
            } else if (address in this.data) {
                this.data[address] = null;
            }
        });

        let singleKeys = ['from', 'sender'];
        singleKeys.forEach(address => {
            if (this.data[address]) {
                this.data[address] = this.data[address].shift();
            }
        });

        let pos = 0;
        let resolveNext = () => {
            if (pos >= keys.length) {
                return callback(null, this.data);
            }
            let args = keys[pos++];
            if (!args[0] || !args[0][args[1]]) {
                return resolveNext();
            }
            shared.resolveContent(...args, (err, value) => {
                if (err) {
                    return callback(err);
                }

                let node = {
                    content: value
                };
                if (args[0][args[1]] && typeof args[0][args[1]] === 'object' && !Buffer.isBuffer(args[0][args[1]])) {
                    Object.keys(args[0][args[1]]).forEach(key => {
                        if (!(key in node) && !['content', 'path', 'href', 'raw'].includes(key)) {
                            node[key] = args[0][args[1]][key];
                        }
                    });
                }

                args[0][args[1]] = node;
                resolveNext();
            });
        };

        setImmediate(() => resolveNext());
    }

    normalize(callback) {
        let envelope = this.data.envelope || this.message.getEnvelope();
        let messageId = this.message.messageId();

        this.resolveAll((err, data) => {
            if (err) {
                return callback(err);
            }

            data.envelope = envelope;
            data.messageId = messageId;

            ['html', 'text', 'watchHtml', 'amp'].forEach(key => {
                if (data[key] && data[key].content) {
                    if (typeof data[key].content === 'string') {
                        data[key] = data[key].content;
                    } else if (Buffer.isBuffer(data[key].content)) {
                        data[key] = data[key].content.toString();
                    }
                }
            });

            if (data.icalEvent && Buffer.isBuffer(data.icalEvent.content)) {
                data.icalEvent.content = data.icalEvent.content.toString('base64');
                data.icalEvent.encoding = 'base64';
            }

            if (data.alternatives && data.alternatives.length) {
                data.alternatives.forEach(alternative => {
                    if (alternative && alternative.content && Buffer.isBuffer(alternative.content)) {
                        alternative.content = alternative.content.toString('base64');
                        alternative.encoding = 'base64';
                    }
                });
            }

            if (data.attachments && data.attachments.length) {
                data.attachments.forEach(attachment => {
                    if (attachment && attachment.content && Buffer.isBuffer(attachment.content)) {
                        attachment.content = attachment.content.toString('base64');
                        attachment.encoding = 'base64';
                    }
                });
            }

            data.normalizedHeaders = {};
            Object.keys(data.headers || {}).forEach(key => {
                let value = [].concat(data.headers[key] || []).shift();
                value = (value && value.value) || value;
                if (value) {
                    if (['references', 'in-reply-to', 'message-id', 'content-id'].includes(key)) {
                        value = this.message._encodeHeaderValue(key, value);
                    }
                    data.normalizedHeaders[key] = value;
                }
            });

            if (data.list && typeof data.list === 'object') {
                let listHeaders = this._getListHeaders(data.list);
                listHeaders.forEach(entry => {
                    data.normalizedHeaders[entry.key] = entry.value.map(val => (val && val.value) || val).join(', ');
                });
            }

            if (data.references) {
                data.normalizedHeaders.references = this.message._encodeHeaderValue('references', data.references);
            }

            if (data.inReplyTo) {
                data.normalizedHeaders['in-reply-to'] = this.message._encodeHeaderValue('in-reply-to', data.inReplyTo);
            }

            return callback(null, data);
        });
    }

    setMailerHeader() {
        if (!this.message || !this.data.xMailer) {
            return;
        }
        this.message.setHeader('X-Mailer', this.data.xMailer);
    }

    setPriorityHeaders() {
        if (!this.message || !this.data.priority) {
            return;
        }
        switch ((this.data.priority || '').toString().toLowerCase()) {
            case 'high':
                this.message.setHeader('X-Priority', '1 (Highest)');
                this.message.setHeader('X-MSMail-Priority', 'High');
                this.message.setHeader('Importance', 'High');
                break;
            case 'low':
                this.message.setHeader('X-Priority', '5 (Lowest)');
                this.message.setHeader('X-MSMail-Priority', 'Low');
                this.message.setHeader('Importance', 'Low');
                break;
            default:
            // do not add anything, since all messages are 'Normal' by default
        }
    }

    setListHeaders() {
        if (!this.message || !this.data.list || typeof this.data.list !== 'object') {
            return;
        }
        // add optional List-* headers
        if (this.data.list && typeof this.data.list === 'object') {
            this._getListHeaders(this.data.list).forEach(listHeader => {
                listHeader.value.forEach(value => {
                    this.message.addHeader(listHeader.key, value);
                });
            });
        }
    }

    _getListHeaders(listData) {
        // make sure an url looks like <protocol:url>
        return Object.keys(listData).map(key => ({
            key: 'list-' + key.toLowerCase().trim(),
            value: [].concat(listData[key] || []).map(value => ({
                prepared: true,
                foldLines: true,
                value: []
                    .concat(value || [])
                    .map(value => {
                        if (typeof value === 'string') {
                            value = {
                                url: value
                            };
                        }

                        if (value && value.url) {
                            if (key.toLowerCase().trim() === 'id') {
                                // List-ID: "comment" <domain>
                                let comment = value.comment || '';
                                if (mimeFuncs.isPlainText(comment)) {
                                    comment = '"' + comment + '"';
                                } else {
                                    comment = mimeFuncs.encodeWord(comment);
                                }

                                return (value.comment ? comment + ' ' : '') + this._formatListUrl(value.url).replace(/^<[^:]+\/{,2}/, '');
                            }

                            // List-*: <http://domain> (comment)
                            let comment = value.comment || '';
                            if (!mimeFuncs.isPlainText(comment)) {
                                comment = mimeFuncs.encodeWord(comment);
                            }

                            return this._formatListUrl(value.url) + (value.comment ? ' (' + comment + ')' : '');
                        }

                        return '';
                    })
                    .filter(value => value)
                    .join(', ')
            }))
        }));
    }

    _formatListUrl(url) {
        url = url.replace(/[\s<]+|[\s>]+/g, '');
        if (/^(https?|mailto|ftp):/.test(url)) {
            return '<' + url + '>';
        }
        if (/^[^@]+@[^@]+$/.test(url)) {
            return '<mailto:' + url + '>';
        }

        return '<http://' + url + '>';
    }
}

module.exports = MailMessage;


/***/ }),

/***/ 994:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/* eslint no-control-regex:0 */



const base64 = __nccwpck_require__(4017);
const qp = __nccwpck_require__(9716);
const mimeTypes = __nccwpck_require__(7730);

module.exports = {
    /**
     * Checks if a value is plaintext string (uses only printable 7bit chars)
     *
     * @param {String} value String to be tested
     * @returns {Boolean} true if it is a plaintext string
     */
    isPlainText(value, isParam) {
        const re = isParam ? /[\x00-\x08\x0b\x0c\x0e-\x1f"\u0080-\uFFFF]/ : /[\x00-\x08\x0b\x0c\x0e-\x1f\u0080-\uFFFF]/;
        if (typeof value !== 'string' || re.test(value)) {
            return false;
        } else {
            return true;
        }
    },

    /**
     * Checks if a multi line string containes lines longer than the selected value.
     *
     * Useful when detecting if a mail message needs any processing at all –
     * if only plaintext characters are used and lines are short, then there is
     * no need to encode the values in any way. If the value is plaintext but has
     * longer lines then allowed, then use format=flowed
     *
     * @param {Number} lineLength Max line length to check for
     * @returns {Boolean} Returns true if there is at least one line longer than lineLength chars
     */
    hasLongerLines(str, lineLength) {
        if (str.length > 128 * 1024) {
            // do not test strings longer than 128kB
            return true;
        }
        return new RegExp('^.{' + (lineLength + 1) + ',}', 'm').test(str);
    },

    /**
     * Encodes a string or an Buffer to an UTF-8 MIME Word (rfc2047)
     *
     * @param {String|Buffer} data String to be encoded
     * @param {String} mimeWordEncoding='Q' Encoding for the mime word, either Q or B
     * @param {Number} [maxLength=0] If set, split mime words into several chunks if needed
     * @return {String} Single or several mime words joined together
     */
    encodeWord(data, mimeWordEncoding, maxLength) {
        mimeWordEncoding = (mimeWordEncoding || 'Q').toString().toUpperCase().trim().charAt(0);
        maxLength = maxLength || 0;

        let encodedStr;
        let toCharset = 'UTF-8';

        if (maxLength && maxLength > 7 + toCharset.length) {
            maxLength -= 7 + toCharset.length;
        }

        if (mimeWordEncoding === 'Q') {
            // https://tools.ietf.org/html/rfc2047#section-5 rule (3)
            encodedStr = qp.encode(data).replace(/[^a-z0-9!*+\-/=]/gi, chr => {
                let ord = chr.charCodeAt(0).toString(16).toUpperCase();
                if (chr === ' ') {
                    return '_';
                } else {
                    return '=' + (ord.length === 1 ? '0' + ord : ord);
                }
            });
        } else if (mimeWordEncoding === 'B') {
            encodedStr = typeof data === 'string' ? data : base64.encode(data);
            maxLength = maxLength ? Math.max(3, ((maxLength - (maxLength % 4)) / 4) * 3) : 0;
        }

        if (maxLength && (mimeWordEncoding !== 'B' ? encodedStr : base64.encode(data)).length > maxLength) {
            if (mimeWordEncoding === 'Q') {
                encodedStr = this.splitMimeEncodedString(encodedStr, maxLength).join('?= =?' + toCharset + '?' + mimeWordEncoding + '?');
            } else {
                // RFC2047 6.3 (2) states that encoded-word must include an integral number of characters, so no chopping unicode sequences
                let parts = [];
                let lpart = '';
                for (let i = 0, len = encodedStr.length; i < len; i++) {
                    let chr = encodedStr.charAt(i);

                    if (/[\ud83c\ud83d\ud83e]/.test(chr) && i < len - 1) {
                        // composite emoji byte, so add the next byte as well
                        chr += encodedStr.charAt(++i);
                    }

                    // check if we can add this character to the existing string
                    // without breaking byte length limit
                    if (Buffer.byteLength(lpart + chr) <= maxLength || i === 0) {
                        lpart += chr;
                    } else {
                        // we hit the length limit, so push the existing string and start over
                        parts.push(base64.encode(lpart));
                        lpart = chr;
                    }
                }
                if (lpart) {
                    parts.push(base64.encode(lpart));
                }

                if (parts.length > 1) {
                    encodedStr = parts.join('?= =?' + toCharset + '?' + mimeWordEncoding + '?');
                } else {
                    encodedStr = parts.join('');
                }
            }
        } else if (mimeWordEncoding === 'B') {
            encodedStr = base64.encode(data);
        }

        return '=?' + toCharset + '?' + mimeWordEncoding + '?' + encodedStr + (encodedStr.substr(-2) === '?=' ? '' : '?=');
    },

    /**
     * Finds word sequences with non ascii text and converts these to mime words
     *
     * @param {String} value String to be encoded
     * @param {String} mimeWordEncoding='Q' Encoding for the mime word, either Q or B
     * @param {Number} [maxLength=0] If set, split mime words into several chunks if needed
     * @param {Boolean} [encodeAll=false] If true and the value needs encoding then encodes entire string, not just the smallest match
     * @return {String} String with possible mime words
     */
    encodeWords(value, mimeWordEncoding, maxLength, encodeAll) {
        maxLength = maxLength || 0;

        let encodedValue;

        // find first word with a non-printable ascii or special symbol in it
        let firstMatch = value.match(/(?:^|\s)([^\s]*["\u0080-\uFFFF])/);
        if (!firstMatch) {
            return value;
        }

        if (encodeAll) {
            // if it is requested to encode everything or the string contains something that resebles encoded word, then encode everything

            return this.encodeWord(value, mimeWordEncoding, maxLength);
        }

        // find the last word with a non-printable ascii in it
        let lastMatch = value.match(/(["\u0080-\uFFFF][^\s]*)[^"\u0080-\uFFFF]*$/);
        if (!lastMatch) {
            // should not happen
            return value;
        }

        let startIndex =
            firstMatch.index +
            (
                firstMatch[0].match(/[^\s]/) || {
                    index: 0
                }
            ).index;
        let endIndex = lastMatch.index + (lastMatch[1] || '').length;

        encodedValue =
            (startIndex ? value.substr(0, startIndex) : '') +
            this.encodeWord(value.substring(startIndex, endIndex), mimeWordEncoding || 'Q', maxLength) +
            (endIndex < value.length ? value.substr(endIndex) : '');

        return encodedValue;
    },

    /**
     * Joins parsed header value together as 'value; param1=value1; param2=value2'
     * PS: We are following RFC 822 for the list of special characters that we need to keep in quotes.
     *      Refer: https://www.w3.org/Protocols/rfc1341/4_Content-Type.html
     * @param {Object} structured Parsed header value
     * @return {String} joined header value
     */
    buildHeaderValue(structured) {
        let paramsArray = [];

        Object.keys(structured.params || {}).forEach(param => {
            // filename might include unicode characters so it is a special case
            // other values probably do not
            let value = structured.params[param];
            if (!this.isPlainText(value, true) || value.length >= 75) {
                this.buildHeaderParam(param, value, 50).forEach(encodedParam => {
                    if (!/[\s"\\;:/=(),<>@[\]?]|^[-']|'$/.test(encodedParam.value) || encodedParam.key.substr(-1) === '*') {
                        paramsArray.push(encodedParam.key + '=' + encodedParam.value);
                    } else {
                        paramsArray.push(encodedParam.key + '=' + JSON.stringify(encodedParam.value));
                    }
                });
            } else if (/[\s'"\\;:/=(),<>@[\]?]|^-/.test(value)) {
                paramsArray.push(param + '=' + JSON.stringify(value));
            } else {
                paramsArray.push(param + '=' + value);
            }
        });

        return structured.value + (paramsArray.length ? '; ' + paramsArray.join('; ') : '');
    },

    /**
     * Encodes a string or an Buffer to an UTF-8 Parameter Value Continuation encoding (rfc2231)
     * Useful for splitting long parameter values.
     *
     * For example
     *      title="unicode string"
     * becomes
     *     title*0*=utf-8''unicode
     *     title*1*=%20string
     *
     * @param {String|Buffer} data String to be encoded
     * @param {Number} [maxLength=50] Max length for generated chunks
     * @param {String} [fromCharset='UTF-8'] Source sharacter set
     * @return {Array} A list of encoded keys and headers
     */
    buildHeaderParam(key, data, maxLength) {
        let list = [];
        let encodedStr = typeof data === 'string' ? data : (data || '').toString();
        let encodedStrArr;
        let chr, ord;
        let line;
        let startPos = 0;
        let i, len;

        maxLength = maxLength || 50;

        // process ascii only text
        if (this.isPlainText(data, true)) {
            // check if conversion is even needed
            if (encodedStr.length <= maxLength) {
                return [
                    {
                        key,
                        value: encodedStr
                    }
                ];
            }

            encodedStr = encodedStr.replace(new RegExp('.{' + maxLength + '}', 'g'), str => {
                list.push({
                    line: str
                });
                return '';
            });

            if (encodedStr) {
                list.push({
                    line: encodedStr
                });
            }
        } else {
            if (/[\uD800-\uDBFF]/.test(encodedStr)) {
                // string containts surrogate pairs, so normalize it to an array of bytes
                encodedStrArr = [];
                for (i = 0, len = encodedStr.length; i < len; i++) {
                    chr = encodedStr.charAt(i);
                    ord = chr.charCodeAt(0);
                    if (ord >= 0xd800 && ord <= 0xdbff && i < len - 1) {
                        chr += encodedStr.charAt(i + 1);
                        encodedStrArr.push(chr);
                        i++;
                    } else {
                        encodedStrArr.push(chr);
                    }
                }
                encodedStr = encodedStrArr;
            }

            // first line includes the charset and language info and needs to be encoded
            // even if it does not contain any unicode characters
            line = 'utf-8\x27\x27';
            let encoded = true;
            startPos = 0;

            // process text with unicode or special chars
            for (i = 0, len = encodedStr.length; i < len; i++) {
                chr = encodedStr[i];

                if (encoded) {
                    chr = this.safeEncodeURIComponent(chr);
                } else {
                    // try to urlencode current char
                    chr = chr === ' ' ? chr : this.safeEncodeURIComponent(chr);
                    // By default it is not required to encode a line, the need
                    // only appears when the string contains unicode or special chars
                    // in this case we start processing the line over and encode all chars
                    if (chr !== encodedStr[i]) {
                        // Check if it is even possible to add the encoded char to the line
                        // If not, there is no reason to use this line, just push it to the list
                        // and start a new line with the char that needs encoding
                        if ((this.safeEncodeURIComponent(line) + chr).length >= maxLength) {
                            list.push({
                                line,
                                encoded
                            });
                            line = '';
                            startPos = i - 1;
                        } else {
                            encoded = true;
                            i = startPos;
                            line = '';
                            continue;
                        }
                    }
                }

                // if the line is already too long, push it to the list and start a new one
                if ((line + chr).length >= maxLength) {
                    list.push({
                        line,
                        encoded
                    });
                    line = chr = encodedStr[i] === ' ' ? ' ' : this.safeEncodeURIComponent(encodedStr[i]);
                    if (chr === encodedStr[i]) {
                        encoded = false;
                        startPos = i - 1;
                    } else {
                        encoded = true;
                    }
                } else {
                    line += chr;
                }
            }

            if (line) {
                list.push({
                    line,
                    encoded
                });
            }
        }

        return list.map((item, i) => ({
            // encoded lines: {name}*{part}*
            // unencoded lines: {name}*{part}
            // if any line needs to be encoded then the first line (part==0) is always encoded
            key: key + '*' + i + (item.encoded ? '*' : ''),
            value: item.line
        }));
    },

    /**
     * Parses a header value with key=value arguments into a structured
     * object.
     *
     *   parseHeaderValue('content-type: text/plain; CHARSET='UTF-8'') ->
     *   {
     *     'value': 'text/plain',
     *     'params': {
     *       'charset': 'UTF-8'
     *     }
     *   }
     *
     * @param {String} str Header value
     * @return {Object} Header value as a parsed structure
     */
    parseHeaderValue(str) {
        let response = {
            value: false,
            params: {}
        };
        let key = false;
        let value = '';
        let type = 'value';
        let quote = false;
        let escaped = false;
        let chr;

        for (let i = 0, len = str.length; i < len; i++) {
            chr = str.charAt(i);
            if (type === 'key') {
                if (chr === '=') {
                    key = value.trim().toLowerCase();
                    type = 'value';
                    value = '';
                    continue;
                }
                value += chr;
            } else {
                if (escaped) {
                    value += chr;
                } else if (chr === '\\') {
                    escaped = true;
                    continue;
                } else if (quote && chr === quote) {
                    quote = false;
                } else if (!quote && chr === '"') {
                    quote = chr;
                } else if (!quote && chr === ';') {
                    if (key === false) {
                        response.value = value.trim();
                    } else {
                        response.params[key] = value.trim();
                    }
                    type = 'key';
                    value = '';
                } else {
                    value += chr;
                }
                escaped = false;
            }
        }

        if (type === 'value') {
            if (key === false) {
                response.value = value.trim();
            } else {
                response.params[key] = value.trim();
            }
        } else if (value.trim()) {
            response.params[value.trim().toLowerCase()] = '';
        }

        // handle parameter value continuations
        // https://tools.ietf.org/html/rfc2231#section-3

        // preprocess values
        Object.keys(response.params).forEach(key => {
            let actualKey, nr, match, value;
            if ((match = key.match(/(\*(\d+)|\*(\d+)\*|\*)$/))) {
                actualKey = key.substr(0, match.index);
                nr = Number(match[2] || match[3]) || 0;

                if (!response.params[actualKey] || typeof response.params[actualKey] !== 'object') {
                    response.params[actualKey] = {
                        charset: false,
                        values: []
                    };
                }

                value = response.params[key];

                if (nr === 0 && match[0].substr(-1) === '*' && (match = value.match(/^([^']*)'[^']*'(.*)$/))) {
                    response.params[actualKey].charset = match[1] || 'iso-8859-1';
                    value = match[2];
                }

                response.params[actualKey].values[nr] = value;

                // remove the old reference
                delete response.params[key];
            }
        });

        // concatenate split rfc2231 strings and convert encoded strings to mime encoded words
        Object.keys(response.params).forEach(key => {
            let value;
            if (response.params[key] && Array.isArray(response.params[key].values)) {
                value = response.params[key].values.map(val => val || '').join('');

                if (response.params[key].charset) {
                    // convert "%AB" to "=?charset?Q?=AB?="
                    response.params[key] =
                        '=?' +
                        response.params[key].charset +
                        '?Q?' +
                        value
                            // fix invalidly encoded chars
                            .replace(/[=?_\s]/g, s => {
                                let c = s.charCodeAt(0).toString(16);
                                if (s === ' ') {
                                    return '_';
                                } else {
                                    return '%' + (c.length < 2 ? '0' : '') + c;
                                }
                            })
                            // change from urlencoding to percent encoding
                            .replace(/%/g, '=') +
                        '?=';
                } else {
                    response.params[key] = value;
                }
            }
        });

        return response;
    },

    /**
     * Returns file extension for a content type string. If no suitable extensions
     * are found, 'bin' is used as the default extension
     *
     * @param {String} mimeType Content type to be checked for
     * @return {String} File extension
     */
    detectExtension: mimeType => mimeTypes.detectExtension(mimeType),

    /**
     * Returns content type for a file extension. If no suitable content types
     * are found, 'application/octet-stream' is used as the default content type
     *
     * @param {String} extension Extension to be checked for
     * @return {String} File extension
     */
    detectMimeType: extension => mimeTypes.detectMimeType(extension),

    /**
     * Folds long lines, useful for folding header lines (afterSpace=false) and
     * flowed text (afterSpace=true)
     *
     * @param {String} str String to be folded
     * @param {Number} [lineLength=76] Maximum length of a line
     * @param {Boolean} afterSpace If true, leave a space in th end of a line
     * @return {String} String with folded lines
     */
    foldLines(str, lineLength, afterSpace) {
        str = (str || '').toString();
        lineLength = lineLength || 76;

        let pos = 0,
            len = str.length,
            result = '',
            line,
            match;

        while (pos < len) {
            line = str.substr(pos, lineLength);
            if (line.length < lineLength) {
                result += line;
                break;
            }
            if ((match = line.match(/^[^\n\r]*(\r?\n|\r)/))) {
                line = match[0];
                result += line;
                pos += line.length;
                continue;
            } else if ((match = line.match(/(\s+)[^\s]*$/)) && match[0].length - (afterSpace ? (match[1] || '').length : 0) < line.length) {
                line = line.substr(0, line.length - (match[0].length - (afterSpace ? (match[1] || '').length : 0)));
            } else if ((match = str.substr(pos + line.length).match(/^[^\s]+(\s*)/))) {
                line = line + match[0].substr(0, match[0].length - (!afterSpace ? (match[1] || '').length : 0));
            }

            result += line;
            pos += line.length;
            if (pos < len) {
                result += '\r\n';
            }
        }

        return result;
    },

    /**
     * Splits a mime encoded string. Needed for dividing mime words into smaller chunks
     *
     * @param {String} str Mime encoded string to be split up
     * @param {Number} maxlen Maximum length of characters for one part (minimum 12)
     * @return {Array} Split string
     */
    splitMimeEncodedString: (str, maxlen) => {
        let curLine,
            match,
            chr,
            done,
            lines = [];

        // require at least 12 symbols to fit possible 4 octet UTF-8 sequences
        maxlen = Math.max(maxlen || 0, 12);

        while (str.length) {
            curLine = str.substr(0, maxlen);

            // move incomplete escaped char back to main
            if ((match = curLine.match(/[=][0-9A-F]?$/i))) {
                curLine = curLine.substr(0, match.index);
            }

            done = false;
            while (!done) {
                done = true;
                // check if not middle of a unicode char sequence
                if ((match = str.substr(curLine.length).match(/^[=]([0-9A-F]{2})/i))) {
                    chr = parseInt(match[1], 16);
                    // invalid sequence, move one char back anc recheck
                    if (chr < 0xc2 && chr > 0x7f) {
                        curLine = curLine.substr(0, curLine.length - 3);
                        done = false;
                    }
                }
            }

            if (curLine.length) {
                lines.push(curLine);
            }
            str = str.substr(curLine.length);
        }

        return lines;
    },

    encodeURICharComponent: chr => {
        let res = '';
        let ord = chr.charCodeAt(0).toString(16).toUpperCase();

        if (ord.length % 2) {
            ord = '0' + ord;
        }

        if (ord.length > 2) {
            for (let i = 0, len = ord.length / 2; i < len; i++) {
                res += '%' + ord.substr(i, 2);
            }
        } else {
            res += '%' + ord;
        }

        return res;
    },

    safeEncodeURIComponent(str) {
        str = (str || '').toString();

        try {
            // might throw if we try to encode invalid sequences, eg. partial emoji
            str = encodeURIComponent(str);
        } catch (E) {
            // should never run
            return str.replace(/[^\x00-\x1F *'()<>@,;:\\"[\]?=\u007F-\uFFFF]+/g, '');
        }

        // ensure chars that are not handled by encodeURICompent are converted as well
        return str.replace(/[\x00-\x1F *'()<>@,;:\\"[\]?=\u007F-\uFFFF]/g, chr => this.encodeURICharComponent(chr));
    }
};


/***/ }),

/***/ 7730:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/* eslint quote-props: 0 */



const path = __nccwpck_require__(1017);

const defaultMimeType = 'application/octet-stream';
const defaultExtension = 'bin';

const mimeTypes = new Map([
    ['application/acad', 'dwg'],
    ['application/applixware', 'aw'],
    ['application/arj', 'arj'],
    ['application/atom+xml', 'xml'],
    ['application/atomcat+xml', 'atomcat'],
    ['application/atomsvc+xml', 'atomsvc'],
    ['application/base64', ['mm', 'mme']],
    ['application/binhex', 'hqx'],
    ['application/binhex4', 'hqx'],
    ['application/book', ['book', 'boo']],
    ['application/ccxml+xml,', 'ccxml'],
    ['application/cdf', 'cdf'],
    ['application/cdmi-capability', 'cdmia'],
    ['application/cdmi-container', 'cdmic'],
    ['application/cdmi-domain', 'cdmid'],
    ['application/cdmi-object', 'cdmio'],
    ['application/cdmi-queue', 'cdmiq'],
    ['application/clariscad', 'ccad'],
    ['application/commonground', 'dp'],
    ['application/cu-seeme', 'cu'],
    ['application/davmount+xml', 'davmount'],
    ['application/drafting', 'drw'],
    ['application/dsptype', 'tsp'],
    ['application/dssc+der', 'dssc'],
    ['application/dssc+xml', 'xdssc'],
    ['application/dxf', 'dxf'],
    ['application/ecmascript', ['js', 'es']],
    ['application/emma+xml', 'emma'],
    ['application/envoy', 'evy'],
    ['application/epub+zip', 'epub'],
    ['application/excel', ['xls', 'xl', 'xla', 'xlb', 'xlc', 'xld', 'xlk', 'xll', 'xlm', 'xlt', 'xlv', 'xlw']],
    ['application/exi', 'exi'],
    ['application/font-tdpfr', 'pfr'],
    ['application/fractals', 'fif'],
    ['application/freeloader', 'frl'],
    ['application/futuresplash', 'spl'],
    ['application/geo+json', 'geojson'],
    ['application/gnutar', 'tgz'],
    ['application/groupwise', 'vew'],
    ['application/hlp', 'hlp'],
    ['application/hta', 'hta'],
    ['application/hyperstudio', 'stk'],
    ['application/i-deas', 'unv'],
    ['application/iges', ['iges', 'igs']],
    ['application/inf', 'inf'],
    ['application/internet-property-stream', 'acx'],
    ['application/ipfix', 'ipfix'],
    ['application/java', 'class'],
    ['application/java-archive', 'jar'],
    ['application/java-byte-code', 'class'],
    ['application/java-serialized-object', 'ser'],
    ['application/java-vm', 'class'],
    ['application/javascript', 'js'],
    ['application/json', 'json'],
    ['application/lha', 'lha'],
    ['application/lzx', 'lzx'],
    ['application/mac-binary', 'bin'],
    ['application/mac-binhex', 'hqx'],
    ['application/mac-binhex40', 'hqx'],
    ['application/mac-compactpro', 'cpt'],
    ['application/macbinary', 'bin'],
    ['application/mads+xml', 'mads'],
    ['application/marc', 'mrc'],
    ['application/marcxml+xml', 'mrcx'],
    ['application/mathematica', 'ma'],
    ['application/mathml+xml', 'mathml'],
    ['application/mbedlet', 'mbd'],
    ['application/mbox', 'mbox'],
    ['application/mcad', 'mcd'],
    ['application/mediaservercontrol+xml', 'mscml'],
    ['application/metalink4+xml', 'meta4'],
    ['application/mets+xml', 'mets'],
    ['application/mime', 'aps'],
    ['application/mods+xml', 'mods'],
    ['application/mp21', 'm21'],
    ['application/mp4', 'mp4'],
    ['application/mspowerpoint', ['ppt', 'pot', 'pps', 'ppz']],
    ['application/msword', ['doc', 'dot', 'w6w', 'wiz', 'word']],
    ['application/mswrite', 'wri'],
    ['application/mxf', 'mxf'],
    ['application/netmc', 'mcp'],
    ['application/octet-stream', ['*']],
    ['application/oda', 'oda'],
    ['application/oebps-package+xml', 'opf'],
    ['application/ogg', 'ogx'],
    ['application/olescript', 'axs'],
    ['application/onenote', 'onetoc'],
    ['application/patch-ops-error+xml', 'xer'],
    ['application/pdf', 'pdf'],
    ['application/pgp-encrypted', 'asc'],
    ['application/pgp-signature', 'pgp'],
    ['application/pics-rules', 'prf'],
    ['application/pkcs-12', 'p12'],
    ['application/pkcs-crl', 'crl'],
    ['application/pkcs10', 'p10'],
    ['application/pkcs7-mime', ['p7c', 'p7m']],
    ['application/pkcs7-signature', 'p7s'],
    ['application/pkcs8', 'p8'],
    ['application/pkix-attr-cert', 'ac'],
    ['application/pkix-cert', ['cer', 'crt']],
    ['application/pkix-crl', 'crl'],
    ['application/pkix-pkipath', 'pkipath'],
    ['application/pkixcmp', 'pki'],
    ['application/plain', 'text'],
    ['application/pls+xml', 'pls'],
    ['application/postscript', ['ps', 'ai', 'eps']],
    ['application/powerpoint', 'ppt'],
    ['application/pro_eng', ['part', 'prt']],
    ['application/prs.cww', 'cww'],
    ['application/pskc+xml', 'pskcxml'],
    ['application/rdf+xml', 'rdf'],
    ['application/reginfo+xml', 'rif'],
    ['application/relax-ng-compact-syntax', 'rnc'],
    ['application/resource-lists+xml', 'rl'],
    ['application/resource-lists-diff+xml', 'rld'],
    ['application/ringing-tones', 'rng'],
    ['application/rls-services+xml', 'rs'],
    ['application/rsd+xml', 'rsd'],
    ['application/rss+xml', 'xml'],
    ['application/rtf', ['rtf', 'rtx']],
    ['application/sbml+xml', 'sbml'],
    ['application/scvp-cv-request', 'scq'],
    ['application/scvp-cv-response', 'scs'],
    ['application/scvp-vp-request', 'spq'],
    ['application/scvp-vp-response', 'spp'],
    ['application/sdp', 'sdp'],
    ['application/sea', 'sea'],
    ['application/set', 'set'],
    ['application/set-payment-initiation', 'setpay'],
    ['application/set-registration-initiation', 'setreg'],
    ['application/shf+xml', 'shf'],
    ['application/sla', 'stl'],
    ['application/smil', ['smi', 'smil']],
    ['application/smil+xml', 'smi'],
    ['application/solids', 'sol'],
    ['application/sounder', 'sdr'],
    ['application/sparql-query', 'rq'],
    ['application/sparql-results+xml', 'srx'],
    ['application/srgs', 'gram'],
    ['application/srgs+xml', 'grxml'],
    ['application/sru+xml', 'sru'],
    ['application/ssml+xml', 'ssml'],
    ['application/step', ['step', 'stp']],
    ['application/streamingmedia', 'ssm'],
    ['application/tei+xml', 'tei'],
    ['application/thraud+xml', 'tfi'],
    ['application/timestamped-data', 'tsd'],
    ['application/toolbook', 'tbk'],
    ['application/vda', 'vda'],
    ['application/vnd.3gpp.pic-bw-large', 'plb'],
    ['application/vnd.3gpp.pic-bw-small', 'psb'],
    ['application/vnd.3gpp.pic-bw-var', 'pvb'],
    ['application/vnd.3gpp2.tcap', 'tcap'],
    ['application/vnd.3m.post-it-notes', 'pwn'],
    ['application/vnd.accpac.simply.aso', 'aso'],
    ['application/vnd.accpac.simply.imp', 'imp'],
    ['application/vnd.acucobol', 'acu'],
    ['application/vnd.acucorp', 'atc'],
    ['application/vnd.adobe.air-application-installer-package+zip', 'air'],
    ['application/vnd.adobe.fxp', 'fxp'],
    ['application/vnd.adobe.xdp+xml', 'xdp'],
    ['application/vnd.adobe.xfdf', 'xfdf'],
    ['application/vnd.ahead.space', 'ahead'],
    ['application/vnd.airzip.filesecure.azf', 'azf'],
    ['application/vnd.airzip.filesecure.azs', 'azs'],
    ['application/vnd.amazon.ebook', 'azw'],
    ['application/vnd.americandynamics.acc', 'acc'],
    ['application/vnd.amiga.ami', 'ami'],
    ['application/vnd.android.package-archive', 'apk'],
    ['application/vnd.anser-web-certificate-issue-initiation', 'cii'],
    ['application/vnd.anser-web-funds-transfer-initiation', 'fti'],
    ['application/vnd.antix.game-component', 'atx'],
    ['application/vnd.apple.installer+xml', 'mpkg'],
    ['application/vnd.apple.mpegurl', 'm3u8'],
    ['application/vnd.aristanetworks.swi', 'swi'],
    ['application/vnd.audiograph', 'aep'],
    ['application/vnd.blueice.multipass', 'mpm'],
    ['application/vnd.bmi', 'bmi'],
    ['application/vnd.businessobjects', 'rep'],
    ['application/vnd.chemdraw+xml', 'cdxml'],
    ['application/vnd.chipnuts.karaoke-mmd', 'mmd'],
    ['application/vnd.cinderella', 'cdy'],
    ['application/vnd.claymore', 'cla'],
    ['application/vnd.cloanto.rp9', 'rp9'],
    ['application/vnd.clonk.c4group', 'c4g'],
    ['application/vnd.cluetrust.cartomobile-config', 'c11amc'],
    ['application/vnd.cluetrust.cartomobile-config-pkg', 'c11amz'],
    ['application/vnd.commonspace', 'csp'],
    ['application/vnd.contact.cmsg', 'cdbcmsg'],
    ['application/vnd.cosmocaller', 'cmc'],
    ['application/vnd.crick.clicker', 'clkx'],
    ['application/vnd.crick.clicker.keyboard', 'clkk'],
    ['application/vnd.crick.clicker.palette', 'clkp'],
    ['application/vnd.crick.clicker.template', 'clkt'],
    ['application/vnd.crick.clicker.wordbank', 'clkw'],
    ['application/vnd.criticaltools.wbs+xml', 'wbs'],
    ['application/vnd.ctc-posml', 'pml'],
    ['application/vnd.cups-ppd', 'ppd'],
    ['application/vnd.curl.car', 'car'],
    ['application/vnd.curl.pcurl', 'pcurl'],
    ['application/vnd.data-vision.rdz', 'rdz'],
    ['application/vnd.denovo.fcselayout-link', 'fe_launch'],
    ['application/vnd.dna', 'dna'],
    ['application/vnd.dolby.mlp', 'mlp'],
    ['application/vnd.dpgraph', 'dpg'],
    ['application/vnd.dreamfactory', 'dfac'],
    ['application/vnd.dvb.ait', 'ait'],
    ['application/vnd.dvb.service', 'svc'],
    ['application/vnd.dynageo', 'geo'],
    ['application/vnd.ecowin.chart', 'mag'],
    ['application/vnd.enliven', 'nml'],
    ['application/vnd.epson.esf', 'esf'],
    ['application/vnd.epson.msf', 'msf'],
    ['application/vnd.epson.quickanime', 'qam'],
    ['application/vnd.epson.salt', 'slt'],
    ['application/vnd.epson.ssf', 'ssf'],
    ['application/vnd.eszigno3+xml', 'es3'],
    ['application/vnd.ezpix-album', 'ez2'],
    ['application/vnd.ezpix-package', 'ez3'],
    ['application/vnd.fdf', 'fdf'],
    ['application/vnd.fdsn.seed', 'seed'],
    ['application/vnd.flographit', 'gph'],
    ['application/vnd.fluxtime.clip', 'ftc'],
    ['application/vnd.framemaker', 'fm'],
    ['application/vnd.frogans.fnc', 'fnc'],
    ['application/vnd.frogans.ltf', 'ltf'],
    ['application/vnd.fsc.weblaunch', 'fsc'],
    ['application/vnd.fujitsu.oasys', 'oas'],
    ['application/vnd.fujitsu.oasys2', 'oa2'],
    ['application/vnd.fujitsu.oasys3', 'oa3'],
    ['application/vnd.fujitsu.oasysgp', 'fg5'],
    ['application/vnd.fujitsu.oasysprs', 'bh2'],
    ['application/vnd.fujixerox.ddd', 'ddd'],
    ['application/vnd.fujixerox.docuworks', 'xdw'],
    ['application/vnd.fujixerox.docuworks.binder', 'xbd'],
    ['application/vnd.fuzzysheet', 'fzs'],
    ['application/vnd.genomatix.tuxedo', 'txd'],
    ['application/vnd.geogebra.file', 'ggb'],
    ['application/vnd.geogebra.tool', 'ggt'],
    ['application/vnd.geometry-explorer', 'gex'],
    ['application/vnd.geonext', 'gxt'],
    ['application/vnd.geoplan', 'g2w'],
    ['application/vnd.geospace', 'g3w'],
    ['application/vnd.gmx', 'gmx'],
    ['application/vnd.google-earth.kml+xml', 'kml'],
    ['application/vnd.google-earth.kmz', 'kmz'],
    ['application/vnd.grafeq', 'gqf'],
    ['application/vnd.groove-account', 'gac'],
    ['application/vnd.groove-help', 'ghf'],
    ['application/vnd.groove-identity-message', 'gim'],
    ['application/vnd.groove-injector', 'grv'],
    ['application/vnd.groove-tool-message', 'gtm'],
    ['application/vnd.groove-tool-template', 'tpl'],
    ['application/vnd.groove-vcard', 'vcg'],
    ['application/vnd.hal+xml', 'hal'],
    ['application/vnd.handheld-entertainment+xml', 'zmm'],
    ['application/vnd.hbci', 'hbci'],
    ['application/vnd.hhe.lesson-player', 'les'],
    ['application/vnd.hp-hpgl', ['hgl', 'hpg', 'hpgl']],
    ['application/vnd.hp-hpid', 'hpid'],
    ['application/vnd.hp-hps', 'hps'],
    ['application/vnd.hp-jlyt', 'jlt'],
    ['application/vnd.hp-pcl', 'pcl'],
    ['application/vnd.hp-pclxl', 'pclxl'],
    ['application/vnd.hydrostatix.sof-data', 'sfd-hdstx'],
    ['application/vnd.hzn-3d-crossword', 'x3d'],
    ['application/vnd.ibm.minipay', 'mpy'],
    ['application/vnd.ibm.modcap', 'afp'],
    ['application/vnd.ibm.rights-management', 'irm'],
    ['application/vnd.ibm.secure-container', 'sc'],
    ['application/vnd.iccprofile', 'icc'],
    ['application/vnd.igloader', 'igl'],
    ['application/vnd.immervision-ivp', 'ivp'],
    ['application/vnd.immervision-ivu', 'ivu'],
    ['application/vnd.insors.igm', 'igm'],
    ['application/vnd.intercon.formnet', 'xpw'],
    ['application/vnd.intergeo', 'i2g'],
    ['application/vnd.intu.qbo', 'qbo'],
    ['application/vnd.intu.qfx', 'qfx'],
    ['application/vnd.ipunplugged.rcprofile', 'rcprofile'],
    ['application/vnd.irepository.package+xml', 'irp'],
    ['application/vnd.is-xpr', 'xpr'],
    ['application/vnd.isac.fcs', 'fcs'],
    ['application/vnd.jam', 'jam'],
    ['application/vnd.jcp.javame.midlet-rms', 'rms'],
    ['application/vnd.jisp', 'jisp'],
    ['application/vnd.joost.joda-archive', 'joda'],
    ['application/vnd.kahootz', 'ktz'],
    ['application/vnd.kde.karbon', 'karbon'],
    ['application/vnd.kde.kchart', 'chrt'],
    ['application/vnd.kde.kformula', 'kfo'],
    ['application/vnd.kde.kivio', 'flw'],
    ['application/vnd.kde.kontour', 'kon'],
    ['application/vnd.kde.kpresenter', 'kpr'],
    ['application/vnd.kde.kspread', 'ksp'],
    ['application/vnd.kde.kword', 'kwd'],
    ['application/vnd.kenameaapp', 'htke'],
    ['application/vnd.kidspiration', 'kia'],
    ['application/vnd.kinar', 'kne'],
    ['application/vnd.koan', 'skp'],
    ['application/vnd.kodak-descriptor', 'sse'],
    ['application/vnd.las.las+xml', 'lasxml'],
    ['application/vnd.llamagraphics.life-balance.desktop', 'lbd'],
    ['application/vnd.llamagraphics.life-balance.exchange+xml', 'lbe'],
    ['application/vnd.lotus-1-2-3', '123'],
    ['application/vnd.lotus-approach', 'apr'],
    ['application/vnd.lotus-freelance', 'pre'],
    ['application/vnd.lotus-notes', 'nsf'],
    ['application/vnd.lotus-organizer', 'org'],
    ['application/vnd.lotus-screencam', 'scm'],
    ['application/vnd.lotus-wordpro', 'lwp'],
    ['application/vnd.macports.portpkg', 'portpkg'],
    ['application/vnd.mcd', 'mcd'],
    ['application/vnd.medcalcdata', 'mc1'],
    ['application/vnd.mediastation.cdkey', 'cdkey'],
    ['application/vnd.mfer', 'mwf'],
    ['application/vnd.mfmp', 'mfm'],
    ['application/vnd.micrografx.flo', 'flo'],
    ['application/vnd.micrografx.igx', 'igx'],
    ['application/vnd.mif', 'mif'],
    ['application/vnd.mobius.daf', 'daf'],
    ['application/vnd.mobius.dis', 'dis'],
    ['application/vnd.mobius.mbk', 'mbk'],
    ['application/vnd.mobius.mqy', 'mqy'],
    ['application/vnd.mobius.msl', 'msl'],
    ['application/vnd.mobius.plc', 'plc'],
    ['application/vnd.mobius.txf', 'txf'],
    ['application/vnd.mophun.application', 'mpn'],
    ['application/vnd.mophun.certificate', 'mpc'],
    ['application/vnd.mozilla.xul+xml', 'xul'],
    ['application/vnd.ms-artgalry', 'cil'],
    ['application/vnd.ms-cab-compressed', 'cab'],
    ['application/vnd.ms-excel', ['xls', 'xla', 'xlc', 'xlm', 'xlt', 'xlw', 'xlb', 'xll']],
    ['application/vnd.ms-excel.addin.macroenabled.12', 'xlam'],
    ['application/vnd.ms-excel.sheet.binary.macroenabled.12', 'xlsb'],
    ['application/vnd.ms-excel.sheet.macroenabled.12', 'xlsm'],
    ['application/vnd.ms-excel.template.macroenabled.12', 'xltm'],
    ['application/vnd.ms-fontobject', 'eot'],
    ['application/vnd.ms-htmlhelp', 'chm'],
    ['application/vnd.ms-ims', 'ims'],
    ['application/vnd.ms-lrm', 'lrm'],
    ['application/vnd.ms-officetheme', 'thmx'],
    ['application/vnd.ms-outlook', 'msg'],
    ['application/vnd.ms-pki.certstore', 'sst'],
    ['application/vnd.ms-pki.pko', 'pko'],
    ['application/vnd.ms-pki.seccat', 'cat'],
    ['application/vnd.ms-pki.stl', 'stl'],
    ['application/vnd.ms-pkicertstore', 'sst'],
    ['application/vnd.ms-pkiseccat', 'cat'],
    ['application/vnd.ms-pkistl', 'stl'],
    ['application/vnd.ms-powerpoint', ['ppt', 'pot', 'pps', 'ppa', 'pwz']],
    ['application/vnd.ms-powerpoint.addin.macroenabled.12', 'ppam'],
    ['application/vnd.ms-powerpoint.presentation.macroenabled.12', 'pptm'],
    ['application/vnd.ms-powerpoint.slide.macroenabled.12', 'sldm'],
    ['application/vnd.ms-powerpoint.slideshow.macroenabled.12', 'ppsm'],
    ['application/vnd.ms-powerpoint.template.macroenabled.12', 'potm'],
    ['application/vnd.ms-project', 'mpp'],
    ['application/vnd.ms-word.document.macroenabled.12', 'docm'],
    ['application/vnd.ms-word.template.macroenabled.12', 'dotm'],
    ['application/vnd.ms-works', ['wks', 'wcm', 'wdb', 'wps']],
    ['application/vnd.ms-wpl', 'wpl'],
    ['application/vnd.ms-xpsdocument', 'xps'],
    ['application/vnd.mseq', 'mseq'],
    ['application/vnd.musician', 'mus'],
    ['application/vnd.muvee.style', 'msty'],
    ['application/vnd.neurolanguage.nlu', 'nlu'],
    ['application/vnd.noblenet-directory', 'nnd'],
    ['application/vnd.noblenet-sealer', 'nns'],
    ['application/vnd.noblenet-web', 'nnw'],
    ['application/vnd.nokia.configuration-message', 'ncm'],
    ['application/vnd.nokia.n-gage.data', 'ngdat'],
    ['application/vnd.nokia.n-gage.symbian.install', 'n-gage'],
    ['application/vnd.nokia.radio-preset', 'rpst'],
    ['application/vnd.nokia.radio-presets', 'rpss'],
    ['application/vnd.nokia.ringing-tone', 'rng'],
    ['application/vnd.novadigm.edm', 'edm'],
    ['application/vnd.novadigm.edx', 'edx'],
    ['application/vnd.novadigm.ext', 'ext'],
    ['application/vnd.oasis.opendocument.chart', 'odc'],
    ['application/vnd.oasis.opendocument.chart-template', 'otc'],
    ['application/vnd.oasis.opendocument.database', 'odb'],
    ['application/vnd.oasis.opendocument.formula', 'odf'],
    ['application/vnd.oasis.opendocument.formula-template', 'odft'],
    ['application/vnd.oasis.opendocument.graphics', 'odg'],
    ['application/vnd.oasis.opendocument.graphics-template', 'otg'],
    ['application/vnd.oasis.opendocument.image', 'odi'],
    ['application/vnd.oasis.opendocument.image-template', 'oti'],
    ['application/vnd.oasis.opendocument.presentation', 'odp'],
    ['application/vnd.oasis.opendocument.presentation-template', 'otp'],
    ['application/vnd.oasis.opendocument.spreadsheet', 'ods'],
    ['application/vnd.oasis.opendocument.spreadsheet-template', 'ots'],
    ['application/vnd.oasis.opendocument.text', 'odt'],
    ['application/vnd.oasis.opendocument.text-master', 'odm'],
    ['application/vnd.oasis.opendocument.text-template', 'ott'],
    ['application/vnd.oasis.opendocument.text-web', 'oth'],
    ['application/vnd.olpc-sugar', 'xo'],
    ['application/vnd.oma.dd2+xml', 'dd2'],
    ['application/vnd.openofficeorg.extension', 'oxt'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
    ['application/vnd.openxmlformats-officedocument.presentationml.slide', 'sldx'],
    ['application/vnd.openxmlformats-officedocument.presentationml.slideshow', 'ppsx'],
    ['application/vnd.openxmlformats-officedocument.presentationml.template', 'potx'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.template', 'xltx'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.template', 'dotx'],
    ['application/vnd.osgeo.mapguide.package', 'mgp'],
    ['application/vnd.osgi.dp', 'dp'],
    ['application/vnd.palm', 'pdb'],
    ['application/vnd.pawaafile', 'paw'],
    ['application/vnd.pg.format', 'str'],
    ['application/vnd.pg.osasli', 'ei6'],
    ['application/vnd.picsel', 'efif'],
    ['application/vnd.pmi.widget', 'wg'],
    ['application/vnd.pocketlearn', 'plf'],
    ['application/vnd.powerbuilder6', 'pbd'],
    ['application/vnd.previewsystems.box', 'box'],
    ['application/vnd.proteus.magazine', 'mgz'],
    ['application/vnd.publishare-delta-tree', 'qps'],
    ['application/vnd.pvi.ptid1', 'ptid'],
    ['application/vnd.quark.quarkxpress', 'qxd'],
    ['application/vnd.realvnc.bed', 'bed'],
    ['application/vnd.recordare.musicxml', 'mxl'],
    ['application/vnd.recordare.musicxml+xml', 'musicxml'],
    ['application/vnd.rig.cryptonote', 'cryptonote'],
    ['application/vnd.rim.cod', 'cod'],
    ['application/vnd.rn-realmedia', 'rm'],
    ['application/vnd.rn-realplayer', 'rnx'],
    ['application/vnd.route66.link66+xml', 'link66'],
    ['application/vnd.sailingtracker.track', 'st'],
    ['application/vnd.seemail', 'see'],
    ['application/vnd.sema', 'sema'],
    ['application/vnd.semd', 'semd'],
    ['application/vnd.semf', 'semf'],
    ['application/vnd.shana.informed.formdata', 'ifm'],
    ['application/vnd.shana.informed.formtemplate', 'itp'],
    ['application/vnd.shana.informed.interchange', 'iif'],
    ['application/vnd.shana.informed.package', 'ipk'],
    ['application/vnd.simtech-mindmapper', 'twd'],
    ['application/vnd.smaf', 'mmf'],
    ['application/vnd.smart.teacher', 'teacher'],
    ['application/vnd.solent.sdkm+xml', 'sdkm'],
    ['application/vnd.spotfire.dxp', 'dxp'],
    ['application/vnd.spotfire.sfs', 'sfs'],
    ['application/vnd.stardivision.calc', 'sdc'],
    ['application/vnd.stardivision.draw', 'sda'],
    ['application/vnd.stardivision.impress', 'sdd'],
    ['application/vnd.stardivision.math', 'smf'],
    ['application/vnd.stardivision.writer', 'sdw'],
    ['application/vnd.stardivision.writer-global', 'sgl'],
    ['application/vnd.stepmania.stepchart', 'sm'],
    ['application/vnd.sun.xml.calc', 'sxc'],
    ['application/vnd.sun.xml.calc.template', 'stc'],
    ['application/vnd.sun.xml.draw', 'sxd'],
    ['application/vnd.sun.xml.draw.template', 'std'],
    ['application/vnd.sun.xml.impress', 'sxi'],
    ['application/vnd.sun.xml.impress.template', 'sti'],
    ['application/vnd.sun.xml.math', 'sxm'],
    ['application/vnd.sun.xml.writer', 'sxw'],
    ['application/vnd.sun.xml.writer.global', 'sxg'],
    ['application/vnd.sun.xml.writer.template', 'stw'],
    ['application/vnd.sus-calendar', 'sus'],
    ['application/vnd.svd', 'svd'],
    ['application/vnd.symbian.install', 'sis'],
    ['application/vnd.syncml+xml', 'xsm'],
    ['application/vnd.syncml.dm+wbxml', 'bdm'],
    ['application/vnd.syncml.dm+xml', 'xdm'],
    ['application/vnd.tao.intent-module-archive', 'tao'],
    ['application/vnd.tmobile-livetv', 'tmo'],
    ['application/vnd.trid.tpt', 'tpt'],
    ['application/vnd.triscape.mxs', 'mxs'],
    ['application/vnd.trueapp', 'tra'],
    ['application/vnd.ufdl', 'ufd'],
    ['application/vnd.uiq.theme', 'utz'],
    ['application/vnd.umajin', 'umj'],
    ['application/vnd.unity', 'unityweb'],
    ['application/vnd.uoml+xml', 'uoml'],
    ['application/vnd.vcx', 'vcx'],
    ['application/vnd.visio', 'vsd'],
    ['application/vnd.visionary', 'vis'],
    ['application/vnd.vsf', 'vsf'],
    ['application/vnd.wap.wbxml', 'wbxml'],
    ['application/vnd.wap.wmlc', 'wmlc'],
    ['application/vnd.wap.wmlscriptc', 'wmlsc'],
    ['application/vnd.webturbo', 'wtb'],
    ['application/vnd.wolfram.player', 'nbp'],
    ['application/vnd.wordperfect', 'wpd'],
    ['application/vnd.wqd', 'wqd'],
    ['application/vnd.wt.stf', 'stf'],
    ['application/vnd.xara', ['web', 'xar']],
    ['application/vnd.xfdl', 'xfdl'],
    ['application/vnd.yamaha.hv-dic', 'hvd'],
    ['application/vnd.yamaha.hv-script', 'hvs'],
    ['application/vnd.yamaha.hv-voice', 'hvp'],
    ['application/vnd.yamaha.openscoreformat', 'osf'],
    ['application/vnd.yamaha.openscoreformat.osfpvg+xml', 'osfpvg'],
    ['application/vnd.yamaha.smaf-audio', 'saf'],
    ['application/vnd.yamaha.smaf-phrase', 'spf'],
    ['application/vnd.yellowriver-custom-menu', 'cmp'],
    ['application/vnd.zul', 'zir'],
    ['application/vnd.zzazz.deck+xml', 'zaz'],
    ['application/vocaltec-media-desc', 'vmd'],
    ['application/vocaltec-media-file', 'vmf'],
    ['application/voicexml+xml', 'vxml'],
    ['application/widget', 'wgt'],
    ['application/winhlp', 'hlp'],
    ['application/wordperfect', ['wp', 'wp5', 'wp6', 'wpd']],
    ['application/wordperfect6.0', ['w60', 'wp5']],
    ['application/wordperfect6.1', 'w61'],
    ['application/wsdl+xml', 'wsdl'],
    ['application/wspolicy+xml', 'wspolicy'],
    ['application/x-123', 'wk1'],
    ['application/x-7z-compressed', '7z'],
    ['application/x-abiword', 'abw'],
    ['application/x-ace-compressed', 'ace'],
    ['application/x-aim', 'aim'],
    ['application/x-authorware-bin', 'aab'],
    ['application/x-authorware-map', 'aam'],
    ['application/x-authorware-seg', 'aas'],
    ['application/x-bcpio', 'bcpio'],
    ['application/x-binary', 'bin'],
    ['application/x-binhex40', 'hqx'],
    ['application/x-bittorrent', 'torrent'],
    ['application/x-bsh', ['bsh', 'sh', 'shar']],
    ['application/x-bytecode.elisp', 'elc'],
    ['application/x-bytecode.python', 'pyc'],
    ['application/x-bzip', 'bz'],
    ['application/x-bzip2', ['boz', 'bz2']],
    ['application/x-cdf', 'cdf'],
    ['application/x-cdlink', 'vcd'],
    ['application/x-chat', ['cha', 'chat']],
    ['application/x-chess-pgn', 'pgn'],
    ['application/x-cmu-raster', 'ras'],
    ['application/x-cocoa', 'cco'],
    ['application/x-compactpro', 'cpt'],
    ['application/x-compress', 'z'],
    ['application/x-compressed', ['tgz', 'gz', 'z', 'zip']],
    ['application/x-conference', 'nsc'],
    ['application/x-cpio', 'cpio'],
    ['application/x-cpt', 'cpt'],
    ['application/x-csh', 'csh'],
    ['application/x-debian-package', 'deb'],
    ['application/x-deepv', 'deepv'],
    ['application/x-director', ['dir', 'dcr', 'dxr']],
    ['application/x-doom', 'wad'],
    ['application/x-dtbncx+xml', 'ncx'],
    ['application/x-dtbook+xml', 'dtb'],
    ['application/x-dtbresource+xml', 'res'],
    ['application/x-dvi', 'dvi'],
    ['application/x-elc', 'elc'],
    ['application/x-envoy', ['env', 'evy']],
    ['application/x-esrehber', 'es'],
    ['application/x-excel', ['xls', 'xla', 'xlb', 'xlc', 'xld', 'xlk', 'xll', 'xlm', 'xlt', 'xlv', 'xlw']],
    ['application/x-font-bdf', 'bdf'],
    ['application/x-font-ghostscript', 'gsf'],
    ['application/x-font-linux-psf', 'psf'],
    ['application/x-font-otf', 'otf'],
    ['application/x-font-pcf', 'pcf'],
    ['application/x-font-snf', 'snf'],
    ['application/x-font-ttf', 'ttf'],
    ['application/x-font-type1', 'pfa'],
    ['application/x-font-woff', 'woff'],
    ['application/x-frame', 'mif'],
    ['application/x-freelance', 'pre'],
    ['application/x-futuresplash', 'spl'],
    ['application/x-gnumeric', 'gnumeric'],
    ['application/x-gsp', 'gsp'],
    ['application/x-gss', 'gss'],
    ['application/x-gtar', 'gtar'],
    ['application/x-gzip', ['gz', 'gzip']],
    ['application/x-hdf', 'hdf'],
    ['application/x-helpfile', ['help', 'hlp']],
    ['application/x-httpd-imap', 'imap'],
    ['application/x-ima', 'ima'],
    ['application/x-internet-signup', ['ins', 'isp']],
    ['application/x-internett-signup', 'ins'],
    ['application/x-inventor', 'iv'],
    ['application/x-ip2', 'ip'],
    ['application/x-iphone', 'iii'],
    ['application/x-java-class', 'class'],
    ['application/x-java-commerce', 'jcm'],
    ['application/x-java-jnlp-file', 'jnlp'],
    ['application/x-javascript', 'js'],
    ['application/x-koan', ['skd', 'skm', 'skp', 'skt']],
    ['application/x-ksh', 'ksh'],
    ['application/x-latex', ['latex', 'ltx']],
    ['application/x-lha', 'lha'],
    ['application/x-lisp', 'lsp'],
    ['application/x-livescreen', 'ivy'],
    ['application/x-lotus', 'wq1'],
    ['application/x-lotusscreencam', 'scm'],
    ['application/x-lzh', 'lzh'],
    ['application/x-lzx', 'lzx'],
    ['application/x-mac-binhex40', 'hqx'],
    ['application/x-macbinary', 'bin'],
    ['application/x-magic-cap-package-1.0', 'mc$'],
    ['application/x-mathcad', 'mcd'],
    ['application/x-meme', 'mm'],
    ['application/x-midi', ['mid', 'midi']],
    ['application/x-mif', 'mif'],
    ['application/x-mix-transfer', 'nix'],
    ['application/x-mobipocket-ebook', 'prc'],
    ['application/x-mplayer2', 'asx'],
    ['application/x-ms-application', 'application'],
    ['application/x-ms-wmd', 'wmd'],
    ['application/x-ms-wmz', 'wmz'],
    ['application/x-ms-xbap', 'xbap'],
    ['application/x-msaccess', 'mdb'],
    ['application/x-msbinder', 'obd'],
    ['application/x-mscardfile', 'crd'],
    ['application/x-msclip', 'clp'],
    ['application/x-msdownload', ['exe', 'dll']],
    ['application/x-msexcel', ['xls', 'xla', 'xlw']],
    ['application/x-msmediaview', ['mvb', 'm13', 'm14']],
    ['application/x-msmetafile', 'wmf'],
    ['application/x-msmoney', 'mny'],
    ['application/x-mspowerpoint', 'ppt'],
    ['application/x-mspublisher', 'pub'],
    ['application/x-msschedule', 'scd'],
    ['application/x-msterminal', 'trm'],
    ['application/x-mswrite', 'wri'],
    ['application/x-navi-animation', 'ani'],
    ['application/x-navidoc', 'nvd'],
    ['application/x-navimap', 'map'],
    ['application/x-navistyle', 'stl'],
    ['application/x-netcdf', ['cdf', 'nc']],
    ['application/x-newton-compatible-pkg', 'pkg'],
    ['application/x-nokia-9000-communicator-add-on-software', 'aos'],
    ['application/x-omc', 'omc'],
    ['application/x-omcdatamaker', 'omcd'],
    ['application/x-omcregerator', 'omcr'],
    ['application/x-pagemaker', ['pm4', 'pm5']],
    ['application/x-pcl', 'pcl'],
    ['application/x-perfmon', ['pma', 'pmc', 'pml', 'pmr', 'pmw']],
    ['application/x-pixclscript', 'plx'],
    ['application/x-pkcs10', 'p10'],
    ['application/x-pkcs12', ['p12', 'pfx']],
    ['application/x-pkcs7-certificates', ['p7b', 'spc']],
    ['application/x-pkcs7-certreqresp', 'p7r'],
    ['application/x-pkcs7-mime', ['p7m', 'p7c']],
    ['application/x-pkcs7-signature', ['p7s', 'p7a']],
    ['application/x-pointplus', 'css'],
    ['application/x-portable-anymap', 'pnm'],
    ['application/x-project', ['mpc', 'mpt', 'mpv', 'mpx']],
    ['application/x-qpro', 'wb1'],
    ['application/x-rar-compressed', 'rar'],
    ['application/x-rtf', 'rtf'],
    ['application/x-sdp', 'sdp'],
    ['application/x-sea', 'sea'],
    ['application/x-seelogo', 'sl'],
    ['application/x-sh', 'sh'],
    ['application/x-shar', ['shar', 'sh']],
    ['application/x-shockwave-flash', 'swf'],
    ['application/x-silverlight-app', 'xap'],
    ['application/x-sit', 'sit'],
    ['application/x-sprite', ['spr', 'sprite']],
    ['application/x-stuffit', 'sit'],
    ['application/x-stuffitx', 'sitx'],
    ['application/x-sv4cpio', 'sv4cpio'],
    ['application/x-sv4crc', 'sv4crc'],
    ['application/x-tar', 'tar'],
    ['application/x-tbook', ['sbk', 'tbk']],
    ['application/x-tcl', 'tcl'],
    ['application/x-tex', 'tex'],
    ['application/x-tex-tfm', 'tfm'],
    ['application/x-texinfo', ['texi', 'texinfo']],
    ['application/x-troff', ['roff', 't', 'tr']],
    ['application/x-troff-man', 'man'],
    ['application/x-troff-me', 'me'],
    ['application/x-troff-ms', 'ms'],
    ['application/x-troff-msvideo', 'avi'],
    ['application/x-ustar', 'ustar'],
    ['application/x-visio', ['vsd', 'vst', 'vsw']],
    ['application/x-vnd.audioexplosion.mzz', 'mzz'],
    ['application/x-vnd.ls-xpix', 'xpix'],
    ['application/x-vrml', 'vrml'],
    ['application/x-wais-source', ['src', 'wsrc']],
    ['application/x-winhelp', 'hlp'],
    ['application/x-wintalk', 'wtk'],
    ['application/x-world', ['wrl', 'svr']],
    ['application/x-wpwin', 'wpd'],
    ['application/x-wri', 'wri'],
    ['application/x-x509-ca-cert', ['cer', 'crt', 'der']],
    ['application/x-x509-user-cert', 'crt'],
    ['application/x-xfig', 'fig'],
    ['application/x-xpinstall', 'xpi'],
    ['application/x-zip-compressed', 'zip'],
    ['application/xcap-diff+xml', 'xdf'],
    ['application/xenc+xml', 'xenc'],
    ['application/xhtml+xml', 'xhtml'],
    ['application/xml', 'xml'],
    ['application/xml-dtd', 'dtd'],
    ['application/xop+xml', 'xop'],
    ['application/xslt+xml', 'xslt'],
    ['application/xspf+xml', 'xspf'],
    ['application/xv+xml', 'mxml'],
    ['application/yang', 'yang'],
    ['application/yin+xml', 'yin'],
    ['application/ynd.ms-pkipko', 'pko'],
    ['application/zip', 'zip'],
    ['audio/adpcm', 'adp'],
    ['audio/aiff', ['aiff', 'aif', 'aifc']],
    ['audio/basic', ['snd', 'au']],
    ['audio/it', 'it'],
    ['audio/make', ['funk', 'my', 'pfunk']],
    ['audio/make.my.funk', 'pfunk'],
    ['audio/mid', ['mid', 'rmi']],
    ['audio/midi', ['midi', 'kar', 'mid']],
    ['audio/mod', 'mod'],
    ['audio/mp4', 'mp4a'],
    ['audio/mpeg', ['mpga', 'mp3', 'm2a', 'mp2', 'mpa', 'mpg']],
    ['audio/mpeg3', 'mp3'],
    ['audio/nspaudio', ['la', 'lma']],
    ['audio/ogg', 'oga'],
    ['audio/s3m', 's3m'],
    ['audio/tsp-audio', 'tsi'],
    ['audio/tsplayer', 'tsp'],
    ['audio/vnd.dece.audio', 'uva'],
    ['audio/vnd.digital-winds', 'eol'],
    ['audio/vnd.dra', 'dra'],
    ['audio/vnd.dts', 'dts'],
    ['audio/vnd.dts.hd', 'dtshd'],
    ['audio/vnd.lucent.voice', 'lvp'],
    ['audio/vnd.ms-playready.media.pya', 'pya'],
    ['audio/vnd.nuera.ecelp4800', 'ecelp4800'],
    ['audio/vnd.nuera.ecelp7470', 'ecelp7470'],
    ['audio/vnd.nuera.ecelp9600', 'ecelp9600'],
    ['audio/vnd.qcelp', 'qcp'],
    ['audio/vnd.rip', 'rip'],
    ['audio/voc', 'voc'],
    ['audio/voxware', 'vox'],
    ['audio/wav', 'wav'],
    ['audio/webm', 'weba'],
    ['audio/x-aac', 'aac'],
    ['audio/x-adpcm', 'snd'],
    ['audio/x-aiff', ['aiff', 'aif', 'aifc']],
    ['audio/x-au', 'au'],
    ['audio/x-gsm', ['gsd', 'gsm']],
    ['audio/x-jam', 'jam'],
    ['audio/x-liveaudio', 'lam'],
    ['audio/x-mid', ['mid', 'midi']],
    ['audio/x-midi', ['midi', 'mid']],
    ['audio/x-mod', 'mod'],
    ['audio/x-mpeg', 'mp2'],
    ['audio/x-mpeg-3', 'mp3'],
    ['audio/x-mpegurl', 'm3u'],
    ['audio/x-mpequrl', 'm3u'],
    ['audio/x-ms-wax', 'wax'],
    ['audio/x-ms-wma', 'wma'],
    ['audio/x-nspaudio', ['la', 'lma']],
    ['audio/x-pn-realaudio', ['ra', 'ram', 'rm', 'rmm', 'rmp']],
    ['audio/x-pn-realaudio-plugin', ['ra', 'rmp', 'rpm']],
    ['audio/x-psid', 'sid'],
    ['audio/x-realaudio', 'ra'],
    ['audio/x-twinvq', 'vqf'],
    ['audio/x-twinvq-plugin', ['vqe', 'vql']],
    ['audio/x-vnd.audioexplosion.mjuicemediafile', 'mjf'],
    ['audio/x-voc', 'voc'],
    ['audio/x-wav', 'wav'],
    ['audio/xm', 'xm'],
    ['chemical/x-cdx', 'cdx'],
    ['chemical/x-cif', 'cif'],
    ['chemical/x-cmdf', 'cmdf'],
    ['chemical/x-cml', 'cml'],
    ['chemical/x-csml', 'csml'],
    ['chemical/x-pdb', ['pdb', 'xyz']],
    ['chemical/x-xyz', 'xyz'],
    ['drawing/x-dwf', 'dwf'],
    ['i-world/i-vrml', 'ivr'],
    ['image/bmp', ['bmp', 'bm']],
    ['image/cgm', 'cgm'],
    ['image/cis-cod', 'cod'],
    ['image/cmu-raster', ['ras', 'rast']],
    ['image/fif', 'fif'],
    ['image/florian', ['flo', 'turbot']],
    ['image/g3fax', 'g3'],
    ['image/gif', 'gif'],
    ['image/ief', ['ief', 'iefs']],
    ['image/jpeg', ['jpeg', 'jpe', 'jpg', 'jfif', 'jfif-tbnl']],
    ['image/jutvision', 'jut'],
    ['image/ktx', 'ktx'],
    ['image/naplps', ['nap', 'naplps']],
    ['image/pict', ['pic', 'pict']],
    ['image/pipeg', 'jfif'],
    ['image/pjpeg', ['jfif', 'jpe', 'jpeg', 'jpg']],
    ['image/png', ['png', 'x-png']],
    ['image/prs.btif', 'btif'],
    ['image/svg+xml', 'svg'],
    ['image/tiff', ['tif', 'tiff']],
    ['image/vasa', 'mcf'],
    ['image/vnd.adobe.photoshop', 'psd'],
    ['image/vnd.dece.graphic', 'uvi'],
    ['image/vnd.djvu', 'djvu'],
    ['image/vnd.dvb.subtitle', 'sub'],
    ['image/vnd.dwg', ['dwg', 'dxf', 'svf']],
    ['image/vnd.dxf', 'dxf'],
    ['image/vnd.fastbidsheet', 'fbs'],
    ['image/vnd.fpx', 'fpx'],
    ['image/vnd.fst', 'fst'],
    ['image/vnd.fujixerox.edmics-mmr', 'mmr'],
    ['image/vnd.fujixerox.edmics-rlc', 'rlc'],
    ['image/vnd.ms-modi', 'mdi'],
    ['image/vnd.net-fpx', ['fpx', 'npx']],
    ['image/vnd.rn-realflash', 'rf'],
    ['image/vnd.rn-realpix', 'rp'],
    ['image/vnd.wap.wbmp', 'wbmp'],
    ['image/vnd.xiff', 'xif'],
    ['image/webp', 'webp'],
    ['image/x-cmu-raster', 'ras'],
    ['image/x-cmx', 'cmx'],
    ['image/x-dwg', ['dwg', 'dxf', 'svf']],
    ['image/x-freehand', 'fh'],
    ['image/x-icon', 'ico'],
    ['image/x-jg', 'art'],
    ['image/x-jps', 'jps'],
    ['image/x-niff', ['niff', 'nif']],
    ['image/x-pcx', 'pcx'],
    ['image/x-pict', ['pct', 'pic']],
    ['image/x-portable-anymap', 'pnm'],
    ['image/x-portable-bitmap', 'pbm'],
    ['image/x-portable-graymap', 'pgm'],
    ['image/x-portable-greymap', 'pgm'],
    ['image/x-portable-pixmap', 'ppm'],
    ['image/x-quicktime', ['qif', 'qti', 'qtif']],
    ['image/x-rgb', 'rgb'],
    ['image/x-tiff', ['tif', 'tiff']],
    ['image/x-windows-bmp', 'bmp'],
    ['image/x-xbitmap', 'xbm'],
    ['image/x-xbm', 'xbm'],
    ['image/x-xpixmap', ['xpm', 'pm']],
    ['image/x-xwd', 'xwd'],
    ['image/x-xwindowdump', 'xwd'],
    ['image/xbm', 'xbm'],
    ['image/xpm', 'xpm'],
    ['message/rfc822', ['eml', 'mht', 'mhtml', 'nws', 'mime']],
    ['model/iges', ['iges', 'igs']],
    ['model/mesh', 'msh'],
    ['model/vnd.collada+xml', 'dae'],
    ['model/vnd.dwf', 'dwf'],
    ['model/vnd.gdl', 'gdl'],
    ['model/vnd.gtw', 'gtw'],
    ['model/vnd.mts', 'mts'],
    ['model/vnd.vtu', 'vtu'],
    ['model/vrml', ['vrml', 'wrl', 'wrz']],
    ['model/x-pov', 'pov'],
    ['multipart/x-gzip', 'gzip'],
    ['multipart/x-ustar', 'ustar'],
    ['multipart/x-zip', 'zip'],
    ['music/crescendo', ['mid', 'midi']],
    ['music/x-karaoke', 'kar'],
    ['paleovu/x-pv', 'pvu'],
    ['text/asp', 'asp'],
    ['text/calendar', 'ics'],
    ['text/css', 'css'],
    ['text/csv', 'csv'],
    ['text/ecmascript', 'js'],
    ['text/h323', '323'],
    ['text/html', ['html', 'htm', 'stm', 'acgi', 'htmls', 'htx', 'shtml']],
    ['text/iuls', 'uls'],
    ['text/javascript', 'js'],
    ['text/mcf', 'mcf'],
    ['text/n3', 'n3'],
    ['text/pascal', 'pas'],
    [
        'text/plain',
        [
            'txt',
            'bas',
            'c',
            'h',
            'c++',
            'cc',
            'com',
            'conf',
            'cxx',
            'def',
            'f',
            'f90',
            'for',
            'g',
            'hh',
            'idc',
            'jav',
            'java',
            'list',
            'log',
            'lst',
            'm',
            'mar',
            'pl',
            'sdml',
            'text'
        ]
    ],
    ['text/plain-bas', 'par'],
    ['text/prs.lines.tag', 'dsc'],
    ['text/richtext', ['rtx', 'rt', 'rtf']],
    ['text/scriplet', 'wsc'],
    ['text/scriptlet', 'sct'],
    ['text/sgml', ['sgm', 'sgml']],
    ['text/tab-separated-values', 'tsv'],
    ['text/troff', 't'],
    ['text/turtle', 'ttl'],
    ['text/uri-list', ['uni', 'unis', 'uri', 'uris']],
    ['text/vnd.abc', 'abc'],
    ['text/vnd.curl', 'curl'],
    ['text/vnd.curl.dcurl', 'dcurl'],
    ['text/vnd.curl.mcurl', 'mcurl'],
    ['text/vnd.curl.scurl', 'scurl'],
    ['text/vnd.fly', 'fly'],
    ['text/vnd.fmi.flexstor', 'flx'],
    ['text/vnd.graphviz', 'gv'],
    ['text/vnd.in3d.3dml', '3dml'],
    ['text/vnd.in3d.spot', 'spot'],
    ['text/vnd.rn-realtext', 'rt'],
    ['text/vnd.sun.j2me.app-descriptor', 'jad'],
    ['text/vnd.wap.wml', 'wml'],
    ['text/vnd.wap.wmlscript', 'wmls'],
    ['text/webviewhtml', 'htt'],
    ['text/x-asm', ['asm', 's']],
    ['text/x-audiosoft-intra', 'aip'],
    ['text/x-c', ['c', 'cc', 'cpp']],
    ['text/x-component', 'htc'],
    ['text/x-fortran', ['for', 'f', 'f77', 'f90']],
    ['text/x-h', ['h', 'hh']],
    ['text/x-java-source', ['java', 'jav']],
    ['text/x-java-source,java', 'java'],
    ['text/x-la-asf', 'lsx'],
    ['text/x-m', 'm'],
    ['text/x-pascal', 'p'],
    ['text/x-script', 'hlb'],
    ['text/x-script.csh', 'csh'],
    ['text/x-script.elisp', 'el'],
    ['text/x-script.guile', 'scm'],
    ['text/x-script.ksh', 'ksh'],
    ['text/x-script.lisp', 'lsp'],
    ['text/x-script.perl', 'pl'],
    ['text/x-script.perl-module', 'pm'],
    ['text/x-script.phyton', 'py'],
    ['text/x-script.rexx', 'rexx'],
    ['text/x-script.scheme', 'scm'],
    ['text/x-script.sh', 'sh'],
    ['text/x-script.tcl', 'tcl'],
    ['text/x-script.tcsh', 'tcsh'],
    ['text/x-script.zsh', 'zsh'],
    ['text/x-server-parsed-html', ['shtml', 'ssi']],
    ['text/x-setext', 'etx'],
    ['text/x-sgml', ['sgm', 'sgml']],
    ['text/x-speech', ['spc', 'talk']],
    ['text/x-uil', 'uil'],
    ['text/x-uuencode', ['uu', 'uue']],
    ['text/x-vcalendar', 'vcs'],
    ['text/x-vcard', 'vcf'],
    ['text/xml', 'xml'],
    ['video/3gpp', '3gp'],
    ['video/3gpp2', '3g2'],
    ['video/animaflex', 'afl'],
    ['video/avi', 'avi'],
    ['video/avs-video', 'avs'],
    ['video/dl', 'dl'],
    ['video/fli', 'fli'],
    ['video/gl', 'gl'],
    ['video/h261', 'h261'],
    ['video/h263', 'h263'],
    ['video/h264', 'h264'],
    ['video/jpeg', 'jpgv'],
    ['video/jpm', 'jpm'],
    ['video/mj2', 'mj2'],
    ['video/mp4', 'mp4'],
    ['video/mpeg', ['mpeg', 'mp2', 'mpa', 'mpe', 'mpg', 'mpv2', 'm1v', 'm2v', 'mp3']],
    ['video/msvideo', 'avi'],
    ['video/ogg', 'ogv'],
    ['video/quicktime', ['mov', 'qt', 'moov']],
    ['video/vdo', 'vdo'],
    ['video/vivo', ['viv', 'vivo']],
    ['video/vnd.dece.hd', 'uvh'],
    ['video/vnd.dece.mobile', 'uvm'],
    ['video/vnd.dece.pd', 'uvp'],
    ['video/vnd.dece.sd', 'uvs'],
    ['video/vnd.dece.video', 'uvv'],
    ['video/vnd.fvt', 'fvt'],
    ['video/vnd.mpegurl', 'mxu'],
    ['video/vnd.ms-playready.media.pyv', 'pyv'],
    ['video/vnd.rn-realvideo', 'rv'],
    ['video/vnd.uvvu.mp4', 'uvu'],
    ['video/vnd.vivo', ['viv', 'vivo']],
    ['video/vosaic', 'vos'],
    ['video/webm', 'webm'],
    ['video/x-amt-demorun', 'xdr'],
    ['video/x-amt-showrun', 'xsr'],
    ['video/x-atomic3d-feature', 'fmf'],
    ['video/x-dl', 'dl'],
    ['video/x-dv', ['dif', 'dv']],
    ['video/x-f4v', 'f4v'],
    ['video/x-fli', 'fli'],
    ['video/x-flv', 'flv'],
    ['video/x-gl', 'gl'],
    ['video/x-isvideo', 'isu'],
    ['video/x-la-asf', ['lsf', 'lsx']],
    ['video/x-m4v', 'm4v'],
    ['video/x-motion-jpeg', 'mjpg'],
    ['video/x-mpeg', ['mp3', 'mp2']],
    ['video/x-mpeq2a', 'mp2'],
    ['video/x-ms-asf', ['asf', 'asr', 'asx']],
    ['video/x-ms-asf-plugin', 'asx'],
    ['video/x-ms-wm', 'wm'],
    ['video/x-ms-wmv', 'wmv'],
    ['video/x-ms-wmx', 'wmx'],
    ['video/x-ms-wvx', 'wvx'],
    ['video/x-msvideo', 'avi'],
    ['video/x-qtc', 'qtc'],
    ['video/x-scm', 'scm'],
    ['video/x-sgi-movie', ['movie', 'mv']],
    ['windows/metafile', 'wmf'],
    ['www/mime', 'mime'],
    ['x-conference/x-cooltalk', 'ice'],
    ['x-music/x-midi', ['mid', 'midi']],
    ['x-world/x-3dmf', ['3dm', '3dmf', 'qd3', 'qd3d']],
    ['x-world/x-svr', 'svr'],
    ['x-world/x-vrml', ['flr', 'vrml', 'wrl', 'wrz', 'xaf', 'xof']],
    ['x-world/x-vrt', 'vrt'],
    ['xgl/drawing', 'xgz'],
    ['xgl/movie', 'xmz']
]);
const extensions = new Map([
    ['123', 'application/vnd.lotus-1-2-3'],
    ['323', 'text/h323'],
    ['*', 'application/octet-stream'],
    ['3dm', 'x-world/x-3dmf'],
    ['3dmf', 'x-world/x-3dmf'],
    ['3dml', 'text/vnd.in3d.3dml'],
    ['3g2', 'video/3gpp2'],
    ['3gp', 'video/3gpp'],
    ['7z', 'application/x-7z-compressed'],
    ['a', 'application/octet-stream'],
    ['aab', 'application/x-authorware-bin'],
    ['aac', 'audio/x-aac'],
    ['aam', 'application/x-authorware-map'],
    ['aas', 'application/x-authorware-seg'],
    ['abc', 'text/vnd.abc'],
    ['abw', 'application/x-abiword'],
    ['ac', 'application/pkix-attr-cert'],
    ['acc', 'application/vnd.americandynamics.acc'],
    ['ace', 'application/x-ace-compressed'],
    ['acgi', 'text/html'],
    ['acu', 'application/vnd.acucobol'],
    ['acx', 'application/internet-property-stream'],
    ['adp', 'audio/adpcm'],
    ['aep', 'application/vnd.audiograph'],
    ['afl', 'video/animaflex'],
    ['afp', 'application/vnd.ibm.modcap'],
    ['ahead', 'application/vnd.ahead.space'],
    ['ai', 'application/postscript'],
    ['aif', ['audio/aiff', 'audio/x-aiff']],
    ['aifc', ['audio/aiff', 'audio/x-aiff']],
    ['aiff', ['audio/aiff', 'audio/x-aiff']],
    ['aim', 'application/x-aim'],
    ['aip', 'text/x-audiosoft-intra'],
    ['air', 'application/vnd.adobe.air-application-installer-package+zip'],
    ['ait', 'application/vnd.dvb.ait'],
    ['ami', 'application/vnd.amiga.ami'],
    ['ani', 'application/x-navi-animation'],
    ['aos', 'application/x-nokia-9000-communicator-add-on-software'],
    ['apk', 'application/vnd.android.package-archive'],
    ['application', 'application/x-ms-application'],
    ['apr', 'application/vnd.lotus-approach'],
    ['aps', 'application/mime'],
    ['arc', 'application/octet-stream'],
    ['arj', ['application/arj', 'application/octet-stream']],
    ['art', 'image/x-jg'],
    ['asf', 'video/x-ms-asf'],
    ['asm', 'text/x-asm'],
    ['aso', 'application/vnd.accpac.simply.aso'],
    ['asp', 'text/asp'],
    ['asr', 'video/x-ms-asf'],
    ['asx', ['video/x-ms-asf', 'application/x-mplayer2', 'video/x-ms-asf-plugin']],
    ['atc', 'application/vnd.acucorp'],
    ['atomcat', 'application/atomcat+xml'],
    ['atomsvc', 'application/atomsvc+xml'],
    ['atx', 'application/vnd.antix.game-component'],
    ['au', ['audio/basic', 'audio/x-au']],
    ['avi', ['video/avi', 'video/msvideo', 'application/x-troff-msvideo', 'video/x-msvideo']],
    ['avs', 'video/avs-video'],
    ['aw', 'application/applixware'],
    ['axs', 'application/olescript'],
    ['azf', 'application/vnd.airzip.filesecure.azf'],
    ['azs', 'application/vnd.airzip.filesecure.azs'],
    ['azw', 'application/vnd.amazon.ebook'],
    ['bas', 'text/plain'],
    ['bcpio', 'application/x-bcpio'],
    ['bdf', 'application/x-font-bdf'],
    ['bdm', 'application/vnd.syncml.dm+wbxml'],
    ['bed', 'application/vnd.realvnc.bed'],
    ['bh2', 'application/vnd.fujitsu.oasysprs'],
    ['bin', ['application/octet-stream', 'application/mac-binary', 'application/macbinary', 'application/x-macbinary', 'application/x-binary']],
    ['bm', 'image/bmp'],
    ['bmi', 'application/vnd.bmi'],
    ['bmp', ['image/bmp', 'image/x-windows-bmp']],
    ['boo', 'application/book'],
    ['book', 'application/book'],
    ['box', 'application/vnd.previewsystems.box'],
    ['boz', 'application/x-bzip2'],
    ['bsh', 'application/x-bsh'],
    ['btif', 'image/prs.btif'],
    ['bz', 'application/x-bzip'],
    ['bz2', 'application/x-bzip2'],
    ['c', ['text/plain', 'text/x-c']],
    ['c++', 'text/plain'],
    ['c11amc', 'application/vnd.cluetrust.cartomobile-config'],
    ['c11amz', 'application/vnd.cluetrust.cartomobile-config-pkg'],
    ['c4g', 'application/vnd.clonk.c4group'],
    ['cab', 'application/vnd.ms-cab-compressed'],
    ['car', 'application/vnd.curl.car'],
    ['cat', ['application/vnd.ms-pkiseccat', 'application/vnd.ms-pki.seccat']],
    ['cc', ['text/plain', 'text/x-c']],
    ['ccad', 'application/clariscad'],
    ['cco', 'application/x-cocoa'],
    ['ccxml', 'application/ccxml+xml,'],
    ['cdbcmsg', 'application/vnd.contact.cmsg'],
    ['cdf', ['application/cdf', 'application/x-cdf', 'application/x-netcdf']],
    ['cdkey', 'application/vnd.mediastation.cdkey'],
    ['cdmia', 'application/cdmi-capability'],
    ['cdmic', 'application/cdmi-container'],
    ['cdmid', 'application/cdmi-domain'],
    ['cdmio', 'application/cdmi-object'],
    ['cdmiq', 'application/cdmi-queue'],
    ['cdx', 'chemical/x-cdx'],
    ['cdxml', 'application/vnd.chemdraw+xml'],
    ['cdy', 'application/vnd.cinderella'],
    ['cer', ['application/pkix-cert', 'application/x-x509-ca-cert']],
    ['cgm', 'image/cgm'],
    ['cha', 'application/x-chat'],
    ['chat', 'application/x-chat'],
    ['chm', 'application/vnd.ms-htmlhelp'],
    ['chrt', 'application/vnd.kde.kchart'],
    ['cif', 'chemical/x-cif'],
    ['cii', 'application/vnd.anser-web-certificate-issue-initiation'],
    ['cil', 'application/vnd.ms-artgalry'],
    ['cla', 'application/vnd.claymore'],
    ['class', ['application/octet-stream', 'application/java', 'application/java-byte-code', 'application/java-vm', 'application/x-java-class']],
    ['clkk', 'application/vnd.crick.clicker.keyboard'],
    ['clkp', 'application/vnd.crick.clicker.palette'],
    ['clkt', 'application/vnd.crick.clicker.template'],
    ['clkw', 'application/vnd.crick.clicker.wordbank'],
    ['clkx', 'application/vnd.crick.clicker'],
    ['clp', 'application/x-msclip'],
    ['cmc', 'application/vnd.cosmocaller'],
    ['cmdf', 'chemical/x-cmdf'],
    ['cml', 'chemical/x-cml'],
    ['cmp', 'application/vnd.yellowriver-custom-menu'],
    ['cmx', 'image/x-cmx'],
    ['cod', ['image/cis-cod', 'application/vnd.rim.cod']],
    ['com', ['application/octet-stream', 'text/plain']],
    ['conf', 'text/plain'],
    ['cpio', 'application/x-cpio'],
    ['cpp', 'text/x-c'],
    ['cpt', ['application/mac-compactpro', 'application/x-compactpro', 'application/x-cpt']],
    ['crd', 'application/x-mscardfile'],
    ['crl', ['application/pkix-crl', 'application/pkcs-crl']],
    ['crt', ['application/pkix-cert', 'application/x-x509-user-cert', 'application/x-x509-ca-cert']],
    ['cryptonote', 'application/vnd.rig.cryptonote'],
    ['csh', ['text/x-script.csh', 'application/x-csh']],
    ['csml', 'chemical/x-csml'],
    ['csp', 'application/vnd.commonspace'],
    ['css', ['text/css', 'application/x-pointplus']],
    ['csv', 'text/csv'],
    ['cu', 'application/cu-seeme'],
    ['curl', 'text/vnd.curl'],
    ['cww', 'application/prs.cww'],
    ['cxx', 'text/plain'],
    ['dae', 'model/vnd.collada+xml'],
    ['daf', 'application/vnd.mobius.daf'],
    ['davmount', 'application/davmount+xml'],
    ['dcr', 'application/x-director'],
    ['dcurl', 'text/vnd.curl.dcurl'],
    ['dd2', 'application/vnd.oma.dd2+xml'],
    ['ddd', 'application/vnd.fujixerox.ddd'],
    ['deb', 'application/x-debian-package'],
    ['deepv', 'application/x-deepv'],
    ['def', 'text/plain'],
    ['der', 'application/x-x509-ca-cert'],
    ['dfac', 'application/vnd.dreamfactory'],
    ['dif', 'video/x-dv'],
    ['dir', 'application/x-director'],
    ['dis', 'application/vnd.mobius.dis'],
    ['djvu', 'image/vnd.djvu'],
    ['dl', ['video/dl', 'video/x-dl']],
    ['dll', 'application/x-msdownload'],
    ['dms', 'application/octet-stream'],
    ['dna', 'application/vnd.dna'],
    ['doc', 'application/msword'],
    ['docm', 'application/vnd.ms-word.document.macroenabled.12'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['dot', 'application/msword'],
    ['dotm', 'application/vnd.ms-word.template.macroenabled.12'],
    ['dotx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.template'],
    ['dp', ['application/commonground', 'application/vnd.osgi.dp']],
    ['dpg', 'application/vnd.dpgraph'],
    ['dra', 'audio/vnd.dra'],
    ['drw', 'application/drafting'],
    ['dsc', 'text/prs.lines.tag'],
    ['dssc', 'application/dssc+der'],
    ['dtb', 'application/x-dtbook+xml'],
    ['dtd', 'application/xml-dtd'],
    ['dts', 'audio/vnd.dts'],
    ['dtshd', 'audio/vnd.dts.hd'],
    ['dump', 'application/octet-stream'],
    ['dv', 'video/x-dv'],
    ['dvi', 'application/x-dvi'],
    ['dwf', ['model/vnd.dwf', 'drawing/x-dwf']],
    ['dwg', ['application/acad', 'image/vnd.dwg', 'image/x-dwg']],
    ['dxf', ['application/dxf', 'image/vnd.dwg', 'image/vnd.dxf', 'image/x-dwg']],
    ['dxp', 'application/vnd.spotfire.dxp'],
    ['dxr', 'application/x-director'],
    ['ecelp4800', 'audio/vnd.nuera.ecelp4800'],
    ['ecelp7470', 'audio/vnd.nuera.ecelp7470'],
    ['ecelp9600', 'audio/vnd.nuera.ecelp9600'],
    ['edm', 'application/vnd.novadigm.edm'],
    ['edx', 'application/vnd.novadigm.edx'],
    ['efif', 'application/vnd.picsel'],
    ['ei6', 'application/vnd.pg.osasli'],
    ['el', 'text/x-script.elisp'],
    ['elc', ['application/x-elc', 'application/x-bytecode.elisp']],
    ['eml', 'message/rfc822'],
    ['emma', 'application/emma+xml'],
    ['env', 'application/x-envoy'],
    ['eol', 'audio/vnd.digital-winds'],
    ['eot', 'application/vnd.ms-fontobject'],
    ['eps', 'application/postscript'],
    ['epub', 'application/epub+zip'],
    ['es', ['application/ecmascript', 'application/x-esrehber']],
    ['es3', 'application/vnd.eszigno3+xml'],
    ['esf', 'application/vnd.epson.esf'],
    ['etx', 'text/x-setext'],
    ['evy', ['application/envoy', 'application/x-envoy']],
    ['exe', ['application/octet-stream', 'application/x-msdownload']],
    ['exi', 'application/exi'],
    ['ext', 'application/vnd.novadigm.ext'],
    ['ez2', 'application/vnd.ezpix-album'],
    ['ez3', 'application/vnd.ezpix-package'],
    ['f', ['text/plain', 'text/x-fortran']],
    ['f4v', 'video/x-f4v'],
    ['f77', 'text/x-fortran'],
    ['f90', ['text/plain', 'text/x-fortran']],
    ['fbs', 'image/vnd.fastbidsheet'],
    ['fcs', 'application/vnd.isac.fcs'],
    ['fdf', 'application/vnd.fdf'],
    ['fe_launch', 'application/vnd.denovo.fcselayout-link'],
    ['fg5', 'application/vnd.fujitsu.oasysgp'],
    ['fh', 'image/x-freehand'],
    ['fif', ['application/fractals', 'image/fif']],
    ['fig', 'application/x-xfig'],
    ['fli', ['video/fli', 'video/x-fli']],
    ['flo', ['image/florian', 'application/vnd.micrografx.flo']],
    ['flr', 'x-world/x-vrml'],
    ['flv', 'video/x-flv'],
    ['flw', 'application/vnd.kde.kivio'],
    ['flx', 'text/vnd.fmi.flexstor'],
    ['fly', 'text/vnd.fly'],
    ['fm', 'application/vnd.framemaker'],
    ['fmf', 'video/x-atomic3d-feature'],
    ['fnc', 'application/vnd.frogans.fnc'],
    ['for', ['text/plain', 'text/x-fortran']],
    ['fpx', ['image/vnd.fpx', 'image/vnd.net-fpx']],
    ['frl', 'application/freeloader'],
    ['fsc', 'application/vnd.fsc.weblaunch'],
    ['fst', 'image/vnd.fst'],
    ['ftc', 'application/vnd.fluxtime.clip'],
    ['fti', 'application/vnd.anser-web-funds-transfer-initiation'],
    ['funk', 'audio/make'],
    ['fvt', 'video/vnd.fvt'],
    ['fxp', 'application/vnd.adobe.fxp'],
    ['fzs', 'application/vnd.fuzzysheet'],
    ['g', 'text/plain'],
    ['g2w', 'application/vnd.geoplan'],
    ['g3', 'image/g3fax'],
    ['g3w', 'application/vnd.geospace'],
    ['gac', 'application/vnd.groove-account'],
    ['gdl', 'model/vnd.gdl'],
    ['geo', 'application/vnd.dynageo'],
    ['geojson', 'application/geo+json'],
    ['gex', 'application/vnd.geometry-explorer'],
    ['ggb', 'application/vnd.geogebra.file'],
    ['ggt', 'application/vnd.geogebra.tool'],
    ['ghf', 'application/vnd.groove-help'],
    ['gif', 'image/gif'],
    ['gim', 'application/vnd.groove-identity-message'],
    ['gl', ['video/gl', 'video/x-gl']],
    ['gmx', 'application/vnd.gmx'],
    ['gnumeric', 'application/x-gnumeric'],
    ['gph', 'application/vnd.flographit'],
    ['gqf', 'application/vnd.grafeq'],
    ['gram', 'application/srgs'],
    ['grv', 'application/vnd.groove-injector'],
    ['grxml', 'application/srgs+xml'],
    ['gsd', 'audio/x-gsm'],
    ['gsf', 'application/x-font-ghostscript'],
    ['gsm', 'audio/x-gsm'],
    ['gsp', 'application/x-gsp'],
    ['gss', 'application/x-gss'],
    ['gtar', 'application/x-gtar'],
    ['gtm', 'application/vnd.groove-tool-message'],
    ['gtw', 'model/vnd.gtw'],
    ['gv', 'text/vnd.graphviz'],
    ['gxt', 'application/vnd.geonext'],
    ['gz', ['application/x-gzip', 'application/x-compressed']],
    ['gzip', ['multipart/x-gzip', 'application/x-gzip']],
    ['h', ['text/plain', 'text/x-h']],
    ['h261', 'video/h261'],
    ['h263', 'video/h263'],
    ['h264', 'video/h264'],
    ['hal', 'application/vnd.hal+xml'],
    ['hbci', 'application/vnd.hbci'],
    ['hdf', 'application/x-hdf'],
    ['help', 'application/x-helpfile'],
    ['hgl', 'application/vnd.hp-hpgl'],
    ['hh', ['text/plain', 'text/x-h']],
    ['hlb', 'text/x-script'],
    ['hlp', ['application/winhlp', 'application/hlp', 'application/x-helpfile', 'application/x-winhelp']],
    ['hpg', 'application/vnd.hp-hpgl'],
    ['hpgl', 'application/vnd.hp-hpgl'],
    ['hpid', 'application/vnd.hp-hpid'],
    ['hps', 'application/vnd.hp-hps'],
    [
        'hqx',
        [
            'application/mac-binhex40',
            'application/binhex',
            'application/binhex4',
            'application/mac-binhex',
            'application/x-binhex40',
            'application/x-mac-binhex40'
        ]
    ],
    ['hta', 'application/hta'],
    ['htc', 'text/x-component'],
    ['htke', 'application/vnd.kenameaapp'],
    ['htm', 'text/html'],
    ['html', 'text/html'],
    ['htmls', 'text/html'],
    ['htt', 'text/webviewhtml'],
    ['htx', 'text/html'],
    ['hvd', 'application/vnd.yamaha.hv-dic'],
    ['hvp', 'application/vnd.yamaha.hv-voice'],
    ['hvs', 'application/vnd.yamaha.hv-script'],
    ['i2g', 'application/vnd.intergeo'],
    ['icc', 'application/vnd.iccprofile'],
    ['ice', 'x-conference/x-cooltalk'],
    ['ico', 'image/x-icon'],
    ['ics', 'text/calendar'],
    ['idc', 'text/plain'],
    ['ief', 'image/ief'],
    ['iefs', 'image/ief'],
    ['ifm', 'application/vnd.shana.informed.formdata'],
    ['iges', ['application/iges', 'model/iges']],
    ['igl', 'application/vnd.igloader'],
    ['igm', 'application/vnd.insors.igm'],
    ['igs', ['application/iges', 'model/iges']],
    ['igx', 'application/vnd.micrografx.igx'],
    ['iif', 'application/vnd.shana.informed.interchange'],
    ['iii', 'application/x-iphone'],
    ['ima', 'application/x-ima'],
    ['imap', 'application/x-httpd-imap'],
    ['imp', 'application/vnd.accpac.simply.imp'],
    ['ims', 'application/vnd.ms-ims'],
    ['inf', 'application/inf'],
    ['ins', ['application/x-internet-signup', 'application/x-internett-signup']],
    ['ip', 'application/x-ip2'],
    ['ipfix', 'application/ipfix'],
    ['ipk', 'application/vnd.shana.informed.package'],
    ['irm', 'application/vnd.ibm.rights-management'],
    ['irp', 'application/vnd.irepository.package+xml'],
    ['isp', 'application/x-internet-signup'],
    ['isu', 'video/x-isvideo'],
    ['it', 'audio/it'],
    ['itp', 'application/vnd.shana.informed.formtemplate'],
    ['iv', 'application/x-inventor'],
    ['ivp', 'application/vnd.immervision-ivp'],
    ['ivr', 'i-world/i-vrml'],
    ['ivu', 'application/vnd.immervision-ivu'],
    ['ivy', 'application/x-livescreen'],
    ['jad', 'text/vnd.sun.j2me.app-descriptor'],
    ['jam', ['application/vnd.jam', 'audio/x-jam']],
    ['jar', 'application/java-archive'],
    ['jav', ['text/plain', 'text/x-java-source']],
    ['java', ['text/plain', 'text/x-java-source,java', 'text/x-java-source']],
    ['jcm', 'application/x-java-commerce'],
    ['jfif', ['image/pipeg', 'image/jpeg', 'image/pjpeg']],
    ['jfif-tbnl', 'image/jpeg'],
    ['jisp', 'application/vnd.jisp'],
    ['jlt', 'application/vnd.hp-jlyt'],
    ['jnlp', 'application/x-java-jnlp-file'],
    ['joda', 'application/vnd.joost.joda-archive'],
    ['jpe', ['image/jpeg', 'image/pjpeg']],
    ['jpeg', ['image/jpeg', 'image/pjpeg']],
    ['jpg', ['image/jpeg', 'image/pjpeg']],
    ['jpgv', 'video/jpeg'],
    ['jpm', 'video/jpm'],
    ['jps', 'image/x-jps'],
    ['js', ['application/javascript', 'application/ecmascript', 'text/javascript', 'text/ecmascript', 'application/x-javascript']],
    ['json', 'application/json'],
    ['jut', 'image/jutvision'],
    ['kar', ['audio/midi', 'music/x-karaoke']],
    ['karbon', 'application/vnd.kde.karbon'],
    ['kfo', 'application/vnd.kde.kformula'],
    ['kia', 'application/vnd.kidspiration'],
    ['kml', 'application/vnd.google-earth.kml+xml'],
    ['kmz', 'application/vnd.google-earth.kmz'],
    ['kne', 'application/vnd.kinar'],
    ['kon', 'application/vnd.kde.kontour'],
    ['kpr', 'application/vnd.kde.kpresenter'],
    ['ksh', ['application/x-ksh', 'text/x-script.ksh']],
    ['ksp', 'application/vnd.kde.kspread'],
    ['ktx', 'image/ktx'],
    ['ktz', 'application/vnd.kahootz'],
    ['kwd', 'application/vnd.kde.kword'],
    ['la', ['audio/nspaudio', 'audio/x-nspaudio']],
    ['lam', 'audio/x-liveaudio'],
    ['lasxml', 'application/vnd.las.las+xml'],
    ['latex', 'application/x-latex'],
    ['lbd', 'application/vnd.llamagraphics.life-balance.desktop'],
    ['lbe', 'application/vnd.llamagraphics.life-balance.exchange+xml'],
    ['les', 'application/vnd.hhe.lesson-player'],
    ['lha', ['application/octet-stream', 'application/lha', 'application/x-lha']],
    ['lhx', 'application/octet-stream'],
    ['link66', 'application/vnd.route66.link66+xml'],
    ['list', 'text/plain'],
    ['lma', ['audio/nspaudio', 'audio/x-nspaudio']],
    ['log', 'text/plain'],
    ['lrm', 'application/vnd.ms-lrm'],
    ['lsf', 'video/x-la-asf'],
    ['lsp', ['application/x-lisp', 'text/x-script.lisp']],
    ['lst', 'text/plain'],
    ['lsx', ['video/x-la-asf', 'text/x-la-asf']],
    ['ltf', 'application/vnd.frogans.ltf'],
    ['ltx', 'application/x-latex'],
    ['lvp', 'audio/vnd.lucent.voice'],
    ['lwp', 'application/vnd.lotus-wordpro'],
    ['lzh', ['application/octet-stream', 'application/x-lzh']],
    ['lzx', ['application/lzx', 'application/octet-stream', 'application/x-lzx']],
    ['m', ['text/plain', 'text/x-m']],
    ['m13', 'application/x-msmediaview'],
    ['m14', 'application/x-msmediaview'],
    ['m1v', 'video/mpeg'],
    ['m21', 'application/mp21'],
    ['m2a', 'audio/mpeg'],
    ['m2v', 'video/mpeg'],
    ['m3u', ['audio/x-mpegurl', 'audio/x-mpequrl']],
    ['m3u8', 'application/vnd.apple.mpegurl'],
    ['m4v', 'video/x-m4v'],
    ['ma', 'application/mathematica'],
    ['mads', 'application/mads+xml'],
    ['mag', 'application/vnd.ecowin.chart'],
    ['man', 'application/x-troff-man'],
    ['map', 'application/x-navimap'],
    ['mar', 'text/plain'],
    ['mathml', 'application/mathml+xml'],
    ['mbd', 'application/mbedlet'],
    ['mbk', 'application/vnd.mobius.mbk'],
    ['mbox', 'application/mbox'],
    ['mc$', 'application/x-magic-cap-package-1.0'],
    ['mc1', 'application/vnd.medcalcdata'],
    ['mcd', ['application/mcad', 'application/vnd.mcd', 'application/x-mathcad']],
    ['mcf', ['image/vasa', 'text/mcf']],
    ['mcp', 'application/netmc'],
    ['mcurl', 'text/vnd.curl.mcurl'],
    ['mdb', 'application/x-msaccess'],
    ['mdi', 'image/vnd.ms-modi'],
    ['me', 'application/x-troff-me'],
    ['meta4', 'application/metalink4+xml'],
    ['mets', 'application/mets+xml'],
    ['mfm', 'application/vnd.mfmp'],
    ['mgp', 'application/vnd.osgeo.mapguide.package'],
    ['mgz', 'application/vnd.proteus.magazine'],
    ['mht', 'message/rfc822'],
    ['mhtml', 'message/rfc822'],
    ['mid', ['audio/mid', 'audio/midi', 'music/crescendo', 'x-music/x-midi', 'audio/x-midi', 'application/x-midi', 'audio/x-mid']],
    ['midi', ['audio/midi', 'music/crescendo', 'x-music/x-midi', 'audio/x-midi', 'application/x-midi', 'audio/x-mid']],
    ['mif', ['application/vnd.mif', 'application/x-mif', 'application/x-frame']],
    ['mime', ['message/rfc822', 'www/mime']],
    ['mj2', 'video/mj2'],
    ['mjf', 'audio/x-vnd.audioexplosion.mjuicemediafile'],
    ['mjpg', 'video/x-motion-jpeg'],
    ['mlp', 'application/vnd.dolby.mlp'],
    ['mm', ['application/base64', 'application/x-meme']],
    ['mmd', 'application/vnd.chipnuts.karaoke-mmd'],
    ['mme', 'application/base64'],
    ['mmf', 'application/vnd.smaf'],
    ['mmr', 'image/vnd.fujixerox.edmics-mmr'],
    ['mny', 'application/x-msmoney'],
    ['mod', ['audio/mod', 'audio/x-mod']],
    ['mods', 'application/mods+xml'],
    ['moov', 'video/quicktime'],
    ['mov', 'video/quicktime'],
    ['movie', 'video/x-sgi-movie'],
    ['mp2', ['video/mpeg', 'audio/mpeg', 'video/x-mpeg', 'audio/x-mpeg', 'video/x-mpeq2a']],
    ['mp3', ['audio/mpeg', 'audio/mpeg3', 'video/mpeg', 'audio/x-mpeg-3', 'video/x-mpeg']],
    ['mp4', ['video/mp4', 'application/mp4']],
    ['mp4a', 'audio/mp4'],
    ['mpa', ['video/mpeg', 'audio/mpeg']],
    ['mpc', ['application/vnd.mophun.certificate', 'application/x-project']],
    ['mpe', 'video/mpeg'],
    ['mpeg', 'video/mpeg'],
    ['mpg', ['video/mpeg', 'audio/mpeg']],
    ['mpga', 'audio/mpeg'],
    ['mpkg', 'application/vnd.apple.installer+xml'],
    ['mpm', 'application/vnd.blueice.multipass'],
    ['mpn', 'application/vnd.mophun.application'],
    ['mpp', 'application/vnd.ms-project'],
    ['mpt', 'application/x-project'],
    ['mpv', 'application/x-project'],
    ['mpv2', 'video/mpeg'],
    ['mpx', 'application/x-project'],
    ['mpy', 'application/vnd.ibm.minipay'],
    ['mqy', 'application/vnd.mobius.mqy'],
    ['mrc', 'application/marc'],
    ['mrcx', 'application/marcxml+xml'],
    ['ms', 'application/x-troff-ms'],
    ['mscml', 'application/mediaservercontrol+xml'],
    ['mseq', 'application/vnd.mseq'],
    ['msf', 'application/vnd.epson.msf'],
    ['msg', 'application/vnd.ms-outlook'],
    ['msh', 'model/mesh'],
    ['msl', 'application/vnd.mobius.msl'],
    ['msty', 'application/vnd.muvee.style'],
    ['mts', 'model/vnd.mts'],
    ['mus', 'application/vnd.musician'],
    ['musicxml', 'application/vnd.recordare.musicxml+xml'],
    ['mv', 'video/x-sgi-movie'],
    ['mvb', 'application/x-msmediaview'],
    ['mwf', 'application/vnd.mfer'],
    ['mxf', 'application/mxf'],
    ['mxl', 'application/vnd.recordare.musicxml'],
    ['mxml', 'application/xv+xml'],
    ['mxs', 'application/vnd.triscape.mxs'],
    ['mxu', 'video/vnd.mpegurl'],
    ['my', 'audio/make'],
    ['mzz', 'application/x-vnd.audioexplosion.mzz'],
    ['n-gage', 'application/vnd.nokia.n-gage.symbian.install'],
    ['n3', 'text/n3'],
    ['nap', 'image/naplps'],
    ['naplps', 'image/naplps'],
    ['nbp', 'application/vnd.wolfram.player'],
    ['nc', 'application/x-netcdf'],
    ['ncm', 'application/vnd.nokia.configuration-message'],
    ['ncx', 'application/x-dtbncx+xml'],
    ['ngdat', 'application/vnd.nokia.n-gage.data'],
    ['nif', 'image/x-niff'],
    ['niff', 'image/x-niff'],
    ['nix', 'application/x-mix-transfer'],
    ['nlu', 'application/vnd.neurolanguage.nlu'],
    ['nml', 'application/vnd.enliven'],
    ['nnd', 'application/vnd.noblenet-directory'],
    ['nns', 'application/vnd.noblenet-sealer'],
    ['nnw', 'application/vnd.noblenet-web'],
    ['npx', 'image/vnd.net-fpx'],
    ['nsc', 'application/x-conference'],
    ['nsf', 'application/vnd.lotus-notes'],
    ['nvd', 'application/x-navidoc'],
    ['nws', 'message/rfc822'],
    ['o', 'application/octet-stream'],
    ['oa2', 'application/vnd.fujitsu.oasys2'],
    ['oa3', 'application/vnd.fujitsu.oasys3'],
    ['oas', 'application/vnd.fujitsu.oasys'],
    ['obd', 'application/x-msbinder'],
    ['oda', 'application/oda'],
    ['odb', 'application/vnd.oasis.opendocument.database'],
    ['odc', 'application/vnd.oasis.opendocument.chart'],
    ['odf', 'application/vnd.oasis.opendocument.formula'],
    ['odft', 'application/vnd.oasis.opendocument.formula-template'],
    ['odg', 'application/vnd.oasis.opendocument.graphics'],
    ['odi', 'application/vnd.oasis.opendocument.image'],
    ['odm', 'application/vnd.oasis.opendocument.text-master'],
    ['odp', 'application/vnd.oasis.opendocument.presentation'],
    ['ods', 'application/vnd.oasis.opendocument.spreadsheet'],
    ['odt', 'application/vnd.oasis.opendocument.text'],
    ['oga', 'audio/ogg'],
    ['ogv', 'video/ogg'],
    ['ogx', 'application/ogg'],
    ['omc', 'application/x-omc'],
    ['omcd', 'application/x-omcdatamaker'],
    ['omcr', 'application/x-omcregerator'],
    ['onetoc', 'application/onenote'],
    ['opf', 'application/oebps-package+xml'],
    ['org', 'application/vnd.lotus-organizer'],
    ['osf', 'application/vnd.yamaha.openscoreformat'],
    ['osfpvg', 'application/vnd.yamaha.openscoreformat.osfpvg+xml'],
    ['otc', 'application/vnd.oasis.opendocument.chart-template'],
    ['otf', 'application/x-font-otf'],
    ['otg', 'application/vnd.oasis.opendocument.graphics-template'],
    ['oth', 'application/vnd.oasis.opendocument.text-web'],
    ['oti', 'application/vnd.oasis.opendocument.image-template'],
    ['otp', 'application/vnd.oasis.opendocument.presentation-template'],
    ['ots', 'application/vnd.oasis.opendocument.spreadsheet-template'],
    ['ott', 'application/vnd.oasis.opendocument.text-template'],
    ['oxt', 'application/vnd.openofficeorg.extension'],
    ['p', 'text/x-pascal'],
    ['p10', ['application/pkcs10', 'application/x-pkcs10']],
    ['p12', ['application/pkcs-12', 'application/x-pkcs12']],
    ['p7a', 'application/x-pkcs7-signature'],
    ['p7b', 'application/x-pkcs7-certificates'],
    ['p7c', ['application/pkcs7-mime', 'application/x-pkcs7-mime']],
    ['p7m', ['application/pkcs7-mime', 'application/x-pkcs7-mime']],
    ['p7r', 'application/x-pkcs7-certreqresp'],
    ['p7s', ['application/pkcs7-signature', 'application/x-pkcs7-signature']],
    ['p8', 'application/pkcs8'],
    ['par', 'text/plain-bas'],
    ['part', 'application/pro_eng'],
    ['pas', 'text/pascal'],
    ['paw', 'application/vnd.pawaafile'],
    ['pbd', 'application/vnd.powerbuilder6'],
    ['pbm', 'image/x-portable-bitmap'],
    ['pcf', 'application/x-font-pcf'],
    ['pcl', ['application/vnd.hp-pcl', 'application/x-pcl']],
    ['pclxl', 'application/vnd.hp-pclxl'],
    ['pct', 'image/x-pict'],
    ['pcurl', 'application/vnd.curl.pcurl'],
    ['pcx', 'image/x-pcx'],
    ['pdb', ['application/vnd.palm', 'chemical/x-pdb']],
    ['pdf', 'application/pdf'],
    ['pfa', 'application/x-font-type1'],
    ['pfr', 'application/font-tdpfr'],
    ['pfunk', ['audio/make', 'audio/make.my.funk']],
    ['pfx', 'application/x-pkcs12'],
    ['pgm', ['image/x-portable-graymap', 'image/x-portable-greymap']],
    ['pgn', 'application/x-chess-pgn'],
    ['pgp', 'application/pgp-signature'],
    ['pic', ['image/pict', 'image/x-pict']],
    ['pict', 'image/pict'],
    ['pkg', 'application/x-newton-compatible-pkg'],
    ['pki', 'application/pkixcmp'],
    ['pkipath', 'application/pkix-pkipath'],
    ['pko', ['application/ynd.ms-pkipko', 'application/vnd.ms-pki.pko']],
    ['pl', ['text/plain', 'text/x-script.perl']],
    ['plb', 'application/vnd.3gpp.pic-bw-large'],
    ['plc', 'application/vnd.mobius.plc'],
    ['plf', 'application/vnd.pocketlearn'],
    ['pls', 'application/pls+xml'],
    ['plx', 'application/x-pixclscript'],
    ['pm', ['text/x-script.perl-module', 'image/x-xpixmap']],
    ['pm4', 'application/x-pagemaker'],
    ['pm5', 'application/x-pagemaker'],
    ['pma', 'application/x-perfmon'],
    ['pmc', 'application/x-perfmon'],
    ['pml', ['application/vnd.ctc-posml', 'application/x-perfmon']],
    ['pmr', 'application/x-perfmon'],
    ['pmw', 'application/x-perfmon'],
    ['png', 'image/png'],
    ['pnm', ['application/x-portable-anymap', 'image/x-portable-anymap']],
    ['portpkg', 'application/vnd.macports.portpkg'],
    ['pot', ['application/vnd.ms-powerpoint', 'application/mspowerpoint']],
    ['potm', 'application/vnd.ms-powerpoint.template.macroenabled.12'],
    ['potx', 'application/vnd.openxmlformats-officedocument.presentationml.template'],
    ['pov', 'model/x-pov'],
    ['ppa', 'application/vnd.ms-powerpoint'],
    ['ppam', 'application/vnd.ms-powerpoint.addin.macroenabled.12'],
    ['ppd', 'application/vnd.cups-ppd'],
    ['ppm', 'image/x-portable-pixmap'],
    ['pps', ['application/vnd.ms-powerpoint', 'application/mspowerpoint']],
    ['ppsm', 'application/vnd.ms-powerpoint.slideshow.macroenabled.12'],
    ['ppsx', 'application/vnd.openxmlformats-officedocument.presentationml.slideshow'],
    ['ppt', ['application/vnd.ms-powerpoint', 'application/mspowerpoint', 'application/powerpoint', 'application/x-mspowerpoint']],
    ['pptm', 'application/vnd.ms-powerpoint.presentation.macroenabled.12'],
    ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['ppz', 'application/mspowerpoint'],
    ['prc', 'application/x-mobipocket-ebook'],
    ['pre', ['application/vnd.lotus-freelance', 'application/x-freelance']],
    ['prf', 'application/pics-rules'],
    ['prt', 'application/pro_eng'],
    ['ps', 'application/postscript'],
    ['psb', 'application/vnd.3gpp.pic-bw-small'],
    ['psd', ['application/octet-stream', 'image/vnd.adobe.photoshop']],
    ['psf', 'application/x-font-linux-psf'],
    ['pskcxml', 'application/pskc+xml'],
    ['ptid', 'application/vnd.pvi.ptid1'],
    ['pub', 'application/x-mspublisher'],
    ['pvb', 'application/vnd.3gpp.pic-bw-var'],
    ['pvu', 'paleovu/x-pv'],
    ['pwn', 'application/vnd.3m.post-it-notes'],
    ['pwz', 'application/vnd.ms-powerpoint'],
    ['py', 'text/x-script.phyton'],
    ['pya', 'audio/vnd.ms-playready.media.pya'],
    ['pyc', 'application/x-bytecode.python'],
    ['pyv', 'video/vnd.ms-playready.media.pyv'],
    ['qam', 'application/vnd.epson.quickanime'],
    ['qbo', 'application/vnd.intu.qbo'],
    ['qcp', 'audio/vnd.qcelp'],
    ['qd3', 'x-world/x-3dmf'],
    ['qd3d', 'x-world/x-3dmf'],
    ['qfx', 'application/vnd.intu.qfx'],
    ['qif', 'image/x-quicktime'],
    ['qps', 'application/vnd.publishare-delta-tree'],
    ['qt', 'video/quicktime'],
    ['qtc', 'video/x-qtc'],
    ['qti', 'image/x-quicktime'],
    ['qtif', 'image/x-quicktime'],
    ['qxd', 'application/vnd.quark.quarkxpress'],
    ['ra', ['audio/x-realaudio', 'audio/x-pn-realaudio', 'audio/x-pn-realaudio-plugin']],
    ['ram', 'audio/x-pn-realaudio'],
    ['rar', 'application/x-rar-compressed'],
    ['ras', ['image/cmu-raster', 'application/x-cmu-raster', 'image/x-cmu-raster']],
    ['rast', 'image/cmu-raster'],
    ['rcprofile', 'application/vnd.ipunplugged.rcprofile'],
    ['rdf', 'application/rdf+xml'],
    ['rdz', 'application/vnd.data-vision.rdz'],
    ['rep', 'application/vnd.businessobjects'],
    ['res', 'application/x-dtbresource+xml'],
    ['rexx', 'text/x-script.rexx'],
    ['rf', 'image/vnd.rn-realflash'],
    ['rgb', 'image/x-rgb'],
    ['rif', 'application/reginfo+xml'],
    ['rip', 'audio/vnd.rip'],
    ['rl', 'application/resource-lists+xml'],
    ['rlc', 'image/vnd.fujixerox.edmics-rlc'],
    ['rld', 'application/resource-lists-diff+xml'],
    ['rm', ['application/vnd.rn-realmedia', 'audio/x-pn-realaudio']],
    ['rmi', 'audio/mid'],
    ['rmm', 'audio/x-pn-realaudio'],
    ['rmp', ['audio/x-pn-realaudio-plugin', 'audio/x-pn-realaudio']],
    ['rms', 'application/vnd.jcp.javame.midlet-rms'],
    ['rnc', 'application/relax-ng-compact-syntax'],
    ['rng', ['application/ringing-tones', 'application/vnd.nokia.ringing-tone']],
    ['rnx', 'application/vnd.rn-realplayer'],
    ['roff', 'application/x-troff'],
    ['rp', 'image/vnd.rn-realpix'],
    ['rp9', 'application/vnd.cloanto.rp9'],
    ['rpm', 'audio/x-pn-realaudio-plugin'],
    ['rpss', 'application/vnd.nokia.radio-presets'],
    ['rpst', 'application/vnd.nokia.radio-preset'],
    ['rq', 'application/sparql-query'],
    ['rs', 'application/rls-services+xml'],
    ['rsd', 'application/rsd+xml'],
    ['rt', ['text/richtext', 'text/vnd.rn-realtext']],
    ['rtf', ['application/rtf', 'text/richtext', 'application/x-rtf']],
    ['rtx', ['text/richtext', 'application/rtf']],
    ['rv', 'video/vnd.rn-realvideo'],
    ['s', 'text/x-asm'],
    ['s3m', 'audio/s3m'],
    ['saf', 'application/vnd.yamaha.smaf-audio'],
    ['saveme', 'application/octet-stream'],
    ['sbk', 'application/x-tbook'],
    ['sbml', 'application/sbml+xml'],
    ['sc', 'application/vnd.ibm.secure-container'],
    ['scd', 'application/x-msschedule'],
    ['scm', ['application/vnd.lotus-screencam', 'video/x-scm', 'text/x-script.guile', 'application/x-lotusscreencam', 'text/x-script.scheme']],
    ['scq', 'application/scvp-cv-request'],
    ['scs', 'application/scvp-cv-response'],
    ['sct', 'text/scriptlet'],
    ['scurl', 'text/vnd.curl.scurl'],
    ['sda', 'application/vnd.stardivision.draw'],
    ['sdc', 'application/vnd.stardivision.calc'],
    ['sdd', 'application/vnd.stardivision.impress'],
    ['sdkm', 'application/vnd.solent.sdkm+xml'],
    ['sdml', 'text/plain'],
    ['sdp', ['application/sdp', 'application/x-sdp']],
    ['sdr', 'application/sounder'],
    ['sdw', 'application/vnd.stardivision.writer'],
    ['sea', ['application/sea', 'application/x-sea']],
    ['see', 'application/vnd.seemail'],
    ['seed', 'application/vnd.fdsn.seed'],
    ['sema', 'application/vnd.sema'],
    ['semd', 'application/vnd.semd'],
    ['semf', 'application/vnd.semf'],
    ['ser', 'application/java-serialized-object'],
    ['set', 'application/set'],
    ['setpay', 'application/set-payment-initiation'],
    ['setreg', 'application/set-registration-initiation'],
    ['sfd-hdstx', 'application/vnd.hydrostatix.sof-data'],
    ['sfs', 'application/vnd.spotfire.sfs'],
    ['sgl', 'application/vnd.stardivision.writer-global'],
    ['sgm', ['text/sgml', 'text/x-sgml']],
    ['sgml', ['text/sgml', 'text/x-sgml']],
    ['sh', ['application/x-shar', 'application/x-bsh', 'application/x-sh', 'text/x-script.sh']],
    ['shar', ['application/x-bsh', 'application/x-shar']],
    ['shf', 'application/shf+xml'],
    ['shtml', ['text/html', 'text/x-server-parsed-html']],
    ['sid', 'audio/x-psid'],
    ['sis', 'application/vnd.symbian.install'],
    ['sit', ['application/x-stuffit', 'application/x-sit']],
    ['sitx', 'application/x-stuffitx'],
    ['skd', 'application/x-koan'],
    ['skm', 'application/x-koan'],
    ['skp', ['application/vnd.koan', 'application/x-koan']],
    ['skt', 'application/x-koan'],
    ['sl', 'application/x-seelogo'],
    ['sldm', 'application/vnd.ms-powerpoint.slide.macroenabled.12'],
    ['sldx', 'application/vnd.openxmlformats-officedocument.presentationml.slide'],
    ['slt', 'application/vnd.epson.salt'],
    ['sm', 'application/vnd.stepmania.stepchart'],
    ['smf', 'application/vnd.stardivision.math'],
    ['smi', ['application/smil', 'application/smil+xml']],
    ['smil', 'application/smil'],
    ['snd', ['audio/basic', 'audio/x-adpcm']],
    ['snf', 'application/x-font-snf'],
    ['sol', 'application/solids'],
    ['spc', ['text/x-speech', 'application/x-pkcs7-certificates']],
    ['spf', 'application/vnd.yamaha.smaf-phrase'],
    ['spl', ['application/futuresplash', 'application/x-futuresplash']],
    ['spot', 'text/vnd.in3d.spot'],
    ['spp', 'application/scvp-vp-response'],
    ['spq', 'application/scvp-vp-request'],
    ['spr', 'application/x-sprite'],
    ['sprite', 'application/x-sprite'],
    ['src', 'application/x-wais-source'],
    ['sru', 'application/sru+xml'],
    ['srx', 'application/sparql-results+xml'],
    ['sse', 'application/vnd.kodak-descriptor'],
    ['ssf', 'application/vnd.epson.ssf'],
    ['ssi', 'text/x-server-parsed-html'],
    ['ssm', 'application/streamingmedia'],
    ['ssml', 'application/ssml+xml'],
    ['sst', ['application/vnd.ms-pkicertstore', 'application/vnd.ms-pki.certstore']],
    ['st', 'application/vnd.sailingtracker.track'],
    ['stc', 'application/vnd.sun.xml.calc.template'],
    ['std', 'application/vnd.sun.xml.draw.template'],
    ['step', 'application/step'],
    ['stf', 'application/vnd.wt.stf'],
    ['sti', 'application/vnd.sun.xml.impress.template'],
    ['stk', 'application/hyperstudio'],
    ['stl', ['application/vnd.ms-pkistl', 'application/sla', 'application/vnd.ms-pki.stl', 'application/x-navistyle']],
    ['stm', 'text/html'],
    ['stp', 'application/step'],
    ['str', 'application/vnd.pg.format'],
    ['stw', 'application/vnd.sun.xml.writer.template'],
    ['sub', 'image/vnd.dvb.subtitle'],
    ['sus', 'application/vnd.sus-calendar'],
    ['sv4cpio', 'application/x-sv4cpio'],
    ['sv4crc', 'application/x-sv4crc'],
    ['svc', 'application/vnd.dvb.service'],
    ['svd', 'application/vnd.svd'],
    ['svf', ['image/vnd.dwg', 'image/x-dwg']],
    ['svg', 'image/svg+xml'],
    ['svr', ['x-world/x-svr', 'application/x-world']],
    ['swf', 'application/x-shockwave-flash'],
    ['swi', 'application/vnd.aristanetworks.swi'],
    ['sxc', 'application/vnd.sun.xml.calc'],
    ['sxd', 'application/vnd.sun.xml.draw'],
    ['sxg', 'application/vnd.sun.xml.writer.global'],
    ['sxi', 'application/vnd.sun.xml.impress'],
    ['sxm', 'application/vnd.sun.xml.math'],
    ['sxw', 'application/vnd.sun.xml.writer'],
    ['t', ['text/troff', 'application/x-troff']],
    ['talk', 'text/x-speech'],
    ['tao', 'application/vnd.tao.intent-module-archive'],
    ['tar', 'application/x-tar'],
    ['tbk', ['application/toolbook', 'application/x-tbook']],
    ['tcap', 'application/vnd.3gpp2.tcap'],
    ['tcl', ['text/x-script.tcl', 'application/x-tcl']],
    ['tcsh', 'text/x-script.tcsh'],
    ['teacher', 'application/vnd.smart.teacher'],
    ['tei', 'application/tei+xml'],
    ['tex', 'application/x-tex'],
    ['texi', 'application/x-texinfo'],
    ['texinfo', 'application/x-texinfo'],
    ['text', ['application/plain', 'text/plain']],
    ['tfi', 'application/thraud+xml'],
    ['tfm', 'application/x-tex-tfm'],
    ['tgz', ['application/gnutar', 'application/x-compressed']],
    ['thmx', 'application/vnd.ms-officetheme'],
    ['tif', ['image/tiff', 'image/x-tiff']],
    ['tiff', ['image/tiff', 'image/x-tiff']],
    ['tmo', 'application/vnd.tmobile-livetv'],
    ['torrent', 'application/x-bittorrent'],
    ['tpl', 'application/vnd.groove-tool-template'],
    ['tpt', 'application/vnd.trid.tpt'],
    ['tr', 'application/x-troff'],
    ['tra', 'application/vnd.trueapp'],
    ['trm', 'application/x-msterminal'],
    ['tsd', 'application/timestamped-data'],
    ['tsi', 'audio/tsp-audio'],
    ['tsp', ['application/dsptype', 'audio/tsplayer']],
    ['tsv', 'text/tab-separated-values'],
    ['ttf', 'application/x-font-ttf'],
    ['ttl', 'text/turtle'],
    ['turbot', 'image/florian'],
    ['twd', 'application/vnd.simtech-mindmapper'],
    ['txd', 'application/vnd.genomatix.tuxedo'],
    ['txf', 'application/vnd.mobius.txf'],
    ['txt', 'text/plain'],
    ['ufd', 'application/vnd.ufdl'],
    ['uil', 'text/x-uil'],
    ['uls', 'text/iuls'],
    ['umj', 'application/vnd.umajin'],
    ['uni', 'text/uri-list'],
    ['unis', 'text/uri-list'],
    ['unityweb', 'application/vnd.unity'],
    ['unv', 'application/i-deas'],
    ['uoml', 'application/vnd.uoml+xml'],
    ['uri', 'text/uri-list'],
    ['uris', 'text/uri-list'],
    ['ustar', ['application/x-ustar', 'multipart/x-ustar']],
    ['utz', 'application/vnd.uiq.theme'],
    ['uu', ['application/octet-stream', 'text/x-uuencode']],
    ['uue', 'text/x-uuencode'],
    ['uva', 'audio/vnd.dece.audio'],
    ['uvh', 'video/vnd.dece.hd'],
    ['uvi', 'image/vnd.dece.graphic'],
    ['uvm', 'video/vnd.dece.mobile'],
    ['uvp', 'video/vnd.dece.pd'],
    ['uvs', 'video/vnd.dece.sd'],
    ['uvu', 'video/vnd.uvvu.mp4'],
    ['uvv', 'video/vnd.dece.video'],
    ['vcd', 'application/x-cdlink'],
    ['vcf', 'text/x-vcard'],
    ['vcg', 'application/vnd.groove-vcard'],
    ['vcs', 'text/x-vcalendar'],
    ['vcx', 'application/vnd.vcx'],
    ['vda', 'application/vda'],
    ['vdo', 'video/vdo'],
    ['vew', 'application/groupwise'],
    ['vis', 'application/vnd.visionary'],
    ['viv', ['video/vivo', 'video/vnd.vivo']],
    ['vivo', ['video/vivo', 'video/vnd.vivo']],
    ['vmd', 'application/vocaltec-media-desc'],
    ['vmf', 'application/vocaltec-media-file'],
    ['voc', ['audio/voc', 'audio/x-voc']],
    ['vos', 'video/vosaic'],
    ['vox', 'audio/voxware'],
    ['vqe', 'audio/x-twinvq-plugin'],
    ['vqf', 'audio/x-twinvq'],
    ['vql', 'audio/x-twinvq-plugin'],
    ['vrml', ['model/vrml', 'x-world/x-vrml', 'application/x-vrml']],
    ['vrt', 'x-world/x-vrt'],
    ['vsd', ['application/vnd.visio', 'application/x-visio']],
    ['vsf', 'application/vnd.vsf'],
    ['vst', 'application/x-visio'],
    ['vsw', 'application/x-visio'],
    ['vtu', 'model/vnd.vtu'],
    ['vxml', 'application/voicexml+xml'],
    ['w60', 'application/wordperfect6.0'],
    ['w61', 'application/wordperfect6.1'],
    ['w6w', 'application/msword'],
    ['wad', 'application/x-doom'],
    ['wav', ['audio/wav', 'audio/x-wav']],
    ['wax', 'audio/x-ms-wax'],
    ['wb1', 'application/x-qpro'],
    ['wbmp', 'image/vnd.wap.wbmp'],
    ['wbs', 'application/vnd.criticaltools.wbs+xml'],
    ['wbxml', 'application/vnd.wap.wbxml'],
    ['wcm', 'application/vnd.ms-works'],
    ['wdb', 'application/vnd.ms-works'],
    ['web', 'application/vnd.xara'],
    ['weba', 'audio/webm'],
    ['webm', 'video/webm'],
    ['webp', 'image/webp'],
    ['wg', 'application/vnd.pmi.widget'],
    ['wgt', 'application/widget'],
    ['wiz', 'application/msword'],
    ['wk1', 'application/x-123'],
    ['wks', 'application/vnd.ms-works'],
    ['wm', 'video/x-ms-wm'],
    ['wma', 'audio/x-ms-wma'],
    ['wmd', 'application/x-ms-wmd'],
    ['wmf', ['windows/metafile', 'application/x-msmetafile']],
    ['wml', 'text/vnd.wap.wml'],
    ['wmlc', 'application/vnd.wap.wmlc'],
    ['wmls', 'text/vnd.wap.wmlscript'],
    ['wmlsc', 'application/vnd.wap.wmlscriptc'],
    ['wmv', 'video/x-ms-wmv'],
    ['wmx', 'video/x-ms-wmx'],
    ['wmz', 'application/x-ms-wmz'],
    ['woff', 'application/x-font-woff'],
    ['word', 'application/msword'],
    ['wp', 'application/wordperfect'],
    ['wp5', ['application/wordperfect', 'application/wordperfect6.0']],
    ['wp6', 'application/wordperfect'],
    ['wpd', ['application/wordperfect', 'application/vnd.wordperfect', 'application/x-wpwin']],
    ['wpl', 'application/vnd.ms-wpl'],
    ['wps', 'application/vnd.ms-works'],
    ['wq1', 'application/x-lotus'],
    ['wqd', 'application/vnd.wqd'],
    ['wri', ['application/mswrite', 'application/x-wri', 'application/x-mswrite']],
    ['wrl', ['model/vrml', 'x-world/x-vrml', 'application/x-world']],
    ['wrz', ['model/vrml', 'x-world/x-vrml']],
    ['wsc', 'text/scriplet'],
    ['wsdl', 'application/wsdl+xml'],
    ['wspolicy', 'application/wspolicy+xml'],
    ['wsrc', 'application/x-wais-source'],
    ['wtb', 'application/vnd.webturbo'],
    ['wtk', 'application/x-wintalk'],
    ['wvx', 'video/x-ms-wvx'],
    ['x-png', 'image/png'],
    ['x3d', 'application/vnd.hzn-3d-crossword'],
    ['xaf', 'x-world/x-vrml'],
    ['xap', 'application/x-silverlight-app'],
    ['xar', 'application/vnd.xara'],
    ['xbap', 'application/x-ms-xbap'],
    ['xbd', 'application/vnd.fujixerox.docuworks.binder'],
    ['xbm', ['image/xbm', 'image/x-xbm', 'image/x-xbitmap']],
    ['xdf', 'application/xcap-diff+xml'],
    ['xdm', 'application/vnd.syncml.dm+xml'],
    ['xdp', 'application/vnd.adobe.xdp+xml'],
    ['xdr', 'video/x-amt-demorun'],
    ['xdssc', 'application/dssc+xml'],
    ['xdw', 'application/vnd.fujixerox.docuworks'],
    ['xenc', 'application/xenc+xml'],
    ['xer', 'application/patch-ops-error+xml'],
    ['xfdf', 'application/vnd.adobe.xfdf'],
    ['xfdl', 'application/vnd.xfdl'],
    ['xgz', 'xgl/drawing'],
    ['xhtml', 'application/xhtml+xml'],
    ['xif', 'image/vnd.xiff'],
    ['xl', 'application/excel'],
    ['xla', ['application/vnd.ms-excel', 'application/excel', 'application/x-msexcel', 'application/x-excel']],
    ['xlam', 'application/vnd.ms-excel.addin.macroenabled.12'],
    ['xlb', ['application/excel', 'application/vnd.ms-excel', 'application/x-excel']],
    ['xlc', ['application/vnd.ms-excel', 'application/excel', 'application/x-excel']],
    ['xld', ['application/excel', 'application/x-excel']],
    ['xlk', ['application/excel', 'application/x-excel']],
    ['xll', ['application/excel', 'application/vnd.ms-excel', 'application/x-excel']],
    ['xlm', ['application/vnd.ms-excel', 'application/excel', 'application/x-excel']],
    ['xls', ['application/vnd.ms-excel', 'application/excel', 'application/x-msexcel', 'application/x-excel']],
    ['xlsb', 'application/vnd.ms-excel.sheet.binary.macroenabled.12'],
    ['xlsm', 'application/vnd.ms-excel.sheet.macroenabled.12'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['xlt', ['application/vnd.ms-excel', 'application/excel', 'application/x-excel']],
    ['xltm', 'application/vnd.ms-excel.template.macroenabled.12'],
    ['xltx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.template'],
    ['xlv', ['application/excel', 'application/x-excel']],
    ['xlw', ['application/vnd.ms-excel', 'application/excel', 'application/x-msexcel', 'application/x-excel']],
    ['xm', 'audio/xm'],
    ['xml', ['application/xml', 'text/xml', 'application/atom+xml', 'application/rss+xml']],
    ['xmz', 'xgl/movie'],
    ['xo', 'application/vnd.olpc-sugar'],
    ['xof', 'x-world/x-vrml'],
    ['xop', 'application/xop+xml'],
    ['xpi', 'application/x-xpinstall'],
    ['xpix', 'application/x-vnd.ls-xpix'],
    ['xpm', ['image/xpm', 'image/x-xpixmap']],
    ['xpr', 'application/vnd.is-xpr'],
    ['xps', 'application/vnd.ms-xpsdocument'],
    ['xpw', 'application/vnd.intercon.formnet'],
    ['xslt', 'application/xslt+xml'],
    ['xsm', 'application/vnd.syncml+xml'],
    ['xspf', 'application/xspf+xml'],
    ['xsr', 'video/x-amt-showrun'],
    ['xul', 'application/vnd.mozilla.xul+xml'],
    ['xwd', ['image/x-xwd', 'image/x-xwindowdump']],
    ['xyz', ['chemical/x-xyz', 'chemical/x-pdb']],
    ['yang', 'application/yang'],
    ['yin', 'application/yin+xml'],
    ['z', ['application/x-compressed', 'application/x-compress']],
    ['zaz', 'application/vnd.zzazz.deck+xml'],
    ['zip', ['application/zip', 'multipart/x-zip', 'application/x-zip-compressed', 'application/x-compressed']],
    ['zir', 'application/vnd.zul'],
    ['zmm', 'application/vnd.handheld-entertainment+xml'],
    ['zoo', 'application/octet-stream'],
    ['zsh', 'text/x-script.zsh']
]);

module.exports = {
    detectMimeType(filename) {
        if (!filename) {
            return defaultMimeType;
        }

        let parsed = path.parse(filename);
        let extension = (parsed.ext.substr(1) || parsed.name || '').split('?').shift().trim().toLowerCase();
        let value = defaultMimeType;

        if (extensions.has(extension)) {
            value = extensions.get(extension);
        }

        if (Array.isArray(value)) {
            return value[0];
        }
        return value;
    },

    detectExtension(mimeType) {
        if (!mimeType) {
            return defaultExtension;
        }
        let parts = (mimeType || '').toLowerCase().trim().split('/');
        let rootType = parts.shift().trim();
        let subType = parts.join('/').trim();

        if (mimeTypes.has(rootType + '/' + subType)) {
            let value = mimeTypes.get(rootType + '/' + subType);
            if (Array.isArray(value)) {
                return value[0];
            }
            return value;
        }

        switch (rootType) {
            case 'text':
                return 'txt';
            default:
                return 'bin';
        }
    }
};


/***/ }),

/***/ 8509:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/* eslint no-undefined: 0, prefer-spread: 0, no-control-regex: 0 */



const crypto = __nccwpck_require__(6113);
const fs = __nccwpck_require__(7147);
const punycode = __nccwpck_require__(4317);
const PassThrough = (__nccwpck_require__(2781).PassThrough);
const shared = __nccwpck_require__(2673);

const mimeFuncs = __nccwpck_require__(994);
const qp = __nccwpck_require__(9716);
const base64 = __nccwpck_require__(4017);
const addressparser = __nccwpck_require__(7382);
const nmfetch = __nccwpck_require__(9106);
const LastNewline = __nccwpck_require__(3368);

const LeWindows = __nccwpck_require__(3304);
const LeUnix = __nccwpck_require__(9827);

/**
 * Creates a new mime tree node. Assumes 'multipart/*' as the content type
 * if it is a branch, anything else counts as leaf. If rootNode is missing from
 * the options, assumes this is the root.
 *
 * @param {String} contentType Define the content type for the node. Can be left blank for attachments (derived from filename)
 * @param {Object} [options] optional options
 * @param {Object} [options.rootNode] root node for this tree
 * @param {Object} [options.parentNode] immediate parent for this node
 * @param {Object} [options.filename] filename for an attachment node
 * @param {String} [options.baseBoundary] shared part of the unique multipart boundary
 * @param {Boolean} [options.keepBcc] If true, do not exclude Bcc from the generated headers
 * @param {Function} [options.normalizeHeaderKey] method to normalize header keys for custom caseing
 * @param {String} [options.textEncoding] either 'Q' (the default) or 'B'
 */
class MimeNode {
    constructor(contentType, options) {
        this.nodeCounter = 0;

        options = options || {};

        /**
         * shared part of the unique multipart boundary
         */
        this.baseBoundary = options.baseBoundary || crypto.randomBytes(8).toString('hex');
        this.boundaryPrefix = options.boundaryPrefix || '--_NmP';

        this.disableFileAccess = !!options.disableFileAccess;
        this.disableUrlAccess = !!options.disableUrlAccess;

        this.normalizeHeaderKey = options.normalizeHeaderKey;

        /**
         * If date headers is missing and current node is the root, this value is used instead
         */
        this.date = new Date();

        /**
         * Root node for current mime tree
         */
        this.rootNode = options.rootNode || this;

        /**
         * If true include Bcc in generated headers (if available)
         */
        this.keepBcc = !!options.keepBcc;

        /**
         * If filename is specified but contentType is not (probably an attachment)
         * detect the content type from filename extension
         */
        if (options.filename) {
            /**
             * Filename for this node. Useful with attachments
             */
            this.filename = options.filename;
            if (!contentType) {
                contentType = mimeFuncs.detectMimeType(this.filename.split('.').pop());
            }
        }

        /**
         * Indicates which encoding should be used for header strings: "Q" or "B"
         */
        this.textEncoding = (options.textEncoding || '').toString().trim().charAt(0).toUpperCase();

        /**
         * Immediate parent for this node (or undefined if not set)
         */
        this.parentNode = options.parentNode;

        /**
         * Hostname for default message-id values
         */
        this.hostname = options.hostname;

        /**
         * If set to 'win' then uses \r\n, if 'linux' then \n. If not set (or `raw` is used) then newlines are kept as is.
         */
        this.newline = options.newline;

        /**
         * An array for possible child nodes
         */
        this.childNodes = [];

        /**
         * Used for generating unique boundaries (prepended to the shared base)
         */
        this._nodeId = ++this.rootNode.nodeCounter;

        /**
         * A list of header values for this node in the form of [{key:'', value:''}]
         */
        this._headers = [];

        /**
         * True if the content only uses ASCII printable characters
         * @type {Boolean}
         */
        this._isPlainText = false;

        /**
         * True if the content is plain text but has longer lines than allowed
         * @type {Boolean}
         */
        this._hasLongLines = false;

        /**
         * If set, use instead this value for envelopes instead of generating one
         * @type {Boolean}
         */
        this._envelope = false;

        /**
         * If set then use this value as the stream content instead of building it
         * @type {String|Buffer|Stream}
         */
        this._raw = false;

        /**
         * Additional transform streams that the message will be piped before
         * exposing by createReadStream
         * @type {Array}
         */
        this._transforms = [];

        /**
         * Additional process functions that the message will be piped through before
         * exposing by createReadStream. These functions are run after transforms
         * @type {Array}
         */
        this._processFuncs = [];

        /**
         * If content type is set (or derived from the filename) add it to headers
         */
        if (contentType) {
            this.setHeader('Content-Type', contentType);
        }
    }

    /////// PUBLIC METHODS

    /**
     * Creates and appends a child node.Arguments provided are passed to MimeNode constructor
     *
     * @param {String} [contentType] Optional content type
     * @param {Object} [options] Optional options object
     * @return {Object} Created node object
     */
    createChild(contentType, options) {
        if (!options && typeof contentType === 'object') {
            options = contentType;
            contentType = undefined;
        }
        let node = new MimeNode(contentType, options);
        this.appendChild(node);
        return node;
    }

    /**
     * Appends an existing node to the mime tree. Removes the node from an existing
     * tree if needed
     *
     * @param {Object} childNode node to be appended
     * @return {Object} Appended node object
     */
    appendChild(childNode) {
        if (childNode.rootNode !== this.rootNode) {
            childNode.rootNode = this.rootNode;
            childNode._nodeId = ++this.rootNode.nodeCounter;
        }

        childNode.parentNode = this;

        this.childNodes.push(childNode);
        return childNode;
    }

    /**
     * Replaces current node with another node
     *
     * @param {Object} node Replacement node
     * @return {Object} Replacement node
     */
    replace(node) {
        if (node === this) {
            return this;
        }

        this.parentNode.childNodes.forEach((childNode, i) => {
            if (childNode === this) {
                node.rootNode = this.rootNode;
                node.parentNode = this.parentNode;
                node._nodeId = this._nodeId;

                this.rootNode = this;
                this.parentNode = undefined;

                node.parentNode.childNodes[i] = node;
            }
        });

        return node;
    }

    /**
     * Removes current node from the mime tree
     *
     * @return {Object} removed node
     */
    remove() {
        if (!this.parentNode) {
            return this;
        }

        for (let i = this.parentNode.childNodes.length - 1; i >= 0; i--) {
            if (this.parentNode.childNodes[i] === this) {
                this.parentNode.childNodes.splice(i, 1);
                this.parentNode = undefined;
                this.rootNode = this;
                return this;
            }
        }
    }

    /**
     * Sets a header value. If the value for selected key exists, it is overwritten.
     * You can set multiple values as well by using [{key:'', value:''}] or
     * {key: 'value'} as the first argument.
     *
     * @param {String|Array|Object} key Header key or a list of key value pairs
     * @param {String} value Header value
     * @return {Object} current node
     */
    setHeader(key, value) {
        let added = false,
            headerValue;

        // Allow setting multiple headers at once
        if (!value && key && typeof key === 'object') {
            // allow {key:'content-type', value: 'text/plain'}
            if (key.key && 'value' in key) {
                this.setHeader(key.key, key.value);
            } else if (Array.isArray(key)) {
                // allow [{key:'content-type', value: 'text/plain'}]
                key.forEach(i => {
                    this.setHeader(i.key, i.value);
                });
            } else {
                // allow {'content-type': 'text/plain'}
                Object.keys(key).forEach(i => {
                    this.setHeader(i, key[i]);
                });
            }
            return this;
        }

        key = this._normalizeHeaderKey(key);

        headerValue = {
            key,
            value
        };

        // Check if the value exists and overwrite
        for (let i = 0, len = this._headers.length; i < len; i++) {
            if (this._headers[i].key === key) {
                if (!added) {
                    // replace the first match
                    this._headers[i] = headerValue;
                    added = true;
                } else {
                    // remove following matches
                    this._headers.splice(i, 1);
                    i--;
                    len--;
                }
            }
        }

        // match not found, append the value
        if (!added) {
            this._headers.push(headerValue);
        }

        return this;
    }

    /**
     * Adds a header value. If the value for selected key exists, the value is appended
     * as a new field and old one is not touched.
     * You can set multiple values as well by using [{key:'', value:''}] or
     * {key: 'value'} as the first argument.
     *
     * @param {String|Array|Object} key Header key or a list of key value pairs
     * @param {String} value Header value
     * @return {Object} current node
     */
    addHeader(key, value) {
        // Allow setting multiple headers at once
        if (!value && key && typeof key === 'object') {
            // allow {key:'content-type', value: 'text/plain'}
            if (key.key && key.value) {
                this.addHeader(key.key, key.value);
            } else if (Array.isArray(key)) {
                // allow [{key:'content-type', value: 'text/plain'}]
                key.forEach(i => {
                    this.addHeader(i.key, i.value);
                });
            } else {
                // allow {'content-type': 'text/plain'}
                Object.keys(key).forEach(i => {
                    this.addHeader(i, key[i]);
                });
            }
            return this;
        } else if (Array.isArray(value)) {
            value.forEach(val => {
                this.addHeader(key, val);
            });
            return this;
        }

        this._headers.push({
            key: this._normalizeHeaderKey(key),
            value
        });

        return this;
    }

    /**
     * Retrieves the first mathcing value of a selected key
     *
     * @param {String} key Key to search for
     * @retun {String} Value for the key
     */
    getHeader(key) {
        key = this._normalizeHeaderKey(key);
        for (let i = 0, len = this._headers.length; i < len; i++) {
            if (this._headers[i].key === key) {
                return this._headers[i].value;
            }
        }
    }

    /**
     * Sets body content for current node. If the value is a string, charset is added automatically
     * to Content-Type (if it is text/*). If the value is a Buffer, you need to specify
     * the charset yourself
     *
     * @param (String|Buffer) content Body content
     * @return {Object} current node
     */
    setContent(content) {
        this.content = content;
        if (typeof this.content.pipe === 'function') {
            // pre-stream handler. might be triggered if a stream is set as content
            // and 'error' fires before anything is done with this stream
            this._contentErrorHandler = err => {
                this.content.removeListener('error', this._contentErrorHandler);
                this.content = err;
            };
            this.content.once('error', this._contentErrorHandler);
        } else if (typeof this.content === 'string') {
            this._isPlainText = mimeFuncs.isPlainText(this.content);
            if (this._isPlainText && mimeFuncs.hasLongerLines(this.content, 76)) {
                // If there are lines longer than 76 symbols/bytes do not use 7bit
                this._hasLongLines = true;
            }
        }
        return this;
    }

    build(callback) {
        let promise;

        if (!callback) {
            promise = new Promise((resolve, reject) => {
                callback = shared.callbackPromise(resolve, reject);
            });
        }

        let stream = this.createReadStream();
        let buf = [];
        let buflen = 0;
        let returned = false;

        stream.on('readable', () => {
            let chunk;

            while ((chunk = stream.read()) !== null) {
                buf.push(chunk);
                buflen += chunk.length;
            }
        });

        stream.once('error', err => {
            if (returned) {
                return;
            }
            returned = true;

            return callback(err);
        });

        stream.once('end', chunk => {
            if (returned) {
                return;
            }
            returned = true;

            if (chunk && chunk.length) {
                buf.push(chunk);
                buflen += chunk.length;
            }
            return callback(null, Buffer.concat(buf, buflen));
        });

        return promise;
    }

    getTransferEncoding() {
        let transferEncoding = false;
        let contentType = (this.getHeader('Content-Type') || '').toString().toLowerCase().trim();

        if (this.content) {
            transferEncoding = (this.getHeader('Content-Transfer-Encoding') || '').toString().toLowerCase().trim();
            if (!transferEncoding || !['base64', 'quoted-printable'].includes(transferEncoding)) {
                if (/^text\//i.test(contentType)) {
                    // If there are no special symbols, no need to modify the text
                    if (this._isPlainText && !this._hasLongLines) {
                        transferEncoding = '7bit';
                    } else if (typeof this.content === 'string' || this.content instanceof Buffer) {
                        // detect preferred encoding for string value
                        transferEncoding = this._getTextEncoding(this.content) === 'Q' ? 'quoted-printable' : 'base64';
                    } else {
                        // we can not check content for a stream, so either use preferred encoding or fallback to QP
                        transferEncoding = this.textEncoding === 'B' ? 'base64' : 'quoted-printable';
                    }
                } else if (!/^(multipart|message)\//i.test(contentType)) {
                    transferEncoding = transferEncoding || 'base64';
                }
            }
        }
        return transferEncoding;
    }

    /**
     * Builds the header block for the mime node. Append \r\n\r\n before writing the content
     *
     * @returns {String} Headers
     */
    buildHeaders() {
        let transferEncoding = this.getTransferEncoding();
        let headers = [];

        if (transferEncoding) {
            this.setHeader('Content-Transfer-Encoding', transferEncoding);
        }

        if (this.filename && !this.getHeader('Content-Disposition')) {
            this.setHeader('Content-Disposition', 'attachment');
        }

        // Ensure mandatory header fields
        if (this.rootNode === this) {
            if (!this.getHeader('Date')) {
                this.setHeader('Date', this.date.toUTCString().replace(/GMT/, '+0000'));
            }

            // ensure that Message-Id is present
            this.messageId();

            if (!this.getHeader('MIME-Version')) {
                this.setHeader('MIME-Version', '1.0');
            }

            // Ensure that Content-Type is the last header for the root node
            for (let i = this._headers.length - 2; i >= 0; i--) {
                let header = this._headers[i];
                if (header.key === 'Content-Type') {
                    this._headers.splice(i, 1);
                    this._headers.push(header);
                }
            }
        }

        this._headers.forEach(header => {
            let key = header.key;
            let value = header.value;
            let structured;
            let param;
            let options = {};
            let formattedHeaders = ['From', 'Sender', 'To', 'Cc', 'Bcc', 'Reply-To', 'Date', 'References'];

            if (value && typeof value === 'object' && !formattedHeaders.includes(key)) {
                Object.keys(value).forEach(key => {
                    if (key !== 'value') {
                        options[key] = value[key];
                    }
                });
                value = (value.value || '').toString();
                if (!value.trim()) {
                    return;
                }
            }

            if (options.prepared) {
                // header value is
                if (options.foldLines) {
                    headers.push(mimeFuncs.foldLines(key + ': ' + value));
                } else {
                    headers.push(key + ': ' + value);
                }
                return;
            }

            switch (header.key) {
                case 'Content-Disposition':
                    structured = mimeFuncs.parseHeaderValue(value);
                    if (this.filename) {
                        structured.params.filename = this.filename;
                    }
                    value = mimeFuncs.buildHeaderValue(structured);
                    break;

                case 'Content-Type':
                    structured = mimeFuncs.parseHeaderValue(value);

                    this._handleContentType(structured);

                    if (structured.value.match(/^text\/plain\b/) && typeof this.content === 'string' && /[\u0080-\uFFFF]/.test(this.content)) {
                        structured.params.charset = 'utf-8';
                    }

                    value = mimeFuncs.buildHeaderValue(structured);

                    if (this.filename) {
                        // add support for non-compliant clients like QQ webmail
                        // we can't build the value with buildHeaderValue as the value is non standard and
                        // would be converted to parameter continuation encoding that we do not want
                        param = this._encodeWords(this.filename);

                        if (param !== this.filename || /[\s'"\\;:/=(),<>@[\]?]|^-/.test(param)) {
                            // include value in quotes if needed
                            param = '"' + param + '"';
                        }
                        value += '; name=' + param;
                    }
                    break;

                case 'Bcc':
                    if (!this.keepBcc) {
                        // skip BCC values
                        return;
                    }
                    break;
            }

            value = this._encodeHeaderValue(key, value);

            // skip empty lines
            if (!(value || '').toString().trim()) {
                return;
            }

            if (typeof this.normalizeHeaderKey === 'function') {
                let normalized = this.normalizeHeaderKey(key, value);
                if (normalized && typeof normalized === 'string' && normalized.length) {
                    key = normalized;
                }
            }

            headers.push(mimeFuncs.foldLines(key + ': ' + value, 76));
        });

        return headers.join('\r\n');
    }

    /**
     * Streams the rfc2822 message from the current node. If this is a root node,
     * mandatory header fields are set if missing (Date, Message-Id, MIME-Version)
     *
     * @return {String} Compiled message
     */
    createReadStream(options) {
        options = options || {};

        let stream = new PassThrough(options);
        let outputStream = stream;
        let transform;

        this.stream(stream, options, err => {
            if (err) {
                outputStream.emit('error', err);
                return;
            }
            stream.end();
        });

        for (let i = 0, len = this._transforms.length; i < len; i++) {
            transform = typeof this._transforms[i] === 'function' ? this._transforms[i]() : this._transforms[i];
            outputStream.once('error', err => {
                transform.emit('error', err);
            });
            outputStream = outputStream.pipe(transform);
        }

        // ensure terminating newline after possible user transforms
        transform = new LastNewline();
        outputStream.once('error', err => {
            transform.emit('error', err);
        });
        outputStream = outputStream.pipe(transform);

        // dkim and stuff
        for (let i = 0, len = this._processFuncs.length; i < len; i++) {
            transform = this._processFuncs[i];
            outputStream = transform(outputStream);
        }

        if (this.newline) {
            const winbreak = ['win', 'windows', 'dos', '\r\n'].includes(this.newline.toString().toLowerCase());
            const newlineTransform = winbreak ? new LeWindows() : new LeUnix();

            const stream = outputStream.pipe(newlineTransform);
            outputStream.on('error', err => stream.emit('error', err));
            return stream;
        }

        return outputStream;
    }

    /**
     * Appends a transform stream object to the transforms list. Final output
     * is passed through this stream before exposing
     *
     * @param {Object} transform Read-Write stream
     */
    transform(transform) {
        this._transforms.push(transform);
    }

    /**
     * Appends a post process function. The functon is run after transforms and
     * uses the following syntax
     *
     *   processFunc(input) -> outputStream
     *
     * @param {Object} processFunc Read-Write stream
     */
    processFunc(processFunc) {
        this._processFuncs.push(processFunc);
    }

    stream(outputStream, options, done) {
        let transferEncoding = this.getTransferEncoding();
        let contentStream;
        let localStream;

        // protect actual callback against multiple triggering
        let returned = false;
        let callback = err => {
            if (returned) {
                return;
            }
            returned = true;
            done(err);
        };

        // for multipart nodes, push child nodes
        // for content nodes end the stream
        let finalize = () => {
            let childId = 0;
            let processChildNode = () => {
                if (childId >= this.childNodes.length) {
                    outputStream.write('\r\n--' + this.boundary + '--\r\n');
                    return callback();
                }
                let child = this.childNodes[childId++];
                outputStream.write((childId > 1 ? '\r\n' : '') + '--' + this.boundary + '\r\n');
                child.stream(outputStream, options, err => {
                    if (err) {
                        return callback(err);
                    }
                    setImmediate(processChildNode);
                });
            };

            if (this.multipart) {
                setImmediate(processChildNode);
            } else {
                return callback();
            }
        };

        // pushes node content
        let sendContent = () => {
            if (this.content) {
                if (Object.prototype.toString.call(this.content) === '[object Error]') {
                    // content is already errored
                    return callback(this.content);
                }

                if (typeof this.content.pipe === 'function') {
                    this.content.removeListener('error', this._contentErrorHandler);
                    this._contentErrorHandler = err => callback(err);
                    this.content.once('error', this._contentErrorHandler);
                }

                let createStream = () => {
                    if (['quoted-printable', 'base64'].includes(transferEncoding)) {
                        contentStream = new (transferEncoding === 'base64' ? base64 : qp).Encoder(options);

                        contentStream.pipe(outputStream, {
                            end: false
                        });
                        contentStream.once('end', finalize);
                        contentStream.once('error', err => callback(err));

                        localStream = this._getStream(this.content);
                        localStream.pipe(contentStream);
                    } else {
                        // anything that is not QP or Base54 passes as-is
                        localStream = this._getStream(this.content);
                        localStream.pipe(outputStream, {
                            end: false
                        });
                        localStream.once('end', finalize);
                    }

                    localStream.once('error', err => callback(err));
                };

                if (this.content._resolve) {
                    let chunks = [];
                    let chunklen = 0;
                    let returned = false;
                    let sourceStream = this._getStream(this.content);
                    sourceStream.on('error', err => {
                        if (returned) {
                            return;
                        }
                        returned = true;
                        callback(err);
                    });
                    sourceStream.on('readable', () => {
                        let chunk;
                        while ((chunk = sourceStream.read()) !== null) {
                            chunks.push(chunk);
                            chunklen += chunk.length;
                        }
                    });
                    sourceStream.on('end', () => {
                        if (returned) {
                            return;
                        }
                        returned = true;
                        this.content._resolve = false;
                        this.content._resolvedValue = Buffer.concat(chunks, chunklen);
                        setImmediate(createStream);
                    });
                } else {
                    setImmediate(createStream);
                }
                return;
            } else {
                return setImmediate(finalize);
            }
        };

        if (this._raw) {
            setImmediate(() => {
                if (Object.prototype.toString.call(this._raw) === '[object Error]') {
                    // content is already errored
                    return callback(this._raw);
                }

                // remove default error handler (if set)
                if (typeof this._raw.pipe === 'function') {
                    this._raw.removeListener('error', this._contentErrorHandler);
                }

                let raw = this._getStream(this._raw);
                raw.pipe(outputStream, {
                    end: false
                });
                raw.on('error', err => outputStream.emit('error', err));
                raw.on('end', finalize);
            });
        } else {
            outputStream.write(this.buildHeaders() + '\r\n\r\n');
            setImmediate(sendContent);
        }
    }

    /**
     * Sets envelope to be used instead of the generated one
     *
     * @return {Object} SMTP envelope in the form of {from: 'from@example.com', to: ['to@example.com']}
     */
    setEnvelope(envelope) {
        let list;

        this._envelope = {
            from: false,
            to: []
        };

        if (envelope.from) {
            list = [];
            this._convertAddresses(this._parseAddresses(envelope.from), list);
            list = list.filter(address => address && address.address);
            if (list.length && list[0]) {
                this._envelope.from = list[0].address;
            }
        }
        ['to', 'cc', 'bcc'].forEach(key => {
            if (envelope[key]) {
                this._convertAddresses(this._parseAddresses(envelope[key]), this._envelope.to);
            }
        });

        this._envelope.to = this._envelope.to.map(to => to.address).filter(address => address);

        let standardFields = ['to', 'cc', 'bcc', 'from'];
        Object.keys(envelope).forEach(key => {
            if (!standardFields.includes(key)) {
                this._envelope[key] = envelope[key];
            }
        });

        return this;
    }

    /**
     * Generates and returns an object with parsed address fields
     *
     * @return {Object} Address object
     */
    getAddresses() {
        let addresses = {};

        this._headers.forEach(header => {
            let key = header.key.toLowerCase();
            if (['from', 'sender', 'reply-to', 'to', 'cc', 'bcc'].includes(key)) {
                if (!Array.isArray(addresses[key])) {
                    addresses[key] = [];
                }

                this._convertAddresses(this._parseAddresses(header.value), addresses[key]);
            }
        });

        return addresses;
    }

    /**
     * Generates and returns SMTP envelope with the sender address and a list of recipients addresses
     *
     * @return {Object} SMTP envelope in the form of {from: 'from@example.com', to: ['to@example.com']}
     */
    getEnvelope() {
        if (this._envelope) {
            return this._envelope;
        }

        let envelope = {
            from: false,
            to: []
        };
        this._headers.forEach(header => {
            let list = [];
            if (header.key === 'From' || (!envelope.from && ['Reply-To', 'Sender'].includes(header.key))) {
                this._convertAddresses(this._parseAddresses(header.value), list);
                if (list.length && list[0]) {
                    envelope.from = list[0].address;
                }
            } else if (['To', 'Cc', 'Bcc'].includes(header.key)) {
                this._convertAddresses(this._parseAddresses(header.value), envelope.to);
            }
        });

        envelope.to = envelope.to.map(to => to.address);

        return envelope;
    }

    /**
     * Returns Message-Id value. If it does not exist, then creates one
     *
     * @return {String} Message-Id value
     */
    messageId() {
        let messageId = this.getHeader('Message-ID');
        // You really should define your own Message-Id field!
        if (!messageId) {
            messageId = this._generateMessageId();
            this.setHeader('Message-ID', messageId);
        }
        return messageId;
    }

    /**
     * Sets pregenerated content that will be used as the output of this node
     *
     * @param {String|Buffer|Stream} Raw MIME contents
     */
    setRaw(raw) {
        this._raw = raw;

        if (this._raw && typeof this._raw.pipe === 'function') {
            // pre-stream handler. might be triggered if a stream is set as content
            // and 'error' fires before anything is done with this stream
            this._contentErrorHandler = err => {
                this._raw.removeListener('error', this._contentErrorHandler);
                this._raw = err;
            };
            this._raw.once('error', this._contentErrorHandler);
        }

        return this;
    }

    /////// PRIVATE METHODS

    /**
     * Detects and returns handle to a stream related with the content.
     *
     * @param {Mixed} content Node content
     * @returns {Object} Stream object
     */
    _getStream(content) {
        let contentStream;

        if (content._resolvedValue) {
            // pass string or buffer content as a stream
            contentStream = new PassThrough();

            setImmediate(() => {
                try {
                    contentStream.end(content._resolvedValue);
                } catch (err) {
                    contentStream.emit('error', err);
                }
            });

            return contentStream;
        } else if (typeof content.pipe === 'function') {
            // assume as stream
            return content;
        } else if (content && typeof content.path === 'string' && !content.href) {
            if (this.disableFileAccess) {
                contentStream = new PassThrough();
                setImmediate(() => contentStream.emit('error', new Error('File access rejected for ' + content.path)));
                return contentStream;
            }
            // read file
            return fs.createReadStream(content.path);
        } else if (content && typeof content.href === 'string') {
            if (this.disableUrlAccess) {
                contentStream = new PassThrough();
                setImmediate(() => contentStream.emit('error', new Error('Url access rejected for ' + content.href)));
                return contentStream;
            }
            // fetch URL
            return nmfetch(content.href, { headers: content.httpHeaders });
        } else {
            // pass string or buffer content as a stream
            contentStream = new PassThrough();

            setImmediate(() => {
                try {
                    contentStream.end(content || '');
                } catch (err) {
                    contentStream.emit('error', err);
                }
            });
            return contentStream;
        }
    }

    /**
     * Parses addresses. Takes in a single address or an array or an
     * array of address arrays (eg. To: [[first group], [second group],...])
     *
     * @param {Mixed} addresses Addresses to be parsed
     * @return {Array} An array of address objects
     */
    _parseAddresses(addresses) {
        return [].concat.apply(
            [],
            [].concat(addresses).map(address => {
                // eslint-disable-line prefer-spread
                if (address && address.address) {
                    address.address = this._normalizeAddress(address.address);
                    address.name = address.name || '';
                    return [address];
                }
                return addressparser(address);
            })
        );
    }

    /**
     * Normalizes a header key, uses Camel-Case form, except for uppercase MIME-
     *
     * @param {String} key Key to be normalized
     * @return {String} key in Camel-Case form
     */
    _normalizeHeaderKey(key) {
        key = (key || '')
            .toString()
            // no newlines in keys
            .replace(/\r?\n|\r/g, ' ')
            .trim()
            .toLowerCase()
            // use uppercase words, except MIME
            .replace(/^X-SMTPAPI$|^(MIME|DKIM|ARC|BIMI)\b|^[a-z]|-(SPF|FBL|ID|MD5)$|-[a-z]/gi, c => c.toUpperCase())
            // special case
            .replace(/^Content-Features$/i, 'Content-features');

        return key;
    }

    /**
     * Checks if the content type is multipart and defines boundary if needed.
     * Doesn't return anything, modifies object argument instead.
     *
     * @param {Object} structured Parsed header value for 'Content-Type' key
     */
    _handleContentType(structured) {
        this.contentType = structured.value.trim().toLowerCase();

        this.multipart = /^multipart\//i.test(this.contentType) ? this.contentType.substr(this.contentType.indexOf('/') + 1) : false;

        if (this.multipart) {
            this.boundary = structured.params.boundary = structured.params.boundary || this.boundary || this._generateBoundary();
        } else {
            this.boundary = false;
        }
    }

    /**
     * Generates a multipart boundary value
     *
     * @return {String} boundary value
     */
    _generateBoundary() {
        return this.rootNode.boundaryPrefix + '-' + this.rootNode.baseBoundary + '-Part_' + this._nodeId;
    }

    /**
     * Encodes a header value for use in the generated rfc2822 email.
     *
     * @param {String} key Header key
     * @param {String} value Header value
     */
    _encodeHeaderValue(key, value) {
        key = this._normalizeHeaderKey(key);

        switch (key) {
            // Structured headers
            case 'From':
            case 'Sender':
            case 'To':
            case 'Cc':
            case 'Bcc':
            case 'Reply-To':
                return this._convertAddresses(this._parseAddresses(value));

            // values enclosed in <>
            case 'Message-ID':
            case 'In-Reply-To':
            case 'Content-Id':
                value = (value || '').toString().replace(/\r?\n|\r/g, ' ');

                if (value.charAt(0) !== '<') {
                    value = '<' + value;
                }

                if (value.charAt(value.length - 1) !== '>') {
                    value = value + '>';
                }
                return value;

            // space separated list of values enclosed in <>
            case 'References':
                value = [].concat
                    .apply(
                        [],
                        [].concat(value || '').map(elm => {
                            // eslint-disable-line prefer-spread
                            elm = (elm || '')
                                .toString()
                                .replace(/\r?\n|\r/g, ' ')
                                .trim();
                            return elm.replace(/<[^>]*>/g, str => str.replace(/\s/g, '')).split(/\s+/);
                        })
                    )
                    .map(elm => {
                        if (elm.charAt(0) !== '<') {
                            elm = '<' + elm;
                        }
                        if (elm.charAt(elm.length - 1) !== '>') {
                            elm = elm + '>';
                        }
                        return elm;
                    });

                return value.join(' ').trim();

            case 'Date':
                if (Object.prototype.toString.call(value) === '[object Date]') {
                    return value.toUTCString().replace(/GMT/, '+0000');
                }

                value = (value || '').toString().replace(/\r?\n|\r/g, ' ');
                return this._encodeWords(value);

            case 'Content-Type':
            case 'Content-Disposition':
                // if it includes a filename then it is already encoded
                return (value || '').toString().replace(/\r?\n|\r/g, ' ');

            default:
                value = (value || '').toString().replace(/\r?\n|\r/g, ' ');
                // encodeWords only encodes if needed, otherwise the original string is returned
                return this._encodeWords(value);
        }
    }

    /**
     * Rebuilds address object using punycode and other adjustments
     *
     * @param {Array} addresses An array of address objects
     * @param {Array} [uniqueList] An array to be populated with addresses
     * @return {String} address string
     */
    _convertAddresses(addresses, uniqueList) {
        let values = [];

        uniqueList = uniqueList || [];

        [].concat(addresses || []).forEach(address => {
            if (address.address) {
                address.address = this._normalizeAddress(address.address);

                if (!address.name) {
                    values.push(address.address.indexOf(' ') >= 0 ? `<${address.address}>` : `${address.address}`);
                } else if (address.name) {
                    values.push(`${this._encodeAddressName(address.name)} <${address.address}>`);
                }

                if (address.address) {
                    if (!uniqueList.filter(a => a.address === address.address).length) {
                        uniqueList.push(address);
                    }
                }
            } else if (address.group) {
                let groupListAddresses = (address.group.length ? this._convertAddresses(address.group, uniqueList) : '').trim();
                values.push(`${this._encodeAddressName(address.name)}:${groupListAddresses};`);
            }
        });

        return values.join(', ');
    }

    /**
     * Normalizes an email address
     *
     * @param {Array} address An array of address objects
     * @return {String} address string
     */
    _normalizeAddress(address) {
        address = (address || '')
            .toString()
            .replace(/[\x00-\x1F<>]+/g, ' ') // remove unallowed characters
            .trim();

        let lastAt = address.lastIndexOf('@');
        if (lastAt < 0) {
            // Bare username
            return address;
        }

        let user = address.substr(0, lastAt);
        let domain = address.substr(lastAt + 1);

        // Usernames are not touched and are kept as is even if these include unicode
        // Domains are punycoded by default
        // 'jõgeva.ee' will be converted to 'xn--jgeva-dua.ee'
        // non-unicode domains are left as is

        let encodedDomain;

        try {
            encodedDomain = punycode.toASCII(domain.toLowerCase());
        } catch (err) {
            // keep as is?
        }

        if (user.indexOf(' ') >= 0) {
            if (user.charAt(0) !== '"') {
                user = '"' + user;
            }
            if (user.substr(-1) !== '"') {
                user = user + '"';
            }
        }

        return `${user}@${encodedDomain}`;
    }

    /**
     * If needed, mime encodes the name part
     *
     * @param {String} name Name part of an address
     * @returns {String} Mime word encoded string if needed
     */
    _encodeAddressName(name) {
        if (!/^[\w ]*$/.test(name)) {
            if (/^[\x20-\x7e]*$/.test(name)) {
                return '"' + name.replace(/([\\"])/g, '\\$1') + '"';
            } else {
                return mimeFuncs.encodeWord(name, this._getTextEncoding(name), 52);
            }
        }
        return name;
    }

    /**
     * If needed, mime encodes the name part
     *
     * @param {String} name Name part of an address
     * @returns {String} Mime word encoded string if needed
     */
    _encodeWords(value) {
        // set encodeAll parameter to true even though it is against the recommendation of RFC2047,
        // by default only words that include non-ascii should be converted into encoded words
        // but some clients (eg. Zimbra) do not handle it properly and remove surrounding whitespace
        return mimeFuncs.encodeWords(value, this._getTextEncoding(value), 52, true);
    }

    /**
     * Detects best mime encoding for a text value
     *
     * @param {String} value Value to check for
     * @return {String} either 'Q' or 'B'
     */
    _getTextEncoding(value) {
        value = (value || '').toString();

        let encoding = this.textEncoding;
        let latinLen;
        let nonLatinLen;

        if (!encoding) {
            // count latin alphabet symbols and 8-bit range symbols + control symbols
            // if there are more latin characters, then use quoted-printable
            // encoding, otherwise use base64
            nonLatinLen = (value.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\u0080-\uFFFF]/g) || []).length; // eslint-disable-line no-control-regex
            latinLen = (value.match(/[a-z]/gi) || []).length;
            // if there are more latin symbols than binary/unicode, then prefer Q, otherwise B
            encoding = nonLatinLen < latinLen ? 'Q' : 'B';
        }
        return encoding;
    }

    /**
     * Generates a message id
     *
     * @return {String} Random Message-ID value
     */
    _generateMessageId() {
        return (
            '<' +
            [2, 2, 2, 6].reduce(
                // crux to generate UUID-like random strings
                (prev, len) => prev + '-' + crypto.randomBytes(len).toString('hex'),
                crypto.randomBytes(4).toString('hex')
            ) +
            '@' +
            // try to use the domain of the FROM address or fallback to server hostname
            (this.getEnvelope().from || this.hostname || 'localhost').split('@').pop() +
            '>'
        );
    }
}

module.exports = MimeNode;


/***/ }),

/***/ 3368:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const Transform = (__nccwpck_require__(2781).Transform);

class LastNewline extends Transform {
    constructor() {
        super();
        this.lastByte = false;
    }

    _transform(chunk, encoding, done) {
        if (chunk.length) {
            this.lastByte = chunk[chunk.length - 1];
        }

        this.push(chunk);
        done();
    }

    _flush(done) {
        if (this.lastByte === 0x0a) {
            return done();
        }
        if (this.lastByte === 0x0d) {
            this.push(Buffer.from('\n'));
            return done();
        }
        this.push(Buffer.from('\r\n'));
        return done();
    }
}

module.exports = LastNewline;


/***/ }),

/***/ 9827:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const stream = __nccwpck_require__(2781);
const Transform = stream.Transform;

/**
 * Ensures that only <LF> is used for linebreaks
 *
 * @param {Object} options Stream options
 */
class LeWindows extends Transform {
    constructor(options) {
        super(options);
        // init Transform
        this.options = options || {};
    }

    /**
     * Escapes dots
     */
    _transform(chunk, encoding, done) {
        let buf;
        let lastPos = 0;

        for (let i = 0, len = chunk.length; i < len; i++) {
            if (chunk[i] === 0x0d) {
                // \n
                buf = chunk.slice(lastPos, i);
                lastPos = i + 1;
                this.push(buf);
            }
        }
        if (lastPos && lastPos < chunk.length) {
            buf = chunk.slice(lastPos);
            this.push(buf);
        } else if (!lastPos) {
            this.push(chunk);
        }
        done();
    }
}

module.exports = LeWindows;


/***/ }),

/***/ 3304:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const stream = __nccwpck_require__(2781);
const Transform = stream.Transform;

/**
 * Ensures that only <CR><LF> sequences are used for linebreaks
 *
 * @param {Object} options Stream options
 */
class LeWindows extends Transform {
    constructor(options) {
        super(options);
        // init Transform
        this.options = options || {};
        this.lastByte = false;
    }

    /**
     * Escapes dots
     */
    _transform(chunk, encoding, done) {
        let buf;
        let lastPos = 0;

        for (let i = 0, len = chunk.length; i < len; i++) {
            if (chunk[i] === 0x0a) {
                // \n
                if ((i && chunk[i - 1] !== 0x0d) || (!i && this.lastByte !== 0x0d)) {
                    if (i > lastPos) {
                        buf = chunk.slice(lastPos, i);
                        this.push(buf);
                    }
                    this.push(Buffer.from('\r\n'));
                    lastPos = i + 1;
                }
            }
        }

        if (lastPos && lastPos < chunk.length) {
            buf = chunk.slice(lastPos);
            this.push(buf);
        } else if (!lastPos) {
            this.push(chunk);
        }

        this.lastByte = chunk[chunk.length - 1];
        done();
    }
}

module.exports = LeWindows;


/***/ }),

/***/ 4289:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const Mailer = __nccwpck_require__(833);
const shared = __nccwpck_require__(2673);
const SMTPPool = __nccwpck_require__(560);
const SMTPTransport = __nccwpck_require__(3349);
const SendmailTransport = __nccwpck_require__(8910);
const StreamTransport = __nccwpck_require__(1888);
const JSONTransport = __nccwpck_require__(3819);
const SESTransport = __nccwpck_require__(5924);
const nmfetch = __nccwpck_require__(9106);
const packageData = __nccwpck_require__(4129);

const ETHEREAL_API = (process.env.ETHEREAL_API || 'https://api.nodemailer.com').replace(/\/+$/, '');
const ETHEREAL_WEB = (process.env.ETHEREAL_WEB || 'https://ethereal.email').replace(/\/+$/, '');
const ETHEREAL_API_KEY = (process.env.ETHEREAL_API_KEY || '').replace(/\s*/g, '') || null;
const ETHEREAL_CACHE = ['true', 'yes', 'y', '1'].includes((process.env.ETHEREAL_CACHE || 'yes').toString().trim().toLowerCase());

let testAccount = false;

module.exports.createTransport = function (transporter, defaults) {
    let urlConfig;
    let options;
    let mailer;

    if (
        // provided transporter is a configuration object, not transporter plugin
        (typeof transporter === 'object' && typeof transporter.send !== 'function') ||
        // provided transporter looks like a connection url
        (typeof transporter === 'string' && /^(smtps?|direct):/i.test(transporter))
    ) {
        if ((urlConfig = typeof transporter === 'string' ? transporter : transporter.url)) {
            // parse a configuration URL into configuration options
            options = shared.parseConnectionUrl(urlConfig);
        } else {
            options = transporter;
        }

        if (options.pool) {
            transporter = new SMTPPool(options);
        } else if (options.sendmail) {
            transporter = new SendmailTransport(options);
        } else if (options.streamTransport) {
            transporter = new StreamTransport(options);
        } else if (options.jsonTransport) {
            transporter = new JSONTransport(options);
        } else if (options.SES) {
            transporter = new SESTransport(options);
        } else {
            transporter = new SMTPTransport(options);
        }
    }

    mailer = new Mailer(transporter, options, defaults);

    return mailer;
};

module.exports.createTestAccount = function (apiUrl, callback) {
    let promise;

    if (!callback && typeof apiUrl === 'function') {
        callback = apiUrl;
        apiUrl = false;
    }

    if (!callback) {
        promise = new Promise((resolve, reject) => {
            callback = shared.callbackPromise(resolve, reject);
        });
    }

    if (ETHEREAL_CACHE && testAccount) {
        setImmediate(() => callback(null, testAccount));
        return promise;
    }

    apiUrl = apiUrl || ETHEREAL_API;

    let chunks = [];
    let chunklen = 0;

    let requestHeaders = {};
    let requestBody = {
        requestor: packageData.name,
        version: packageData.version
    };

    if (ETHEREAL_API_KEY) {
        requestHeaders.Authorization = 'Bearer ' + ETHEREAL_API_KEY;
    }

    let req = nmfetch(apiUrl + '/user', {
        contentType: 'application/json',
        method: 'POST',
        headers: requestHeaders,
        body: Buffer.from(JSON.stringify(requestBody))
    });

    req.on('readable', () => {
        let chunk;
        while ((chunk = req.read()) !== null) {
            chunks.push(chunk);
            chunklen += chunk.length;
        }
    });

    req.once('error', err => callback(err));

    req.once('end', () => {
        let res = Buffer.concat(chunks, chunklen);
        let data;
        let err;
        try {
            data = JSON.parse(res.toString());
        } catch (E) {
            err = E;
        }
        if (err) {
            return callback(err);
        }
        if (data.status !== 'success' || data.error) {
            return callback(new Error(data.error || 'Request failed'));
        }
        delete data.status;
        testAccount = data;
        callback(null, testAccount);
    });

    return promise;
};

module.exports.getTestMessageUrl = function (info) {
    if (!info || !info.response) {
        return false;
    }

    let infoProps = new Map();
    info.response.replace(/\[([^\]]+)\]$/, (m, props) => {
        props.replace(/\b([A-Z0-9]+)=([^\s]+)/g, (m, key, value) => {
            infoProps.set(key, value);
        });
    });

    if (infoProps.has('STATUS') && infoProps.has('MSGID')) {
        return (testAccount.web || ETHEREAL_WEB) + '/message/' + infoProps.get('MSGID');
    }

    return false;
};


/***/ }),

/***/ 4317:
/***/ ((module) => {

"use strict";
/*

Copied from https://github.com/mathiasbynens/punycode.js/blob/ef3505c8abb5143a00d53ce59077c9f7f4b2ac47/punycode.js

Copyright Mathias Bynens <https://mathiasbynens.be/>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
/* eslint callback-return: 0, no-bitwise: 0, eqeqeq: 0, prefer-arrow-callback: 0, object-shorthand: 0 */



/** Highest positive signed 32-bit float value */
const maxInt = 2147483647; // aka. 0x7FFFFFFF or 2^31-1

/** Bootstring parameters */
const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128; // 0x80
const delimiter = '-'; // '\x2D'

/** Regular expressions */
const regexPunycode = /^xn--/;
const regexNonASCII = /[^\0-\x7F]/; // Note: U+007F DEL is excluded too.
const regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g; // RFC 3490 separators

/** Error messages */
const errors = {
    overflow: 'Overflow: input needs wider integers to process',
    'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
    'invalid-input': 'Invalid input'
};

/** Convenience shortcuts */
const baseMinusTMin = base - tMin;
const floor = Math.floor;
const stringFromCharCode = String.fromCharCode;

/*--------------------------------------------------------------------------*/

/**
 * A generic error utility function.
 * @private
 * @param {String} type The error type.
 * @returns {Error} Throws a `RangeError` with the applicable error message.
 */
function error(type) {
    throw new RangeError(errors[type]);
}

/**
 * A generic `Array#map` utility function.
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} callback The function that gets called for every array
 * item.
 * @returns {Array} A new array of values returned by the callback function.
 */
function map(array, callback) {
    const result = [];
    let length = array.length;
    while (length--) {
        result[length] = callback(array[length]);
    }
    return result;
}

/**
 * A simple `Array#map`-like wrapper to work with domain name strings or email
 * addresses.
 * @private
 * @param {String} domain The domain name or email address.
 * @param {Function} callback The function that gets called for every
 * character.
 * @returns {String} A new string of characters returned by the callback
 * function.
 */
function mapDomain(domain, callback) {
    const parts = domain.split('@');
    let result = '';
    if (parts.length > 1) {
        // In email addresses, only the domain name should be punycoded. Leave
        // the local part (i.e. everything up to `@`) intact.
        result = parts[0] + '@';
        domain = parts[1];
    }
    // Avoid `split(regex)` for IE8 compatibility. See #17.
    domain = domain.replace(regexSeparators, '\x2E');
    const labels = domain.split('.');
    const encoded = map(labels, callback).join('.');
    return result + encoded;
}

/**
 * Creates an array containing the numeric code points of each Unicode
 * character in the string. While JavaScript uses UCS-2 internally,
 * this function will convert a pair of surrogate halves (each of which
 * UCS-2 exposes as separate characters) into a single code point,
 * matching UTF-16.
 * @see `punycode.ucs2.encode`
 * @see <https://mathiasbynens.be/notes/javascript-encoding>
 * @memberOf punycode.ucs2
 * @name decode
 * @param {String} string The Unicode input string (UCS-2).
 * @returns {Array} The new array of code points.
 */
function ucs2decode(string) {
    const output = [];
    let counter = 0;
    const length = string.length;
    while (counter < length) {
        const value = string.charCodeAt(counter++);
        if (value >= 0xd800 && value <= 0xdbff && counter < length) {
            // It's a high surrogate, and there is a next character.
            const extra = string.charCodeAt(counter++);
            if ((extra & 0xfc00) == 0xdc00) {
                // Low surrogate.
                output.push(((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
            } else {
                // It's an unmatched surrogate; only append this code unit, in case the
                // next code unit is the high surrogate of a surrogate pair.
                output.push(value);
                counter--;
            }
        } else {
            output.push(value);
        }
    }
    return output;
}

/**
 * Creates a string based on an array of numeric code points.
 * @see `punycode.ucs2.decode`
 * @memberOf punycode.ucs2
 * @name encode
 * @param {Array} codePoints The array of numeric code points.
 * @returns {String} The new Unicode string (UCS-2).
 */
const ucs2encode = codePoints => String.fromCodePoint(...codePoints);

/**
 * Converts a basic code point into a digit/integer.
 * @see `digitToBasic()`
 * @private
 * @param {Number} codePoint The basic numeric code point value.
 * @returns {Number} The numeric value of a basic code point (for use in
 * representing integers) in the range `0` to `base - 1`, or `base` if
 * the code point does not represent a value.
 */
const basicToDigit = function (codePoint) {
    if (codePoint >= 0x30 && codePoint < 0x3a) {
        return 26 + (codePoint - 0x30);
    }
    if (codePoint >= 0x41 && codePoint < 0x5b) {
        return codePoint - 0x41;
    }
    if (codePoint >= 0x61 && codePoint < 0x7b) {
        return codePoint - 0x61;
    }
    return base;
};

/**
 * Converts a digit/integer into a basic code point.
 * @see `basicToDigit()`
 * @private
 * @param {Number} digit The numeric value of a basic code point.
 * @returns {Number} The basic code point whose value (when used for
 * representing integers) is `digit`, which needs to be in the range
 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
 * used; else, the lowercase form is used. The behavior is undefined
 * if `flag` is non-zero and `digit` has no uppercase form.
 */
const digitToBasic = function (digit, flag) {
    //  0..25 map to ASCII a..z or A..Z
    // 26..35 map to ASCII 0..9
    return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
};

/**
 * Bias adaptation function as per section 3.4 of RFC 3492.
 * https://tools.ietf.org/html/rfc3492#section-3.4
 * @private
 */
const adapt = function (delta, numPoints, firstTime) {
    let k = 0;
    delta = firstTime ? floor(delta / damp) : delta >> 1;
    delta += floor(delta / numPoints);
    for (; /* no initialization */ delta > (baseMinusTMin * tMax) >> 1; k += base) {
        delta = floor(delta / baseMinusTMin);
    }
    return floor(k + ((baseMinusTMin + 1) * delta) / (delta + skew));
};

/**
 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
 * symbols.
 * @memberOf punycode
 * @param {String} input The Punycode string of ASCII-only symbols.
 * @returns {String} The resulting string of Unicode symbols.
 */
const decode = function (input) {
    // Don't use UCS-2.
    const output = [];
    const inputLength = input.length;
    let i = 0;
    let n = initialN;
    let bias = initialBias;

    // Handle the basic code points: let `basic` be the number of input code
    // points before the last delimiter, or `0` if there is none, then copy
    // the first basic code points to the output.

    let basic = input.lastIndexOf(delimiter);
    if (basic < 0) {
        basic = 0;
    }

    for (let j = 0; j < basic; ++j) {
        // if it's not a basic code point
        if (input.charCodeAt(j) >= 0x80) {
            error('not-basic');
        }
        output.push(input.charCodeAt(j));
    }

    // Main decoding loop: start just after the last delimiter if any basic code
    // points were copied; start at the beginning otherwise.

    for (let index = basic > 0 ? basic + 1 : 0; index < inputLength /* no final expression */; ) {
        // `index` is the index of the next character to be consumed.
        // Decode a generalized variable-length integer into `delta`,
        // which gets added to `i`. The overflow checking is easier
        // if we increase `i` as we go, then subtract off its starting
        // value at the end to obtain `delta`.
        const oldi = i;
        for (let w = 1, k = base /* no condition */; ; k += base) {
            if (index >= inputLength) {
                error('invalid-input');
            }

            const digit = basicToDigit(input.charCodeAt(index++));

            if (digit >= base) {
                error('invalid-input');
            }
            if (digit > floor((maxInt - i) / w)) {
                error('overflow');
            }

            i += digit * w;
            const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;

            if (digit < t) {
                break;
            }

            const baseMinusT = base - t;
            if (w > floor(maxInt / baseMinusT)) {
                error('overflow');
            }

            w *= baseMinusT;
        }

        const out = output.length + 1;
        bias = adapt(i - oldi, out, oldi == 0);

        // `i` was supposed to wrap around from `out` to `0`,
        // incrementing `n` each time, so we'll fix that now:
        if (floor(i / out) > maxInt - n) {
            error('overflow');
        }

        n += floor(i / out);
        i %= out;

        // Insert `n` at position `i` of the output.
        output.splice(i++, 0, n);
    }

    return String.fromCodePoint(...output);
};

/**
 * Converts a string of Unicode symbols (e.g. a domain name label) to a
 * Punycode string of ASCII-only symbols.
 * @memberOf punycode
 * @param {String} input The string of Unicode symbols.
 * @returns {String} The resulting Punycode string of ASCII-only symbols.
 */
const encode = function (input) {
    const output = [];

    // Convert the input in UCS-2 to an array of Unicode code points.
    input = ucs2decode(input);

    // Cache the length.
    const inputLength = input.length;

    // Initialize the state.
    let n = initialN;
    let delta = 0;
    let bias = initialBias;

    // Handle the basic code points.
    for (const currentValue of input) {
        if (currentValue < 0x80) {
            output.push(stringFromCharCode(currentValue));
        }
    }

    const basicLength = output.length;
    let handledCPCount = basicLength;

    // `handledCPCount` is the number of code points that have been handled;
    // `basicLength` is the number of basic code points.

    // Finish the basic string with a delimiter unless it's empty.
    if (basicLength) {
        output.push(delimiter);
    }

    // Main encoding loop:
    while (handledCPCount < inputLength) {
        // All non-basic code points < n have been handled already. Find the next
        // larger one:
        let m = maxInt;
        for (const currentValue of input) {
            if (currentValue >= n && currentValue < m) {
                m = currentValue;
            }
        }

        // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
        // but guard against overflow.
        const handledCPCountPlusOne = handledCPCount + 1;
        if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
            error('overflow');
        }

        delta += (m - n) * handledCPCountPlusOne;
        n = m;

        for (const currentValue of input) {
            if (currentValue < n && ++delta > maxInt) {
                error('overflow');
            }
            if (currentValue === n) {
                // Represent delta as a generalized variable-length integer.
                let q = delta;
                for (let k = base /* no condition */; ; k += base) {
                    const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
                    if (q < t) {
                        break;
                    }
                    const qMinusT = q - t;
                    const baseMinusT = base - t;
                    output.push(stringFromCharCode(digitToBasic(t + (qMinusT % baseMinusT), 0)));
                    q = floor(qMinusT / baseMinusT);
                }

                output.push(stringFromCharCode(digitToBasic(q, 0)));
                bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
                delta = 0;
                ++handledCPCount;
            }
        }

        ++delta;
        ++n;
    }
    return output.join('');
};

/**
 * Converts a Punycode string representing a domain name or an email address
 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
 * it doesn't matter if you call it on a string that has already been
 * converted to Unicode.
 * @memberOf punycode
 * @param {String} input The Punycoded domain name or email address to
 * convert to Unicode.
 * @returns {String} The Unicode representation of the given Punycode
 * string.
 */
const toUnicode = function (input) {
    return mapDomain(input, function (string) {
        return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
    });
};

/**
 * Converts a Unicode string representing a domain name or an email address to
 * Punycode. Only the non-ASCII parts of the domain name will be converted,
 * i.e. it doesn't matter if you call it with a domain that's already in
 * ASCII.
 * @memberOf punycode
 * @param {String} input The domain name or email address to convert, as a
 * Unicode string.
 * @returns {String} The Punycode representation of the given domain name or
 * email address.
 */
const toASCII = function (input) {
    return mapDomain(input, function (string) {
        return regexNonASCII.test(string) ? 'xn--' + encode(string) : string;
    });
};

/*--------------------------------------------------------------------------*/

/** Define the public API */
const punycode = {
    /**
     * A string representing the current Punycode.js version number.
     * @memberOf punycode
     * @type String
     */
    version: '2.3.1',
    /**
     * An object of methods to convert from JavaScript's internal character
     * representation (UCS-2) to Unicode code points, and back.
     * @see <https://mathiasbynens.be/notes/javascript-encoding>
     * @memberOf punycode
     * @type Object
     */
    ucs2: {
        decode: ucs2decode,
        encode: ucs2encode
    },
    decode: decode,
    encode: encode,
    toASCII: toASCII,
    toUnicode: toUnicode
};

module.exports = punycode;


/***/ }),

/***/ 9716:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const Transform = (__nccwpck_require__(2781).Transform);

/**
 * Encodes a Buffer into a Quoted-Printable encoded string
 *
 * @param {Buffer} buffer Buffer to convert
 * @returns {String} Quoted-Printable encoded string
 */
function encode(buffer) {
    if (typeof buffer === 'string') {
        buffer = Buffer.from(buffer, 'utf-8');
    }

    // usable characters that do not need encoding
    let ranges = [
        // https://tools.ietf.org/html/rfc2045#section-6.7
        [0x09], // <TAB>
        [0x0a], // <LF>
        [0x0d], // <CR>
        [0x20, 0x3c], // <SP>!"#$%&'()*+,-./0123456789:;
        [0x3e, 0x7e] // >?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}
    ];
    let result = '';
    let ord;

    for (let i = 0, len = buffer.length; i < len; i++) {
        ord = buffer[i];
        // if the char is in allowed range, then keep as is, unless it is a WS in the end of a line
        if (checkRanges(ord, ranges) && !((ord === 0x20 || ord === 0x09) && (i === len - 1 || buffer[i + 1] === 0x0a || buffer[i + 1] === 0x0d))) {
            result += String.fromCharCode(ord);
            continue;
        }
        result += '=' + (ord < 0x10 ? '0' : '') + ord.toString(16).toUpperCase();
    }

    return result;
}

/**
 * Adds soft line breaks to a Quoted-Printable string
 *
 * @param {String} str Quoted-Printable encoded string that might need line wrapping
 * @param {Number} [lineLength=76] Maximum allowed length for a line
 * @returns {String} Soft-wrapped Quoted-Printable encoded string
 */
function wrap(str, lineLength) {
    str = (str || '').toString();
    lineLength = lineLength || 76;

    if (str.length <= lineLength) {
        return str;
    }

    let pos = 0;
    let len = str.length;
    let match, code, line;
    let lineMargin = Math.floor(lineLength / 3);
    let result = '';

    // insert soft linebreaks where needed
    while (pos < len) {
        line = str.substr(pos, lineLength);
        if ((match = line.match(/\r\n/))) {
            line = line.substr(0, match.index + match[0].length);
            result += line;
            pos += line.length;
            continue;
        }

        if (line.substr(-1) === '\n') {
            // nothing to change here
            result += line;
            pos += line.length;
            continue;
        } else if ((match = line.substr(-lineMargin).match(/\n.*?$/))) {
            // truncate to nearest line break
            line = line.substr(0, line.length - (match[0].length - 1));
            result += line;
            pos += line.length;
            continue;
        } else if (line.length > lineLength - lineMargin && (match = line.substr(-lineMargin).match(/[ \t.,!?][^ \t.,!?]*$/))) {
            // truncate to nearest space
            line = line.substr(0, line.length - (match[0].length - 1));
        } else if (line.match(/[=][\da-f]{0,2}$/i)) {
            // push incomplete encoding sequences to the next line
            if ((match = line.match(/[=][\da-f]{0,1}$/i))) {
                line = line.substr(0, line.length - match[0].length);
            }

            // ensure that utf-8 sequences are not split
            while (line.length > 3 && line.length < len - pos && !line.match(/^(?:=[\da-f]{2}){1,4}$/i) && (match = line.match(/[=][\da-f]{2}$/gi))) {
                code = parseInt(match[0].substr(1, 2), 16);
                if (code < 128) {
                    break;
                }

                line = line.substr(0, line.length - 3);

                if (code >= 0xc0) {
                    break;
                }
            }
        }

        if (pos + line.length < len && line.substr(-1) !== '\n') {
            if (line.length === lineLength && line.match(/[=][\da-f]{2}$/i)) {
                line = line.substr(0, line.length - 3);
            } else if (line.length === lineLength) {
                line = line.substr(0, line.length - 1);
            }
            pos += line.length;
            line += '=\r\n';
        } else {
            pos += line.length;
        }

        result += line;
    }

    return result;
}

/**
 * Helper function to check if a number is inside provided ranges
 *
 * @param {Number} nr Number to check for
 * @param {Array} ranges An Array of allowed values
 * @returns {Boolean} True if the value was found inside allowed ranges, false otherwise
 */
function checkRanges(nr, ranges) {
    for (let i = ranges.length - 1; i >= 0; i--) {
        if (!ranges[i].length) {
            continue;
        }
        if (ranges[i].length === 1 && nr === ranges[i][0]) {
            return true;
        }
        if (ranges[i].length === 2 && nr >= ranges[i][0] && nr <= ranges[i][1]) {
            return true;
        }
    }
    return false;
}

/**
 * Creates a transform stream for encoding data to Quoted-Printable encoding
 *
 * @constructor
 * @param {Object} options Stream options
 * @param {Number} [options.lineLength=76] Maximum length for lines, set to false to disable wrapping
 */
class Encoder extends Transform {
    constructor(options) {
        super();

        // init Transform
        this.options = options || {};

        if (this.options.lineLength !== false) {
            this.options.lineLength = this.options.lineLength || 76;
        }

        this._curLine = '';

        this.inputBytes = 0;
        this.outputBytes = 0;
    }

    _transform(chunk, encoding, done) {
        let qp;

        if (encoding !== 'buffer') {
            chunk = Buffer.from(chunk, encoding);
        }

        if (!chunk || !chunk.length) {
            return done();
        }

        this.inputBytes += chunk.length;

        if (this.options.lineLength) {
            qp = this._curLine + encode(chunk);
            qp = wrap(qp, this.options.lineLength);
            qp = qp.replace(/(^|\n)([^\n]*)$/, (match, lineBreak, lastLine) => {
                this._curLine = lastLine;
                return lineBreak;
            });

            if (qp) {
                this.outputBytes += qp.length;
                this.push(qp);
            }
        } else {
            qp = encode(chunk);
            this.outputBytes += qp.length;
            this.push(qp, 'ascii');
        }

        done();
    }

    _flush(done) {
        if (this._curLine) {
            this.outputBytes += this._curLine.length;
            this.push(this._curLine, 'ascii');
        }
        done();
    }
}

// expose to the world
module.exports = {
    encode,
    wrap,
    Encoder
};


/***/ }),

/***/ 8910:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const spawn = (__nccwpck_require__(2081).spawn);
const packageData = __nccwpck_require__(4129);
const shared = __nccwpck_require__(2673);

/**
 * Generates a Transport object for Sendmail
 *
 * Possible options can be the following:
 *
 *  * **path** optional path to sendmail binary
 *  * **newline** either 'windows' or 'unix'
 *  * **args** an array of arguments for the sendmail binary
 *
 * @constructor
 * @param {Object} optional config parameter for Sendmail
 */
class SendmailTransport {
    constructor(options) {
        options = options || {};

        // use a reference to spawn for mocking purposes
        this._spawn = spawn;

        this.options = options || {};

        this.name = 'Sendmail';
        this.version = packageData.version;

        this.path = 'sendmail';
        this.args = false;
        this.winbreak = false;

        this.logger = shared.getLogger(this.options, {
            component: this.options.component || 'sendmail'
        });

        if (options) {
            if (typeof options === 'string') {
                this.path = options;
            } else if (typeof options === 'object') {
                if (options.path) {
                    this.path = options.path;
                }
                if (Array.isArray(options.args)) {
                    this.args = options.args;
                }
                this.winbreak = ['win', 'windows', 'dos', '\r\n'].includes((options.newline || '').toString().toLowerCase());
            }
        }
    }

    /**
     * <p>Compiles a mailcomposer message and forwards it to handler that sends it.</p>
     *
     * @param {Object} emailMessage MailComposer object
     * @param {Function} callback Callback function to run when the sending is completed
     */
    send(mail, done) {
        // Sendmail strips this header line by itself
        mail.message.keepBcc = true;

        let envelope = mail.data.envelope || mail.message.getEnvelope();
        let messageId = mail.message.messageId();
        let args;
        let sendmail;
        let returned;

        const hasInvalidAddresses = []
            .concat(envelope.from || [])
            .concat(envelope.to || [])
            .some(addr => /^-/.test(addr));
        if (hasInvalidAddresses) {
            return done(new Error('Can not send mail. Invalid envelope addresses.'));
        }

        if (this.args) {
            // force -i to keep single dots
            args = ['-i'].concat(this.args).concat(envelope.to);
        } else {
            args = ['-i'].concat(envelope.from ? ['-f', envelope.from] : []).concat(envelope.to);
        }

        let callback = err => {
            if (returned) {
                // ignore any additional responses, already done
                return;
            }
            returned = true;
            if (typeof done === 'function') {
                if (err) {
                    return done(err);
                } else {
                    return done(null, {
                        envelope: mail.data.envelope || mail.message.getEnvelope(),
                        messageId,
                        response: 'Messages queued for delivery'
                    });
                }
            }
        };

        try {
            sendmail = this._spawn(this.path, args);
        } catch (E) {
            this.logger.error(
                {
                    err: E,
                    tnx: 'spawn',
                    messageId
                },
                'Error occurred while spawning sendmail. %s',
                E.message
            );
            return callback(E);
        }

        if (sendmail) {
            sendmail.on('error', err => {
                this.logger.error(
                    {
                        err,
                        tnx: 'spawn',
                        messageId
                    },
                    'Error occurred when sending message %s. %s',
                    messageId,
                    err.message
                );
                callback(err);
            });

            sendmail.once('exit', code => {
                if (!code) {
                    return callback();
                }
                let err;
                if (code === 127) {
                    err = new Error('Sendmail command not found, process exited with code ' + code);
                } else {
                    err = new Error('Sendmail exited with code ' + code);
                }

                this.logger.error(
                    {
                        err,
                        tnx: 'stdin',
                        messageId
                    },
                    'Error sending message %s to sendmail. %s',
                    messageId,
                    err.message
                );
                callback(err);
            });
            sendmail.once('close', callback);

            sendmail.stdin.on('error', err => {
                this.logger.error(
                    {
                        err,
                        tnx: 'stdin',
                        messageId
                    },
                    'Error occurred when piping message %s to sendmail. %s',
                    messageId,
                    err.message
                );
                callback(err);
            });

            let recipients = [].concat(envelope.to || []);
            if (recipients.length > 3) {
                recipients.push('...and ' + recipients.splice(2).length + ' more');
            }
            this.logger.info(
                {
                    tnx: 'send',
                    messageId
                },
                'Sending message %s to <%s>',
                messageId,
                recipients.join(', ')
            );

            let sourceStream = mail.message.createReadStream();
            sourceStream.once('error', err => {
                this.logger.error(
                    {
                        err,
                        tnx: 'stdin',
                        messageId
                    },
                    'Error occurred when generating message %s. %s',
                    messageId,
                    err.message
                );
                sendmail.kill('SIGINT'); // do not deliver the message
                callback(err);
            });

            sourceStream.pipe(sendmail.stdin);
        } else {
            return callback(new Error('sendmail was not found'));
        }
    }
}

module.exports = SendmailTransport;


/***/ }),

/***/ 5924:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const EventEmitter = __nccwpck_require__(2361);
const packageData = __nccwpck_require__(4129);
const shared = __nccwpck_require__(2673);
const LeWindows = __nccwpck_require__(3304);

/**
 * Generates a Transport object for AWS SES
 *
 * Possible options can be the following:
 *
 *  * **sendingRate** optional Number specifying how many messages per second should be delivered to SES
 *  * **maxConnections** optional Number specifying max number of parallel connections to SES
 *
 * @constructor
 * @param {Object} optional config parameter
 */
class SESTransport extends EventEmitter {
    constructor(options) {
        super();
        options = options || {};

        this.options = options || {};
        this.ses = this.options.SES;

        this.name = 'SESTransport';
        this.version = packageData.version;

        this.logger = shared.getLogger(this.options, {
            component: this.options.component || 'ses-transport'
        });

        // parallel sending connections
        this.maxConnections = Number(this.options.maxConnections) || Infinity;
        this.connections = 0;

        // max messages per second
        this.sendingRate = Number(this.options.sendingRate) || Infinity;
        this.sendingRateTTL = null;
        this.rateInterval = 1000; // milliseconds
        this.rateMessages = [];

        this.pending = [];

        this.idling = true;

        setImmediate(() => {
            if (this.idling) {
                this.emit('idle');
            }
        });
    }

    /**
     * Schedules a sending of a message
     *
     * @param {Object} emailMessage MailComposer object
     * @param {Function} callback Callback function to run when the sending is completed
     */
    send(mail, callback) {
        if (this.connections >= this.maxConnections) {
            this.idling = false;
            return this.pending.push({
                mail,
                callback
            });
        }

        if (!this._checkSendingRate()) {
            this.idling = false;
            return this.pending.push({
                mail,
                callback
            });
        }

        this._send(mail, (...args) => {
            setImmediate(() => callback(...args));
            this._sent();
        });
    }

    _checkRatedQueue() {
        if (this.connections >= this.maxConnections || !this._checkSendingRate()) {
            return;
        }

        if (!this.pending.length) {
            if (!this.idling) {
                this.idling = true;
                this.emit('idle');
            }
            return;
        }

        let next = this.pending.shift();
        this._send(next.mail, (...args) => {
            setImmediate(() => next.callback(...args));
            this._sent();
        });
    }

    _checkSendingRate() {
        clearTimeout(this.sendingRateTTL);

        let now = Date.now();
        let oldest = false;
        // delete older messages
        for (let i = this.rateMessages.length - 1; i >= 0; i--) {
            if (this.rateMessages[i].ts >= now - this.rateInterval && (!oldest || this.rateMessages[i].ts < oldest)) {
                oldest = this.rateMessages[i].ts;
            }

            if (this.rateMessages[i].ts < now - this.rateInterval && !this.rateMessages[i].pending) {
                this.rateMessages.splice(i, 1);
            }
        }

        if (this.rateMessages.length < this.sendingRate) {
            return true;
        }

        let delay = Math.max(oldest + 1001, now + 20);
        this.sendingRateTTL = setTimeout(() => this._checkRatedQueue(), now - delay);

        try {
            this.sendingRateTTL.unref();
        } catch (E) {
            // Ignore. Happens on envs with non-node timer implementation
        }

        return false;
    }

    _sent() {
        this.connections--;
        this._checkRatedQueue();
    }

    /**
     * Returns true if there are free slots in the queue
     */
    isIdle() {
        return this.idling;
    }

    /**
     * Compiles a mailcomposer message and forwards it to SES
     *
     * @param {Object} emailMessage MailComposer object
     * @param {Function} callback Callback function to run when the sending is completed
     */
    _send(mail, callback) {
        let statObject = {
            ts: Date.now(),
            pending: true
        };
        this.connections++;
        this.rateMessages.push(statObject);

        let envelope = mail.data.envelope || mail.message.getEnvelope();
        let messageId = mail.message.messageId();

        let recipients = [].concat(envelope.to || []);
        if (recipients.length > 3) {
            recipients.push('...and ' + recipients.splice(2).length + ' more');
        }
        this.logger.info(
            {
                tnx: 'send',
                messageId
            },
            'Sending message %s to <%s>',
            messageId,
            recipients.join(', ')
        );

        let getRawMessage = next => {
            // do not use Message-ID and Date in DKIM signature
            if (!mail.data._dkim) {
                mail.data._dkim = {};
            }
            if (mail.data._dkim.skipFields && typeof mail.data._dkim.skipFields === 'string') {
                mail.data._dkim.skipFields += ':date:message-id';
            } else {
                mail.data._dkim.skipFields = 'date:message-id';
            }

            let sourceStream = mail.message.createReadStream();
            let stream = sourceStream.pipe(new LeWindows());
            let chunks = [];
            let chunklen = 0;

            stream.on('readable', () => {
                let chunk;
                while ((chunk = stream.read()) !== null) {
                    chunks.push(chunk);
                    chunklen += chunk.length;
                }
            });

            sourceStream.once('error', err => stream.emit('error', err));

            stream.once('error', err => {
                next(err);
            });

            stream.once('end', () => next(null, Buffer.concat(chunks, chunklen)));
        };

        setImmediate(() =>
            getRawMessage((err, raw) => {
                if (err) {
                    this.logger.error(
                        {
                            err,
                            tnx: 'send',
                            messageId
                        },
                        'Failed creating message for %s. %s',
                        messageId,
                        err.message
                    );
                    statObject.pending = false;
                    return callback(err);
                }

                let sesMessage = {
                    RawMessage: {
                        // required
                        Data: raw // required
                    },
                    Source: envelope.from,
                    Destinations: envelope.to
                };

                Object.keys(mail.data.ses || {}).forEach(key => {
                    sesMessage[key] = mail.data.ses[key];
                });

                let ses = (this.ses.aws ? this.ses.ses : this.ses) || {};
                let aws = this.ses.aws || {};

                let getRegion = cb => {
                    if (ses.config && typeof ses.config.region === 'function') {
                        // promise
                        return ses.config
                            .region()
                            .then(region => cb(null, region))
                            .catch(err => cb(err));
                    }
                    return cb(null, (ses.config && ses.config.region) || 'us-east-1');
                };

                getRegion((err, region) => {
                    if (err || !region) {
                        region = 'us-east-1';
                    }

                    let sendPromise;
                    if (typeof ses.send === 'function' && aws.SendRawEmailCommand) {
                        // v3 API
                        sendPromise = ses.send(new aws.SendRawEmailCommand(sesMessage));
                    } else {
                        // v2 API
                        sendPromise = ses.sendRawEmail(sesMessage).promise();
                    }

                    sendPromise
                        .then(data => {
                            if (region === 'us-east-1') {
                                region = 'email';
                            }

                            statObject.pending = false;
                            callback(null, {
                                envelope: {
                                    from: envelope.from,
                                    to: envelope.to
                                },
                                messageId: '<' + data.MessageId + (!/@/.test(data.MessageId) ? '@' + region + '.amazonses.com' : '') + '>',
                                response: data.MessageId,
                                raw
                            });
                        })
                        .catch(err => {
                            this.logger.error(
                                {
                                    err,
                                    tnx: 'send'
                                },
                                'Send error for %s: %s',
                                messageId,
                                err.message
                            );
                            statObject.pending = false;
                            callback(err);
                        });
                });
            })
        );
    }

    /**
     * Verifies SES configuration
     *
     * @param {Function} callback Callback function
     */
    verify(callback) {
        let promise;
        let ses = (this.ses.aws ? this.ses.ses : this.ses) || {};
        let aws = this.ses.aws || {};

        const sesMessage = {
            RawMessage: {
                // required
                Data: 'From: invalid@invalid\r\nTo: invalid@invalid\r\n Subject: Invalid\r\n\r\nInvalid'
            },
            Source: 'invalid@invalid',
            Destinations: ['invalid@invalid']
        };

        if (!callback) {
            promise = new Promise((resolve, reject) => {
                callback = shared.callbackPromise(resolve, reject);
            });
        }
        const cb = err => {
            if (err && (err.code || err.Code) !== 'InvalidParameterValue') {
                return callback(err);
            }
            return callback(null, true);
        };

        if (typeof ses.send === 'function' && aws.SendRawEmailCommand) {
            // v3 API
            sesMessage.RawMessage.Data = Buffer.from(sesMessage.RawMessage.Data);
            ses.send(new aws.SendRawEmailCommand(sesMessage), cb);
        } else {
            // v2 API
            ses.sendRawEmail(sesMessage, cb);
        }

        return promise;
    }
}

module.exports = SESTransport;


/***/ }),

/***/ 2673:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/* eslint no-console: 0 */



const urllib = __nccwpck_require__(7310);
const util = __nccwpck_require__(3837);
const fs = __nccwpck_require__(7147);
const nmfetch = __nccwpck_require__(9106);
const dns = __nccwpck_require__(9523);
const net = __nccwpck_require__(1808);
const os = __nccwpck_require__(2037);

const DNS_TTL = 5 * 60 * 1000;

let networkInterfaces;
try {
    networkInterfaces = os.networkInterfaces();
} catch (err) {
    // fails on some systems
}

module.exports.networkInterfaces = networkInterfaces;

const isFamilySupported = (family, allowInternal) => {
    let networkInterfaces = module.exports.networkInterfaces;
    if (!networkInterfaces) {
        // hope for the best
        return true;
    }

    const familySupported =
        // crux that replaces Object.values(networkInterfaces) as Object.values is not supported in nodejs v6
        Object.keys(networkInterfaces)
            .map(key => networkInterfaces[key])
            // crux that replaces .flat() as it is not supported in older Node versions (v10 and older)
            .reduce((acc, val) => acc.concat(val), [])
            .filter(i => !i.internal || allowInternal)
            .filter(i => i.family === 'IPv' + family || i.family === family).length > 0;

    return familySupported;
};

const resolver = (family, hostname, options, callback) => {
    options = options || {};
    const familySupported = isFamilySupported(family, options.allowInternalNetworkInterfaces);

    if (!familySupported) {
        return callback(null, []);
    }

    const resolver = dns.Resolver ? new dns.Resolver(options) : dns;
    resolver['resolve' + family](hostname, (err, addresses) => {
        if (err) {
            switch (err.code) {
                case dns.NODATA:
                case dns.NOTFOUND:
                case dns.NOTIMP:
                case dns.SERVFAIL:
                case dns.CONNREFUSED:
                case dns.REFUSED:
                case 'EAI_AGAIN':
                    return callback(null, []);
            }
            return callback(err);
        }
        return callback(null, Array.isArray(addresses) ? addresses : [].concat(addresses || []));
    });
};

const dnsCache = (module.exports.dnsCache = new Map());

const formatDNSValue = (value, extra) => {
    if (!value) {
        return Object.assign({}, extra || {});
    }

    return Object.assign(
        {
            servername: value.servername,
            host:
                !value.addresses || !value.addresses.length
                    ? null
                    : value.addresses.length === 1
                    ? value.addresses[0]
                    : value.addresses[Math.floor(Math.random() * value.addresses.length)]
        },
        extra || {}
    );
};

module.exports.resolveHostname = (options, callback) => {
    options = options || {};

    if (!options.host && options.servername) {
        options.host = options.servername;
    }

    if (!options.host || net.isIP(options.host)) {
        // nothing to do here
        let value = {
            addresses: [options.host],
            servername: options.servername || false
        };
        return callback(
            null,
            formatDNSValue(value, {
                cached: false
            })
        );
    }

    let cached;
    if (dnsCache.has(options.host)) {
        cached = dnsCache.get(options.host);

        if (!cached.expires || cached.expires >= Date.now()) {
            return callback(
                null,
                formatDNSValue(cached.value, {
                    cached: true
                })
            );
        }
    }

    resolver(4, options.host, options, (err, addresses) => {
        if (err) {
            if (cached) {
                // ignore error, use expired value
                return callback(
                    null,
                    formatDNSValue(cached.value, {
                        cached: true,
                        error: err
                    })
                );
            }
            return callback(err);
        }

        if (addresses && addresses.length) {
            let value = {
                addresses,
                servername: options.servername || options.host
            };

            dnsCache.set(options.host, {
                value,
                expires: Date.now() + (options.dnsTtl || DNS_TTL)
            });

            return callback(
                null,
                formatDNSValue(value, {
                    cached: false
                })
            );
        }

        resolver(6, options.host, options, (err, addresses) => {
            if (err) {
                if (cached) {
                    // ignore error, use expired value
                    return callback(
                        null,
                        formatDNSValue(cached.value, {
                            cached: true,
                            error: err
                        })
                    );
                }
                return callback(err);
            }

            if (addresses && addresses.length) {
                let value = {
                    addresses,
                    servername: options.servername || options.host
                };

                dnsCache.set(options.host, {
                    value,
                    expires: Date.now() + (options.dnsTtl || DNS_TTL)
                });

                return callback(
                    null,
                    formatDNSValue(value, {
                        cached: false
                    })
                );
            }

            try {
                dns.lookup(options.host, { all: true }, (err, addresses) => {
                    if (err) {
                        if (cached) {
                            // ignore error, use expired value
                            return callback(
                                null,
                                formatDNSValue(cached.value, {
                                    cached: true,
                                    error: err
                                })
                            );
                        }
                        return callback(err);
                    }

                    let address = addresses
                        ? addresses
                              .filter(addr => isFamilySupported(addr.family))
                              .map(addr => addr.address)
                              .shift()
                        : false;

                    if (addresses && addresses.length && !address) {
                        // there are addresses but none can be used
                        console.warn(`Failed to resolve IPv${addresses[0].family} addresses with current network`);
                    }

                    if (!address && cached) {
                        // nothing was found, fallback to cached value
                        return callback(
                            null,
                            formatDNSValue(cached.value, {
                                cached: true
                            })
                        );
                    }

                    let value = {
                        addresses: address ? [address] : [options.host],
                        servername: options.servername || options.host
                    };

                    dnsCache.set(options.host, {
                        value,
                        expires: Date.now() + (options.dnsTtl || DNS_TTL)
                    });

                    return callback(
                        null,
                        formatDNSValue(value, {
                            cached: false
                        })
                    );
                });
            } catch (err) {
                if (cached) {
                    // ignore error, use expired value
                    return callback(
                        null,
                        formatDNSValue(cached.value, {
                            cached: true,
                            error: err
                        })
                    );
                }
                return callback(err);
            }
        });
    });
};
/**
 * Parses connection url to a structured configuration object
 *
 * @param {String} str Connection url
 * @return {Object} Configuration object
 */
module.exports.parseConnectionUrl = str => {
    str = str || '';
    let options = {};

    [urllib.parse(str, true)].forEach(url => {
        let auth;

        switch (url.protocol) {
            case 'smtp:':
                options.secure = false;
                break;
            case 'smtps:':
                options.secure = true;
                break;
            case 'direct:':
                options.direct = true;
                break;
        }

        if (!isNaN(url.port) && Number(url.port)) {
            options.port = Number(url.port);
        }

        if (url.hostname) {
            options.host = url.hostname;
        }

        if (url.auth) {
            auth = url.auth.split(':');

            if (!options.auth) {
                options.auth = {};
            }

            options.auth.user = auth.shift();
            options.auth.pass = auth.join(':');
        }

        Object.keys(url.query || {}).forEach(key => {
            let obj = options;
            let lKey = key;
            let value = url.query[key];

            if (!isNaN(value)) {
                value = Number(value);
            }

            switch (value) {
                case 'true':
                    value = true;
                    break;
                case 'false':
                    value = false;
                    break;
            }

            // tls is nested object
            if (key.indexOf('tls.') === 0) {
                lKey = key.substr(4);
                if (!options.tls) {
                    options.tls = {};
                }
                obj = options.tls;
            } else if (key.indexOf('.') >= 0) {
                // ignore nested properties besides tls
                return;
            }

            if (!(lKey in obj)) {
                obj[lKey] = value;
            }
        });
    });

    return options;
};

module.exports._logFunc = (logger, level, defaults, data, message, ...args) => {
    let entry = {};

    Object.keys(defaults || {}).forEach(key => {
        if (key !== 'level') {
            entry[key] = defaults[key];
        }
    });

    Object.keys(data || {}).forEach(key => {
        if (key !== 'level') {
            entry[key] = data[key];
        }
    });

    logger[level](entry, message, ...args);
};

/**
 * Returns a bunyan-compatible logger interface. Uses either provided logger or
 * creates a default console logger
 *
 * @param {Object} [options] Options object that might include 'logger' value
 * @return {Object} bunyan compatible logger
 */
module.exports.getLogger = (options, defaults) => {
    options = options || {};

    let response = {};
    let levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

    if (!options.logger) {
        // use vanity logger
        levels.forEach(level => {
            response[level] = () => false;
        });
        return response;
    }

    let logger = options.logger;

    if (options.logger === true) {
        // create console logger
        logger = createDefaultLogger(levels);
    }

    levels.forEach(level => {
        response[level] = (data, message, ...args) => {
            module.exports._logFunc(logger, level, defaults, data, message, ...args);
        };
    });

    return response;
};

/**
 * Wrapper for creating a callback that either resolves or rejects a promise
 * based on input
 *
 * @param {Function} resolve Function to run if callback is called
 * @param {Function} reject Function to run if callback ends with an error
 */
module.exports.callbackPromise = (resolve, reject) =>
    function () {
        let args = Array.from(arguments);
        let err = args.shift();
        if (err) {
            reject(err);
        } else {
            resolve(...args);
        }
    };

module.exports.parseDataURI = uri => {
    let input = uri;
    let commaPos = input.indexOf(',');
    if (!commaPos) {
        return uri;
    }

    let data = input.substring(commaPos + 1);
    let metaStr = input.substring('data:'.length, commaPos);

    let encoding;

    let metaEntries = metaStr.split(';');
    let lastMetaEntry = metaEntries.length > 1 ? metaEntries[metaEntries.length - 1] : false;
    if (lastMetaEntry && lastMetaEntry.indexOf('=') < 0) {
        encoding = lastMetaEntry.toLowerCase();
        metaEntries.pop();
    }

    let contentType = metaEntries.shift() || 'application/octet-stream';
    let params = {};
    for (let entry of metaEntries) {
        let sep = entry.indexOf('=');
        if (sep >= 0) {
            let key = entry.substring(0, sep);
            let value = entry.substring(sep + 1);
            params[key] = value;
        }
    }

    switch (encoding) {
        case 'base64':
            data = Buffer.from(data, 'base64');
            break;
        case 'utf8':
            data = Buffer.from(data);
            break;
        default:
            try {
                data = Buffer.from(decodeURIComponent(data));
            } catch (err) {
                data = Buffer.from(data);
            }
            data = Buffer.from(data);
    }

    return { data, encoding, contentType, params };
};

/**
 * Resolves a String or a Buffer value for content value. Useful if the value
 * is a Stream or a file or an URL. If the value is a Stream, overwrites
 * the stream object with the resolved value (you can't stream a value twice).
 *
 * This is useful when you want to create a plugin that needs a content value,
 * for example the `html` or `text` value as a String or a Buffer but not as
 * a file path or an URL.
 *
 * @param {Object} data An object or an Array you want to resolve an element for
 * @param {String|Number} key Property name or an Array index
 * @param {Function} callback Callback function with (err, value)
 */
module.exports.resolveContent = (data, key, callback) => {
    let promise;

    if (!callback) {
        promise = new Promise((resolve, reject) => {
            callback = module.exports.callbackPromise(resolve, reject);
        });
    }

    let content = (data && data[key] && data[key].content) || data[key];
    let contentStream;
    let encoding = ((typeof data[key] === 'object' && data[key].encoding) || 'utf8')
        .toString()
        .toLowerCase()
        .replace(/[-_\s]/g, '');

    if (!content) {
        return callback(null, content);
    }

    if (typeof content === 'object') {
        if (typeof content.pipe === 'function') {
            return resolveStream(content, (err, value) => {
                if (err) {
                    return callback(err);
                }
                // we can't stream twice the same content, so we need
                // to replace the stream object with the streaming result
                if (data[key].content) {
                    data[key].content = value;
                } else {
                    data[key] = value;
                }
                callback(null, value);
            });
        } else if (/^https?:\/\//i.test(content.path || content.href)) {
            contentStream = nmfetch(content.path || content.href);
            return resolveStream(contentStream, callback);
        } else if (/^data:/i.test(content.path || content.href)) {
            let parsedDataUri = module.exports.parseDataURI(content.path || content.href);

            if (!parsedDataUri || !parsedDataUri.data) {
                return callback(null, Buffer.from(0));
            }
            return callback(null, parsedDataUri.data);
        } else if (content.path) {
            return resolveStream(fs.createReadStream(content.path), callback);
        }
    }

    if (typeof data[key].content === 'string' && !['utf8', 'usascii', 'ascii'].includes(encoding)) {
        content = Buffer.from(data[key].content, encoding);
    }

    // default action, return as is
    setImmediate(() => callback(null, content));

    return promise;
};

/**
 * Copies properties from source objects to target objects
 */
module.exports.assign = function (/* target, ... sources */) {
    let args = Array.from(arguments);
    let target = args.shift() || {};

    args.forEach(source => {
        Object.keys(source || {}).forEach(key => {
            if (['tls', 'auth'].includes(key) && source[key] && typeof source[key] === 'object') {
                // tls and auth are special keys that need to be enumerated separately
                // other objects are passed as is
                if (!target[key]) {
                    // ensure that target has this key
                    target[key] = {};
                }
                Object.keys(source[key]).forEach(subKey => {
                    target[key][subKey] = source[key][subKey];
                });
            } else {
                target[key] = source[key];
            }
        });
    });
    return target;
};

module.exports.encodeXText = str => {
    // ! 0x21
    // + 0x2B
    // = 0x3D
    // ~ 0x7E
    if (!/[^\x21-\x2A\x2C-\x3C\x3E-\x7E]/.test(str)) {
        return str;
    }
    let buf = Buffer.from(str);
    let result = '';
    for (let i = 0, len = buf.length; i < len; i++) {
        let c = buf[i];
        if (c < 0x21 || c > 0x7e || c === 0x2b || c === 0x3d) {
            result += '+' + (c < 0x10 ? '0' : '') + c.toString(16).toUpperCase();
        } else {
            result += String.fromCharCode(c);
        }
    }
    return result;
};

/**
 * Streams a stream value into a Buffer
 *
 * @param {Object} stream Readable stream
 * @param {Function} callback Callback function with (err, value)
 */
function resolveStream(stream, callback) {
    let responded = false;
    let chunks = [];
    let chunklen = 0;

    stream.on('error', err => {
        if (responded) {
            return;
        }

        responded = true;
        callback(err);
    });

    stream.on('readable', () => {
        let chunk;
        while ((chunk = stream.read()) !== null) {
            chunks.push(chunk);
            chunklen += chunk.length;
        }
    });

    stream.on('end', () => {
        if (responded) {
            return;
        }
        responded = true;

        let value;

        try {
            value = Buffer.concat(chunks, chunklen);
        } catch (E) {
            return callback(E);
        }
        callback(null, value);
    });
}

/**
 * Generates a bunyan-like logger that prints to console
 *
 * @returns {Object} Bunyan logger instance
 */
function createDefaultLogger(levels) {
    let levelMaxLen = 0;
    let levelNames = new Map();
    levels.forEach(level => {
        if (level.length > levelMaxLen) {
            levelMaxLen = level.length;
        }
    });

    levels.forEach(level => {
        let levelName = level.toUpperCase();
        if (levelName.length < levelMaxLen) {
            levelName += ' '.repeat(levelMaxLen - levelName.length);
        }
        levelNames.set(level, levelName);
    });

    let print = (level, entry, message, ...args) => {
        let prefix = '';
        if (entry) {
            if (entry.tnx === 'server') {
                prefix = 'S: ';
            } else if (entry.tnx === 'client') {
                prefix = 'C: ';
            }

            if (entry.sid) {
                prefix = '[' + entry.sid + '] ' + prefix;
            }

            if (entry.cid) {
                prefix = '[#' + entry.cid + '] ' + prefix;
            }
        }

        message = util.format(message, ...args);
        message.split(/\r?\n/).forEach(line => {
            console.log('[%s] %s %s', new Date().toISOString().substr(0, 19).replace(/T/, ' '), levelNames.get(level), prefix + line);
        });
    };

    let logger = {};
    levels.forEach(level => {
        logger[level] = print.bind(null, level);
    });

    return logger;
}


/***/ }),

/***/ 4447:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const stream = __nccwpck_require__(2781);
const Transform = stream.Transform;

/**
 * Escapes dots in the beginning of lines. Ends the stream with <CR><LF>.<CR><LF>
 * Also makes sure that only <CR><LF> sequences are used for linebreaks
 *
 * @param {Object} options Stream options
 */
class DataStream extends Transform {
    constructor(options) {
        super(options);
        // init Transform
        this.options = options || {};
        this._curLine = '';

        this.inByteCount = 0;
        this.outByteCount = 0;
        this.lastByte = false;
    }

    /**
     * Escapes dots
     */
    _transform(chunk, encoding, done) {
        let chunks = [];
        let chunklen = 0;
        let i,
            len,
            lastPos = 0;
        let buf;

        if (!chunk || !chunk.length) {
            return done();
        }

        if (typeof chunk === 'string') {
            chunk = Buffer.from(chunk);
        }

        this.inByteCount += chunk.length;

        for (i = 0, len = chunk.length; i < len; i++) {
            if (chunk[i] === 0x2e) {
                // .
                if ((i && chunk[i - 1] === 0x0a) || (!i && (!this.lastByte || this.lastByte === 0x0a))) {
                    buf = chunk.slice(lastPos, i + 1);
                    chunks.push(buf);
                    chunks.push(Buffer.from('.'));
                    chunklen += buf.length + 1;
                    lastPos = i + 1;
                }
            } else if (chunk[i] === 0x0a) {
                // .
                if ((i && chunk[i - 1] !== 0x0d) || (!i && this.lastByte !== 0x0d)) {
                    if (i > lastPos) {
                        buf = chunk.slice(lastPos, i);
                        chunks.push(buf);
                        chunklen += buf.length + 2;
                    } else {
                        chunklen += 2;
                    }
                    chunks.push(Buffer.from('\r\n'));
                    lastPos = i + 1;
                }
            }
        }

        if (chunklen) {
            // add last piece
            if (lastPos < chunk.length) {
                buf = chunk.slice(lastPos);
                chunks.push(buf);
                chunklen += buf.length;
            }

            this.outByteCount += chunklen;
            this.push(Buffer.concat(chunks, chunklen));
        } else {
            this.outByteCount += chunk.length;
            this.push(chunk);
        }

        this.lastByte = chunk[chunk.length - 1];
        done();
    }

    /**
     * Finalizes the stream with a dot on a single line
     */
    _flush(done) {
        let buf;
        if (this.lastByte === 0x0a) {
            buf = Buffer.from('.\r\n');
        } else if (this.lastByte === 0x0d) {
            buf = Buffer.from('\n.\r\n');
        } else {
            buf = Buffer.from('\r\n.\r\n');
        }
        this.outByteCount += buf.length;
        this.push(buf);
        done();
    }
}

module.exports = DataStream;


/***/ }),

/***/ 7643:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


/**
 * Minimal HTTP/S proxy client
 */

const net = __nccwpck_require__(1808);
const tls = __nccwpck_require__(4404);
const urllib = __nccwpck_require__(7310);

/**
 * Establishes proxied connection to destinationPort
 *
 * httpProxyClient("http://localhost:3128/", 80, "google.com", function(err, socket){
 *     socket.write("GET / HTTP/1.0\r\n\r\n");
 * });
 *
 * @param {String} proxyUrl proxy configuration, etg "http://proxy.host:3128/"
 * @param {Number} destinationPort Port to open in destination host
 * @param {String} destinationHost Destination hostname
 * @param {Function} callback Callback to run with the rocket object once connection is established
 */
function httpProxyClient(proxyUrl, destinationPort, destinationHost, callback) {
    let proxy = urllib.parse(proxyUrl);

    // create a socket connection to the proxy server
    let options;
    let connect;
    let socket;

    options = {
        host: proxy.hostname,
        port: Number(proxy.port) ? Number(proxy.port) : proxy.protocol === 'https:' ? 443 : 80
    };

    if (proxy.protocol === 'https:') {
        // we can use untrusted proxies as long as we verify actual SMTP certificates
        options.rejectUnauthorized = false;
        connect = tls.connect.bind(tls);
    } else {
        connect = net.connect.bind(net);
    }

    // Error harness for initial connection. Once connection is established, the responsibility
    // to handle errors is passed to whoever uses this socket
    let finished = false;
    let tempSocketErr = err => {
        if (finished) {
            return;
        }
        finished = true;
        try {
            socket.destroy();
        } catch (E) {
            // ignore
        }
        callback(err);
    };

    let timeoutErr = () => {
        let err = new Error('Proxy socket timed out');
        err.code = 'ETIMEDOUT';
        tempSocketErr(err);
    };

    socket = connect(options, () => {
        if (finished) {
            return;
        }

        let reqHeaders = {
            Host: destinationHost + ':' + destinationPort,
            Connection: 'close'
        };
        if (proxy.auth) {
            reqHeaders['Proxy-Authorization'] = 'Basic ' + Buffer.from(proxy.auth).toString('base64');
        }

        socket.write(
            // HTTP method
            'CONNECT ' +
                destinationHost +
                ':' +
                destinationPort +
                ' HTTP/1.1\r\n' +
                // HTTP request headers
                Object.keys(reqHeaders)
                    .map(key => key + ': ' + reqHeaders[key])
                    .join('\r\n') +
                // End request
                '\r\n\r\n'
        );

        let headers = '';
        let onSocketData = chunk => {
            let match;
            let remainder;

            if (finished) {
                return;
            }

            headers += chunk.toString('binary');
            if ((match = headers.match(/\r\n\r\n/))) {
                socket.removeListener('data', onSocketData);

                remainder = headers.substr(match.index + match[0].length);
                headers = headers.substr(0, match.index);
                if (remainder) {
                    socket.unshift(Buffer.from(remainder, 'binary'));
                }

                // proxy connection is now established
                finished = true;

                // check response code
                match = headers.match(/^HTTP\/\d+\.\d+ (\d+)/i);
                if (!match || (match[1] || '').charAt(0) !== '2') {
                    try {
                        socket.destroy();
                    } catch (E) {
                        // ignore
                    }
                    return callback(new Error('Invalid response from proxy' + ((match && ': ' + match[1]) || '')));
                }

                socket.removeListener('error', tempSocketErr);
                socket.removeListener('timeout', timeoutErr);
                socket.setTimeout(0);

                return callback(null, socket);
            }
        };
        socket.on('data', onSocketData);
    });

    socket.setTimeout(httpProxyClient.timeout || 30 * 1000);
    socket.on('timeout', timeoutErr);

    socket.once('error', tempSocketErr);
}

module.exports = httpProxyClient;


/***/ }),

/***/ 3559:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const packageInfo = __nccwpck_require__(4129);
const EventEmitter = (__nccwpck_require__(2361).EventEmitter);
const net = __nccwpck_require__(1808);
const tls = __nccwpck_require__(4404);
const os = __nccwpck_require__(2037);
const crypto = __nccwpck_require__(6113);
const DataStream = __nccwpck_require__(4447);
const PassThrough = (__nccwpck_require__(2781).PassThrough);
const shared = __nccwpck_require__(2673);

// default timeout values in ms
const CONNECTION_TIMEOUT = 2 * 60 * 1000; // how much to wait for the connection to be established
const SOCKET_TIMEOUT = 10 * 60 * 1000; // how much to wait for socket inactivity before disconnecting the client
const GREETING_TIMEOUT = 30 * 1000; // how much to wait after connection is established but SMTP greeting is not receieved
const DNS_TIMEOUT = 30 * 1000; // how much to wait for resolveHostname

/**
 * Generates a SMTP connection object
 *
 * Optional options object takes the following possible properties:
 *
 *  * **port** - is the port to connect to (defaults to 587 or 465)
 *  * **host** - is the hostname or IP address to connect to (defaults to 'localhost')
 *  * **secure** - use SSL
 *  * **ignoreTLS** - ignore server support for STARTTLS
 *  * **requireTLS** - forces the client to use STARTTLS
 *  * **name** - the name of the client server
 *  * **localAddress** - outbound address to bind to (see: http://nodejs.org/api/net.html#net_net_connect_options_connectionlistener)
 *  * **greetingTimeout** - Time to wait in ms until greeting message is received from the server (defaults to 10000)
 *  * **connectionTimeout** - how many milliseconds to wait for the connection to establish
 *  * **socketTimeout** - Time of inactivity until the connection is closed (defaults to 1 hour)
 *  * **dnsTimeout** - Time to wait in ms for the DNS requests to be resolved (defaults to 30 seconds)
 *  * **lmtp** - if true, uses LMTP instead of SMTP protocol
 *  * **logger** - bunyan compatible logger interface
 *  * **debug** - if true pass SMTP traffic to the logger
 *  * **tls** - options for createCredentials
 *  * **socket** - existing socket to use instead of creating a new one (see: http://nodejs.org/api/net.html#net_class_net_socket)
 *  * **secured** - boolean indicates that the provided socket has already been upgraded to tls
 *
 * @constructor
 * @namespace SMTP Client module
 * @param {Object} [options] Option properties
 */
class SMTPConnection extends EventEmitter {
    constructor(options) {
        super(options);

        this.id = crypto.randomBytes(8).toString('base64').replace(/\W/g, '');
        this.stage = 'init';

        this.options = options || {};

        this.secureConnection = !!this.options.secure;
        this.alreadySecured = !!this.options.secured;

        this.port = Number(this.options.port) || (this.secureConnection ? 465 : 587);
        this.host = this.options.host || 'localhost';

        this.servername = this.options.servername ? this.options.servername : !net.isIP(this.host) ? this.host : false;

        this.allowInternalNetworkInterfaces = this.options.allowInternalNetworkInterfaces || false;

        if (typeof this.options.secure === 'undefined' && this.port === 465) {
            // if secure option is not set but port is 465, then default to secure
            this.secureConnection = true;
        }

        this.name = this.options.name || this._getHostname();

        this.logger = shared.getLogger(this.options, {
            component: this.options.component || 'smtp-connection',
            sid: this.id
        });

        this.customAuth = new Map();
        Object.keys(this.options.customAuth || {}).forEach(key => {
            let mapKey = (key || '').toString().trim().toUpperCase();
            if (!mapKey) {
                return;
            }
            this.customAuth.set(mapKey, this.options.customAuth[key]);
        });

        /**
         * Expose version nr, just for the reference
         * @type {String}
         */
        this.version = packageInfo.version;

        /**
         * If true, then the user is authenticated
         * @type {Boolean}
         */
        this.authenticated = false;

        /**
         * If set to true, this instance is no longer active
         * @private
         */
        this.destroyed = false;

        /**
         * Defines if the current connection is secure or not. If not,
         * STARTTLS can be used if available
         * @private
         */
        this.secure = !!this.secureConnection;

        /**
         * Store incomplete messages coming from the server
         * @private
         */
        this._remainder = '';

        /**
         * Unprocessed responses from the server
         * @type {Array}
         */
        this._responseQueue = [];

        this.lastServerResponse = false;

        /**
         * The socket connecting to the server
         * @publick
         */
        this._socket = false;

        /**
         * Lists supported auth mechanisms
         * @private
         */
        this._supportedAuth = [];

        /**
         * Set to true, if EHLO response includes "AUTH".
         * If false then authentication is not tried
         */
        this.allowsAuth = false;

        /**
         * Includes current envelope (from, to)
         * @private
         */
        this._envelope = false;

        /**
         * Lists supported extensions
         * @private
         */
        this._supportedExtensions = [];

        /**
         * Defines the maximum allowed size for a single message
         * @private
         */
        this._maxAllowedSize = 0;

        /**
         * Function queue to run if a data chunk comes from the server
         * @private
         */
        this._responseActions = [];
        this._recipientQueue = [];

        /**
         * Timeout variable for waiting the greeting
         * @private
         */
        this._greetingTimeout = false;

        /**
         * Timeout variable for waiting the connection to start
         * @private
         */
        this._connectionTimeout = false;

        /**
         * If the socket is deemed already closed
         * @private
         */
        this._destroyed = false;

        /**
         * If the socket is already being closed
         * @private
         */
        this._closing = false;

        /**
         * Callbacks for socket's listeners
         */
        this._onSocketData = chunk => this._onData(chunk);
        this._onSocketError = error => this._onError(error, 'ESOCKET', false, 'CONN');
        this._onSocketClose = () => this._onClose();
        this._onSocketEnd = () => this._onEnd();
        this._onSocketTimeout = () => this._onTimeout();
    }

    /**
     * Creates a connection to a SMTP server and sets up connection
     * listener
     */
    connect(connectCallback) {
        if (typeof connectCallback === 'function') {
            this.once('connect', () => {
                this.logger.debug(
                    {
                        tnx: 'smtp'
                    },
                    'SMTP handshake finished'
                );
                connectCallback();
            });

            const isDestroyedMessage = this._isDestroyedMessage('connect');
            if (isDestroyedMessage) {
                return connectCallback(this._formatError(isDestroyedMessage, 'ECONNECTION', false, 'CONN'));
            }
        }

        let opts = {
            port: this.port,
            host: this.host,
            allowInternalNetworkInterfaces: this.allowInternalNetworkInterfaces,
            timeout: this.options.dnsTimeout || DNS_TIMEOUT
        };

        if (this.options.localAddress) {
            opts.localAddress = this.options.localAddress;
        }

        let setupConnectionHandlers = () => {
            this._connectionTimeout = setTimeout(() => {
                this._onError('Connection timeout', 'ETIMEDOUT', false, 'CONN');
            }, this.options.connectionTimeout || CONNECTION_TIMEOUT);

            this._socket.on('error', this._onSocketError);
        };

        if (this.options.connection) {
            // connection is already opened
            this._socket = this.options.connection;
            setupConnectionHandlers();

            if (this.secureConnection && !this.alreadySecured) {
                setImmediate(() =>
                    this._upgradeConnection(err => {
                        if (err) {
                            this._onError(new Error('Error initiating TLS - ' + (err.message || err)), 'ETLS', false, 'CONN');
                            return;
                        }
                        this._onConnect();
                    })
                );
            } else {
                setImmediate(() => this._onConnect());
            }
            return;
        } else if (this.options.socket) {
            // socket object is set up but not yet connected
            this._socket = this.options.socket;
            return shared.resolveHostname(opts, (err, resolved) => {
                if (err) {
                    return setImmediate(() => this._onError(err, 'EDNS', false, 'CONN'));
                }
                this.logger.debug(
                    {
                        tnx: 'dns',
                        source: opts.host,
                        resolved: resolved.host,
                        cached: !!resolved.cached
                    },
                    'Resolved %s as %s [cache %s]',
                    opts.host,
                    resolved.host,
                    resolved.cached ? 'hit' : 'miss'
                );
                Object.keys(resolved).forEach(key => {
                    if (key.charAt(0) !== '_' && resolved[key]) {
                        opts[key] = resolved[key];
                    }
                });
                try {
                    this._socket.connect(this.port, this.host, () => {
                        this._socket.setKeepAlive(true);
                        this._onConnect();
                    });
                    setupConnectionHandlers();
                } catch (E) {
                    return setImmediate(() => this._onError(E, 'ECONNECTION', false, 'CONN'));
                }
            });
        } else if (this.secureConnection) {
            // connect using tls
            if (this.options.tls) {
                Object.keys(this.options.tls).forEach(key => {
                    opts[key] = this.options.tls[key];
                });
            }

            // ensure servername for SNI
            if (this.servername && !opts.servername) {
                opts.servername = this.servername;
            }

            return shared.resolveHostname(opts, (err, resolved) => {
                if (err) {
                    return setImmediate(() => this._onError(err, 'EDNS', false, 'CONN'));
                }
                this.logger.debug(
                    {
                        tnx: 'dns',
                        source: opts.host,
                        resolved: resolved.host,
                        cached: !!resolved.cached
                    },
                    'Resolved %s as %s [cache %s]',
                    opts.host,
                    resolved.host,
                    resolved.cached ? 'hit' : 'miss'
                );
                Object.keys(resolved).forEach(key => {
                    if (key.charAt(0) !== '_' && resolved[key]) {
                        opts[key] = resolved[key];
                    }
                });
                try {
                    this._socket = tls.connect(opts, () => {
                        this._socket.setKeepAlive(true);
                        this._onConnect();
                    });
                    setupConnectionHandlers();
                } catch (E) {
                    return setImmediate(() => this._onError(E, 'ECONNECTION', false, 'CONN'));
                }
            });
        } else {
            // connect using plaintext
            return shared.resolveHostname(opts, (err, resolved) => {
                if (err) {
                    return setImmediate(() => this._onError(err, 'EDNS', false, 'CONN'));
                }
                this.logger.debug(
                    {
                        tnx: 'dns',
                        source: opts.host,
                        resolved: resolved.host,
                        cached: !!resolved.cached
                    },
                    'Resolved %s as %s [cache %s]',
                    opts.host,
                    resolved.host,
                    resolved.cached ? 'hit' : 'miss'
                );
                Object.keys(resolved).forEach(key => {
                    if (key.charAt(0) !== '_' && resolved[key]) {
                        opts[key] = resolved[key];
                    }
                });
                try {
                    this._socket = net.connect(opts, () => {
                        this._socket.setKeepAlive(true);
                        this._onConnect();
                    });
                    setupConnectionHandlers();
                } catch (E) {
                    return setImmediate(() => this._onError(E, 'ECONNECTION', false, 'CONN'));
                }
            });
        }
    }

    /**
     * Sends QUIT
     */
    quit() {
        this._sendCommand('QUIT');
        this._responseActions.push(this.close);
    }

    /**
     * Closes the connection to the server
     */
    close() {
        clearTimeout(this._connectionTimeout);
        clearTimeout(this._greetingTimeout);
        this._responseActions = [];

        // allow to run this function only once
        if (this._closing) {
            return;
        }
        this._closing = true;

        let closeMethod = 'end';

        if (this.stage === 'init') {
            // Close the socket immediately when connection timed out
            closeMethod = 'destroy';
        }

        this.logger.debug(
            {
                tnx: 'smtp'
            },
            'Closing connection to the server using "%s"',
            closeMethod
        );

        let socket = (this._socket && this._socket.socket) || this._socket;

        if (socket && !socket.destroyed) {
            try {
                socket[closeMethod]();
            } catch (E) {
                // just ignore
            }
        }

        this._destroy();
    }

    /**
     * Authenticate user
     */
    login(authData, callback) {
        const isDestroyedMessage = this._isDestroyedMessage('login');
        if (isDestroyedMessage) {
            return callback(this._formatError(isDestroyedMessage, 'ECONNECTION', false, 'API'));
        }

        this._auth = authData || {};
        // Select SASL authentication method
        this._authMethod = (this._auth.method || '').toString().trim().toUpperCase() || false;

        if (!this._authMethod && this._auth.oauth2 && !this._auth.credentials) {
            this._authMethod = 'XOAUTH2';
        } else if (!this._authMethod || (this._authMethod === 'XOAUTH2' && !this._auth.oauth2)) {
            // use first supported
            this._authMethod = (this._supportedAuth[0] || 'PLAIN').toUpperCase().trim();
        }

        if (this._authMethod !== 'XOAUTH2' && (!this._auth.credentials || !this._auth.credentials.user || !this._auth.credentials.pass)) {
            if ((this._auth.user && this._auth.pass) || this.customAuth.has(this._authMethod)) {
                this._auth.credentials = {
                    user: this._auth.user,
                    pass: this._auth.pass,
                    options: this._auth.options
                };
            } else {
                return callback(this._formatError('Missing credentials for "' + this._authMethod + '"', 'EAUTH', false, 'API'));
            }
        }

        if (this.customAuth.has(this._authMethod)) {
            let handler = this.customAuth.get(this._authMethod);
            let lastResponse;
            let returned = false;

            let resolve = () => {
                if (returned) {
                    return;
                }
                returned = true;
                this.logger.info(
                    {
                        tnx: 'smtp',
                        username: this._auth.user,
                        action: 'authenticated',
                        method: this._authMethod
                    },
                    'User %s authenticated',
                    JSON.stringify(this._auth.user)
                );
                this.authenticated = true;
                callback(null, true);
            };

            let reject = err => {
                if (returned) {
                    return;
                }
                returned = true;
                callback(this._formatError(err, 'EAUTH', lastResponse, 'AUTH ' + this._authMethod));
            };

            let handlerResponse = handler({
                auth: this._auth,
                method: this._authMethod,

                extensions: [].concat(this._supportedExtensions),
                authMethods: [].concat(this._supportedAuth),
                maxAllowedSize: this._maxAllowedSize || false,

                sendCommand: (cmd, done) => {
                    let promise;

                    if (!done) {
                        promise = new Promise((resolve, reject) => {
                            done = shared.callbackPromise(resolve, reject);
                        });
                    }

                    this._responseActions.push(str => {
                        lastResponse = str;

                        let codes = str.match(/^(\d+)(?:\s(\d+\.\d+\.\d+))?\s/);
                        let data = {
                            command: cmd,
                            response: str
                        };
                        if (codes) {
                            data.status = Number(codes[1]) || 0;
                            if (codes[2]) {
                                data.code = codes[2];
                            }
                            data.text = str.substr(codes[0].length);
                        } else {
                            data.text = str;
                            data.status = 0; // just in case we need to perform numeric comparisons
                        }
                        done(null, data);
                    });
                    setImmediate(() => this._sendCommand(cmd));

                    return promise;
                },

                resolve,
                reject
            });

            if (handlerResponse && typeof handlerResponse.catch === 'function') {
                // a promise was returned
                handlerResponse.then(resolve).catch(reject);
            }

            return;
        }

        switch (this._authMethod) {
            case 'XOAUTH2':
                this._handleXOauth2Token(false, callback);
                return;
            case 'LOGIN':
                this._responseActions.push(str => {
                    this._actionAUTH_LOGIN_USER(str, callback);
                });
                this._sendCommand('AUTH LOGIN');
                return;
            case 'PLAIN':
                this._responseActions.push(str => {
                    this._actionAUTHComplete(str, callback);
                });
                this._sendCommand(
                    'AUTH PLAIN ' +
                        Buffer.from(
                            //this._auth.user+'\u0000'+
                            '\u0000' + // skip authorization identity as it causes problems with some servers
                                this._auth.credentials.user +
                                '\u0000' +
                                this._auth.credentials.pass,
                            'utf-8'
                        ).toString('base64'),
                    // log entry without passwords
                    'AUTH PLAIN ' +
                        Buffer.from(
                            //this._auth.user+'\u0000'+
                            '\u0000' + // skip authorization identity as it causes problems with some servers
                                this._auth.credentials.user +
                                '\u0000' +
                                '/* secret */',
                            'utf-8'
                        ).toString('base64')
                );
                return;
            case 'CRAM-MD5':
                this._responseActions.push(str => {
                    this._actionAUTH_CRAM_MD5(str, callback);
                });
                this._sendCommand('AUTH CRAM-MD5');
                return;
        }

        return callback(this._formatError('Unknown authentication method "' + this._authMethod + '"', 'EAUTH', false, 'API'));
    }

    /**
     * Sends a message
     *
     * @param {Object} envelope Envelope object, {from: addr, to: [addr]}
     * @param {Object} message String, Buffer or a Stream
     * @param {Function} callback Callback to return once sending is completed
     */
    send(envelope, message, done) {
        if (!message) {
            return done(this._formatError('Empty message', 'EMESSAGE', false, 'API'));
        }

        const isDestroyedMessage = this._isDestroyedMessage('send message');
        if (isDestroyedMessage) {
            return done(this._formatError(isDestroyedMessage, 'ECONNECTION', false, 'API'));
        }

        // reject larger messages than allowed
        if (this._maxAllowedSize && envelope.size > this._maxAllowedSize) {
            return setImmediate(() => {
                done(this._formatError('Message size larger than allowed ' + this._maxAllowedSize, 'EMESSAGE', false, 'MAIL FROM'));
            });
        }

        // ensure that callback is only called once
        let returned = false;
        let callback = function () {
            if (returned) {
                return;
            }
            returned = true;

            done(...arguments);
        };

        if (typeof message.on === 'function') {
            message.on('error', err => callback(this._formatError(err, 'ESTREAM', false, 'API')));
        }

        let startTime = Date.now();
        this._setEnvelope(envelope, (err, info) => {
            if (err) {
                // create passthrough stream to consume to prevent OOM
                let stream = new PassThrough();
                if (typeof message.pipe === 'function') {
                    message.pipe(stream);
                } else {
                    stream.write(message);
                    stream.end();
                }

                return callback(err);
            }
            let envelopeTime = Date.now();
            let stream = this._createSendStream((err, str) => {
                if (err) {
                    return callback(err);
                }

                info.envelopeTime = envelopeTime - startTime;
                info.messageTime = Date.now() - envelopeTime;
                info.messageSize = stream.outByteCount;
                info.response = str;

                return callback(null, info);
            });
            if (typeof message.pipe === 'function') {
                message.pipe(stream);
            } else {
                stream.write(message);
                stream.end();
            }
        });
    }

    /**
     * Resets connection state
     *
     * @param {Function} callback Callback to return once connection is reset
     */
    reset(callback) {
        this._sendCommand('RSET');
        this._responseActions.push(str => {
            if (str.charAt(0) !== '2') {
                return callback(this._formatError('Could not reset session state. response=' + str, 'EPROTOCOL', str, 'RSET'));
            }
            this._envelope = false;
            return callback(null, true);
        });
    }

    /**
     * Connection listener that is run when the connection to
     * the server is opened
     *
     * @event
     */
    _onConnect() {
        clearTimeout(this._connectionTimeout);

        this.logger.info(
            {
                tnx: 'network',
                localAddress: this._socket.localAddress,
                localPort: this._socket.localPort,
                remoteAddress: this._socket.remoteAddress,
                remotePort: this._socket.remotePort
            },
            '%s established to %s:%s',
            this.secure ? 'Secure connection' : 'Connection',
            this._socket.remoteAddress,
            this._socket.remotePort
        );

        if (this._destroyed) {
            // Connection was established after we already had canceled it
            this.close();
            return;
        }

        this.stage = 'connected';

        // clear existing listeners for the socket
        this._socket.removeListener('data', this._onSocketData);
        this._socket.removeListener('timeout', this._onSocketTimeout);
        this._socket.removeListener('close', this._onSocketClose);
        this._socket.removeListener('end', this._onSocketEnd);

        this._socket.on('data', this._onSocketData);
        this._socket.once('close', this._onSocketClose);
        this._socket.once('end', this._onSocketEnd);

        this._socket.setTimeout(this.options.socketTimeout || SOCKET_TIMEOUT);
        this._socket.on('timeout', this._onSocketTimeout);

        this._greetingTimeout = setTimeout(() => {
            // if still waiting for greeting, give up
            if (this._socket && !this._destroyed && this._responseActions[0] === this._actionGreeting) {
                this._onError('Greeting never received', 'ETIMEDOUT', false, 'CONN');
            }
        }, this.options.greetingTimeout || GREETING_TIMEOUT);

        this._responseActions.push(this._actionGreeting);

        // we have a 'data' listener set up so resume socket if it was paused
        this._socket.resume();
    }

    /**
     * 'data' listener for data coming from the server
     *
     * @event
     * @param {Buffer} chunk Data chunk coming from the server
     */
    _onData(chunk) {
        if (this._destroyed || !chunk || !chunk.length) {
            return;
        }

        let data = (chunk || '').toString('binary');
        let lines = (this._remainder + data).split(/\r?\n/);
        let lastline;

        this._remainder = lines.pop();

        for (let i = 0, len = lines.length; i < len; i++) {
            if (this._responseQueue.length) {
                lastline = this._responseQueue[this._responseQueue.length - 1];
                if (/^\d+-/.test(lastline.split('\n').pop())) {
                    this._responseQueue[this._responseQueue.length - 1] += '\n' + lines[i];
                    continue;
                }
            }
            this._responseQueue.push(lines[i]);
        }

        if (this._responseQueue.length) {
            lastline = this._responseQueue[this._responseQueue.length - 1];
            if (/^\d+-/.test(lastline.split('\n').pop())) {
                return;
            }
        }

        this._processResponse();
    }

    /**
     * 'error' listener for the socket
     *
     * @event
     * @param {Error} err Error object
     * @param {String} type Error name
     */
    _onError(err, type, data, command) {
        clearTimeout(this._connectionTimeout);
        clearTimeout(this._greetingTimeout);

        if (this._destroyed) {
            // just ignore, already closed
            // this might happen when a socket is canceled because of reached timeout
            // but the socket timeout error itself receives only after
            return;
        }

        err = this._formatError(err, type, data, command);

        this.logger.error(data, err.message);

        this.emit('error', err);
        this.close();
    }

    _formatError(message, type, response, command) {
        let err;

        if (/Error\]$/i.test(Object.prototype.toString.call(message))) {
            err = message;
        } else {
            err = new Error(message);
        }

        if (type && type !== 'Error') {
            err.code = type;
        }

        if (response) {
            err.response = response;
            err.message += ': ' + response;
        }

        let responseCode = (typeof response === 'string' && Number((response.match(/^\d+/) || [])[0])) || false;
        if (responseCode) {
            err.responseCode = responseCode;
        }

        if (command) {
            err.command = command;
        }

        return err;
    }

    /**
     * 'close' listener for the socket
     *
     * @event
     */
    _onClose() {
        let serverResponse = false;

        if (this._remainder && this._remainder.trim()) {
            if (this.options.debug || this.options.transactionLog) {
                this.logger.debug(
                    {
                        tnx: 'server'
                    },
                    this._remainder.replace(/\r?\n$/, '')
                );
            }
            this.lastServerResponse = serverResponse = this._remainder.trim();
        }

        this.logger.info(
            {
                tnx: 'network'
            },
            'Connection closed'
        );

        if (this.upgrading && !this._destroyed) {
            return this._onError(new Error('Connection closed unexpectedly'), 'ETLS', serverResponse, 'CONN');
        } else if (![this._actionGreeting, this.close].includes(this._responseActions[0]) && !this._destroyed) {
            return this._onError(new Error('Connection closed unexpectedly'), 'ECONNECTION', serverResponse, 'CONN');
        } else if (/^[45]\d{2}\b/.test(serverResponse)) {
            return this._onError(new Error('Connection closed unexpectedly'), 'ECONNECTION', serverResponse, 'CONN');
        }

        this._destroy();
    }

    /**
     * 'end' listener for the socket
     *
     * @event
     */
    _onEnd() {
        if (this._socket && !this._socket.destroyed) {
            this._socket.destroy();
        }
    }

    /**
     * 'timeout' listener for the socket
     *
     * @event
     */
    _onTimeout() {
        return this._onError(new Error('Timeout'), 'ETIMEDOUT', false, 'CONN');
    }

    /**
     * Destroys the client, emits 'end'
     */
    _destroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        this.emit('end');
    }

    /**
     * Upgrades the connection to TLS
     *
     * @param {Function} callback Callback function to run when the connection
     *        has been secured
     */
    _upgradeConnection(callback) {
        // do not remove all listeners or it breaks node v0.10 as there's
        // apparently a 'finish' event set that would be cleared as well

        // we can safely keep 'error', 'end', 'close' etc. events
        this._socket.removeListener('data', this._onSocketData); // incoming data is going to be gibberish from this point onwards
        this._socket.removeListener('timeout', this._onSocketTimeout); // timeout will be re-set for the new socket object

        let socketPlain = this._socket;
        let opts = {
            socket: this._socket,
            host: this.host
        };

        Object.keys(this.options.tls || {}).forEach(key => {
            opts[key] = this.options.tls[key];
        });

        // ensure servername for SNI
        if (this.servername && !opts.servername) {
            opts.servername = this.servername;
        }

        this.upgrading = true;
        // tls.connect is not an asynchronous function however it may still throw errors and requires to be wrapped with try/catch
        try {
            this._socket = tls.connect(opts, () => {
                this.secure = true;
                this.upgrading = false;
                this._socket.on('data', this._onSocketData);

                socketPlain.removeListener('close', this._onSocketClose);
                socketPlain.removeListener('end', this._onSocketEnd);

                return callback(null, true);
            });
        } catch (err) {
            return callback(err);
        }

        this._socket.on('error', this._onSocketError);
        this._socket.once('close', this._onSocketClose);
        this._socket.once('end', this._onSocketEnd);

        this._socket.setTimeout(this.options.socketTimeout || SOCKET_TIMEOUT); // 10 min.
        this._socket.on('timeout', this._onSocketTimeout);

        // resume in case the socket was paused
        socketPlain.resume();
    }

    /**
     * Processes queued responses from the server
     *
     * @param {Boolean} force If true, ignores _processing flag
     */
    _processResponse() {
        if (!this._responseQueue.length) {
            return false;
        }

        let str = (this.lastServerResponse = (this._responseQueue.shift() || '').toString());

        if (/^\d+-/.test(str.split('\n').pop())) {
            // keep waiting for the final part of multiline response
            return;
        }

        if (this.options.debug || this.options.transactionLog) {
            this.logger.debug(
                {
                    tnx: 'server'
                },
                str.replace(/\r?\n$/, '')
            );
        }

        if (!str.trim()) {
            // skip unexpected empty lines
            setImmediate(() => this._processResponse());
        }

        let action = this._responseActions.shift();

        if (typeof action === 'function') {
            action.call(this, str);
            setImmediate(() => this._processResponse());
        } else {
            return this._onError(new Error('Unexpected Response'), 'EPROTOCOL', str, 'CONN');
        }
    }

    /**
     * Send a command to the server, append \r\n
     *
     * @param {String} str String to be sent to the server
     * @param {String} logStr Optional string to be used for logging instead of the actual string
     */
    _sendCommand(str, logStr) {
        if (this._destroyed) {
            // Connection already closed, can't send any more data
            return;
        }

        if (this._socket.destroyed) {
            return this.close();
        }

        if (this.options.debug || this.options.transactionLog) {
            this.logger.debug(
                {
                    tnx: 'client'
                },
                (logStr || str || '').toString().replace(/\r?\n$/, '')
            );
        }

        this._socket.write(Buffer.from(str + '\r\n', 'utf-8'));
    }

    /**
     * Initiates a new message by submitting envelope data, starting with
     * MAIL FROM: command
     *
     * @param {Object} envelope Envelope object in the form of
     *        {from:'...', to:['...']}
     *        or
     *        {from:{address:'...',name:'...'}, to:[address:'...',name:'...']}
     */
    _setEnvelope(envelope, callback) {
        let args = [];
        let useSmtpUtf8 = false;

        this._envelope = envelope || {};
        this._envelope.from = ((this._envelope.from && this._envelope.from.address) || this._envelope.from || '').toString().trim();

        this._envelope.to = [].concat(this._envelope.to || []).map(to => ((to && to.address) || to || '').toString().trim());

        if (!this._envelope.to.length) {
            return callback(this._formatError('No recipients defined', 'EENVELOPE', false, 'API'));
        }

        if (this._envelope.from && /[\r\n<>]/.test(this._envelope.from)) {
            return callback(this._formatError('Invalid sender ' + JSON.stringify(this._envelope.from), 'EENVELOPE', false, 'API'));
        }

        // check if the sender address uses only ASCII characters,
        // otherwise require usage of SMTPUTF8 extension
        if (/[\x80-\uFFFF]/.test(this._envelope.from)) {
            useSmtpUtf8 = true;
        }

        for (let i = 0, len = this._envelope.to.length; i < len; i++) {
            if (!this._envelope.to[i] || /[\r\n<>]/.test(this._envelope.to[i])) {
                return callback(this._formatError('Invalid recipient ' + JSON.stringify(this._envelope.to[i]), 'EENVELOPE', false, 'API'));
            }

            // check if the recipients addresses use only ASCII characters,
            // otherwise require usage of SMTPUTF8 extension
            if (/[\x80-\uFFFF]/.test(this._envelope.to[i])) {
                useSmtpUtf8 = true;
            }
        }

        // clone the recipients array for latter manipulation
        this._envelope.rcptQueue = JSON.parse(JSON.stringify(this._envelope.to || []));
        this._envelope.rejected = [];
        this._envelope.rejectedErrors = [];
        this._envelope.accepted = [];

        if (this._envelope.dsn) {
            try {
                this._envelope.dsn = this._setDsnEnvelope(this._envelope.dsn);
            } catch (err) {
                return callback(this._formatError('Invalid DSN ' + err.message, 'EENVELOPE', false, 'API'));
            }
        }

        this._responseActions.push(str => {
            this._actionMAIL(str, callback);
        });

        // If the server supports SMTPUTF8 and the envelope includes an internationalized
        // email address then append SMTPUTF8 keyword to the MAIL FROM command
        if (useSmtpUtf8 && this._supportedExtensions.includes('SMTPUTF8')) {
            args.push('SMTPUTF8');
            this._usingSmtpUtf8 = true;
        }

        // If the server supports 8BITMIME and the message might contain non-ascii bytes
        // then append the 8BITMIME keyword to the MAIL FROM command
        if (this._envelope.use8BitMime && this._supportedExtensions.includes('8BITMIME')) {
            args.push('BODY=8BITMIME');
            this._using8BitMime = true;
        }

        if (this._envelope.size && this._supportedExtensions.includes('SIZE')) {
            args.push('SIZE=' + this._envelope.size);
        }

        // If the server supports DSN and the envelope includes an DSN prop
        // then append DSN params to the MAIL FROM command
        if (this._envelope.dsn && this._supportedExtensions.includes('DSN')) {
            if (this._envelope.dsn.ret) {
                args.push('RET=' + shared.encodeXText(this._envelope.dsn.ret));
            }
            if (this._envelope.dsn.envid) {
                args.push('ENVID=' + shared.encodeXText(this._envelope.dsn.envid));
            }
        }

        this._sendCommand('MAIL FROM:<' + this._envelope.from + '>' + (args.length ? ' ' + args.join(' ') : ''));
    }

    _setDsnEnvelope(params) {
        let ret = (params.ret || params.return || '').toString().toUpperCase() || null;
        if (ret) {
            switch (ret) {
                case 'HDRS':
                case 'HEADERS':
                    ret = 'HDRS';
                    break;
                case 'FULL':
                case 'BODY':
                    ret = 'FULL';
                    break;
            }
        }

        if (ret && !['FULL', 'HDRS'].includes(ret)) {
            throw new Error('ret: ' + JSON.stringify(ret));
        }

        let envid = (params.envid || params.id || '').toString() || null;

        let notify = params.notify || null;
        if (notify) {
            if (typeof notify === 'string') {
                notify = notify.split(',');
            }
            notify = notify.map(n => n.trim().toUpperCase());
            let validNotify = ['NEVER', 'SUCCESS', 'FAILURE', 'DELAY'];
            let invaliNotify = notify.filter(n => !validNotify.includes(n));
            if (invaliNotify.length || (notify.length > 1 && notify.includes('NEVER'))) {
                throw new Error('notify: ' + JSON.stringify(notify.join(',')));
            }
            notify = notify.join(',');
        }

        let orcpt = (params.recipient || params.orcpt || '').toString() || null;
        if (orcpt && orcpt.indexOf(';') < 0) {
            orcpt = 'rfc822;' + orcpt;
        }

        return {
            ret,
            envid,
            notify,
            orcpt
        };
    }

    _getDsnRcptToArgs() {
        let args = [];
        // If the server supports DSN and the envelope includes an DSN prop
        // then append DSN params to the RCPT TO command
        if (this._envelope.dsn && this._supportedExtensions.includes('DSN')) {
            if (this._envelope.dsn.notify) {
                args.push('NOTIFY=' + shared.encodeXText(this._envelope.dsn.notify));
            }
            if (this._envelope.dsn.orcpt) {
                args.push('ORCPT=' + shared.encodeXText(this._envelope.dsn.orcpt));
            }
        }
        return args.length ? ' ' + args.join(' ') : '';
    }

    _createSendStream(callback) {
        let dataStream = new DataStream();
        let logStream;

        if (this.options.lmtp) {
            this._envelope.accepted.forEach((recipient, i) => {
                let final = i === this._envelope.accepted.length - 1;
                this._responseActions.push(str => {
                    this._actionLMTPStream(recipient, final, str, callback);
                });
            });
        } else {
            this._responseActions.push(str => {
                this._actionSMTPStream(str, callback);
            });
        }

        dataStream.pipe(this._socket, {
            end: false
        });

        if (this.options.debug) {
            logStream = new PassThrough();
            logStream.on('readable', () => {
                let chunk;
                while ((chunk = logStream.read())) {
                    this.logger.debug(
                        {
                            tnx: 'message'
                        },
                        chunk.toString('binary').replace(/\r?\n$/, '')
                    );
                }
            });
            dataStream.pipe(logStream);
        }

        dataStream.once('end', () => {
            this.logger.info(
                {
                    tnx: 'message',
                    inByteCount: dataStream.inByteCount,
                    outByteCount: dataStream.outByteCount
                },
                '<%s bytes encoded mime message (source size %s bytes)>',
                dataStream.outByteCount,
                dataStream.inByteCount
            );
        });

        return dataStream;
    }

    /** ACTIONS **/

    /**
     * Will be run after the connection is created and the server sends
     * a greeting. If the incoming message starts with 220 initiate
     * SMTP session by sending EHLO command
     *
     * @param {String} str Message from the server
     */
    _actionGreeting(str) {
        clearTimeout(this._greetingTimeout);

        if (str.substr(0, 3) !== '220') {
            this._onError(new Error('Invalid greeting. response=' + str), 'EPROTOCOL', str, 'CONN');
            return;
        }

        if (this.options.lmtp) {
            this._responseActions.push(this._actionLHLO);
            this._sendCommand('LHLO ' + this.name);
        } else {
            this._responseActions.push(this._actionEHLO);
            this._sendCommand('EHLO ' + this.name);
        }
    }

    /**
     * Handles server response for LHLO command. If it yielded in
     * error, emit 'error', otherwise treat this as an EHLO response
     *
     * @param {String} str Message from the server
     */
    _actionLHLO(str) {
        if (str.charAt(0) !== '2') {
            this._onError(new Error('Invalid LHLO. response=' + str), 'EPROTOCOL', str, 'LHLO');
            return;
        }

        this._actionEHLO(str);
    }

    /**
     * Handles server response for EHLO command. If it yielded in
     * error, try HELO instead, otherwise initiate TLS negotiation
     * if STARTTLS is supported by the server or move into the
     * authentication phase.
     *
     * @param {String} str Message from the server
     */
    _actionEHLO(str) {
        let match;

        if (str.substr(0, 3) === '421') {
            this._onError(new Error('Server terminates connection. response=' + str), 'ECONNECTION', str, 'EHLO');
            return;
        }

        if (str.charAt(0) !== '2') {
            if (this.options.requireTLS) {
                this._onError(new Error('EHLO failed but HELO does not support required STARTTLS. response=' + str), 'ECONNECTION', str, 'EHLO');
                return;
            }

            // Try HELO instead
            this._responseActions.push(this._actionHELO);
            this._sendCommand('HELO ' + this.name);
            return;
        }

        this._ehloLines = str
            .split(/\r?\n/)
            .map(line => line.replace(/^\d+[ -]/, '').trim())
            .filter(line => line)
            .slice(1);

        // Detect if the server supports STARTTLS
        if (!this.secure && !this.options.ignoreTLS && (/[ -]STARTTLS\b/im.test(str) || this.options.requireTLS)) {
            this._sendCommand('STARTTLS');
            this._responseActions.push(this._actionSTARTTLS);
            return;
        }

        // Detect if the server supports SMTPUTF8
        if (/[ -]SMTPUTF8\b/im.test(str)) {
            this._supportedExtensions.push('SMTPUTF8');
        }

        // Detect if the server supports DSN
        if (/[ -]DSN\b/im.test(str)) {
            this._supportedExtensions.push('DSN');
        }

        // Detect if the server supports 8BITMIME
        if (/[ -]8BITMIME\b/im.test(str)) {
            this._supportedExtensions.push('8BITMIME');
        }

        // Detect if the server supports PIPELINING
        if (/[ -]PIPELINING\b/im.test(str)) {
            this._supportedExtensions.push('PIPELINING');
        }

        // Detect if the server supports AUTH
        if (/[ -]AUTH\b/i.test(str)) {
            this.allowsAuth = true;
        }

        // Detect if the server supports PLAIN auth
        if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)PLAIN/i.test(str)) {
            this._supportedAuth.push('PLAIN');
        }

        // Detect if the server supports LOGIN auth
        if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)LOGIN/i.test(str)) {
            this._supportedAuth.push('LOGIN');
        }

        // Detect if the server supports CRAM-MD5 auth
        if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)CRAM-MD5/i.test(str)) {
            this._supportedAuth.push('CRAM-MD5');
        }

        // Detect if the server supports XOAUTH2 auth
        if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)XOAUTH2/i.test(str)) {
            this._supportedAuth.push('XOAUTH2');
        }

        // Detect if the server supports SIZE extensions (and the max allowed size)
        if ((match = str.match(/[ -]SIZE(?:[ \t]+(\d+))?/im))) {
            this._supportedExtensions.push('SIZE');
            this._maxAllowedSize = Number(match[1]) || 0;
        }

        this.emit('connect');
    }

    /**
     * Handles server response for HELO command. If it yielded in
     * error, emit 'error', otherwise move into the authentication phase.
     *
     * @param {String} str Message from the server
     */
    _actionHELO(str) {
        if (str.charAt(0) !== '2') {
            this._onError(new Error('Invalid HELO. response=' + str), 'EPROTOCOL', str, 'HELO');
            return;
        }

        // assume that authentication is enabled (most probably is not though)
        this.allowsAuth = true;

        this.emit('connect');
    }

    /**
     * Handles server response for STARTTLS command. If there's an error
     * try HELO instead, otherwise initiate TLS upgrade. If the upgrade
     * succeedes restart the EHLO
     *
     * @param {String} str Message from the server
     */
    _actionSTARTTLS(str) {
        if (str.charAt(0) !== '2') {
            if (this.options.opportunisticTLS) {
                this.logger.info(
                    {
                        tnx: 'smtp'
                    },
                    'Failed STARTTLS upgrade, continuing unencrypted'
                );
                return this.emit('connect');
            }
            this._onError(new Error('Error upgrading connection with STARTTLS'), 'ETLS', str, 'STARTTLS');
            return;
        }

        this._upgradeConnection((err, secured) => {
            if (err) {
                this._onError(new Error('Error initiating TLS - ' + (err.message || err)), 'ETLS', false, 'STARTTLS');
                return;
            }

            this.logger.info(
                {
                    tnx: 'smtp'
                },
                'Connection upgraded with STARTTLS'
            );

            if (secured) {
                // restart session
                if (this.options.lmtp) {
                    this._responseActions.push(this._actionLHLO);
                    this._sendCommand('LHLO ' + this.name);
                } else {
                    this._responseActions.push(this._actionEHLO);
                    this._sendCommand('EHLO ' + this.name);
                }
            } else {
                this.emit('connect');
            }
        });
    }

    /**
     * Handle the response for AUTH LOGIN command. We are expecting
     * '334 VXNlcm5hbWU6' (base64 for 'Username:'). Data to be sent as
     * response needs to be base64 encoded username. We do not need
     * exact match but settle with 334 response in general as some
     * hosts invalidly use a longer message than VXNlcm5hbWU6
     *
     * @param {String} str Message from the server
     */
    _actionAUTH_LOGIN_USER(str, callback) {
        if (!/^334[ -]/.test(str)) {
            // expecting '334 VXNlcm5hbWU6'
            callback(this._formatError('Invalid login sequence while waiting for "334 VXNlcm5hbWU6"', 'EAUTH', str, 'AUTH LOGIN'));
            return;
        }

        this._responseActions.push(str => {
            this._actionAUTH_LOGIN_PASS(str, callback);
        });

        this._sendCommand(Buffer.from(this._auth.credentials.user + '', 'utf-8').toString('base64'));
    }

    /**
     * Handle the response for AUTH CRAM-MD5 command. We are expecting
     * '334 <challenge string>'. Data to be sent as response needs to be
     * base64 decoded challenge string, MD5 hashed using the password as
     * a HMAC key, prefixed by the username and a space, and finally all
     * base64 encoded again.
     *
     * @param {String} str Message from the server
     */
    _actionAUTH_CRAM_MD5(str, callback) {
        let challengeMatch = str.match(/^334\s+(.+)$/);
        let challengeString = '';

        if (!challengeMatch) {
            return callback(this._formatError('Invalid login sequence while waiting for server challenge string', 'EAUTH', str, 'AUTH CRAM-MD5'));
        } else {
            challengeString = challengeMatch[1];
        }

        // Decode from base64
        let base64decoded = Buffer.from(challengeString, 'base64').toString('ascii'),
            hmacMD5 = crypto.createHmac('md5', this._auth.credentials.pass);

        hmacMD5.update(base64decoded);

        let prepended = this._auth.credentials.user + ' ' + hmacMD5.digest('hex');

        this._responseActions.push(str => {
            this._actionAUTH_CRAM_MD5_PASS(str, callback);
        });

        this._sendCommand(
            Buffer.from(prepended).toString('base64'),
            // hidden hash for logs
            Buffer.from(this._auth.credentials.user + ' /* secret */').toString('base64')
        );
    }

    /**
     * Handles the response to CRAM-MD5 authentication, if there's no error,
     * the user can be considered logged in. Start waiting for a message to send
     *
     * @param {String} str Message from the server
     */
    _actionAUTH_CRAM_MD5_PASS(str, callback) {
        if (!str.match(/^235\s+/)) {
            return callback(this._formatError('Invalid login sequence while waiting for "235"', 'EAUTH', str, 'AUTH CRAM-MD5'));
        }

        this.logger.info(
            {
                tnx: 'smtp',
                username: this._auth.user,
                action: 'authenticated',
                method: this._authMethod
            },
            'User %s authenticated',
            JSON.stringify(this._auth.user)
        );
        this.authenticated = true;
        callback(null, true);
    }

    /**
     * Handle the response for AUTH LOGIN command. We are expecting
     * '334 UGFzc3dvcmQ6' (base64 for 'Password:'). Data to be sent as
     * response needs to be base64 encoded password.
     *
     * @param {String} str Message from the server
     */
    _actionAUTH_LOGIN_PASS(str, callback) {
        if (!/^334[ -]/.test(str)) {
            // expecting '334 UGFzc3dvcmQ6'
            return callback(this._formatError('Invalid login sequence while waiting for "334 UGFzc3dvcmQ6"', 'EAUTH', str, 'AUTH LOGIN'));
        }

        this._responseActions.push(str => {
            this._actionAUTHComplete(str, callback);
        });

        this._sendCommand(
            Buffer.from((this._auth.credentials.pass || '').toString(), 'utf-8').toString('base64'),
            // Hidden pass for logs
            Buffer.from('/* secret */', 'utf-8').toString('base64')
        );
    }

    /**
     * Handles the response for authentication, if there's no error,
     * the user can be considered logged in. Start waiting for a message to send
     *
     * @param {String} str Message from the server
     */
    _actionAUTHComplete(str, isRetry, callback) {
        if (!callback && typeof isRetry === 'function') {
            callback = isRetry;
            isRetry = false;
        }

        if (str.substr(0, 3) === '334') {
            this._responseActions.push(str => {
                if (isRetry || this._authMethod !== 'XOAUTH2') {
                    this._actionAUTHComplete(str, true, callback);
                } else {
                    // fetch a new OAuth2 access token
                    setImmediate(() => this._handleXOauth2Token(true, callback));
                }
            });
            this._sendCommand('');
            return;
        }

        if (str.charAt(0) !== '2') {
            this.logger.info(
                {
                    tnx: 'smtp',
                    username: this._auth.user,
                    action: 'authfail',
                    method: this._authMethod
                },
                'User %s failed to authenticate',
                JSON.stringify(this._auth.user)
            );
            return callback(this._formatError('Invalid login', 'EAUTH', str, 'AUTH ' + this._authMethod));
        }

        this.logger.info(
            {
                tnx: 'smtp',
                username: this._auth.user,
                action: 'authenticated',
                method: this._authMethod
            },
            'User %s authenticated',
            JSON.stringify(this._auth.user)
        );
        this.authenticated = true;
        callback(null, true);
    }

    /**
     * Handle response for a MAIL FROM: command
     *
     * @param {String} str Message from the server
     */
    _actionMAIL(str, callback) {
        let message, curRecipient;
        if (Number(str.charAt(0)) !== 2) {
            if (this._usingSmtpUtf8 && /^550 /.test(str) && /[\x80-\uFFFF]/.test(this._envelope.from)) {
                message = 'Internationalized mailbox name not allowed';
            } else {
                message = 'Mail command failed';
            }
            return callback(this._formatError(message, 'EENVELOPE', str, 'MAIL FROM'));
        }

        if (!this._envelope.rcptQueue.length) {
            return callback(this._formatError('Can\x27t send mail - no recipients defined', 'EENVELOPE', false, 'API'));
        } else {
            this._recipientQueue = [];

            if (this._supportedExtensions.includes('PIPELINING')) {
                while (this._envelope.rcptQueue.length) {
                    curRecipient = this._envelope.rcptQueue.shift();
                    this._recipientQueue.push(curRecipient);
                    this._responseActions.push(str => {
                        this._actionRCPT(str, callback);
                    });
                    this._sendCommand('RCPT TO:<' + curRecipient + '>' + this._getDsnRcptToArgs());
                }
            } else {
                curRecipient = this._envelope.rcptQueue.shift();
                this._recipientQueue.push(curRecipient);
                this._responseActions.push(str => {
                    this._actionRCPT(str, callback);
                });
                this._sendCommand('RCPT TO:<' + curRecipient + '>' + this._getDsnRcptToArgs());
            }
        }
    }

    /**
     * Handle response for a RCPT TO: command
     *
     * @param {String} str Message from the server
     */
    _actionRCPT(str, callback) {
        let message,
            err,
            curRecipient = this._recipientQueue.shift();
        if (Number(str.charAt(0)) !== 2) {
            // this is a soft error
            if (this._usingSmtpUtf8 && /^553 /.test(str) && /[\x80-\uFFFF]/.test(curRecipient)) {
                message = 'Internationalized mailbox name not allowed';
            } else {
                message = 'Recipient command failed';
            }
            this._envelope.rejected.push(curRecipient);
            // store error for the failed recipient
            err = this._formatError(message, 'EENVELOPE', str, 'RCPT TO');
            err.recipient = curRecipient;
            this._envelope.rejectedErrors.push(err);
        } else {
            this._envelope.accepted.push(curRecipient);
        }

        if (!this._envelope.rcptQueue.length && !this._recipientQueue.length) {
            if (this._envelope.rejected.length < this._envelope.to.length) {
                this._responseActions.push(str => {
                    this._actionDATA(str, callback);
                });
                this._sendCommand('DATA');
            } else {
                err = this._formatError('Can\x27t send mail - all recipients were rejected', 'EENVELOPE', str, 'RCPT TO');
                err.rejected = this._envelope.rejected;
                err.rejectedErrors = this._envelope.rejectedErrors;
                return callback(err);
            }
        } else if (this._envelope.rcptQueue.length) {
            curRecipient = this._envelope.rcptQueue.shift();
            this._recipientQueue.push(curRecipient);
            this._responseActions.push(str => {
                this._actionRCPT(str, callback);
            });
            this._sendCommand('RCPT TO:<' + curRecipient + '>' + this._getDsnRcptToArgs());
        }
    }

    /**
     * Handle response for a DATA command
     *
     * @param {String} str Message from the server
     */
    _actionDATA(str, callback) {
        // response should be 354 but according to this issue https://github.com/eleith/emailjs/issues/24
        // some servers might use 250 instead, so lets check for 2 or 3 as the first digit
        if (!/^[23]/.test(str)) {
            return callback(this._formatError('Data command failed', 'EENVELOPE', str, 'DATA'));
        }

        let response = {
            accepted: this._envelope.accepted,
            rejected: this._envelope.rejected
        };

        if (this._ehloLines && this._ehloLines.length) {
            response.ehlo = this._ehloLines;
        }

        if (this._envelope.rejectedErrors.length) {
            response.rejectedErrors = this._envelope.rejectedErrors;
        }

        callback(null, response);
    }

    /**
     * Handle response for a DATA stream when using SMTP
     * We expect a single response that defines if the sending succeeded or failed
     *
     * @param {String} str Message from the server
     */
    _actionSMTPStream(str, callback) {
        if (Number(str.charAt(0)) !== 2) {
            // Message failed
            return callback(this._formatError('Message failed', 'EMESSAGE', str, 'DATA'));
        } else {
            // Message sent succesfully
            return callback(null, str);
        }
    }

    /**
     * Handle response for a DATA stream
     * We expect a separate response for every recipient. All recipients can either
     * succeed or fail separately
     *
     * @param {String} recipient The recipient this response applies to
     * @param {Boolean} final Is this the final recipient?
     * @param {String} str Message from the server
     */
    _actionLMTPStream(recipient, final, str, callback) {
        let err;
        if (Number(str.charAt(0)) !== 2) {
            // Message failed
            err = this._formatError('Message failed for recipient ' + recipient, 'EMESSAGE', str, 'DATA');
            err.recipient = recipient;
            this._envelope.rejected.push(recipient);
            this._envelope.rejectedErrors.push(err);
            for (let i = 0, len = this._envelope.accepted.length; i < len; i++) {
                if (this._envelope.accepted[i] === recipient) {
                    this._envelope.accepted.splice(i, 1);
                }
            }
        }
        if (final) {
            return callback(null, str);
        }
    }

    _handleXOauth2Token(isRetry, callback) {
        this._auth.oauth2.getToken(isRetry, (err, accessToken) => {
            if (err) {
                this.logger.info(
                    {
                        tnx: 'smtp',
                        username: this._auth.user,
                        action: 'authfail',
                        method: this._authMethod
                    },
                    'User %s failed to authenticate',
                    JSON.stringify(this._auth.user)
                );
                return callback(this._formatError(err, 'EAUTH', false, 'AUTH XOAUTH2'));
            }
            this._responseActions.push(str => {
                this._actionAUTHComplete(str, isRetry, callback);
            });
            this._sendCommand(
                'AUTH XOAUTH2 ' + this._auth.oauth2.buildXOAuth2Token(accessToken),
                //  Hidden for logs
                'AUTH XOAUTH2 ' + this._auth.oauth2.buildXOAuth2Token('/* secret */')
            );
        });
    }

    /**
     *
     * @param {string} command
     * @private
     */
    _isDestroyedMessage(command) {
        if (this._destroyed) {
            return 'Cannot ' + command + ' - smtp connection is already destroyed.';
        }

        if (this._socket) {
            if (this._socket.destroyed) {
                return 'Cannot ' + command + ' - smtp connection socket is already destroyed.';
            }

            if (!this._socket.writable) {
                return 'Cannot ' + command + ' - smtp connection socket is already half-closed.';
            }
        }
    }

    _getHostname() {
        // defaul hostname is machine hostname or [IP]
        let defaultHostname;
        try {
            defaultHostname = os.hostname() || '';
        } catch (err) {
            // fails on windows 7
            defaultHostname = 'localhost';
        }

        // ignore if not FQDN
        if (!defaultHostname || defaultHostname.indexOf('.') < 0) {
            defaultHostname = '[127.0.0.1]';
        }

        // IP should be enclosed in []
        if (defaultHostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
            defaultHostname = '[' + defaultHostname + ']';
        }

        return defaultHostname;
    }
}

module.exports = SMTPConnection;


/***/ }),

/***/ 560:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const EventEmitter = __nccwpck_require__(2361);
const PoolResource = __nccwpck_require__(2230);
const SMTPConnection = __nccwpck_require__(3559);
const wellKnown = __nccwpck_require__(6961);
const shared = __nccwpck_require__(2673);
const packageData = __nccwpck_require__(4129);

/**
 * Creates a SMTP pool transport object for Nodemailer
 *
 * @constructor
 * @param {Object} options SMTP Connection options
 */
class SMTPPool extends EventEmitter {
    constructor(options) {
        super();

        options = options || {};
        if (typeof options === 'string') {
            options = {
                url: options
            };
        }

        let urlData;
        let service = options.service;

        if (typeof options.getSocket === 'function') {
            this.getSocket = options.getSocket;
        }

        if (options.url) {
            urlData = shared.parseConnectionUrl(options.url);
            service = service || urlData.service;
        }

        this.options = shared.assign(
            false, // create new object
            options, // regular options
            urlData, // url options
            service && wellKnown(service) // wellknown options
        );

        this.options.maxConnections = this.options.maxConnections || 5;
        this.options.maxMessages = this.options.maxMessages || 100;

        this.logger = shared.getLogger(this.options, {
            component: this.options.component || 'smtp-pool'
        });

        // temporary object
        let connection = new SMTPConnection(this.options);

        this.name = 'SMTP (pool)';
        this.version = packageData.version + '[client:' + connection.version + ']';

        this._rateLimit = {
            counter: 0,
            timeout: null,
            waiting: [],
            checkpoint: false,
            delta: Number(this.options.rateDelta) || 1000,
            limit: Number(this.options.rateLimit) || 0
        };
        this._closed = false;
        this._queue = [];
        this._connections = [];
        this._connectionCounter = 0;

        this.idling = true;

        setImmediate(() => {
            if (this.idling) {
                this.emit('idle');
            }
        });
    }

    /**
     * Placeholder function for creating proxy sockets. This method immediatelly returns
     * without a socket
     *
     * @param {Object} options Connection options
     * @param {Function} callback Callback function to run with the socket keys
     */
    getSocket(options, callback) {
        // return immediatelly
        return setImmediate(() => callback(null, false));
    }

    /**
     * Queues an e-mail to be sent using the selected settings
     *
     * @param {Object} mail Mail object
     * @param {Function} callback Callback function
     */
    send(mail, callback) {
        if (this._closed) {
            return false;
        }

        this._queue.push({
            mail,
            requeueAttempts: 0,
            callback
        });

        if (this.idling && this._queue.length >= this.options.maxConnections) {
            this.idling = false;
        }

        setImmediate(() => this._processMessages());

        return true;
    }

    /**
     * Closes all connections in the pool. If there is a message being sent, the connection
     * is closed later
     */
    close() {
        let connection;
        let len = this._connections.length;
        this._closed = true;

        // clear rate limit timer if it exists
        clearTimeout(this._rateLimit.timeout);

        if (!len && !this._queue.length) {
            return;
        }

        // remove all available connections
        for (let i = len - 1; i >= 0; i--) {
            if (this._connections[i] && this._connections[i].available) {
                connection = this._connections[i];
                connection.close();
                this.logger.info(
                    {
                        tnx: 'connection',
                        cid: connection.id,
                        action: 'removed'
                    },
                    'Connection #%s removed',
                    connection.id
                );
            }
        }

        if (len && !this._connections.length) {
            this.logger.debug(
                {
                    tnx: 'connection'
                },
                'All connections removed'
            );
        }

        if (!this._queue.length) {
            return;
        }

        // make sure that entire queue would be cleaned
        let invokeCallbacks = () => {
            if (!this._queue.length) {
                this.logger.debug(
                    {
                        tnx: 'connection'
                    },
                    'Pending queue entries cleared'
                );
                return;
            }
            let entry = this._queue.shift();
            if (entry && typeof entry.callback === 'function') {
                try {
                    entry.callback(new Error('Connection pool was closed'));
                } catch (E) {
                    this.logger.error(
                        {
                            err: E,
                            tnx: 'callback',
                            cid: connection.id
                        },
                        'Callback error for #%s: %s',
                        connection.id,
                        E.message
                    );
                }
            }
            setImmediate(invokeCallbacks);
        };
        setImmediate(invokeCallbacks);
    }

    /**
     * Check the queue and available connections. If there is a message to be sent and there is
     * an available connection, then use this connection to send the mail
     */
    _processMessages() {
        let connection;
        let i, len;

        // do nothing if already closed
        if (this._closed) {
            return;
        }

        // do nothing if queue is empty
        if (!this._queue.length) {
            if (!this.idling) {
                // no pending jobs
                this.idling = true;
                this.emit('idle');
            }
            return;
        }

        // find first available connection
        for (i = 0, len = this._connections.length; i < len; i++) {
            if (this._connections[i].available) {
                connection = this._connections[i];
                break;
            }
        }

        if (!connection && this._connections.length < this.options.maxConnections) {
            connection = this._createConnection();
        }

        if (!connection) {
            // no more free connection slots available
            this.idling = false;
            return;
        }

        // check if there is free space in the processing queue
        if (!this.idling && this._queue.length < this.options.maxConnections) {
            this.idling = true;
            this.emit('idle');
        }

        let entry = (connection.queueEntry = this._queue.shift());
        entry.messageId = (connection.queueEntry.mail.message.getHeader('message-id') || '').replace(/[<>\s]/g, '');

        connection.available = false;

        this.logger.debug(
            {
                tnx: 'pool',
                cid: connection.id,
                messageId: entry.messageId,
                action: 'assign'
            },
            'Assigned message <%s> to #%s (%s)',
            entry.messageId,
            connection.id,
            connection.messages + 1
        );

        if (this._rateLimit.limit) {
            this._rateLimit.counter++;
            if (!this._rateLimit.checkpoint) {
                this._rateLimit.checkpoint = Date.now();
            }
        }

        connection.send(entry.mail, (err, info) => {
            // only process callback if current handler is not changed
            if (entry === connection.queueEntry) {
                try {
                    entry.callback(err, info);
                } catch (E) {
                    this.logger.error(
                        {
                            err: E,
                            tnx: 'callback',
                            cid: connection.id
                        },
                        'Callback error for #%s: %s',
                        connection.id,
                        E.message
                    );
                }
                connection.queueEntry = false;
            }
        });
    }

    /**
     * Creates a new pool resource
     */
    _createConnection() {
        let connection = new PoolResource(this);

        connection.id = ++this._connectionCounter;

        this.logger.info(
            {
                tnx: 'pool',
                cid: connection.id,
                action: 'conection'
            },
            'Created new pool resource #%s',
            connection.id
        );

        // resource comes available
        connection.on('available', () => {
            this.logger.debug(
                {
                    tnx: 'connection',
                    cid: connection.id,
                    action: 'available'
                },
                'Connection #%s became available',
                connection.id
            );

            if (this._closed) {
                // if already closed run close() that will remove this connections from connections list
                this.close();
            } else {
                // check if there's anything else to send
                this._processMessages();
            }
        });

        // resource is terminated with an error
        connection.once('error', err => {
            if (err.code !== 'EMAXLIMIT') {
                this.logger.error(
                    {
                        err,
                        tnx: 'pool',
                        cid: connection.id
                    },
                    'Pool Error for #%s: %s',
                    connection.id,
                    err.message
                );
            } else {
                this.logger.debug(
                    {
                        tnx: 'pool',
                        cid: connection.id,
                        action: 'maxlimit'
                    },
                    'Max messages limit exchausted for #%s',
                    connection.id
                );
            }

            if (connection.queueEntry) {
                try {
                    connection.queueEntry.callback(err);
                } catch (E) {
                    this.logger.error(
                        {
                            err: E,
                            tnx: 'callback',
                            cid: connection.id
                        },
                        'Callback error for #%s: %s',
                        connection.id,
                        E.message
                    );
                }
                connection.queueEntry = false;
            }

            // remove the erroneus connection from connections list
            this._removeConnection(connection);

            this._continueProcessing();
        });

        connection.once('close', () => {
            this.logger.info(
                {
                    tnx: 'connection',
                    cid: connection.id,
                    action: 'closed'
                },
                'Connection #%s was closed',
                connection.id
            );

            this._removeConnection(connection);

            if (connection.queueEntry) {
                // If the connection closed when sending, add the message to the queue again
                // if max number of requeues is not reached yet
                // Note that we must wait a bit.. because the callback of the 'error' handler might be called
                // in the next event loop
                setTimeout(() => {
                    if (connection.queueEntry) {
                        if (this._shouldRequeuOnConnectionClose(connection.queueEntry)) {
                            this._requeueEntryOnConnectionClose(connection);
                        } else {
                            this._failDeliveryOnConnectionClose(connection);
                        }
                    }
                    this._continueProcessing();
                }, 50);
            } else {
                this._continueProcessing();
            }
        });

        this._connections.push(connection);

        return connection;
    }

    _shouldRequeuOnConnectionClose(queueEntry) {
        if (this.options.maxRequeues === undefined || this.options.maxRequeues < 0) {
            return true;
        }

        return queueEntry.requeueAttempts < this.options.maxRequeues;
    }

    _failDeliveryOnConnectionClose(connection) {
        if (connection.queueEntry && connection.queueEntry.callback) {
            try {
                connection.queueEntry.callback(new Error('Reached maximum number of retries after connection was closed'));
            } catch (E) {
                this.logger.error(
                    {
                        err: E,
                        tnx: 'callback',
                        messageId: connection.queueEntry.messageId,
                        cid: connection.id
                    },
                    'Callback error for #%s: %s',
                    connection.id,
                    E.message
                );
            }
            connection.queueEntry = false;
        }
    }

    _requeueEntryOnConnectionClose(connection) {
        connection.queueEntry.requeueAttempts = connection.queueEntry.requeueAttempts + 1;
        this.logger.debug(
            {
                tnx: 'pool',
                cid: connection.id,
                messageId: connection.queueEntry.messageId,
                action: 'requeue'
            },
            'Re-queued message <%s> for #%s. Attempt: #%s',
            connection.queueEntry.messageId,
            connection.id,
            connection.queueEntry.requeueAttempts
        );
        this._queue.unshift(connection.queueEntry);
        connection.queueEntry = false;
    }

    /**
     * Continue to process message if the pool hasn't closed
     */
    _continueProcessing() {
        if (this._closed) {
            this.close();
        } else {
            setTimeout(() => this._processMessages(), 100);
        }
    }

    /**
     * Remove resource from pool
     *
     * @param {Object} connection The PoolResource to remove
     */
    _removeConnection(connection) {
        let index = this._connections.indexOf(connection);

        if (index !== -1) {
            this._connections.splice(index, 1);
        }
    }

    /**
     * Checks if connections have hit current rate limit and if so, queues the availability callback
     *
     * @param {Function} callback Callback function to run once rate limiter has been cleared
     */
    _checkRateLimit(callback) {
        if (!this._rateLimit.limit) {
            return callback();
        }

        let now = Date.now();

        if (this._rateLimit.counter < this._rateLimit.limit) {
            return callback();
        }

        this._rateLimit.waiting.push(callback);

        if (this._rateLimit.checkpoint <= now - this._rateLimit.delta) {
            return this._clearRateLimit();
        } else if (!this._rateLimit.timeout) {
            this._rateLimit.timeout = setTimeout(() => this._clearRateLimit(), this._rateLimit.delta - (now - this._rateLimit.checkpoint));
            this._rateLimit.checkpoint = now;
        }
    }

    /**
     * Clears current rate limit limitation and runs paused callback
     */
    _clearRateLimit() {
        clearTimeout(this._rateLimit.timeout);
        this._rateLimit.timeout = null;
        this._rateLimit.counter = 0;
        this._rateLimit.checkpoint = false;

        // resume all paused connections
        while (this._rateLimit.waiting.length) {
            let cb = this._rateLimit.waiting.shift();
            setImmediate(cb);
        }
    }

    /**
     * Returns true if there are free slots in the queue
     */
    isIdle() {
        return this.idling;
    }

    /**
     * Verifies SMTP configuration
     *
     * @param {Function} callback Callback function
     */
    verify(callback) {
        let promise;

        if (!callback) {
            promise = new Promise((resolve, reject) => {
                callback = shared.callbackPromise(resolve, reject);
            });
        }

        let auth = new PoolResource(this).auth;

        this.getSocket(this.options, (err, socketOptions) => {
            if (err) {
                return callback(err);
            }

            let options = this.options;
            if (socketOptions && socketOptions.connection) {
                this.logger.info(
                    {
                        tnx: 'proxy',
                        remoteAddress: socketOptions.connection.remoteAddress,
                        remotePort: socketOptions.connection.remotePort,
                        destHost: options.host || '',
                        destPort: options.port || '',
                        action: 'connected'
                    },
                    'Using proxied socket from %s:%s to %s:%s',
                    socketOptions.connection.remoteAddress,
                    socketOptions.connection.remotePort,
                    options.host || '',
                    options.port || ''
                );
                options = shared.assign(false, options);
                Object.keys(socketOptions).forEach(key => {
                    options[key] = socketOptions[key];
                });
            }

            let connection = new SMTPConnection(options);
            let returned = false;

            connection.once('error', err => {
                if (returned) {
                    return;
                }
                returned = true;
                connection.close();
                return callback(err);
            });

            connection.once('end', () => {
                if (returned) {
                    return;
                }
                returned = true;
                return callback(new Error('Connection closed'));
            });

            let finalize = () => {
                if (returned) {
                    return;
                }
                returned = true;
                connection.quit();
                return callback(null, true);
            };

            connection.connect(() => {
                if (returned) {
                    return;
                }

                if (auth && (connection.allowsAuth || options.forceAuth)) {
                    connection.login(auth, err => {
                        if (returned) {
                            return;
                        }

                        if (err) {
                            returned = true;
                            connection.close();
                            return callback(err);
                        }

                        finalize();
                    });
                } else if (!auth && connection.allowsAuth && options.forceAuth) {
                    let err = new Error('Authentication info was not provided');
                    err.code = 'NoAuth';

                    returned = true;
                    connection.close();
                    return callback(err);
                } else {
                    finalize();
                }
            });
        });

        return promise;
    }
}

// expose to the world
module.exports = SMTPPool;


/***/ }),

/***/ 2230:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const SMTPConnection = __nccwpck_require__(3559);
const assign = (__nccwpck_require__(2673).assign);
const XOAuth2 = __nccwpck_require__(9882);
const EventEmitter = __nccwpck_require__(2361);

/**
 * Creates an element for the pool
 *
 * @constructor
 * @param {Object} options SMTPPool instance
 */
class PoolResource extends EventEmitter {
    constructor(pool) {
        super();

        this.pool = pool;
        this.options = pool.options;
        this.logger = this.pool.logger;

        if (this.options.auth) {
            switch ((this.options.auth.type || '').toString().toUpperCase()) {
                case 'OAUTH2': {
                    let oauth2 = new XOAuth2(this.options.auth, this.logger);
                    oauth2.provisionCallback = (this.pool.mailer && this.pool.mailer.get('oauth2_provision_cb')) || oauth2.provisionCallback;
                    this.auth = {
                        type: 'OAUTH2',
                        user: this.options.auth.user,
                        oauth2,
                        method: 'XOAUTH2'
                    };
                    oauth2.on('token', token => this.pool.mailer.emit('token', token));
                    oauth2.on('error', err => this.emit('error', err));
                    break;
                }
                default:
                    if (!this.options.auth.user && !this.options.auth.pass) {
                        break;
                    }
                    this.auth = {
                        type: (this.options.auth.type || '').toString().toUpperCase() || 'LOGIN',
                        user: this.options.auth.user,
                        credentials: {
                            user: this.options.auth.user || '',
                            pass: this.options.auth.pass,
                            options: this.options.auth.options
                        },
                        method: (this.options.auth.method || '').trim().toUpperCase() || this.options.authMethod || false
                    };
            }
        }

        this._connection = false;
        this._connected = false;

        this.messages = 0;
        this.available = true;
    }

    /**
     * Initiates a connection to the SMTP server
     *
     * @param {Function} callback Callback function to run once the connection is established or failed
     */
    connect(callback) {
        this.pool.getSocket(this.options, (err, socketOptions) => {
            if (err) {
                return callback(err);
            }

            let returned = false;
            let options = this.options;
            if (socketOptions && socketOptions.connection) {
                this.logger.info(
                    {
                        tnx: 'proxy',
                        remoteAddress: socketOptions.connection.remoteAddress,
                        remotePort: socketOptions.connection.remotePort,
                        destHost: options.host || '',
                        destPort: options.port || '',
                        action: 'connected'
                    },
                    'Using proxied socket from %s:%s to %s:%s',
                    socketOptions.connection.remoteAddress,
                    socketOptions.connection.remotePort,
                    options.host || '',
                    options.port || ''
                );

                options = assign(false, options);
                Object.keys(socketOptions).forEach(key => {
                    options[key] = socketOptions[key];
                });
            }

            this.connection = new SMTPConnection(options);

            this.connection.once('error', err => {
                this.emit('error', err);
                if (returned) {
                    return;
                }
                returned = true;
                return callback(err);
            });

            this.connection.once('end', () => {
                this.close();
                if (returned) {
                    return;
                }
                returned = true;

                let timer = setTimeout(() => {
                    if (returned) {
                        return;
                    }
                    // still have not returned, this means we have an unexpected connection close
                    let err = new Error('Unexpected socket close');
                    if (this.connection && this.connection._socket && this.connection._socket.upgrading) {
                        // starttls connection errors
                        err.code = 'ETLS';
                    }
                    callback(err);
                }, 1000);

                try {
                    timer.unref();
                } catch (E) {
                    // Ignore. Happens on envs with non-node timer implementation
                }
            });

            this.connection.connect(() => {
                if (returned) {
                    return;
                }

                if (this.auth && (this.connection.allowsAuth || options.forceAuth)) {
                    this.connection.login(this.auth, err => {
                        if (returned) {
                            return;
                        }
                        returned = true;

                        if (err) {
                            this.connection.close();
                            this.emit('error', err);
                            return callback(err);
                        }

                        this._connected = true;
                        callback(null, true);
                    });
                } else {
                    returned = true;
                    this._connected = true;
                    return callback(null, true);
                }
            });
        });
    }

    /**
     * Sends an e-mail to be sent using the selected settings
     *
     * @param {Object} mail Mail object
     * @param {Function} callback Callback function
     */
    send(mail, callback) {
        if (!this._connected) {
            return this.connect(err => {
                if (err) {
                    return callback(err);
                }
                return this.send(mail, callback);
            });
        }

        let envelope = mail.message.getEnvelope();
        let messageId = mail.message.messageId();

        let recipients = [].concat(envelope.to || []);
        if (recipients.length > 3) {
            recipients.push('...and ' + recipients.splice(2).length + ' more');
        }
        this.logger.info(
            {
                tnx: 'send',
                messageId,
                cid: this.id
            },
            'Sending message %s using #%s to <%s>',
            messageId,
            this.id,
            recipients.join(', ')
        );

        if (mail.data.dsn) {
            envelope.dsn = mail.data.dsn;
        }

        this.connection.send(envelope, mail.message.createReadStream(), (err, info) => {
            this.messages++;

            if (err) {
                this.connection.close();
                this.emit('error', err);
                return callback(err);
            }

            info.envelope = {
                from: envelope.from,
                to: envelope.to
            };
            info.messageId = messageId;

            setImmediate(() => {
                let err;
                if (this.messages >= this.options.maxMessages) {
                    err = new Error('Resource exhausted');
                    err.code = 'EMAXLIMIT';
                    this.connection.close();
                    this.emit('error', err);
                } else {
                    this.pool._checkRateLimit(() => {
                        this.available = true;
                        this.emit('available');
                    });
                }
            });

            callback(null, info);
        });
    }

    /**
     * Closes the connection
     */
    close() {
        this._connected = false;
        if (this.auth && this.auth.oauth2) {
            this.auth.oauth2.removeAllListeners();
        }
        if (this.connection) {
            this.connection.close();
        }
        this.emit('close');
    }
}

module.exports = PoolResource;


/***/ }),

/***/ 3349:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const EventEmitter = __nccwpck_require__(2361);
const SMTPConnection = __nccwpck_require__(3559);
const wellKnown = __nccwpck_require__(6961);
const shared = __nccwpck_require__(2673);
const XOAuth2 = __nccwpck_require__(9882);
const packageData = __nccwpck_require__(4129);

/**
 * Creates a SMTP transport object for Nodemailer
 *
 * @constructor
 * @param {Object} options Connection options
 */
class SMTPTransport extends EventEmitter {
    constructor(options) {
        super();

        options = options || {};

        if (typeof options === 'string') {
            options = {
                url: options
            };
        }

        let urlData;
        let service = options.service;

        if (typeof options.getSocket === 'function') {
            this.getSocket = options.getSocket;
        }

        if (options.url) {
            urlData = shared.parseConnectionUrl(options.url);
            service = service || urlData.service;
        }

        this.options = shared.assign(
            false, // create new object
            options, // regular options
            urlData, // url options
            service && wellKnown(service) // wellknown options
        );

        this.logger = shared.getLogger(this.options, {
            component: this.options.component || 'smtp-transport'
        });

        // temporary object
        let connection = new SMTPConnection(this.options);

        this.name = 'SMTP';
        this.version = packageData.version + '[client:' + connection.version + ']';

        if (this.options.auth) {
            this.auth = this.getAuth({});
        }
    }

    /**
     * Placeholder function for creating proxy sockets. This method immediatelly returns
     * without a socket
     *
     * @param {Object} options Connection options
     * @param {Function} callback Callback function to run with the socket keys
     */
    getSocket(options, callback) {
        // return immediatelly
        return setImmediate(() => callback(null, false));
    }

    getAuth(authOpts) {
        if (!authOpts) {
            return this.auth;
        }

        let hasAuth = false;
        let authData = {};

        if (this.options.auth && typeof this.options.auth === 'object') {
            Object.keys(this.options.auth).forEach(key => {
                hasAuth = true;
                authData[key] = this.options.auth[key];
            });
        }

        if (authOpts && typeof authOpts === 'object') {
            Object.keys(authOpts).forEach(key => {
                hasAuth = true;
                authData[key] = authOpts[key];
            });
        }

        if (!hasAuth) {
            return false;
        }

        switch ((authData.type || '').toString().toUpperCase()) {
            case 'OAUTH2': {
                if (!authData.service && !authData.user) {
                    return false;
                }
                let oauth2 = new XOAuth2(authData, this.logger);
                oauth2.provisionCallback = (this.mailer && this.mailer.get('oauth2_provision_cb')) || oauth2.provisionCallback;
                oauth2.on('token', token => this.mailer.emit('token', token));
                oauth2.on('error', err => this.emit('error', err));
                return {
                    type: 'OAUTH2',
                    user: authData.user,
                    oauth2,
                    method: 'XOAUTH2'
                };
            }
            default:
                return {
                    type: (authData.type || '').toString().toUpperCase() || 'LOGIN',
                    user: authData.user,
                    credentials: {
                        user: authData.user || '',
                        pass: authData.pass,
                        options: authData.options
                    },
                    method: (authData.method || '').trim().toUpperCase() || this.options.authMethod || false
                };
        }
    }

    /**
     * Sends an e-mail using the selected settings
     *
     * @param {Object} mail Mail object
     * @param {Function} callback Callback function
     */
    send(mail, callback) {
        this.getSocket(this.options, (err, socketOptions) => {
            if (err) {
                return callback(err);
            }

            let returned = false;
            let options = this.options;
            if (socketOptions && socketOptions.connection) {
                this.logger.info(
                    {
                        tnx: 'proxy',
                        remoteAddress: socketOptions.connection.remoteAddress,
                        remotePort: socketOptions.connection.remotePort,
                        destHost: options.host || '',
                        destPort: options.port || '',
                        action: 'connected'
                    },
                    'Using proxied socket from %s:%s to %s:%s',
                    socketOptions.connection.remoteAddress,
                    socketOptions.connection.remotePort,
                    options.host || '',
                    options.port || ''
                );

                // only copy options if we need to modify it
                options = shared.assign(false, options);
                Object.keys(socketOptions).forEach(key => {
                    options[key] = socketOptions[key];
                });
            }

            let connection = new SMTPConnection(options);

            connection.once('error', err => {
                if (returned) {
                    return;
                }
                returned = true;
                connection.close();
                return callback(err);
            });

            connection.once('end', () => {
                if (returned) {
                    return;
                }

                let timer = setTimeout(() => {
                    if (returned) {
                        return;
                    }
                    returned = true;
                    // still have not returned, this means we have an unexpected connection close
                    let err = new Error('Unexpected socket close');
                    if (connection && connection._socket && connection._socket.upgrading) {
                        // starttls connection errors
                        err.code = 'ETLS';
                    }
                    callback(err);
                }, 1000);

                try {
                    timer.unref();
                } catch (E) {
                    // Ignore. Happens on envs with non-node timer implementation
                }
            });

            let sendMessage = () => {
                let envelope = mail.message.getEnvelope();
                let messageId = mail.message.messageId();

                let recipients = [].concat(envelope.to || []);
                if (recipients.length > 3) {
                    recipients.push('...and ' + recipients.splice(2).length + ' more');
                }

                if (mail.data.dsn) {
                    envelope.dsn = mail.data.dsn;
                }

                this.logger.info(
                    {
                        tnx: 'send',
                        messageId
                    },
                    'Sending message %s to <%s>',
                    messageId,
                    recipients.join(', ')
                );

                connection.send(envelope, mail.message.createReadStream(), (err, info) => {
                    returned = true;
                    connection.close();
                    if (err) {
                        this.logger.error(
                            {
                                err,
                                tnx: 'send'
                            },
                            'Send error for %s: %s',
                            messageId,
                            err.message
                        );
                        return callback(err);
                    }
                    info.envelope = {
                        from: envelope.from,
                        to: envelope.to
                    };
                    info.messageId = messageId;
                    try {
                        return callback(null, info);
                    } catch (E) {
                        this.logger.error(
                            {
                                err: E,
                                tnx: 'callback'
                            },
                            'Callback error for %s: %s',
                            messageId,
                            E.message
                        );
                    }
                });
            };

            connection.connect(() => {
                if (returned) {
                    return;
                }

                let auth = this.getAuth(mail.data.auth);

                if (auth && (connection.allowsAuth || options.forceAuth)) {
                    connection.login(auth, err => {
                        if (auth && auth !== this.auth && auth.oauth2) {
                            auth.oauth2.removeAllListeners();
                        }
                        if (returned) {
                            return;
                        }

                        if (err) {
                            returned = true;
                            connection.close();
                            return callback(err);
                        }

                        sendMessage();
                    });
                } else {
                    sendMessage();
                }
            });
        });
    }

    /**
     * Verifies SMTP configuration
     *
     * @param {Function} callback Callback function
     */
    verify(callback) {
        let promise;

        if (!callback) {
            promise = new Promise((resolve, reject) => {
                callback = shared.callbackPromise(resolve, reject);
            });
        }

        this.getSocket(this.options, (err, socketOptions) => {
            if (err) {
                return callback(err);
            }

            let options = this.options;
            if (socketOptions && socketOptions.connection) {
                this.logger.info(
                    {
                        tnx: 'proxy',
                        remoteAddress: socketOptions.connection.remoteAddress,
                        remotePort: socketOptions.connection.remotePort,
                        destHost: options.host || '',
                        destPort: options.port || '',
                        action: 'connected'
                    },
                    'Using proxied socket from %s:%s to %s:%s',
                    socketOptions.connection.remoteAddress,
                    socketOptions.connection.remotePort,
                    options.host || '',
                    options.port || ''
                );

                options = shared.assign(false, options);
                Object.keys(socketOptions).forEach(key => {
                    options[key] = socketOptions[key];
                });
            }

            let connection = new SMTPConnection(options);
            let returned = false;

            connection.once('error', err => {
                if (returned) {
                    return;
                }
                returned = true;
                connection.close();
                return callback(err);
            });

            connection.once('end', () => {
                if (returned) {
                    return;
                }
                returned = true;
                return callback(new Error('Connection closed'));
            });

            let finalize = () => {
                if (returned) {
                    return;
                }
                returned = true;
                connection.quit();
                return callback(null, true);
            };

            connection.connect(() => {
                if (returned) {
                    return;
                }

                let authData = this.getAuth({});

                if (authData && (connection.allowsAuth || options.forceAuth)) {
                    connection.login(authData, err => {
                        if (returned) {
                            return;
                        }

                        if (err) {
                            returned = true;
                            connection.close();
                            return callback(err);
                        }

                        finalize();
                    });
                } else if (!authData && connection.allowsAuth && options.forceAuth) {
                    let err = new Error('Authentication info was not provided');
                    err.code = 'NoAuth';

                    returned = true;
                    connection.close();
                    return callback(err);
                } else {
                    finalize();
                }
            });
        });

        return promise;
    }

    /**
     * Releases resources
     */
    close() {
        if (this.auth && this.auth.oauth2) {
            this.auth.oauth2.removeAllListeners();
        }
        this.emit('close');
    }
}

// expose to the world
module.exports = SMTPTransport;


/***/ }),

/***/ 1888:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const packageData = __nccwpck_require__(4129);
const shared = __nccwpck_require__(2673);

/**
 * Generates a Transport object for streaming
 *
 * Possible options can be the following:
 *
 *  * **buffer** if true, then returns the message as a Buffer object instead of a stream
 *  * **newline** either 'windows' or 'unix'
 *
 * @constructor
 * @param {Object} optional config parameter
 */
class StreamTransport {
    constructor(options) {
        options = options || {};

        this.options = options || {};

        this.name = 'StreamTransport';
        this.version = packageData.version;

        this.logger = shared.getLogger(this.options, {
            component: this.options.component || 'stream-transport'
        });

        this.winbreak = ['win', 'windows', 'dos', '\r\n'].includes((options.newline || '').toString().toLowerCase());
    }

    /**
     * Compiles a mailcomposer message and forwards it to handler that sends it
     *
     * @param {Object} emailMessage MailComposer object
     * @param {Function} callback Callback function to run when the sending is completed
     */
    send(mail, done) {
        // We probably need this in the output
        mail.message.keepBcc = true;

        let envelope = mail.data.envelope || mail.message.getEnvelope();
        let messageId = mail.message.messageId();

        let recipients = [].concat(envelope.to || []);
        if (recipients.length > 3) {
            recipients.push('...and ' + recipients.splice(2).length + ' more');
        }
        this.logger.info(
            {
                tnx: 'send',
                messageId
            },
            'Sending message %s to <%s> using %s line breaks',
            messageId,
            recipients.join(', '),
            this.winbreak ? '<CR><LF>' : '<LF>'
        );

        setImmediate(() => {
            let stream;

            try {
                stream = mail.message.createReadStream();
            } catch (E) {
                this.logger.error(
                    {
                        err: E,
                        tnx: 'send',
                        messageId
                    },
                    'Creating send stream failed for %s. %s',
                    messageId,
                    E.message
                );
                return done(E);
            }

            if (!this.options.buffer) {
                stream.once('error', err => {
                    this.logger.error(
                        {
                            err,
                            tnx: 'send',
                            messageId
                        },
                        'Failed creating message for %s. %s',
                        messageId,
                        err.message
                    );
                });
                return done(null, {
                    envelope: mail.data.envelope || mail.message.getEnvelope(),
                    messageId,
                    message: stream
                });
            }

            let chunks = [];
            let chunklen = 0;
            stream.on('readable', () => {
                let chunk;
                while ((chunk = stream.read()) !== null) {
                    chunks.push(chunk);
                    chunklen += chunk.length;
                }
            });

            stream.once('error', err => {
                this.logger.error(
                    {
                        err,
                        tnx: 'send',
                        messageId
                    },
                    'Failed creating message for %s. %s',
                    messageId,
                    err.message
                );
                return done(err);
            });

            stream.on('end', () =>
                done(null, {
                    envelope: mail.data.envelope || mail.message.getEnvelope(),
                    messageId,
                    message: Buffer.concat(chunks, chunklen)
                })
            );
        });
    }
}

module.exports = StreamTransport;


/***/ }),

/***/ 6961:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const services = __nccwpck_require__(8249);
const normalized = {};

Object.keys(services).forEach(key => {
    let service = services[key];

    normalized[normalizeKey(key)] = normalizeService(service);

    [].concat(service.aliases || []).forEach(alias => {
        normalized[normalizeKey(alias)] = normalizeService(service);
    });

    [].concat(service.domains || []).forEach(domain => {
        normalized[normalizeKey(domain)] = normalizeService(service);
    });
});

function normalizeKey(key) {
    return key.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();
}

function normalizeService(service) {
    let filter = ['domains', 'aliases'];
    let response = {};

    Object.keys(service).forEach(key => {
        if (filter.indexOf(key) < 0) {
            response[key] = service[key];
        }
    });

    return response;
}

/**
 * Resolves SMTP config for given key. Key can be a name (like 'Gmail'), alias (like 'Google Mail') or
 * an email address (like 'test@googlemail.com').
 *
 * @param {String} key [description]
 * @returns {Object} SMTP config or false if not found
 */
module.exports = function (key) {
    key = normalizeKey(key.split('@').pop());
    return normalized[key] || false;
};


/***/ }),

/***/ 9882:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const Stream = (__nccwpck_require__(2781).Stream);
const nmfetch = __nccwpck_require__(9106);
const crypto = __nccwpck_require__(6113);
const shared = __nccwpck_require__(2673);

/**
 * XOAUTH2 access_token generator for Gmail.
 * Create client ID for web applications in Google API console to use it.
 * See Offline Access for receiving the needed refreshToken for an user
 * https://developers.google.com/accounts/docs/OAuth2WebServer#offline
 *
 * Usage for generating access tokens with a custom method using provisionCallback:
 * provisionCallback(user, renew, callback)
 *   * user is the username to get the token for
 *   * renew is a boolean that if true indicates that existing token failed and needs to be renewed
 *   * callback is the callback to run with (error, accessToken [, expires])
 *     * accessToken is a string
 *     * expires is an optional expire time in milliseconds
 * If provisionCallback is used, then Nodemailer does not try to attempt generating the token by itself
 *
 * @constructor
 * @param {Object} options Client information for token generation
 * @param {String} options.user User e-mail address
 * @param {String} options.clientId Client ID value
 * @param {String} options.clientSecret Client secret value
 * @param {String} options.refreshToken Refresh token for an user
 * @param {String} options.accessUrl Endpoint for token generation, defaults to 'https://accounts.google.com/o/oauth2/token'
 * @param {String} options.accessToken An existing valid accessToken
 * @param {String} options.privateKey Private key for JSW
 * @param {Number} options.expires Optional Access Token expire time in ms
 * @param {Number} options.timeout Optional TTL for Access Token in seconds
 * @param {Function} options.provisionCallback Function to run when a new access token is required
 */
class XOAuth2 extends Stream {
    constructor(options, logger) {
        super();

        this.options = options || {};

        if (options && options.serviceClient) {
            if (!options.privateKey || !options.user) {
                setImmediate(() => this.emit('error', new Error('Options "privateKey" and "user" are required for service account!')));
                return;
            }

            let serviceRequestTimeout = Math.min(Math.max(Number(this.options.serviceRequestTimeout) || 0, 0), 3600);
            this.options.serviceRequestTimeout = serviceRequestTimeout || 5 * 60;
        }

        this.logger = shared.getLogger(
            {
                logger
            },
            {
                component: this.options.component || 'OAuth2'
            }
        );

        this.provisionCallback = typeof this.options.provisionCallback === 'function' ? this.options.provisionCallback : false;

        this.options.accessUrl = this.options.accessUrl || 'https://accounts.google.com/o/oauth2/token';
        this.options.customHeaders = this.options.customHeaders || {};
        this.options.customParams = this.options.customParams || {};

        this.accessToken = this.options.accessToken || false;

        if (this.options.expires && Number(this.options.expires)) {
            this.expires = this.options.expires;
        } else {
            let timeout = Math.max(Number(this.options.timeout) || 0, 0);
            this.expires = (timeout && Date.now() + timeout * 1000) || 0;
        }
    }

    /**
     * Returns or generates (if previous has expired) a XOAuth2 token
     *
     * @param {Boolean} renew If false then use cached access token (if available)
     * @param {Function} callback Callback function with error object and token string
     */
    getToken(renew, callback) {
        if (!renew && this.accessToken && (!this.expires || this.expires > Date.now())) {
            return callback(null, this.accessToken);
        }

        let generateCallback = (...args) => {
            if (args[0]) {
                this.logger.error(
                    {
                        err: args[0],
                        tnx: 'OAUTH2',
                        user: this.options.user,
                        action: 'renew'
                    },
                    'Failed generating new Access Token for %s',
                    this.options.user
                );
            } else {
                this.logger.info(
                    {
                        tnx: 'OAUTH2',
                        user: this.options.user,
                        action: 'renew'
                    },
                    'Generated new Access Token for %s',
                    this.options.user
                );
            }
            callback(...args);
        };

        if (this.provisionCallback) {
            this.provisionCallback(this.options.user, !!renew, (err, accessToken, expires) => {
                if (!err && accessToken) {
                    this.accessToken = accessToken;
                    this.expires = expires || 0;
                }
                generateCallback(err, accessToken);
            });
        } else {
            this.generateToken(generateCallback);
        }
    }

    /**
     * Updates token values
     *
     * @param {String} accessToken New access token
     * @param {Number} timeout Access token lifetime in seconds
     *
     * Emits 'token': { user: User email-address, accessToken: the new accessToken, timeout: TTL in seconds}
     */
    updateToken(accessToken, timeout) {
        this.accessToken = accessToken;
        timeout = Math.max(Number(timeout) || 0, 0);
        this.expires = (timeout && Date.now() + timeout * 1000) || 0;

        this.emit('token', {
            user: this.options.user,
            accessToken: accessToken || '',
            expires: this.expires
        });
    }

    /**
     * Generates a new XOAuth2 token with the credentials provided at initialization
     *
     * @param {Function} callback Callback function with error object and token string
     */
    generateToken(callback) {
        let urlOptions;
        let loggedUrlOptions;
        if (this.options.serviceClient) {
            // service account - https://developers.google.com/identity/protocols/OAuth2ServiceAccount
            let iat = Math.floor(Date.now() / 1000); // unix time
            let tokenData = {
                iss: this.options.serviceClient,
                scope: this.options.scope || 'https://mail.google.com/',
                sub: this.options.user,
                aud: this.options.accessUrl,
                iat,
                exp: iat + this.options.serviceRequestTimeout
            };
            let token;
            try {
                token = this.jwtSignRS256(tokenData);
            } catch (err) {
                return callback(new Error('Can\x27t generate token. Check your auth options'));
            }

            urlOptions = {
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: token
            };

            loggedUrlOptions = {
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: tokenData
            };
        } else {
            if (!this.options.refreshToken) {
                return callback(new Error('Can\x27t create new access token for user'));
            }

            // web app - https://developers.google.com/identity/protocols/OAuth2WebServer
            urlOptions = {
                client_id: this.options.clientId || '',
                client_secret: this.options.clientSecret || '',
                refresh_token: this.options.refreshToken,
                grant_type: 'refresh_token'
            };

            loggedUrlOptions = {
                client_id: this.options.clientId || '',
                client_secret: (this.options.clientSecret || '').substr(0, 6) + '...',
                refresh_token: (this.options.refreshToken || '').substr(0, 6) + '...',
                grant_type: 'refresh_token'
            };
        }

        Object.keys(this.options.customParams).forEach(key => {
            urlOptions[key] = this.options.customParams[key];
            loggedUrlOptions[key] = this.options.customParams[key];
        });

        this.logger.debug(
            {
                tnx: 'OAUTH2',
                user: this.options.user,
                action: 'generate'
            },
            'Requesting token using: %s',
            JSON.stringify(loggedUrlOptions)
        );

        this.postRequest(this.options.accessUrl, urlOptions, this.options, (error, body) => {
            let data;

            if (error) {
                return callback(error);
            }

            try {
                data = JSON.parse(body.toString());
            } catch (E) {
                return callback(E);
            }

            if (!data || typeof data !== 'object') {
                this.logger.debug(
                    {
                        tnx: 'OAUTH2',
                        user: this.options.user,
                        action: 'post'
                    },
                    'Response: %s',
                    (body || '').toString()
                );
                return callback(new Error('Invalid authentication response'));
            }

            let logData = {};
            Object.keys(data).forEach(key => {
                if (key !== 'access_token') {
                    logData[key] = data[key];
                } else {
                    logData[key] = (data[key] || '').toString().substr(0, 6) + '...';
                }
            });

            this.logger.debug(
                {
                    tnx: 'OAUTH2',
                    user: this.options.user,
                    action: 'post'
                },
                'Response: %s',
                JSON.stringify(logData)
            );

            if (data.error) {
                // Error Response : https://tools.ietf.org/html/rfc6749#section-5.2
                let errorMessage = data.error;
                if (data.error_description) {
                    errorMessage += ': ' + data.error_description;
                }
                if (data.error_uri) {
                    errorMessage += ' (' + data.error_uri + ')';
                }
                return callback(new Error(errorMessage));
            }

            if (data.access_token) {
                this.updateToken(data.access_token, data.expires_in);
                return callback(null, this.accessToken);
            }

            return callback(new Error('No access token'));
        });
    }

    /**
     * Converts an access_token and user id into a base64 encoded XOAuth2 token
     *
     * @param {String} [accessToken] Access token string
     * @return {String} Base64 encoded token for IMAP or SMTP login
     */
    buildXOAuth2Token(accessToken) {
        let authData = ['user=' + (this.options.user || ''), 'auth=Bearer ' + (accessToken || this.accessToken), '', ''];
        return Buffer.from(authData.join('\x01'), 'utf-8').toString('base64');
    }

    /**
     * Custom POST request handler.
     * This is only needed to keep paths short in Windows – usually this module
     * is a dependency of a dependency and if it tries to require something
     * like the request module the paths get way too long to handle for Windows.
     * As we do only a simple POST request we do not actually require complicated
     * logic support (no redirects, no nothing) anyway.
     *
     * @param {String} url Url to POST to
     * @param {String|Buffer} payload Payload to POST
     * @param {Function} callback Callback function with (err, buff)
     */
    postRequest(url, payload, params, callback) {
        let returned = false;

        let chunks = [];
        let chunklen = 0;

        let req = nmfetch(url, {
            method: 'post',
            headers: params.customHeaders,
            body: payload,
            allowErrorResponse: true
        });

        req.on('readable', () => {
            let chunk;
            while ((chunk = req.read()) !== null) {
                chunks.push(chunk);
                chunklen += chunk.length;
            }
        });

        req.once('error', err => {
            if (returned) {
                return;
            }
            returned = true;
            return callback(err);
        });

        req.once('end', () => {
            if (returned) {
                return;
            }
            returned = true;
            return callback(null, Buffer.concat(chunks, chunklen));
        });
    }

    /**
     * Encodes a buffer or a string into Base64url format
     *
     * @param {Buffer|String} data The data to convert
     * @return {String} The encoded string
     */
    toBase64URL(data) {
        if (typeof data === 'string') {
            data = Buffer.from(data);
        }

        return data
            .toString('base64')
            .replace(/[=]+/g, '') // remove '='s
            .replace(/\+/g, '-') // '+' → '-'
            .replace(/\//g, '_'); // '/' → '_'
    }

    /**
     * Creates a JSON Web Token signed with RS256 (SHA256 + RSA)
     *
     * @param {Object} payload The payload to include in the generated token
     * @return {String} The generated and signed token
     */
    jwtSignRS256(payload) {
        payload = ['{"alg":"RS256","typ":"JWT"}', JSON.stringify(payload)].map(val => this.toBase64URL(val)).join('.');
        let signature = crypto.createSign('RSA-SHA256').update(payload).sign(this.options.privateKey);
        return payload + '.' + this.toBase64URL(signature);
    }
}

module.exports = XOAuth2;


/***/ }),

/***/ 7810:
/***/ ((module) => {

"use strict";


if (typeof process === 'undefined' ||
    !process.version ||
    process.version.indexOf('v0.') === 0 ||
    process.version.indexOf('v1.') === 0 && process.version.indexOf('v1.8.') !== 0) {
  module.exports = { nextTick: nextTick };
} else {
  module.exports = process
}

function nextTick(fn, arg1, arg2, arg3) {
  if (typeof fn !== 'function') {
    throw new TypeError('"callback" argument must be a function');
  }
  var len = arguments.length;
  var args, i;
  switch (len) {
  case 0:
  case 1:
    return process.nextTick(fn);
  case 2:
    return process.nextTick(function afterTickOne() {
      fn.call(null, arg1);
    });
  case 3:
    return process.nextTick(function afterTickTwo() {
      fn.call(null, arg1, arg2);
    });
  case 4:
    return process.nextTick(function afterTickThree() {
      fn.call(null, arg1, arg2, arg3);
    });
  default:
    args = new Array(len - 1);
    i = 0;
    while (i < args.length) {
      args[i++] = arguments[i];
    }
    return process.nextTick(function afterTick() {
      fn.apply(null, args);
    });
  }
}



/***/ }),

/***/ 1359:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.



/*<replacement>*/

var pna = __nccwpck_require__(7810);
/*</replacement>*/

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    keys.push(key);
  }return keys;
};
/*</replacement>*/

module.exports = Duplex;

/*<replacement>*/
var util = Object.create(__nccwpck_require__(5898));
util.inherits = __nccwpck_require__(4124);
/*</replacement>*/

var Readable = __nccwpck_require__(1433);
var Writable = __nccwpck_require__(6993);

util.inherits(Duplex, Readable);

{
  // avoid scope creep, the keys array can then be collected
  var keys = objectKeys(Writable.prototype);
  for (var v = 0; v < keys.length; v++) {
    var method = keys[v];
    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
  }
}

function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false) this.readable = false;

  if (options && options.writable === false) this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;

  this.once('end', onend);
}

Object.defineProperty(Duplex.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function () {
    return this._writableState.highWaterMark;
  }
});

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended) return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  pna.nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

Object.defineProperty(Duplex.prototype, 'destroyed', {
  get: function () {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false;
    }
    return this._readableState.destroyed && this._writableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
    this._writableState.destroyed = value;
  }
});

Duplex.prototype._destroy = function (err, cb) {
  this.push(null);
  this.end();

  pna.nextTick(cb, err);
};

/***/ }),

/***/ 1542:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.



module.exports = PassThrough;

var Transform = __nccwpck_require__(4415);

/*<replacement>*/
var util = Object.create(__nccwpck_require__(5898));
util.inherits = __nccwpck_require__(4124);
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};

/***/ }),

/***/ 1433:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.



/*<replacement>*/

var pna = __nccwpck_require__(7810);
/*</replacement>*/

module.exports = Readable;

/*<replacement>*/
var isArray = __nccwpck_require__(893);
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Readable.ReadableState = ReadableState;

/*<replacement>*/
var EE = (__nccwpck_require__(2361).EventEmitter);

var EElistenerCount = function (emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/
var Stream = __nccwpck_require__(2387);
/*</replacement>*/

/*<replacement>*/

var Buffer = (__nccwpck_require__(1867).Buffer);
var OurUint8Array = (typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {}).Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

/*</replacement>*/

/*<replacement>*/
var util = Object.create(__nccwpck_require__(5898));
util.inherits = __nccwpck_require__(4124);
/*</replacement>*/

/*<replacement>*/
var debugUtil = __nccwpck_require__(3837);
var debug = void 0;
if (debugUtil && debugUtil.debuglog) {
  debug = debugUtil.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/

var BufferList = __nccwpck_require__(7053);
var destroyImpl = __nccwpck_require__(7049);
var StringDecoder;

util.inherits(Readable, Stream);

var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn);

  // This is a hack to make sure that our error handler is attached before any
  // userland ones.  NEVER DO THIS. This is here only because this code needs
  // to continue to work with older versions of Node.js that do not include
  // the prependListener() method. The goal is to eventually remove this hack.
  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
}

function ReadableState(options, stream) {
  Duplex = Duplex || __nccwpck_require__(1359);

  options = options || {};

  // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.
  var isDuplex = stream instanceof Duplex;

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var readableHwm = options.readableHighWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;

  if (hwm || hwm === 0) this.highWaterMark = hwm;else if (isDuplex && (readableHwm || readableHwm === 0)) this.highWaterMark = readableHwm;else this.highWaterMark = defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()
  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the event 'readable'/'data' is emitted
  // immediately, or on a later tick.  We set this to true at first, because
  // any actions that shouldn't happen until "later" should generally also
  // not happen before the first read call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;

  // has it been destroyed
  this.destroyed = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder) StringDecoder = (__nccwpck_require__(4841)/* .StringDecoder */ .s);
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  Duplex = Duplex || __nccwpck_require__(1359);

  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options) {
    if (typeof options.read === 'function') this._read = options.read;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;
  }

  Stream.call(this);
}

Object.defineProperty(Readable.prototype, 'destroyed', {
  get: function () {
    if (this._readableState === undefined) {
      return false;
    }
    return this._readableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._readableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
  }
});

Readable.prototype.destroy = destroyImpl.destroy;
Readable.prototype._undestroy = destroyImpl.undestroy;
Readable.prototype._destroy = function (err, cb) {
  this.push(null);
  cb(err);
};

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;
  var skipChunkCheck;

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding;
      if (encoding !== state.encoding) {
        chunk = Buffer.from(chunk, encoding);
        encoding = '';
      }
      skipChunkCheck = true;
    }
  } else {
    skipChunkCheck = true;
  }

  return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function (chunk) {
  return readableAddChunk(this, chunk, null, true, false);
};

function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
  var state = stream._readableState;
  if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else {
    var er;
    if (!skipChunkCheck) er = chunkInvalid(state, chunk);
    if (er) {
      stream.emit('error', er);
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
        chunk = _uint8ArrayToBuffer(chunk);
      }

      if (addToFront) {
        if (state.endEmitted) stream.emit('error', new Error('stream.unshift() after end event'));else addChunk(stream, state, chunk, true);
      } else if (state.ended) {
        stream.emit('error', new Error('stream.push() after EOF'));
      } else {
        state.reading = false;
        if (state.decoder && !encoding) {
          chunk = state.decoder.write(chunk);
          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore(stream, state);
        } else {
          addChunk(stream, state, chunk, false);
        }
      }
    } else if (!addToFront) {
      state.reading = false;
    }
  }

  return needMoreData(state);
}

function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    stream.emit('data', chunk);
    stream.read(0);
  } else {
    // update the buffer info.
    state.length += state.objectMode ? 1 : chunk.length;
    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);

    if (state.needReadable) emitReadable(stream);
  }
  maybeReadMore(stream, state);
}

function chunkInvalid(state, chunk) {
  var er;
  if (!_isUint8Array(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
}

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
};

// backwards compatibility.
Readable.prototype.setEncoding = function (enc) {
  if (!StringDecoder) StringDecoder = (__nccwpck_require__(4841)/* .StringDecoder */ .s);
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 8MB
var MAX_HWM = 0x800000;
function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }
  return n;
}

// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;
  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  }
  // If we're asking for more than the current hwm, then raise the hwm.
  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n;
  // Don't have enough
  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }
  return state.length;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;

  if (n !== 0) state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0) state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);

  return ret;
};

function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync) pna.nextTick(emitReadable_, stream);else emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    pna.nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;else len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function (n) {
  this.emit('error', new Error('_read() is not implemented'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;

  var endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) pna.nextTick(endFn);else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable, unpipeInfo) {
    debug('onunpipe');
    if (readable === src) {
      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
        unpipeInfo.hasUnpiped = true;
        cleanup();
      }
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  var cleanedUp = false;
  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);

    cleanedUp = true;

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  // If the user pushes more data while we're writing to dest then we'll end up
  // in ondata again. However, we only want to increase awaitDrain once because
  // dest will only emit one 'drain' event for the multiple writes.
  // => Introduce a guard on increasing awaitDrain.
  var increasedAwaitDrain = false;
  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    increasedAwaitDrain = false;
    var ret = dest.write(chunk);
    if (false === ret && !increasedAwaitDrain) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', state.awaitDrain);
        state.awaitDrain++;
        increasedAwaitDrain = true;
      }
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) dest.emit('error', er);
  }

  // Make sure our error handler is attached before userland ones.
  prependListener(dest, 'error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function () {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;
    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;
  var unpipeInfo = { hasUnpiped: false };

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0) return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;

    if (!dest) dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this, unpipeInfo);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++) {
      dests[i].emit('unpipe', this, { hasUnpiped: false });
    }return this;
  }

  // try to find the right one.
  var index = indexOf(state.pipes, dest);
  if (index === -1) return this;

  state.pipes.splice(index, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];

  dest.emit('unpipe', this, unpipeInfo);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function (ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data') {
    // Start flowing on next tick if stream isn't explicitly paused
    if (this._readableState.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    var state = this._readableState;
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.emittedReadable = false;
      if (!state.reading) {
        pna.nextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function () {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    pna.nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  state.awaitDrain = 0;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null) {}
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function (stream) {
  var _this = this;

  var state = this._readableState;
  var paused = false;

  stream.on('end', function () {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) _this.push(chunk);
    }

    _this.push(null);
  });

  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = _this.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function (method) {
        return function () {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  }

  // proxy certain important events.
  for (var n = 0; n < kProxyEvents.length; n++) {
    stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
  }

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  this._read = function (n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return this;
};

Object.defineProperty(Readable.prototype, 'readableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function () {
    return this._readableState.highWaterMark;
  }
});

// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;

  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.head.data;else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = fromListPartial(n, state.buffer, state.decoder);
  }

  return ret;
}

// Extracts only enough buffered data to satisfy the amount requested.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromListPartial(n, list, hasStrings) {
  var ret;
  if (n < list.head.data.length) {
    // slice is the same for buffers and strings
    ret = list.head.data.slice(0, n);
    list.head.data = list.head.data.slice(n);
  } else if (n === list.head.data.length) {
    // first chunk is a perfect match
    ret = list.shift();
  } else {
    // result spans more than one buffer
    ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
  }
  return ret;
}

// Copies a specified amount of characters from the list of buffered data
// chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBufferString(n, list) {
  var p = list.head;
  var c = 1;
  var ret = p.data;
  n -= ret.length;
  while (p = p.next) {
    var str = p.data;
    var nb = n > str.length ? str.length : n;
    if (nb === str.length) ret += str;else ret += str.slice(0, n);
    n -= nb;
    if (n === 0) {
      if (nb === str.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = str.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

// Copies a specified amount of bytes from the list of buffered data chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBuffer(n, list) {
  var ret = Buffer.allocUnsafe(n);
  var p = list.head;
  var c = 1;
  p.data.copy(ret);
  n -= p.data.length;
  while (p = p.next) {
    var buf = p.data;
    var nb = n > buf.length ? buf.length : n;
    buf.copy(ret, ret.length - n, 0, nb);
    n -= nb;
    if (n === 0) {
      if (nb === buf.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = buf.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    pna.nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

/***/ }),

/***/ 4415:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.



module.exports = Transform;

var Duplex = __nccwpck_require__(1359);

/*<replacement>*/
var util = Object.create(__nccwpck_require__(5898));
util.inherits = __nccwpck_require__(4124);
/*</replacement>*/

util.inherits(Transform, Duplex);

function afterTransform(er, data) {
  var ts = this._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb) {
    return this.emit('error', new Error('write callback called multiple times'));
  }

  ts.writechunk = null;
  ts.writecb = null;

  if (data != null) // single equals check for both `null` and `undefined`
    this.push(data);

  cb(er);

  var rs = this._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    this._read(rs.highWaterMark);
  }
}

function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  Duplex.call(this, options);

  this._transformState = {
    afterTransform: afterTransform.bind(this),
    needTransform: false,
    transforming: false,
    writecb: null,
    writechunk: null,
    writeencoding: null
  };

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;

    if (typeof options.flush === 'function') this._flush = options.flush;
  }

  // When the writable side finishes, then flush out anything remaining.
  this.on('prefinish', prefinish);
}

function prefinish() {
  var _this = this;

  if (typeof this._flush === 'function') {
    this._flush(function (er, data) {
      done(_this, er, data);
    });
  } else {
    done(this, null, null);
  }
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function (chunk, encoding, cb) {
  throw new Error('_transform() is not implemented');
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

Transform.prototype._destroy = function (err, cb) {
  var _this2 = this;

  Duplex.prototype._destroy.call(this, err, function (err2) {
    cb(err2);
    _this2.emit('close');
  });
};

function done(stream, er, data) {
  if (er) return stream.emit('error', er);

  if (data != null) // single equals check for both `null` and `undefined`
    stream.push(data);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  if (stream._writableState.length) throw new Error('Calling transform done when ws.length != 0');

  if (stream._transformState.transforming) throw new Error('Calling transform done when still transforming');

  return stream.push(null);
}

/***/ }),

/***/ 6993:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.



/*<replacement>*/

var pna = __nccwpck_require__(7810);
/*</replacement>*/

module.exports = Writable;

/* <replacement> */
function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

// It seems a linked list but it is not
// there will be only 2 of these for each stream
function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;
  this.finish = function () {
    onCorkedFinish(_this, state);
  };
}
/* </replacement> */

/*<replacement>*/
var asyncWrite = !process.browser && ['v0.10', 'v0.9.'].indexOf(process.version.slice(0, 5)) > -1 ? setImmediate : pna.nextTick;
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Writable.WritableState = WritableState;

/*<replacement>*/
var util = Object.create(__nccwpck_require__(5898));
util.inherits = __nccwpck_require__(4124);
/*</replacement>*/

/*<replacement>*/
var internalUtil = {
  deprecate: __nccwpck_require__(5278)
};
/*</replacement>*/

/*<replacement>*/
var Stream = __nccwpck_require__(2387);
/*</replacement>*/

/*<replacement>*/

var Buffer = (__nccwpck_require__(1867).Buffer);
var OurUint8Array = (typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {}).Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

/*</replacement>*/

var destroyImpl = __nccwpck_require__(7049);

util.inherits(Writable, Stream);

function nop() {}

function WritableState(options, stream) {
  Duplex = Duplex || __nccwpck_require__(1359);

  options = options || {};

  // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.
  var isDuplex = stream instanceof Duplex;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var writableHwm = options.writableHighWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;

  if (hwm || hwm === 0) this.highWaterMark = hwm;else if (isDuplex && (writableHwm || writableHwm === 0)) this.highWaterMark = writableHwm;else this.highWaterMark = defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // if _final has been called
  this.finalCalled = false;

  // drain event flag.
  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // has it been destroyed
  this.destroyed = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function (er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;

  // count buffered requests
  this.bufferedRequestCount = 0;

  // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two
  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function getBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: internalUtil.deprecate(function () {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
    });
  } catch (_) {}
})();

// Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.
var realHasInstance;
if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
  realHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Writable, Symbol.hasInstance, {
    value: function (object) {
      if (realHasInstance.call(this, object)) return true;
      if (this !== Writable) return false;

      return object && object._writableState instanceof WritableState;
    }
  });
} else {
  realHasInstance = function (object) {
    return object instanceof this;
  };
}

function Writable(options) {
  Duplex = Duplex || __nccwpck_require__(1359);

  // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.

  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  if (!realHasInstance.call(Writable, this) && !(this instanceof Duplex)) {
    return new Writable(options);
  }

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;

    if (typeof options.writev === 'function') this._writev = options.writev;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;

    if (typeof options.final === 'function') this._final = options.final;
  }

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function () {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  pna.nextTick(cb, er);
}

// Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  var er = false;

  if (chunk === null) {
    er = new TypeError('May not write null values to stream');
  } else if (typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  if (er) {
    stream.emit('error', er);
    pna.nextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;
  var isBuf = !state.objectMode && _isUint8Array(chunk);

  if (isBuf && !Buffer.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;

  if (typeof cb !== 'function') cb = nop;

  if (state.ended) writeAfterEnd(this, cb);else if (isBuf || validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function () {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }
  return chunk;
}

Object.defineProperty(Writable.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function () {
    return this._writableState.highWaterMark;
  }
});

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
  if (!isBuf) {
    var newChunk = decodeChunk(state, chunk, encoding);
    if (chunk !== newChunk) {
      isBuf = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    };
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    pna.nextTick(cb, er);
    // this can emit finish, and it will always happen
    // after error
    pna.nextTick(finishMaybe, stream, state);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
    // this can emit finish, but finish must
    // always follow error
    finishMaybe(stream, state);
  }
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      /*<replacement>*/
      asyncWrite(afterWrite, stream, state, finished, cb);
      /*</replacement>*/
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}

// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;

    var count = 0;
    var allBuffers = true;
    while (entry) {
      buffer[count] = entry;
      if (!entry.isBuf) allBuffers = false;
      entry = entry.next;
      count += 1;
    }
    buffer.allBuffers = allBuffers;

    doWrite(stream, state, true, state.length, buffer, '', holder.finish);

    // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite
    state.pendingcb++;
    state.lastBufferedRequest = null;
    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }
    state.bufferedRequestCount = 0;
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      state.bufferedRequestCount--;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new Error('_write() is not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending) endWritable(this, state, cb);
};

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}
function callFinal(stream, state) {
  stream._final(function (err) {
    state.pendingcb--;
    if (err) {
      stream.emit('error', err);
    }
    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe(stream, state);
  });
}
function prefinish(stream, state) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function') {
      state.pendingcb++;
      state.finalCalled = true;
      pna.nextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    prefinish(stream, state);
    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished) pna.nextTick(cb);else stream.once('finish', cb);
  }
  state.ended = true;
  stream.writable = false;
}

function onCorkedFinish(corkReq, state, err) {
  var entry = corkReq.entry;
  corkReq.entry = null;
  while (entry) {
    var cb = entry.callback;
    state.pendingcb--;
    cb(err);
    entry = entry.next;
  }

  // reuse the free corkReq.
  state.corkedRequestsFree.next = corkReq;
}

Object.defineProperty(Writable.prototype, 'destroyed', {
  get: function () {
    if (this._writableState === undefined) {
      return false;
    }
    return this._writableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._writableState.destroyed = value;
  }
});

Writable.prototype.destroy = destroyImpl.destroy;
Writable.prototype._undestroy = destroyImpl.undestroy;
Writable.prototype._destroy = function (err, cb) {
  this.end();
  cb(err);
};

/***/ }),

/***/ 7053:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Buffer = (__nccwpck_require__(1867).Buffer);
var util = __nccwpck_require__(3837);

function copyBuffer(src, target, offset) {
  src.copy(target, offset);
}

module.exports = function () {
  function BufferList() {
    _classCallCheck(this, BufferList);

    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  BufferList.prototype.push = function push(v) {
    var entry = { data: v, next: null };
    if (this.length > 0) this.tail.next = entry;else this.head = entry;
    this.tail = entry;
    ++this.length;
  };

  BufferList.prototype.unshift = function unshift(v) {
    var entry = { data: v, next: this.head };
    if (this.length === 0) this.tail = entry;
    this.head = entry;
    ++this.length;
  };

  BufferList.prototype.shift = function shift() {
    if (this.length === 0) return;
    var ret = this.head.data;
    if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
    --this.length;
    return ret;
  };

  BufferList.prototype.clear = function clear() {
    this.head = this.tail = null;
    this.length = 0;
  };

  BufferList.prototype.join = function join(s) {
    if (this.length === 0) return '';
    var p = this.head;
    var ret = '' + p.data;
    while (p = p.next) {
      ret += s + p.data;
    }return ret;
  };

  BufferList.prototype.concat = function concat(n) {
    if (this.length === 0) return Buffer.alloc(0);
    var ret = Buffer.allocUnsafe(n >>> 0);
    var p = this.head;
    var i = 0;
    while (p) {
      copyBuffer(p.data, ret, i);
      i += p.data.length;
      p = p.next;
    }
    return ret;
  };

  return BufferList;
}();

if (util && util.inspect && util.inspect.custom) {
  module.exports.prototype[util.inspect.custom] = function () {
    var obj = util.inspect({ length: this.length });
    return this.constructor.name + ' ' + obj;
  };
}

/***/ }),

/***/ 7049:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


/*<replacement>*/

var pna = __nccwpck_require__(7810);
/*</replacement>*/

// undocumented cb() API, needed for core, not for public API
function destroy(err, cb) {
  var _this = this;

  var readableDestroyed = this._readableState && this._readableState.destroyed;
  var writableDestroyed = this._writableState && this._writableState.destroyed;

  if (readableDestroyed || writableDestroyed) {
    if (cb) {
      cb(err);
    } else if (err) {
      if (!this._writableState) {
        pna.nextTick(emitErrorNT, this, err);
      } else if (!this._writableState.errorEmitted) {
        this._writableState.errorEmitted = true;
        pna.nextTick(emitErrorNT, this, err);
      }
    }

    return this;
  }

  // we set destroyed to true before firing error callbacks in order
  // to make it re-entrance safe in case destroy() is called within callbacks

  if (this._readableState) {
    this._readableState.destroyed = true;
  }

  // if this is a duplex stream mark the writable part as destroyed as well
  if (this._writableState) {
    this._writableState.destroyed = true;
  }

  this._destroy(err || null, function (err) {
    if (!cb && err) {
      if (!_this._writableState) {
        pna.nextTick(emitErrorNT, _this, err);
      } else if (!_this._writableState.errorEmitted) {
        _this._writableState.errorEmitted = true;
        pna.nextTick(emitErrorNT, _this, err);
      }
    } else if (cb) {
      cb(err);
    }
  });

  return this;
}

function undestroy() {
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.reading = false;
    this._readableState.ended = false;
    this._readableState.endEmitted = false;
  }

  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.ended = false;
    this._writableState.ending = false;
    this._writableState.finalCalled = false;
    this._writableState.prefinished = false;
    this._writableState.finished = false;
    this._writableState.errorEmitted = false;
  }
}

function emitErrorNT(self, err) {
  self.emit('error', err);
}

module.exports = {
  destroy: destroy,
  undestroy: undestroy
};

/***/ }),

/***/ 2387:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

module.exports = __nccwpck_require__(2781);


/***/ }),

/***/ 1642:
/***/ ((module, exports, __nccwpck_require__) => {

var Stream = __nccwpck_require__(2781);
if (process.env.READABLE_STREAM === 'disable' && Stream) {
  module.exports = Stream;
  exports = module.exports = Stream.Readable;
  exports.Readable = Stream.Readable;
  exports.Writable = Stream.Writable;
  exports.Duplex = Stream.Duplex;
  exports.Transform = Stream.Transform;
  exports.PassThrough = Stream.PassThrough;
  exports.Stream = Stream;
} else {
  exports = module.exports = __nccwpck_require__(1433);
  exports.Stream = Stream || exports;
  exports.Readable = exports;
  exports.Writable = __nccwpck_require__(6993);
  exports.Duplex = __nccwpck_require__(1359);
  exports.Transform = __nccwpck_require__(4415);
  exports.PassThrough = __nccwpck_require__(1542);
}


/***/ }),

/***/ 1867:
/***/ ((module, exports, __nccwpck_require__) => {

/* eslint-disable node/no-deprecated-api */
var buffer = __nccwpck_require__(4300)
var Buffer = buffer.Buffer

// alternative to using Object.keys for old browsers
function copyProps (src, dst) {
  for (var key in src) {
    dst[key] = src[key]
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer
} else {
  // Copy properties from require('buffer')
  copyProps(buffer, exports)
  exports.Buffer = SafeBuffer
}

function SafeBuffer (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer)

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size)
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
  } else {
    buf.fill(0)
  }
  return buf
}

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return Buffer(size)
}

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return buffer.SlowBuffer(size)
}


/***/ }),

/***/ 2043:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

;(function (sax) { // wrapper for non-node envs
  sax.parser = function (strict, opt) { return new SAXParser(strict, opt) }
  sax.SAXParser = SAXParser
  sax.SAXStream = SAXStream
  sax.createStream = createStream

  // When we pass the MAX_BUFFER_LENGTH position, start checking for buffer overruns.
  // When we check, schedule the next check for MAX_BUFFER_LENGTH - (max(buffer lengths)),
  // since that's the earliest that a buffer overrun could occur.  This way, checks are
  // as rare as required, but as often as necessary to ensure never crossing this bound.
  // Furthermore, buffers are only tested at most once per write(), so passing a very
  // large string into write() might have undesirable effects, but this is manageable by
  // the caller, so it is assumed to be safe.  Thus, a call to write() may, in the extreme
  // edge case, result in creating at most one complete copy of the string passed in.
  // Set to Infinity to have unlimited buffers.
  sax.MAX_BUFFER_LENGTH = 64 * 1024

  var buffers = [
    'comment', 'sgmlDecl', 'textNode', 'tagName', 'doctype',
    'procInstName', 'procInstBody', 'entity', 'attribName',
    'attribValue', 'cdata', 'script'
  ]

  sax.EVENTS = [
    'text',
    'processinginstruction',
    'sgmldeclaration',
    'doctype',
    'comment',
    'opentagstart',
    'attribute',
    'opentag',
    'closetag',
    'opencdata',
    'cdata',
    'closecdata',
    'error',
    'end',
    'ready',
    'script',
    'opennamespace',
    'closenamespace'
  ]

  function SAXParser (strict, opt) {
    if (!(this instanceof SAXParser)) {
      return new SAXParser(strict, opt)
    }

    var parser = this
    clearBuffers(parser)
    parser.q = parser.c = ''
    parser.bufferCheckPosition = sax.MAX_BUFFER_LENGTH
    parser.opt = opt || {}
    parser.opt.lowercase = parser.opt.lowercase || parser.opt.lowercasetags
    parser.looseCase = parser.opt.lowercase ? 'toLowerCase' : 'toUpperCase'
    parser.tags = []
    parser.closed = parser.closedRoot = parser.sawRoot = false
    parser.tag = parser.error = null
    parser.strict = !!strict
    parser.noscript = !!(strict || parser.opt.noscript)
    parser.state = S.BEGIN
    parser.strictEntities = parser.opt.strictEntities
    parser.ENTITIES = parser.strictEntities ? Object.create(sax.XML_ENTITIES) : Object.create(sax.ENTITIES)
    parser.attribList = []

    // namespaces form a prototype chain.
    // it always points at the current tag,
    // which protos to its parent tag.
    if (parser.opt.xmlns) {
      parser.ns = Object.create(rootNS)
    }

    // disallow unquoted attribute values if not otherwise configured
    // and strict mode is true
    if (parser.opt.unquotedAttributeValues === undefined) {
      parser.opt.unquotedAttributeValues = !strict;
    }

    // mostly just for error reporting
    parser.trackPosition = parser.opt.position !== false
    if (parser.trackPosition) {
      parser.position = parser.line = parser.column = 0
    }
    emit(parser, 'onready')
  }

  if (!Object.create) {
    Object.create = function (o) {
      function F () {}
      F.prototype = o
      var newf = new F()
      return newf
    }
  }

  if (!Object.keys) {
    Object.keys = function (o) {
      var a = []
      for (var i in o) if (o.hasOwnProperty(i)) a.push(i)
      return a
    }
  }

  function checkBufferLength (parser) {
    var maxAllowed = Math.max(sax.MAX_BUFFER_LENGTH, 10)
    var maxActual = 0
    for (var i = 0, l = buffers.length; i < l; i++) {
      var len = parser[buffers[i]].length
      if (len > maxAllowed) {
        // Text/cdata nodes can get big, and since they're buffered,
        // we can get here under normal conditions.
        // Avoid issues by emitting the text node now,
        // so at least it won't get any bigger.
        switch (buffers[i]) {
          case 'textNode':
            closeText(parser)
            break

          case 'cdata':
            emitNode(parser, 'oncdata', parser.cdata)
            parser.cdata = ''
            break

          case 'script':
            emitNode(parser, 'onscript', parser.script)
            parser.script = ''
            break

          default:
            error(parser, 'Max buffer length exceeded: ' + buffers[i])
        }
      }
      maxActual = Math.max(maxActual, len)
    }
    // schedule the next check for the earliest possible buffer overrun.
    var m = sax.MAX_BUFFER_LENGTH - maxActual
    parser.bufferCheckPosition = m + parser.position
  }

  function clearBuffers (parser) {
    for (var i = 0, l = buffers.length; i < l; i++) {
      parser[buffers[i]] = ''
    }
  }

  function flushBuffers (parser) {
    closeText(parser)
    if (parser.cdata !== '') {
      emitNode(parser, 'oncdata', parser.cdata)
      parser.cdata = ''
    }
    if (parser.script !== '') {
      emitNode(parser, 'onscript', parser.script)
      parser.script = ''
    }
  }

  SAXParser.prototype = {
    end: function () { end(this) },
    write: write,
    resume: function () { this.error = null; return this },
    close: function () { return this.write(null) },
    flush: function () { flushBuffers(this) }
  }

  var Stream
  try {
    Stream = (__nccwpck_require__(2781).Stream)
  } catch (ex) {
    Stream = function () {}
  }
  if (!Stream) Stream = function () {}

  var streamWraps = sax.EVENTS.filter(function (ev) {
    return ev !== 'error' && ev !== 'end'
  })

  function createStream (strict, opt) {
    return new SAXStream(strict, opt)
  }

  function SAXStream (strict, opt) {
    if (!(this instanceof SAXStream)) {
      return new SAXStream(strict, opt)
    }

    Stream.apply(this)

    this._parser = new SAXParser(strict, opt)
    this.writable = true
    this.readable = true

    var me = this

    this._parser.onend = function () {
      me.emit('end')
    }

    this._parser.onerror = function (er) {
      me.emit('error', er)

      // if didn't throw, then means error was handled.
      // go ahead and clear error, so we can write again.
      me._parser.error = null
    }

    this._decoder = null

    streamWraps.forEach(function (ev) {
      Object.defineProperty(me, 'on' + ev, {
        get: function () {
          return me._parser['on' + ev]
        },
        set: function (h) {
          if (!h) {
            me.removeAllListeners(ev)
            me._parser['on' + ev] = h
            return h
          }
          me.on(ev, h)
        },
        enumerable: true,
        configurable: false
      })
    })
  }

  SAXStream.prototype = Object.create(Stream.prototype, {
    constructor: {
      value: SAXStream
    }
  })

  SAXStream.prototype.write = function (data) {
    if (typeof Buffer === 'function' &&
      typeof Buffer.isBuffer === 'function' &&
      Buffer.isBuffer(data)) {
      if (!this._decoder) {
        var SD = (__nccwpck_require__(1576).StringDecoder)
        this._decoder = new SD('utf8')
      }
      data = this._decoder.write(data)
    }

    this._parser.write(data.toString())
    this.emit('data', data)
    return true
  }

  SAXStream.prototype.end = function (chunk) {
    if (chunk && chunk.length) {
      this.write(chunk)
    }
    this._parser.end()
    return true
  }

  SAXStream.prototype.on = function (ev, handler) {
    var me = this
    if (!me._parser['on' + ev] && streamWraps.indexOf(ev) !== -1) {
      me._parser['on' + ev] = function () {
        var args = arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments)
        args.splice(0, 0, ev)
        me.emit.apply(me, args)
      }
    }

    return Stream.prototype.on.call(me, ev, handler)
  }

  // this really needs to be replaced with character classes.
  // XML allows all manner of ridiculous numbers and digits.
  var CDATA = '[CDATA['
  var DOCTYPE = 'DOCTYPE'
  var XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'
  var XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/'
  var rootNS = { xml: XML_NAMESPACE, xmlns: XMLNS_NAMESPACE }

  // http://www.w3.org/TR/REC-xml/#NT-NameStartChar
  // This implementation works on strings, a single character at a time
  // as such, it cannot ever support astral-plane characters (10000-EFFFF)
  // without a significant breaking change to either this  parser, or the
  // JavaScript language.  Implementation of an emoji-capable xml parser
  // is left as an exercise for the reader.
  var nameStart = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/

  var nameBody = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/

  var entityStart = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/
  var entityBody = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/

  function isWhitespace (c) {
    return c === ' ' || c === '\n' || c === '\r' || c === '\t'
  }

  function isQuote (c) {
    return c === '"' || c === '\''
  }

  function isAttribEnd (c) {
    return c === '>' || isWhitespace(c)
  }

  function isMatch (regex, c) {
    return regex.test(c)
  }

  function notMatch (regex, c) {
    return !isMatch(regex, c)
  }

  var S = 0
  sax.STATE = {
    BEGIN: S++, // leading byte order mark or whitespace
    BEGIN_WHITESPACE: S++, // leading whitespace
    TEXT: S++, // general stuff
    TEXT_ENTITY: S++, // &amp and such.
    OPEN_WAKA: S++, // <
    SGML_DECL: S++, // <!BLARG
    SGML_DECL_QUOTED: S++, // <!BLARG foo "bar
    DOCTYPE: S++, // <!DOCTYPE
    DOCTYPE_QUOTED: S++, // <!DOCTYPE "//blah
    DOCTYPE_DTD: S++, // <!DOCTYPE "//blah" [ ...
    DOCTYPE_DTD_QUOTED: S++, // <!DOCTYPE "//blah" [ "foo
    COMMENT_STARTING: S++, // <!-
    COMMENT: S++, // <!--
    COMMENT_ENDING: S++, // <!-- blah -
    COMMENT_ENDED: S++, // <!-- blah --
    CDATA: S++, // <![CDATA[ something
    CDATA_ENDING: S++, // ]
    CDATA_ENDING_2: S++, // ]]
    PROC_INST: S++, // <?hi
    PROC_INST_BODY: S++, // <?hi there
    PROC_INST_ENDING: S++, // <?hi "there" ?
    OPEN_TAG: S++, // <strong
    OPEN_TAG_SLASH: S++, // <strong /
    ATTRIB: S++, // <a
    ATTRIB_NAME: S++, // <a foo
    ATTRIB_NAME_SAW_WHITE: S++, // <a foo _
    ATTRIB_VALUE: S++, // <a foo=
    ATTRIB_VALUE_QUOTED: S++, // <a foo="bar
    ATTRIB_VALUE_CLOSED: S++, // <a foo="bar"
    ATTRIB_VALUE_UNQUOTED: S++, // <a foo=bar
    ATTRIB_VALUE_ENTITY_Q: S++, // <foo bar="&quot;"
    ATTRIB_VALUE_ENTITY_U: S++, // <foo bar=&quot
    CLOSE_TAG: S++, // </a
    CLOSE_TAG_SAW_WHITE: S++, // </a   >
    SCRIPT: S++, // <script> ...
    SCRIPT_ENDING: S++ // <script> ... <
  }

  sax.XML_ENTITIES = {
    'amp': '&',
    'gt': '>',
    'lt': '<',
    'quot': '"',
    'apos': "'"
  }

  sax.ENTITIES = {
    'amp': '&',
    'gt': '>',
    'lt': '<',
    'quot': '"',
    'apos': "'",
    'AElig': 198,
    'Aacute': 193,
    'Acirc': 194,
    'Agrave': 192,
    'Aring': 197,
    'Atilde': 195,
    'Auml': 196,
    'Ccedil': 199,
    'ETH': 208,
    'Eacute': 201,
    'Ecirc': 202,
    'Egrave': 200,
    'Euml': 203,
    'Iacute': 205,
    'Icirc': 206,
    'Igrave': 204,
    'Iuml': 207,
    'Ntilde': 209,
    'Oacute': 211,
    'Ocirc': 212,
    'Ograve': 210,
    'Oslash': 216,
    'Otilde': 213,
    'Ouml': 214,
    'THORN': 222,
    'Uacute': 218,
    'Ucirc': 219,
    'Ugrave': 217,
    'Uuml': 220,
    'Yacute': 221,
    'aacute': 225,
    'acirc': 226,
    'aelig': 230,
    'agrave': 224,
    'aring': 229,
    'atilde': 227,
    'auml': 228,
    'ccedil': 231,
    'eacute': 233,
    'ecirc': 234,
    'egrave': 232,
    'eth': 240,
    'euml': 235,
    'iacute': 237,
    'icirc': 238,
    'igrave': 236,
    'iuml': 239,
    'ntilde': 241,
    'oacute': 243,
    'ocirc': 244,
    'ograve': 242,
    'oslash': 248,
    'otilde': 245,
    'ouml': 246,
    'szlig': 223,
    'thorn': 254,
    'uacute': 250,
    'ucirc': 251,
    'ugrave': 249,
    'uuml': 252,
    'yacute': 253,
    'yuml': 255,
    'copy': 169,
    'reg': 174,
    'nbsp': 160,
    'iexcl': 161,
    'cent': 162,
    'pound': 163,
    'curren': 164,
    'yen': 165,
    'brvbar': 166,
    'sect': 167,
    'uml': 168,
    'ordf': 170,
    'laquo': 171,
    'not': 172,
    'shy': 173,
    'macr': 175,
    'deg': 176,
    'plusmn': 177,
    'sup1': 185,
    'sup2': 178,
    'sup3': 179,
    'acute': 180,
    'micro': 181,
    'para': 182,
    'middot': 183,
    'cedil': 184,
    'ordm': 186,
    'raquo': 187,
    'frac14': 188,
    'frac12': 189,
    'frac34': 190,
    'iquest': 191,
    'times': 215,
    'divide': 247,
    'OElig': 338,
    'oelig': 339,
    'Scaron': 352,
    'scaron': 353,
    'Yuml': 376,
    'fnof': 402,
    'circ': 710,
    'tilde': 732,
    'Alpha': 913,
    'Beta': 914,
    'Gamma': 915,
    'Delta': 916,
    'Epsilon': 917,
    'Zeta': 918,
    'Eta': 919,
    'Theta': 920,
    'Iota': 921,
    'Kappa': 922,
    'Lambda': 923,
    'Mu': 924,
    'Nu': 925,
    'Xi': 926,
    'Omicron': 927,
    'Pi': 928,
    'Rho': 929,
    'Sigma': 931,
    'Tau': 932,
    'Upsilon': 933,
    'Phi': 934,
    'Chi': 935,
    'Psi': 936,
    'Omega': 937,
    'alpha': 945,
    'beta': 946,
    'gamma': 947,
    'delta': 948,
    'epsilon': 949,
    'zeta': 950,
    'eta': 951,
    'theta': 952,
    'iota': 953,
    'kappa': 954,
    'lambda': 955,
    'mu': 956,
    'nu': 957,
    'xi': 958,
    'omicron': 959,
    'pi': 960,
    'rho': 961,
    'sigmaf': 962,
    'sigma': 963,
    'tau': 964,
    'upsilon': 965,
    'phi': 966,
    'chi': 967,
    'psi': 968,
    'omega': 969,
    'thetasym': 977,
    'upsih': 978,
    'piv': 982,
    'ensp': 8194,
    'emsp': 8195,
    'thinsp': 8201,
    'zwnj': 8204,
    'zwj': 8205,
    'lrm': 8206,
    'rlm': 8207,
    'ndash': 8211,
    'mdash': 8212,
    'lsquo': 8216,
    'rsquo': 8217,
    'sbquo': 8218,
    'ldquo': 8220,
    'rdquo': 8221,
    'bdquo': 8222,
    'dagger': 8224,
    'Dagger': 8225,
    'bull': 8226,
    'hellip': 8230,
    'permil': 8240,
    'prime': 8242,
    'Prime': 8243,
    'lsaquo': 8249,
    'rsaquo': 8250,
    'oline': 8254,
    'frasl': 8260,
    'euro': 8364,
    'image': 8465,
    'weierp': 8472,
    'real': 8476,
    'trade': 8482,
    'alefsym': 8501,
    'larr': 8592,
    'uarr': 8593,
    'rarr': 8594,
    'darr': 8595,
    'harr': 8596,
    'crarr': 8629,
    'lArr': 8656,
    'uArr': 8657,
    'rArr': 8658,
    'dArr': 8659,
    'hArr': 8660,
    'forall': 8704,
    'part': 8706,
    'exist': 8707,
    'empty': 8709,
    'nabla': 8711,
    'isin': 8712,
    'notin': 8713,
    'ni': 8715,
    'prod': 8719,
    'sum': 8721,
    'minus': 8722,
    'lowast': 8727,
    'radic': 8730,
    'prop': 8733,
    'infin': 8734,
    'ang': 8736,
    'and': 8743,
    'or': 8744,
    'cap': 8745,
    'cup': 8746,
    'int': 8747,
    'there4': 8756,
    'sim': 8764,
    'cong': 8773,
    'asymp': 8776,
    'ne': 8800,
    'equiv': 8801,
    'le': 8804,
    'ge': 8805,
    'sub': 8834,
    'sup': 8835,
    'nsub': 8836,
    'sube': 8838,
    'supe': 8839,
    'oplus': 8853,
    'otimes': 8855,
    'perp': 8869,
    'sdot': 8901,
    'lceil': 8968,
    'rceil': 8969,
    'lfloor': 8970,
    'rfloor': 8971,
    'lang': 9001,
    'rang': 9002,
    'loz': 9674,
    'spades': 9824,
    'clubs': 9827,
    'hearts': 9829,
    'diams': 9830
  }

  Object.keys(sax.ENTITIES).forEach(function (key) {
    var e = sax.ENTITIES[key]
    var s = typeof e === 'number' ? String.fromCharCode(e) : e
    sax.ENTITIES[key] = s
  })

  for (var s in sax.STATE) {
    sax.STATE[sax.STATE[s]] = s
  }

  // shorthand
  S = sax.STATE

  function emit (parser, event, data) {
    parser[event] && parser[event](data)
  }

  function emitNode (parser, nodeType, data) {
    if (parser.textNode) closeText(parser)
    emit(parser, nodeType, data)
  }

  function closeText (parser) {
    parser.textNode = textopts(parser.opt, parser.textNode)
    if (parser.textNode) emit(parser, 'ontext', parser.textNode)
    parser.textNode = ''
  }

  function textopts (opt, text) {
    if (opt.trim) text = text.trim()
    if (opt.normalize) text = text.replace(/\s+/g, ' ')
    return text
  }

  function error (parser, er) {
    closeText(parser)
    if (parser.trackPosition) {
      er += '\nLine: ' + parser.line +
        '\nColumn: ' + parser.column +
        '\nChar: ' + parser.c
    }
    er = new Error(er)
    parser.error = er
    emit(parser, 'onerror', er)
    return parser
  }

  function end (parser) {
    if (parser.sawRoot && !parser.closedRoot) strictFail(parser, 'Unclosed root tag')
    if ((parser.state !== S.BEGIN) &&
      (parser.state !== S.BEGIN_WHITESPACE) &&
      (parser.state !== S.TEXT)) {
      error(parser, 'Unexpected end')
    }
    closeText(parser)
    parser.c = ''
    parser.closed = true
    emit(parser, 'onend')
    SAXParser.call(parser, parser.strict, parser.opt)
    return parser
  }

  function strictFail (parser, message) {
    if (typeof parser !== 'object' || !(parser instanceof SAXParser)) {
      throw new Error('bad call to strictFail')
    }
    if (parser.strict) {
      error(parser, message)
    }
  }

  function newTag (parser) {
    if (!parser.strict) parser.tagName = parser.tagName[parser.looseCase]()
    var parent = parser.tags[parser.tags.length - 1] || parser
    var tag = parser.tag = { name: parser.tagName, attributes: {} }

    // will be overridden if tag contails an xmlns="foo" or xmlns:foo="bar"
    if (parser.opt.xmlns) {
      tag.ns = parent.ns
    }
    parser.attribList.length = 0
    emitNode(parser, 'onopentagstart', tag)
  }

  function qname (name, attribute) {
    var i = name.indexOf(':')
    var qualName = i < 0 ? [ '', name ] : name.split(':')
    var prefix = qualName[0]
    var local = qualName[1]

    // <x "xmlns"="http://foo">
    if (attribute && name === 'xmlns') {
      prefix = 'xmlns'
      local = ''
    }

    return { prefix: prefix, local: local }
  }

  function attrib (parser) {
    if (!parser.strict) {
      parser.attribName = parser.attribName[parser.looseCase]()
    }

    if (parser.attribList.indexOf(parser.attribName) !== -1 ||
      parser.tag.attributes.hasOwnProperty(parser.attribName)) {
      parser.attribName = parser.attribValue = ''
      return
    }

    if (parser.opt.xmlns) {
      var qn = qname(parser.attribName, true)
      var prefix = qn.prefix
      var local = qn.local

      if (prefix === 'xmlns') {
        // namespace binding attribute. push the binding into scope
        if (local === 'xml' && parser.attribValue !== XML_NAMESPACE) {
          strictFail(parser,
            'xml: prefix must be bound to ' + XML_NAMESPACE + '\n' +
            'Actual: ' + parser.attribValue)
        } else if (local === 'xmlns' && parser.attribValue !== XMLNS_NAMESPACE) {
          strictFail(parser,
            'xmlns: prefix must be bound to ' + XMLNS_NAMESPACE + '\n' +
            'Actual: ' + parser.attribValue)
        } else {
          var tag = parser.tag
          var parent = parser.tags[parser.tags.length - 1] || parser
          if (tag.ns === parent.ns) {
            tag.ns = Object.create(parent.ns)
          }
          tag.ns[local] = parser.attribValue
        }
      }

      // defer onattribute events until all attributes have been seen
      // so any new bindings can take effect. preserve attribute order
      // so deferred events can be emitted in document order
      parser.attribList.push([parser.attribName, parser.attribValue])
    } else {
      // in non-xmlns mode, we can emit the event right away
      parser.tag.attributes[parser.attribName] = parser.attribValue
      emitNode(parser, 'onattribute', {
        name: parser.attribName,
        value: parser.attribValue
      })
    }

    parser.attribName = parser.attribValue = ''
  }

  function openTag (parser, selfClosing) {
    if (parser.opt.xmlns) {
      // emit namespace binding events
      var tag = parser.tag

      // add namespace info to tag
      var qn = qname(parser.tagName)
      tag.prefix = qn.prefix
      tag.local = qn.local
      tag.uri = tag.ns[qn.prefix] || ''

      if (tag.prefix && !tag.uri) {
        strictFail(parser, 'Unbound namespace prefix: ' +
          JSON.stringify(parser.tagName))
        tag.uri = qn.prefix
      }

      var parent = parser.tags[parser.tags.length - 1] || parser
      if (tag.ns && parent.ns !== tag.ns) {
        Object.keys(tag.ns).forEach(function (p) {
          emitNode(parser, 'onopennamespace', {
            prefix: p,
            uri: tag.ns[p]
          })
        })
      }

      // handle deferred onattribute events
      // Note: do not apply default ns to attributes:
      //   http://www.w3.org/TR/REC-xml-names/#defaulting
      for (var i = 0, l = parser.attribList.length; i < l; i++) {
        var nv = parser.attribList[i]
        var name = nv[0]
        var value = nv[1]
        var qualName = qname(name, true)
        var prefix = qualName.prefix
        var local = qualName.local
        var uri = prefix === '' ? '' : (tag.ns[prefix] || '')
        var a = {
          name: name,
          value: value,
          prefix: prefix,
          local: local,
          uri: uri
        }

        // if there's any attributes with an undefined namespace,
        // then fail on them now.
        if (prefix && prefix !== 'xmlns' && !uri) {
          strictFail(parser, 'Unbound namespace prefix: ' +
            JSON.stringify(prefix))
          a.uri = prefix
        }
        parser.tag.attributes[name] = a
        emitNode(parser, 'onattribute', a)
      }
      parser.attribList.length = 0
    }

    parser.tag.isSelfClosing = !!selfClosing

    // process the tag
    parser.sawRoot = true
    parser.tags.push(parser.tag)
    emitNode(parser, 'onopentag', parser.tag)
    if (!selfClosing) {
      // special case for <script> in non-strict mode.
      if (!parser.noscript && parser.tagName.toLowerCase() === 'script') {
        parser.state = S.SCRIPT
      } else {
        parser.state = S.TEXT
      }
      parser.tag = null
      parser.tagName = ''
    }
    parser.attribName = parser.attribValue = ''
    parser.attribList.length = 0
  }

  function closeTag (parser) {
    if (!parser.tagName) {
      strictFail(parser, 'Weird empty close tag.')
      parser.textNode += '</>'
      parser.state = S.TEXT
      return
    }

    if (parser.script) {
      if (parser.tagName !== 'script') {
        parser.script += '</' + parser.tagName + '>'
        parser.tagName = ''
        parser.state = S.SCRIPT
        return
      }
      emitNode(parser, 'onscript', parser.script)
      parser.script = ''
    }

    // first make sure that the closing tag actually exists.
    // <a><b></c></b></a> will close everything, otherwise.
    var t = parser.tags.length
    var tagName = parser.tagName
    if (!parser.strict) {
      tagName = tagName[parser.looseCase]()
    }
    var closeTo = tagName
    while (t--) {
      var close = parser.tags[t]
      if (close.name !== closeTo) {
        // fail the first time in strict mode
        strictFail(parser, 'Unexpected close tag')
      } else {
        break
      }
    }

    // didn't find it.  we already failed for strict, so just abort.
    if (t < 0) {
      strictFail(parser, 'Unmatched closing tag: ' + parser.tagName)
      parser.textNode += '</' + parser.tagName + '>'
      parser.state = S.TEXT
      return
    }
    parser.tagName = tagName
    var s = parser.tags.length
    while (s-- > t) {
      var tag = parser.tag = parser.tags.pop()
      parser.tagName = parser.tag.name
      emitNode(parser, 'onclosetag', parser.tagName)

      var x = {}
      for (var i in tag.ns) {
        x[i] = tag.ns[i]
      }

      var parent = parser.tags[parser.tags.length - 1] || parser
      if (parser.opt.xmlns && tag.ns !== parent.ns) {
        // remove namespace bindings introduced by tag
        Object.keys(tag.ns).forEach(function (p) {
          var n = tag.ns[p]
          emitNode(parser, 'onclosenamespace', { prefix: p, uri: n })
        })
      }
    }
    if (t === 0) parser.closedRoot = true
    parser.tagName = parser.attribValue = parser.attribName = ''
    parser.attribList.length = 0
    parser.state = S.TEXT
  }

  function parseEntity (parser) {
    var entity = parser.entity
    var entityLC = entity.toLowerCase()
    var num
    var numStr = ''

    if (parser.ENTITIES[entity]) {
      return parser.ENTITIES[entity]
    }
    if (parser.ENTITIES[entityLC]) {
      return parser.ENTITIES[entityLC]
    }
    entity = entityLC
    if (entity.charAt(0) === '#') {
      if (entity.charAt(1) === 'x') {
        entity = entity.slice(2)
        num = parseInt(entity, 16)
        numStr = num.toString(16)
      } else {
        entity = entity.slice(1)
        num = parseInt(entity, 10)
        numStr = num.toString(10)
      }
    }
    entity = entity.replace(/^0+/, '')
    if (isNaN(num) || numStr.toLowerCase() !== entity) {
      strictFail(parser, 'Invalid character entity')
      return '&' + parser.entity + ';'
    }

    return String.fromCodePoint(num)
  }

  function beginWhiteSpace (parser, c) {
    if (c === '<') {
      parser.state = S.OPEN_WAKA
      parser.startTagPosition = parser.position
    } else if (!isWhitespace(c)) {
      // have to process this as a text node.
      // weird, but happens.
      strictFail(parser, 'Non-whitespace before first tag.')
      parser.textNode = c
      parser.state = S.TEXT
    }
  }

  function charAt (chunk, i) {
    var result = ''
    if (i < chunk.length) {
      result = chunk.charAt(i)
    }
    return result
  }

  function write (chunk) {
    var parser = this
    if (this.error) {
      throw this.error
    }
    if (parser.closed) {
      return error(parser,
        'Cannot write after close. Assign an onready handler.')
    }
    if (chunk === null) {
      return end(parser)
    }
    if (typeof chunk === 'object') {
      chunk = chunk.toString()
    }
    var i = 0
    var c = ''
    while (true) {
      c = charAt(chunk, i++)
      parser.c = c

      if (!c) {
        break
      }

      if (parser.trackPosition) {
        parser.position++
        if (c === '\n') {
          parser.line++
          parser.column = 0
        } else {
          parser.column++
        }
      }

      switch (parser.state) {
        case S.BEGIN:
          parser.state = S.BEGIN_WHITESPACE
          if (c === '\uFEFF') {
            continue
          }
          beginWhiteSpace(parser, c)
          continue

        case S.BEGIN_WHITESPACE:
          beginWhiteSpace(parser, c)
          continue

        case S.TEXT:
          if (parser.sawRoot && !parser.closedRoot) {
            var starti = i - 1
            while (c && c !== '<' && c !== '&') {
              c = charAt(chunk, i++)
              if (c && parser.trackPosition) {
                parser.position++
                if (c === '\n') {
                  parser.line++
                  parser.column = 0
                } else {
                  parser.column++
                }
              }
            }
            parser.textNode += chunk.substring(starti, i - 1)
          }
          if (c === '<' && !(parser.sawRoot && parser.closedRoot && !parser.strict)) {
            parser.state = S.OPEN_WAKA
            parser.startTagPosition = parser.position
          } else {
            if (!isWhitespace(c) && (!parser.sawRoot || parser.closedRoot)) {
              strictFail(parser, 'Text data outside of root node.')
            }
            if (c === '&') {
              parser.state = S.TEXT_ENTITY
            } else {
              parser.textNode += c
            }
          }
          continue

        case S.SCRIPT:
          // only non-strict
          if (c === '<') {
            parser.state = S.SCRIPT_ENDING
          } else {
            parser.script += c
          }
          continue

        case S.SCRIPT_ENDING:
          if (c === '/') {
            parser.state = S.CLOSE_TAG
          } else {
            parser.script += '<' + c
            parser.state = S.SCRIPT
          }
          continue

        case S.OPEN_WAKA:
          // either a /, ?, !, or text is coming next.
          if (c === '!') {
            parser.state = S.SGML_DECL
            parser.sgmlDecl = ''
          } else if (isWhitespace(c)) {
            // wait for it...
          } else if (isMatch(nameStart, c)) {
            parser.state = S.OPEN_TAG
            parser.tagName = c
          } else if (c === '/') {
            parser.state = S.CLOSE_TAG
            parser.tagName = ''
          } else if (c === '?') {
            parser.state = S.PROC_INST
            parser.procInstName = parser.procInstBody = ''
          } else {
            strictFail(parser, 'Unencoded <')
            // if there was some whitespace, then add that in.
            if (parser.startTagPosition + 1 < parser.position) {
              var pad = parser.position - parser.startTagPosition
              c = new Array(pad).join(' ') + c
            }
            parser.textNode += '<' + c
            parser.state = S.TEXT
          }
          continue

        case S.SGML_DECL:
          if (parser.sgmlDecl + c === '--') {
            parser.state = S.COMMENT
            parser.comment = ''
            parser.sgmlDecl = ''
            continue;
          }

          if (parser.doctype && parser.doctype !== true && parser.sgmlDecl) {
            parser.state = S.DOCTYPE_DTD
            parser.doctype += '<!' + parser.sgmlDecl + c
            parser.sgmlDecl = ''
          } else if ((parser.sgmlDecl + c).toUpperCase() === CDATA) {
            emitNode(parser, 'onopencdata')
            parser.state = S.CDATA
            parser.sgmlDecl = ''
            parser.cdata = ''
          } else if ((parser.sgmlDecl + c).toUpperCase() === DOCTYPE) {
            parser.state = S.DOCTYPE
            if (parser.doctype || parser.sawRoot) {
              strictFail(parser,
                'Inappropriately located doctype declaration')
            }
            parser.doctype = ''
            parser.sgmlDecl = ''
          } else if (c === '>') {
            emitNode(parser, 'onsgmldeclaration', parser.sgmlDecl)
            parser.sgmlDecl = ''
            parser.state = S.TEXT
          } else if (isQuote(c)) {
            parser.state = S.SGML_DECL_QUOTED
            parser.sgmlDecl += c
          } else {
            parser.sgmlDecl += c
          }
          continue

        case S.SGML_DECL_QUOTED:
          if (c === parser.q) {
            parser.state = S.SGML_DECL
            parser.q = ''
          }
          parser.sgmlDecl += c
          continue

        case S.DOCTYPE:
          if (c === '>') {
            parser.state = S.TEXT
            emitNode(parser, 'ondoctype', parser.doctype)
            parser.doctype = true // just remember that we saw it.
          } else {
            parser.doctype += c
            if (c === '[') {
              parser.state = S.DOCTYPE_DTD
            } else if (isQuote(c)) {
              parser.state = S.DOCTYPE_QUOTED
              parser.q = c
            }
          }
          continue

        case S.DOCTYPE_QUOTED:
          parser.doctype += c
          if (c === parser.q) {
            parser.q = ''
            parser.state = S.DOCTYPE
          }
          continue

        case S.DOCTYPE_DTD:
          if (c === ']') {
            parser.doctype += c
            parser.state = S.DOCTYPE
          } else if (c === '<') {
            parser.state = S.OPEN_WAKA
            parser.startTagPosition = parser.position
          } else if (isQuote(c)) {
            parser.doctype += c
            parser.state = S.DOCTYPE_DTD_QUOTED
            parser.q = c
          } else {
            parser.doctype += c
          }
          continue

        case S.DOCTYPE_DTD_QUOTED:
          parser.doctype += c
          if (c === parser.q) {
            parser.state = S.DOCTYPE_DTD
            parser.q = ''
          }
          continue

        case S.COMMENT:
          if (c === '-') {
            parser.state = S.COMMENT_ENDING
          } else {
            parser.comment += c
          }
          continue

        case S.COMMENT_ENDING:
          if (c === '-') {
            parser.state = S.COMMENT_ENDED
            parser.comment = textopts(parser.opt, parser.comment)
            if (parser.comment) {
              emitNode(parser, 'oncomment', parser.comment)
            }
            parser.comment = ''
          } else {
            parser.comment += '-' + c
            parser.state = S.COMMENT
          }
          continue

        case S.COMMENT_ENDED:
          if (c !== '>') {
            strictFail(parser, 'Malformed comment')
            // allow <!-- blah -- bloo --> in non-strict mode,
            // which is a comment of " blah -- bloo "
            parser.comment += '--' + c
            parser.state = S.COMMENT
          } else if (parser.doctype && parser.doctype !== true) {
            parser.state = S.DOCTYPE_DTD
          } else {
            parser.state = S.TEXT
          }
          continue

        case S.CDATA:
          if (c === ']') {
            parser.state = S.CDATA_ENDING
          } else {
            parser.cdata += c
          }
          continue

        case S.CDATA_ENDING:
          if (c === ']') {
            parser.state = S.CDATA_ENDING_2
          } else {
            parser.cdata += ']' + c
            parser.state = S.CDATA
          }
          continue

        case S.CDATA_ENDING_2:
          if (c === '>') {
            if (parser.cdata) {
              emitNode(parser, 'oncdata', parser.cdata)
            }
            emitNode(parser, 'onclosecdata')
            parser.cdata = ''
            parser.state = S.TEXT
          } else if (c === ']') {
            parser.cdata += ']'
          } else {
            parser.cdata += ']]' + c
            parser.state = S.CDATA
          }
          continue

        case S.PROC_INST:
          if (c === '?') {
            parser.state = S.PROC_INST_ENDING
          } else if (isWhitespace(c)) {
            parser.state = S.PROC_INST_BODY
          } else {
            parser.procInstName += c
          }
          continue

        case S.PROC_INST_BODY:
          if (!parser.procInstBody && isWhitespace(c)) {
            continue
          } else if (c === '?') {
            parser.state = S.PROC_INST_ENDING
          } else {
            parser.procInstBody += c
          }
          continue

        case S.PROC_INST_ENDING:
          if (c === '>') {
            emitNode(parser, 'onprocessinginstruction', {
              name: parser.procInstName,
              body: parser.procInstBody
            })
            parser.procInstName = parser.procInstBody = ''
            parser.state = S.TEXT
          } else {
            parser.procInstBody += '?' + c
            parser.state = S.PROC_INST_BODY
          }
          continue

        case S.OPEN_TAG:
          if (isMatch(nameBody, c)) {
            parser.tagName += c
          } else {
            newTag(parser)
            if (c === '>') {
              openTag(parser)
            } else if (c === '/') {
              parser.state = S.OPEN_TAG_SLASH
            } else {
              if (!isWhitespace(c)) {
                strictFail(parser, 'Invalid character in tag name')
              }
              parser.state = S.ATTRIB
            }
          }
          continue

        case S.OPEN_TAG_SLASH:
          if (c === '>') {
            openTag(parser, true)
            closeTag(parser)
          } else {
            strictFail(parser, 'Forward-slash in opening tag not followed by >')
            parser.state = S.ATTRIB
          }
          continue

        case S.ATTRIB:
          // haven't read the attribute name yet.
          if (isWhitespace(c)) {
            continue
          } else if (c === '>') {
            openTag(parser)
          } else if (c === '/') {
            parser.state = S.OPEN_TAG_SLASH
          } else if (isMatch(nameStart, c)) {
            parser.attribName = c
            parser.attribValue = ''
            parser.state = S.ATTRIB_NAME
          } else {
            strictFail(parser, 'Invalid attribute name')
          }
          continue

        case S.ATTRIB_NAME:
          if (c === '=') {
            parser.state = S.ATTRIB_VALUE
          } else if (c === '>') {
            strictFail(parser, 'Attribute without value')
            parser.attribValue = parser.attribName
            attrib(parser)
            openTag(parser)
          } else if (isWhitespace(c)) {
            parser.state = S.ATTRIB_NAME_SAW_WHITE
          } else if (isMatch(nameBody, c)) {
            parser.attribName += c
          } else {
            strictFail(parser, 'Invalid attribute name')
          }
          continue

        case S.ATTRIB_NAME_SAW_WHITE:
          if (c === '=') {
            parser.state = S.ATTRIB_VALUE
          } else if (isWhitespace(c)) {
            continue
          } else {
            strictFail(parser, 'Attribute without value')
            parser.tag.attributes[parser.attribName] = ''
            parser.attribValue = ''
            emitNode(parser, 'onattribute', {
              name: parser.attribName,
              value: ''
            })
            parser.attribName = ''
            if (c === '>') {
              openTag(parser)
            } else if (isMatch(nameStart, c)) {
              parser.attribName = c
              parser.state = S.ATTRIB_NAME
            } else {
              strictFail(parser, 'Invalid attribute name')
              parser.state = S.ATTRIB
            }
          }
          continue

        case S.ATTRIB_VALUE:
          if (isWhitespace(c)) {
            continue
          } else if (isQuote(c)) {
            parser.q = c
            parser.state = S.ATTRIB_VALUE_QUOTED
          } else {
            if (!parser.opt.unquotedAttributeValues) {
              error(parser, 'Unquoted attribute value')
            }
            parser.state = S.ATTRIB_VALUE_UNQUOTED
            parser.attribValue = c
          }
          continue

        case S.ATTRIB_VALUE_QUOTED:
          if (c !== parser.q) {
            if (c === '&') {
              parser.state = S.ATTRIB_VALUE_ENTITY_Q
            } else {
              parser.attribValue += c
            }
            continue
          }
          attrib(parser)
          parser.q = ''
          parser.state = S.ATTRIB_VALUE_CLOSED
          continue

        case S.ATTRIB_VALUE_CLOSED:
          if (isWhitespace(c)) {
            parser.state = S.ATTRIB
          } else if (c === '>') {
            openTag(parser)
          } else if (c === '/') {
            parser.state = S.OPEN_TAG_SLASH
          } else if (isMatch(nameStart, c)) {
            strictFail(parser, 'No whitespace between attributes')
            parser.attribName = c
            parser.attribValue = ''
            parser.state = S.ATTRIB_NAME
          } else {
            strictFail(parser, 'Invalid attribute name')
          }
          continue

        case S.ATTRIB_VALUE_UNQUOTED:
          if (!isAttribEnd(c)) {
            if (c === '&') {
              parser.state = S.ATTRIB_VALUE_ENTITY_U
            } else {
              parser.attribValue += c
            }
            continue
          }
          attrib(parser)
          if (c === '>') {
            openTag(parser)
          } else {
            parser.state = S.ATTRIB
          }
          continue

        case S.CLOSE_TAG:
          if (!parser.tagName) {
            if (isWhitespace(c)) {
              continue
            } else if (notMatch(nameStart, c)) {
              if (parser.script) {
                parser.script += '</' + c
                parser.state = S.SCRIPT
              } else {
                strictFail(parser, 'Invalid tagname in closing tag.')
              }
            } else {
              parser.tagName = c
            }
          } else if (c === '>') {
            closeTag(parser)
          } else if (isMatch(nameBody, c)) {
            parser.tagName += c
          } else if (parser.script) {
            parser.script += '</' + parser.tagName
            parser.tagName = ''
            parser.state = S.SCRIPT
          } else {
            if (!isWhitespace(c)) {
              strictFail(parser, 'Invalid tagname in closing tag')
            }
            parser.state = S.CLOSE_TAG_SAW_WHITE
          }
          continue

        case S.CLOSE_TAG_SAW_WHITE:
          if (isWhitespace(c)) {
            continue
          }
          if (c === '>') {
            closeTag(parser)
          } else {
            strictFail(parser, 'Invalid characters in closing tag')
          }
          continue

        case S.TEXT_ENTITY:
        case S.ATTRIB_VALUE_ENTITY_Q:
        case S.ATTRIB_VALUE_ENTITY_U:
          var returnState
          var buffer
          switch (parser.state) {
            case S.TEXT_ENTITY:
              returnState = S.TEXT
              buffer = 'textNode'
              break

            case S.ATTRIB_VALUE_ENTITY_Q:
              returnState = S.ATTRIB_VALUE_QUOTED
              buffer = 'attribValue'
              break

            case S.ATTRIB_VALUE_ENTITY_U:
              returnState = S.ATTRIB_VALUE_UNQUOTED
              buffer = 'attribValue'
              break
          }

          if (c === ';') {
            var parsedEntity = parseEntity(parser)
            if (parser.opt.unparsedEntities && !Object.values(sax.XML_ENTITIES).includes(parsedEntity)) {
              parser.entity = ''
              parser.state = returnState
              parser.write(parsedEntity)
            } else {
              parser[buffer] += parsedEntity
              parser.entity = ''
              parser.state = returnState
            }
          } else if (isMatch(parser.entity.length ? entityBody : entityStart, c)) {
            parser.entity += c
          } else {
            strictFail(parser, 'Invalid character in entity name')
            parser[buffer] += '&' + parser.entity + c
            parser.entity = ''
            parser.state = returnState
          }

          continue

        default: /* istanbul ignore next */ {
          throw new Error(parser, 'Unknown state: ' + parser.state)
        }
      }
    } // while

    if (parser.position >= parser.bufferCheckPosition) {
      checkBufferLength(parser)
    }
    return parser
  }

  /*! http://mths.be/fromcodepoint v0.1.0 by @mathias */
  /* istanbul ignore next */
  if (!String.fromCodePoint) {
    (function () {
      var stringFromCharCode = String.fromCharCode
      var floor = Math.floor
      var fromCodePoint = function () {
        var MAX_SIZE = 0x4000
        var codeUnits = []
        var highSurrogate
        var lowSurrogate
        var index = -1
        var length = arguments.length
        if (!length) {
          return ''
        }
        var result = ''
        while (++index < length) {
          var codePoint = Number(arguments[index])
          if (
            !isFinite(codePoint) || // `NaN`, `+Infinity`, or `-Infinity`
            codePoint < 0 || // not a valid Unicode code point
            codePoint > 0x10FFFF || // not a valid Unicode code point
            floor(codePoint) !== codePoint // not an integer
          ) {
            throw RangeError('Invalid code point: ' + codePoint)
          }
          if (codePoint <= 0xFFFF) { // BMP code point
            codeUnits.push(codePoint)
          } else { // Astral code point; split in surrogate halves
            // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
            codePoint -= 0x10000
            highSurrogate = (codePoint >> 10) + 0xD800
            lowSurrogate = (codePoint % 0x400) + 0xDC00
            codeUnits.push(highSurrogate, lowSurrogate)
          }
          if (index + 1 === length || codeUnits.length > MAX_SIZE) {
            result += stringFromCharCode.apply(null, codeUnits)
            codeUnits.length = 0
          }
        }
        return result
      }
      /* istanbul ignore next */
      if (Object.defineProperty) {
        Object.defineProperty(String, 'fromCodePoint', {
          value: fromCodePoint,
          configurable: true,
          writable: true
        })
      } else {
        String.fromCodePoint = fromCodePoint
      }
    }())
  }
})( false ? 0 : exports)


/***/ }),

/***/ 4841:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.



/*<replacement>*/

var Buffer = (__nccwpck_require__(1867).Buffer);
/*</replacement>*/

var isEncoding = Buffer.isEncoding || function (encoding) {
  encoding = '' + encoding;
  switch (encoding && encoding.toLowerCase()) {
    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
      return true;
    default:
      return false;
  }
};

function _normalizeEncoding(enc) {
  if (!enc) return 'utf8';
  var retried;
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8';
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le';
      case 'latin1':
      case 'binary':
        return 'latin1';
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc;
      default:
        if (retried) return; // undefined
        enc = ('' + enc).toLowerCase();
        retried = true;
    }
  }
};

// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding(enc) {
  var nenc = _normalizeEncoding(enc);
  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
  return nenc || enc;
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
exports.s = StringDecoder;
function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  var nb;
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text;
      this.end = utf16End;
      nb = 4;
      break;
    case 'utf8':
      this.fillLast = utf8FillLast;
      nb = 4;
      break;
    case 'base64':
      this.text = base64Text;
      this.end = base64End;
      nb = 3;
      break;
    default:
      this.write = simpleWrite;
      this.end = simpleEnd;
      return;
  }
  this.lastNeed = 0;
  this.lastTotal = 0;
  this.lastChar = Buffer.allocUnsafe(nb);
}

StringDecoder.prototype.write = function (buf) {
  if (buf.length === 0) return '';
  var r;
  var i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return '';
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || '';
};

StringDecoder.prototype.end = utf8End;

// Returns only complete characters in a Buffer
StringDecoder.prototype.text = utf8Text;

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder.prototype.fillLast = function (buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
};

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte. If an invalid byte is detected, -2 is returned.
function utf8CheckByte(byte) {
  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
  return byte >> 6 === 0x02 ? -1 : -2;
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete(self, buf, i) {
  var j = buf.length - 1;
  if (j < i) return 0;
  var nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes(self, buf, p) {
  if ((buf[0] & 0xC0) !== 0x80) {
    self.lastNeed = 0;
    return '\ufffd';
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xC0) !== 0x80) {
      self.lastNeed = 1;
      return '\ufffd';
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xC0) !== 0x80) {
        self.lastNeed = 2;
        return '\ufffd';
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast(buf) {
  var p = this.lastTotal - this.lastNeed;
  var r = utf8CheckExtraBytes(this, buf, p);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text(buf, i) {
  var total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString('utf8', i);
  this.lastTotal = total;
  var end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString('utf8', i, end);
}

// For UTF-8, a replacement character is added when ending on a partial
// character.
function utf8End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + '\ufffd';
  return r;
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text(buf, i) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i);
    if (r) {
      var c = r.charCodeAt(r.length - 1);
      if (c >= 0xD800 && c <= 0xDBFF) {
        this.lastNeed = 2;
        this.lastTotal = 4;
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
        return r.slice(0, -1);
      }
    }
    return r;
  }
  this.lastNeed = 1;
  this.lastTotal = 2;
  this.lastChar[0] = buf[buf.length - 1];
  return buf.toString('utf16le', i, buf.length - 1);
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed;
    return r + this.lastChar.toString('utf16le', 0, end);
  }
  return r;
}

function base64Text(buf, i) {
  var n = (buf.length - i) % 3;
  if (n === 0) return buf.toString('base64', i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString('base64', i, buf.length - n);
}

function base64End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
  return r;
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite(buf) {
  return buf.toString(this.encoding);
}

function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : '';
}

/***/ }),

/***/ 5278:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {


/**
 * For Node.js, simply re-export the core `util.deprecate` function.
 */

module.exports = __nccwpck_require__(3837).deprecate;


/***/ }),

/***/ 4300:
/***/ ((module) => {

"use strict";
module.exports = require("buffer");

/***/ }),

/***/ 2081:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 6113:
/***/ ((module) => {

"use strict";
module.exports = require("crypto");

/***/ }),

/***/ 9523:
/***/ ((module) => {

"use strict";
module.exports = require("dns");

/***/ }),

/***/ 2361:
/***/ ((module) => {

"use strict";
module.exports = require("events");

/***/ }),

/***/ 7147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 3685:
/***/ ((module) => {

"use strict";
module.exports = require("http");

/***/ }),

/***/ 5687:
/***/ ((module) => {

"use strict";
module.exports = require("https");

/***/ }),

/***/ 1808:
/***/ ((module) => {

"use strict";
module.exports = require("net");

/***/ }),

/***/ 2037:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 1017:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ 2781:
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ }),

/***/ 1576:
/***/ ((module) => {

"use strict";
module.exports = require("string_decoder");

/***/ }),

/***/ 4404:
/***/ ((module) => {

"use strict";
module.exports = require("tls");

/***/ }),

/***/ 7310:
/***/ ((module) => {

"use strict";
module.exports = require("url");

/***/ }),

/***/ 3837:
/***/ ((module) => {

"use strict";
module.exports = require("util");

/***/ }),

/***/ 9796:
/***/ ((module) => {

"use strict";
module.exports = require("zlib");

/***/ }),

/***/ 8249:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"126":{"host":"smtp.126.com","port":465,"secure":true},"163":{"host":"smtp.163.com","port":465,"secure":true},"1und1":{"host":"smtp.1und1.de","port":465,"secure":true,"authMethod":"LOGIN"},"Aliyun":{"domains":["aliyun.com"],"host":"smtp.aliyun.com","port":465,"secure":true},"AOL":{"domains":["aol.com"],"host":"smtp.aol.com","port":587},"Bluewin":{"host":"smtpauths.bluewin.ch","domains":["bluewin.ch"],"port":465},"DebugMail":{"host":"debugmail.io","port":25},"DynectEmail":{"aliases":["Dynect"],"host":"smtp.dynect.net","port":25},"Ethereal":{"aliases":["ethereal.email"],"host":"smtp.ethereal.email","port":587},"FastMail":{"domains":["fastmail.fm"],"host":"smtp.fastmail.com","port":465,"secure":true},"Forward Email":{"aliases":["FE","ForwardEmail"],"domains":["forwardemail.net"],"host":"smtp.forwardemail.net","port":465,"secure":true},"Feishu Mail":{"aliases":["Feishu","FeishuMail"],"domains":["www.feishu.cn"],"host":"smtp.feishu.cn","port":465,"secure":true},"GandiMail":{"aliases":["Gandi","Gandi Mail"],"host":"mail.gandi.net","port":587},"Gmail":{"aliases":["Google Mail"],"domains":["gmail.com","googlemail.com"],"host":"smtp.gmail.com","port":465,"secure":true},"Godaddy":{"host":"smtpout.secureserver.net","port":25},"GodaddyAsia":{"host":"smtp.asia.secureserver.net","port":25},"GodaddyEurope":{"host":"smtp.europe.secureserver.net","port":25},"hot.ee":{"host":"mail.hot.ee"},"Hotmail":{"aliases":["Outlook","Outlook.com","Hotmail.com"],"domains":["hotmail.com","outlook.com"],"host":"smtp-mail.outlook.com","port":587},"iCloud":{"aliases":["Me","Mac"],"domains":["me.com","mac.com"],"host":"smtp.mail.me.com","port":587},"Infomaniak":{"host":"mail.infomaniak.com","domains":["ik.me","ikmail.com","etik.com"],"port":587},"Loopia":{"host":"mailcluster.loopia.se","port":465},"mail.ee":{"host":"smtp.mail.ee"},"Mail.ru":{"host":"smtp.mail.ru","port":465,"secure":true},"Mailcatch.app":{"host":"sandbox-smtp.mailcatch.app","port":2525},"Maildev":{"port":1025,"ignoreTLS":true},"Mailgun":{"host":"smtp.mailgun.org","port":465,"secure":true},"Mailjet":{"host":"in.mailjet.com","port":587},"Mailosaur":{"host":"mailosaur.io","port":25},"Mailtrap":{"host":"live.smtp.mailtrap.io","port":587},"Mandrill":{"host":"smtp.mandrillapp.com","port":587},"Naver":{"host":"smtp.naver.com","port":587},"One":{"host":"send.one.com","port":465,"secure":true},"OpenMailBox":{"aliases":["OMB","openmailbox.org"],"host":"smtp.openmailbox.org","port":465,"secure":true},"Outlook365":{"host":"smtp.office365.com","port":587,"secure":false},"OhMySMTP":{"host":"smtp.ohmysmtp.com","port":587,"secure":false},"Postmark":{"aliases":["PostmarkApp"],"host":"smtp.postmarkapp.com","port":2525},"Proton":{"aliases":["ProtonMail","Proton.me","Protonmail.com","Protonmail.ch"],"domains":["proton.me","protonmail.com","pm.me","protonmail.ch"],"host":"smtp.protonmail.ch","port":587,"requireTLS":true},"qiye.aliyun":{"host":"smtp.mxhichina.com","port":"465","secure":true},"QQ":{"domains":["qq.com"],"host":"smtp.qq.com","port":465,"secure":true},"QQex":{"aliases":["QQ Enterprise"],"domains":["exmail.qq.com"],"host":"smtp.exmail.qq.com","port":465,"secure":true},"SendCloud":{"host":"smtp.sendcloud.net","port":2525},"SendGrid":{"host":"smtp.sendgrid.net","port":587},"SendinBlue":{"aliases":["Brevo"],"host":"smtp-relay.brevo.com","port":587},"SendPulse":{"host":"smtp-pulse.com","port":465,"secure":true},"SES":{"host":"email-smtp.us-east-1.amazonaws.com","port":465,"secure":true},"SES-US-EAST-1":{"host":"email-smtp.us-east-1.amazonaws.com","port":465,"secure":true},"SES-US-WEST-2":{"host":"email-smtp.us-west-2.amazonaws.com","port":465,"secure":true},"SES-EU-WEST-1":{"host":"email-smtp.eu-west-1.amazonaws.com","port":465,"secure":true},"SES-AP-SOUTH-1":{"host":"email-smtp.ap-south-1.amazonaws.com","port":465,"secure":true},"SES-AP-NORTHEAST-1":{"host":"email-smtp.ap-northeast-1.amazonaws.com","port":465,"secure":true},"SES-AP-NORTHEAST-2":{"host":"email-smtp.ap-northeast-2.amazonaws.com","port":465,"secure":true},"SES-AP-NORTHEAST-3":{"host":"email-smtp.ap-northeast-3.amazonaws.com","port":465,"secure":true},"SES-AP-SOUTHEAST-1":{"host":"email-smtp.ap-southeast-1.amazonaws.com","port":465,"secure":true},"SES-AP-SOUTHEAST-2":{"host":"email-smtp.ap-southeast-2.amazonaws.com","port":465,"secure":true},"Seznam":{"aliases":["Seznam Email"],"domains":["seznam.cz","email.cz","post.cz","spoluzaci.cz"],"host":"smtp.seznam.cz","port":465,"secure":true},"Sparkpost":{"aliases":["SparkPost","SparkPost Mail"],"domains":["sparkpost.com"],"host":"smtp.sparkpostmail.com","port":587,"secure":false},"Tipimail":{"host":"smtp.tipimail.com","port":587},"Yahoo":{"domains":["yahoo.com"],"host":"smtp.mail.yahoo.com","port":465,"secure":true},"Yandex":{"domains":["yandex.ru"],"host":"smtp.yandex.ru","port":465,"secure":true},"Zoho":{"host":"smtp.zoho.com","port":465,"secure":true,"authMethod":"LOGIN"}}');

/***/ }),

/***/ 4129:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"name":"nodemailer","version":"6.10.1","description":"Easy as cake e-mail sending from your Node.js applications","main":"lib/nodemailer.js","scripts":{"test":"node --test --test-concurrency=1 test/**/*.test.js test/**/*-test.js","test:coverage":"c8 node --test --test-concurrency=1 test/**/*.test.js test/**/*-test.js","lint":"eslint .","update":"rm -rf node_modules/ package-lock.json && ncu -u && npm install"},"repository":{"type":"git","url":"https://github.com/nodemailer/nodemailer.git"},"keywords":["Nodemailer"],"author":"Andris Reinman","license":"MIT-0","bugs":{"url":"https://github.com/nodemailer/nodemailer/issues"},"homepage":"https://nodemailer.com/","devDependencies":{"@aws-sdk/client-ses":"3.731.1","bunyan":"1.8.15","c8":"10.1.3","eslint":"8.57.0","eslint-config-nodemailer":"1.2.0","eslint-config-prettier":"9.1.0","libbase64":"1.3.0","libmime":"5.3.6","libqp":"2.1.1","nodemailer-ntlm-auth":"1.0.4","proxy":"1.0.2","proxy-test-server":"1.0.0","smtp-server":"3.13.6"},"engines":{"node":">=6.0.0"}}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const fs = __nccwpck_require__(7147);
const path = __nccwpck_require__(1017);
const nodemailer = __nccwpck_require__(4289);
const FeedParser = __nccwpck_require__(9155);

// 配置日志
const log = console;

// 下载 JSON 文件
async function downloadJson(url, headers = {}, retries = 3, delay = 2000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { headers, timeout: 3000 });
      if (!response.ok) {
        throw new Error(`Request failed with status code ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      log.warn(`下载 JSON 失败 [${url}]，第 ${attempt + 1} 次: ${error.message}`);
      if (attempt < retries - 1) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return null;
}

// 获取上次文章数据
async function getLastArticles(repo, token) {
  const url = `https://raw.githubusercontent.com/${repo}/output/v2/last_articles.json`;
  const headers = { Authorization: `Bearer ${token}` };
  const data = await downloadJson(url, headers);
  if (!data) {
    log.warn("获取 last_articles.json 失败，使用空数据");
    return { articles: [], fail_count: 0 };
  }
  return data;
}

// 保存文章到文件
function saveLastArticlesToFile(articles, failCount = 0, path = "last_articles.json") {
  const data = { articles, fail_count: failCount };
  fs.writeFileSync(path, JSON.stringify(data, null, 4), "utf-8");
  log.info(`last_articles.json 已写入，fail_count=${failCount}`);
}

// 获取订阅邮箱
async function getSubscribeEmails(jsonUrl) {
  const data = await downloadJson(jsonUrl);
  if (!data) return [];
  const emails = data.emails || [];
  if (!emails.length) log.warn("订阅邮箱列表为空");
  return emails;
}

// 解析 RSS
async function parseRss(rssUrl, maxCount = 5) {
  return new Promise((resolve, reject) => {
    const articles = [];
    const feedParser = new FeedParser();
    fetch(rssUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status code ${response.status}`);
        }
        return response.body.pipe(feedParser);
      })
      .catch((error) => reject(error));

    feedParser.on("error", (error) => reject(error));
    feedParser.on("readable", function () {
      let item;
      while ((item = this.read()) && articles.length < maxCount) {
        articles.push({
          title: item.title || "",
          link: item.link || "",
          published: item.pubDate || "",
          summary: item.description || item.title || "",
        });
      }
    });
    feedParser.on("end", () => resolve(articles));
  });
}

// 获取新文章
function getNewArticles(latest, last) {
  const lastLinks = new Set(last.map((a) => a.link));
  return latest.filter((a) => !lastLinks.has(a.link));
}

// 下载文件
async function downloadFile(url) {
  try {
    const response = await fetch(url, { timeout: 10000 });
    if (!response.ok) {
      throw new Error(`Request failed with status code ${response.status}`);
    }
    const data = await response.text();
    return data;
  } catch (error) {
    log.error(`下载文件失败: ${url}, 错误: ${error.message}`);
    return null;
  }
}

// 渲染 HTML 模板
function renderEmailTemplate(templateStr, article, websiteTitle, websiteIcon, repo) {
  return templateStr
    .replace(/{{ website_title }}/g, websiteTitle)
    .replace(/{{ website_icon }}/g, websiteIcon)
    .replace(/{{ github_issue_url }}/g, `https://github.com/${repo}/issues`)
    .replace(/{{ title }}/g, article.title)
    .replace(/{{ summary }}/g, article.summary)
    .replace(/{{ link }}/g, article.link);
}

// 发送邮件
async function sendEmail(smtpConfig, senderEmail, toEmails, subject, htmlContent) {
  const transporter = nodemailer.createTransport(smtpConfig);

  const mailOptions = {
    from: senderEmail,
    to: toEmails.join(", "),
    subject,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    log.info(`邮件成功发送给: ${toEmails.join(", ")}`);
  } catch (error) {
    log.error(`邮件发送失败: ${error.message}`);
  }
}

// 主函数
async function main() {
  const rssUrl = process.env.INPUT_RSS_URL;
  const subscribeJsonUrl = process.env.INPUT_SUBSCRIBE_JSON_URL;
  const emailTemplateUrl = process.env.INPUT_EMAIL_TEMPLATE_URL;
  const smtpServer = process.env.INPUT_SMTP_SERVER;
  const smtpPort = process.env.INPUT_SMTP_PORT;
  const smtpUseTls = process.env.INPUT_SMTP_USE_TLS;
  const senderEmail = process.env.INPUT_SENDER_EMAIL;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const websiteTitle = process.env.WEBSITE_TITLE;
  const websiteIcon = process.env.WEBSITE_ICON;
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  const lastData = await getLastArticles(repo, token);
  const lastArticles = lastData.articles || [];
  let failCount = lastData.fail_count || 0;

  let latestArticles = [];
  for (let i = 0; i < 3; i++) {
    try {
      latestArticles = await parseRss(rssUrl);
      if (latestArticles.length > 0) break;
    } catch (error) {
      log.warn(`RSS 解析失败: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!latestArticles.length) {
    failCount += 1;
    log.warn(`获取到的文章为空，fail_count=${failCount}`);
  } else {
    failCount = 0;
  }

  if (failCount >= 3 || latestArticles.length > 0) {
    saveLastArticlesToFile(latestArticles, failCount);
  }

  const newArticles = getNewArticles(latestArticles, lastArticles);
  if (!newArticles.length) {
    log.info("没有新文章，无需发送邮件");
    return;
  }

  const templateStr = (await downloadFile(emailTemplateUrl)) || fs.readFileSync(__nccwpck_require__.ab + "email_template.html", "utf-8");
  const emails = await getSubscribeEmails(subscribeJsonUrl);

  for (const article of newArticles) {
    const htmlContent = renderEmailTemplate(templateStr, article, websiteTitle, websiteIcon, repo);
    const subject = `博客更新通知 - ${article.title}`;
    const smtpConfig = {
      host: smtpServer,
      port: smtpPort,
      secure: !smtpUseTls,
      auth: { user: senderEmail, pass: smtpPassword },
    };
    await sendEmail(smtpConfig, senderEmail, emails, subject, htmlContent);
  }
}

main().catch((error) => log.error(`主函数运行失败: ${error.message}`));

})();

module.exports = __webpack_exports__;
/******/ })()
;